import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDataSources, uploadDataset, getLeads, getDeals, getNotes } from '../api';
import { Upload, Database, FileText, CheckCircle, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { PageHeader, LoadingSpinner, EmptyState, Badge } from '../components/ui';
import { formatDistanceToNow } from 'date-fns';

function QualityIndicator({ score }: { score: number }) {
  const color = score >= 90 ? '#10d9a0' : score >= 70 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-elevated)' }}>
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs font-medium" style={{ color }}>{score}</span>
    </div>
  );
}

export default function DataPage() {
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState('leads');
  const [dragOver, setDragOver] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ rowCount: number; qualityScore: number; preview: unknown[] } | null>(null);

  const { data: sources = [], isLoading: sourcesLoading, refetch } = useQuery({
    queryKey: ['data-sources'],
    queryFn: getDataSources,
    refetchInterval: 30000,
  });

  const { data: leadsData } = useQuery({
    queryKey: ['leads-summary'],
    queryFn: () => getLeads({ pageSize: 1 }),
  });

  const { data: dealsData } = useQuery({
    queryKey: ['deals-summary'],
    queryFn: () => getDeals({ pageSize: 1 }),
  });

  const { data: notesData } = useQuery({
    queryKey: ['notes-summary'],
    queryFn: () => getNotes({ pageSize: 1 }),
  });

  const handleUpload = async (file: File) => {
    setUploading(true);
    setUploadResult(null);
    try {
      const result = await uploadDataset(file, uploadType);
      setUploadResult(result);
      refetch();
    } catch (err) {
      alert('Upload failed: ' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  return (
    <div className="p-8 animate-fade-in">
      <PageHeader
        title="Business Data"
        subtitle="Manage and monitor all data sources used by TracePilot"
        actions={
          <button onClick={() => refetch()} className="btn-ghost">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        }
      />

      {/* Data stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total Leads', value: leadsData?.pagination?.total?.toLocaleString() || '—', color: '#4f8ef7', icon: '👥' },
          { label: 'Active Deals', value: dealsData?.pagination?.total?.toLocaleString() || '—', color: '#8b5cf6', icon: '💼' },
          { label: 'Business Notes', value: notesData?.pagination?.total?.toLocaleString() || '—', color: '#10d9a0', icon: '📝' },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className="card flex items-center gap-4">
            <div className="text-3xl">{icon}</div>
            <div>
              <div className="text-2xl font-bold" style={{ color }}>{value}</div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Upload Area */}
      <div className="card mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Upload className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-white">Upload Dataset</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
              Dataset Type
            </label>
            <select className="input-field w-full" value={uploadType} onChange={(e) => setUploadType(e.target.value)}>
              <option value="leads">Leads</option>
              <option value="customers">Customers</option>
              <option value="deals">Deals</option>
              <option value="interactions">Interactions</option>
              <option value="notes">Notes</option>
            </select>

            <div className="mt-4">
              <div
                className={`rounded-xl p-8 text-center transition-all cursor-pointer ${dragOver ? 'border-blue-400' : ''}`}
                style={{
                  border: `2px dashed ${dragOver ? '#4f8ef7' : 'var(--border)'}`,
                  background: dragOver ? 'rgba(79,142,247,0.05)' : 'var(--bg-elevated)',
                }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById('file-input')?.click()}
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Processing file...</p>
                  </div>
                ) : (
                  <>
                    <Upload className="w-8 h-8 mx-auto mb-3 text-blue-400" />
                    <p className="text-sm font-medium text-white mb-1">Drop file here or click to browse</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>CSV, XLSX up to 25MB</p>
                  </>
                )}
              </div>
              <input
                id="file-input"
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
              />
            </div>
          </div>

          {/* Upload result or instructions */}
          <div>
            {uploadResult ? (
              <div className="h-full rounded-xl p-6" style={{ background: 'var(--bg-elevated)', border: '1px solid rgba(16,217,160,0.2)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <span className="font-semibold text-white">Upload Preview</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span style={{ color: 'var(--text-muted)' }}>Rows detected</span>
                    <span className="text-white font-medium">{uploadResult.rowCount}</span>
                  </div>
                  <div className="flex justify-between text-sm items-center">
                    <span style={{ color: 'var(--text-muted)' }}>Quality score</span>
                    <QualityIndicator score={uploadResult.qualityScore} />
                  </div>
                </div>
                {uploadResult.preview && uploadResult.preview.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Preview (first row)</p>
                    <div className="rounded p-2 text-xs font-mono overflow-x-auto" style={{ background: 'var(--bg-base)', color: 'var(--text-secondary)' }}>
                      {JSON.stringify(uploadResult.preview[0], null, 2).slice(0, 300)}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full rounded-xl p-6 flex flex-col justify-center" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                <h4 className="font-medium text-white mb-3">Supported Formats</h4>
                <ul className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {[
                    '✓ CSV files with headers',
                    '✓ Excel (XLSX/XLS)',
                    '✓ Up to 25MB per file',
                    '✓ Auto schema detection',
                    '✓ Data quality scoring',
                    '✓ Duplicate detection',
                    '✓ RAG indexing for notes',
                  ].map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Data sources table */}
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-white">Data Sources</h3>
          <span className="badge badge-gray">{sources.length}</span>
        </div>

        {sourcesLoading ? (
          <div className="flex justify-center py-8"><LoadingSpinner /></div>
        ) : sources.length === 0 ? (
          <EmptyState
            title="No data sources yet"
            message="Upload a dataset or wait for the demo data to be seeded."
            icon={<FileText className="w-10 h-10 text-blue-400" />}
          />
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Dataset</th>
                  <th>Type</th>
                  <th>Rows</th>
                  <th>Quality</th>
                  <th>Duplicates</th>
                  <th>Missing</th>
                  <th>Indexed</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s: {
                  id: string;
                  name: string;
                  type: string;
                  rowCount?: number;
                  qualityScore?: number;
                  duplicates?: number;
                  missingValues?: number;
                  indexed?: boolean;
                  status: string;
                  createdAt: string;
                }) => (
                  <tr key={s.id}>
                    <td className="font-medium text-white">{s.name}</td>
                    <td><span className="badge badge-blue capitalize">{s.type}</span></td>
                    <td className="font-mono">{s.rowCount?.toLocaleString() || '—'}</td>
                    <td>{s.qualityScore != null ? <QualityIndicator score={s.qualityScore} /> : '—'}</td>
                    <td className="font-mono">{s.duplicates ?? '—'}</td>
                    <td className="font-mono">{s.missingValues ?? '—'}</td>
                    <td>
                      {s.indexed ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-yellow-400" />
                      )}
                    </td>
                    <td>
                      <span className={`badge ${s.status === 'ACTIVE' ? 'badge-green' : s.status === 'INGESTING' ? 'badge-blue' : 'badge-gray'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {formatDistanceToNow(new Date(s.createdAt), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
