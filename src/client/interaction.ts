export interface InteractionCallbacks {
  clampCam: (cx: number, cy: number) => { x: number; y: number };
  getCam: () => { x: number; y: number };
  setCam: (x: number, y: number) => void;
  setCamTarget: (x: number, y: number) => void;
  getCharacters: () => Map<string, { x: number; y: number; selected: boolean; id: string }>;
  getSessions: () => { sessionId: string }[];
  getSelected: () => string | null;
  selectSession: (id: string) => void;
  clearSelection: () => void;
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

  // Canvas click -> select character
  canvas.addEventListener('click', (e: MouseEvent) => {
    if (dragMoved) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cam = cb.getCam();

    let closest: { id: string } | null = null;
    let closestDist = 28;
    for (const ch of cb.getCharacters().values()) {
      const d = Math.hypot(ch.x - cam.x - mx, ch.y - cam.y - my);
      if (d < closestDist) { closest = ch; closestDist = d; }
    }

    if (closest) {
      cb.selectSession(closest.id);
    } else {
      cb.clearSelection();
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
