import dotenv from 'dotenv';
import path from 'path';

// Load .env from monorepo root first, then local override
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();

// A real API key always wins over DEMO_MODE; mock only when provider=mock or no key present
const hasRealKey = !!process.env.LLM_API_KEY;
const isMockProvider = (process.env.LLM_PROVIDER || 'gemini') === 'mock';

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL || '',
  llm: {
    // Default to gemini; fall back to mock only when explicitly set
    provider: process.env.LLM_PROVIDER || 'gemini',
    baseUrl: process.env.LLM_BASE_URL || '',
    apiKey: process.env.LLM_API_KEY || '',
    // Gemini-first defaults; overridable via env
    model: process.env.LLM_MODEL || 'gemini-2.5-flash',
    embeddingModel: process.env.EMBEDDING_MODEL || 'gemini-embedding-001',
    embeddingDimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '768', 10),
  },
  // demoMode is true only when no real key exists or provider is explicitly 'mock'
  demoMode: !hasRealKey || isMockProvider,
  logLevel: process.env.LOG_LEVEL || 'info',
  uploadMaxSizeMb: parseInt(process.env.UPLOAD_MAX_SIZE_MB || '25', 10),
  vectorTopK: parseInt(process.env.VECTOR_TOP_K || '8', 10),
};
