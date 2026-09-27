const GAMEMODES: Record<number, string> = {
  1: 'Surf',
  2: 'Bhop',
  3: 'Bhop (HL1)',
  4: 'Climb (Momentum)',
  5: 'Climb (KZT)',
  6: 'Climb (1.6)',
  7: 'Rocket Jump',
  8: 'Sticky Jump',
  9: 'Ahop',
  10: 'Conc',
  11: 'Defrag (CPM)',
  12: 'Defrag (VQ3)',
  13: 'Defrag (VTG)',
};

const STYLES: Record<number, string> = {
  0: 'Normal',
  1: 'Half-Sideways',
  2: 'Half-Sideways',
  3: 'Sideways',
  4: 'W-Only',
  5: 'A/D-Only',
  6: 'S-Only',
  7: 'Backwards',
  8: 'Pro',
  9: 'Teleport',
};

export const gamemodeName = (id: number): string => GAMEMODES[id] ?? `Gamemode ${id}`;

export const styleName = (id: number): string => STYLES[id] ?? `Style ${id}`;

const CREDIT_TYPES: Record<number, string> = {
  0: 'Author',
  1: 'Contributor',
  2: 'Tester',
  3: 'Special Thanks',
};

export const creditTypeName = (type: number): string => CREDIT_TYPES[type] ?? 'Credit';

export function trackLabel(run: { trackType: number; trackNum: number }): string {
  if (run.trackType === 0) return 'Main';
  return `${run.trackType === 1 ? 'Stage' : 'Bonus'} ${run.trackNum}`;
}

export function formatTime(seconds: number): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const hours = Math.trunc(seconds / 3600);
  const minutes = Math.trunc((seconds / 60) % 60);
  const secs = Math.trunc(seconds % 60);
  const hundredths = Math.trunc(Math.trunc((seconds % 1) * 1000) / 10);

  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  if (minutes > 0) return `${pad(minutes)}:${pad(secs)}.${pad(hundredths)}`;
  return `${secs}.${pad(hundredths)}`;
}

export const GAMEMODE_OPTIONS = Object.entries(GAMEMODES).map(([id, name]) => ({
  id: Number(id),
  name,
}));

const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const TIME_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

export function timeAgo(iso: string): string {
  const difference = (Date.parse(iso) - Date.now()) / 1000;
  for (const [unit, seconds] of TIME_UNITS) {
    if (Math.abs(difference) >= seconds) return relativeTime.format(Math.round(difference / seconds), unit);
  }
  return 'just now';
}
