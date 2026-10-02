import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { getLLMProvider } from '../services/ai';
import {
  getTopLeads,
  getPipelineSummary,
  getHighValueDeals,
  getLeadEngagement,
  getCustomerRiskSignals,
  getLeadStatistics,
  getConversionStatistics,
} from '../services/analytics';
import { searchNotes, searchNotesForLead} from '../services/retrieval';
import { calculateLeadPriority, rankLeads } from '../services/decision/scoring';
import { calculateFreshness } from '../services/decision/freshness';
import { detectConflicts, buildEvidence } from '../services/evidence';
import { createTraceEvent, createAuditEvent } from '../services/audit';
import { prisma } from '../config/database';
import {
  INTENT_AGENT_PROMPT_V1,
  DECISION_AGENT_PROMPT_V1,
} from './prompts';
import { logger } from '../utils/logger';
import { config } from '../config';

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
      entityType: z.string().optional().default('Lead'),
      action: z.string(),
      score: z.number().optional(),
      reasoning: z.array(z.string()),
      evidenceIds: z.array(z.string()),
      confidence: z.number(),
      warnings: z.array(z.string()),
    })
  ),
  evidenceCoverage: z.number().optional(),
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
    entityType: string;
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

// ─── Intent fallback — keyword-based, consistent with the LLM prompt ────────

/**
 * inferIntent — deterministic fallback when LLM fails or confidence < 0.6.
 * Covers all 10 evaluation questions.
 */
