<script lang="ts">
  import { fetchFile } from '@ffmpeg/util';
  import { loadFfmpeg } from '$lib/ffmpeg';
  import { fetchClipInfo } from '$lib/api/clips';
  import { parseM3u8 } from '$lib/utils/stream';

  type Props = {
    url: string;
    totalSec: number;
    durationLoaded: boolean;
    onSuccess: (info: { title: string | null; startSec: number; endSec: number, blobUrl: string  }) => void;
    onVideoSuccess: (info: { title: string | null; url: string }) => void;
  };

  const { url, totalSec, durationLoaded, onSuccess, onVideoSuccess }: Props = $props();

  let startH = $state(0), startM = $state(0), startS = $state(0);
  let endH   = $state(0), endM   = $state(0), endS   = $state(0);

  $effect(() => {
    void url;
    startH = 0; startM = 0; startS = 0;
    endH = 0; endM = 0; endS = 0;
  });

  $effect(() => {
    if (!durationLoaded || totalSec <= 0) return;
    setFromSec('end', totalSec);
  });
  let focusedField = $state<string | null>(null);
  let trackEl = $state<HTMLDivElement | null>(null);
  let dragging = $state<'start' | 'end' | null>(null);
  let err = $state('');

  let cancelClipRequested = $state(false);
  let cancelVideoRequested = $state(false);

  type DlStatus = 'idle' | 'loading' | 'downloading' | 'encoding' | 'done' | 'error';
  let dlStatus = $state<DlStatus>('idle');
  let progress = $state(0);
  let progressLabel = $state('');
  let dlBlobUrl = $state('');
  let dlFileName = $state('');

