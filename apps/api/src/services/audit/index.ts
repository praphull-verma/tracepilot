import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

export type TraceEventType =
  | 'QUERY_RECEIVED'
  | 'INTENT_DETECTED'
  | 'ROUTE_SELECTED'
  | 'TOOL_STARTED'
  | 'TOOL_COMPLETED'
  | 'TOOL_FAILED'
  | 'RETRIEVAL_STARTED'
  | 'RETRIEVAL_COMPLETED'
  | 'ANALYSIS_STARTED'
  | 'ANALYSIS_COMPLETED'
  | 'DECISION_CREATED'
  | 'EVIDENCE_VALIDATED'
  | 'WARNING_CREATED'
  | 'RECOMMENDATION_CREATED'
  | 'APPROVAL_REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'ERROR';

export interface TraceEventData {
  requestId: string;
  eventType: TraceEventType;
  component?: string;
  input?: unknown;
  output?: unknown;
  duration?: number;
  status?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export async function createTraceEvent(data: TraceEventData): Promise<void> {
  try {
    await prisma.traceEvent.create({
      data: {
        requestId: data.requestId,
        eventType: data.eventType,
        component: data.component,
        input: data.input as never,
        output: data.output as never,
        duration: data.duration,
        status: data.status || 'SUCCESS',
        error: data.error,
        metadata: data.metadata as never,
      },
    });
  } catch (err) {
    logger.error('Failed to create trace event', { error: (err as Error).message });
  }
}

export async function getTrace(requestId: string) {
  return prisma.traceEvent.findMany({
    where: { requestId },
    orderBy: { timestamp: 'asc' },
  });
}

export async function createAuditEvent(
  eventType: string,
  actor: string,
  payload: unknown,
  requestId?: string,
  status?: string
): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        requestId,
        eventType,
        actor,
        payload: payload as never,
        status,
      },
    });
  } catch (err) {
    logger.error('Failed to create audit event', { error: (err as Error).message });
  }
}

export async function getAuditLog(
  filters?: {
    startDate?: Date;
    endDate?: Date;
    eventType?: string;
    requestId?: string;
  },
  page = 1,
  pageSize = 50
) {
  const where: Record<string, unknown> = {};
  if (filters?.eventType) where['eventType'] = filters.eventType;
  if (filters?.requestId) where['requestId'] = filters.requestId;
  if (filters?.startDate || filters?.endDate) {
    where['timestamp'] = {
      ...(filters.startDate ? { gte: filters.startDate } : {}),
      ...(filters.endDate ? { lte: filters.endDate } : {}),
    };
  }

  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditEvent.count({ where }),
  ]);

  return { events, total, page, pageSize };
}
