import dotenv from 'dotenv';
import path from 'path';

// Load .env from monorepo root
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
// Also try local
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL || '',
  llm: {
    provider: process.env.LLM_PROVIDER || 'mock',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'gpt-4o-mini',
    embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    embeddingDimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '1536', 10),
  },
  demoMode: process.env.DEMO_MODE === 'true' || !process.env.LLM_API_KEY,
  logLevel: process.env.LOG_LEVEL || 'info',
  uploadMaxSizeMb: parseInt(process.env.UPLOAD_MAX_SIZE_MB || '25', 10),
  vectorTopK: parseInt(process.env.VECTOR_TOP_K || '8', 10),
};
