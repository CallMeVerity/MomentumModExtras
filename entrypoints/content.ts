import { mountMapCredits } from './components/map-credits';
import { mountPlayerSearch } from './components/player-search';
import { mountRecentRuns } from './components/recent-runs';
import { applyActivityMode, clearActivityMode } from './features/activity';
import { DEFAULT_SETTINGS, readSettings, settingsItem, type Settings } from './utils/settings';

const HOST_CLASS = 'mmx-root';

type Route =
  | { key: string; kind: 'profile'; id: number }
  | { key: string; kind: 'map'; name: string };

interface WidgetSpec {
  key: string;
  mount: (host: HTMLElement, signal: AbortSignal) => () => void;
}

interface MountedWidget {
  key: string;
  host: HTMLElement;
  abort: AbortController;
  dispose: () => void;
}

function resolveRoute(path: string): Route | null {
  const profile = /^\/profile\/(\d+)/.exec(path);
  if (profile) return { key: `profile:${profile[1]}`, kind: 'profile', id: Number(profile[1]) };

  const map = /^\/maps\/([^/?#]+)/.exec(path);
  if (map) {
    const name = decodeURIComponent(map[1]!);
    if (name === 'beta' || name === 'submissions') return null;
    return { key: `map:${name}`, kind: 'map', name };
  }

  return null;
}

function widgetsFor(route: Route): WidgetSpec[] {
  if (route.kind === 'profile') {
    return [
      { key: 'profile-pbs', mount: (host, signal) => mountRecentRuns(host, route.id, signal) },
      { key: 'profile-credits', mount: (host, signal) => mountMapCredits(host, route.id, signal) },
    ];
  }

  return [{ key: 'map-search', mount: (host, signal) => mountPlayerSearch(host, route.name, signal) }];
}

export default defineContentScript({
  matches: ['https://dashboard.momentum-mod.org/*'],
  main(ctx) {
    let mounted: MountedWidget[] = [];
    let routeKey: string | null = null;
    let settings: Settings = DEFAULT_SETTINGS;

    function removeStrays(): void {
      for (const node of document.querySelectorAll<HTMLElement>(`.${HOST_CLASS}`)) {
        if (!mounted.some((widget) => widget.host === node)) node.remove();
      }
    }

    function removeWidget(widget: MountedWidget): void {
      widget.abort.abort();
      widget.dispose();
      widget.host.remove();
      mounted = mounted.filter((entry) => entry !== widget);
    }

    function teardownAll(): void {
      for (const widget of [...mounted]) removeWidget(widget);
      routeKey = null;
    }

    function addWidget(spec: WidgetSpec): void {
      const host = document.createElement('div');
      host.className = HOST_CLASS;
      host.dataset.mmxWidget = spec.key;
      const abort = new AbortController();
      const dispose = spec.mount(host, abort.signal);
      mounted.push({ key: spec.key, host, abort, dispose });
    }

    function placeAfterMain(): void {
      const anchor = document.querySelector<HTMLElement>('main');
      if (!anchor) return;
      for (const widget of mounted) {
        if (widget.host.parentElement !== anchor) anchor.append(widget.host);
      }
    }

    function placeBeforeLeaderboard(): void {
      const leaderboard = document.querySelector<HTMLElement>('m-map-leaderboard');
      const card = leaderboard?.closest('.stack');

      for (const widget of mounted) {
        if (card?.parentElement) {
          if (widget.host.parentElement !== card.parentElement || widget.host.nextElementSibling !== card) {
            card.parentElement.insertBefore(widget.host, card);
          }
          widget.host.hidden = leaderboard!.classList.contains('hidden');
        } else {
          const fallback = document.querySelector<HTMLElement>('.scroll-container') ?? document.querySelector<HTMLElement>('main');
          if (fallback && widget.host.parentElement !== fallback) fallback.append(widget.host);
        }
      }
    }

    function syncActivity(route: Route | null): boolean {
      const isProfile = route?.kind === 'profile';
      if (!isProfile) {
        clearActivityMode();
        return false;
      }
      applyActivityMode(settings.activityMode);
      return true;
    }

    function reconcile(): void {
      if (!ctx.isValid) return;
      const route = resolveRoute(location.pathname);
      const isProfile = syncActivity(route);

      if (!route) {
        teardownAll();
        removeStrays();
        return;
      }

      if (routeKey !== route.key) {
        teardownAll();
        routeKey = route.key;
      }

      const specs = widgetsFor(route);
      const desired = new Set(specs.map((spec) => spec.key));

      for (const widget of [...mounted]) {
        if (!desired.has(widget.key)) removeWidget(widget);
      }

      for (const spec of specs) {
        if (!mounted.some((widget) => widget.key === spec.key)) addWidget(spec);
      }

      if (isProfile) placeAfterMain();
      else placeBeforeLeaderboard();

      removeStrays();
    }

    ctx.addEventListener(window, 'wxt:locationchange', reconcile);

    const unwatchSettings = settingsItem.watch(() => {
      void readSettings().then((value) => {
        settings = value;
        reconcile();
      });
    });

    void readSettings().then((value) => {
      settings = value;
      reconcile();
    });

    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled || !ctx.isValid) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        reconcile();
      });
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    ctx.onInvalidated(() => {
      observer.disconnect();
      unwatchSettings();
      clearActivityMode();
      teardownAll();
    });

    reconcile();
  },
});
