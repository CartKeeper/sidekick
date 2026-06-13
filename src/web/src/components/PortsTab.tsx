import { useEffect, useState, useCallback, useMemo } from 'react';
import { RefreshCw, X as XIcon, Search, Zap, Network } from 'lucide-react';
import { api, type PortListener } from '../api/client';
import { Button, IconButton, Input, EmptyState, Spinner, ConfirmDialog, cn } from './ui';

export function PortsTab() {
  const [listeners, setListeners] = useState<PortListener[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [busyPid, setBusyPid] = useState<number | null>(null);
  const [pendingKill, setPendingKill] = useState<{ pid: number; force: boolean } | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await api.ports.list();
      setListeners(res.listeners);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  const handleKill = (pid: number, force = false) => {
    setPendingKill({ pid, force });
  };

  const confirmKill = async () => {
    if (!pendingKill) return;
    const { pid, force } = pendingKill;
    setPendingKill(null);
    setBusyPid(pid);
    try {
      await api.ports.kill(pid, force);
      setTimeout(refresh, 400);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyPid(null);
    }
  };

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return listeners;
    return listeners.filter((l) => {
      if (String(l.pid).includes(q)) return true;
      if (l.command.toLowerCase().includes(q)) return true;
      if (l.fullCommand.toLowerCase().includes(q)) return true;
      if (l.ports.some((p) => String(p.port).includes(q))) return true;
      return false;
    });
  }, [listeners, filter]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <ConfirmDialog
        open={pendingKill !== null}
        title={pendingKill?.force ? 'Force Kill Process' : 'Kill Process'}
        message={
          pendingKill
            ? `Send ${pendingKill.force ? 'SIGKILL' : 'SIGTERM'} to PID ${pendingKill.pid}? This will terminate the process.`
            : ''
        }
        confirmLabel={pendingKill?.force ? 'Force Kill' : 'Kill Process'}
        danger
        loading={busyPid !== null}
        onConfirm={confirmKill}
        onCancel={() => setPendingKill(null)}
      />
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <h1 className="m-0 text-[20px] font-bold text-text-primary tracking-tight">Ports</h1>
        <span className="text-[12px] font-semibold text-text-muted">
          {listeners.length} listener{listeners.length === 1 ? '' : 's'}
        </span>
        <div className="flex-1" />
        <IconButton aria-label="Refresh" onClick={refresh}>
          <RefreshCw size={14} />
        </IconButton>
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search
          size={14}
          className="text-text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        />
        <input
          type="text"
          placeholder="Filter by port, PID, or command…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className={cn(
            'w-full h-9 pl-8 pr-3 text-[13px]',
            'bg-abyss text-text-primary placeholder:text-text-muted',
            'border border-border-default rounded-md',
            'outline-none focus:border-accent focus:ring-1 focus:ring-accent',
            'transition-colors duration-150',
          )}
        />
      </div>

      {error && (
        <div className="px-3 py-2.5 mb-3 border border-danger/30 rounded-md bg-danger-muted text-danger text-[13px]">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-y-auto border border-border-default rounded-[10px] bg-abyss">
        {loading && listeners.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-text-muted">
            <Spinner size={14} />
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Network}
            title={filter ? 'No listeners match your filter.' : 'No TCP listeners.'}
          />
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border-default">
                <Th>Port</Th>
                <Th>PID</Th>
                <Th>Command</Th>
                <Th>User</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.pid} className="border-b border-border-default/50">
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {l.ports.map((p) => (
                        <span
                          key={p.port}
                          className="px-2 py-0.5 text-[12px] font-semibold text-accent bg-accent-muted rounded-md tabular-nums"
                          title={`${p.address}:${p.port}`}
                        >
                          {p.port}
                        </span>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    <span className="text-text-secondary tabular-nums">{l.pid}</span>
                  </Td>
                  <Td>
                    <div className="min-w-0">
                      <div className="font-semibold text-text-primary truncate">{l.command}</div>
                      <div
                        className="text-[11px] text-text-muted mt-0.5 truncate max-w-115"
                        title={l.fullCommand}
                      >
                        {l.fullCommand}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <span className="text-text-muted">{l.user}</span>
                  </Td>
                  <Td className="text-right">
                    <div className="inline-flex gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyPid === l.pid}
                        onClick={() => handleKill(l.pid, false)}
                        className="h-6.5 px-2.5 text-[12px]"
                      >
                        <XIcon size={12} />
                        Kill
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={busyPid === l.pid}
                        onClick={() => handleKill(l.pid, true)}
                        className="h-6.5 px-2.5 text-[12px]"
                      >
                        <Zap size={12} />
                        Force
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'text-left px-3.5 py-2.5 text-[11px] font-semibold text-text-muted tracking-wider uppercase',
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cn('px-3.5 py-2.5 align-middle', className)}>{children}</td>
  );
}
