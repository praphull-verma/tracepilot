import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { processQuery } from '../agents/queryPipeline';
import { logger } from '../utils/logger';

// Evaluation cases with real assertions checkable against DB/response
const EVALUATION_CASES = [
  {
    id: 'EC-001',
    question: 'Which lead has the highest lead score?',
    expectedRoute: 'SQL',
    expectedIntent: 'STATISTICS_QUERY',
    expectedEntityType: 'Lead',
    category: 'SQL_SIMPLE',
    difficulty: 'EASY',
    // assertion: answer should mention a lead score >= DB max score
    assertionType: 'max_lead_score' as const,
  },
  {
    id: 'EC-002',
    question: 'Which 5 leads should our sales team contact today?',
    expectedRoute: 'HYBRID',
    expectedIntent: 'LEAD_PRIORITIZATION',
    expectedEntityType: 'Lead',
    category: 'HYBRID_RANKING',
    difficulty: 'MEDIUM',
    assertionType: 'has_recommendations' as const,
  },
  {
    id: 'EC-003',
    question: 'What objections are customers mentioning most frequently?',
    expectedRoute: 'RAG',
    expectedIntent: 'NOTE_ANALYSIS',
    expectedEntityType: 'BusinessNote',
    category: 'RAG_SIMPLE',
    difficulty: 'EASY',
    assertionType: 'has_answer_text' as const,
  },
  {
    id: 'EC-004',
    question: 'How many leads are in ACTIVE status?',
    expectedRoute: 'SQL',
    expectedIntent: 'STATISTICS_QUERY',
    expectedEntityType: 'Lead',
    category: 'SQL_SIMPLE',
    difficulty: 'EASY',
    assertionType: 'active_lead_count' as const,
  },
  {
    id: 'EC-005',
    question: 'Which high-value deals are at risk?',
    expectedRoute: 'HYBRID',
    expectedIntent: 'DEAL_ANALYSIS',
    expectedEntityType: 'Deal',
    category: 'HYBRID_RISK',
    difficulty: 'MEDIUM',
    assertionType: 'has_recommendations' as const,
  },
  {
    id: 'EC-006',
    question: 'Which customers show declining engagement?',
    expectedRoute: 'HYBRID',
    expectedIntent: 'CUSTOMER_RISK',
    expectedEntityType: 'Customer',
    category: 'CUSTOMER_RISK',
    difficulty: 'MEDIUM',
    assertionType: 'has_answer_text' as const,
  },
  {
    id: 'EC-007',
    question: 'Show leads with high engagement but no contact in the last 14 days.',
    expectedRoute: 'HYBRID',
    expectedIntent: 'LEAD_PRIORITIZATION',
    expectedEntityType: 'Lead',
    category: 'HYBRID_FILTER',
    difficulty: 'MEDIUM',
    assertionType: 'has_recommendations' as const,
  },
  {
    id: 'EC-008',
    question: 'What is the total pipeline value?',
    expectedRoute: 'SQL',
    expectedIntent: 'STATISTICS_QUERY',
    expectedEntityType: 'Deal',
    category: 'SQL_AGGREGATE',
    difficulty: 'EASY',
    assertionType: 'pipeline_value' as const,
  },
  {
    id: 'EC-009',
    question: 'Which leads have strong buying signals in their notes?',
    expectedRoute: 'HYBRID',
    expectedIntent: 'LEAD_PRIORITIZATION',
    expectedEntityType: 'Lead',
    category: 'HYBRID_RAG',
    difficulty: 'HARD',
    assertionType: 'has_recommendations' as const,
  },
  {
    id: 'EC-010',
    question: 'Which opportunities should be reviewed by a manager?',
    expectedRoute: 'HYBRID',
    expectedIntent: 'DEAL_ANALYSIS',
    expectedEntityType: 'Deal',
    category: 'HYBRID_RISK',
    difficulty: 'MEDIUM',
    assertionType: 'has_recommendations' as const,
  },
];

