import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!ctx.env.SETTINGS_PIN) {
    return json({ error: 'SETTINGS_PIN not configured in environment' }, 503);
  }
  const body = await ctx.request.json() as { pin?: string };
  if (!body.pin || body.pin !== ctx.env.SETTINGS_PIN) {
    return json({ error: 'Incorrect PIN' }, 401);
  }
  return json({ ok: true });
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
