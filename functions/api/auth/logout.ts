import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const cookie = ctx.request.headers.get('Cookie') || '';
  const token = parseCookie(cookie, 'session');
  if (token) {
    const tokenHash = await hashToken(token);
    await ctx.env.DB.prepare('DELETE FROM sessions WHERE session_token_hash = ?').bind(tokenHash).run();
  }
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0');
  return new Response(JSON.stringify({ ok: true }), { headers });
};

function parseCookie(s: string, name: string) {
  const m = s.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

async function hashToken(t: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
}
