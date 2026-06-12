import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';
import { recalculateRoster } from '../_roster';

// POST { ids: number[] } — sets sort_order = 1..N in the given order
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const { ids } = await ctx.request.json() as { ids: number[] };
  if (!Array.isArray(ids) || ids.length === 0) return json({ error: 'ids required' }, 400);
  for (let i = 0; i < ids.length; i++) {
    await ctx.env.DB.prepare('UPDATE participants SET sort_order = ? WHERE id = ?')
      .bind(i + 1, ids[i]).run();
  }
  await recalculateRoster(ctx.env.DB);
  return json({ ok: true });
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
