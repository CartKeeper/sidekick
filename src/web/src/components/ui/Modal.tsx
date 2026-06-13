import { useEffect, useRef } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';
import { cn } from './cn';

type Size = 'sm' | 'md' | 'lg';
const SIZE: Record<Size, string> = { sm: 'max-w-lg', md: 'max-w-2xl', lg: 'max-w-4xl' };

interface ModalProps {
  open: boolean;
  onClose: () => void;
  size?: Size;
  labelledBy?: string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, size = 'sm', labelledBy, children }: ModalProps) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') trapFocus(e, ref.current);
    };
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            className={cn(
              'w-full bg-surface border border-border-default rounded-xl shadow-lg',
              'flex flex-col max-h-[85vh] overflow-hidden [overscroll-behavior:contain]',
              SIZE[size],
            )}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

Modal.Header = function Header({ title, onClose, id }: { title: string; onClose: () => void; id?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 h-14 border-b border-border-default shrink-0">
      <h2 id={id} className="text-[16px] font-semibold text-text-primary truncate text-balance">{title}</h2>
      <IconButton aria-label="Close dialog" onClick={onClose}><X size={16} /></IconButton>
    </div>
  );
};

Modal.Body = function Body({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('px-5 py-4 overflow-y-auto [overscroll-behavior:contain]', className)}>{children}</div>;
};

Modal.Footer = function Footer({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-end gap-2 px-5 h-16 border-t border-border-default shrink-0">{children}</div>;
};

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';

function trapFocus(e: KeyboardEvent, container: HTMLElement | null) {
  if (!container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
