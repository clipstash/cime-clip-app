<script lang="ts">
  import { onDestroy } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { loadFfmpeg } from '$lib/ffmpeg';
  import { fetchClipInfo } from '$lib/api/clips';
  import { parseM3u8 } from '$lib/utils/stream';
  import { proxyUrl } from '$lib/utils/proxy';


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
  // sessions: 녹화 구간별 세그먼트 배열. 일시멈춤마다 새 세션 추가.
  // 타임스탬프 불연속을 피하기 위해 세션별로 별도 인코딩 후 파트 파일로 출력.
  let sessions: Uint8Array[][] = [[]];
  let segmentsSeen = new SvelteSet<string>();
  let pollTimerId: ReturnType<typeof setTimeout> | null = null;
  let isFirstPoll = true;
  // 폴링 세대 번호: pause/resume/stop 시 증가시켜 이전 in-flight 호출을 무효화
  let pollEpoch = 0;

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
    const res = await fetch(proxyUrl(segUrl));
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }

  // ── m3u8 폴링: 3초마다 새 세그먼트 다운로드 ────────────────────
  async function pollSegments() {
    const myEpoch = pollEpoch;
    if (status !== 'recording' || !m3u8Url) return;
    try {
      const { initUrl, segments: newSegs } = await parseM3u8(m3u8Url);
      if (status !== 'recording' || pollEpoch !== myEpoch) return;
      if (initUrl && !initData) {
        initData = await fetchSegment(initUrl);
        if (status !== 'recording' || pollEpoch !== myEpoch) return;
      }
      if (isFirstPoll) {
        // 첫 폴링(또는 재개 직후): 기존 세그먼트는 seen 처리만 하고 다운로드하지 않음
        for (const seg of newSegs) segmentsSeen.add(seg);
        isFirstPoll = false;
      } else {
        const currentSession = sessions[sessions.length - 1];
        for (const seg of newSegs) {
          if (!segmentsSeen.has(seg)) {
            const data = await fetchSegment(seg);
            if (status !== 'recording' || pollEpoch !== myEpoch) return;
            segmentsSeen.add(seg);
            currentSession.push(data);
            segCount++;
          }
        }
      }
      err = '';
    } catch (e) {
      // 에러를 UI에 표시 (status는 유지하여 폴링 계속)
      err = `폴링 오류: ${e instanceof Error ? e.message : String(e)}`;
    }
    if (status === 'recording' && pollEpoch === myEpoch) {
      pollTimerId = setTimeout(pollSegments, 3000);
    }
  }

  // ── 녹화 시작 ────────────────────────────────────────────────────
  async function submit() {
    if (!url || !recFileName || status !== 'idle') return;
    status = 'loading';
    err = '';
    initData = null;
    sessions = [[]];
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
    pollEpoch++;  // 현재 in-flight pollSegments 호출을 무효화
    if (pollTimerId) { clearTimeout(pollTimerId); pollTimerId = null; }
    status = 'paused';
  }

  function resumeRecording() {
    if (status !== 'paused') return;
    pollEpoch++;  // 새 세대 시작
    sessions.push([]);    // 재개 후 세그먼트는 새 세션으로 분리 (타임스탬프 불연속 방지)
    isFirstPoll = true;   // 일시멈춤 구간 세그먼트는 seen 처리만 하고 건너뜀
    status = 'recording';
    pollSegments();
  }

  // ── 녹화 중지 → FFmpeg로 세그먼트 병합 후 단일 MP4 생성 ──────────
  // 세션이 여럿이면(일시멈춤 사용) 세션별 파일을 concat demuxer로 합산
  // → 타임스탬프를 연속으로 재조정하여 영상 freeze/오디오 루프 없이 단일 파일 출력
  async function stopRecording() {
    if (status !== 'recording' && status !== 'paused') return;
    pollEpoch++;  // 현재 in-flight pollSegments 호출을 무효화
    if (pollTimerId) { clearTimeout(pollTimerId); pollTimerId = null; }

    const nonEmptySessions = sessions.filter(s => s.length > 0);
    if (nonEmptySessions.length === 0) { err = '녹화된 세그먼트가 없습니다. 잠시 후 다시 시도하세요.'; status = 'error'; return; }

    let ffmpeg: Awaited<ReturnType<typeof loadFfmpeg>> | null = null;
    try {
      status = 'encoding';
      ffmpeg = await loadFfmpeg();

      // 세션의 raw fMP4 바이트를 ffmpeg FS에 기록하는 헬퍼
      async function writeSession(idx: number, file: string) {
        const parts: Uint8Array[] = initData ? [initData, ...nonEmptySessions[idx]] : [...nonEmptySessions[idx]];
        const totalBytes = parts.reduce((a, p) => a + p.byteLength, 0);
        const combined = new Uint8Array(totalBytes);
        let byteOffset = 0;
        for (const part of parts) { combined.set(part, byteOffset); byteOffset += part.byteLength; }
        await ffmpeg!.writeFile(file, combined);
      }

      if (nonEmptySessions.length === 1) {
        // 일시멈춤 없음: init + 세그먼트를 단일 바이너리로 병합
        await writeSession(0, 'input.mp4');
        const ret = await ffmpeg.exec(['-i', 'input.mp4', '-c', 'copy', '-movflags', '+faststart', 'output.mp4']);
        await ffmpeg.deleteFile('input.mp4');
        if (ret !== 0) throw new Error(`인코딩 실패 (코드: ${ret})`);
      } else {
        // 일시멈춤 있음:
        // 1단계 — 세션별 raw fMP4를 정규화된 MP4로 변환 (-copyts -start_at_zero 로 타임스탬프 0 기준으로 재조정)
        // 2단계 — concat demuxer로 순차 연결 (각 파일이 0부터 시작하므로 concat이 자동 오프셋 적용)
        const concatLines: string[] = [];
        for (let i = 0; i < nonEmptySessions.length; i++) {
          const rawFile = `session_raw_${i}.mp4`;
          const normFile = `session_${i}.mp4`;
          await writeSession(i, rawFile);
          const ret = await ffmpeg.exec(['-i', rawFile, '-c', 'copy', '-copyts', '-start_at_zero', normFile]);
          await ffmpeg.deleteFile(rawFile);
          if (ret !== 0) throw new Error(`세션 ${i} 타임스탬프 정규화 실패 (코드: ${ret})`);
          concatLines.push(`file '${normFile}'`);
        }
        await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatLines.join('\n')));
        const ret = await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', '-movflags', '+faststart', 'output.mp4']);
        await ffmpeg.deleteFile('concat.txt');
        for (let i = 0; i < nonEmptySessions.length; i++) await ffmpeg.deleteFile(`session_${i}.mp4`);
        if (ret !== 0) throw new Error(`세션 병합 실패 (코드: ${ret})`);
      }

      const raw = (await ffmpeg.readFile('output.mp4')) as Uint8Array;
      const buf = new ArrayBuffer(raw.byteLength);
      new Uint8Array(buf).set(raw);
      const blob = new Blob([buf], { type: 'video/mp4' });
      const objUrl = URL.createObjectURL(blob);
      await ffmpeg.deleteFile('output.mp4');

      onSuccess?.({ filename: `${recFileName}.mp4`, url, blobUrl: objUrl });
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
    pollEpoch++;  // 현재 in-flight pollSegments 호출을 무효화
    if (pollTimerId) { clearTimeout(pollTimerId); pollTimerId = null; }
    initData = null;
    sessions = [[]];
    segmentsSeen = new SvelteSet();
    segCount = 0;
    isFirstPoll = true;
    status = 'idle';
    err = '';
  }

  // 녹화 진행 중 여부 (일시멈춤 포함)
  const isActive = $derived(status === 'recording' || status === 'paused');

  // 컴포넌트 unmount 시 폴링 타이머 정리 (페이지 이동 중 백그라운드 polling 방지)
  onDestroy(() => {
    if (pollTimerId) { clearTimeout(pollTimerId); pollTimerId = null; }
  });
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
