import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { processQuery } from '../agents/queryPipeline';
import { prisma } from '../config/database';
import { createError } from '../middleware';
import { createAuditEvent } from '../services/audit';

const QuerySchema = z.object({
  question: z.string().min(5).max(1000),
});

export async function queryDecision(req: Request, res: Response, next: NextFunction) {
  try {
    const { question } = QuerySchema.parse(req.body);
    const result = await processQuery(question);
    await createAuditEvent('QUERY_COMPLETED', 'api', {
      requestId: result.requestId,
      route: result.route,
      recommendations: result.recommendations.length,
    }, result.requestId);

    res.json({ success: true, data: result });
  } catch (err) {
    if (err instanceof z.ZodError) {
      next(createError('Invalid request body', 400, 'VALIDATION_ERROR', err.errors));
    } else {
      next(err);
    }
  }
}

export async function getDecisions(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query['page'] as string || '1', 10);
    const pageSize = Math.min(parseInt(req.query['pageSize'] as string || '20', 10), 100);

    const [decisions, total] = await Promise.all([
      prisma.decision.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { approvals: true, evidence: true },
      }),
      prisma.decision.count(),
    ]);

    res.json({
      success: true,
      data: decisions,
      pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
    });
  } catch (err) {
    next(err);
  }
}

export async function getDecision(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const decision = await prisma.decision.findUnique({
      where: { id },
      include: { approvals: true, evidence: true },
    });

    if (!decision) throw createError('Decision not found', 404, 'DECISION_NOT_FOUND');
    res.json({ success: true, data: decision });
  } catch (err) {
    next(err);
  }
}

export async function approveDecision(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { approvedBy = 'sales_rep', comment = '' } = req.body as { approvedBy?: string; comment?: string };

    const decision = await prisma.decision.findUnique({ where: { id } });
    if (!decision) throw createError('Decision not found', 404, 'DECISION_NOT_FOUND');

    const approval = await prisma.approval.updateMany({
      where: { decisionId: id, status: 'PENDING' },
      data: { status: 'APPROVED', approvedBy, comment, approvedAt: new Date() },
    });

    if (approval.count === 0) {
      // Create new approval if none exists
      await prisma.approval.create({
        data: { decisionId: id, status: 'APPROVED', approvedBy, comment, approvedAt: new Date() },
      });
    }

    await createAuditEvent('DECISION_APPROVED', approvedBy, { decisionId: id, comment }, decision.requestId, 'APPROVED');

    res.json({ success: true, message: 'Decision approved', data: { decisionId: id, status: 'APPROVED' } });
  } catch (err) {
    next(err);
  }
}

export async function rejectDecision(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { rejectedBy = 'sales_rep', comment = '' } = req.body as { rejectedBy?: string; comment?: string };

    const decision = await prisma.decision.findUnique({ where: { id } });
    if (!decision) throw createError('Decision not found', 404, 'DECISION_NOT_FOUND');

    await prisma.approval.updateMany({
      where: { decisionId: id, status: 'PENDING' },
      data: { status: 'REJECTED', approvedBy: rejectedBy, comment, approvedAt: new Date() },
    });

    await createAuditEvent('DECISION_REJECTED', rejectedBy, { decisionId: id, comment }, decision.requestId, 'REJECTED');
    res.json({ success: true, message: 'Decision rejected', data: { decisionId: id, status: 'REJECTED' } });
  } catch (err) {
    next(err);
  }
}

export async function requestReview(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const { requestedBy = 'sales_rep', comment = '' } = req.body as { requestedBy?: string; comment?: string };

    await prisma.approval.updateMany({
      where: { decisionId: id, status: 'PENDING' },
      data: { status: 'REVIEW_REQUIRED', approvedBy: requestedBy, comment },
    });

    await createAuditEvent('DECISION_REVIEW_REQUESTED', requestedBy, { decisionId: id, comment });
    res.json({ success: true, message: 'Review requested', data: { decisionId: id, status: 'REVIEW_REQUIRED' } });
  } catch (err) {
    next(err);
  }
}

export async function getPendingApprovals(req: Request, res: Response, next: NextFunction) {
  try {
    const approvals = await prisma.approval.findMany({
      where: { status: 'PENDING' },
      include: { decision: { include: { evidence: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: approvals });
  } catch (err) {
    next(err);
  }
}
