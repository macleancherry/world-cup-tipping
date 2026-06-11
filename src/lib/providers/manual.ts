import type { ResultProvider, ResultProviderFixture } from './index';

export class ManualProvider implements ResultProvider {
  async syncFixtures(): Promise<ResultProviderFixture[]> {
    return [];
  }
}
