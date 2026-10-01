import { Router } from 'express';
import { healthCheck } from '../controllers/health.controller';
import { getDashboard, getDashboardPipeline, getDashboardLeads } from '../controllers/dashboard.controller';
import {
  getLeads, getLead, getCustomers, getCustomer,
  getDeals, getInteractions, getNotes
} from '../controllers/data.controller';
import {
  queryDecision, getDecisions, getDecision,
  approveDecision, rejectDecision, requestReview, getPendingApprovals
} from '../controllers/decisions.controller';
import { getTraceByRequestId, getAuditTrail } from '../controllers/trace.controller';
import { getEvaluations, runEvaluation, getEvaluation } from '../controllers/evaluation.controller';
import {
  upload, uploadData, ingestData, getDataSources, getDataSource
} from '../controllers/upload.controller';

const router = Router();

// Health
router.get('/health', healthCheck);

// Dashboard
router.get('/dashboard/summary', getDashboard);
router.get('/dashboard/pipeline', getDashboardPipeline);
router.get('/dashboard/leads', getDashboardLeads);

// Data
router.get('/leads', getLeads);
router.get('/leads/:id', getLead);
router.get('/customers', getCustomers);
router.get('/customers/:id', getCustomer);
router.get('/deals', getDeals);
router.get('/interactions', getInteractions);
router.get('/notes', getNotes);

// Upload & Ingest
router.post('/data/upload', upload.single('file'), uploadData);
router.post('/data/ingest', ingestData);
router.get('/data/sources', getDataSources);
router.get('/data/sources/:id', getDataSource);

// Decisions
router.post('/decisions/query', queryDecision);
router.get('/decisions', getDecisions);
router.get('/decisions/:id', getDecision);
router.post('/decisions/:id/approve', approveDecision);
router.post('/decisions/:id/reject', rejectDecision);
router.post('/decisions/:id/review', requestReview);
router.get('/approvals', getPendingApprovals);

// Trace & Audit
router.get('/traces/:requestId', getTraceByRequestId);
router.get('/audit', getAuditTrail);

// Evaluation
router.get('/evaluations', getEvaluations);
router.post('/evaluations/run', runEvaluation);
router.get('/evaluations/:id', getEvaluation);

export default router;
