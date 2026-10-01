import { Request, Response, NextFunction } from 'express';
import { getDashboardSummary, getPipelineSummary, getLeadStatistics } from '../services/analytics';

export async function getDashboard(req: Request, res: Response, next: NextFunction) {
  try {
    const summary = await getDashboardSummary();
    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
}

export async function getDashboardPipeline(req: Request, res: Response, next: NextFunction) {
  try {
    const pipeline = await getPipelineSummary();
    res.json({ success: true, data: pipeline });
  } catch (err) {
    next(err);
  }
}

export async function getDashboardLeads(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await getLeadStatistics();
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}
