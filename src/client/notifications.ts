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

// ─── Desktop notifications + 8-bit beep ────────────────
const MUTE_KEY = 'cc-visual-muted';
let muted = localStorage.getItem(MUTE_KEY) === 'true';
let notifRequested = false;
const recentNotifs: Set<string> = new Set(); // debounce per session

export function isMuted(): boolean { return muted; }

export function toggleMute(): void {
  muted = !muted;
  localStorage.setItem(MUTE_KEY, String(muted));
}

function playBeep(): void {
  if (muted) return;
  try {
    const ac = new AudioContext();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, ac.currentTime);
    osc.frequency.setValueAtTime(660, ac.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
    osc.connect(gain).connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + 0.2);
    setTimeout(() => ac.close(), 300);
  } catch { /* AudioContext not available */ }
}

export function notifyWaiting(sessionId: string, project: string): void {
  // Debounce: don't re-notify same session within 30s
  if (recentNotifs.has(sessionId)) return;
  recentNotifs.add(sessionId);
  setTimeout(() => recentNotifs.delete(sessionId), 30000);

  playBeep();

  // Desktop notification
  if (!notifRequested && 'Notification' in window && Notification.permission === 'default') {
    notifRequested = true;
    void Notification.requestPermission();
  }

  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification('⚠ Session waiting', {
        body: `${project} — ${sessionId.slice(0, 8)} needs your review`,
        icon: '/css/favicon.ico',
      });
    } catch { /* notification failed */ }
  }
}
