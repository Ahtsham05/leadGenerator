import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import {
  AnalyzeLeadBodySchema,
  ListLeadsQuerySchema,
  UpdateLeadBodySchema,
  type AnalyzeLeadBody,
  type AnalyzeLeadResponse,
  type ListLeadsQuery,
  type UpdateLeadBody,
} from '@lead/shared';
import {
  assertPublicHost,
  normalizeUrl,
  websiteKey,
  type HostGuard,
} from '../analyzers/net/urlSafety.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import {
  bodyOf,
  paramsOf,
  queryOf,
  validateBody,
  validateParams,
  validateQuery,
} from '../middleware/validate.js';
import type { Enqueue } from '../queue/analysisQueue.js';
import type { LeadRepository } from '../services/leadRepository.js';

const IdParams = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid lead id') });

export interface LeadsRouterDeps {
  repo: LeadRepository;
  enqueue: Enqueue;
  hostGuard?: HostGuard;
}

export function leadsRouter(deps: LeadsRouterDeps): Router {
  const r = Router();
  const guard = deps.hostGuard ?? assertPublicHost;
  const analyzeLimiter = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
  });

  r.post('/analyze', analyzeLimiter, validateBody(AnalyzeLeadBodySchema), async (_req, res) => {
    const body = bodyOf<AnalyzeLeadBody>(res);
    const norm = normalizeUrl(body.website);
    if (!norm.ok) throw badRequest(`Invalid website: ${norm.error}`);
    try {
      await guard(norm.url.hostname);
    } catch (err) {
      const code = (err as { code?: string }).code;
      throw badRequest(
        code === 'ENOTFOUND'
          ? 'Website host does not resolve'
          : `Website not allowed: ${(err as Error).message}`,
      );
    }
    const { lead, created } = await deps.repo.upsertManual({
      businessName: body.businessName,
      website: norm.url.toString(),
      websiteKey: websiteKey(norm.url),
      city: body.city,
      country: body.country,
      rating: body.rating,
      reviewCount: body.reviewCount,
    });
    await deps.repo.setPending(lead.id);
    let jobId: string | null;
    try {
      ({ jobId } = await deps.enqueue(lead.id));
    } catch {
      // The lead is saved; it can be re-queued later.
      throw new AppError(
        503,
        'QUEUE_UNAVAILABLE',
        'Lead saved but the analysis queue is unavailable',
      );
    }
    const response: AnalyzeLeadResponse = {
      id: lead.id,
      jobId,
      analysisStatus: 'pending',
      enqueued: true,
    };
    res.status(created ? 201 : 202).json(response);
  });

  r.get('/', validateQuery(ListLeadsQuerySchema), async (_req, res) => {
    res.json(await deps.repo.list(queryOf<ListLeadsQuery>(res)));
  });

  // Registered before "/:id" so "stats" is never parsed as an id.
  r.get('/stats', async (_req, res) => {
    res.json(await deps.repo.stats());
  });

  r.get('/:id', validateParams(IdParams), async (_req, res) => {
    const { id } = paramsOf<z.infer<typeof IdParams>>(res);
    const lead = await deps.repo.findById(id);
    if (!lead) throw notFound('Lead');
    res.json(lead);
  });

  r.patch(
    '/:id',
    validateParams(IdParams),
    validateBody(UpdateLeadBodySchema),
    async (_req, res) => {
      const { id } = paramsOf<z.infer<typeof IdParams>>(res);
      const lead = await deps.repo.updateCrm(id, bodyOf<UpdateLeadBody>(res));
      if (!lead) throw notFound('Lead');
      res.json(lead);
    },
  );

  r.post('/:id/reanalyze', analyzeLimiter, validateParams(IdParams), async (_req, res) => {
    const { id } = paramsOf<z.infer<typeof IdParams>>(res);
    const lead = await deps.repo.findById(id);
    if (!lead) throw notFound('Lead');
    if (!lead.website) throw badRequest('This lead has no website to analyse');
    await deps.repo.setPending(id);
    let jobId: string | null;
    try {
      ({ jobId } = await deps.enqueue(id));
    } catch {
      throw new AppError(503, 'QUEUE_UNAVAILABLE', 'The analysis queue is unavailable');
    }
    const response: AnalyzeLeadResponse = {
      id,
      jobId,
      analysisStatus: 'pending',
      enqueued: true,
    };
    res.status(202).json(response);
  });

  r.delete('/:id', validateParams(IdParams), async (_req, res) => {
    const { id } = paramsOf<z.infer<typeof IdParams>>(res);
    if (!(await deps.repo.remove(id))) throw notFound('Lead');
    res.status(204).end();
  });

  return r;
}
