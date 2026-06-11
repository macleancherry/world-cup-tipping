import type { ResultProvider, ResultProviderFixture } from './index';

export class ApiFootballProvider implements ResultProvider {
  constructor(private apiKey: string, private leagueId = 1) {}

  async syncFixtures(): Promise<ResultProviderFixture[]> {
    const res = await fetch(`https://v3.football.api-sports.io/fixtures?league=${this.leagueId}&season=2026`, {
      headers: { 'x-apisports-key': this.apiKey },
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json() as { response: ApiFixture[] };
    return data.response.map(mapFixture);
  }
}

interface ApiFixture {
  fixture: { id: number; status: { short: string }; date: string };
  goals: { home: number | null; away: number | null };
  teams: { home: { winner: boolean | null }; away: { winner: boolean | null } };
}

function mapFixture(f: ApiFixture): ResultProviderFixture {
  const statusMap: Record<string, ResultProviderFixture['status']> = {
    TBD: 'scheduled', NS: 'scheduled',
    '1H': 'in_progress', HT: 'in_progress', '2H': 'in_progress', ET: 'in_progress',
    BT: 'in_progress', P: 'in_progress',
    FT: 'finished', AET: 'finished', PEN: 'finished',
    PST: 'postponed', CANC: 'cancelled', ABD: 'cancelled',
    AWD: 'finished', WO: 'finished',
  };
  const s = statusMap[f.fixture.status.short] ?? 'scheduled';
  let winner: ResultProviderFixture['winner'] = 'unknown';
  if (s === 'finished') {
    if (f.teams.home.winner === true) winner = 'home';
    else if (f.teams.away.winner === true) winner = 'away';
    else if (f.teams.home.winner === false && f.teams.away.winner === false) winner = 'draw';
  }
  return {
    externalProviderId: String(f.fixture.id),
    status: s,
    homeScore: f.goals.home,
    awayScore: f.goals.away,
    winner,
    updatedAt: f.fixture.date,
  };
}
