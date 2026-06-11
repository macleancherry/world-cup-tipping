import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const body = await ctx.request.json() as { password: string };

  if (!body.password) {
    return json({ error: 'Password required' }, 400);
  }

  const valid = await verifyPassword(body.password, ctx.env.ADMIN_PASSWORD_HASH);
  if (!valid) {
    return json({ error: 'Invalid password' }, 401);
  }

  const token = crypto.randomUUID() + crypto.randomUUID();
  const tokenHash = await hashToken(token);
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await ctx.env.DB.prepare(
    'INSERT INTO sessions (session_token_hash, expires_at) VALUES (?, ?)'
  ).bind(tokenHash, expires).run();

  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie',
    `session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${7 * 24 * 3600}`
  );

  return new Response(JSON.stringify({ ok: true }), { headers });
};

async function verifyPassword(password: string, hashHex: string): Promise<boolean> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(password));
  const computed = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  return computed === hashHex.toLowerCase();
}

async function hashToken(token: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
