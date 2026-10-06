import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Input, Label } from '@/components/ui/Field';
import { ErrorNote } from '@/components/ui/Misc';
import { signedIn } from '@/features/auth/authSlice';
import { useAppDispatch } from '@/store';
import { API_BASE } from '@/store/api';

export default function Login() {
  const dispatch = useAppDispatch();
  const [token, setToken] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = token.trim();
    if (!value) return setError('Enter the access token from your .env file.');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/leads/stats`, {
        headers: { Authorization: `Bearer ${value}` },
      });
      if (res.status === 401) {
        setError('That token was not accepted. Copy ADMIN_ACCESS_TOKEN from your .env file again.');
      } else if (!res.ok) {
        setError(`The API answered with status ${res.status}. Check the API terminal for errors.`);
      } else {
        dispatch(signedIn({ token: value, remember }));
      }
    } catch {
      setError(
        'Cannot reach the API. Start it with "npm run dev:api" and check that it listens on port 4000.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_28rem]">
      <section className="relative hidden overflow-hidden bg-ink p-12 text-paper lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2.5">
          <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
            <rect width="32" height="32" rx="8" fill="var(--paper)" opacity="0.1" />
            <path
              d="M16 5v4M16 13v6M16 23v4"
              stroke="var(--lane)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <span className="font-display text-lg font-semibold">Lead Intelligence</span>
        </div>
        <div className="max-w-xl">
          <h1 className="font-display text-5xl leading-[1.05] font-semibold text-balance text-paper">
            Find the rental companies that need you most.
          </h1>
          <p className="mt-5 max-w-md text-lg text-paper/70">
            Every score comes with the evidence behind it. What cannot be proven stays unknown.
          </p>
        </div>
        <svg viewBox="0 0 600 60" className="w-full" aria-hidden preserveAspectRatio="none">
          <line
            x1="0"
            y1="30"
            x2="600"
            y2="30"
            stroke="var(--lane)"
            strokeWidth="4"
            strokeDasharray="36 28"
          />
        </svg>
      </section>

      <main className="flex items-center justify-center px-6 py-12">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h2 className="font-display text-3xl font-semibold">Sign in</h2>
          <p className="mt-1.5 mb-6 text-sm text-ink-2">
            Use the admin access token you set in the API's .env file.
          </p>
          <div className="space-y-4">
            <div>
              <Label htmlFor="token">Access token</Label>
              <Input
                id="token"
                type="password"
                autoComplete="current-password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoFocus
              />
            </div>
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="size-4 accent-[var(--ink)]"
              />
              Remember me on this device
            </label>
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy}>
              Sign in
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
