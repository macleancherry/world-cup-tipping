import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_middleware';

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const id = ctx.params.id as string;

  const fixture = await ctx.env.DB.prepare('SELECT * FROM fixtures WHERE id = ?')
    .bind(id)
    .first<{ id: number; home_team: string; away_team: string; kickoff_utc: string; status: string }>();

  if (!fixture) {
    return new Response(JSON.stringify({ error: 'Fixture not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  const kickoffDate = new Date(fixture.kickoff_utc).toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    timeZone: ctx.env.TIMEZONE || 'Australia/Perth',
  });

  const prompt = buildPrompt(fixture.home_team, fixture.away_team, kickoffDate);

  try {
    const stream = await ctx.env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast' as Parameters<Ai['run']>[0], {
      messages: [
        { role: 'system', content: 'You are a concise football betting analyst. Give practical, specific advice. Use markdown formatting with bold headers.' },
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

export function buildPrompt(homeTeam: string, awayTeam: string, kickoffDate: string): string {
  return `Betting analysis for this 2026 FIFA World Cup match:

**${homeTeam} vs ${awayTeam}**
Date: ${kickoffDate}

Please provide:

**1. Head-to-head**
Recent meetings, who tends to dominate.

**2. Form & strengths**
Current squad quality, key players, playing style.

**3. Injury / suspension concerns**
Any notable absences or players to watch.

**4. Recommended bets**
Top 2-3 specific suggestions (match result, over/under goals, BTTS, etc.) with brief reasoning and rough odds guidance.

**5. Confidence**
High / Medium / Low — and why.

Keep it concise and practical. We're a group of mates betting from a shared kitty.`;
}
