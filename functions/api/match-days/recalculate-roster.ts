import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';
import { recalculateRoster } from '../_roster';

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  await recalculateRoster(ctx.env.DB);
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
