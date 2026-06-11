export interface ResultProviderFixture {
  externalProviderId: string;
  status: 'scheduled' | 'in_progress' | 'finished' | 'postponed' | 'cancelled';
  homeScore: number | null;
  awayScore: number | null;
  winner: 'home' | 'away' | 'draw' | 'unknown';
  updatedAt: string;
}

export interface ResultProvider {
  syncFixtures(): Promise<ResultProviderFixture[]>;
}
