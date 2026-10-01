import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../api';
import { Settings as SettingsIcon, Info, Database, Brain, Cpu, Globe, Shield, HelpCircle } from 'lucide-react';
import { PageHeader, Badge } from '../components/ui';

export default function Settings() {
  const { data: health } = useQuery({ queryKey: ['health'], queryFn: getHealth });

  const envVars = [
    { key: 'LLM_PROVIDER', desc: 'AI provider (mock / openai-compatible)', value: health?.demoMode ? 'mock' : 'openai-compatible', public: true },
    { key: 'LLM_MODEL', desc: 'Language model name', value: 'Configured via .env', public: true },
    { key: 'DEMO_MODE', desc: 'Enable deterministic mock AI', value: health?.demoMode ? 'true' : 'false', public: true },
    { key: 'DATABASE_URL', desc: 'PostgreSQL connection string', value: '****** (hidden)', public: false },
    { key: 'LLM_API_KEY', desc: 'API key for AI provider', value: '****** (hidden)', public: false },
    { key: 'VECTOR_TOP_K', desc: 'Number of RAG results to retrieve', value: '8', public: true },
    { key: 'UPLOAD_MAX_SIZE_MB', desc: 'Max upload file size in MB', value: '25', public: true },
  ];

  return (
    <div className="p-8 animate-fade-in">
      <PageHeader
        title="Settings"
        subtitle="TracePilot configuration and system information"
      />

      {/* Demo Mode Banner */}
      {health?.demoMode && (
        <div className="card mb-6" style={{ border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.05)' }}>
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-yellow-400 mb-1">Demo Mode Active</h4>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                TracePilot is running in demo mode with a deterministic mock AI provider.
                All SQL analytics, RAG retrieval, decision scoring, evidence validation, and human approval workflows are fully functional.
                To enable real AI, set <code className="text-yellow-300">LLM_API_KEY</code> and <code className="text-yellow-300">DEMO_MODE=false</code> in your .env file.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* System Health */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-white">System Health</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {health?.services ? Object.entries(health.services).map(([key, value]) => (
            <div key={key} className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>{key}</div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: value === 'healthy' ? '#10d9a0' : '#ef4444' }} />
                <span className="text-sm font-medium" style={{ color: value === 'healthy' ? '#10d9a0' : '#ef4444' }}>
                  {String(value)}
                </span>
              </div>
            </div>
          )) : (
            <p className="text-sm col-span-4" style={{ color: 'var(--text-muted)' }}>Checking health...</p>
          )}
        </div>
      </div>

      {/* Environment Variables */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <SettingsIcon className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-white">Environment Configuration</h3>
          <span className="badge badge-yellow text-xs">Read-only — edit .env file</span>
        </div>
        <div className="space-y-2">
          {envVars.map(({ key, desc, value, public: isPub }) => (
            <div key={key} className="flex items-center gap-4 p-3 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <code className="text-xs font-mono text-blue-300 w-40 shrink-0">{key}</code>
              <span className="text-xs flex-1" style={{ color: 'var(--text-secondary)' }}>{desc}</span>
              <span className="text-xs font-mono" style={{ color: isPub ? 'var(--text-primary)' : 'var(--text-muted)' }}>{value}</span>
              {!isPub && <Shield className="w-3.5 h-3.5 text-yellow-400 shrink-0" />}
            </div>
          ))}
        </div>
      </div>

      {/* Architecture */}
      <div className="card mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Cpu className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-white">Decision Engine Configuration</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium text-white mb-3">Scoring Weights</h4>
            {[
              { label: 'Lead Quality', weight: '30%' },
              { label: 'Engagement', weight: '25%' },
              { label: 'Deal Value', weight: '20%' },
              { label: 'Urgency', weight: '15%' },
              { label: 'Recency Signal', weight: '10%' },
            ].map(({ label, weight }) => (
              <div key={label} className="flex justify-between text-sm py-1.5 border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                <span>{label}</span>
                <span className="font-mono font-medium text-white">{weight}</span>
              </div>
            ))}
          </div>
          <div>
            <h4 className="text-sm font-medium text-white mb-3">Freshness Thresholds</h4>
            {[
              { label: 'Fresh', range: '0–7 days', color: '#10d9a0' },
              { label: 'Recent', range: '8–30 days', color: '#4f8ef7' },
              { label: 'Stale', range: '31–90 days', color: '#f59e0b' },
              { label: 'Very Stale', range: '90+ days', color: '#ef4444' },
            ].map(({ label, range, color }) => (
              <div key={label} className="flex justify-between text-sm py-1.5 border-b items-center" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                </div>
                <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{range}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tech Stack */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-white">Technology Stack</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Frontend', items: ['React 18', 'TypeScript', 'Vite', 'Tailwind CSS'] },
            { label: 'Backend', items: ['Node.js', 'Express', 'TypeScript', 'Zod'] },
            { label: 'Database', items: ['PostgreSQL', 'Prisma ORM', 'pgvector', 'Indexes'] },
            { label: 'AI', items: ['OpenAI API', 'Mock Provider', 'RAG Pipeline', 'Recharts'] },
          ].map(({ label, items }) => (
            <div key={label} className="rounded-lg p-3" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>{label}</div>
              {items.map((item) => (
                <div key={item} className="text-xs py-0.5" style={{ color: 'var(--text-secondary)' }}>• {item}</div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
