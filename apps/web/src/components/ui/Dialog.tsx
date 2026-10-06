import * as RD from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export const Dialog = RD.Root;
export const DialogTrigger = RD.Trigger;
export const DialogClose = RD.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <RD.Portal>
      <RD.Overlay className="overlay-in fixed inset-0 z-50 bg-ink/45 backdrop-blur-[2px]" />
      <RD.Content
        className={cn(
          'dialog-in fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-6 shadow-2xl shadow-ink/20',
          className,
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <RD.Title className="font-display text-xl font-semibold">{title}</RD.Title>
            {description ? (
              <RD.Description className="mt-1 text-sm text-ink-2">{description}</RD.Description>
            ) : (
              <RD.Description className="sr-only">{title}</RD.Description>
            )}
          </div>
          <RD.Close
            aria-label="Close"
            className="-mt-1 -mr-1 rounded-lg p-1.5 text-ink-3 hover:bg-track hover:text-ink"
          >
            <X className="size-5" />
          </RD.Close>
        </div>
        {children}
      </RD.Content>
    </RD.Portal>
  );
}
