import { CheckCircle2, CircleAlert, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

type Tone = 'success' | 'error';
interface ToastItem {
  id: number;
  tone: Tone;
  text: string;
}

const Ctx = createContext<{ success: (t: string) => void; error: (t: string) => void } | null>(
  null,
);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (tone: Tone, text: string) => {
      const id = next.current++;
      setItems((l) => [...l.slice(-3), { id, tone, text }]);
      setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4000);
    },
    [dismiss],
  );
  const api = useMemo(
    () => ({ success: (t: string) => push('success', t), error: (t: string) => push('error', t) }),
    [push],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        role="region"
        aria-label="Notifications"
        aria-live="polite"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'dialog-in pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface p-3.5 text-sm shadow-lg shadow-ink/10',
              t.tone === 'error' ? 'border-bad/50' : 'border-line',
            )}
          >
            {t.tone === 'error' ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />
            )}
            <p className="min-w-0 flex-1">{t.text}</p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="text-ink-3 hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
