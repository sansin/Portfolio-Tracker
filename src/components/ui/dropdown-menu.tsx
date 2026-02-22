'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface DropdownMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export function DropdownMenu({ trigger, children, align = 'right', className }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1 min-w-[180px] rounded-lg border border-zinc-800 bg-zinc-900 py-1 shadow-xl animate-in fade-in slide-in-from-top-1 duration-150',
            align === 'right' ? 'right-0' : 'left-0',
            className
          )}
        >
          {React.Children.map(children, (child) =>
            React.isValidElement(child)
              ? React.cloneElement(child as React.ReactElement<{ onClick?: () => void }>, {
                  onClick: () => {
                    (child.props as { onClick?: () => void }).onClick?.();
                    setOpen(false);
                  },
                })
              : child
          )}
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps extends React.HTMLAttributes<HTMLButtonElement> {
  destructive?: boolean;
}

export function DropdownItem({ className, destructive, ...props }: DropdownItemProps) {
  return (
    <button
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors text-left',
        destructive
          ? 'text-red-400 hover:bg-red-500/10'
          : 'text-zinc-300 hover:bg-zinc-800',
        className
      )}
      {...props}
    />
  );
}
