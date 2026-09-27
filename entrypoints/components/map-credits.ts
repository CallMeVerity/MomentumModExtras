import { getMapCredits } from '../utils/api';
import { creditTypeName } from '../utils/format';
import { html, openLinksInNewTab } from '../utils/dom';
import { DEFAULT_SETTINGS, readSettings, settingsItem, type Settings } from '../utils/settings';
import { type MapCredit } from '../utils/types';
import widgetStyles from './map-credits.css?raw';

interface CreditGroup {
  type: number;
  credits: MapCredit[];
}

export function mountMapCredits(host: HTMLElement, userID: number, signal: AbortSignal): () => void {
  let settings: Settings = DEFAULT_SETTINGS;
  let credits: MapCredit[] = [];
  let phase: 'loading' | 'ready' | 'error' = 'loading';
  let errorMessage = '';

  const root = html`
    <section class="mmc">
      <header class="mmc-header">
        <h3 class="mmc-title">Maps</h3>
        <span class="mmc-count"></span>
      </header>
      <div class="mmc-body"></div>
    </section>
  `;

  const countNode = root.querySelector<HTMLElement>('.mmc-count')!;
  const body = root.querySelector<HTMLElement>('.mmc-body')!;

  const styleNode = document.createElement('style');
  styleNode.textContent = widgetStyles;
  host.append(styleNode, root);

  function groups(): CreditGroup[] {
    const byType = new Map<number, MapCredit[]>();
    for (const credit of credits) {
      const list = byType.get(credit.type);
      if (list) list.push(credit);
      else byType.set(credit.type, [credit]);
    }

    return [...byType.entries()]
      .sort(([a], [b]) => a - b)
      .map(([type, list]) => ({
        type,
        credits: [...list].sort((a, b) => (a.map?.name ?? '').localeCompare(b.map?.name ?? '')),
      }));
  }

  function cardElement(credit: MapCredit): HTMLElement {
    const map = credit.map!;
    const thumbnail = map.thumbnail?.small;
    const description = credit.description ?? '';
    const card = html`
      <a class="mmc-card" href="/maps/${encodeURIComponent(map.name)}" title="${description}">
        ${thumbnail
          ? html`<img class="mmc-thumb" src="${thumbnail}" alt="" loading="lazy" />`
          : html`<div class="mmc-thumb"></div>`}
        <span class="mmc-info">
          <span class="mmc-name">${map.name}</span>
          ${description ? html`<span class="mmc-desc">${description}</span>` : ''}
        </span>
      </a>
    `;

    if (settings.openLinksInNewTab) openLinksInNewTab(card);
    return card;
  }

  function groupElement(group: CreditGroup): HTMLElement {
    return html`
      <section class="mmc-group">
        <h4 class="mmc-group-title">${creditTypeName(group.type)} (${group.credits.length})</h4>
        <div class="mmc-grid">${group.credits.map(cardElement)}</div>
      </section>
    `;
  }

  function render(): void {
    root.hidden = credits.length === 0 && phase !== 'error';
    countNode.textContent = credits.length > 0 ? `${credits.length} in total` : '';

    if (phase === 'error') {
      body.replaceChildren(html`<p class="mmc-message">Could not load maps (${errorMessage})</p>`);
      return;
    }

    if (phase === 'loading') {
      body.replaceChildren();
      return;
    }

    body.replaceChildren(...groups().map(groupElement));
  }

  async function load(): Promise<void> {
    settings = await readSettings();
    phase = 'loading';
    render();

    try {
      credits = await getMapCredits(userID, signal);
      if (signal.aborted) return;
      phase = 'ready';
    } catch (error) {
      if (signal.aborted) return;
      phase = 'error';
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    render();
  }

  const unwatchSettings = settingsItem.watch((value) => {
    if (!value) return;
    settings = { ...DEFAULT_SETTINGS, ...value };
    render();
  });

  render();
  void load();

  return () => {
    unwatchSettings();
    host.replaceChildren();
  };
}