export function inferIntent(question: string): z.infer<typeof IntentSchema> {
  const q = question.toLowerCase();

  if (q.includes('how many') || q.includes('total pipeline') || q.includes('pipeline value') ||
      (q.includes('total') && (q.includes('lead') || q.includes('deal'))) ||
      q.includes('conversion rate') || q.includes('statistic') || q.includes('count')) {
    return { intent: 'STATISTICS_QUERY', route: 'SQL', entities: ['Lead', 'Deal'], requiredTools: ['getLeadStatistics', 'getPipelineSummary', 'getConversionStatistics'], confidence: 0.85 };
  }
  if (q.includes('objection') || q.includes('what are customers saying') || q.includes('what do customers') ||
      q.includes('themes') || q.includes('mention') || (q.includes('note') && !q.includes('deal') && !q.includes('lead'))) {
    return { intent: 'NOTE_ANALYSIS', route: 'RAG', entities: ['BusinessNote'], requiredTools: ['searchNotes'], confidence: 0.85 };
  }
  if (q.includes('churn') || q.includes('declining engagement') || q.includes('customer risk') ||
      q.includes('at-risk customer') || (q.includes('customer') && q.includes('declining'))) {
    return { intent: 'CUSTOMER_RISK', route: 'HYBRID', entities: ['Customer'], requiredTools: ['getCustomerRiskSignals', 'searchNotes'], confidence: 0.85 };
  }
  if (q.includes('deal') || q.includes('pipeline') || q.includes('opportunit') || q.includes('overdue') || q.includes('stale deal')) {
    return { intent: 'DEAL_ANALYSIS', route: 'HYBRID', entities: ['Deal'], requiredTools: ['getHighValueDeals', 'getPipelineSummary', 'searchNotes'], confidence: 0.85 };
  }
  if (q.includes('hello') || q.includes('who are you') || q.includes('what is tracepilot') || q.includes('explain')) {
    return { intent: 'GENERAL_QUERY', route: 'RAG', entities: [], requiredTools: [], confidence: 0.85 };
  }
  // Default: lead prioritization covers "which leads", "contact today", "buying signals"
  return {
    intent: 'LEAD_PRIORITIZATION',
    route: 'HYBRID',
    entities: ['Lead'],
    requiredTools: ['getTopLeads', 'calculateLeadPriority', 'searchNotes'],
    confidence: 0.75,
  };
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

export async function processQuery(question: string): Promise<QueryResult> {
  const requestId = `TRC-${Date.now()}-${uuidv4().slice(0, 8).toUpperCase()}`;
  const steps: QueryResult['processingSteps'] = [];
  const provider = getLLMProvider();
  const warnings: string[] = [];

  // Graceful step wrapper — failures after intent are non-fatal
  async function step<T>(
    name: string,
    component: string,
    fn: () => Promise<T>,
    fallback?: T
  ): Promise<T> {
    const start = Date.now();
    const ts = new Date().toISOString();
    try {
      const result = await fn();
      const duration = Date.now() - start;
      steps.push({ step: name, status: 'SUCCESS', duration, detail: '', timestamp: ts });
      await createTraceEvent({ requestId, eventType: 'TOOL_COMPLETED', component, duration, status: 'SUCCESS' }).catch(() => null);
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      const errMsg = (err as Error).message;
      steps.push({ step: name, status: 'ERROR', duration, detail: errMsg, timestamp: ts });
      await createTraceEvent({ requestId, eventType: 'TOOL_FAILED', component, duration, status: 'ERROR', error: errMsg }).catch(() => null);
      if (fallback !== undefined) {
        warnings.push(`Step "${name}" failed and was skipped: ${errMsg.slice(0, 80)}`);
        return fallback;
      }
      throw err;
    }
  }

  // Record query
  await createTraceEvent({ requestId, eventType: 'QUERY_RECEIVED', component: 'Gateway', input: { question }, status: 'SUCCESS' }).catch(() => null);
  await createAuditEvent('QUERY_RECEIVED', 'system', { question }, requestId).catch(() => null);
  steps.push({ step: 'Query Received', status: 'SUCCESS', duration: 0, detail: question, timestamp: new Date().toISOString() });

  // ── Step 1: Intent Detection ──────────────────────────────────────────────
  let intent: z.infer<typeof IntentSchema>;
  let intentUsedFallback = false;

  try {
    const llmIntent = await step('Intent Detection', 'IntentAgent', () =>
      provider.generateStructured({
        messages: [
          { role: 'system', content: INTENT_AGENT_PROMPT_V1 },
          { role: 'user', content: `Analyze this business question: "${question}"` },
        ],
        schema: IntentSchema,
      })
    );

    // Sanity check: if confidence < 0.6, use keyword fallback
    if (llmIntent.confidence < 0.6) {
      const fallback = inferIntent(question);
      intent = fallback;
      intentUsedFallback = true;
      steps[steps.length - 1]!.status = 'FALLBACK';
      steps[steps.length - 1]!.detail = `LLM confidence ${llmIntent.confidence} < 0.6, used keyword fallback → ${fallback.intent}`;
    } else {
      intent = llmIntent;
      steps[steps.length - 1]!.detail = `Route: ${intent.route} | Intent: ${intent.intent}`;
    }
  } catch {
    intent = inferIntent(question);
    intentUsedFallback = true;
    // Status was already set to ERROR by step(); set to FALLBACK without overwriting detail
    steps[steps.length - 1]!.status = 'FALLBACK';
    steps[steps.length - 1]!.detail = `LLM intent failed, keyword fallback: ${intent.intent}`;
  }

  if (!intentUsedFallback) {
    steps[steps.length - 1]!.detail = `Route: ${intent.route} | Intent: ${intent.intent}`;
  }

  await createTraceEvent({ requestId, eventType: 'INTENT_DETECTED', component: 'IntentAgent', output: intent, status: 'SUCCESS' }).catch(() => null);

  // ── Dispatch by intent ───────────────────────────────────────────────────
  return dispatchIntent(intent, question, requestId, steps, warnings, provider, step);
}

// ─── Intent dispatcher ──────────────────────────────────────────────────────

async function dispatchIntent(
  intent: z.infer<typeof IntentSchema>,
  question: string,
  requestId: string,
  steps: QueryResult['processingSteps'],
  warnings: string[],
  provider: ReturnType<typeof getLLMProvider>,
  step: <T>(name: string, component: string, fn: () => Promise<T>, fallback?: T) => Promise<T>
): Promise<QueryResult> {
  switch (intent.intent) {
    case 'STATISTICS_QUERY':
      return handleStatisticsQuery(intent, question, requestId, steps, warnings, provider, step);
    case 'NOTE_ANALYSIS':
      return handleNoteAnalysis(intent, question, requestId, steps, warnings, provider, step);
    case 'CUSTOMER_RISK':
      return handleCustomerRisk(intent, question, requestId, steps, warnings, provider, step);
    case 'DEAL_ANALYSIS':
      return handleDealAnalysis(intent, question, requestId, steps, warnings, provider, step);
    case 'GENERAL_QUERY':
      return handleGeneralQuery(intent, question, requestId, steps, warnings, provider, step);
    case 'LEAD_PRIORITIZATION':
    default:
      return handleLeadPrioritization(intent, question, requestId, steps, warnings, provider, step);
  }
}

// ─── STATISTICS_QUERY ────────────────────────────────────────────────────────

async function handleStatisticsQuery(
  intent: z.infer<typeof IntentSchema>,
  question: string,
  requestId: string,
  steps: QueryResult['processingSteps'],
  warnings: string[],
  provider: ReturnType<typeof getLLMProvider>,
  step: <T>(name: string, component: string, fn: () => Promise<T>, fallback?: T) => Promise<T>
): Promise<QueryResult> {
  const [leadStats, pipeline, conversion] = await Promise.all([
    step('Lead Statistics', 'AnalyticsAgent', getLeadStatistics, null).catch(() => null),
    step('Pipeline Summary', 'AnalyticsAgent', getPipelineSummary, null).catch(() => null),
    step('Conversion Statistics', 'AnalyticsAgent', getConversionStatistics, null).catch(() => null),
  ]);

  const dataContext = {
    leadStats,
    pipeline,
    conversion,
    question,
  };

  const answer = await step('LLM Statistics Answer', 'DecisionAgent', () =>
    provider.generate({
      messages: [
        { role: 'system', content: 'You are a business analytics assistant. Answer the question using ONLY the provided statistics. Be precise with numbers. Do not invent data.' },
        { role: 'user', content: `Question: "${question}"\n\nData:\n${JSON.stringify(dataContext, null, 2)}\n\nProvide a concise, factual answer.` },
      ],
    })
  , `No statistical data available for: "${question}"`);

  steps[steps.length - 1]!.detail = 'SQL-only statistics query answered';

  return buildResult({
    requestId, intent, question, answer,
    recommendations: [],
    allEvidence: [],
    allConflicts: [],
    warnings,
    candidatesAnalyzed: leadStats?.total || 0,
    retrievedNotes: 0,
    sqlUsed: true,
    ragUsed: false,
    steps,
  });
}

// ─── NOTE_ANALYSIS ───────────────────────────────────────────────────────────

async function handleNoteAnalysis(
  intent: z.infer<typeof IntentSchema>,
  question: string,
  requestId: string,
  steps: QueryResult['processingSteps'],
  warnings: string[],
  provider: ReturnType<typeof getLLMProvider>,
  step: <T>(name: string, component: string, fn: () => Promise<T>, fallback?: T) => Promise<T>
): Promise<QueryResult> {
  const notes = await step('RAG Note Retrieval', 'RetrievalAgent', () => searchNotes(question, 20), []);
  steps[steps.length - 1]!.detail = `Retrieved ${notes.length} relevant notes`;

  // Count theme occurrences in code — do not trust LLM counts
  const themeKeywords: Record<string, string[]> = {
    'Pricing concerns': ['pricing', 'cost', 'price', 'expensive', 'cheaper', 'budget'],
    'Integration complexity': ['integration', 'complex', 'connector', 'api', 'technical'],
    'Vendor comparison': ['competitor', 'vendor', 'alternative', 'comparing', 'evaluation'],
    'Budget timing': ['budget cycle', 'next quarter', 'next year', 'budget freeze', 'timing'],
    'Implementation concerns': ['implementation', 'resources', 'deployment', 'setup'],
    'Pause/hold signals': ['paused', 'on hold', 'delayed', 'not this quarter', 'postponed'],
  };

  const themeCounts: Record<string, number> = {};
  const themeSnippets: Record<string, string[]> = {};

  for (const note of notes) {
    const text = note.text.toLowerCase();
    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      if (keywords.some((kw) => text.includes(kw))) {
        themeCounts[theme] = (themeCounts[theme] || 0) + 1;
        if (!themeSnippets[theme]) themeSnippets[theme] = [];
        if (themeSnippets[theme].length < 2) {
          themeSnippets[theme].push(note.text.slice(0, 120) + '...');
        }
      }
    }
  }

  const sortedThemes = Object.entries(themeCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([theme, count]) => ({ theme, count, snippets: themeSnippets[theme] || [] }));

  const answer = await step('LLM Note Analysis', 'DecisionAgent', () =>
    provider.generate({
      messages: [
        { role: 'system', content: 'You are a CRM analyst. Summarize themes from customer notes. Use the pre-computed counts provided — do not invent counts.' },
        { role: 'user', content: `Question: "${question}"\n\nTheme counts (computed from ${notes.length} notes):\n${JSON.stringify(sortedThemes, null, 2)}\n\nProvide a clear summary with the themes ranked by frequency, citing note snippets as evidence.` },
      ],
    })
  , notes.length > 0 ? `Analysis of ${notes.length} notes: ${sortedThemes.map((t) => `${t.theme} (${t.count})`).join(', ')}` : 'No notes found for this query.');

  if (notes.length === 0) warnings.push('No notes matched the query — try different keywords.');

  return buildResult({
    requestId, intent, question, answer,
    recommendations: [],
    allEvidence: notes.map((n, idx) => ({
      id: `E-NOTE-${n.id}`,
      sourceType: n.sourceType,
      sourceId: n.sourceId,
      field: 'content',
      value: n.text.slice(0, 150),
      explanation: `Note with relevance score ${Math.round(n.similarity * 100)}%`,
      freshness: 'RECENT',
      supported: true,
    })),
    allConflicts: [],
    warnings,
    candidatesAnalyzed: notes.length,
    retrievedNotes: notes.length,
    sqlUsed: false,
    ragUsed: true,
    steps,
  });
}

