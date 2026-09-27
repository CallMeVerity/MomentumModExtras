import { storage } from '#imports';

export type ActivityMode = 'default' | 'match' | 'hidden';

export interface Settings {
  rowsPerPage: number;
  showThumbnails: boolean;
  showRanks: boolean;
  rankCacheHours: number;
  openLinksInNewTab: boolean;
  showMapSearch: boolean;
  activityMode: ActivityMode;
  cacheEpoch: number;
}

export const DEFAULT_SETTINGS: Settings = {
  rowsPerPage: 10,
  showThumbnails: true,
  showRanks: true,
  rankCacheHours: 24,
  openLinksInNewTab: false,
  showMapSearch: true,
  activityMode: 'match',
  cacheEpoch: 0,
};

export const settingsItem = storage.defineItem<Settings>('local:settings', {
  fallback: DEFAULT_SETTINGS,
});

export async function readSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await settingsItem.getValue()) };
}

let writeQueue: Promise<unknown> = Promise.resolve();

export function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const result = writeQueue.then(async () => {
    const next = { ...(await readSettings()), ...patch };
    await settingsItem.setValue(next);
    return next;
  });
  writeQueue = result.catch(() => undefined);
  return result;
}

export async function clearRankCache(): Promise<void> {
  const snapshot = await storage.snapshot('local');
  const keys = Object.keys(snapshot).filter((key) => key.startsWith('ranks:'));

  await Promise.all(keys.map((key) => storage.removeItem(`local:${key}` as `local:${string}`)));

  const settings = await readSettings();
  await settingsItem.setValue({ ...settings, cacheEpoch: settings.cacheEpoch + 1 });
}
