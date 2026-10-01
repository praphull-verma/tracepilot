import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { queryDecision, approveDecision, rejectDecision } from '../api';
import {
  Send, Loader2, ChevronDown, ChevronUp, CheckCircle, XCircle,
  AlertTriangle, Eye, Zap, Database, Search, Brain,
  Shield, Clock, TrendingUp, FileText, Info, Star,
} from 'lucide-react';
import {
  ScoreDisplay, ActionBadge, FreshnessTag, ConfidenceBar,
  ApprovalStatusBadge, Badge,
} from '../components/ui';

const DEMO_QUESTIONS = [
  'Which 5 leads should our sales team contact today?',
  'Which high-value deals are at risk?',
  'Show leads with high engagement but no contact in the last 14 days.',
  'What objections are customers mentioning most frequently?',
  'Which customers show declining engagement?',
  'Which leads have strong buying signals in their notes?',
  'Which deals have stale information?',
  'Which opportunities should be reviewed by a manager?',
];

interface ProcessingStep {
  step: string;
  status: string;
  duration: number;
  detail: string;
  timestamp: string;
}

interface Evidence {
  id: string;
  sourceType: string;
  sourceId: string;
  field: string;
  value: string;
  explanation: string;
  freshness: string;
}

interface Recommendation {
  entityId: string;
  entityName: string;
  company?: string;
  score: number;
  rank: number;
  action: string;
  reasoning: string[];
  evidence: Evidence[];
  breakdown?: Record<string, number>;
  confidence: number;
  warnings: string[];
  conflicts: Array<{ description: string; severity: string }>;
  freshnessLevel: string;
  estimatedDealValue?: number;
  approvalStatus: string;
  decisionId?: string;
}

interface QueryResult {
  requestId: string;
  route: string;
  intent: string;
  question: string;
  answer: string;
  recommendations: Recommendation[];
  warnings: string[];
  confidence: number;
  evidenceCoverage: number;
  sqlUsed: boolean;
  ragUsed: boolean;
  retrievedNotes: number;
  candidatesAnalyzed: number;
  processingSteps: ProcessingStep[];
  demoMode: boolean;
}

const PIPELINE_STEPS = [
  { key: 'analyzing', icon: Brain, label: 'Analyzing question', color: '#4f8ef7' },
  { key: 'routing', icon: Zap, label: 'Routing query', color: '#8b5cf6' },
  { key: 'sql', icon: Database, label: 'Running SQL analytics', color: '#10d9a0' },
  { key: 'rag', icon: Search, label: 'Searching business notes', color: '#06b6d4' },
  { key: 'scoring', icon: TrendingUp, label: 'Scoring decisions', color: '#f59e0b' },
  { key: 'evidence', icon: Shield, label: 'Validating evidence', color: '#10d9a0' },
];

