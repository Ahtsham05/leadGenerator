import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Skeleton } from '@/components/ui/Misc';
import { ToastProvider } from '@/components/ui/Toast';
import { useAppSelector } from '@/store';
import Login from '@/pages/Login';
import Overview from '@/pages/Overview';
import Leads from '@/pages/Leads';
import NotFound from '@/pages/NotFound';

// The detail page carries the most code; load it when someone opens a lead.
const LeadDetail = lazy(() => import('@/pages/LeadDetail'));
const System = lazy(() => import('@/pages/System'));

function PageFallback() {
  return (
    <div className="space-y-4" aria-busy>
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function App() {
  const token = useAppSelector((s) => s.auth.token);
  return (
    <ToastProvider>
      {token ? (
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Overview />} />
              <Route path="leads" element={<Leads />} />
              <Route path="leads/:id" element={<LeadDetail />} />
              <Route path="system" element={<System />} />
              <Route path="login" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </Suspense>
      ) : (
        <Login />
      )}
    </ToastProvider>
  );
}
