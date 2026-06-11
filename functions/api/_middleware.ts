import type { PagesFunction } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  ADMIN_PASSWORD_HASH: string;
  RESULTS_PROVIDER: string;
  RESULTS_API_KEY?: string;
  TIMEZONE: string;
  ALLOW_PUBLIC_READONLY: string;
  ENABLE_AUTO_SETTLEMENT: string;
  DEFAULT_CURRENCY: string;
}

const PUBLIC_PATHS = ['/api/auth/login'];

export const onRequest: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);

  if (PUBLIC_PATHS.some(p => url.pathname === p)) {
    return ctx.next();
  }

  if (ctx.request.method === 'GET' && ctx.env.ALLOW_PUBLIC_READONLY === 'true') {
    return ctx.next();
  }

  const cookie = ctx.request.headers.get('Cookie') || '';
  const sessionToken = parseCookie(cookie, 'session');

  if (!sessionToken) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const tokenHash = await hashToken(sessionToken);
  const session = await ctx.env.DB.prepare(
    'SELECT * FROM sessions WHERE session_token_hash = ? AND expires_at > datetime("now")'
  ).bind(tokenHash).first();

  if (!session) {
    return new Response(JSON.stringify({ error: 'Session expired' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return ctx.next();
};

function parseCookie(cookieStr: string, name: string): string | null {
  const match = cookieStr.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

async function hashToken(token: string): Promise<string> {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