function PipelineAnimation({ active }: { active: boolean }) {
  const [step, setStep] = useState(0);

  useState(() => {
    if (!active) { setStep(0); return; }
    const interval = setInterval(() => {
      setStep((s) => {
        if (s >= PIPELINE_STEPS.length - 1) { clearInterval(interval); return s; }
        return s + 1;
      });
    }, 600);
    return () => clearInterval(interval);
  });

  if (!active) return null;

  return (
    <div className="card mb-6 animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
        <span className="text-sm font-medium text-white">Processing your question...</span>
      </div>
      <div className="space-y-2">
        {PIPELINE_STEPS.map((s, idx) => (
          <div key={s.key} className={`flex items-center gap-3 p-2 rounded-lg transition-all duration-300 ${idx <= step ? 'opacity-100' : 'opacity-30'}`}>
            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: idx <= step ? `${s.color}20` : 'var(--bg-elevated)', border: `1px solid ${idx <= step ? s.color : 'var(--border)'}` }}>
              {idx < step ? (
                <CheckCircle className="w-3.5 h-3.5" style={{ color: s.color }} />
              ) : idx === step ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: s.color }} />
              ) : (
                <s.icon className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
              )}
            </div>
            <span className="text-sm" style={{ color: idx <= step ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              {s.label}
            </span>
            {idx < step && (
              <span className="ml-auto badge badge-green text-xs">Done</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EvidencePanel({ evidence }: { evidence: Evidence[] }) {
  return (
    <div className="mt-3 space-y-2">
      {evidence.map((ev) => (
        <div key={ev.id} className="evidence-item">
          <div className="w-1 h-8 rounded-full shrink-0" style={{ background: 'var(--accent-primary)' }} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-semibold text-white truncate">{ev.sourceType}</span>
              <span className="badge badge-gray text-xs">{ev.sourceId}</span>
              <FreshnessTag level={ev.freshness} />
            </div>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{ev.explanation}</p>
            {ev.value && (
              <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                {ev.field}: {ev.value}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScoreBreakdownPanel({ breakdown }: { breakdown: Record<string, number> }) {
  const items = [
    { key: 'leadQuality', label: 'Lead Quality', max: 30 },
    { key: 'engagement', label: 'Engagement', max: 25 },
    { key: 'dealValue', label: 'Deal Value', max: 20 },
    { key: 'urgency', label: 'Urgency', max: 15 },
    { key: 'recency', label: 'Recency', max: 10 },
  ];

  return (
    <div className="mt-3 space-y-2">
      {items.map(({ key, label, max }) => {
        const val = breakdown[key] || 0;
        const pct = (val / max) * 100;
        return (
          <div key={key} className="flex items-center gap-3">
            <span className="text-xs w-24 shrink-0" style={{ color: 'var(--text-secondary)' }}>{label}</span>
            <div className="flex-1 progress-bar">
              <div className="progress-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <span className="text-xs font-mono w-16 text-right" style={{ color: 'var(--text-muted)' }}>
              {val.toFixed(1)} / {max}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RecommendationCard({ rec, onApprove, onReject }: {
  rec: Recommendation;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [showEvidence, setShowEvidence] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState(rec.approvalStatus);
  const [approving, setApproving] = useState(false);

  const handleApprove = async () => {
    setApproving(true);
    await onApprove();
    setApprovalStatus('APPROVED');
    setApproving(false);
  };

  const handleReject = async () => {
    setApproving(true);
    await onReject();
    setApprovalStatus('REJECTED');
    setApproving(false);
  };

  return (
    <div className="recommendation-card animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className="shrink-0">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mb-1" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: '#4f8ef7' }}>
            {rec.rank}
          </div>
        </div>
        <ScoreDisplay score={rec.score} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-white text-lg">{rec.entityName}</h3>
            {rec.company && rec.company !== rec.entityName && (
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>· {rec.company}</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ActionBadge action={rec.action} />
            <ApprovalStatusBadge status={approvalStatus} />
            <FreshnessTag level={rec.freshnessLevel} />
            {rec.estimatedDealValue && (
              <span className="badge badge-purple">${rec.estimatedDealValue.toLocaleString()}</span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Confidence</div>
          <ConfidenceBar value={rec.confidence} />
        </div>
      </div>

      {/* Reasons */}
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Why this lead?</p>
        <ul className="space-y-1">
          {rec.reasoning.slice(0, 4).map((r, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
              <CheckCircle className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
              {r}
            </li>
          ))}
        </ul>
      </div>

      {/* Warnings */}
      {(rec.warnings.length > 0 || rec.conflicts.length > 0) && (
        <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
          {rec.conflicts.map((c, idx) => (
            <div key={idx} className="flex items-start gap-2 mb-1">
              <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-xs font-semibold text-yellow-400">Data Conflict: </span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{c.description}</span>
              </div>
            </div>
          ))}
          {rec.warnings.slice(0, 2).map((w, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Expandable sections */}
      <div className="space-y-2 mb-4">
        <button
          onClick={() => setShowBreakdown(!showBreakdown)}
          className="w-full flex items-center justify-between p-2 rounded-lg text-sm transition-all"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
        >
          <span className="flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5" /> Score Breakdown</span>
          {showBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {showBreakdown && rec.breakdown && <ScoreBreakdownPanel breakdown={rec.breakdown} />}

        <button
          onClick={() => setShowEvidence(!showEvidence)}
          className="w-full flex items-center justify-between p-2 rounded-lg text-sm transition-all"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
        >
          <span className="flex items-center gap-2">
            <Eye className="w-3.5 h-3.5" /> 
            Evidence ({rec.evidence.length} items)
          </span>
          {showEvidence ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
        {showEvidence && <EvidencePanel evidence={rec.evidence} />}
      </div>

      {/* Human Approval */}
      <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-blue-400" />
          <span className="text-xs font-semibold text-white">Final action requires human approval</span>
        </div>
        {approvalStatus === 'PENDING' ? (
          <div className="flex gap-2">
            <button onClick={handleApprove} disabled={approving} className="btn-success flex-1 justify-center">
              {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Approve
            </button>
            <button onClick={handleReject} disabled={approving} className="btn-danger flex-1 justify-center">
              <XCircle className="w-4 h-4" />
              Reject
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <ApprovalStatusBadge status={approvalStatus} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Action recorded in audit trail</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TracePanel({ steps }: { steps: ProcessingStep[] }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="w-4 h-4 text-blue-400" />
        <h3 className="font-semibold text-white">Full Execution Trace</h3>
      </div>
      <div className="space-y-0">
        {steps.map((s, idx) => (
          <div key={idx} className="trace-step">
            <div className={`trace-dot ${s.status === 'SUCCESS' ? 'success' : s.status === 'ERROR' ? 'error' : 'pending'}`}>
              {s.status === 'SUCCESS' ? (
                <CheckCircle className="w-3 h-3 text-green-400" />
              ) : s.status === 'ERROR' ? (
                <XCircle className="w-3 h-3 text-red-400" />
              ) : (
                <Clock className="w-3 h-3 text-blue-400" />
              )}
            </div>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-white">{s.step}</p>
                {s.detail && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.detail}</p>
                )}
              </div>
              <div className="text-right shrink-0 ml-4">
                {s.duration > 0 && (
                  <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{s.duration}ms</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AskTracePilot() {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const [approvalStatuses, setApprovalStatuses] = useState<Record<string, string>>({});
  const resultRef = useRef<HTMLDivElement>(null);

  const mutation = useMutation({
    mutationFn: queryDecision,
    onSuccess: (data) => {
      setResult(data);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    },
  });

  const handleSubmit = (q: string) => {
    if (!q.trim() || mutation.isPending) return;
    setQuestion(q);
    setResult(null);
    mutation.mutate(q);
  };

  const handleApprove = async (decisionId: string | undefined) => {
    if (!decisionId) return;
    await approveDecision(decisionId, { approvedBy: 'Sales Rep', comment: 'Approved via Ask TracePilot' });
  };

  const handleReject = async (decisionId: string | undefined) => {
    if (!decisionId) return;
    await rejectDecision(decisionId, { rejectedBy: 'Sales Rep', comment: 'Rejected via Ask TracePilot' });
  };

  return (
    <div className="p-8 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full mb-4 text-xs font-medium" style={{ background: 'rgba(79,142,247,0.1)', color: '#4f8ef7', border: '1px solid rgba(79,142,247,0.2)' }}>
          <Zap className="w-3.5 h-3.5" />
          Evidence-backed AI Decision Engine
        </div>
        <h1 className="text-4xl font-bold text-white mb-3">Ask TracePilot</h1>
        <p className="text-lg max-w-xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
          Turn business data into evidence-backed decisions. Every recommendation is grounded in verified data.
        </p>
      </div>

      {/* Input */}
      <div className="glass-card p-6 mb-6">
        <div className="flex gap-3">
          <textarea
            id="query-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(question);
              }
            }}
            placeholder="Ask any business question... e.g. 'Which 5 leads should our sales team contact today?'"
            className="textarea-field flex-1"
            rows={3}
          />
          <button
            id="submit-query"
            onClick={() => handleSubmit(question)}
            disabled={mutation.isPending || !question.trim()}
            className="btn-primary self-end px-6"
          >
            {mutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {mutation.isPending ? 'Analyzing...' : 'Ask'}
          </button>
        </div>

        {/* Demo suggestions */}
        <div className="mt-4">
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Try these demo questions:</p>
          <div className="flex flex-wrap gap-2">
            {DEMO_QUESTIONS.slice(0, 4).map((q) => (
              <button
                key={q}
                onClick={() => handleSubmit(q)}
                className="text-xs px-3 py-1.5 rounded-full transition-all"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.borderColor = '#4f8ef7'; (e.target as HTMLElement).style.color = '#4f8ef7'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.borderColor = 'var(--border)'; (e.target as HTMLElement).style.color = 'var(--text-secondary)'; }}
              >
                {q.length > 45 ? q.slice(0, 45) + '...' : q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pipeline animation */}
      <PipelineAnimation active={mutation.isPending} />

      {/* Error */}
      {mutation.isError && (
        <div className="card mb-6" style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)' }}>
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-400 mb-1">Analysis Failed</p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {mutation.error?.message || 'Could not complete the analysis. Please check that the API server is running.'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                The trace below shows where the request failed. Try running in demo mode.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {result && (
        <div ref={resultRef} className="space-y-6 animate-fade-in">
          {/* Summary Banner */}
          <div className="card" style={{ border: '1px solid rgba(16,217,160,0.2)', background: 'rgba(16,217,160,0.03)' }}>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'rgba(16,217,160,0.15)' }}>
                <Brain className="w-5 h-5 text-green-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge variant="blue">{result.route}</Badge>
                  <Badge variant="purple">{result.intent.replace(/_/g, ' ')}</Badge>
                  {result.sqlUsed && <Badge variant="green">SQL Analytics</Badge>}
                  {result.ragUsed && <Badge variant="blue">RAG Retrieval</Badge>}
                  {result.demoMode && <Badge variant="yellow">Demo Mode</Badge>}
                </div>
                <p className="text-sm text-white font-medium mb-2">{result.answer}</p>
                <div className="flex items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Confidence:</span>
                    <ConfidenceBar value={result.confidence} />
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Evidence coverage: <span style={{ color: '#10d9a0' }}>{Math.round(result.evidenceCoverage * 100)}%</span>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Candidates: <span className="text-white">{result.candidatesAnalyzed}</span>
                  </div>
                  {result.ragUsed && (
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Notes retrieved: <span className="text-white">{result.retrievedNotes}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Trace ID</div>
                <div className="text-xs font-mono" style={{ color: '#4f8ef7' }}>{result.requestId.slice(0, 24)}</div>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div className="rounded-lg p-4" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
              {result.warnings.map((w, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-300">{w}</p>
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Star className="w-5 h-5 text-yellow-400" />
                <h2 className="text-xl font-bold text-white">
                  Top {result.recommendations.length} Recommendations
                </h2>
                <span className="badge badge-yellow">{result.recommendations.length} leads</span>
              </div>
              <div className="space-y-4">
                {result.recommendations.map((rec) => (
                  <RecommendationCard
                    key={rec.entityId}
                    rec={rec}
                    onApprove={() => handleApprove(rec.decisionId)}
                    onReject={() => handleReject(rec.decisionId)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Trace */}
          {result.processingSteps.length > 0 && (
            <TracePanel steps={result.processingSteps} />
          )}
        </div>
      )}

      {/* Empty state */}
      {!result && !mutation.isPending && (
        <div className="text-center py-16">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(79,142,247,0.1)', border: '1px solid rgba(79,142,247,0.2)' }}>
            <Brain className="w-10 h-10 text-blue-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">No decisions yet</h3>
          <p className="text-sm max-w-sm mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Ask TracePilot a business question to get evidence-backed recommendations.
          </p>
        </div>
      )}
    </div>
  );
}
