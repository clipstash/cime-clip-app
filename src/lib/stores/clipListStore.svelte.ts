import type { Clip } from '$lib/api/clips';
import type { Video } from '$lib/api/videos';
import type { ActiveRecord } from '$lib/api/record';
import { localUrl } from '$lib/utils/url';

class ClipListStore {
  clips = $state<Clip[]>([]);
  videos = $state<Video[]>([]);
  records = $state<ActiveRecord[]>([]);
  modalUrl = $state('');
  showModal = $state(false);

  openModal(fileUrl: string) {
    this.modalUrl = localUrl(fileUrl);
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.modalUrl = '';
  }

  removeClip(id: string) {
    const clip = this.clips.find((c) => c.id === id);
    if (clip?.file_url?.startsWith('blob:')) URL.revokeObjectURL(clip.file_url);
    this.clips = this.clips.filter((c) => c.id !== id);
  }

  removeVideo(id: string) {
    this.videos = this.videos.filter((v) => v.id !== id);
  }

  removeRecord(filename: string) {
    const rec = this.records.find((r) => r.filename === filename);
    if (rec?.file_url?.startsWith('blob:')) URL.revokeObjectURL(rec.file_url);
    this.records = this.records.filter((r) => r.filename !== filename);
  }

  addClip(info: { title: string | null; startSec: number; endSec: number; blobUrl: string }) {
    const clip: Clip = {
      id: crypto.randomUUID(),
      platform: 'browser',
      status: 'completed',
      title: info.title ?? undefined,
      start_time: info.startSec,
      end_time: info.endSec,
      file_url: info.blobUrl,
    };
    this.clips = [clip, ...this.clips];
  }

  addVideo(info: { title: string | null; url: string }) {
    const video: Video = {
      id: crypto.randomUUID(),
      url: info.url,
      status: 'completed',
      title: info.title ?? undefined,
    };
    this.videos = [video, ...this.videos];
  }

  addRecord(info: { filename: string; url: string; blobUrl: string }) {
    const record: ActiveRecord = {
      id: crypto.randomUUID(),
      filename: info.filename,
      url: info.url,
      status: 'completed',
      file_url: info.blobUrl,
      error_message: null,
      started_at: null,
    };
    this.records = [record, ...this.records.filter((r) => r.filename !== info.filename)];
  }
}

export const clipListStore = new ClipListStore();
