<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { loadFfmpeg } from '$lib/ffmpeg';
  import { fetchClipInfo } from '$lib/api/clips';
  import { parseM3u8 } from '$lib/utils/stream';


  // ── Props 타입 ───────────────────────────────────────────────────
  type Props = {
    url: string;
    onSuccess?: (info: { filename: string; url: string; blobUrl: string }) => void;
  };

  const { url, onSuccess }: Props = $props();

  // ── 녹화 상태 ────────────────────────────────────────────────────
  type RecordStatus = 'idle' | 'loading' | 'recording' | 'paused' | 'encoding' | 'error';

  let recFileName = $state('');
  let status = $state<RecordStatus>('idle');
  let err = $state('');
  let segCount = $state(0);
  let titleLoading = $state(false);
  let fileNameEdited = $state(false);

  // ── 내부 변수 (반응형 불필요) ────────────────────────────────────
  let m3u8Url = '';
  let initData: Uint8Array | null = null;
  let segments: Uint8Array[] = [];
  let segmentsSeen = new SvelteSet<string>();
  let pollTimerId: ReturnType<typeof setTimeout> | null = null;
  let isFirstPoll = true;

  // ── URL 변경 시 제목 자동 조회 → 파일명 초기값 설정 ─────────────
  $effect(() => {
    const targetUrl = url;
    if (!targetUrl) { titleLoading = false; return; }
    if (fileNameEdited) return;
    titleLoading = true;
    const t = setTimeout(async () => {
      const info = await fetchClipInfo(targetUrl);
      if (info && info.title && !fileNameEdited) {
        const today = new Date();
        const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        recFileName = info.streamer
          ? `[${info.streamer}] ${info.title}_${dateStr}`
          : `${info.title}_${dateStr}`;
      }
      titleLoading = false;
    }, 600);
    return () => clearTimeout(t);
  });

  // ── 세그먼트 프록시 fetch ────────────────────────────────────────
  async function fetchSegment(segUrl: string): Promise<Uint8Array> {
    const proxyUrl = `/stream/proxy?url=${encodeURIComponent(segUrl)}`;
    const res = await fetch(proxyUrl);
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }

  // ── m3u8 폴링: 3초마다 새 세그먼트 다운로드 ────────────────────
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
      err = '';
    } catch (e) {
      // 에러를 UI에 표시 (status는 유지하여 폴링 계속)
      err = `폴링 오류: ${e instanceof Error ? e.message : String(e)}`;
    }
    if (status === 'recording') {
      pollTimerId = setTimeout(pollSegments, 3000);
    }
  }

  // ── 녹화 시작 ────────────────────────────────────────────────────
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
      if (!info) throw new Error('스트림 정보를 불러올 수 없습니다');
      if (!info.m3u8_url) throw new Error('스트림 URL을 찾을 수 없습니다');
      m3u8Url = info.m3u8_url;
      status = 'recording';
      await pollSegments();
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
      status = 'error';
    }
  }

  // ── 일시멈춤 / 재개 ──────────────────────────────────────────────
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

  // ── 녹화 중지 → FFmpeg로 세그먼트 병합 후 MP4 생성 ─────────────
  async function stopRecording() {
    if (status !== 'recording' && status !== 'paused') return;
    if (pollTimerId) { clearTimeout(pollTimerId); pollTimerId = null; }
    if (segments.length === 0) { err = '녹화된 세그먼트가 없습니다. 잠시 후 다시 시도하세요.'; status = 'error'; return; }

    let ffmpeg: Awaited<ReturnType<typeof loadFfmpeg>> | null = null;
    try {
      status = 'encoding';
      ffmpeg = await loadFfmpeg();

      // init + 모든 미디어 세그먼트를 하나의 바이너리로 병합 (fMP4 방식)
      // concat demuxer 대신 단일 파일로 합치면 ftyp/moov 박스 중복 문제가 없음
      const parts: Uint8Array[] = initData ? [initData, ...segments] : [...segments];
      const totalBytes = parts.reduce((a, p) => a + p.byteLength, 0);
      const combined = new Uint8Array(totalBytes);
      let byteOffset = 0;
      for (const part of parts) {
        combined.set(part, byteOffset);
        byteOffset += part.byteLength;
      }
      await ffmpeg.writeFile('input.mp4', combined);
      await ffmpeg.exec(['-i', 'input.mp4', '-c', 'copy', 'output.mp4']);

      // 결과 파일을 Blob URL로 변환
      const raw = (await ffmpeg.readFile('output.mp4')) as Uint8Array;
      const buf = new ArrayBuffer(raw.byteLength);
      new Uint8Array(buf).set(raw);
      const blob = new Blob([buf], { type: 'video/mp4' });
      const objUrl = URL.createObjectURL(blob);

      // FFmpeg 임시 파일 정리
      await ffmpeg.deleteFile('input.mp4');
      await ffmpeg.deleteFile('output.mp4');

      onSuccess?.({ filename: recFileName, url, blobUrl: objUrl });
      reset();
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
      status = 'error';
    } finally {
      ffmpeg?.terminate();
    }
  }

  // ── 상태 초기화 ──────────────────────────────────────────────────
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

  // 녹화 진행 중 여부 (일시멈춤 포함)
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
  {/if}
</div>
{#if err}
  <p class="error">{err}</p>
{/if}
