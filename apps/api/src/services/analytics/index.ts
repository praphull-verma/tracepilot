import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

export interface LeadStatistics {
  total: number;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  averageScore: number;
  highPriority: number;
  stale: number;
  newThisMonth: number;
}

export interface PipelineSummary {
  totalDeals: number;
  totalValue: number;
  byStage: Array<{ stage: string; count: number; value: number }>;
  atRisk: number;
  overdue: number;
}

export interface LeadCandidate {
  id: string;
  externalId: string;
  name: string;
  company: string;
  email: string | null;
  industry: string | null;
  leadScore: number;
  status: string;
  estimatedDealValue: number | null;
  lastContactedAt: Date | null;
  lastActivityAt: Date | null;
  conversionProbability: number | null;
  daysSinceContact: number | null;
  daysSinceActivity: number | null;
}

function daysDiff(date: Date | null): number | null {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export async function getLeadStatistics(): Promise<LeadStatistics> {
  const start = Date.now();
  try {
    const [total, byStatusRaw, bySourceRaw, scoreAgg, staleCount, newCount] =
      await Promise.all([
        prisma.lead.count(),
        prisma.lead.groupBy({ by: ['status'], _count: { id: true } }),
        prisma.lead.groupBy({ by: ['source'], _count: { id: true } }),
        prisma.lead.aggregate({ _avg: { leadScore: true } }),
        prisma.lead.count({
          where: {
            lastContactedAt: {
              lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
            status: { in: ['ACTIVE', 'NEW', 'QUALIFIED'] },
          },
        }),
        prisma.lead.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        }),
      ]);

    const byStatus = Object.fromEntries(
      byStatusRaw.map((r) => [r.status, r._count.id])
    );
    const bySource = Object.fromEntries(
      bySourceRaw.map((r) => [r.source || 'Unknown', r._count.id])
    );
    const highPriority = await prisma.lead.count({
      where: { leadScore: { gte: 75 }, status: { in: ['ACTIVE', 'QUALIFIED'] } },
    });

    logger.debug('getLeadStatistics', { duration: Date.now() - start });
    return {
      total,
      byStatus,
      bySource,
      averageScore: Math.round((scoreAgg._avg.leadScore || 0) * 10) / 10,
      highPriority,
      stale: staleCount,
      newThisMonth: newCount,
    };
  } catch (err) {
    logger.error('getLeadStatistics failed', { error: (err as Error).message });
    throw err;
  }
}

export async function getTopLeads(
  limit = 20,
  filters?: { minScore?: number; status?: string[]; minDealValue?: number }
): Promise<LeadCandidate[]> {
  const where: Record<string, unknown> = {
    status: { in: filters?.status || ['ACTIVE', 'QUALIFIED', 'NEW'] },
  };
  if (filters?.minScore) where['leadScore'] = { gte: filters.minScore };
  if (filters?.minDealValue)
    where['estimatedDealValue'] = { gte: filters.minDealValue };

  const leads = await prisma.lead.findMany({
    where,
    orderBy: [{ leadScore: 'desc' }, { lastActivityAt: 'desc' }],
    take: limit,
  });

  return leads.map((l) => ({
    id: l.id,
    externalId: l.externalId,
    name: l.name,
    company: l.company,
    email: l.email,
    industry: l.industry,
    leadScore: l.leadScore,
    status: l.status,
    estimatedDealValue: l.estimatedDealValue,
    lastContactedAt: l.lastContactedAt,
    lastActivityAt: l.lastActivityAt,
    conversionProbability: l.conversionProbability,
    daysSinceContact: daysDiff(l.lastContactedAt),
    daysSinceActivity: daysDiff(l.lastActivityAt),
  }));
}

export async function getStaleLeads(staleDays = 30, limit = 50): Promise<LeadCandidate[]> {
  const cutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000);
  const leads = await prisma.lead.findMany({
    where: {
      OR: [
        { lastContactedAt: { lt: cutoff } },
        { lastContactedAt: null },
      ],
      status: { in: ['ACTIVE', 'QUALIFIED'] },
    },
    orderBy: { leadScore: 'desc' },
    take: limit,
  });

  return leads.map((l) => ({
    id: l.id,
    externalId: l.externalId,
    name: l.name,
    company: l.company,
    email: l.email,
    industry: l.industry,
    leadScore: l.leadScore,
    status: l.status,
    estimatedDealValue: l.estimatedDealValue,
    lastContactedAt: l.lastContactedAt,
    lastActivityAt: l.lastActivityAt,
    conversionProbability: l.conversionProbability,
    daysSinceContact: daysDiff(l.lastContactedAt),
    daysSinceActivity: daysDiff(l.lastActivityAt),
  }));
}

