import { CircleCheck, CircleX, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { ErrorNote, PageHeader, Skeleton } from '@/components/ui/Misc';
import { timeAgo } from '@/lib/format';
import { errorText, useHealthQuery, useStatsQuery } from '@/store/api';

const SERVICE_NOTE: Record<string, { label: string; fix: string }> = {
  mongo: { label: 'MongoDB', fix: 'Run "docker compose up -d" and check "docker compose ps".' },
  redis: {
    label: 'Redis queue',
    fix: 'Run "docker compose up -d". Without Redis, new analyses cannot be queued.',
  },
};

export default function System() {
  const health = useHealthQuery(undefined, { pollingInterval: 10_000 });
  const stats = useStatsQuery();
  // A 503 still carries the per service detail, so read it from the error body too.
  const body =
    health.data ??
    (
      health.error as
        { data?: { services?: Record<string, 'up' | 'down'>; status?: string } } | undefined
    )?.data;
  const services = body?.services ? Object.entries(body.services) : [];
  const unreachable = health.isError && !body?.services;

  return (
    <>
      <PageHeader
        title="System"
        description="Check that the services behind the dashboard are running."
        actions={
          <Button onClick={() => health.refetch()} loading={health.isFetching}>
            <RefreshCw className="size-4" aria-hidden />
            Check now
          </Button>
        }
      />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="pb-5">
          <CardHeader title="Services" hint="Refreshes every 10 seconds." />
          <div className="mt-4 px-5">
            {health.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : unreachable ? (
              <ErrorNote>{errorText(health.error)}</ErrorNote>
            ) : (
              <ul className="divide-y divide-line">
                <li className="flex items-center gap-3 py-3">
                  <CircleCheck className="size-5 text-good" aria-hidden />
                  <span className="font-medium">API</span>
                  <span className="ml-auto text-sm text-good">Running</span>
                </li>
                {services.map(([name, state]) => (
                  <li key={name} className="py-3">
                    <div className="flex items-center gap-3">
                      {state === 'up' ? (
                        <CircleCheck className="size-5 text-good" aria-hidden />
                      ) : (
                        <CircleX className="size-5 text-bad" aria-hidden />
                      )}
                      <span className="font-medium">{SERVICE_NOTE[name]?.label ?? name}</span>
                      <span
                        className={
                          state === 'up' ? 'ml-auto text-sm text-good' : 'ml-auto text-sm text-bad'
                        }
                      >
                        {state === 'up' ? 'Running' : 'Down'}
                      </span>
                    </div>
                    {state === 'down' && SERVICE_NOTE[name] ? (
                      <p className="mt-1 pl-8 text-[13px] text-ink-2">{SERVICE_NOTE[name]!.fix}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
        <Card className="pb-5">
          <CardHeader title="Analysis queue" />
          <div className="mt-4 space-y-2 px-5 text-sm">
            {stats.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : stats.data ? (
              <>
                <div className="flex justify-between">
                  <span className="text-ink-2">Running or queued</span>
                  <span className="tnum font-medium">{stats.data.inProgress}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-2">Finished</span>
                  <span className="tnum font-medium">{stats.data.analyzed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-2">Failed or blocked</span>
                  <span className="tnum font-medium">{stats.data.needsAttention}</span>
                </div>
                <p className="pt-2 text-[13px] text-ink-3">
                  Last checked{' '}
                  {timeAgo(
                    health.fulfilledTimeStamp
                      ? new Date(health.fulfilledTimeStamp).toISOString()
                      : null,
                  )}
                  . A queued lead that never starts usually means the worker is not running or Redis
                  is down.
                </p>
              </>
            ) : (
              <ErrorNote onRetry={stats.refetch}>{errorText(stats.error)}</ErrorNote>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
