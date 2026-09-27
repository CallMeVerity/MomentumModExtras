type TemplateValue =
  | Node
  | string
  | number
  | null
  | undefined
  | false
  | TemplateValue[];

const SLOT_PREFIX = 'mmx-slot';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character]!);
}

function isNode(value: TemplateValue): value is Node {
  return value instanceof Node;
}

function toNodes(value: TemplateValue): Node[] {
  if (value === null || value === undefined || value === false) return [];
  if (isNode(value)) return [value];
  if (Array.isArray(value)) return value.flatMap(toNodes);
  return [document.createTextNode(String(value))];
}

function findSlot(root: ParentNode, name: string): Comment | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if ((node as Comment).data === name) return node as Comment;
  }
  return null;
}

export function html(strings: TemplateStringsArray, ...values: TemplateValue[]): HTMLElement {
  let markup = '';
  const slots: TemplateValue[] = [];

  strings.forEach((chunk, index) => {
    markup += chunk;
    if (index >= values.length) return;

    const value = values[index];
    if (value === null || value === undefined || value === false) return;

    if (isNode(value) || Array.isArray(value)) {
      slots.push(value);
      markup += `<!--${SLOT_PREFIX}:${slots.length - 1}-->`;
    } else {
      markup += escapeHtml(String(value));
    }
  });

  const template = document.createElement('template');
  template.innerHTML = markup;
  const content = template.content;

  slots.forEach((value, index) => {
    findSlot(content, `${SLOT_PREFIX}:${index}`)?.replaceWith(...toNodes(value));
  });

  const root = content.firstElementChild;
  if (!root) throw new Error('Template must contain a root element');
  return root as HTMLElement;
}

export function openLinksInNewTab(container: HTMLElement): void {
  const links = [container, ...container.querySelectorAll('a')].filter(
    (node): node is HTMLAnchorElement => node instanceof HTMLAnchorElement,
  );
  for (const link of links) {
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noopener noreferrer');
  }
}