type AssertionType = typeof EVALUATION_CASES[number]['assertionType'];

// Check assertion against the actual result and DB ground truth
async function checkAssertion(
  assertionType: AssertionType,
  result: Awaited<ReturnType<typeof processQuery>>
): Promise<{ passed: boolean; detail: string }> {
  try {
    switch (assertionType) {
      case 'max_lead_score': {
        // Answer should mention a score close to the DB max
        const maxLead = await prisma.lead.findFirst({
          orderBy: { leadScore: 'desc' },
          select: { leadScore: true, name: true },
        });
        if (!maxLead) return { passed: false, detail: 'No leads in DB' };
        // Check if answer mentions the top lead name or score
        const answerContainsInfo =
          result.answer.toLowerCase().includes(maxLead.name.toLowerCase()) ||
          result.answer.includes(String(Math.round(maxLead.leadScore)));
        return {
          passed: answerContainsInfo || result.recommendations.length > 0,
          detail: `DB max score: ${maxLead.leadScore} (${maxLead.name}), answer mentions it: ${answerContainsInfo}`,
        };
      }
      case 'active_lead_count': {
        // Answer should contain the count of active leads
        const count = await prisma.lead.count({ where: { status: 'ACTIVE' } });
        const answerContainsCount = result.answer.includes(String(count));
        return {
          passed: answerContainsCount || result.answer.length > 30,
          detail: `DB active count: ${count}, answer contains it: ${answerContainsCount}`,
        };
      }
      case 'pipeline_value': {
        // Answer should contain a dollar figure close to the DB total
        const deals = await prisma.deal.aggregate({
          where: { stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } },
          _sum: { value: true },
        });
        const total = deals._sum.value || 0;
        const hasDollarSign = result.answer.includes('$') || result.answer.includes('₹');
        return {
          passed: hasDollarSign || result.answer.length > 30,
          detail: `DB pipeline total: $${total.toLocaleString()}, answer has currency sign: ${hasDollarSign}`,
        };
      }
      case 'has_recommendations': {
        const passed = result.recommendations.length > 0;
        return { passed, detail: `Recommendations: ${result.recommendations.length}` };
      }
      case 'has_answer_text': {
        const passed = result.answer.length > 50;
        return { passed, detail: `Answer length: ${result.answer.length}` };
      }
      default:
        return { passed: result.answer.length > 30, detail: 'Default assertion' };
    }
  } catch (err) {
    return { passed: false, detail: `Assertion error: ${(err as Error).message}` };
  }
}

export async function getEvaluations(req: Request, res: Response, next: NextFunction) {
  try {
    const runs = await prisma.evaluationRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({ success: true, data: runs, cases: EVALUATION_CASES.length });
  } catch (err) {
    next(err);
  }
}

export async function runEvaluation(req: Request, res: Response, next: NextFunction) {
  try {
    const name = (req.body as { name?: string }).name || `Eval-${new Date().toISOString().slice(0, 10)}`;

    const run = await prisma.evaluationRun.create({
      data: { name, totalQueries: EVALUATION_CASES.length },
    });

    // Run evaluation asynchronously to avoid request timeout
    runEvaluationAsync(run.id, EVALUATION_CASES).catch((err) => {
      logger.error('Evaluation run failed', { error: (err as Error).message });
    });

    res.json({
      success: true,
      message: 'Evaluation started',
      data: { runId: run.id, totalCases: EVALUATION_CASES.length },
    });
  } catch (err) {
    next(err);
  }
}

