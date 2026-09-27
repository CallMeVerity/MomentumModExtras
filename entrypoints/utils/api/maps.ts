import type { MapCredit, PagedResponse } from '../types';
import { fetchLimited } from './http';

const CREDITS_PAGE_SIZE = 100;
const CREDITS_LIMIT = 500;

export async function getMapCredits(userID: number, signal?: AbortSignal): Promise<MapCredit[]> {
  const credits: MapCredit[] = [];

  for (let skip = 0; skip < CREDITS_LIMIT; skip += CREDITS_PAGE_SIZE) {
    const page = await fetchLimited<PagedResponse<MapCredit>>(
      `/users/${userID}/credits`,
      { expand: 'map', skip, take: CREDITS_PAGE_SIZE },
      signal,
    );
    credits.push(...page.data.filter((credit) => credit.map));
    if (credits.length >= page.totalCount || page.returnCount < CREDITS_PAGE_SIZE) break;
  }

  return credits;
}
