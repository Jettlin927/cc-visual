export interface InteractionCallbacks {
  getCam: () => { x: number; y: number };
  getCharacters: () => Map<string, { x: number; y: number; selected: boolean; id: string }>;
  getSessions: () => { sessionId: string; status: string }[];
  getSelected: () => string | null;
  selectSession: (id: string) => void;
  clearSelection: () => void;
  focusWaitingSession: (id: string) => void;
}

export function initInteraction(canvas: HTMLCanvasElement, cb: InteractionCallbacks): void {
  function findCharAt(mx: number, my: number): { id: string } | null {
    const cam = cb.getCam();
    let closest: { id: string } | null = null;
    let closestDist = 28;
    for (const ch of cb.getCharacters().values()) {
      const d = Math.hypot(ch.x - cam.x - mx, ch.y - cam.y - my);
      if (d < closestDist) { closest = ch; closestDist = d; }
    }
    return closest;
  }

  function getClickPos(e: MouseEvent): { mx: number; my: number } {
    const rect = canvas.getBoundingClientRect();
    return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
  }

  // Single click:
  //   - Waiting character → focus window directly
  //   - Other character → select (open panel)
  //   - Empty area → clear selection
  canvas.addEventListener('click', (e: MouseEvent) => {
    const { mx, my } = getClickPos(e);
    const ch = findCharAt(mx, my);

    if (ch) {
      const session = cb.getSessions().find(s => s.sessionId === ch.id);
      if (session && session.status === 'waiting') {
        cb.focusWaitingSession(ch.id);
      } else {
        cb.selectSession(ch.id);
      }
    } else {
      cb.clearSelection();
    }
  });

  // Double click → always open panel (even for waiting)
  canvas.addEventListener('dblclick', (e: MouseEvent) => {
    const { mx, my } = getClickPos(e);
    const ch = findCharAt(mx, my);
    if (ch) {
      cb.selectSession(ch.id);
    }
  });

  // Space = cycle through sessions
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.code === 'Space' && cb.getSessions().length) {
      e.preventDefault();
      const ids = cb.getSessions().map(s => s.sessionId);
      const idx = ids.indexOf(cb.getSelected()!);
      const next = ids[(idx + 1) % ids.length];
      cb.selectSession(next);
    }
  });
}