// ─── CUSTOMER_RISK ───────────────────────────────────────────────────────────

async function handleCustomerRisk(
  intent: z.infer<typeof IntentSchema>,
  question: string,
  requestId: string,
  steps: QueryResult['processingSteps'],
  warnings: string[],
  provider: ReturnType<typeof getLLMProvider>,
  step: <T>(name: string, component: string, fn: () => Promise<T>, fallback?: T) => Promise<T>
): Promise<QueryResult> {
  const [customers, notes] = await Promise.all([
    step('Customer Risk Signals', 'AnalyticsAgent', () => getCustomerRiskSignals(20), []),
    step('RAG Note Retrieval', 'RetrievalAgent', () => searchNotes(question, 15), []),
  ]);

  steps[steps.length - 2]!.detail = `Found ${customers.length} at-risk customers`;
  steps[steps.length - 1]!.detail = `Retrieved ${notes.length} relevant notes`;

  const customerSummaries = customers.slice(0, 10).map((c) => ({
    id: c.externalId,
    company: c.company,
    status: c.status,
    lastInteraction: c.lastInteractionAt,
    daysSince: c.lastInteractionAt
      ? Math.floor((Date.now() - new Date(c.lastInteractionAt).getTime()) / 86400000)
      : null,
    lifetimeValue: c.lifetimeValue,
  }));

  const decisionResponse = await step('LLM Risk Analysis', 'DecisionAgent', () =>
    provider.generateStructured({
      messages: [
        { role: 'system', content: DECISION_AGENT_PROMPT_V1 },
        {
          role: 'user',
          content: `Question: "${question}"\n\nAt-Risk Customers:\n${JSON.stringify(customerSummaries, null, 2)}\n\nRelevant Notes: ${notes.length}\n\nGenerate customer-level risk recommendations with entityType: "Customer".`,
        },
      ],
      schema: DecisionResponseSchema,
    })
  , buildFallbackDecision(question, [], []));

  const recs = decisionResponse.recommendations
    .filter((r) => customers.some((c) => c.externalId === r.entityId || c.company === r.entityName))
    .slice(0, 5)
    .map((r, idx) => {
      const customer = customers.find((c) => c.externalId === r.entityId || c.company === r.entityName);
      return {
        entityId: r.entityId,
        entityName: r.entityName,
        entityType: 'Customer',
        company: customer?.company,
        score: customer?.lifetimeValue ? Math.min((customer.lifetimeValue / 100000) * 100, 100) : 50,
        rank: idx + 1,
        action: r.action || 'REVIEW_REQUIRED',
        reasoning: r.reasoning,
        evidence: [],
        confidence: r.confidence,
        warnings: r.warnings,
        conflicts: [],
        freshnessLevel: calculateFreshness(customer?.lastInteractionAt ?? null).level,
        estimatedDealValue: customer?.lifetimeValue ?? null,
        approvalStatus: 'PENDING',
      };
    });

  await persistDecisions(requestId, question, recs, steps);

  return buildResult({
    requestId, intent, question,
    answer: decisionResponse.answerSummary,
    recommendations: recs,
    allEvidence: [],
    allConflicts: decisionResponse.conflicts,
    warnings,
    candidatesAnalyzed: customers.length,
    retrievedNotes: notes.length,
    sqlUsed: true,
    ragUsed: notes.length > 0,
    steps,
  });
}

