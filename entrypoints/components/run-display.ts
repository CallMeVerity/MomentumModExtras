import { gamemodeName, styleName, trackLabel } from '../utils/format';
import type { RankedRun } from '../utils/types';

export interface TrackChip {
  run: RankedRun;
  label: string;
}

export function compareTracks(a: RankedRun, b: RankedRun): number {
  return a.trackType - b.trackType || a.trackNum - b.trackNum || a.style - b.style;
}

export function buildTrackChips(runs: RankedRun[]): TrackChip[] {
  const trackCounts = new Map<string, number>();
  const gamemodes = new Set<number>();

  for (const run of runs) {
    const key = `${run.trackType}:${run.trackNum}`;
    trackCounts.set(key, (trackCounts.get(key) ?? 0) + 1);
    gamemodes.add(run.gamemode);
  }

  return runs.map((run) => {
    const base = run.trackType === 0 ? 'Main' : trackLabel(run);
    const key = `${run.trackType}:${run.trackNum}`;
    const label =
      (trackCounts.get(key) ?? 0) > 1 && run.style !== 0
        ? `${base} (${styleName(run.style)})`
        : gamemodes.size > 1
          ? `${base} (${gamemodeName(run.gamemode)})`
          : base;
    return { run, label };
  });
}
