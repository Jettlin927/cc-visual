import { platform } from 'os';
import { execFile } from 'child_process';

import type { FocusWindowResponse } from '../shared/types.js';
import { FOCUS_WINDOW_TIMEOUT_MS } from '../shared/constants.js';

/**
 * Focus the terminal window associated with a given PID.
 * On Windows: walks up the process tree via PowerShell + Win32 API.
 * On other platforms: returns "not yet supported".
 */
export function focusWindow(pid: number): Promise<FocusWindowResponse> {
  // Verify process is alive
  try {
    process.kill(pid, 0);
  } catch {
    return Promise.resolve({ ok: false, reason: 'Process not running' });
  }

  if (platform() === 'win32') {
    const ps = `
      Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinFocus {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
}
"@
      $p = Get-Process -Id ${pid} -EA SilentlyContinue
      while ($p -and !$p.MainWindowHandle) {
        $par = (Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)" -EA SilentlyContinue).ParentProcessId
        if (!$par) { break }
        $p = Get-Process -Id $par -EA SilentlyContinue
      }
      if ($p -and $p.MainWindowHandle) {
        $h = $p.MainWindowHandle
        if ([WinFocus]::IsIconic($h)) { [WinFocus]::ShowWindow($h, 9) | Out-Null }
        [WinFocus]::SetForegroundWindow($h) | Out-Null
        Write-Output "OK:$($p.ProcessName)"
      } else { Write-Output "NO_WINDOW" }
    `;

    return new Promise<FocusWindowResponse>(resolve => {
      execFile(
        'powershell',
        ['-NoProfile', '-Command', ps],
        { timeout: FOCUS_WINDOW_TIMEOUT_MS },
        (err, stdout) => {
          if (err) {
            resolve({ ok: false, reason: err.message });
            return;
          }
          const out = (stdout || '').trim();
          if (out.startsWith('OK:')) {
            resolve({ ok: true, process: out.slice(3) });
          } else {
            resolve({ ok: false, reason: 'No terminal window found for this process' });
          }
        },
      );
    });
  }

  return Promise.resolve({
    ok: false,
    reason: 'Window focus not yet supported on ' + platform(),
  });
}
