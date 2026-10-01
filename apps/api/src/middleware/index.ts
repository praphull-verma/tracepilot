import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export function requestId(req: Request, res: Response, next: NextFunction) {
  req.headers['x-request-id'] = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-Id', req.headers['x-request-id']);
  next();
}

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const requestId = req.headers['x-request-id'];

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP request', {
      requestId,
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration,
    });
  });

  next();
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = req.headers['x-request-id'] as string;
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';

  logger.error('Request error', {
    requestId,
    code,
    message: err.message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message:
        statusCode === 500
          ? 'An internal error occurred'
          : err.message,
      details: err.details,
      requestId,
    },
  });
}

export function notFound(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.url} not found`,
    },
  });
}

export function createError(
  message: string,
  statusCode: number,
  code: string,
  details?: unknown
): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  err.details = details;
  return err;
}
