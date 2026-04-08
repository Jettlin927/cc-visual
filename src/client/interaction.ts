export interface InteractionCallbacks {
  clampCam: (cx: number, cy: number) => { x: number; y: number };
  getCam: () => { x: number; y: number };
  setCam: (x: number, y: number) => void;
  setCamTarget: (x: number, y: number) => void;
  getCharacters: () => Map<string, { x: number; y: number; selected: boolean; id: string }>;
  getSessions: () => { sessionId: string; status: string }[];
  getSelected: () => string | null;
  selectSession: (id: string) => void;
  clearSelection: () => void;
  focusWaitingSession: (id: string) => void;
}

export function initInteraction(canvas: HTMLCanvasElement, cb: InteractionCallbacks): void {
  let isDragging = false;
  let dragMoved  = false;
  let dragStartX = 0, dragStartY = 0;
  let dragStartCamX = 0, dragStartCamY = 0;

  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    isDragging   = true;
    dragMoved    = false;
    dragStartX   = e.clientX;
    dragStartY   = e.clientY;
    const cam = cb.getCam();
    dragStartCamX = cam.x;
    dragStartCamY = cam.y;
  });

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (Math.hypot(dx, dy) > 4) {
      dragMoved = true;
      canvas.style.cursor = 'grabbing';
    }
    if (dragMoved) {
      const c = cb.clampCam(dragStartCamX - dx, dragStartCamY - dy);
      cb.setCam(c.x, c.y);
      cb.setCamTarget(c.x, c.y);
    }
  });

  const endDrag = (): void => {
    isDragging = false;
    canvas.style.cursor = 'default';
  };
  canvas.addEventListener('mouseup',    endDrag);
  canvas.addEventListener('mouseleave', endDrag);

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
    if (dragMoved) return;
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
