import { storage } from '#imports';
import type { LeaderboardRunRank, PastRun, RankedRun } from '../types';
import { HttpError, fetchLimited } from './http';

const RANK_CONCURRENCY = 2;
const DEFAULT_CACHE_TTL = 24 * 60 * 60 * 1000;

type RankCache = Record<number, { rank: number | null; cachedAt: number }>;

const cachePromises = new Map<number, Promise<RankCache>>();
const pendingRanks = new Set<number>();

const cacheKey = (userID: number) => `local:ranks:${userID}` as const;

export function resetRankCache(): void {
  cachePromises.clear();
}

async function getRank(run: PastRun, signal?: AbortSignal): Promise<number | null> {
  try {
    const leaderboardRun = await fetchLimited<LeaderboardRunRank>(
      `/maps/${run.mapID}/leaderboard/run`,
      {
        userID: run.userID,
        gamemode: run.gamemode,
        trackType: run.trackType,
        trackNum: run.trackNum,
        style: run.style,
      },
      signal,
    );
    return leaderboardRun.rank;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

function getRankCache(userID: number): Promise<RankCache> {
  let promise = cachePromises.get(userID);
  if (!promise) {
    promise = storage.getItem<RankCache>(cacheKey(userID)).then((cache) => cache ?? {});
    cachePromises.set(userID, promise);
  }
  return promise;
}

async function saveRankCache(userID: number, cache: RankCache, ttlMs: number): Promise<void> {
  const cutoff = Date.now() - ttlMs;
  for (const [id, entry] of Object.entries(cache)) {
    if (entry.cachedAt < cutoff) delete cache[Number(id)];
  }
  await storage.setItem(cacheKey(userID), cache);
}

export async function fillRanks(
  userID: number,
  runs: RankedRun[],
  onUpdate: () => void,
  signal?: AbortSignal,
  ttlMs: number = DEFAULT_CACHE_TTL,
): Promise<void> {
  const cache = await getRankCache(userID);
  const now = Date.now();
  const queue: RankedRun[] = [];
  let updated = false;

  for (const run of runs) {
    if (run.rank !== undefined) continue;

    const cached = cache[run.id];
    if (cached && now - cached.cachedAt < ttlMs) {
      run.rank = cached.rank;
      updated = true;
    } else if (!pendingRanks.has(run.id)) {
      pendingRanks.add(run.id);
      queue.push(run);
    }
  }

  if (updated) onUpdate();
  if (queue.length === 0) return;

  let index = 0;
  const worker = async () => {
    while (index < queue.length && !signal?.aborted) {
      const run = queue[index++]!;
      try {
        run.rank = await getRank(run, signal);
        cache[run.id] = { rank: run.rank, cachedAt: Date.now() };
      } catch {
        if (signal?.aborted) return;
        run.rank = null;
      }
      onUpdate();
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(RANK_CONCURRENCY, queue.length) }, worker));
  } finally {
    for (const run of queue) pendingRanks.delete(run.id);
    await saveRankCache(userID, cache, ttlMs);
  }
}
