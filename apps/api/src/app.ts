import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import routes from './routes';
import {
  requestId,
  requestLogger,
  errorHandler,
  notFound,
} from './middleware';

const app = express();

// Security
app.use(helmet());
app.use(
  cors({
    origin: [config.frontendUrl, 'http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  })
);

// Rate limiting — applied globally here and scoped to /api in middleware
// Cast via unknown to avoid express-rate-limit@7 vs @types/express@4 signature mismatch
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
});
app.use('/api', apiLimiter as unknown as express.RequestHandler);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request tracking
app.use(requestId);
app.use(requestLogger);

// API Routes
app.use('/api', routes);

// 404 and error handling
app.use(notFound);
app.use(errorHandler);

export default app;
