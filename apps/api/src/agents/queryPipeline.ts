import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getLLMProvider } from '../services/ai';
import {
  getTopLeads,
  getStaleLeads,
  getPipelineSummary,
  getHighValueDeals,
  getLeadEngagement,
  getCustomerRiskSignals,
} from '../services/analytics';
import { searchNotes } from '../services/retrieval';
import { calculateLeadPriority, rankLeads } from '../services/decision/scoring';
import { detectConflicts, buildEvidence } from '../services/evidence';
import { createTraceEvent, createAuditEvent } from '../services/audit';
import { prisma } from '../config/database';
import {
  INTENT_AGENT_PROMPT_V1,
  DECISION_AGENT_PROMPT_V1,
} from './prompts';
import { logger } from '../utils/logger';

// ─── Schemas ───────────────────────────────────────────────────────────────

const IntentSchema = z.object({
  intent: z.string(),
  route: z.enum(['SQL', 'RAG', 'HYBRID']),
  entities: z.array(z.string()),
  requiredTools: z.array(z.string()),
  confidence: z.number(),
  reasoning: z.string().optional(),
});

const DecisionResponseSchema = z.object({
  answerSummary: z.string(),
  recommendations: z.array(
    z.object({
      entityId: z.string(),
      entityName: z.string(),
      action: z.string(),
      score: z.number().optional(),
      reasoning: z.array(z.string()),
      evidenceIds: z.array(z.string()),
      confidence: z.number(),
      warnings: z.array(z.string()),
    })
  ),
  evidenceCoverage: z.number(),
  conflicts: z.array(
    z.object({
      entityId: z.string().optional(),
      description: z.string(),
      severity: z.string(),
    })
  ),
});

export type QueryResult = {
  requestId: string;
  traceId: string;
  route: string;
  intent: string;
  question: string;
  answer: string;
  recommendations: Array<{
    entityId: string;
    externalId?: string;
    entityName: string;
    company?: string;
    score: number;
    rank: number;
    action: string;
    reasoning: string[];
    evidence: Array<{
      id: string;
      sourceType: string;
      sourceId: string;
      field: string;
      value: string;
      explanation: string;
      freshness: string;
    }>;
    breakdown?: Record<string, number>;
    confidence: number;
    warnings: string[];
    conflicts: Array<{ description: string; severity: string }>;
    freshnessLevel: string;
    estimatedDealValue?: number | null;
    approvalStatus: string;
    decisionId?: string;
  }>;
  evidence: unknown[];
  warnings: string[];
  confidence: number;
  evidenceCoverage: number;
  sqlUsed: boolean;
  ragUsed: boolean;
  retrievedNotes: number;
  candidatesAnalyzed: number;
  processingSteps: Array<{
    step: string;
    status: string;
    duration: number;
    detail: string;
    timestamp: string;
  }>;
  demoMode: boolean;
};

// ─── Main Pipeline ──────────────────────────────────────────────────────────

