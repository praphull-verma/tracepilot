import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Database, MessageSquare, Cpu, CheckSquare,
  BarChart3, FileText, Settings, Zap, Circle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../../api';

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/data', icon: Database, label: 'Data' },
  { path: '/ask', icon: MessageSquare, label: 'Ask TracePilot' },
  { path: '/decisions', icon: Cpu, label: 'Decisions' },
  { path: '/approvals', icon: CheckSquare, label: 'Approvals' },
  { path: '/evaluation', icon: BarChart3, label: 'Evaluation' },
  { path: '/audit', icon: FileText, label: 'Audit Trail' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: 30000,
  });

  const services = health?.services || {};
  const allOk = Object.values(services).every((s) => s === 'healthy');

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="p-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #4f8ef7, #8b5cf6)' }}>
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-white tracking-tight">TracePilot</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>AI Decision Engine</div>
          </div>
        </div>
        {health?.demoMode && (
          <div className="mt-3 px-2 py-1 rounded text-xs text-center" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
            DEMO MODE
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto scrollbar-thin">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* System Status */}
      <div className="p-4 border-t border-white/5">
        <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
          System Status
        </div>
        <div className="space-y-1.5">
          {[
            { key: 'database', label: 'Database' },
            { key: 'llm', label: 'AI Engine' },
            { key: 'vectorSearch', label: 'Vector Search' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
              <div className="flex items-center gap-1.5">
                <Circle
                  className="w-2 h-2"
                  fill={services[key] === 'healthy' ? '#10d9a0' : '#ef4444'}
                  color={services[key] === 'healthy' ? '#10d9a0' : '#ef4444'}
                />
                <span className="text-xs" style={{ color: services[key] === 'healthy' ? '#10d9a0' : '#ef4444' }}>
                  {services[key] || 'checking'}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <Circle className="w-2 h-2" fill={allOk ? '#10d9a0' : '#f59e0b'} color={allOk ? '#10d9a0' : '#f59e0b'} />
          <span className="text-xs font-medium" style={{ color: allOk ? '#10d9a0' : '#f59e0b' }}>
            {allOk ? 'All systems operational' : 'Degraded mode'}
          </span>
        </div>
      </div>
    </aside>
  );
}
