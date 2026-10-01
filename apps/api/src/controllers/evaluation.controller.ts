import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { processQuery } from '../agents/queryPipeline';
import { logger } from '../utils/logger';

// Evaluation cases are predefined benchmark questions
const EVALUATION_CASES = [
  {
    id: 'EC-001',
    question: 'Which lead has the highest lead score?',
    expectedRoute: 'SQL',
    expectedEntities: ['Lead'],
    expectedFacts: ['leadScore > 80'],
    category: 'SQL_SIMPLE',
    difficulty: 'EASY',
  },
  {
    id: 'EC-002',
    question: 'Which 5 leads should our sales team contact today?',
    expectedRoute: 'HYBRID',
    expectedEntities: ['Lead'],
    expectedFacts: ['rank 1-5', 'score > 0'],
    category: 'HYBRID_RANKING',
    difficulty: 'MEDIUM',
  },
  {
    id: 'EC-003',
    question: 'What objections are customers mentioning most frequently?',
    expectedRoute: 'RAG',
    expectedEntities: ['BusinessNote'],
    expectedFacts: ['objections identified'],
    category: 'RAG_SIMPLE',
    difficulty: 'EASY',
  },
  {
    id: 'EC-004',
    question: 'How many leads are in ACTIVE status?',
    expectedRoute: 'SQL',
    expectedEntities: ['Lead'],
    expectedFacts: ['count > 0'],
    category: 'SQL_SIMPLE',
    difficulty: 'EASY',
  },
  {
    id: 'EC-005',
    question: 'Which high-value deals are at risk?',
    expectedRoute: 'HYBRID',
    expectedEntities: ['Deal'],
    expectedFacts: ['deal value > 10000', 'risk identified'],
    category: 'HYBRID_RISK',
    difficulty: 'MEDIUM',
  },
  {
    id: 'EC-006',
    question: 'Which customers show declining engagement?',
    expectedRoute: 'HYBRID',
    expectedEntities: ['Customer'],
    expectedFacts: ['engagement declining'],
    category: 'CUSTOMER_RISK',
    difficulty: 'MEDIUM',
  },
  {
    id: 'EC-007',
    question: 'Show leads with high engagement but no contact in the last 14 days.',
    expectedRoute: 'HYBRID',
    expectedEntities: ['Lead'],
    expectedFacts: ['days since contact >= 14'],
    category: 'HYBRID_FILTER',
    difficulty: 'MEDIUM',
  },
  {
    id: 'EC-008',
    question: 'What is the total pipeline value?',
    expectedRoute: 'SQL',
    expectedEntities: ['Deal'],
    expectedFacts: ['pipeline value > 0'],
    category: 'SQL_AGGREGATE',
    difficulty: 'EASY',
  },
  {
    id: 'EC-009',
    question: 'Which leads have strong buying signals in their notes?',
    expectedRoute: 'HYBRID',
    expectedEntities: ['Lead', 'BusinessNote'],
    expectedFacts: ['buying signal detected'],
    category: 'HYBRID_RAG',
    difficulty: 'HARD',
  },
  {
    id: 'EC-010',
    question: 'Which opportunities should be reviewed by a manager?',
    expectedRoute: 'HYBRID',
    expectedEntities: ['Lead', 'Deal'],
    expectedFacts: ['review required'],
    category: 'HYBRID_RISK',
    difficulty: 'MEDIUM',
  },
];

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
    const casesToRun = EVALUATION_CASES.slice(0, 10);

    const run = await prisma.evaluationRun.create({
      data: { name, totalQueries: casesToRun.length },
    });

    // Run evaluation cases asynchronously
    runEvaluationAsync(run.id, casesToRun).catch((err) => {
      logger.error('Evaluation run failed', { error: (err as Error).message });
    });

    res.json({
      success: true,
      message: 'Evaluation started',
      data: { runId: run.id, totalCases: casesToRun.length },
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

  const results = [];

  for (const evalCase of cases) {
    const start = Date.now();
    try {
      const result = await processQuery(evalCase.question);
      const latency = Date.now() - start;
      totalLatency += latency;

      const routeMatch = result.route === evalCase.expectedRoute;
      if (routeMatch) routeCorrect++;

      const isCorrect = result.recommendations.length > 0 || result.answer.length > 50;
      if (isCorrect) correct++;

      totalEvidence += result.evidenceCoverage || 0;

      // Ensure evaluation case exists
      await prisma.evaluationCase.upsert({
        where: { id: evalCase.id },
        update: {},
        create: {
          id: evalCase.id,
          question: evalCase.question,
          expectedRoute: evalCase.expectedRoute,
          expectedEntities: evalCase.expectedEntities,
          category: evalCase.category,
          difficulty: evalCase.difficulty,
        },
      });

      results.push({
        runId,
        caseId: evalCase.id,
        actualAnswer: result.answer.slice(0, 500),
        actualRoute: result.route,
        actualEntities: result.recommendations.map((r) => r.entityId),
        isCorrect,
        routeCorrect: routeMatch,
        evidenceCoverage: result.evidenceCoverage,
        latency,
      });
    } catch (err) {
      const latency = Date.now() - start;
      totalLatency += latency;

      await prisma.evaluationCase.upsert({
        where: { id: evalCase.id },
        update: {},
        create: {
          id: evalCase.id,
          question: evalCase.question,
          expectedRoute: evalCase.expectedRoute,
          expectedEntities: evalCase.expectedEntities,
          category: evalCase.category,
          difficulty: evalCase.difficulty,
        },
      });

      results.push({
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
      });
    }
  }

  await prisma.evaluationResult.createMany({ data: results });

  const accuracy = correct / cases.length;
  const avgLatency = totalLatency / cases.length;
  const evidenceCoverage = totalEvidence / cases.length;
  const routeAccuracy = routeCorrect / cases.length;

  await prisma.evaluationRun.update({
    where: { id: runId },
    data: {
      correctAnswers: correct,
      accuracy,
      evidenceCoverage,
      averageLatency: avgLatency,
      routeAccuracy,
      unsupportedAnswerRate: 1 - evidenceCoverage,
    },
  });

  logger.info('Evaluation complete', { runId, accuracy, avgLatency });
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
