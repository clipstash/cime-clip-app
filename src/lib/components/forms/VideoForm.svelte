<script lang="ts">
  import { fetchFile } from '@ffmpeg/util';
  import { loadFfmpeg } from '$lib/ffmpeg';
  import { fetchClipInfo } from '$lib/api/clips';
  import { parseM3u8 } from '$lib/utils/stream';
  import { API_URL } from '$lib/api/config';

  type Props = {
    url: string;
    onSuccess: (info: { title: string | null; url: string }) => void;
  };

  const { url, onSuccess }: Props = $props();

  let err = $state('');

  type DlStatus = 'idle' | 'loading' | 'downloading' | 'encoding' | 'done' | 'error';
  let dlStatus = $state<DlStatus>('idle');
  let progress = $state(0);
  let progressLabel = $state('');

  async function submit() {
    if (!url || dlStatus !== 'idle') return;
    dlStatus = 'loading';
    err = '';
    progress = 0;

    try {
      const info = await fetchClipInfo(url);
      if (!info.m3u8_url) throw new Error('스트림 URL을 찾을 수 없습니다');

      const { initUrl, segments } = await parseM3u8(info.m3u8_url);
      if (segments.length === 0) throw new Error('세그먼트를 찾을 수 없습니다');

      const ffmpeg = await loadFfmpeg();

      dlStatus = 'downloading';
      const segNames: string[] = [];

      let initData: Uint8Array | null = null;
      if (initUrl) {
        const proxyInit = `${API_URL}/proxy?url=${encodeURIComponent(initUrl)}`;
        initData = await fetchFile(proxyInit);
      }

      for (let i = 0; i < segments.length; i++) {
        const segUrl = `${API_URL}/proxy?url=${encodeURIComponent(segments[i])}`;
        const segData = await fetchFile(segUrl);
        const name = `seg${String(i).padStart(5, '0')}.mp4`;
        if (initData) {
          const combined = new Uint8Array(initData.byteLength + segData.byteLength);
          combined.set(initData, 0);
          combined.set(segData, initData.byteLength);
          await ffmpeg.writeFile(name, combined);
        } else {
          await ffmpeg.writeFile(name, segData);
        }
        segNames.push(name);
        progress = Math.round(((i + 1) / segments.length) * 80);
        progressLabel = `${i + 1} / ${segments.length} 세그먼트`;
      }

      dlStatus = 'encoding';
      progressLabel = 'MP4 변환 중...';
      progress = 82;

      const concatList = segNames.map((n) => `file '${n}'`).join('\n');
      await ffmpeg.writeFile('concat.txt', concatList);
      await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'output.mp4']);
      progress = 96;

      const raw = (await ffmpeg.readFile('output.mp4')) as Uint8Array;
      const buf = new ArrayBuffer(raw.byteLength);
      new Uint8Array(buf).set(raw);
      const blob = new Blob([buf], { type: 'video/mp4' });
      const objUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      const safe = (info.title ?? 'video').replace(/[\\/:*?"<>|]/g, '_');
      a.href = objUrl;
      a.download = `${safe}.mp4`;
      a.click();
      URL.revokeObjectURL(objUrl);

      for (const name of segNames) await ffmpeg.deleteFile(name);
      await ffmpeg.deleteFile('concat.txt');
      await ffmpeg.deleteFile('output.mp4');

      progress = 100;
      progressLabel = '완료!';
      dlStatus = 'done';
      onSuccess({ title: info.title, url });
      setTimeout(() => { dlStatus = 'idle'; progress = 0; progressLabel = ''; }, 3000);
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
      dlStatus = 'error';
    }
  }

  const busy = $derived(dlStatus === 'loading' || dlStatus === 'downloading' || dlStatus === 'encoding');
</script>

<div class="form-row time-row video-action">
  <div class="time-input">
    <span class="time-label" aria-hidden="true">비디오</span>
    {#if busy}
      <div class="dl-progress">
        <div class="progress-bar"><div class="progress-fill" style="width: {progress}%"></div></div>
        <span class="progress-label">{progressLabel}</span>
      </div>
    {/if}
  </div>
  <button class="submit-btn" onclick={submit} disabled={busy || !url}>
    {dlStatus === 'done' ? '완료 ✓' : busy ? '처리중...' : '다운로드 ✦'}
  </button>
</div>
{#if err}<p class="error">{err}</p>{/if}
