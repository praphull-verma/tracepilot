import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { createError } from '../middleware';

export async function getLeads(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query['page'] as string || '1', 10);
    const pageSize = Math.min(parseInt(req.query['pageSize'] as string || '20', 10), 100);
    const status = req.query['status'] as string;
    const search = req.query['search'] as string;

    const where: Record<string, unknown> = {};
    if (status) where['status'] = status;
    if (search) {
      where['OR'] = [
        { name: { contains: search, mode: 'insensitive' } },
        { company: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: [{ leadScore: 'desc' }, { lastActivityAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.lead.count({ where }),
    ]);

    res.json({
      success: true,
      data: leads,
      pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
    });
  } catch (err) {
    next(err);
  }
}

export async function getLead(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const lead = await prisma.lead.findFirst({
      where: { OR: [{ id }, { externalId: id }] },
      include: {
        deals: true,
        interactions: { orderBy: { timestamp: 'desc' }, take: 20 },
        notes: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });

    if (!lead) throw createError('Lead not found', 404, 'LEAD_NOT_FOUND');
    res.json({ success: true, data: lead });
  } catch (err) {
    next(err);
  }
}

export async function getCustomers(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query['page'] as string || '1', 10);
    const pageSize = Math.min(parseInt(req.query['pageSize'] as string || '20', 10), 100);

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        orderBy: { lifetimeValue: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.customer.count(),
    ]);

    res.json({
      success: true,
      data: customers,
      pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
    });
  } catch (err) {
    next(err);
  }
}

export async function getCustomer(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const customer = await prisma.customer.findFirst({
      where: { OR: [{ id }, { externalId: id }] },
      include: {
        deals: true,
        interactions: { orderBy: { timestamp: 'desc' }, take: 20 },
        notes: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });

    if (!customer) throw createError('Customer not found', 404, 'CUSTOMER_NOT_FOUND');
    res.json({ success: true, data: customer });
  } catch (err) {
    next(err);
  }
}

export async function getDeals(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query['page'] as string || '1', 10);
    const pageSize = Math.min(parseInt(req.query['pageSize'] as string || '20', 10), 100);
    const stage = req.query['stage'] as string;

    const where: Record<string, unknown> = {};
    if (stage) where['stage'] = stage;

    const [deals, total] = await Promise.all([
      prisma.deal.findMany({
        where,
        orderBy: { value: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { lead: { select: { name: true, company: true, externalId: true } } },
      }),
      prisma.deal.count({ where }),
    ]);

    res.json({
      success: true,
      data: deals,
      pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
    });
  } catch (err) {
    next(err);
  }
}

export async function getInteractions(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query['page'] as string || '1', 10);
    const pageSize = Math.min(parseInt(req.query['pageSize'] as string || '20', 10), 100);
    const leadId = req.query['leadId'] as string;

    const where = leadId ? { leadId } : {};

    const [interactions, total] = await Promise.all([
      prisma.interaction.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.interaction.count({ where }),
    ]);

    res.json({
      success: true,
      data: interactions,
      pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
    });
  } catch (err) {
    next(err);
  }
}

export async function getNotes(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query['page'] as string || '1', 10);
    const pageSize = Math.min(parseInt(req.query['pageSize'] as string || '20', 10), 100);
    const entityId = req.query['entityId'] as string;

    const where = entityId ? { entityId } : {};

    const [notes, total] = await Promise.all([
      prisma.businessNote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.businessNote.count({ where }),
    ]);

    res.json({
      success: true,
      data: notes,
      pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
    });
  } catch (err) {
    next(err);
  }
}
