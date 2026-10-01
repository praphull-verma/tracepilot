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

// Rate limiting
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } },
  })
);

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
