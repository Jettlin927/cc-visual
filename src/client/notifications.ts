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

// ─── Notification settings (localStorage) ──────────────
const SETTINGS_KEY = 'cc-visual-notif-settings';

interface NotifSettings {
  enabled: boolean;
  muted: boolean;
  delayMinutes: number;
  projectWhitelist: string[];   // empty = all projects
}

function loadSettings(): NotifSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return JSON.parse(raw) as NotifSettings;
  } catch { /* ignore */ }
  return { enabled: true, muted: false, delayMinutes: 0, projectWhitelist: [] };
}

function saveSettings(): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(notifSettings));
}

const notifSettings: NotifSettings = loadSettings();
let notifRequested = false;
const recentNotifs: Set<string> = new Set();

export function getNotifSettings(): NotifSettings { return notifSettings; }

export function setNotifEnabled(v: boolean): void { notifSettings.enabled = v; saveSettings(); }
export function setDelayMinutes(v: number): void { notifSettings.delayMinutes = v; saveSettings(); }
export function setProjectWhitelist(list: string[]): void { notifSettings.projectWhitelist = list; saveSettings(); }

export function isMuted(): boolean { return notifSettings.muted; }

export function toggleMute(): void {
  notifSettings.muted = !notifSettings.muted;
  saveSettings();
}

function playBeep(): void {
  if (notifSettings.muted) return;
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

export function notifyWaiting(sessionId: string, project: string, waitedMs?: number): void {
  if (!notifSettings.enabled) return;

  // Delay threshold check
  if (notifSettings.delayMinutes > 0 && waitedMs != null) {
    if (waitedMs < notifSettings.delayMinutes * 60000) return;
  }

  // Project whitelist check
  if (notifSettings.projectWhitelist.length > 0) {
    const match = notifSettings.projectWhitelist.some(w =>
      project.toLowerCase().includes(w.toLowerCase()),
    );
    if (!match) return;
  }

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
