import { fillRanks, getPersonalBests, isRateLimited, resetRankCache } from '../utils/api';
import {
  GAMEMODE_OPTIONS,
  formatTime,
  gamemodeName,
  timeAgo,
} from '../utils/format';
import { html, openLinksInNewTab } from '../utils/dom';
import { DEFAULT_SETTINGS, readSettings, settingsItem, type Settings } from '../utils/settings';
import type { RankedRun } from '../utils/types';
import { buildTrackChips, compareTracks, type TrackChip } from './run-display';
import widgetStyles from './recent-runs.css?raw';

const SEARCH_DEBOUNCE_MS = 300;

let preferredGamemode = 0;

export function mountRecentRuns(host: HTMLElement, userID: number, signal: AbortSignal): () => void {
  let settings: Settings = DEFAULT_SETTINGS;
  let pageSize = DEFAULT_SETTINGS.rowsPerPage;
  let gamemode = preferredGamemode;
  let query = '';
  let page = 0;
  let runs: RankedRun[] = [];
  let phase: 'loading' | 'ready' | 'error' = 'loading';
  let errorMessage = '';
  let busy = false;
  let loadID = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  const requestedRanks = new Set<number>();
  const selectedRuns = new Map<number, number>();

  const root = html`
    <section class="mmx">
      <header class="mmx-header">
        <h3 class="mmx-title">Recent personal bests</h3>
        <div class="mmx-controls">
          <select class="mmx-select" aria-label="Gamemode">
            <option value="0">All gamemodes</option>
          </select>
          <input class="mmx-input" type="search" placeholder="Search maps" aria-label="Search maps" />
        </div>
      </header>
      <div class="mmx-body">
        <div class="mmx-list" role="list"></div>
        <div class="mmx-footer">
          <span class="mmx-range"></span>
          <span class="mmx-status"></span>
          <div class="mmx-pager">
            <button class="mmx-btn" type="button" data-action="first" aria-label="First page">&laquo;</button>
            <button class="mmx-btn" type="button" data-action="previous" aria-label="Previous page">&lsaquo;</button>
            <span class="mmx-page-label"></span>
            <button class="mmx-btn" type="button" data-action="next" aria-label="Next page">&rsaquo;</button>
            <button class="mmx-btn" type="button" data-action="last" aria-label="Last page">&raquo;</button>
          </div>
        </div>
      </div>
    </section>
  `;

  const gamemodeSelect = root.querySelector<HTMLSelectElement>('.mmx-select')!;
  const searchInput = root.querySelector<HTMLInputElement>('.mmx-input')!;
  const listNode = root.querySelector<HTMLElement>('.mmx-list')!;
  const rangeNode = root.querySelector<HTMLElement>('.mmx-range')!;
  const statusNode = root.querySelector<HTMLElement>('.mmx-status')!;
  const pageLabel = root.querySelector<HTMLElement>('.mmx-page-label')!;
  const pagerNode = root.querySelector<HTMLElement>('.mmx-pager')!;
  const firstButton = root.querySelector<HTMLButtonElement>('[data-action="first"]')!;
  const previousButton = root.querySelector<HTMLButtonElement>('[data-action="previous"]')!;
  const nextButton = root.querySelector<HTMLButtonElement>('[data-action="next"]')!;
  const lastButton = root.querySelector<HTMLButtonElement>('[data-action="last"]')!;

  const styleNode = document.createElement('style');
  styleNode.textContent = widgetStyles;
  host.append(styleNode, root);

  function applyLayout(): void {
    root.classList.toggle('no-thumbs', !settings.showThumbnails);
    root.classList.toggle('no-ranks', !settings.showRanks);
  }

  function groupRunsByMap(): RankedRun[][] {
    const needle = query.trim().toLowerCase();
    const grouped = new Map<number, RankedRun[]>();

    for (const run of runs) {
      if (gamemode !== 0 && run.gamemode !== gamemode) continue;
      if (needle && !(run.map?.name ?? '').toLowerCase().includes(needle)) continue;
      const group = grouped.get(run.mapID);
      if (group) group.push(run);
      else grouped.set(run.mapID, [run]);
    }

    for (const group of grouped.values()) group.sort(compareTracks);
    return [...grouped.values()];
  }

  function selectedRunFor(mapID: number, group: RankedRun[]): RankedRun {
    const runID = selectedRuns.get(mapID);
    return group.find((run) => run.id === runID) ?? group[0]!;
  }

  function rankElement(run: RankedRun): HTMLElement {
    if (run.rank === undefined) {
      return html`<span class="mmx-rank-value mmx-rank-pending" title="Loading rank">...</span>`;
    }
    if (run.rank === null) {
      return html`<span class="mmx-rank-value mmx-rank-empty" title="Unranked">-</span>`;
    }
    const record = run.rank === 1;
    const className = record ? 'mmx-rank-value mmx-rank-record' : 'mmx-rank-value';
    const title = record ? 'World record' : `Rank ${run.rank}`;
    return html`<span class="${className}" title="${title}">#${run.rank}</span>`;
  }

  function chipElement(mapID: number, activeID: number, chip: TrackChip): HTMLElement {
    const pressed = String(chip.run.id === activeID);
    const element = html`
      <button class="mmx-chip" type="button" aria-pressed="${pressed}" title="${formatTime(chip.run.time)}">
        ${chip.label}
      </button>
    `;
    element.addEventListener('click', () => {
      selectedRuns.set(mapID, chip.run.id);
      draw();
    });
    return element;
  }

  function rowElement(group: RankedRun[]): HTMLElement {
    const mapID = group[0]!.mapID;
    const active = selectedRunFor(mapID, group);
    const mapName = active.map?.name;
    const label = mapName ?? `Map #${mapID}`;
    const href = mapName ? `/maps/${encodeURIComponent(mapName)}` : `/maps/${mapID}`;
    const thumbnail = active.map?.thumbnail?.small;
    const createdAt = new Date(active.createdAt).toLocaleString();

    const row = html`
      <div class="mmx-row" role="listitem">
        <a class="mmx-thumb-link" href="${href}" aria-label="${label}">
          ${thumbnail
            ? html`<img class="mmx-thumb" src="${thumbnail}" alt="" loading="lazy" />`
            : html`<div class="mmx-thumb"></div>`}
        </a>
        <div class="mmx-map">
          <a class="mmx-map-name" href="${href}" title="${label}">${label}</a>
          <div class="mmx-tracks">
            <span class="mmx-mode">${gamemodeName(active.gamemode)}</span>
            ${buildTrackChips(group).map((chip) => chipElement(mapID, active.id, chip))}
          </div>
        </div>
        <div class="mmx-time">${formatTime(active.time)}</div>
        <div class="mmx-rank">${rankElement(active)}</div>
        <div class="mmx-date" title="${createdAt}">${timeAgo(active.createdAt)}</div>
      </div>
    `;

    if (settings.openLinksInNewTab) openLinksInNewTab(row);
    return row;
  }

  function headElement(): HTMLElement {
    return html`
      <div class="mmx-head">
        <div></div>
        <div>Map</div>
        <div class="mmx-time">Time</div>
        <div class="mmx-rank">Rank</div>
        <div class="mmx-date">Set</div>
      </div>
    `;
  }

  function ensureRanks(groups: RankedRun[][]): void {
    if (!settings.showRanks) return;
    const pending = groups
      .map((group) => selectedRunFor(group[0]!.mapID, group))
      .filter((run) => run.rank === undefined && !requestedRanks.has(run.id));
    if (pending.length === 0) return;
    for (const run of pending) requestedRanks.add(run.id);
    void fillRanks(userID, pending, scheduleDraw, signal, settings.rankCacheHours * 3_600_000).catch(() => {});
  }

  function renderList(groups: RankedRun[][]): void {
    listNode.classList.toggle('is-busy', busy);

    if (phase === 'error') {
      const retry = html`<button class="mmx-btn" type="button">Retry</button>`;
      retry.addEventListener('click', () => void load());
      listNode.replaceChildren(html`<p class="mmx-message">Could not load runs (${errorMessage}) ${retry}</p>`);
      return;
    }

    if (phase === 'loading') {
      listNode.replaceChildren(html`<p class="mmx-message">Loading runs</p>`);
      return;
    }

    const pageGroups = groups.slice(page * pageSize, (page + 1) * pageSize);
    if (pageGroups.length === 0) {
      const message = query ? `No personal bests matching "${query}"` : 'No personal bests here';
      listNode.replaceChildren(html`<p class="mmx-message">${message}</p>`);
      return;
    }

    listNode.replaceChildren(headElement(), ...pageGroups.map(rowElement));
    ensureRanks(pageGroups);
  }

  function renderFooter(groups: RankedRun[][]): void {
    const total = groups.length;
    const first = total === 0 ? 0 : page * pageSize + 1;
    const last = Math.min(total, (page + 1) * pageSize);
    const pages = Math.max(1, Math.ceil(total / pageSize));

    rangeNode.textContent = total === 0 ? '' : `${first}-${last} of ${total} map${total === 1 ? '' : 's'}`;
    statusNode.textContent = isRateLimited() ? 'Rate limited, ranks will load shortly' : '';
    pageLabel.textContent = `Page ${page + 1} of ${pages}`;

    firstButton.disabled = previousButton.disabled = page === 0;
    nextButton.disabled = lastButton.disabled = page >= pages - 1;
    pagerNode.hidden = total <= pageSize;
  }

  function draw(): void {
    if (signal.aborted) return;
    root.hidden = runs.length === 0 && phase !== 'error';
    const groups = groupRunsByMap();
    const lastPage = Math.max(0, Math.ceil(groups.length / pageSize) - 1);
    if (page > lastPage) page = lastPage;
    renderList(groups);
    renderFooter(groups);
  }

  let drawQueued = false;

  function scheduleDraw(): void {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => {
      drawQueued = false;
      draw();
    });
  }

  function refreshGamemodeOptions(): void {
    const present = new Set(runs.map((run) => run.gamemode));
    if (gamemode !== 0 && !present.has(gamemode)) gamemode = 0;

    const options = [html`<option value="0">All gamemodes</option>`];
    for (const option of GAMEMODE_OPTIONS) {
      if (present.has(option.id)) options.push(html`<option value="${String(option.id)}">${option.name}</option>`);
    }
    gamemodeSelect.replaceChildren(...options);
    gamemodeSelect.value = String(gamemode);
  }

  async function load(): Promise<void> {
    const currentLoad = ++loadID;
    settings = await readSettings();
    pageSize = settings.rowsPerPage;
    applyLayout();
    phase = 'loading';
    errorMessage = '';
    busy = true;
    draw();

    try {
      const personalBests = await getPersonalBests(userID, signal);
      if (currentLoad !== loadID || signal.aborted) return;
      runs = personalBests.map((run): RankedRun => ({ ...run, rank: undefined }));
      requestedRanks.clear();
      selectedRuns.clear();
      phase = 'ready';
    } catch (error) {
      if (signal.aborted || currentLoad !== loadID) return;
      phase = 'error';
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    busy = false;
    refreshGamemodeOptions();
    draw();
  }

  function goToPage(next: number): void {
    const lastPage = Math.max(0, Math.ceil(groupRunsByMap().length / pageSize) - 1);
    page = Math.min(Math.max(0, next), lastPage);
    draw();
  }

  firstButton.addEventListener('click', () => goToPage(0));
  previousButton.addEventListener('click', () => goToPage(page - 1));
  nextButton.addEventListener('click', () => goToPage(page + 1));
  lastButton.addEventListener('click', () => goToPage(Number.MAX_SAFE_INTEGER));

  gamemodeSelect.addEventListener('change', () => {
    const value = Number(gamemodeSelect.value);
    gamemode = Number.isFinite(value) ? value : 0;
    preferredGamemode = gamemode;
    page = 0;
    draw();
  });

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const next = searchInput.value.trim();
      if (next === query) return;
      query = next;
      page = 0;
      draw();
    }, SEARCH_DEBOUNCE_MS);
  });

  const unwatchSettings = settingsItem.watch((value) => {
    if (!value) return;
    const next = { ...DEFAULT_SETTINGS, ...value };
    if (next.cacheEpoch !== settings.cacheEpoch) {
      resetRankCache();
      requestedRanks.clear();
      for (const run of runs) run.rank = undefined;
    }
    settings = next;
    pageSize = next.rowsPerPage;
    applyLayout();
    draw();
  });

  draw();
  void load();

  return () => {
    unwatchSettings();
    clearTimeout(searchTimer);
    host.replaceChildren();
  };
}
