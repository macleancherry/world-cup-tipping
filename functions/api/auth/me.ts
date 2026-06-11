import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

export const onRequestGet: PagesFunction<Env> = async () => {
  return new Response(JSON.stringify({ authenticated: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
