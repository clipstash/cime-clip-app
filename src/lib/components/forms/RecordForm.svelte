<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { loadFfmpeg } from '$lib/ffmpeg';
  import { fetchClipInfo } from '$lib/api/clips';
  import { parseM3u8 } from '$lib/utils/stream';
  import { API_URL } from '$lib/api/config';

  type Props = {
    url: string;
    onSuccess?: (info: { filename: string; url: string; blobUrl: string }) => void;
  };

  const { url, onSuccess }: Props = $props();

  type RecordStatus = 'idle' | 'loading' | 'recording' | 'paused' | 'encoding' | 'done' | 'error';

  let recFileName = $state('');
  let recBlobUrl = $state('');
  let status = $state<RecordStatus>('idle');
  let err = $state('');
  let segCount = $state(0);
  let titleLoading = $state(false);
  let fileNameEdited = $state(false);

  let m3u8Url = '';
  let initData: Uint8Array | null = null;
  let segments: Uint8Array[] = [];
  let segmentsSeen = new SvelteSet<string>();
  let pollTimerId: ReturnType<typeof setTimeout> | null = null;
  let isFirstPoll = true;


  $effect(() => {
    const targetUrl = url;
    if (!targetUrl) { titleLoading = false; return; }
    if (fileNameEdited) return;
    titleLoading = true;
    const t = setTimeout(async () => {
      const info = await fetchClipInfo(targetUrl);
      if (info.title && !fileNameEdited) recFileName = info.title;
      titleLoading = false;
    }, 600);
    return () => clearTimeout(t);
  });

  async function fetchSegment(segUrl: string): Promise<Uint8Array> {
    const proxyUrl = `${API_URL}/stream/proxy?url=${encodeURIComponent(segUrl)}`;
    const res = await fetch(proxyUrl);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }

  async function pollSegments() {
    if (status !== 'recording' || !m3u8Url) return;
    try {
      const { initUrl, segments: newSegs } = await parseM3u8(m3u8Url);
      if (initUrl && !initData) {
        initData = await fetchSegment(initUrl);
      }
      if (isFirstPoll) {
        // 첫 폴링: 기존 세그먼트는 seen 처리만 하고 다운로드하지 않음
        for (const seg of newSegs) segmentsSeen.add(seg);
        isFirstPoll = false;
      } else {
        for (const seg of newSegs) {
          if (!segmentsSeen.has(seg)) {
            segmentsSeen.add(seg);
            const data = await fetchSegment(seg);
            segments.push(data);
            segCount = segments.length;
          }
        }
      }
    } catch { /* 세그먼트 fetch 실패는 무시 */ }
    if (status === 'recording') {
      pollTimerId = setTimeout(pollSegments, 3000);
    }
  }

  async function submit() {
    if (!url || !recFileName || status !== 'idle') return;
    status = 'loading';
    err = '';
    initData = null;
    segments = [];
    segmentsSeen = new SvelteSet();
    segCount = 0;
    isFirstPoll = true;

    try {
      const info = await fetchClipInfo(url);
      if (!info.m3u8_url) throw new Error('스트림 URL을 찾을 수 없습니다');
      m3u8Url = info.m3u8_url;
      status = 'recording';
      await pollSegments();
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
      status = 'error';
    }
  }

  function pauseRecording() {
    if (status !== 'recording') return;
    if (pollTimerId) { clearTimeout(pollTimerId); pollTimerId = null; }
    status = 'paused';
  }

  function resumeRecording() {
    if (status !== 'paused') return;
    status = 'recording';
    pollSegments();
  }

  async function stopRecording() {
    if (status !== 'recording' && status !== 'paused') return;
    if (pollTimerId) { clearTimeout(pollTimerId); pollTimerId = null; }
    if (segments.length === 0) { status = 'idle'; return; }

    try {
      status = 'encoding';
      const ffmpeg = await loadFfmpeg();

      const segNames: string[] = [];
      for (let i = 0; i < segments.length; i++) {
        const name = `seg${String(i).padStart(5, '0')}.mp4`;
        if (initData) {
          const combined = new Uint8Array(initData.byteLength + segments[i].byteLength);
          combined.set(initData, 0);
          combined.set(segments[i], initData.byteLength);
          await ffmpeg.writeFile(name, combined);
        } else {
          await ffmpeg.writeFile(name, segments[i]);
        }
        segNames.push(name);
      }

      const concatList = segNames.map((n) => `file '${n}'`).join('\n');
      await ffmpeg.writeFile('concat.txt', concatList);
      await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'output.mp4']);

      const raw = (await ffmpeg.readFile('output.mp4')) as Uint8Array;
      const buf = new ArrayBuffer(raw.byteLength);
      new Uint8Array(buf).set(raw);
      const blob = new Blob([buf], { type: 'video/mp4' });
      const objUrl = URL.createObjectURL(blob);

      for (const name of segNames) await ffmpeg.deleteFile(name);
      await ffmpeg.deleteFile('concat.txt');
      await ffmpeg.deleteFile('output.mp4');

      recBlobUrl = objUrl;
      status = 'done';
      onSuccess?.({ filename: recFileName, url, blobUrl: objUrl });
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
      status = 'error';
    }
  }

  function reset() {
    if (pollTimerId) { clearTimeout(pollTimerId); pollTimerId = null; }
    initData = null;
    segments = [];
    segmentsSeen = new SvelteSet();
    segCount = 0;
    isFirstPoll = true;
    status = 'idle';
    err = '';
  }

  function triggerRecDownload() {
    const a = document.createElement('a');
    a.href = recBlobUrl;
    a.download = `${recFileName.replace(/[\\/:*?"<>|]/g, '_')}.mp4`;
    a.click();
    URL.revokeObjectURL(recBlobUrl);
    recBlobUrl = '';
    reset();
  }

  const isActive = $derived(status === 'recording' || status === 'paused');
</script>

<div class="form-row record-row">
  {#if status === 'idle' || status === 'error'}
    <div class="record-input">
      <label for="rec-file-name">녹화{titleLoading ? ' (불러오는 중...)' : ''}</label>
      <input id="rec-file-name" type="text" placeholder="파일명 (예: stream_20260313)" bind:value={recFileName}
        oninput={() => { fileNameEdited = recFileName.length > 0; }} />
    </div>
    <button class="submit-btn" onclick={submit} disabled={!url || !recFileName}>
      녹화 시작 ✦
    </button>
  {:else if status === 'loading'}
    <span class="rec-info">스트림 확인 중...</span>
  {:else if isActive}
    <div class="rec-controls">
      <span class="rec-dot" class:paused={status === 'paused'}></span>
      <span class="rec-info">{status === 'paused' ? '일시멈춤' : '녹화 중'} — {segCount} 세그먼트</span>
      {#if status === 'recording'}
        <button class="rec-btn rec-btn-pause" onclick={pauseRecording}>일시멈춤</button>
      {:else}
        <button class="rec-btn rec-btn-resume" onclick={resumeRecording}>재개</button>
      {/if}
      <button class="rec-btn rec-btn-stop" onclick={stopRecording}>완료</button>
      <button class="rec-btn rec-btn-cancel" onclick={reset}>취소</button>
    </div>
  {:else if status === 'encoding'}
    <span class="rec-info">MP4 변환 중... ({segCount} 세그먼트)</span>
  {:else if status === 'done'}
    <button class="submit-btn" onclick={triggerRecDownload}>다운로드 ↓</button>
  {/if}
</div>
{#if err}<p class="error">{err}</p>{/if}
