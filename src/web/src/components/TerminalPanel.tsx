import { useEffect, useRef, useState, useCallback } from 'react';
import { Square, RefreshCw, X as XIcon, Trash2 } from 'lucide-react';
import { useAppStore } from '../stores/app';
import { parseAnsi } from '../lib/ansi';
import { IconButton, cn } from './ui';

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

  // Status indicator dot
  const statusDot = isRunning ? (
    <span className="w-2 h-2 rounded-full bg-success animate-pulse shrink-0" />
  ) : isCrashed ? (
    <span className="w-2 h-2 rounded-full bg-danger shrink-0" />
  ) : (
    <span className="w-2 h-2 rounded-full bg-text-muted shrink-0" />
  );

  const statusLabel = isRunning ? 'Running' : isCrashed ? 'Crashed' : 'Stopped';
  const statusBadgeClass = isRunning
    ? 'text-success'
    : isCrashed
      ? 'text-danger'
      : 'text-text-muted';

  return (
    <div className="flex flex-col bg-abyss overflow-hidden flex-1 min-h-0">
      {/* Control bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-surface border-b border-border-default shrink-0">
        {statusDot}

        <span className="text-[13px] font-semibold text-text-primary flex-1 min-w-0 truncate">
          {processName || processId}
        </span>

        <span
          className={cn(
            'text-[11px] font-semibold tracking-[0.05em] uppercase shrink-0',
            statusBadgeClass
          )}
        >
          {statusLabel}
        </span>

        {/* Separator */}
        <div className="w-px h-4 bg-border-default shrink-0" />

        {/* Stop button */}
        {isRunning && onStop && (
          <IconButton
            aria-label="Stop process"
            title="Stop process"
            variant="ghost"
            size="md"
            onClick={onStop}
            className="border border-border-default hover:text-warning hover:border-warning/40 hover:bg-warning/10"
          >
            <Square size={12} />
          </IconButton>
        )}

        {/* Restart button */}
        {onRestart && (
          <IconButton
            aria-label="Restart process"
            title="Restart process"
            variant="ghost"
            size="md"
            onClick={onRestart}
            className="border border-border-default hover:text-accent hover:border-accent/40 hover:bg-accent/10"
          >
            <RefreshCw size={12} />
          </IconButton>
        )}

        {/* Kill button */}
        <IconButton
          aria-label="Kill process"
          title="Kill process"
          variant="danger"
          size="md"
          onClick={handleKill}
          className="border border-border-default"
        >
          <XIcon size={12} />
        </IconButton>

        {/* Clear button */}
        <IconButton
          aria-label="Clear output"
          title="Clear output"
          variant="ghost"
          size="md"
          onClick={handleClear}
          className="border border-border-default"
        >
          <Trash2 size={12} />
        </IconButton>
      </div>

      {/* Output area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 font-mono text-[13px] leading-[1.4] text-[#cdd6f4] bg-void min-h-0"
      >
        {displayLines.length === 0 ? (
          <span className="text-text-muted">Waiting for output…</span>
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
        <div className="flex items-center justify-center px-3 py-1 bg-accent/15 border-t border-accent/20 shrink-0">
          <button
            type="button"
            onClick={() => {
              setAutoScroll(true);
              const el = scrollRef.current;
              if (el) el.scrollTop = el.scrollHeight;
            }}
            className="bg-none border-none cursor-pointer text-[11px] font-semibold text-accent tracking-[0.05em] uppercase py-0.5"
          >
            Resume auto-scroll ↓
          </button>
        </div>
      )}
    </div>
  );
}