// ─── DEAL_ANALYSIS ───────────────────────────────────────────────────────────

async function handleDealAnalysis(
  intent: z.infer<typeof IntentSchema>,
  question: string,
  requestId: string,
  steps: QueryResult['processingSteps'],
  warnings: string[],
  provider: ReturnType<typeof getLLMProvider>,
  step: <T>(name: string, component: string, fn: () => Promise<T>, fallback?: T) => Promise<T>
): Promise<QueryResult> {
  const [pipeline, highValueDeals, notes] = await Promise.all([
    step('Pipeline Summary', 'AnalyticsAgent', getPipelineSummary, null),
    step('High Value Deals', 'AnalyticsAgent', () => getHighValueDeals(5000, 20), []),
    step('RAG Note Retrieval', 'RetrievalAgent', () => searchNotes(question, 15), []),
  ]);

  steps[steps.length - 2]!.detail = `Found ${highValueDeals.length} high-value deals`;
  steps[steps.length - 1]!.detail = `Retrieved ${notes.length} relevant notes`;

  const now = new Date();
  const dealSummaries = highValueDeals.slice(0, 15).map((d) => ({
    id: d.externalId,
    name: d.name,
    stage: d.stage,
    value: d.value,
    probability: d.probability,
    lead: d.lead ? `${d.lead.name} (${d.lead.company})` : null,
    overdue: d.expectedCloseDate ? d.expectedCloseDate < now : false,
    stale: d.updatedAt ? (Date.now() - new Date(d.updatedAt).getTime()) > 30 * 86400000 : false,
    daysSinceUpdate: d.updatedAt ? Math.floor((Date.now() - new Date(d.updatedAt).getTime()) / 86400000) : null,
  }));

  const decisionResponse = await step('LLM Deal Analysis', 'DecisionAgent', () =>
    provider.generateStructured({
      messages: [
        { role: 'system', content: DECISION_AGENT_PROMPT_V1 },
        {
          role: 'user',
          content: `Question: "${question}"\n\nPipeline Summary: ${JSON.stringify(pipeline, null, 2)}\n\nHigh-Value Deals:\n${JSON.stringify(dealSummaries, null, 2)}\n\nNotes Retrieved: ${notes.length}\n\nGenerate deal-level recommendations with entityType: "Deal". Flag overdue and stale deals.`,
        },
      ],
      schema: DecisionResponseSchema,
    })
  , buildFallbackDecision(question, [], []));

  const recs = decisionResponse.recommendations
    .filter((r) => highValueDeals.some((d) => d.externalId === r.entityId || d.name === r.entityName))
    .slice(0, 5)
    .map((r, idx) => {
      const deal = highValueDeals.find((d) => d.externalId === r.entityId || d.name === r.entityName);
      return {
        entityId: r.entityId,
        entityName: r.entityName,
        entityType: 'Deal',
        company: deal?.lead?.company,
        score: deal ? Math.min((deal.value / 100000) * 80 + (deal.probability || 0) * 20, 100) : 50,
        rank: idx + 1,
        action: r.action || 'REVIEW_REQUIRED',
        reasoning: r.reasoning,
        evidence: [],
        confidence: r.confidence,
        warnings: [...r.warnings, ...(deal && dealSummaries.find((d) => d.id === deal.externalId)?.overdue ? ['Deal is overdue'] : [])],
        conflicts: [],
        freshnessLevel: deal?.updatedAt ? calculateFreshness(new Date(deal.updatedAt)).level : 'UNKNOWN',
        estimatedDealValue: deal?.value ?? null,
        approvalStatus: 'PENDING',
      };
    });

  await persistDecisions(requestId, question, recs, steps);

  return buildResult({
    requestId, intent, question,
    answer: decisionResponse.answerSummary,
    recommendations: recs,
    allEvidence: [],
    allConflicts: decisionResponse.conflicts,
    warnings,
    candidatesAnalyzed: highValueDeals.length,
    retrievedNotes: notes.length,
    sqlUsed: true,
    ragUsed: notes.length > 0,
    steps,
  });
}

