import { useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  clearRankCache,
  readSettings,
  updateSettings,
  type Settings,
} from '../utils/settings';

const ROW_OPTIONS = [5, 10, 15, 20];

const CACHE_OPTIONS = [
  { value: 1, label: '1 hour' },
  { value: 6, label: '6 hours' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '1 day' },
  { value: 72, label: '3 days' },
  { value: 168, label: '1 week' },
];

export default function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    void readSettings().then((value) => {
      setSettings(value);
      setReady(true);
    });
  }, []);

  function patch(next: Partial<Settings>): void {
    setSettings((current) => ({ ...current, ...next }));
    void updateSettings(next);
  }

  async function onClearCache(): Promise<void> {
    await clearRankCache();
    setCleared(true);
    window.setTimeout(() => setCleared(false), 1600);
  }

  if (!ready) {
    return (
      <main className="popup">
        <p className="muted">Loading settings</p>
      </main>
    );
  }

  return (
    <main className="popup">
      <header className="header">
        <h1>Momentum Extras</h1>
        <p className="muted">Enhancements for the Momentum dashboard</p>
      </header>

      <section className="group">
        <h2>Display</h2>
        <label className="field">
          <span>Maps per page</span>
          <select value={settings.rowsPerPage} onChange={(event) => patch({ rowsPerPage: Number(event.target.value) })}>
            {ROW_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <Toggle
          label="Show map thumbnails"
          checked={settings.showThumbnails}
          onChange={(value) => patch({ showThumbnails: value })}
        />
        <Toggle
          label="Show ranks"
          hint="Each rank needs one request per map"
          checked={settings.showRanks}
          onChange={(value) => patch({ showRanks: value })}
        />
        <Toggle
          label="Open maps in a new tab"
          checked={settings.openLinksInNewTab}
          onChange={(value) => patch({ openLinksInNewTab: value })}
        />
        <Toggle
          label="Player search on map pages"
          hint="Search a map's leaderboard by username or SteamID"
          checked={settings.showMapSearch}
          onChange={(value) => patch({ showMapSearch: value })}
        />
        <label className="field">
          <span>Profile activity panel</span>
          <select
            value={settings.activityMode}
            onChange={(event) => patch({ activityMode: event.target.value as Settings['activityMode'] })}
          >
            <option value="match">Match height</option>
            <option value="default">Default</option>
            <option value="hidden">Hidden</option>
          </select>
        </label>
      </section>

      <section className="group">
        <h2>Ranks</h2>
        <label className="field">
          <span>Keep ranks cached for</span>
          <select value={settings.rankCacheHours} onChange={(event) => patch({ rankCacheHours: Number(event.target.value) })}>
            {CACHE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="button" onClick={() => void onClearCache()}>
          {cleared ? 'Cache cleared' : 'Clear cached ranks'}
        </button>
      </section>
    </main>
  );
}

interface ToggleProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

function Toggle({ label, hint, checked, onChange }: ToggleProps) {
  return (
    <label className="toggle">
      <span>
        <span className="toggle-label">{label}</span>
        {hint ? <span className="toggle-hint">{hint}</span> : null}
      </span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
