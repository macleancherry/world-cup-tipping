import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../_middleware';

interface ExtractRequest {
  url?: string;
  text?: string;
}

interface FixtureRow {
  id: number;
  home_team: string;
  away_team: string;
  kickoff_utc: string;
  status: string;
}

interface AiPick {
  found: boolean;
  team1?: string;
  team2?: string;
  predicted?: string;
  confidence?: string;
}

const ALIASES: Record<string, string> = {
  'usa': 'united states',
  'united states of america': 'united states',
  'bafana bafana': 'south africa',
  'korea republic': 'south korea',
  'republic of korea': 'south korea',
  'ir iran': 'iran',
  "cote d'ivoire": 'cote divoire',
  'ivory coast': 'cote divoire',
  'côte divoire': 'cote divoire',
  'china pr': 'china',
};

function norm(name: string): string {
  const n = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  return ALIASES[n] ?? n;
}

function teamsMatch(a: string, b: string): boolean {
  const na = norm(a), nb = norm(b);
  if (na === nb) return true;
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  return shorter.length >= 4 && longer.includes(shorter);
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractJsonFromAiResponse(raw: string): string {
  // Strip markdown code fences if present
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) return fenced[1];
  // Find first JSON object
  const obj = raw.match(/\{[\s\S]*\}/);
  if (obj) return obj[0];
  return raw.trim();
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const body = await ctx.request.json() as ExtractRequest;

  if (!body.url && !body.text?.trim()) {
    return json({ error: 'Provide a URL or paste some text' }, 400);
  }

  let content = body.text?.trim() ?? '';
  let sourceUsed = 'pasted text';

  // If a URL was given, try to fetch it
  if (body.url) {
    try {
      const res = await fetch(body.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      });
      if (res.ok) {
        const html = await res.text();
        content = stripHtml(html).substring(0, 6000);
        sourceUsed = body.url;
      } else if (!content) {
        return json({ error: `URL returned HTTP ${res.status}. Paste the text instead.`, fallback: true }, 422);
      }
      // If URL fetch failed but text was also provided, fall through to the text
    } catch (e) {
      if (!content) {
        return json({ error: `Could not fetch URL (${(e as Error).message}). Paste the text instead.`, fallback: true }, 422);
      }
    }
  }

  if (!content) {
    return json({ error: 'No content to analyse' }, 400);
  }

  // Ask Workers AI to extract the pick
  const prompt = `You are extracting data from text about an octopus named Cherry at the Two Oceans Aquarium in Cape Town who predicts football match winners.

TEXT:
${content.substring(0, 5000)}

Find the football match prediction Cherry made. Return ONLY a JSON object — no explanation, no markdown:
{"found":true,"team1":"<team name>","team2":"<other team name>","predicted":"<predicted winner team name>","confidence":"high"}

If no clear prediction is found: {"found":false}`;

  let aiPick: AiPick = { found: false };
  try {
    const aiRes = await ctx.env.AI.run(
      '@cf/meta/llama-3.3-70b-instruct-fp8-fast' as Parameters<Ai['run']>[0],
      {
        messages: [
          { role: 'system', content: 'You are a JSON extractor. Output only valid JSON.' },
          { role: 'user', content: prompt },
        ],
        stream: false,
        max_tokens: 150,
      } as AiTextGenerationInput
    ) as { response: string };

    const raw = extractJsonFromAiResponse(aiRes.response ?? '');
    aiPick = JSON.parse(raw) as AiPick;
  } catch {
    return json({ error: 'AI failed to parse the content. Try pasting just the relevant sentence.' }, 500);
  }

  if (!aiPick.found || !aiPick.team1 || !aiPick.team2 || !aiPick.predicted) {
    return json({ error: 'No prediction found in the content. Try pasting the specific sentence where Cherry picks a winner.', source_used: sourceUsed }, 422);
  }

  // Match AI-extracted teams to DB fixtures
  const fixtures = await ctx.env.DB.prepare(
    "SELECT id, home_team, away_team, kickoff_utc, status FROM fixtures WHERE status IN ('scheduled','in_progress','finished') ORDER BY kickoff_utc DESC LIMIT 200"
  ).all<FixtureRow>();

  const match = fixtures.results.find(f =>
    (teamsMatch(aiPick.team1!, f.home_team) && teamsMatch(aiPick.team2!, f.away_team)) ||
    (teamsMatch(aiPick.team1!, f.away_team) && teamsMatch(aiPick.team2!, f.home_team))
  );

  if (!match) {
    return json({
      error: `Found a prediction (${aiPick.predicted}) but couldn't match "${aiPick.team1} vs ${aiPick.team2}" to any fixture in the database.`,
      ai_extracted: aiPick,
      source_used: sourceUsed,
    }, 422);
  }

  const predicted_winner: 'home' | 'away' = teamsMatch(aiPick.predicted, match.home_team) ? 'home' : 'away';
  const predicted_team = predicted_winner === 'home' ? match.home_team : match.away_team;

  return json({
    fixture_id: match.id,
    home_team: match.home_team,
    away_team: match.away_team,
    kickoff_utc: match.kickoff_utc,
    predicted_winner,
    predicted_team,
    confidence: aiPick.confidence ?? 'high',
    source_used: sourceUsed,
  });
};

function json(d: unknown, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { 'Content-Type': 'application/json' } });
}
