import { ReactNode } from 'react';
import clsx from 'clsx';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  badge?: string;
}

export function PageHeader({ title, subtitle, actions, badge }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-8">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {badge && (
            <span className="badge badge-blue text-xs">{badge}</span>
          )}
        </div>
        {subtitle && (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  icon: ReactNode;
  trend?: { value: number; positive: boolean };
  color?: string;
  loading?: boolean;
}

export function MetricCard({ label, value, subValue, icon, trend, color = '#4f8ef7', loading }: MetricCardProps) {
  return (
    <div className="metric-card">
      <div className="absolute top-0 right-0 w-24 h-24 rounded-bl-full opacity-10" style={{ background: color }} />
      <div className="flex items-start justify-between relative">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
            {label}
          </p>
          {loading ? (
            <div className="shimmer h-8 w-20 rounded mt-1" />
          ) : (
            <p className="text-3xl font-bold" style={{ color }}>
              {value}
            </p>
          )}
          {subValue && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{subValue}</p>
          )}
          {trend && (
            <span className={clsx('text-xs font-medium', trend.positive ? 'text-green-400' : 'text-red-400')}>
              {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
            </span>
          )}
        </div>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${color}20`, color }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

interface LoadingSpinnerProps { size?: 'sm' | 'md' | 'lg'; }
export function LoadingSpinner({ size = 'md' }: LoadingSpinnerProps) {
  const s = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' }[size];
  return (
    <div className={clsx('animate-spin rounded-full border-2 border-transparent', s)}
      style={{ borderTopColor: 'var(--accent-primary)', borderRightColor: 'var(--accent-primary)' }} />
  );
}

interface EmptyStateProps { title: string; message: string; icon?: ReactNode; action?: ReactNode; }
export function EmptyState({ title, message, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {icon && <div className="mb-4 opacity-50">{icon}</div>}
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm max-w-sm mb-6" style={{ color: 'var(--text-secondary)' }}>{message}</p>
      {action}
    </div>
  );
}

interface ErrorBannerProps { message: string; onRetry?: () => void; }
export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="rounded-lg p-4 flex items-center gap-3 mb-4" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
      <span className="text-red-400 text-sm">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="ml-auto text-xs text-red-400 hover:text-red-300 underline">
          Retry
        </button>
      )}
    </div>
  );
}

interface BadgeProps { children: ReactNode; variant?: 'blue'|'green'|'yellow'|'red'|'purple'|'gray'; }
export function Badge({ children, variant = 'gray' }: BadgeProps) {
  return <span className={`badge badge-${variant}`}>{children}</span>;
}

export function FreshnessTag({ level }: { level: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    FRESH: { label: 'Fresh', cls: 'badge-green' },
    RECENT: { label: 'Recent', cls: 'badge-blue' },
    STALE: { label: 'Stale', cls: 'badge-yellow' },
    VERY_STALE: { label: 'Very Stale', cls: 'badge-red' },
    UNKNOWN: { label: 'Unknown', cls: 'badge-gray' },
  };
  const c = config[level] || config['UNKNOWN']!;
  return <span className={`badge ${c.cls}`}>{c.label}</span>;
}

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? '#10d9a0' : pct >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="progress-bar flex-1" style={{ maxWidth: 80 }}>
        <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-mono font-medium" style={{ color }}>{pct}%</span>
    </div>
  );
}

export function ActionBadge({ action }: { action: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    CONTACT_TODAY: { label: 'Contact Today', cls: 'badge-green' },
    FOLLOW_UP_SOON: { label: 'Follow Up Soon', cls: 'badge-blue' },
    NURTURE: { label: 'Nurture', cls: 'badge-purple' },
    MONITOR: { label: 'Monitor', cls: 'badge-gray' },
    LOW_PRIORITY: { label: 'Low Priority', cls: 'badge-gray' },
    REVIEW_REQUIRED: { label: 'Review Required', cls: 'badge-yellow' },
  };
  const c = map[action] || { label: action, cls: 'badge-gray' };
  return <span className={`badge ${c.cls}`}>{c.label}</span>;
}

export function ApprovalStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    PENDING: { label: 'Pending Approval', cls: 'badge-yellow' },
    APPROVED: { label: 'Approved', cls: 'badge-green' },
    REJECTED: { label: 'Rejected', cls: 'badge-red' },
    REVIEW_REQUIRED: { label: 'Review Required', cls: 'badge-purple' },
  };
  const c = map[status] || { label: status, cls: 'badge-gray' };
  return <span className={`badge ${c.cls}`}>{c.label}</span>;
}

export function Divider() {
  return <div className="border-t my-4" style={{ borderColor: 'var(--border)' }} />;
}

export function ScoreDisplay({ score, max = 100 }: { score: number; max?: number }) {
  const pct = (score / max) * 100;
  const color = pct >= 80 ? '#10d9a0' : pct >= 60 ? '#4f8ef7' : pct >= 40 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-14 h-14">
        <svg viewBox="0 0 56 56" className="w-full h-full -rotate-90">
          <circle cx="28" cy="28" r="22" fill="none" stroke="var(--bg-elevated)" strokeWidth="4" />
          <circle
            cx="28" cy="28" r="22" fill="none"
            stroke={color} strokeWidth="4"
            strokeDasharray={`${(pct / 100) * 138.2} 138.2`}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold" style={{ color }}>{Math.round(score)}</span>
        </div>
      </div>
    </div>
  );
}
