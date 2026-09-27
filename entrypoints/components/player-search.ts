import { fillRanks, getMapPersonalBests, isRateLimited, searchUsers, type UserSummary } from '../utils/api';
import { formatTime, gamemodeName } from '../utils/format';
import { html } from '../utils/dom';
import { DEFAULT_SETTINGS, readSettings, settingsItem } from '../utils/settings';
import type { RankedRun } from '../utils/types';
import { buildTrackChips, compareTracks } from './run-display';
import widgetStyles from './player-search.css?raw';

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

let preferredQuery = '';

export function mountPlayerSearch(host: HTMLElement, mapName: string, signal: AbortSignal): () => void {
  let settings = DEFAULT_SETTINGS;
  let matches: UserSummary[] = [];
  let selected: UserSummary | null = null;
  let runs: RankedRun[] = [];
  let selectedRunID: number | null = null;
  let phase: 'idle' | 'searching' | 'loading' | 'ready' | 'error' = 'idle';
  let errorMessage = '';
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let searchID = 0;

  const root = html`
    <section class="mmxf">
      <form class="mmxf-form">
        <input
          class="mmxf-input"
          type="search"
          placeholder="Search by username or SteamID"
          aria-label="Search player by username or SteamID"
          value="${preferredQuery}"
        />
        <button class="mmxf-btn" type="submit">Search</button>
      </form>
      <div class="mmxf-body"></div>
    </section>
  `;

  const form = root.querySelector<HTMLFormElement>('.mmxf-form')!;
  const input = root.querySelector<HTMLInputElement>('.mmxf-input')!;
  const body = root.querySelector<HTMLElement>('.mmxf-body')!;

  const styleNode = document.createElement('style');
  styleNode.textContent = widgetStyles;
  host.append(styleNode, root);

  function selectedRun(): RankedRun | null {
    return runs.find((run) => run.id === selectedRunID) ?? runs[0] ?? null;
  }

  function rankElement(run: RankedRun): HTMLElement {
    if (!settings.showRanks) return html`<span></span>`;
    if (run.rank === undefined) {
      return html`<span class="mmxf-rank-value mmxf-rank-pending" title="Loading rank">...</span>`;
    }
    if (run.rank === null) {
      return html`<span class="mmxf-rank-value mmxf-rank-empty" title="Unranked">-</span>`;
    }
    const record = run.rank === 1;
    const className = record ? 'mmxf-rank-value mmxf-rank-record' : 'mmxf-rank-value';
    const title = record ? 'World record' : `Rank ${run.rank}`;
    return html`<span class="${className}" title="${title}">#${run.rank}</span>`;
  }

  function playerElement(user: UserSummary): HTMLElement {
    const active = selectedRun()!;
    const chips = buildTrackChips(runs).map(({ run, label }) => {
      const pressed = String(run.id === active.id);
      const chip = html`
        <button class="mmxf-chip" type="button" aria-pressed="${pressed}" title="${formatTime(run.time)}">
          ${label}
        </button>
      `;
      chip.addEventListener('click', () => {
        selectedRunID = run.id;
        render();
      });
      return chip;
    });

    return html`
      <div class="mmxf-player">
        <div class="mmxf-player-top">
          <a class="mmxf-player-id" href="/profile/${user.id}">
            <img class="mmxf-avatar" src="${user.avatarURL}" alt="" />
            <span class="mmxf-user-name">
              <span class="mmxf-user-alias">${user.alias}</span>
              <span class="mmxf-user-steam">${user.steamID}</span>
            </span>
          </a>
          <div class="mmxf-player-stats">
            <span class="mmxf-time">${formatTime(active.time)}</span>
            ${rankElement(active)}
          </div>
        </div>
        <div class="mmxf-tracks">
          <span class="mmxf-mode">${gamemodeName(active.gamemode)}</span>
          ${chips}
        </div>
      </div>
    `;
  }

  function resultsElement(): HTMLElement {
    const items = matches.map((user) => {
      const item = html`
        <button class="mmxf-user" type="button">
          <img class="mmxf-avatar" src="${user.avatarURL}" alt="" />
          <span class="mmxf-user-name">
            <span class="mmxf-user-alias">${user.alias}</span>
            <span class="mmxf-user-steam">${user.steamID}</span>
          </span>
        </button>
      `;
      item.addEventListener('click', () => void selectUser(user));
      return item;
    });

    return html`<div class="mmxf-results">${items}</div>`;
  }

  function messageElement(text: string): HTMLElement {
    return html`<p class="mmxf-message">${text}</p>`;
  }

  function ensureRank(): void {
    if (!settings.showRanks || !selected) return;
    const run = selectedRun();
    if (!run || run.rank !== undefined) return;
    void fillRanks(selected.id, [run], () => render(), signal, settings.rankCacheHours * 3_600_000).catch(() => {});
  }

  function render(): void {
    root.hidden = !settings.showMapSearch;

    if (phase === 'searching') {
      body.replaceChildren(messageElement('Searching'));
      return;
    }

    if (matches.length > 0) {
      body.replaceChildren(resultsElement());
      return;
    }

    if (phase === 'loading') {
      body.replaceChildren(messageElement('Loading personal bests'));
      return;
    }

    if (phase === 'error') {
      body.replaceChildren(messageElement(`Could not load data (${errorMessage})`));
      return;
    }

    if (selected && runs.length > 0) {
      const children = [playerElement(selected)];
      if (isRateLimited()) children.push(messageElement('Rate limited, ranks will load shortly'));
      body.replaceChildren(...children);
      ensureRank();
      return;
    }

    if (selected) {
      body.replaceChildren(messageElement(`${selected.alias} has no personal bests on this map`));
      return;
    }

    body.replaceChildren(messageElement('Search for a player by username or SteamID'));
  }

  async function runSearch(): Promise<void> {
    const current = ++searchID;
    const value = input.value.trim();
    preferredQuery = value;

    if (value.length < MIN_QUERY_LENGTH) {
      matches = [];
      phase = 'idle';
      render();
      return;
    }

    phase = 'searching';
    matches = [];
    render();

    try {
      const found = await searchUsers(value, signal);
      if (current !== searchID || signal.aborted) return;
      matches = found;
    } catch (error) {
      if (signal.aborted || current !== searchID) return;
      phase = 'error';
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    if (phase === 'searching') phase = 'idle';
    render();
  }

  async function selectUser(user: UserSummary): Promise<void> {
    selected = user;
    matches = [];
    runs = [];
    selectedRunID = null;
    phase = 'loading';
    render();

    try {
      const found = await getMapPersonalBests(user.id, mapName, signal);
      if (signal.aborted) return;
      runs = found.map((run): RankedRun => ({ ...run, rank: undefined })).sort(compareTracks);
      selectedRunID = runs[0]?.id ?? null;
      phase = 'ready';
    } catch (error) {
      if (signal.aborted) return;
      phase = 'error';
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    render();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearTimeout(searchTimer);
    void runSearch();
  });

  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void runSearch(), SEARCH_DEBOUNCE_MS);
  });

  const unwatchSettings = settingsItem.watch((value) => {
    if (!value) return;
    settings = { ...DEFAULT_SETTINGS, ...value };
    render();
  });

  void readSettings().then((value) => {
    settings = value;
    render();
  });

  render();

  return () => {
    unwatchSettings();
    clearTimeout(searchTimer);
    host.replaceChildren();
  };
}
