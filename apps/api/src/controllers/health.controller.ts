import { Request, Response, NextFunction } from 'express';
import { checkDatabaseConnection } from '../config/database';
import { getLLMProvider } from '../services/ai';
import { config } from '../config';

export async function healthCheck(req: Request, res: Response, next: NextFunction) {
  try {
    const dbHealthy = await checkDatabaseConnection();
    let llmHealthy = false;
    
    try {
      const provider = getLLMProvider();
      await provider.embed('health check');
      llmHealthy = true;
    } catch {
      llmHealthy = config.demoMode; // mock is always healthy
    }

    const status = dbHealthy ? 'ok' : 'degraded';
    
    res.status(dbHealthy ? 200 : 503).json({
      success: true,
      status,
      version: '1.0.0',
      demoMode: config.demoMode,
      services: {
        database: dbHealthy ? 'healthy' : 'unhealthy',
        llm: llmHealthy ? 'healthy' : 'unavailable',
        embeddings: llmHealthy ? 'healthy' : 'unavailable',
        vectorSearch: dbHealthy ? 'healthy' : 'unavailable',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
}
