import { useEffect, useRef, useState, useCallback } from 'react';
import { Square, RefreshCw, X as XIcon, Trash2 } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { parseAnsi } from '../lib/ansi';

interface TerminalPanelProps {
  processId: string;
  processName?: string;
  projectId?: string;
  onStop?: () => void;
  onRestart?: () => void;
  onKill?: () => void;
}

function AnsiLine({ text }: { text: string }) {
  const segments = parseAnsi(text);
  return (
    <span>
      {segments.map((seg, i) => (
        <span
          key={i}
          style={{
            color: seg.color,
            fontWeight: seg.bold ? 700 : undefined,
          }}
        >
          {seg.text}
        </span>
      ))}
    </span>
  );
}

export function TerminalPanel({
  processId,
  processName,
  projectId,
  onStop,
  onRestart,
  onKill,
}: TerminalPanelProps) {
  const { processOutput, runningProcesses, killProcess } = useAppStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [localOutput, setLocalOutput] = useState<string[]>([]);

  // Get output lines from store
  const outputLines = processOutput.get(processId) || [];

  // Merge stored output with any local cleared state
  const displayLines = localOutput.length > 0 ? localOutput : outputLines;

  // Find process status
  const process = runningProcesses.find((p) => p.id === processId);
  const isRunning = process ? process.status !== 'stopped' && process.status !== 'crashed' && process.status !== 'killed' : false;
  const isCrashed = process?.status === 'crashed';

  // Auto-scroll when new output arrives, unless user scrolled up
  useEffect(() => {
    if (!autoScroll) return;
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [displayLines.length, autoScroll]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  const handleClear = () => {
    // We capture a local cleared state — store keeps its data
    setLocalOutput(['']);
  };

  const handleKill = () => {
    if (onKill) {
      onKill();
    } else {
      killProcess(processId);
    }
  };

  // Status indicator
  const statusDot = isRunning ? (
    <span
      style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '9999px',
        backgroundColor: '#a6e3a1',
        boxShadow: '0 0 6px #a6e3a1',
        animation: 'pulse 2s ease-in-out infinite',
        flexShrink: 0,
      }}
    />
  ) : isCrashed ? (
    <span
      style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '9999px',
        backgroundColor: '#f38ba8',
        flexShrink: 0,
      }}
    />
  ) : (
    <span
      style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '9999px',
        backgroundColor: '#585b70',
        flexShrink: 0,
      }}
    />
  );

  const statusLabel = isRunning ? 'Running' : isCrashed ? 'Crashed' : 'Stopped';
  const statusColor = isRunning ? '#a6e3a1' : isCrashed ? '#f38ba8' : '#585b70';

  const btnBase: React.CSSProperties = {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    border: '1px solid #2a2a3a',
    borderRadius: '8px',
    cursor: 'pointer',
    color: '#6b6b80',
    transition: 'color 150ms ease, border-color 150ms ease, background-color 150ms ease',
    flexShrink: 0,
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0d0d14',
        border: '1px solid #2a2a3a',
        borderRadius: '12px',
        overflow: 'hidden',
        minHeight: '200px',
      }}
    >
      {/* Control bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          backgroundColor: '#12121a',
          borderBottom: '1px solid #2a2a3a',
          flexShrink: 0,
        }}
      >
        {statusDot}

        <span
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: '#e4e4ed',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {processName || processId}
        </span>

        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: statusColor,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
        >
          {statusLabel}
        </span>

        {/* Separator */}
        <div style={{ width: '1px', height: '16px', backgroundColor: '#2a2a3a', flexShrink: 0 }} />

        {/* Stop button */}
        {isRunning && onStop && (
          <button
            type="button"
            title="Stop process"
            onClick={onStop}
            style={btnBase}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.color = '#f9e2af';
              el.style.borderColor = 'rgba(249,226,175,0.4)';
              el.style.backgroundColor = 'rgba(249,226,175,0.08)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.color = '#6b6b80';
              el.style.borderColor = '#2a2a3a';
              el.style.backgroundColor = 'transparent';
            }}
          >
            <Square size={12} />
          </button>
        )}

        {/* Restart button */}
        {onRestart && (
          <button
            type="button"
            title="Restart process"
            onClick={onRestart}
            style={btnBase}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.color = '#89b4fa';
              el.style.borderColor = 'rgba(137,180,250,0.4)';
              el.style.backgroundColor = 'rgba(137,180,250,0.08)';
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement;
              el.style.color = '#6b6b80';
              el.style.borderColor = '#2a2a3a';
              el.style.backgroundColor = 'transparent';
            }}
          >
            <RefreshCw size={12} />
          </button>
        )}

        {/* Kill button */}
        <button
          type="button"
          title="Kill process"
          onClick={handleKill}
          style={btnBase}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.color = '#f38ba8';
            el.style.borderColor = 'rgba(243,139,168,0.4)';
            el.style.backgroundColor = 'rgba(243,139,168,0.08)';
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.color = '#6b6b80';
            el.style.borderColor = '#2a2a3a';
            el.style.backgroundColor = 'transparent';
          }}
        >
          <XIcon size={12} />
        </button>

        {/* Clear button */}
        <button
          type="button"
          title="Clear output"
          onClick={handleClear}
          style={btnBase}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.color = '#e4e4ed';
            el.style.borderColor = '#3a3a4a';
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLButtonElement;
            el.style.color = '#6b6b80';
            el.style.borderColor = '#2a2a3a';
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Output area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px',
          fontFamily: 'JetBrains Mono, SF Mono, ui-monospace, monospace',
          fontSize: '13px',
          lineHeight: 1.4,
          color: '#cdd6f4',
          backgroundColor: '#0a0a0f',
          minHeight: '160px',
          maxHeight: '400px',
        }}
      >
        {displayLines.length === 0 ? (
          <span style={{ color: '#585b70' }}>Waiting for output…</span>
        ) : (
          displayLines.map((line, i) => (
            <div key={i} style={{ minHeight: '1em' }}>
              <AnsiLine text={line} />
            </div>
          ))
        )}
      </div>

      {/* Auto-scroll paused indicator */}
      {!autoScroll && displayLines.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4px 12px',
            backgroundColor: 'rgba(99,102,241,0.15)',
            borderTop: '1px solid rgba(99,102,241,0.2)',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            onClick={() => {
              setAutoScroll(true);
              const el = scrollRef.current;
              if (el) el.scrollTop = el.scrollHeight;
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              color: '#89b4fa',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              padding: '2px 0',
            }}
          >
            Resume auto-scroll ↓
          </button>
        </div>
      )}

      {/* Pulse animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
