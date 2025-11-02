import { cn } from '@/lib/utils';

type SpinnerSize = 'sm' | 'md' | 'lg';

const sizeStyles: Record<SpinnerSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
};

interface LoadingSpinnerProps {
  size?: SpinnerSize;
  className?: string;
}

export const LoadingSpinner = ({ size = 'md', className }: LoadingSpinnerProps) => (
  <span
    role="status"
    aria-live="polite"
    className={cn(
      'inline-flex animate-spin rounded-full border-2 border-t-primary border-muted-foreground/40',
      sizeStyles[size],
      className
    )}
  >
    <span className="sr-only">Loading…</span>
  </span>
);

export default LoadingSpinner;
