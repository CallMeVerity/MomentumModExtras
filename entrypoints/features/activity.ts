import type { ActivityMode } from '../utils/settings';

const STYLE_ID = 'mmx-activity-style';

const MATCH_STYLES = [
  'm-activity m-card-body { flex: 1 1 0; min-height: 0; }',
  'm-activity .infinite-scroll-container { height: 100% !important; }',
].join('\n');

const MODE_STYLES: Record<ActivityMode, string> = {
  default: '',
  match: `@media (min-width: 1536px) {\n${MATCH_STYLES}\n}`,
  hidden: 'm-activity { display: none !important; }',
};

export function applyActivityMode(mode: ActivityMode): void {
  let node = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!node) {
    node = document.createElement('style');
    node.id = STYLE_ID;
    document.head.append(node);
  }

  const css = MODE_STYLES[mode] ?? '';
  if (node.textContent !== css) node.textContent = css;
}

export function clearActivityMode(): void {
  document.getElementById(STYLE_ID)?.remove();
}
