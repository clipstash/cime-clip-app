import { fetchClipInfo } from '$lib/api/clips';

class SourceStore {
  url = $state('');
  title = $state<string | null>(null);
  thumbnail = $state<string | null>(null);
  isLive = $state(false);
  loading = $state(false);
  totalSec = $state(3600);
  durationLoaded = $state(false);

  constructor() {
    $effect.root(() => {
      $effect(() => {
        void this.url;
        this.durationLoaded = false;
        this.title = null;
        this.thumbnail = null;
        this.isLive = false;
        this.loading = false;
      });

      $effect(() => {
        const targetUrl = this.url;
        if (!targetUrl) return;
        this.loading = true;
        const t = setTimeout(async () => {
          const info = await fetchClipInfo(targetUrl);
          this.title = info.title;
          this.thumbnail = info.thumbnail;
          if (info.duration != null) {
            this.totalSec = info.duration;
            this.durationLoaded = true;
            this.isLive = false;
          } else {
            this.isLive = true;
          }
          this.loading = false;
        }, 600);
        return () => clearTimeout(t);
      });
    });
  }
}

export const sourceStore = new SourceStore();
