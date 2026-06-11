import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

export const onRequestPut: PagesFunction<Env> = async (ctx) => {
  const body = await ctx.request.json() as Record<string, string>;

  const stmts = Object.entries(body).map(([key, value]) =>
    ctx.env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
      .bind(key, String(value))
  );

  await ctx.env.DB.batch(stmts);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
