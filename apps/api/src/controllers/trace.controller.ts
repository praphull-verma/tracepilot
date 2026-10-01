import { Request, Response, NextFunction } from 'express';
import { getTrace, getAuditLog } from '../services/audit';

export async function getTraceByRequestId(req: Request, res: Response, next: NextFunction) {
  try {
    const { requestId } = req.params;
    const trace = await getTrace(requestId);
    res.json({ success: true, data: trace });
  } catch (err) {
    next(err);
  }
}

export async function getAuditTrail(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query['page'] as string || '1', 10);
    const pageSize = Math.min(parseInt(req.query['pageSize'] as string || '50', 10), 200);
    const eventType = req.query['eventType'] as string;
    const requestId = req.query['requestId'] as string;

    const result = await getAuditLog(
      { eventType, requestId },
      page,
      pageSize
    );
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}
