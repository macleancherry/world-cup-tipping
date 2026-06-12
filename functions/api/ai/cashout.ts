import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

interface BetSummary {
  title: string;
  market_type: string | null;
  stake_amount: number;
  odds_decimal: number;
  potential_return: number;
}

interface CashoutRequest {
  fixture_id: number;
  bets: BetSummary[];
}

interface FixtureRow {
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  stage: string | null;
  group_name: string | null;
  kickoff_utc: string;
  last_synced_at: string | null;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const body = await ctx.request.json() as CashoutRequest;

  if (!body.fixture_id || !body.bets?.length) {
    return new Response(JSON.stringify({ error: 'fixture_id and bets required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const fixture = await ctx.env.DB.prepare(
    'SELECT home_team, away_team, home_score, away_score, status, stage, group_name, kickoff_utc, last_synced_at FROM fixtures WHERE id = ?'
  ).bind(body.fixture_id).first<FixtureRow>();

  if (!fixture) {
    return new Response(JSON.stringify({ error: 'Fixture not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const stageStr = fixture.stage
    ? `${fixture.stage}${fixture.group_name ? ` ${fixture.group_name}` : ''}`
    : '2026 FIFA World Cup';

  const scoreStr = fixture.home_score != null && fixture.away_score != null
    ? `${fixture.home_score}–${fixture.away_score} (${fixture.home_team} ${fixture.home_score}, ${fixture.away_team} ${fixture.away_score})`
    : 'score not yet available from data provider';

  const syncedStr = fixture.last_synced_at
    ? `Score last synced: ${new Date(fixture.last_synced_at).toLocaleString('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit' })}`
    : '';

  const betsStr = body.bets.map((b, i) => {
    const market = (b.market_type ?? 'custom').replace(/_/g, ' ');
    return `${i + 1}. "${b.title}" — Market: ${market} — Stake: ${fmt(b.stake_amount)} @ ${b.odds_decimal.toFixed(2)} → Potential return: ${fmt(b.potential_return)}`;
  }).join('\n');

  const prompt = `You are a football betting analyst. Our group of mates has pending bets on a ${stageStr} match that is currently in progress.

**Game:** ${fixture.home_team} vs ${fixture.away_team}
**Current score:** ${scoreStr}
${syncedStr}

**Our pending bets:**
${betsStr}

Please advise:
1. Given the current score and what typically happens in games at this stage, what is the rough probability each bet wins from here?
2. Should we consider cashing out for a reduced guaranteed return, or let these ride?
3. What specific events in the remaining game time would change your recommendation?

Be direct and practical — we need a quick read on whether to cash out or hold.`;

  try {
    const stream = await ctx.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast' as Parameters<Ai['run']>[0], {
      messages: [
        { role: 'system', content: 'You are a concise football betting analyst. Give direct, practical advice. Use markdown bold for key points.' },
        { role: 'user', content: prompt },
      ],
      stream: true,
    } as AiTextGenerationInput);

    return new Response(stream as ReadableStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};