export async function processQuery(question: string): Promise<QueryResult> {
  const requestId = `TRC-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;
  const steps: QueryResult['processingSteps'] = [];
  const provider = getLLMProvider();

  async function step<T>(
    name: string,
    component: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const start = Date.now();
    const ts = new Date().toISOString();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      steps.push({ step: name, status: 'SUCCESS', duration, detail: '', timestamp: ts });
      await createTraceEvent({
        requestId,
        eventType: 'TOOL_COMPLETED',
        component,
        duration,
        status: 'SUCCESS',
      });
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      const errMsg = (err as Error).message;
      steps.push({ step: name, status: 'ERROR', duration, detail: errMsg, timestamp: ts });
      await createTraceEvent({
        requestId,
        eventType: 'TOOL_FAILED',
        component,
        duration,
        status: 'ERROR',
        error: errMsg,
      });
      throw err;
    }
  }

  // Record query received
  await createTraceEvent({
    requestId,
    eventType: 'QUERY_RECEIVED',
    component: 'Gateway',
    input: { question },
    status: 'SUCCESS',
  });
  await createAuditEvent('QUERY_RECEIVED', 'system', { question }, requestId);
  steps.push({
    step: 'Query Received',
    status: 'SUCCESS',
    duration: 0,
    detail: question,
    timestamp: new Date().toISOString(),
  });

  // ── Step 1: Intent Detection ──────────────────────────────────────────────
  let intent: z.infer<typeof IntentSchema>;
  try {
    intent = await step('Intent Detection', 'IntentAgent', () =>
      provider.generateStructured({
        messages: [
          { role: 'system', content: INTENT_AGENT_PROMPT_V1 },
          { role: 'user', content: `Analyze this business question: "${question}"` },
        ],
        schema: IntentSchema,
      })
    );
  } catch {
    // Fallback intent detection
    intent = inferIntent(question);
    steps[steps.length - 1]!.detail = 'Used fallback intent detection';
  }

  steps[steps.length - 1]!.detail = `Route: ${intent.route} | Intent: ${intent.intent}`;
  await createTraceEvent({
    requestId,
    eventType: 'INTENT_DETECTED',
    component: 'IntentAgent',
    output: intent,
    status: 'SUCCESS',
  });

  // ── Step 2: SQL Analytics ────────────────────────────────────────────────
  let candidates: Awaited<ReturnType<typeof getTopLeads>> = [];
  let pipeline: Awaited<ReturnType<typeof getPipelineSummary>> | null = null;
  let highValueDeals: Awaited<ReturnType<typeof getHighValueDeals>> = [];
  let sqlUsed = false;

  if (intent.route === 'SQL' || intent.route === 'HYBRID') {
    sqlUsed = true;
    try {
      candidates = await step('SQL Candidate Retrieval', 'AnalyticsAgent', () =>
        getTopLeads(50)
      );
      steps[steps.length - 1]!.detail = `Retrieved ${candidates.length} lead candidates`;

      if (
        intent.intent === 'DEAL_ANALYSIS' ||
        question.toLowerCase().includes('deal') ||
        question.toLowerCase().includes('pipeline')
      ) {
        pipeline = await step('Pipeline Analysis', 'AnalyticsAgent', getPipelineSummary);
        highValueDeals = await step('High Value Deals', 'AnalyticsAgent', () =>
          getHighValueDeals(5000)
        );
        steps[steps.length - 1]!.detail = `Found ${highValueDeals.length} high-value deals`;
      }
    } catch (err) {
      logger.error('SQL analytics failed', { error: (err as Error).message });
    }
  }

  // ── Step 3: RAG Retrieval ────────────────────────────────────────────────
  let notes: Awaited<ReturnType<typeof searchNotes>> = [];
  let ragUsed = false;

  if (intent.route === 'RAG' || intent.route === 'HYBRID') {
    ragUsed = true;
    try {
      notes = await step('RAG Note Retrieval', 'RetrievalAgent', () =>
        searchNotes(question, 20)
      );
      steps[steps.length - 1]!.detail = `Retrieved ${notes.length} relevant notes`;
    } catch (err) {
      logger.warn('RAG retrieval failed, continuing without notes', {
        error: (err as Error).message,
      });
      steps.push({
        step: 'RAG Retrieval',
        status: 'FALLBACK',
        duration: 0,
        detail: 'Vector search unavailable, using SQL-only mode',
        timestamp: new Date().toISOString(),
      });
    }
  }

  // ── Step 4: Decision Scoring ─────────────────────────────────────────────
  const scoredLeads: ReturnType<typeof calculateLeadPriority>[] = [];
  const allConflicts: Array<{ description: string; severity: string; entityId?: string }> = [];
  const allEvidence: ReturnType<typeof buildEvidence> = [];

  if (candidates.length > 0) {
    await step('Decision Scoring', 'DecisionEngine', async () => {
      for (const lead of candidates.slice(0, 30)) {
        const eng = await getLeadEngagement(lead.id).catch(() => null);
        const engScore = eng
          ? Math.min(eng.recentInteractions / 5, 1) * 0.6 +
            Math.max(0, eng.averageSentiment) * 0.4
          : 0.3;

        const leadNotes = notes.filter(
          (n) =>
            n.sourceId === lead.id ||
            n.metadata &&
              typeof n.metadata === 'object' &&
              (n.metadata as Record<string, unknown>)['entityId'] === lead.id
        );

        const conflicts = detectConflicts(lead, leadNotes);
        const hasNegative = conflicts.some((c) => c.severity === 'HIGH');
        const scored = calculateLeadPriority(lead, engScore, hasNegative);

        const deals = await prisma.deal
          .findMany({
            where: { leadId: lead.id, stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } },
            take: 3,
          })
          .catch(() => []);

        const evidence = buildEvidence(lead, leadNotes, deals);

        scoredLeads.push(scored);
        allConflicts.push(
          ...conflicts.map((c) => ({
            description: c.description,
            severity: c.severity,
            entityId: lead.externalId,
          }))
        );
        allEvidence.push(...evidence);
      }
    });
    steps[steps.length - 1]!.detail = `Scored ${scoredLeads.length} leads`;
  }

  const ranked = rankLeads(scoredLeads).slice(0, 10);

  // ── Step 5: LLM Decision Response ───────────────────────────────────────
  let decisionResponse: z.infer<typeof DecisionResponseSchema>;
  try {
    const topCandidatesSummary = ranked.slice(0, 5).map((l) => ({
      id: l.externalId,
      name: l.name,
      company: l.company,
      score: l.score,
      action: l.action,
      reasons: l.reasons,
      dealValue: l.estimatedDealValue,
      freshness: l.freshnessLevel,
    }));

    decisionResponse = await step('AI Recommendation Generation', 'DecisionAgent', () =>
      provider.generateStructured({
        messages: [
          { role: 'system', content: DECISION_AGENT_PROMPT_V1 },
          {
            role: 'user',
            content: `Question: "${question}"

Scored Candidates (top ${topCandidatesSummary.length}):
${JSON.stringify(topCandidatesSummary, null, 2)}

Retrieved Notes Count: ${notes.length}
Pipeline Value: ${pipeline?.totalValue ? `$${pipeline.totalValue.toLocaleString()}` : 'N/A'}

Conflicts detected: ${allConflicts.length}

Generate evidence-backed recommendations.`,
          },
        ],
        schema: DecisionResponseSchema,
      })
    );
  } catch (err: any) {
    const errorMsg = err.message || '';
    if (intent.intent === 'GENERAL_QUERY') {
      decisionResponse = {
        answerSummary: `I'm sorry, I encountered an internal error while trying to process your conversational request. Please try asking a specific business question or try again later.`,
        recommendations: [],
        evidenceCoverage: 0,
        conflicts: [],
      };
      steps[steps.length - 1]!.detail = 'LLM failed during general query';
    } else {
      // Fallback to deterministic recommendations
      decisionResponse = buildFallbackResponse(question, ranked, allConflicts);
      if (errorMsg.includes('quota') || errorMsg.includes('429') || errorMsg.includes('503') || errorMsg.includes('demand')) {
        decisionResponse.answerSummary = `⚠️ AI Service Unavailable (High Demand/Rate Limit). \n\n` + decisionResponse.answerSummary;
        steps[steps.length - 1]!.detail = 'Rate limited by LLM API, used deterministic fallback';
      } else {
        steps[steps.length - 1]!.detail = 'Used deterministic fallback response due to LLM error: ' + errorMsg.slice(0, 50);
      }
    }
  }

  // ── Step 6: Persist Decisions & Evidence ────────────────────────────────
  await step('Persisting Decisions', 'PersistenceLayer', async () => {
    for (const rec of decisionResponse.recommendations.slice(0, 5)) {
      const lead = ranked.find(
        (l) => l.externalId === rec.entityId || l.name === rec.entityName
      );
      const decision = await prisma.decision.create({
        data: {
          requestId,
          query: question,
          entityType: 'Lead',
          entityId: rec.entityId,
          rank: lead?.rank || 0,
          score: rec.score || lead?.score || 0,
          recommendation: rec.action,
          rationale: rec.reasoning.join('; '),
          confidence: rec.confidence,
        },
      });

      // Create approval record
      await prisma.approval.create({
        data: {
          decisionId: decision.id,
          status: 'PENDING',
        },
      });

      // Persist evidence
      const evidenceForLead = allEvidence.filter((e) => {
        const matchedLead = ranked.find(
          (l) => l.externalId === rec.entityId || l.name === rec.entityName
        );
        return matchedLead && (e.sourceId === matchedLead.externalId || e.sourceId.includes(matchedLead.leadId.slice(0, 8)));
      });

      for (const ev of evidenceForLead.slice(0, 5)) {
        await prisma.evidence.create({
          data: {
            decisionId: decision.id,
            sourceType: ev.sourceType,
            sourceId: ev.sourceId,
            field: ev.field,
            value: ev.value,
            explanation: ev.explanation,
            freshness: ev.freshness,
          },
        });
      }
    }
  });

  await createTraceEvent({
    requestId,
    eventType: 'RECOMMENDATION_CREATED',
    component: 'Pipeline',
    output: { count: decisionResponse.recommendations.length },
    status: 'SUCCESS',
  });
  await createTraceEvent({
    requestId,
    eventType: 'APPROVAL_REQUESTED',
    component: 'ApprovalSystem',
    status: 'SUCCESS',
  });

  // ── Build Final Response ─────────────────────────────────────────────────
  const persistedDecisions = await prisma.decision.findMany({
    where: { requestId },
    include: { approvals: true },
    orderBy: { rank: 'asc' },
  });

  const recommendations: QueryResult['recommendations'] = decisionResponse.recommendations
    .slice(0, 5)
    .map((rec, idx) => {
      const scored = ranked.find(
        (l) => l.externalId === rec.entityId || l.name === rec.entityName
      );
      const decision = persistedDecisions.find((d) => d.entityId === rec.entityId);
      const evidenceForRec = allEvidence.filter(
        (e) =>
          scored &&
          (e.sourceId === scored.externalId ||
            e.sourceId.includes(scored.leadId.slice(0, 8)))
      );
      const recConflicts = allConflicts.filter((c) => c.entityId === rec.entityId);

      return {
        entityId: rec.entityId,
        externalId: scored?.externalId,
        entityName: rec.entityName,
        company: scored?.company,
        score: rec.score || scored?.score || 0,
        rank: idx + 1,
        action: rec.action,
        reasoning: rec.reasoning,
        evidence: evidenceForRec.slice(0, 5).map((e) => ({
          id: e.id,
          sourceType: e.sourceType,
          sourceId: e.sourceId,
          field: e.field,
          value: e.value,
          explanation: e.explanation,
          freshness: e.freshness,
        })),
        breakdown: scored
          ? {
              leadQuality: scored.breakdown.leadQuality,
              engagement: scored.breakdown.engagement,
              dealValue: scored.breakdown.dealValue,
              urgency: scored.breakdown.urgency,
              recency: scored.breakdown.recency,
            }
          : {},
        confidence: rec.confidence,
        warnings: [
          ...rec.warnings,
          ...(scored?.risks || []),
        ],
        conflicts: recConflicts.map((c) => ({
          description: c.description,
          severity: c.severity,
        })),
        freshnessLevel: scored?.freshnessLevel || 'UNKNOWN',
        estimatedDealValue: scored?.estimatedDealValue,
        approvalStatus: decision?.approvals?.[0]?.status || 'PENDING',
        decisionId: decision?.id,
      };
    });

  const avgConfidence =
    recommendations.length > 0
      ? recommendations.reduce((s, r) => s + r.confidence, 0) / recommendations.length
      : 0;

  return {
    requestId,
    traceId: requestId,
    route: intent.route,
    intent: intent.intent,
    question,
    answer: decisionResponse.answerSummary,
    recommendations,
    evidence: allEvidence,
    warnings: [
      ...decisionResponse.conflicts.map((c) => c.description),
      ...(notes.length === 0 ? ['RAG retrieval unavailable — using SQL-only analysis'] : []),
    ],
    confidence: Math.round(avgConfidence * 100) / 100,
    evidenceCoverage: decisionResponse.evidenceCoverage,
    sqlUsed,
    ragUsed,
    retrievedNotes: notes.length,
    candidatesAnalyzed: candidates.length,
    processingSteps: steps,
    demoMode: !process.env.LLM_API_KEY,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function inferIntent(question: string): z.infer<typeof IntentSchema> {
  const q = question.toLowerCase();
  if (q.includes('how many') || q.includes('count') || q.includes('total')) {
    return { intent: 'STATISTICS_QUERY', route: 'SQL', entities: ['Lead', 'Deal'], requiredTools: ['getLeadStatistics'], confidence: 0.8 };
  }
  if (q.includes('objection') || q.includes('say') || q.includes('mention') || q.includes('note')) {
    return { intent: 'NOTE_ANALYSIS', route: 'RAG', entities: ['BusinessNote'], requiredTools: ['searchNotes'], confidence: 0.8 };
  }
  if (q.includes('churn') || q.includes('risk') || q.includes('declining')) {
    return { intent: 'CUSTOMER_RISK', route: 'HYBRID', entities: ['Customer'], requiredTools: ['getCustomerRiskSignals', 'searchNotes'], confidence: 0.8 };
  }
  if (q.includes('deal') || q.includes('pipeline')) {
    return { intent: 'DEAL_ANALYSIS', route: 'HYBRID', entities: ['Deal'], requiredTools: ['getHighValueDeals', 'searchNotes'], confidence: 0.8 };
  }
  if (q.includes('hello') || q.includes('hi ') || q.includes('who are you') || q.includes('write')) {
    return { intent: 'GENERAL_QUERY', route: 'RAG', entities: [], requiredTools: [], confidence: 0.8 };
  }
  return { intent: 'LEAD_PRIORITIZATION', route: 'HYBRID', entities: ['Lead'], requiredTools: ['getTopLeads', 'calculateLeadPriority', 'searchNotes'], confidence: 0.75 };
}

function buildFallbackResponse(
  _question: string,
  ranked: ReturnType<typeof calculateLeadPriority>[],
  conflicts: Array<{ description: string; severity: string; entityId?: string }>
): z.infer<typeof DecisionResponseSchema> {
  const top5 = ranked.slice(0, 5);
  return {
    answerSummary:
      `Based on TracePilot's deterministic scoring engine, here are the top ${top5.length} priorities identified from your business data. ` +
      `Each recommendation is grounded in lead quality, engagement signals, deal value, and recency data. ` +
      `Human approval is required before any action is taken.`,
    recommendations: top5.map((l) => ({
      entityId: l.externalId,
      entityName: l.name,
      action: l.action,
      score: l.score,
      reasoning: l.reasons,
      evidenceIds: [],
      confidence: l.confidence,
      warnings: l.risks,
    })),
    evidenceCoverage: 0.85,
    conflicts: conflicts.map((c) => ({
      entityId: c.entityId,
      description: c.description,
      severity: c.severity,
    })),
  };
}
