import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPendingApprovals, approveDecision, rejectDecision, requestReview } from '../api';
import { CheckCircle, XCircle, RotateCcw, Clock, Shield, Loader2 } from 'lucide-react';
import { PageHeader, LoadingSpinner, EmptyState, ConfidenceBar, ApprovalStatusBadge, ActionBadge } from '../components/ui';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';

export default function Approvals() {
  const qc = useQueryClient();
  const [processing, setProcessing] = useState<string | null>(null);

  const { data: approvals = [], isLoading, refetch } = useQuery({
    queryKey: ['approvals'],
    queryFn: getPendingApprovals,
    refetchInterval: 15000,
  });

  const handleAction = async (decisionId: string, action: 'approve' | 'reject' | 'review', comment = '') => {
    setProcessing(decisionId);
    try {
      if (action === 'approve') await approveDecision(decisionId, { approvedBy: 'Sales Manager', comment });
      else if (action === 'reject') await rejectDecision(decisionId, { rejectedBy: 'Sales Manager', comment });
      else await requestReview(decisionId, { requestedBy: 'Sales Manager', comment });
      await qc.invalidateQueries({ queryKey: ['approvals'] });
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="p-8 animate-fade-in">
      <PageHeader
        title="Approval Queue"
        subtitle="Review and approve AI-generated recommendations before action"
        badge={`${approvals.length} pending`}
        actions={
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
            <Shield className="w-3.5 h-3.5" />
            Human approval required for all actions
          </div>
        }
      />

      <div className="flex gap-3 mb-6">
        {[
          { label: 'Pending', count: approvals.length, color: '#f59e0b', active: true },
        ].map(({ label, count, color, active }) => (
          <div key={label} className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all" style={{ background: active ? `${color}20` : 'var(--bg-elevated)', color: active ? color : 'var(--text-secondary)', border: `1px solid ${active ? color : 'var(--border)'}` }}>
            {label} <span className="ml-1 font-bold">{count}</span>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : approvals.length === 0 ? (
        <EmptyState
          title="No pending approvals"
          message="All AI recommendations have been reviewed. New decisions will appear here as they're generated."
          icon={<Clock className="w-12 h-12 text-green-400" />}
        />
      ) : (
        <div className="space-y-4">
          {approvals.map((approval: {
            id: string;
            decisionId: string;
            status: string;
            createdAt: string;
            decision?: {
              id: string;
              query: string;
              entityId?: string;
              recommendation?: string;
              rationale?: string;
              confidence?: number;
              score?: number;
              evidence?: Array<{ id: string; sourceType: string; field: string; value: string; explanation: string }>;
            };
          }) => {
            const d = approval.decision;
            const isProcessing = processing === d?.id;

            return (
              <div key={approval.id} className="card" style={{ border: '1px solid rgba(245,158,11,0.15)' }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <ApprovalStatusBadge status={approval.status} />
                      {d?.recommendation && <ActionBadge action={d.recommendation} />}
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {formatDistanceToNow(new Date(approval.createdAt), { addSuffix: true })}
                      </span>
                    </div>

                    <div className="mb-2">
                      <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>Query</p>
                      <p className="text-sm text-white">{d?.query}</p>
                    </div>

                    <div className="mb-2">
                      <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>Entity</p>
                      <p className="text-sm font-medium" style={{ color: '#4f8ef7' }}>{d?.entityId}</p>
                    </div>

                    {d?.rationale && (
                      <div className="mb-3">
                        <p className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>Rationale</p>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{d.rationale}</p>
                      </div>
                    )}

                    {d?.evidence && d.evidence.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Evidence ({d.evidence.length} items)</p>
                        <div className="flex flex-wrap gap-2">
                          {d.evidence.slice(0, 4).map((ev) => (
                            <span key={ev.id} className="badge badge-blue text-xs">{ev.sourceType}: {ev.value}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 text-right">
                    {d?.confidence && (
                      <div className="mb-3">
                        <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Confidence</div>
                        <ConfidenceBar value={d.confidence} />
                      </div>
                    )}
                    {d?.score && (
                      <div className="mb-3">
                        <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Score</div>
                        <div className="text-2xl font-bold" style={{ color: '#4f8ef7' }}>{d.score.toFixed(1)}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="border-t pt-4 flex items-center gap-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-1.5 mr-auto text-xs" style={{ color: 'var(--text-muted)' }}>
                    <Shield className="w-3.5 h-3.5 text-blue-400" />
                    This action will be logged in the audit trail
                  </div>
                  <button
                    onClick={() => handleAction(d!.id, 'review', 'Needs manager review')}
                    disabled={isProcessing}
                    className="btn-ghost text-sm"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Request Review
                  </button>
                  <button
                    onClick={() => handleAction(d!.id, 'reject', 'Rejected by sales manager')}
                    disabled={isProcessing}
                    className="btn-danger text-sm"
                  >
                    {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                    Reject
                  </button>
                  <button
                    onClick={() => handleAction(d!.id, 'approve', 'Approved by sales manager')}
                    disabled={isProcessing}
                    className="btn-success text-sm"
                  >
                    {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    Approve Action
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