const startSec     = $derived(startH * 3600 + startM * 60 + startS);
  const endSec       = $derived(endH   * 3600 + endM   * 60 + endS);
  const clipDuration = $derived(Math.max(0, endSec - startSec));
  const startPct     = $derived(totalSec > 0 ? Math.min(100, (startSec / totalSec) * 100) : 0);
  const endPct       = $derived(totalSec > 0 ? Math.min(100, (endSec   / totalSec) * 100) : 100);

  const timeError = $derived(
    endSec <= startSec
      ? '종료 시간이 시작 시간보다 늦어야 합니다'
      : clipDuration < 1
        ? '클립 길이는 최소 1초 이상이어야 합니다'
        : durationLoaded && endSec > totalSec
          ? '종료 시간이 영상 길이를 초과합니다'
          : null
  );

  const fieldMap: Record<string, { get: () => number; set: (v: number) => void; max: number }> = {
    startH: { get: () => startH, set: (v) => (startH = v), max: Infinity },
    startM: { get: () => startM, set: (v) => (startM = v), max: 59 },
    startS: { get: () => startS, set: (v) => (startS = v), max: 59 },
    endH:   { get: () => endH,   set: (v) => (endH   = v), max: Infinity },
    endM:   { get: () => endM,   set: (v) => (endM   = v), max: 59 },
    endS:   { get: () => endS,   set: (v) => (endS   = v), max: 59 },
  };

  function clampField(key: string) {
    const field = fieldMap[key];
    if (!field || field.max === Infinity) return;
    field.set(Math.max(0, Math.min(field.max, field.get())));
  }

  function step(delta: number, group: 'start' | 'end') {
    const key = focusedField ?? (group === 'start' ? 'startS' : 'endS');
    const field = fieldMap[key];
    if (!field) return;
    field.set(Math.max(0, Math.min(field.max, field.get() + delta)));
  }

  function setFromSec(target: 'start' | 'end', sec: number) {
    sec = Math.max(0, Math.min(totalSec, Math.round(sec)));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (target === 'start') { startH = h; startM = m; startS = s; }
    else                    { endH   = h; endM   = m; endS   = s; }
  }

  function startDrag(e: PointerEvent, which: 'start' | 'end') {
    e.preventDefault(); e.stopPropagation();
    dragging = which;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onDragMove(e: PointerEvent) {
    if (!dragging || !trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    setFromSec(dragging, Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * totalSec);
  }

  function seekToClick(e: MouseEvent) {
    if (dragging || !trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    setFromSec(dragging ?? 'start', Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * totalSec);
  }

  function formatTime(sec: number) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  async function submit() {
    if (!url || dlStatus !== 'idle' || !!timeError) return;
    cancelClipRequested = false;
    dlStatus = 'loading';
    err = '';
    progress = 0;

    try {
      const info = await fetchClipInfo(url);
      if (!info.m3u8_url) throw new Error('스트림 URL을 찾을 수 없습니다');

      const { initUrl, segments, durations } = await parseM3u8(info.m3u8_url);
      if (segments.length === 0) throw new Error('세그먼트를 찾을 수 없습니다');

      // 시간 입력을 현재 윈도우 기준(0-indexed)으로 취급하여 세그먼트 선택
      let cumTime = 0;
      const selectedIdxs: number[] = [];
      for (let i = 0; i < segments.length; i++) {
        const segDur = durations[i] || 2;
        if (cumTime + segDur > startSec && cumTime < endSec) {
          selectedIdxs.push(i);
        }
        cumTime += segDur;
      }
      if (selectedIdxs.length === 0) throw new Error('지정한 구간이 현재 스트림 범위를 벗어납니다');

      const ffmpeg = await loadFfmpeg();
      dlStatus = 'downloading';

      // init 세그먼트 다운로드
      let initData: Uint8Array | null = null;
      if (initUrl) {
        const proxyInit = `/stream/proxy?url=${encodeURIComponent(initUrl)}`;
        initData = await fetchFile(proxyInit);
      }

      // 선택된 세그먼트만 다운로드
      const segParts: Uint8Array[] = [];
      for (let idx = 0; idx < selectedIdxs.length; idx++) {
        if (cancelClipRequested) { dlStatus = 'idle'; progress = 0; progressLabel = ''; return; }
        const segUrl = `/stream/proxy?url=${encodeURIComponent(segments[selectedIdxs[idx]])}`;
        segParts.push(await fetchFile(segUrl));
        progress = Math.round(((idx + 1) / selectedIdxs.length) * 80);
        progressLabel = `${idx + 1} / ${selectedIdxs.length} 세그먼트`;
      }
      if (cancelClipRequested) { dlStatus = 'idle'; progress = 0; progressLabel = ''; return; }

      // init(1회) + 세그먼트들을 단일 바이너리로 합산
      const parts: Uint8Array[] = initData ? [initData, ...segParts] : segParts;
      const totalBytes = parts.reduce((a, p) => a + p.byteLength, 0);
      const combined = new Uint8Array(totalBytes);
      let byteOffset = 0;
      for (const part of parts) { combined.set(part, byteOffset); byteOffset += part.byteLength; }
      await ffmpeg.writeFile('input.mp4', combined);

      dlStatus = 'encoding';
      progressLabel = 'MP4 변환 중...';
      progress = 82;

      // 단일 파일로 정확한 타임스탬프 시크
      await ffmpeg.exec(['-ss', String(startSec), '-i', 'input.mp4', '-t', String(endSec - startSec), '-c', 'copy', 'output.mp4']);
      progress = 96;

      const raw = (await ffmpeg.readFile('output.mp4')) as Uint8Array;
      const buf = new ArrayBuffer(raw.byteLength);
      new Uint8Array(buf).set(raw);
      const blob = new Blob([buf], { type: 'video/mp4' });
      const objUrl = URL.createObjectURL(blob);

      await ffmpeg.deleteFile('input.mp4');
      await ffmpeg.deleteFile('output.mp4');

      progress = 100;
      progressLabel = '완료!';
      dlBlobUrl = objUrl;
      dlFileName = `${(info.title ?? 'clip').replace(/[\\/:*?"<>|]/g, '_')}.mp4`;
      dlStatus = 'done';
      onSuccess({ title: info.title, startSec, endSec, blobUrl: objUrl });
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
      dlStatus = 'error';
    }
  }

  function triggerDownload() {
    const a = document.createElement('a');
    a.href = dlBlobUrl;
    a.download = dlFileName;
    a.click();
    URL.revokeObjectURL(dlBlobUrl);
    dlBlobUrl = '';
    dlFileName = '';
    dlStatus = 'idle';
    progress = 0;
    progressLabel = '';
  }

  const busy = $derived(dlStatus === 'loading' || dlStatus === 'downloading' || dlStatus === 'encoding');

  // ── VOD 다운로드 ──
  let videoDlStatus = $state<DlStatus>('idle');
  let videoProgress = $state(0);
  let videoProgressLabel = $state('');
  let videoDlBlobUrl = $state('');
  let videoDlFileName = $state('');

  async function videoSubmit() {
    if (!url || videoDlStatus !== 'idle') return;
    cancelVideoRequested = false;
    videoDlStatus = 'loading';
    videoProgress = 0;

    try {
      const info = await fetchClipInfo(url);
      if (!info.m3u8_url) throw new Error('스트림 URL을 찾을 수 없습니다');

      const { initUrl: vInitUrl, segments } = await parseM3u8(info.m3u8_url);
      if (segments.length === 0) throw new Error('세그먼트를 찾을 수 없습니다');

      const ffmpeg = await loadFfmpeg();

      videoDlStatus = 'downloading';
      const segNames: string[] = [];

      let vInitData: Uint8Array | null = null;
      if (vInitUrl) {
        const proxyInit = `/stream/proxy?url=${encodeURIComponent(vInitUrl)}`;
        vInitData = await fetchFile(proxyInit);
      }

      for (let i = 0; i < segments.length; i++) {
        if (cancelVideoRequested) { videoDlStatus = 'idle'; videoProgress = 0; videoProgressLabel = ''; return; }
        const segUrl = `/stream/proxy?url=${encodeURIComponent(segments[i])}`;
        const segData = await fetchFile(segUrl);
        const name = `vseg${String(i).padStart(5, '0')}.mp4`;
        if (vInitData) {
          const combined = new Uint8Array(vInitData.byteLength + segData.byteLength);
          combined.set(vInitData, 0);
          combined.set(segData, vInitData.byteLength);
          await ffmpeg.writeFile(name, combined);
        } else {
          await ffmpeg.writeFile(name, segData);
        }
        segNames.push(name);
        videoProgress = Math.round(((i + 1) / segments.length) * 80);
        videoProgressLabel = `${i + 1} / ${segments.length} 세그먼트`;
      }
      if (cancelVideoRequested) { videoDlStatus = 'idle'; videoProgress = 0; videoProgressLabel = ''; return; }

      videoDlStatus = 'encoding';
      videoProgressLabel = 'MP4 변환 중...';
      videoProgress = 82;

      const concatList = segNames.map((n) => `file '${n}'`).join('\n');
      await ffmpeg.writeFile('vconcat.txt', concatList);
      await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'vconcat.txt', '-c', 'copy', 'voutput.mp4']);
      videoProgress = 96;

      const raw = (await ffmpeg.readFile('voutput.mp4')) as Uint8Array;
      const buf = new ArrayBuffer(raw.byteLength);
      new Uint8Array(buf).set(raw);
      const blob = new Blob([buf], { type: 'video/mp4' });
      const objUrl = URL.createObjectURL(blob);

      for (const name of segNames) await ffmpeg.deleteFile(name);
      await ffmpeg.deleteFile('vconcat.txt');
      await ffmpeg.deleteFile('voutput.mp4');

      videoProgress = 100;
      videoProgressLabel = '완료!';
      videoDlBlobUrl = objUrl;
      videoDlFileName = `${(info.title ?? 'video').replace(/[\\/:*?"<>|]/g, '_')}.mp4`;
      videoDlStatus = 'done';
      onVideoSuccess({ title: info.title, url });
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
      videoDlStatus = 'error';
    }
  }

  function triggerVideoDownload() {
    const a = document.createElement('a');
    a.href = videoDlBlobUrl;
    a.download = videoDlFileName;
    a.click();
    URL.revokeObjectURL(videoDlBlobUrl);
    videoDlBlobUrl = '';
    videoDlFileName = '';
    videoDlStatus = 'idle';
    videoProgress = 0;
    videoProgressLabel = '';
  }

  const videoBusy = $derived(videoDlStatus === 'loading' || videoDlStatus === 'downloading' || videoDlStatus === 'encoding');
</script>

{#if durationLoaded}
  <div class="timeline-wrap">
    <div class="timeline-track" bind:this={trackEl} onclick={seekToClick} role="presentation">
      <div class="timeline-fill" style="left: {startPct}%; width: {Math.max(0, endPct - startPct)}%"></div>
      <div class="timeline-handle" style="left: {startPct}%"
        onpointerdown={(e) => startDrag(e, 'start')} onpointermove={onDragMove} onpointerup={() => (dragging = null)}
        role="slider" aria-label="시작 지점" aria-valuenow={startSec} aria-valuemin={0} aria-valuemax={totalSec} tabindex="0"
      ></div>
      <div class="timeline-handle" style="left: {endPct}%"
        onpointerdown={(e) => startDrag(e, 'end')} onpointermove={onDragMove} onpointerup={() => (dragging = null)}
        role="slider" aria-label="종료 지점" aria-valuenow={endSec} aria-valuemin={0} aria-valuemax={totalSec} tabindex="0"
      ></div>
    </div>
    <div class="timeline-labels">
      <span>{formatTime(0)}</span>
      <span class="timeline-badge">{formatTime(clipDuration)} 구간</span>
      <span>{formatTime(totalSec)}</span>
    </div>
  </div>
{/if}

<div class="form-row time-row clip-action">
  <div class="time-input">
    <span class="time-label" aria-hidden="true">클립</span>
    <div class="hms-inputs">
      <input type="number" bind:value={startH} min="0" aria-label="시작 시" onfocus={() => (focusedField = 'startH')} oninput={() => clampField('startH')} />
      <span class="hms-sep">:</span>
      <input type="number" bind:value={startM} min="0" max="59" aria-label="시작 분" onfocus={() => (focusedField = 'startM')} oninput={() => clampField('startM')} />
      <span class="hms-sep">:</span>
      <input type="number" bind:value={startS} min="0" max="59" aria-label="시작 초" onfocus={() => (focusedField = 'startS')} oninput={() => clampField('startS')} />
      <div class="hms-stepper">
        <button type="button" class="step-btn" onmousedown={(e) => { e.preventDefault(); step(1, 'start'); }}>▲</button>
        <button type="button" class="step-btn" onmousedown={(e) => { e.preventDefault(); step(-1, 'start'); }}>▼</button>
      </div>
    </div>
  </div>
  <div class="time-input">
    <span class="time-label" aria-hidden="true">→</span>
    <div class="hms-inputs">
      <input type="number" bind:value={endH} min="0" aria-label="종료 시" onfocus={() => (focusedField = 'endH')} oninput={() => clampField('endH')} />
      <span class="hms-sep">:</span>
      <input type="number" bind:value={endM} min="0" max="59" aria-label="종료 분" onfocus={() => (focusedField = 'endM')} oninput={() => clampField('endM')} />
      <span class="hms-sep">:</span>
      <input type="number" bind:value={endS} min="0" max="59" aria-label="종료 초" onfocus={() => (focusedField = 'endS')} oninput={() => clampField('endS')} />
      <div class="hms-stepper">
        <button type="button" class="step-btn" onmousedown={(e) => { e.preventDefault(); step(1, 'end'); }}>▲</button>
        <button type="button" class="step-btn" onmousedown={(e) => { e.preventDefault(); step(-1, 'end'); }}>▼</button>
      </div>
    </div>
  </div>
  {#if dlStatus === 'done'}
    <button class="submit-btn" onclick={triggerDownload}>다운로드 ↓</button>
  {:else if busy}
    <button class="submit-btn" disabled>처리중...</button>
    <button class="cancel-btn" onclick={() => (cancelClipRequested = true)}>취소 ✕</button>
  {:else}
    <button class="submit-btn" onclick={submit} disabled={!url || !!timeError}>클립 생성 ✦</button>
  {/if}
  {#if videoDlStatus === 'done'}
    <button class="submit-btn" onclick={triggerVideoDownload}>다운로드 ↓</button>
  {:else if videoBusy}
    <button class="submit-btn" disabled>처리중...</button>
    <button class="cancel-btn" onclick={() => (cancelVideoRequested = true)}>취소 ✕</button>
  {:else}
    <button class="submit-btn" onclick={videoSubmit} disabled={!url}>전체 다운로드 ✦</button>
  {/if}
</div>

{#if busy}
  <div class="form-row">
    <div class="dl-progress">
      <div class="progress-bar"><div class="progress-fill" style="width: {progress}%"></div></div>
      <span class="progress-label">{progressLabel}</span>
    </div>
  </div>
{/if}

{#if videoBusy}
  <div class="form-row">
    <div class="dl-progress">
      <div class="progress-bar"><div class="progress-fill" style="width: {videoProgress}%"></div></div>
      <span class="progress-label">{videoProgressLabel}</span>
    </div>
  </div>
{/if}

{#if timeError}<p class="error">{timeError}</p>
{:else if err}<p class="error">{err}</p>{/if}