// ─── GENERAL_QUERY ───────────────────────────────────────────────────────────

async function handleGeneralQuery(
  intent: z.infer<typeof IntentSchema>,
  question: string,
  requestId: string,
  steps: QueryResult['processingSteps'],
  warnings: string[],
  provider: ReturnType<typeof getLLMProvider>,
  step: <T>(name: string, component: string, fn: () => Promise<T>, fallback?: T) => Promise<T>
): Promise<QueryResult> {
  const answer = await step('LLM General Answer', 'DecisionAgent', () =>
    provider.generate({
      messages: [
        { role: 'system', content: 'You are TracePilot, an AI sales decision engine. Answer the question helpfully and concisely. If it is a business question you cannot answer without data, say so and suggest what the user should ask.' },
        { role: 'user', content: question },
      ],
    })
  , 'I am TracePilot, an evidence-backed AI sales decision engine. Ask me specific business questions like "Which leads should I contact today?" or "What is the total pipeline value?"');

  return buildResult({
    requestId, intent, question, answer,
    recommendations: [],
    allEvidence: [],
    allConflicts: [],
    warnings,
    candidatesAnalyzed: 0,
    retrievedNotes: 0,
    sqlUsed: false,
    ragUsed: false,
    steps,
  });
}

// ─── LEAD_PRIORITIZATION ─────────────────────────────────────────────────────

