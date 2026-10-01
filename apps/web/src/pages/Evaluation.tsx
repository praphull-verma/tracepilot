import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getEvaluations, runEvaluation } from '../api';
import { Play, CheckCircle, XCircle, Clock, BarChart3, Target, Loader2 } from 'lucide-react';
import { PageHeader, LoadingSpinner, MetricCard, EmptyState, Badge } from '../components/ui';
import { formatDistanceToNow } from 'date-fns';

export default function EvaluationPage() {
  const qc = useQueryClient();
  const [runningName, setRunningName] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['evaluations'],
    queryFn: getEvaluations,
    refetchInterval: 10000,
  });

  const runMutation = useMutation({
    mutationFn: () => runEvaluation(`Eval-${new Date().toLocaleDateString()}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evaluations'] });
    },
  });

  const runs = data?.data || [];
  const totalCases = data?.cases || 10;
  const latestRun = runs[0];

  // Targets
  const TARGETS = {
    accuracy: 0.9,
    evidenceCoverage: 0.85,
    latency: 3000,
    routeAccuracy: 0.85,
  };

  const formatAccuracy = (v: number | null | undefined) =>
    v != null ? `${Math.round(v * 100)}%` : '—';

  const formatLatency = (v: number | null | undefined) =>
    v != null ? `${(v / 1000).toFixed(1)}s` : '—';

  return (
    <div className="p-8 animate-fade-in">
      <PageHeader
        title="Evaluation"
        subtitle="Benchmark TracePilot's decision quality against known test cases"
        badge={`${totalCases} test cases`}
        actions={
          <button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
            className="btn-primary"
          >
            {runMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {runMutation.isPending ? 'Running...' : 'Run Evaluation'}
          </button>
        }
      />

      {runMutation.isSuccess && (
        <div className="mb-6 p-4 rounded-lg" style={{ background: 'rgba(16,217,160,0.08)', border: '1px solid rgba(16,217,160,0.2)' }}>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <p className="text-sm text-green-400">Evaluation started. Results will update automatically in ~60 seconds.</p>
          </div>
        </div>
      )}

      {/* Latest run metrics */}
      {latestRun && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <MetricCard
            label="Answer Accuracy"
            value={formatAccuracy(latestRun.accuracy)}
            subValue={`Target: ${formatAccuracy(TARGETS.accuracy)}`}
            icon={<Target className="w-5 h-5" />}
            color={latestRun.accuracy >= TARGETS.accuracy ? '#10d9a0' : '#f59e0b'}
          />
          <MetricCard
            label="Evidence Coverage"
            value={formatAccuracy(latestRun.evidenceCoverage)}
            subValue={`Target: ${formatAccuracy(TARGETS.evidenceCoverage)}`}
            icon={<CheckCircle className="w-5 h-5" />}
            color={latestRun.evidenceCoverage >= TARGETS.evidenceCoverage ? '#10d9a0' : '#f59e0b'}
          />
          <MetricCard
            label="Route Accuracy"
            value={formatAccuracy(latestRun.routeAccuracy)}
            subValue={`Target: ${formatAccuracy(TARGETS.routeAccuracy)}`}
            icon={<BarChart3 className="w-5 h-5" />}
            color="#4f8ef7"
          />
          <MetricCard
            label="Avg Latency"
            value={formatLatency(latestRun.averageLatency)}
            subValue={`Target: <${TARGETS.latency / 1000}s`}
            icon={<Clock className="w-5 h-5" />}
            color={latestRun.averageLatency && latestRun.averageLatency < TARGETS.latency ? '#10d9a0' : '#f59e0b'}
          />
        </div>
      )}

      {/* Target vs Actual */}
      <div className="card mb-8">
        <h3 className="font-semibold text-white mb-4">Benchmark Targets vs Actual</h3>
        <div className="space-y-4">
          {[
            { label: 'Answer Accuracy', target: TARGETS.accuracy, actual: latestRun?.accuracy },
            { label: 'Evidence Coverage', target: TARGETS.evidenceCoverage, actual: latestRun?.evidenceCoverage },
            { label: 'Route Accuracy', target: TARGETS.routeAccuracy, actual: latestRun?.routeAccuracy },
          ].map(({ label, target, actual }) => {
            const pct = actual ? Math.round(actual * 100) : null;
            const targetPct = Math.round(target * 100);
            const met = pct != null && pct >= targetPct;
            return (
              <div key={label}>
                <div className="flex justify-between text-sm mb-2">
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Target: {targetPct}%
                    </span>
                    <span className="font-medium text-xs" style={{ color: met ? '#10d9a0' : pct != null ? '#f59e0b' : 'var(--text-muted)' }}>
                      Actual: {pct != null ? `${pct}%` : 'Not run'}
                    </span>
                    {pct != null && (
                      met
                        ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                        : <XCircle className="w-3.5 h-3.5 text-yellow-400" />
                    )}
                  </div>
                </div>
                <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${targetPct}%`, background: 'rgba(255,255,255,0.05)' }}
                  />
                  {pct != null && (
                    <div
                      className="absolute top-0 h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: met ? '#10d9a0' : '#f59e0b' }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
          ⚠️ Targets are aspirational benchmarks. Actual results depend on data quality and AI provider.
        </p>
      </div>

      {/* Evaluation runs history */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16"><LoadingSpinner size="lg" /></div>
      ) : runs.length === 0 ? (
        <EmptyState
          title="No evaluation runs yet"
          message="Click 'Run Evaluation' to benchmark TracePilot against the test suite."
          icon={<BarChart3 className="w-12 h-12 text-blue-400" />}
        />
      ) : (
        <div className="card">
          <h3 className="font-semibold text-white mb-4">Evaluation History</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Run Name</th>
                  <th>Cases</th>
                  <th>Accuracy</th>
                  <th>Evidence Coverage</th>
                  <th>Avg Latency</th>
                  <th>Route Accuracy</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run: {
                  id: string;
                  name: string;
                  totalQueries: number;
                  accuracy?: number;
                  evidenceCoverage?: number;
                  averageLatency?: number;
                  routeAccuracy?: number;
                  createdAt: string;
                }) => (
                  <tr key={run.id}>
                    <td className="font-medium text-white">{run.name}</td>
                    <td>{run.totalQueries}</td>
                    <td>
                      <span style={{ color: run.accuracy && run.accuracy >= 0.9 ? '#10d9a0' : '#f59e0b' }}>
                        {formatAccuracy(run.accuracy)}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: run.evidenceCoverage && run.evidenceCoverage >= 0.85 ? '#10d9a0' : '#f59e0b' }}>
                        {formatAccuracy(run.evidenceCoverage)}
                      </span>
                    </td>
                    <td className="font-mono">{formatLatency(run.averageLatency)}</td>
                    <td>{formatAccuracy(run.routeAccuracy)}</td>
                    <td style={{ color: 'var(--text-muted)' }} className="text-xs">
                      {formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
