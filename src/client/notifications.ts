import { TOAST_DURATION_MS, BADGE_FLASH_MS } from '../shared/constants.js';

export function showToast(msg: string): void {
  const area = document.getElementById('toast-area')!;
  const div  = document.createElement('div');
  div.className = 'toast';
  div.textContent = msg;
  area.appendChild(div);
  setTimeout(() => div.remove(), TOAST_DURATION_MS);
}

export function showBadge(id: string, status: string): void {
  const el = document.querySelector(`.sess-item[data-id="${id}"]`) as HTMLElement | null;
  if (!el) return;
  el.style.transition = 'background 0.3s';
  el.style.background = status === 'waiting' ? 'rgba(255,165,0,0.25)' : '';
  setTimeout(() => { el.style.background = ''; }, BADGE_FLASH_MS);
}
