import { useState, useEffect, useRef } from 'react';
import { HelpCircle, X, Keyboard, FileText, Copy, Check, Cpu } from 'lucide-react';
import { cn } from './ui';

const APP_VERSION = '0.1.0';

const SHORTCUTS = [
  { keys: ['⌘', 'L'], description: 'Lock vault' },
  { keys: ['⌘', 'N'], description: 'New project' },
  { keys: ['⌘', 'K'], description: 'Search secrets' },
  { keys: ['⌘', ','], description: 'Project settings' },
  { keys: ['⌘', 'E'], description: 'Export secrets' },
  { keys: ['Esc'], description: 'Close modal / clear selection' },
];

export function HelpButton() {
  const [open, setOpen] = useState(false);
  const [tooltip, setTooltip] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mcpConfig, setMcpConfig] = useState<string | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Fetch MCP config when panel opens
  useEffect(() => {
    if (!open || mcpConfig) return;
    fetch('/api/mcp-config')
      .then((r) => r.json())
      .then((data) => setMcpConfig(JSON.stringify(data, null, 2)))
      .catch(() => setMcpConfig(null));
  }, [open, mcpConfig]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleMouseEnter = () => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    tooltipTimer.current = setTimeout(() => setTooltip(true), 200);
  };

  const handleMouseLeave = () => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    tooltipTimer.current = setTimeout(() => setTooltip(false), 150);
  };

  return (
    <>
      {/* Help button */}
      <div className="fixed bottom-6 right-6 z-[100]">
        {/* Tooltip */}
        {tooltip && !open && (
          <div
            className="absolute bottom-[calc(100%+8px)] right-0 bg-surface border border-border-strong
                       rounded-lg px-2.5 py-1 text-[12px] font-semibold text-text-secondary
                       whitespace-nowrap pointer-events-none"
          >
            Help &amp; Shortcuts
            <div
              className="absolute top-full right-3.5 w-0 h-0
                         border-l-[5px] border-l-transparent
                         border-r-[5px] border-r-transparent
                         border-t-[5px] border-t-border-strong"
            />
          </div>
        )}

        {/* Bare HelpCircle icon — no filled bubble/pill, no wrapper ring (per design mandate) */}
        <button
          ref={btnRef}
          type="button"
          aria-label="Help & Shortcuts"
          onClick={() => {
            setOpen((v) => !v);
            setTooltip(false);
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center cursor-pointer bg-transparent border-none',
            'transition-colors duration-150',
            'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
            open ? 'text-accent' : 'text-text-muted hover:text-text-primary',
          )}
        >
          <HelpCircle size={18} strokeWidth={1.5} />
        </button>
      </div>

      {/* Help panel */}
      {open && (
        <div
          ref={panelRef}
          className="fixed bottom-[72px] right-6 z-[99] w-[280px] bg-surface border border-border-default
                     rounded-xl shadow-lg overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
            <div className="flex items-center gap-2">
              <HelpCircle size={16} className="text-accent" />
              <span className="text-[14px] font-semibold text-text-primary">
                Help &amp; Shortcuts
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-6 h-6 flex items-center justify-center bg-transparent border-none cursor-pointer
                         text-text-muted hover:text-text-primary rounded-md transition-colors duration-150
                         focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1"
            >
              <X size={14} />
            </button>
          </div>

          {/* Keyboard shortcuts */}
          <div className="px-4 pt-3">
            <div className="flex items-center gap-1.5 mb-2.5">
              <Keyboard size={13} className="text-text-muted" />
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">
                Keyboard Shortcuts
              </span>
            </div>
            <div className="flex flex-col gap-1">
              {SHORTCUTS.map((sc, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex items-center justify-between py-[5px]',
                    i < SHORTCUTS.length - 1 ? 'border-b border-border-default/60' : undefined,
                  )}
                >
                  <span className="text-[13px] text-text-secondary">{sc.description}</span>
                  <div className="flex gap-[3px]">
                    {sc.keys.map((k, ki) => (
                      <kbd
                        key={ki}
                        className="inline-flex items-center justify-center min-w-[22px] h-5 px-[5px]
                                   text-[11px] font-semibold font-mono text-text-secondary
                                   bg-border-default border border-border-strong rounded"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Claude / MCP Integration */}
          <div className="px-4 pt-3 border-t border-border-default">
            <div className="flex items-center gap-1.5 mb-2">
              <Cpu size={13} className="text-text-muted" />
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-[0.05em]">
                Claude / MCP Integration
              </span>
            </div>
            <p className="text-[12px] text-text-secondary mb-2 leading-[1.4]">
              Add this to your Claude config to let Claude access your projects and secrets:
            </p>
            {mcpConfig && (
              <div className="relative">
                <pre
                  className="text-[11px] font-mono text-text-secondary bg-void border border-border-default
                             rounded-lg p-2.5 m-0 overflow-x-auto leading-[1.4] whitespace-pre"
                >
                  {mcpConfig}
                </pre>
                <button
                  type="button"
                  title="Copy to clipboard"
                  onClick={() => {
                    navigator.clipboard.writeText(mcpConfig);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className={cn(
                    'absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center',
                    'bg-surface border border-border-default rounded-md cursor-pointer',
                    'transition-colors duration-150',
                    'focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-1',
                    copied ? 'text-success' : 'text-text-muted hover:text-text-primary',
                  )}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
            )}
            <p className="text-[11px] text-text-muted mt-1.5 leading-[1.4]">
              Works with Claude Code, Claude Desktop, and any MCP client.
            </p>
          </div>

          {/* Footer: version */}
          <div className="px-4 py-3 mt-2 border-t border-border-default flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <FileText size={13} className="text-text-muted" />
              <span className="text-[12px] text-text-muted">
                Documentation
              </span>
            </div>
            <span className="text-[11px] font-semibold font-mono text-border-strong">
              v{APP_VERSION}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
