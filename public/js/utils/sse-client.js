export class FileWatcher {
  constructor(filePath) {
    this.filePath = filePath;
    this.source = null;
    this.onChange = null;
  }

  start() {
    this.source = new EventSource(`/api/watch?path=${encodeURIComponent(this.filePath)}`);
    this.source.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'changed' && this.onChange) {
          this.onChange(data);
        }
      } catch {}
    };
  }

  stop() {
    if (this.source) {
      this.source.close();
      this.source = null;
    }
  }
}