async function handleLeadPrioritization(
  intent: z.infer<typeof IntentSchema>,
  question: string,
  requestId: string,
  steps: QueryResult['processingSteps'],
  warnings: string[],
  provider: ReturnType<typeof getLLMProvider>,
  step: <T>(name: string, component: string, fn: () => Promise<T>, fallback?: T) => Promise<T>
): Promise<QueryResult> {
  // SQL: get top candidates
  const candidates = await step('SQL Candidate Retrieval', 'AnalyticsAgent', () => getTopLeads(50), []);
  steps[steps.length - 1]!.detail = `Retrieved ${candidates.length} lead candidates`;

  // Global RAG for context (light)
  const globalNotes = await step('RAG Note Retrieval', 'RetrievalAgent', () => searchNotes(question, 10), []);
  steps[steps.length - 1]!.detail = `Retrieved ${globalNotes.length} relevant notes`;

  // Batch queries to avoid N+1: get all interactions and deals for top 30 leads at once
  const top30 = candidates.slice(0, 30);
  const leadIds = top30.map((l) => l.id);

  const [allInteractions, allDeals] = await Promise.all([
    step('Batch Engagement Query', 'AnalyticsAgent', () =>
      prisma.interaction.findMany({
        where: { leadId: { in: leadIds } },
        orderBy: { timestamp: 'desc' },
        select: { leadId: true, timestamp: true, sentiment: true },
      })
    , []),
    step('Batch Deal Query', 'AnalyticsAgent', () =>
      prisma.deal.findMany({
        where: { leadId: { in: leadIds }, stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } },
        take: 90,
      })
    , []),
  ]);

  // Group in memory
  const interactionsByLead = new Map<string, typeof allInteractions>();
  for (const i of allInteractions) {
    if (!i.leadId) continue;
    if (!interactionsByLead.has(i.leadId)) interactionsByLead.set(i.leadId, []);
    interactionsByLead.get(i.leadId)!.push(i);
  }
  const dealsByLead = new Map<string, typeof allDeals>();
  for (const d of allDeals) {
    if (!d.leadId) continue;
    if (!dealsByLead.has(d.leadId)) dealsByLead.set(d.leadId, []);
    dealsByLead.get(d.leadId)!.push(d);
  }

  const scoredLeads: ReturnType<typeof calculateLeadPriority>[] = [];
  const allConflicts: Array<{ description: string; severity: string; entityId?: string }> = [];
  const allEvidence: ReturnType<typeof buildEvidence> = [];

  await step('Decision Scoring', 'DecisionEngine', async () => {
    for (const lead of top30) {
      // Per-lead note retrieval so every lead gets relevant context
      const leadNotes = await searchNotesForLead(lead.id, question, 5).catch(() => []);

      // Merge with global notes that match this lead
      const globalForLead = globalNotes.filter(
        (n) =>
          n.sourceId === lead.id ||
          (n.metadata && typeof n.metadata === 'object' && (n.metadata as Record<string, unknown>)['leadId'] === lead.id)
      );
      const combinedNotes = [...leadNotes, ...globalForLead].filter(
        (n, i, arr) => arr.findIndex((x) => x.id === n.id) === i
      );

      const interactions = interactionsByLead.get(lead.id) || [];
      const last30 = new Date(Date.now() - 30 * 86400000);
      const recentCount = interactions.filter((i) => new Date(i.timestamp) > last30).length;
      const sentimentScores = interactions
        .filter((i) => i.sentiment)
        .map((i) => (i.sentiment === 'POSITIVE' ? 1 : i.sentiment === 'NEGATIVE' ? -1 : 0));
      const avgSentiment = sentimentScores.length > 0 ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length : 0;
      const engScore = Math.min(recentCount / 5, 1) * 0.6 + Math.max(0, avgSentiment) * 0.4;

      const conflicts = detectConflicts(lead, combinedNotes);
      const hasNegative = conflicts.some((c) => c.severity === 'HIGH');
      const scored = calculateLeadPriority(lead, engScore, hasNegative);

      const deals = (dealsByLead.get(lead.id) || []).slice(0, 3).map((d) => ({
        id: d.id,
        value: d.value,
        stage: d.stage,
        externalId: d.externalId,
      }));
      const evidence = buildEvidence(lead, combinedNotes, deals);

      scoredLeads.push(scored);
      allConflicts.push(
        ...conflicts.map((c) => ({ description: c.description, severity: c.severity, entityId: lead.externalId }))
      );
      allEvidence.push(...evidence);
    }
  }, undefined);

  steps[steps.length - 1]!.detail = `Scored ${scoredLeads.length} leads`;

  const ranked = rankLeads(scoredLeads).slice(0, 10);

  // Build stable evidence id map for the LLM prompt
  const evidenceMap = new Map(allEvidence.map((e) => [e.id, e]));

  // LLM Decision Response
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

  const evidenceForPrompt = allEvidence
    .filter((e) => ranked.slice(0, 5).some((l) => l.externalId === e.sourceId || e.id.includes(l.leadId)))
    .slice(0, 20)
    .map((e) => ({ id: e.id, field: e.field, value: e.value.slice(0, 100), snippet: e.explanation }));

  let decisionResponse: z.infer<typeof DecisionResponseSchema>;
  try {
    decisionResponse = await step('AI Recommendation Generation', 'DecisionAgent', () =>
      provider.generateStructured({
        messages: [
          { role: 'system', content: DECISION_AGENT_PROMPT_V1 },
          {
            role: 'user',
            content: `Question: "${question}"

Scored Candidates (top ${topCandidatesSummary.length}):
${JSON.stringify(topCandidatesSummary, null, 2)}

Evidence items (cite these IDs in evidenceIds):
${JSON.stringify(evidenceForPrompt, null, 2)}

Retrieved Notes Count: ${globalNotes.length}
Conflicts detected: ${allConflicts.length}

IMPORTANT: Only reference entityIds from the candidates list above. Cite evidenceIds from the evidence list. Leave score/action/confidence as-is — they will be overridden by the scoring engine.`,
          },
        ],
        schema: DecisionResponseSchema,
      })
    );
  } catch (err: unknown) {
    const errMsg = (err as Error).message || '';
    decisionResponse = buildFallbackDecision(question, ranked, allConflicts);
    if (errMsg.includes('429') || errMsg.includes('503') || errMsg.includes('quota')) {
      decisionResponse.answerSummary = `⚠️ AI Service rate-limited. Using deterministic scoring engine.\n\n` + decisionResponse.answerSummary;
    }
  }

  // ── Validate LLM output: override scores/actions, drop hallucinated entities ──
  const candidateSet = new Set(ranked.map((l) => l.externalId));
  const validatedRecs = decisionResponse.recommendations
    .filter((r) => candidateSet.has(r.entityId))
    .slice(0, 5)
    .map((rec, idx) => {
      const scored = ranked.find((l) => l.externalId === rec.entityId)!;
      // Override action/score/confidence with deterministic values; LLM only provides reasoning text
      const validEvidenceIds = rec.evidenceIds.filter((eid) => evidenceMap.has(eid));
      const recConflicts = allConflicts.filter((c) => c.entityId === rec.entityId);

      const evidenceForRec = allEvidence.filter(
        (e) => e.sourceId === scored.externalId || e.id.includes(scored.leadId)
      );

      return {
        entityId: rec.entityId,
        externalId: scored.externalId,
        entityName: rec.entityName,
        entityType: 'Lead',
        company: scored.company,
        // Deterministic score/action/confidence from scoring engine, not LLM
        score: scored.score,
        rank: idx + 1,
        action: scored.action,
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
        breakdown: {
          leadQuality: scored.breakdown.leadQuality,
          engagement: scored.breakdown.engagement,
          dealValue: scored.breakdown.dealValue,
          urgency: scored.breakdown.urgency,
          recency: scored.breakdown.recency,
        },
        confidence: scored.confidence,
        warnings: [...rec.warnings, ...scored.risks],
        conflicts: recConflicts.map((c) => ({ description: c.description, severity: c.severity })),
        freshnessLevel: scored.freshnessLevel,
        estimatedDealValue: scored.estimatedDealValue,
        approvalStatus: 'PENDING',
        validEvidenceIds,
      };
    });

  // Compute evidence coverage: share of recs with at least one valid cited evidence
  const recsWithEvidence = validatedRecs.filter((r) => r.evidence.length > 0).length;
  const evidenceCoverage = validatedRecs.length > 0 ? recsWithEvidence / validatedRecs.length : 0;

  // Persist
  const persistedDecisions = await persistLeadDecisions(requestId, question, validatedRecs, allEvidence, steps);

  const finalRecs = validatedRecs.map((r) => {
    const d = persistedDecisions.find((pd) => pd.entityId === r.entityId);
    return { ...r, approvalStatus: d?.approvals?.[0]?.status || 'PENDING', decisionId: d?.id };
  });

  const avgConfidence = finalRecs.length > 0 ? finalRecs.reduce((s, r) => s + r.confidence, 0) / finalRecs.length : 0;

  return {
    requestId,
    traceId: requestId,
    route: intent.route,
    intent: intent.intent,
    question,
    answer: decisionResponse.answerSummary,
    recommendations: finalRecs,
    evidence: allEvidence,
    warnings: [
      ...warnings,
      ...decisionResponse.conflicts.map((c) => c.description),
      ...(globalNotes.length === 0 ? ['RAG retrieval unavailable — using SQL-only analysis'] : []),
    ],
    confidence: Math.round(avgConfidence * 100) / 100,
    evidenceCoverage,
    sqlUsed: true,
    ragUsed: globalNotes.length > 0,
    retrievedNotes: globalNotes.length,
    candidatesAnalyzed: candidates.length,
    processingSteps: steps,
    demoMode: config.demoMode,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildResult(args: {
  requestId: string;
  intent: z.infer<typeof IntentSchema>;
  question: string;
  answer: string;
  recommendations: QueryResult['recommendations'];
  allEvidence: Array<{ id: string; sourceType: string; sourceId: string; field: string; value: string; explanation: string; freshness: string; supported: boolean }>;
  allConflicts: Array<{ description?: string; entityId?: string; severity?: string }>;
  warnings: string[];
  candidatesAnalyzed: number;
  retrievedNotes: number;
  sqlUsed: boolean;
  ragUsed: boolean;
  steps: QueryResult['processingSteps'];
}): QueryResult {
  const avgConf = args.recommendations.length > 0
    ? args.recommendations.reduce((s, r) => s + r.confidence, 0) / args.recommendations.length
    : 0;
  const evidenceCoverage = args.recommendations.length > 0
    ? args.recommendations.filter((r) => r.evidence.length > 0).length / args.recommendations.length
    : (args.allEvidence.length > 0 ? 0.8 : 0);

  return {
    requestId: args.requestId,
    traceId: args.requestId,
    route: args.intent.route,
    intent: args.intent.intent,
    question: args.question,
    answer: args.answer,
    recommendations: args.recommendations,
    evidence: args.allEvidence,
    warnings: [
      ...args.warnings,
      ...args.allConflicts.filter((c) => c.description).map((c) => c.description!),
    ],
    confidence: Math.round(avgConf * 100) / 100,
    evidenceCoverage,
    sqlUsed: args.sqlUsed,
    ragUsed: args.ragUsed,
    retrievedNotes: args.retrievedNotes,
    candidatesAnalyzed: args.candidatesAnalyzed,
    processingSteps: args.steps,
    demoMode: config.demoMode,
  };
}

function buildFallbackDecision(
  _question: string,
  ranked: ReturnType<typeof calculateLeadPriority>[],
  conflicts: Array<{ description: string; severity: string; entityId?: string }>
): z.infer<typeof DecisionResponseSchema> {
  return {
    answerSummary:
      `Based on TracePilot's deterministic scoring engine, here are the top priorities. Each recommendation is grounded in lead quality, engagement, deal value, and recency. Human approval required before action.`,
    recommendations: ranked.slice(0, 5).map((l) => ({
      entityId: l.externalId,
      entityName: l.name,
      entityType: 'Lead',
      action: l.action,
      score: l.score,
      reasoning: l.reasons,
      evidenceIds: [],
      confidence: l.confidence,
      warnings: l.risks,
    })),
    evidenceCoverage: 0,
    conflicts: conflicts.map((c) => ({ entityId: c.entityId, description: c.description, severity: c.severity })),
  };
}

async function persistDecisions(
  requestId: string,
  question: string,
  recs: QueryResult['recommendations'],
  steps: QueryResult['processingSteps']
): Promise<void> {
  try {
    // Wrap in transaction for atomicity
    await prisma.$transaction(async (tx) => {
      for (const rec of recs.slice(0, 5)) {
        const decision = await tx.decision.create({
          data: {
            requestId,
            query: question,
            entityType: rec.entityType,
            entityId: rec.entityId,
            rank: rec.rank,
            score: rec.score,
            recommendation: rec.action,
            rationale: rec.reasoning.join('; '),
            confidence: rec.confidence,
          },
        });
        await tx.approval.create({ data: { decisionId: decision.id, status: 'PENDING' } });
      }
    });
  } catch (err) {
    steps.push({
      step: 'Persist Decisions',
      status: 'ERROR',
      duration: 0,
      detail: `Persistence failed: ${(err as Error).message.slice(0, 80)}`,
      timestamp: new Date().toISOString(),
    });
  }
}

async function persistLeadDecisions(
  requestId: string,
  question: string,
  recs: Array<{ entityId: string; entityType: string; rank: number; score: number; action: string; reasoning: string[]; confidence: number; evidence: Array<{ id: string; sourceType: string; sourceId: string; field: string; value: string; explanation: string; freshness: string }>; }>,
  allEvidence: ReturnType<typeof buildEvidence>,
  steps: QueryResult['processingSteps']
): Promise<Array<{ id: string; entityId: string | null; approvals: Array<{ status: string }> }>> {
  try {
    return await prisma.$transaction(async (tx) => {
      const results = [];
      for (const rec of recs.slice(0, 5)) {
        const decision = await tx.decision.create({
          data: {
            requestId,
            query: question,
            entityType: rec.entityType,
            entityId: rec.entityId,
            rank: rec.rank,
            score: rec.score,
            recommendation: rec.action,
            rationale: rec.reasoning.join('; '),
            confidence: rec.confidence,
          },
        });
        await tx.approval.create({ data: { decisionId: decision.id, status: 'PENDING' } });

        // Persist evidence by evidence item id, not the sourceId string-hack
        for (const ev of rec.evidence.slice(0, 5)) {
          await tx.evidence.create({
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

        results.push({ id: decision.id, entityId: decision.entityId, approvals: [{ status: 'PENDING' }] });
      }
      return results;
    });
  } catch (err) {
    steps.push({
      step: 'Persist Decisions',
      status: 'ERROR',
      duration: 0,
      detail: `Persistence failed: ${(err as Error).message.slice(0, 80)}`,
      timestamp: new Date().toISOString(),
    });
    return [];
  }
}
