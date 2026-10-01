import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    const msg = err.response?.data?.error?.message || err.message || 'Request failed';
    return Promise.reject(new Error(msg));
  }
);

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const getDashboardSummary = () => api.get('/dashboard/summary').then((r) => r.data.data);
export const getDashboardPipeline = () => api.get('/dashboard/pipeline').then((r) => r.data.data);

// ─── Health ──────────────────────────────────────────────────────────────────
export const getHealth = () => api.get('/health').then((r) => r.data);

// ─── Leads ──────────────────────────────────────────────────────────────────
export const getLeads = (params?: Record<string, unknown>) =>
  api.get('/leads', { params }).then((r) => r.data);

export const getLead = (id: string) =>
  api.get(`/leads/${id}`).then((r) => r.data.data);

// ─── Customers ──────────────────────────────────────────────────────────────
export const getCustomers = (params?: Record<string, unknown>) =>
  api.get('/customers', { params }).then((r) => r.data);

// ─── Deals ──────────────────────────────────────────────────────────────────
export const getDeals = (params?: Record<string, unknown>) =>
  api.get('/deals', { params }).then((r) => r.data);

// ─── Notes ──────────────────────────────────────────────────────────────────
export const getNotes = (params?: Record<string, unknown>) =>
  api.get('/notes', { params }).then((r) => r.data);

// ─── Decisions ──────────────────────────────────────────────────────────────
export const queryDecision = (question: string) =>
  api.post('/decisions/query', { question }).then((r) => r.data.data);

export const getDecisions = (params?: Record<string, unknown>) =>
  api.get('/decisions', { params }).then((r) => r.data);

export const getDecision = (id: string) =>
  api.get(`/decisions/${id}`).then((r) => r.data.data);

export const approveDecision = (id: string, data: { approvedBy?: string; comment?: string }) =>
  api.post(`/decisions/${id}/approve`, data).then((r) => r.data);

export const rejectDecision = (id: string, data: { rejectedBy?: string; comment?: string }) =>
  api.post(`/decisions/${id}/reject`, data).then((r) => r.data);

export const requestReview = (id: string, data: { requestedBy?: string; comment?: string }) =>
  api.post(`/decisions/${id}/review`, data).then((r) => r.data);

export const getPendingApprovals = () =>
  api.get('/approvals').then((r) => r.data.data);

// ─── Trace & Audit ──────────────────────────────────────────────────────────
export const getTrace = (requestId: string) =>
  api.get(`/traces/${requestId}`).then((r) => r.data.data);

export const getAuditTrail = (params?: Record<string, unknown>) =>
  api.get('/audit', { params }).then((r) => r.data);

// ─── Evaluation ──────────────────────────────────────────────────────────────
export const getEvaluations = () => api.get('/evaluations').then((r) => r.data);
export const runEvaluation = (name?: string) =>
  api.post('/evaluations/run', { name }).then((r) => r.data);
export const getEvaluation = (id: string) =>
  api.get(`/evaluations/${id}`).then((r) => r.data.data);

// ─── Data Sources ────────────────────────────────────────────────────────────
export const getDataSources = () => api.get('/data/sources').then((r) => r.data.data);

export const uploadDataset = (file: File, type: string) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('type', type);
  return api
    .post('/data/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data.data);
};