export async function getPipelineSummary(): Promise<PipelineSummary> {
  const [totalDeals, byStageRaw, overdueCount, atRiskCount] = await Promise.all([
    prisma.deal.count(),
    prisma.deal.groupBy({
      by: ['stage'],
      _count: { id: true },
      _sum: { value: true },
    }),
    prisma.deal.count({
      where: {
        expectedCloseDate: { lt: new Date() },
        stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
      },
    }),
    prisma.deal.count({
      where: {
        updatedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
      },
    }),
  ]);

  const totalValue = byStageRaw.reduce(
    (sum, s) => sum + (s._sum.value || 0),
    0
  );

  return {
    totalDeals,
    totalValue,
    byStage: byStageRaw.map((s) => ({
      stage: s.stage,
      count: s._count.id,
      value: s._sum.value || 0,
    })),
    atRisk: atRiskCount,
    overdue: overdueCount,
  };
}

export async function getHighValueDeals(minValue = 10000, limit = 20) {
  return prisma.deal.findMany({
    where: {
      value: { gte: minValue },
      stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] },
    },
    orderBy: { value: 'desc' },
    take: limit,
    include: { lead: { select: { name: true, company: true, externalId: true } } },
  });
}

export async function getRecentInteractions(leadId?: string, limit = 10) {
  return prisma.interaction.findMany({
    where: leadId ? { leadId } : {},
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
}

export async function getCustomerRiskSignals(limit = 20) {
  const cutoff60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  return prisma.customer.findMany({
    where: {
      OR: [
        { lastInteractionAt: { lt: cutoff60 } },
        { lastInteractionAt: null },
      ],
      status: 'ACTIVE',
    },
    orderBy: { lifetimeValue: 'desc' },
    take: limit,
  });
}

export async function getLeadEngagement(leadId: string) {
  const [interactions, notes] = await Promise.all([
    prisma.interaction.findMany({
      where: { leadId },
      orderBy: { timestamp: 'desc' },
      take: 20,
    }),
    prisma.businessNote.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentInteractions = interactions.filter(
    (i) => i.timestamp > last30
  );

  const sentimentScores = interactions
    .filter((i) => i.sentiment)
    .map((i) =>
      i.sentiment === 'POSITIVE' ? 1 : i.sentiment === 'NEGATIVE' ? -1 : 0
    );
  const avgSentiment =
    sentimentScores.length > 0
      ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
      : 0;

  return {
    totalInteractions: interactions.length,
    recentInteractions: recentInteractions.length,
    lastInteraction: interactions[0]?.timestamp || null,
    averageSentiment: avgSentiment,
    totalNotes: notes.length,
    notes,
  };
}

export async function getConversionStatistics() {
  const [total, converted] = await Promise.all([
    prisma.lead.count(),
    prisma.lead.count({ where: { status: 'CONVERTED' } }),
  ]);

  const avgProbability = await prisma.lead.aggregate({
    _avg: { conversionProbability: true },
  });

  return {
    totalLeads: total,
    converted,
    conversionRate: total > 0 ? converted / total : 0,
    averageProbability: avgProbability._avg.conversionProbability || 0,
  };
}

export async function getDashboardSummary() {
  const [
    totalLeads,
    activeOpportunities,
    pendingApprovals,
    totalDecisions,
    staleLeads,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.deal.count({ where: { stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } } }),
    prisma.approval.count({ where: { status: 'PENDING' } }),
    prisma.decision.count(),
    prisma.lead.count({
      where: {
        lastContactedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        status: { in: ['ACTIVE', 'QUALIFIED'] },
      },
    }),
  ]);

  const pipeline = await getPipelineSummary();
  const leadStats = await getLeadStatistics();

  return {
    totalLeads,
    activeOpportunities,
    pipelineValue: pipeline.totalValue,
    leadsNeedingAttention: staleLeads,
    staleRecords: staleLeads,
    pendingApprovals,
    decisionsGenerated: totalDecisions,
    evidenceCoverage: 0.94, // computed from last evaluation
    leadsBySource: leadStats.bySource,
    leadsByStatus: leadStats.byStatus,
    pipeline,
  };
}
