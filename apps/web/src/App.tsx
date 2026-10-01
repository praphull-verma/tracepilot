import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Sidebar from './components/ui/Sidebar';
import Dashboard from './pages/Dashboard';
import DataPage from './pages/Data';
import AskTracePilot from './pages/AskTracePilot';
import Decisions from './pages/Decisions';
import Approvals from './pages/Approvals';
import EvaluationPage from './pages/Evaluation';
import AuditTrail from './pages/AuditTrail';
import Settings from './pages/Settings';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30000 },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="main-content flex-1">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/data" element={<DataPage />} />
              <Route path="/ask" element={<AskTracePilot />} />
              <Route path="/decisions" element={<Decisions />} />
              <Route path="/approvals" element={<Approvals />} />
              <Route path="/evaluation" element={<EvaluationPage />} />
              <Route path="/audit" element={<AuditTrail />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
