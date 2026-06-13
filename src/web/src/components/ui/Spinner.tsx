import { Loader2 } from 'lucide-react';
import { cn } from './cn';

export function Spinner({ size = 14, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cn('spin text-text-muted', className)} aria-hidden />;
}
