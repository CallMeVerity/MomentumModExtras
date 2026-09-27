import type { PagedResponse, PastRun } from '../types';
import { fetchLimited } from './http';

const RUNS_PAGE_SIZE = 100;
const RUNS_LIMIT = 3000;

export async function getPersonalBests(userID: number, signal?: AbortSignal): Promise<PastRun[]> {
  const runs: PastRun[] = [];

  for (let skip = 0; skip < RUNS_LIMIT; skip += RUNS_PAGE_SIZE) {
    const page = await fetchLimited<PagedResponse<PastRun>>(
      '/runs',
      { userID, isPB: true, skip, take: RUNS_PAGE_SIZE, expand: 'map' },
      signal,
    );
    runs.push(...page.data);
    if (runs.length >= page.totalCount || page.returnCount < RUNS_PAGE_SIZE) break;
  }

  return runs;
}

export async function getMapPersonalBests(
  userID: number,
  mapName: string,
  signal?: AbortSignal,
): Promise<PastRun[]> {
  const page = await fetchLimited<PagedResponse<PastRun>>(
    '/runs',
    { userID, mapName, isPB: true, take: RUNS_PAGE_SIZE, expand: 'map' },
    signal,
  );

  return page.data.filter((run) => run.map?.name === mapName);
}
