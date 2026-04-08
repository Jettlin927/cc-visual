import type { SSEMessage } from '../../shared/types.js';

export class FileWatcher {
  filePath: string;
  private source: EventSource | null = null;
  onChange: ((data: SSEMessage) => void) | null = null;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  start(): void {
    this.source = new EventSource(`/api/watch?path=${encodeURIComponent(this.filePath)}`);
    this.source.onmessage = (e: MessageEvent) => {
      try {
        const data: SSEMessage = JSON.parse(e.data);
        if (data.type === 'changed' && this.onChange) {
          this.onChange(data);
        }
      } catch { /* ignore parse errors */ }
    };
  }

  stop(): void {
    if (this.source) {
      this.source.close();
      this.source = null;
    }
  }
}
