/** Primer selector que pinta algo visible en pantalla. */
export function findTarget(target?: string | string[]): HTMLElement | null {
  for (const sel of ([] as string[]).concat(target || [])) {
    let nodes: NodeListOf<HTMLElement>;
    try { nodes = document.querySelectorAll<HTMLElement>(sel); } catch { continue; }
    for (const el of Array.from(nodes)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el;
    }
  }
  return null;
}
