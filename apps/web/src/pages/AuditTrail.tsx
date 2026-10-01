import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAuditTrail } from '../api';
import { FileText, RefreshCw, Filter } from 'lucide-react';
import { PageHeader, LoadingSpinner, EmptyState, Badge } from '../components/ui';
import { formatDistanceToNow, format } from 'date-fns';

const EVENT_COLORS: Record<string, string> = {
  QUERY_RECEIVED: 'badge-blue',
  QUERY_COMPLETED: 'badge-green',
  DECISION_APPROVED: 'badge-green',
  DECISION_REJECTED: 'badge-red',
  DECISION_REVIEW_REQUESTED: 'badge-yellow',
  TOOL_COMPLETED: 'badge-blue',
  TOOL_FAILED: 'badge-red',
  RETRIEVAL_COMPLETED: 'badge-purple',
};

export default function AuditTrail() {
  const [page, setPage] = useState(1);
  const [eventFilter, setEventFilter] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit', page, eventFilter],
    queryFn: () => getAuditTrail({ page, pageSize: 50, eventType: eventFilter || undefined }),
    refetchInterval: 15000,
  });

  const events = data?.events || [];
  const total = data?.total || 0;
  const pages = Math.ceil(total / 50);

  return (
    <div className="p-8 animate-fade-in">
      <PageHeader
        title="Audit Trail"
        subtitle="Complete history of all TracePilot actions and decisions"
        badge={`${total} events`}
        actions={
          <button onClick={() => refetch()} className="btn-ghost">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        }
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <select
          className="input-field w-48"
          value={eventFilter}
          onChange={(e) => { setEventFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Events</option>
          <option value="QUERY_RECEIVED">Query Received</option>
          <option value="QUERY_COMPLETED">Query Completed</option>
          <option value="DECISION_APPROVED">Decision Approved</option>
          <option value="DECISION_REJECTED">Decision Rejected</option>
          <option value="DECISION_REVIEW_REQUESTED">Review Requested</option>
        </select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : events.length === 0 ? (
        <EmptyState
          title="No audit events yet"
          message="TracePilot will log all decisions, approvals, and system events here."
          icon={<FileText className="w-12 h-12 text-blue-400" />}
        />
      ) : (
        <div className="card">
          <div className="space-y-0 divide-y" style={{ '--tw-divide-opacity': 1, borderColor: 'var(--border)' } as React.CSSProperties}>
            {events.map((event: {
              id: string;
              eventType: string;
              actor?: string;
              requestId?: string;
              status?: string;
              timestamp: string;
              payload?: unknown;
            }) => (
              <div key={event.id} className="flex items-start gap-4 py-4">
                <div className="shrink-0 w-32 text-xs text-right" style={{ color: 'var(--text-muted)' }}>
                  <div>{format(new Date(event.timestamp), 'HH:mm:ss')}</div>
                  <div className="mt-0.5">{formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}</div>
                </div>
                <div className="w-px self-stretch bg-white/5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`badge ${EVENT_COLORS[event.eventType] || 'badge-gray'} text-xs`}>
                      {event.eventType.replace(/_/g, ' ')}
                    </span>
                    {event.actor && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>by {event.actor}</span>
                    )}
                    {event.status && (
                      <span className={`badge text-xs ${event.status === 'APPROVED' ? 'badge-green' : event.status === 'REJECTED' ? 'badge-red' : 'badge-gray'}`}>
                        {event.status}
                      </span>
                    )}
                  </div>
                  {event.requestId && (
                    <div className="text-xs font-mono" style={{ color: '#4f8ef7' }}>
                      Request: {event.requestId.slice(0, 32)}
                    </div>
                  )}
                  {event.payload && typeof event.payload === 'object' && (
                    <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      {Object.entries(event.payload as Record<string, unknown>).slice(0, 2).map(([k, v]) => (
                        <span key={k} className="mr-3">{k}: <span style={{ color: 'var(--text-secondary)' }}>{String(v).slice(0, 50)}</span></span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost text-sm">
                Previous
              </button>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Page {page} of {pages}
              </span>
              <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page === pages} className="btn-ghost text-sm">
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
