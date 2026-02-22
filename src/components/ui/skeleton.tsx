import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      role="presentation"
      className={cn('animate-shimmer rounded-lg', className)}
      {...props}
    />
  );
}

export { Skeleton };
