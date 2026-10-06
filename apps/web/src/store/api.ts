import type {
  AnalyzeLeadBody,
  AnalyzeLeadResponse,
  LeadStats,
  ListLeadsQuery,
  Paginated,
  UpdateLeadBody,
} from '@lead/shared';
import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import { signedOut } from '@/features/auth/authSlice';
import type { LeadDto } from '@/lib/types';

export const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export type LeadListParams = Partial<
  Omit<ListLeadsQuery, 'page' | 'pageSize' | 'sort' | 'order'>
> & {
  page?: number;
  pageSize?: number;
  sort?: ListLeadsQuery['sort'];
  order?: ListLeadsQuery['order'];
};

export interface HealthResponse {
  status: 'ok' | 'degraded';
  services: Record<string, 'up' | 'down'>;
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_BASE,
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as { auth: { token: string | null } }).auth.token;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return headers;
  },
});

/** Signs the user out when the API says the token is no longer accepted. */
const baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extra,
) => {
  const result = await rawBaseQuery(args, api, extra);
  const url = typeof args === 'string' ? args : args.url;
  if (result.error?.status === 401 && !url.startsWith('/api/health')) {
    api.dispatch(signedOut());
  }
  return result;
};

export function toSearch(params: object): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** A readable message from any API or network failure. */
export function errorText(err: unknown): string {
  const e = err as
    { status?: unknown; data?: unknown; error?: string; message?: string } | undefined;
  const data = e?.data as { error?: { message?: string } } | undefined;
  if (data?.error?.message) return data.error.message;
  if (e?.status === 'FETCH_ERROR')
    return 'Cannot reach the API. Check that it is running on port 4000.';
  if (e?.status === 'PARSING_ERROR') return 'The API sent a response that could not be read.';
  if (typeof e?.status === 'number') return `The API answered with status ${e.status}.`;
  return e?.error ?? e?.message ?? 'Something went wrong.';
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: ['Lead', 'LeadList', 'Stats'],
  endpoints: (build) => ({
    health: build.query<HealthResponse, void>({
      query: () => '/api/health',
      transformErrorResponse: (res) => res,
    }),
    stats: build.query<LeadStats, void>({
      query: () => '/api/leads/stats',
      providesTags: ['Stats'],
    }),
    leads: build.query<Paginated<LeadDto>, LeadListParams>({
      query: (params) => `/api/leads${toSearch(params)}`,
      providesTags: (res) => [
        'LeadList',
        ...(res?.items ?? []).map((l) => ({ type: 'Lead' as const, id: l.id })),
      ],
    }),
    lead: build.query<LeadDto, string>({
      query: (id) => `/api/leads/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'Lead', id }],
    }),
    analyze: build.mutation<AnalyzeLeadResponse, AnalyzeLeadBody>({
      query: (body) => ({ url: '/api/leads/analyze', method: 'POST', body }),
      invalidatesTags: ['LeadList', 'Stats'],
    }),
    reanalyze: build.mutation<AnalyzeLeadResponse, string>({
      query: (id) => ({ url: `/api/leads/${id}/reanalyze`, method: 'POST' }),
      invalidatesTags: (_r, _e, id) => [{ type: 'Lead', id }, 'LeadList', 'Stats'],
    }),
    updateLead: build.mutation<LeadDto, { id: string; patch: UpdateLeadBody }>({
      query: ({ id, patch }) => ({ url: `/api/leads/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'Lead', id }, 'LeadList', 'Stats'],
    }),
    deleteLead: build.mutation<void, string>({
      query: (id) => ({ url: `/api/leads/${id}`, method: 'DELETE' }),
      invalidatesTags: ['LeadList', 'Stats'],
    }),
  }),
});

export const {
  useHealthQuery,
  useStatsQuery,
  useLeadsQuery,
  useLeadQuery,
  useAnalyzeMutation,
  useReanalyzeMutation,
  useUpdateLeadMutation,
  useDeleteLeadMutation,
} = api;
