import { useState, useEffect, useRef } from 'react';
import { LifeBuoy, X, Keyboard, FileText } from 'lucide-react';

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
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

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
      <div
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 100,
        }}
      >
        {/* Tooltip */}
        {tooltip && !open && (
          <div
            style={{
              position: 'absolute',
              bottom: 'calc(100% + 8px)',
              right: 0,
              backgroundColor: '#2a2a3a',
              border: '1px solid #3a3a4a',
              borderRadius: '8px',
              padding: '5px 10px',
              fontSize: '12px',
              fontWeight: 600,
              color: '#a1a1b5',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            Help & Shortcuts
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: '14px',
                width: 0,
                height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: '5px solid #3a3a4a',
              }}
            />
          </div>
        )}

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
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '9999px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: open ? 'rgba(99,102,241,0.15)' : 'transparent',
            border: open ? '1px solid rgba(99,102,241,0.4)' : '1px solid #2a2a3a',
            color: open ? '#6366f1' : '#6b6b80',
            cursor: 'pointer',
            transition: 'background-color 150ms ease, color 150ms ease, border-color 150ms ease',
          }}
        >
          <LifeBuoy size={18} />
        </button>
      </div>

      {/* Help panel */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            bottom: '72px',
            right: '24px',
            zIndex: 99,
            width: '280px',
            backgroundColor: '#1a1a25',
            border: '1px solid #2a2a3a',
            borderRadius: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid #2a2a3a',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <LifeBuoy size={16} color="#6366f1" />
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#e4e4ed' }}>
                Help & Shortcuts
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#6b6b80',
                borderRadius: '6px',
                transition: 'color 150ms ease',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#e4e4ed';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = '#6b6b80';
              }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Keyboard shortcuts */}
          <div style={{ padding: '12px 16px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <Keyboard size={13} color="#6b6b80" />
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#6b6b80',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                Keyboard Shortcuts
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {SHORTCUTS.map((sc, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '5px 0',
                    borderBottom: i < SHORTCUTS.length - 1 ? '1px solid rgba(42,42,58,0.6)' : undefined,
                  }}
                >
                  <span style={{ fontSize: '13px', color: '#a1a1b5' }}>{sc.description}</span>
                  <div style={{ display: 'flex', gap: '3px' }}>
                    {sc.keys.map((k, ki) => (
                      <kbd
                        key={ki}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '22px',
                          height: '20px',
                          padding: '0 5px',
                          fontSize: '11px',
                          fontWeight: 600,
                          fontFamily: 'var(--font-mono, monospace)',
                          color: '#a1a1b5',
                          backgroundColor: '#2a2a3a',
                          border: '1px solid #3a3a4a',
                          borderRadius: '4px',
                        }}
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer: Docs + version */}
          <div
            style={{
              padding: '12px 16px',
              marginTop: '8px',
              borderTop: '1px solid #2a2a3a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FileText size={13} color="#6b6b80" />
              <span style={{ fontSize: '12px', color: '#6b6b80' }}>
                Documentation
              </span>
            </div>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#3a3a4a',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              v{APP_VERSION}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