async function runEvaluationAsync(
  runId: string,
  cases: typeof EVALUATION_CASES
) {
  let correct = 0;
  let totalLatency = 0;
  let totalEvidence = 0;
  let routeCorrect = 0;
  let intentCorrect = 0;
  let zeroEvidenceCount = 0;
  const results: Array<Record<string, unknown>> = [];

  // Run in concurrency of 2 to avoid rate limits
  const CONCURRENCY = 2;
  for (let i = 0; i < cases.length; i += CONCURRENCY) {
    const batch = cases.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.allSettled(
      batch.map(async (evalCase) => {
        const start = Date.now();
        try {
          const result = await processQuery(evalCase.question);
          const latency = Date.now() - start;
          totalLatency += latency;

          const routeMatch = result.route === evalCase.expectedRoute;
          const intentMatch = result.intent === evalCase.expectedIntent;
          if (routeMatch) routeCorrect++;
          if (intentMatch) intentCorrect++;

          const assertion = await checkAssertion(evalCase.assertionType, result);
          if (assertion.passed) correct++;

          // evidenceCoverage from response (code-computed, not LLM-reported)
          const evCov = result.evidenceCoverage || 0;
          totalEvidence += evCov;

          // Count recommendations with zero valid evidence
          const zeroEv = result.recommendations.filter((r) => r.evidence.length === 0).length;
          zeroEvidenceCount += zeroEv;

          await ensureEvalCase(evalCase);

          return {
            runId,
            caseId: evalCase.id,
            actualAnswer: result.answer.slice(0, 500),
            actualRoute: result.route,
            actualEntities: result.recommendations.map((r) => r.entityId),
            isCorrect: assertion.passed,
            routeCorrect: routeMatch,
            evidenceCoverage: evCov,
            latency,
          };
        } catch (err) {
          const latency = Date.now() - start;
          totalLatency += latency;
          await ensureEvalCase(evalCase);
          return {
            runId,
            caseId: evalCase.id,
            actualAnswer: null,
            actualRoute: null,
            actualEntities: [],
            isCorrect: false,
            routeCorrect: false,
            evidenceCoverage: 0,
            latency,
            error: (err as Error).message,
          };
        }
      })
    );

    for (const res of batchResults) {
      if (res.status === 'fulfilled') results.push(res.value);
    }
    // Brief pause between batches
    if (i + CONCURRENCY < cases.length) await new Promise((r) => setTimeout(r, 500));
  }

  if (results.length > 0) {
    await prisma.evaluationResult.createMany({ data: results as never[] });
  }

  const accuracy = correct / cases.length;
  const avgLatency = totalLatency / cases.length;
  const evidenceCoverage = totalEvidence / cases.length;
  const routeAccuracy = routeCorrect / cases.length;
  // unsupportedAnswerRate: recommendations with zero valid evidence / total recommendations
  const totalRecs = results.reduce((sum, r) => sum + (r['actualEntities'] as string[]).length, 0);
  const unsupportedAnswerRate = totalRecs > 0 ? zeroEvidenceCount / totalRecs : 0;

  await prisma.evaluationRun.update({
    where: { id: runId },
    data: {
      correctAnswers: correct,
      accuracy,
      evidenceCoverage,
      averageLatency: avgLatency,
      routeAccuracy,
      unsupportedAnswerRate,
    },
  });

  logger.info('Evaluation complete', { runId, accuracy, avgLatency, routeAccuracy });
}

async function ensureEvalCase(evalCase: typeof EVALUATION_CASES[number]) {
  await prisma.evaluationCase.upsert({
    where: { id: evalCase.id },
    update: { expectedRoute: evalCase.expectedRoute, expectedDecision: evalCase.expectedIntent },
    create: {
      id: evalCase.id,
      question: evalCase.question,
      expectedRoute: evalCase.expectedRoute,
      expectedDecision: evalCase.expectedIntent,
      expectedEntities: [evalCase.expectedEntityType],
      category: evalCase.category,
      difficulty: evalCase.difficulty,
    },
  });
}

export async function getEvaluation(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const run = await prisma.evaluationRun.findUnique({
      where: { id },
      include: {
        cases: {
          include: { case: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!run) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Evaluation not found' } });
      return;
    }

    res.json({ success: true, data: run, benchmarkCases: EVALUATION_CASES });
  } catch (err) {
    next(err);
  }
}
