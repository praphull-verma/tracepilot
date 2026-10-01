import { useQuery } from '@tanstack/react-query';
import { getDashboardSummary, getDashboardPipeline } from '../api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
} from 'recharts';
import {
  Users, TrendingUp, DollarSign, AlertTriangle, Clock,
  CheckCircle, Brain, Activity, Target, Layers,
} from 'lucide-react';
import { MetricCard, LoadingSpinner, ErrorBanner } from '../components/ui';

const COLORS = ['#4f8ef7', '#8b5cf6', '#10d9a0', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899'];

export default function Dashboard() {
  const { data: summary, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: getDashboardSummary,
    refetchInterval: 60000,
  });

  const { data: pipeline } = useQuery({
    queryKey: ['dashboard-pipeline'],
    queryFn: getDashboardPipeline,
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="mb-8">
          <div className="shimmer h-8 w-48 rounded mb-2" />
          <div className="shimmer h-4 w-80 rounded" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card"><div className="shimmer h-20 rounded" /></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card"><div className="shimmer h-48 rounded" /></div>
          ))}
        </div>
      </div>
    );
  }

  const pipelineData = pipeline?.byStage?.map((s: { stage: string; count: number; value: number }) => ({
    stage: s.stage.replace(/_/g, ' '),
    count: s.count,
    value: Math.round(s.value / 1000),
  })) || [];

  const sourceData = summary?.leadsBySource
    ? Object.entries(summary.leadsBySource as Record<string, number>).slice(0, 7).map(([name, value]) => ({ name, value }))
    : [];

  const statusData = summary?.leadsByStatus
    ? Object.entries(summary.leadsByStatus as Record<string, number>).map(([name, value]) => ({ name, value }))
    : [];

  const formatCurrency = (v: number) => v >= 1000000 ? `$${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`;

  return (
    <div className="p-8 animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-white">Sales Intelligence Dashboard</h1>
          <span className="badge badge-blue">Live</span>
        </div>
        <p style={{ color: 'var(--text-secondary)' }} className="text-sm">
          Real-time business data — evidence-backed insights ready for human approval
        </p>
        {error && <ErrorBanner message="Failed to load dashboard data" onRetry={() => refetch()} />}
      </div>

      {/* KPI Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <MetricCard
          label="Total Leads"
          value={summary?.totalLeads?.toLocaleString() || '—'}
          icon={<Users className="w-5 h-5" />}
          color="#4f8ef7"
          loading={isLoading}
        />
        <MetricCard
          label="Active Opportunities"
          value={summary?.activeOpportunities?.toLocaleString() || '—'}
          icon={<TrendingUp className="w-5 h-5" />}
          color="#10d9a0"
          loading={isLoading}
        />
        <MetricCard
          label="Pipeline Value"
          value={summary?.pipelineValue ? formatCurrency(summary.pipelineValue) : '—'}
          icon={<DollarSign className="w-5 h-5" />}
          color="#8b5cf6"
          loading={isLoading}
        />
        <MetricCard
          label="Needs Attention"
          value={summary?.leadsNeedingAttention?.toLocaleString() || '—'}
          subValue="Stale leads"
          icon={<AlertTriangle className="w-5 h-5" />}
          color="#f59e0b"
          loading={isLoading}
        />
        <MetricCard
          label="Pending Approvals"
          value={summary?.pendingApprovals?.toLocaleString() || '—'}
          icon={<Clock className="w-5 h-5" />}
          color="#ef4444"
          loading={isLoading}
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="AI Decisions Made"
          value={summary?.decisionsGenerated?.toLocaleString() || '0'}
          icon={<Brain className="w-5 h-5" />}
          color="#06b6d4"
        />
        <MetricCard
          label="Evidence Coverage"
          value={`${Math.round((summary?.evidenceCoverage || 0) * 100)}%`}
          icon={<CheckCircle className="w-5 h-5" />}
          color="#10d9a0"
        />
        <MetricCard
          label="Stale Records"
          value={summary?.staleRecords?.toLocaleString() || '0'}
          icon={<Activity className="w-5 h-5" />}
          color="#f59e0b"
        />
        <MetricCard
          label="Pipeline Deals"
          value={pipeline?.totalDeals?.toLocaleString() || '0'}
          icon={<Target className="w-5 h-5" />}
          color="#4f8ef7"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Pipeline by Stage */}
        <div className="card">
          <div className="flex items-center gap-2 mb-6">
            <Layers className="w-4 h-4 text-blue-400" />
            <h3 className="font-semibold text-white">Pipeline by Stage</h3>
          </div>
          {pipelineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pipelineData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="stage" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={40} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }}
                  formatter={(v: number, name: string) => [name === 'value' ? `$${v}K` : v, name === 'value' ? 'Value' : 'Count']}
                />
                <Bar dataKey="count" fill="#4f8ef7" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
              No pipeline data yet
            </div>
          )}
        </div>

        {/* Leads by Source */}
        <div className="card">
          <div className="flex items-center gap-2 mb-6">
            <Users className="w-4 h-4 text-purple-400" />
            <h3 className="font-semibold text-white">Leads by Source</h3>
          </div>
          {sourceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={sourceData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value">
                  {sourceData.map((_: unknown, idx: number) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
              No source data yet
            </div>
          )}
          {sourceData.length > 0 && (
            <div className="grid grid-cols-2 gap-1 mt-2">
              {sourceData.slice(0,6).map((d: { name: string; value: number }, idx: number) => (
                <div key={d.name} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: COLORS[idx % COLORS.length] }} />
                  <span className="truncate">{d.name}</span>
                  <span className="ml-auto font-mono">{d.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Lead Status Distribution */}
        <div className="card">
          <div className="flex items-center gap-2 mb-6">
            <Activity className="w-4 h-4 text-green-400" />
            <h3 className="font-semibold text-white">Lead Status Distribution</h3>
          </div>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={statusData} layout="vertical" margin={{ left: 10, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }}
                />
                <Bar dataKey="value" fill="#10d9a0" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
              No status data yet
            </div>
          )}
        </div>

        {/* Pipeline Value by Stage */}
        <div className="card">
          <div className="flex items-center gap-2 mb-6">
            <DollarSign className="w-4 h-4 text-yellow-400" />
            <h3 className="font-semibold text-white">Pipeline Value ($K) by Stage</h3>
          </div>
          {pipelineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={pipelineData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="valueGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="stage" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={40} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)' }}
                  formatter={(v: number) => [`$${v}K`, 'Value']}
                />
                <Area type="monotone" dataKey="value" stroke="#8b5cf6" fill="url(#valueGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>
              No value data yet
            </div>
          )}
        </div>
      </div>

      {/* System Info */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Brain className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-white">TracePilot Architecture</h3>
          <span className="badge badge-green">Active</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'SQL Analytics', icon: '🗄️', desc: 'Structured queries' },
            { label: 'RAG Retrieval', icon: '🔍', desc: 'Semantic search' },
            { label: 'Decision Engine', icon: '⚡', desc: 'Deterministic scoring' },
            { label: 'Evidence System', icon: '🔒', desc: 'Traceable claims' },
            { label: 'Human Approval', icon: '✅', desc: 'Required for all actions' },
          ].map(({ label, icon, desc }) => (
            <div key={label} className="rounded-lg p-3 text-center" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div className="text-2xl mb-1">{icon}</div>
              <div className="text-xs font-semibold text-white">{label}</div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
