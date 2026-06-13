import { useEffect, useState, useCallback, useMemo } from 'react';
import { RefreshCw, X as XIcon, Search, Zap } from 'lucide-react';
import { api, type PortListener } from '../api/client';

export function PortsTab() {
  const [listeners, setListeners] = useState<PortListener[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [busyPid, setBusyPid] = useState<number | null>(null);

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

  const handleKill = async (pid: number, force = false) => {
    const ok = window.confirm(
      `${force ? 'Force kill' : 'Kill'} PID ${pid}?\n\nThis will send ${force ? 'SIGKILL' : 'SIGTERM'} to the process.`
    );
    if (!ok) return;
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: 700,
            color: '#e4e4ed',
            letterSpacing: '-0.01em',
          }}
        >
          Ports
        </h1>
        <span style={{ fontSize: '12px', color: '#6b6b80', fontWeight: 600 }}>
          {listeners.length} listener{listeners.length === 1 ? '' : 's'}
        </span>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={refresh}
          title="Refresh"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            border: '1px solid #2a2a3a',
            backgroundColor: 'transparent',
            color: '#a1a1b5',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Search */}
      <div
        style={{
          position: 'relative',
          marginBottom: '12px',
        }}
      >
        <Search
          size={14}
          color="#6b6b80"
          style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}
        />
        <input
          type="text"
          placeholder="Filter by port, PID, or command…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            width: '100%',
            height: '36px',
            padding: '0 12px 0 34px',
            fontSize: '13px',
            color: '#e4e4ed',
            backgroundColor: '#12121a',
            border: '1px solid #2a2a3a',
            borderRadius: '8px',
            outline: 'none',
          }}
        />
      </div>

      {error && (
        <div
          style={{
            padding: '10px 12px',
            marginBottom: '12px',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '8px',
            backgroundColor: 'rgba(239,68,68,0.08)',
            color: '#ef4444',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      {/* Table */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          border: '1px solid #2a2a3a',
          borderRadius: '10px',
          backgroundColor: '#12121a',
        }}
      >
        {loading && listeners.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#6b6b80', fontSize: '13px' }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#6b6b80', fontSize: '13px' }}>
            {filter ? 'No listeners match your filter.' : 'No TCP listeners.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2a2a3a' }}>
                <Th>Port</Th>
                <Th>PID</Th>
                <Th>Command</Th>
                <Th>User</Th>
                <Th style={{ textAlign: 'right' }}>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.pid} style={{ borderBottom: '1px solid #1e1e2a' }}>
                  <Td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {l.ports.map((p) => (
                        <span
                          key={p.port}
                          style={{
                            padding: '2px 8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: '#a5b4fc',
                            backgroundColor: 'rgba(99,102,241,0.12)',
                            borderRadius: '6px',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                          title={`${p.address}:${p.port}`}
                        >
                          {p.port}
                        </span>
                      ))}
                    </div>
                  </Td>
                  <Td>
                    <span style={{ color: '#a1a1b5', fontVariantNumeric: 'tabular-nums' }}>{l.pid}</span>
                  </Td>
                  <Td>
                    <div style={{ color: '#e4e4ed', fontWeight: 600 }}>{l.command}</div>
                    <div
                      style={{
                        color: '#6b6b80',
                        fontSize: '11px',
                        marginTop: '2px',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '460px',
                      }}
                      title={l.fullCommand}
                    >
                      {l.fullCommand}
                    </div>
                  </Td>
                  <Td>
                    <span style={{ color: '#6b6b80' }}>{l.user}</span>
                  </Td>
                  <Td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '6px' }}>
                      <KillButton
                        label="Kill"
                        icon={<XIcon size={12} />}
                        disabled={busyPid === l.pid}
                        onClick={() => handleKill(l.pid, false)}
                      />
                      <KillButton
                        label="Force"
                        icon={<Zap size={12} />}
                        disabled={busyPid === l.pid}
                        variant="danger"
                        onClick={() => handleKill(l.pid, true)}
                      />
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

function Th({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <th
      style={{
        textAlign: 'left',
        padding: '10px 14px',
        fontSize: '11px',
        fontWeight: 600,
        color: '#6b6b80',
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        ...style,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <td style={{ padding: '10px 14px', verticalAlign: 'middle', ...style }}>{children}</td>
  );
}

function KillButton({
  label,
  icon,
  onClick,
  disabled,
  variant = 'default',
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger';
}) {
  const color = variant === 'danger' ? '#ef4444' : '#a1a1b5';
  const border = variant === 'danger' ? 'rgba(239,68,68,0.3)' : '#2a2a3a';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        height: '26px',
        padding: '0 10px',
        fontSize: '12px',
        fontWeight: 600,
        color,
        backgroundColor: 'transparent',
        border: `1px solid ${border}`,
        borderRadius: '6px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {icon}
      {label}
    </button>
  );
}
