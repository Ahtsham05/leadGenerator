import * as RD from '@radix-ui/react-dialog';
import { Activity, BarChart3, LogOut, Menu, Moon, Plus, Search, Sun, Users, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { useTheme } from '@/lib/useTheme';
import { signedOut } from '@/features/auth/authSlice';
import { useAppDispatch } from '@/store';
import { AnalyzeProvider, useAnalyzeDialog } from './AnalyzeDialog';

const NAV = [
  { to: '/', label: 'Overview', icon: BarChart3, end: true },
  { to: '/leads', label: 'Leads', icon: Users, end: false },
  { to: '/system', label: 'System', icon: Activity, end: false },
] as const;

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-lg bg-ink" aria-hidden>
        <svg viewBox="0 0 32 32" className="size-6">
          <path
            d="M16 5v4M16 13v6M16 23v4"
            stroke="var(--lane)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="font-display text-[17px] leading-none font-semibold tracking-tight">
        Lead Intelligence
      </span>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'relative flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium transition-colors',
              isActive ? 'bg-track text-ink' : 'text-ink-2 hover:bg-track/60 hover:text-ink',
            )
          }
        >
          {({ isActive }) => (
            <>
              {isActive ? (
                <span
                  className="absolute top-1.5 bottom-1.5 -left-3 w-1 rounded-r bg-lane"
                  aria-hidden
                />
              ) : null}
              <Icon className="size-[18px]" aria-hidden />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function SidebarFooter() {
  const { theme, toggle } = useTheme();
  const dispatch = useAppDispatch();
  return (
    <div className="mt-auto flex flex-col gap-0.5 border-t border-line pt-3">
      <button
        type="button"
        onClick={toggle}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium text-ink-2 hover:bg-track/60 hover:text-ink"
      >
        {theme === 'dark' ? (
          <Sun className="size-[18px]" aria-hidden />
        ) : (
          <Moon className="size-[18px]" aria-hidden />
        )}
        {theme === 'dark' ? 'Light theme' : 'Dark theme'}
      </button>
      <button
        type="button"
        onClick={() => dispatch(signedOut())}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium text-ink-2 hover:bg-track/60 hover:text-ink"
      >
        <LogOut className="size-[18px]" aria-hidden />
        Sign out
      </button>
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const navigate = useNavigate();
  const { openAnalyze } = useAnalyzeDialog();
  const [q, setQ] = useState('');
  function search(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/leads?search=${encodeURIComponent(term)}` : '/leads');
  }
  return (
    <div className="sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-paper/90 px-4 py-3 backdrop-blur sm:px-8">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenu}
        aria-label="Open menu"
      >
        <Menu className="size-5" />
      </Button>
      <form onSubmit={search} role="search" className="relative max-w-md flex-1">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
          aria-hidden
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          type="search"
          aria-label="Search leads by name, city or address"
          placeholder="Search leads"
          className="h-9 w-full rounded-lg border border-line-strong bg-surface pr-3 pl-9 text-sm placeholder:text-ink-3 hover:border-ink-3 focus-visible:border-ink"
        />
      </form>
      <Button variant="accent" onClick={openAnalyze} className="ml-auto">
        <Plus className="size-4" aria-hidden />
        <span className="hidden sm:inline">Analyze website</span>
        <span className="sm:hidden">Analyze</span>
      </Button>
    </div>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  return (
    <AnalyzeProvider>
      <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)]">
        <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line bg-surface px-6 py-5 lg:flex">
          <Wordmark />
          <NavList />
          <SidebarFooter />
        </aside>

        <RD.Root open={drawer} onOpenChange={setDrawer}>
          <RD.Portal>
            <RD.Overlay className="overlay-in fixed inset-0 z-40 bg-ink/45 lg:hidden" />
            <RD.Content className="dialog-in fixed inset-y-0 left-0 z-50 flex w-72 flex-col gap-6 bg-surface px-6 py-5 lg:hidden">
              <RD.Title className="sr-only">Navigation</RD.Title>
              <RD.Description className="sr-only">Main navigation</RD.Description>
              <div className="flex items-center justify-between">
                <Wordmark />
                <RD.Close
                  aria-label="Close menu"
                  className="rounded-lg p-1.5 text-ink-3 hover:bg-track"
                >
                  <X className="size-5" />
                </RD.Close>
              </div>
              <NavList onNavigate={() => setDrawer(false)} />
              <SidebarFooter />
            </RD.Content>
          </RD.Portal>
        </RD.Root>

        <div className="min-w-0">
          <TopBar onMenu={() => setDrawer(true)} />
          <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-8 sm:py-8">
            {children ?? <Outlet />}
          </main>
        </div>
      </div>
    </AnalyzeProvider>
  );
}
