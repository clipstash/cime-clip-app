<script lang="ts">
  import { fetchFile } from '@ffmpeg/util';
  import { loadFfmpeg } from '$lib/ffmpeg';
  import { fetchClipInfo } from '$lib/api/clips';
  import { parseM3u8 } from '$lib/utils/stream';
  import { API_URL } from '$lib/api/config';

  type Props = {
    url: string;
    totalSec: number;
    durationLoaded: boolean;
    onSuccess: (info: { title: string | null; startSec: number; endSec: number; blobUrl: string }) => void;
  };

  const { url, totalSec, durationLoaded, onSuccess }: Props = $props();

  let startH = $state(0), startM = $state(0), startS = $state(0);
  let endH   = $state(0), endM   = $state(0), endS   = $state(30);
  let focusedField = $state<string | null>(null);
  let trackEl = $state<HTMLDivElement | null>(null);
  let dragging = $state<'start' | 'end' | null>(null);
  let err = $state('');

  type DlStatus = 'idle' | 'loading' | 'downloading' | 'encoding' | 'done' | 'error';
  let dlStatus = $state<DlStatus>('idle');
  let progress = $state(0);
  let progressLabel = $state('');

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

      // fMP4 streams require an init segment prepended to each segment
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
      await ffmpeg.exec(['-ss', String(startSec), '-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-t', String(endSec - startSec), '-c', 'copy', 'output.mp4']);
      progress = 96;

      const raw = (await ffmpeg.readFile('output.mp4')) as Uint8Array;
      const buf = new ArrayBuffer(raw.byteLength);
      new Uint8Array(buf).set(raw);
      const blob = new Blob([buf], { type: 'video/mp4' });
      const objUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      const safe = (info.title ?? 'clip').replace(/[\\/:*?"<>|]/g, '_');
      a.href = objUrl;
      a.download = `${safe}.mp4`;
      a.click();

      for (const name of segNames) await ffmpeg.deleteFile(name);
      await ffmpeg.deleteFile('concat.txt');
      await ffmpeg.deleteFile('output.mp4');

      progress = 100;
      progressLabel = '완료!';
      dlStatus = 'done';
      onSuccess({ title: info.title, startSec, endSec, blobUrl: objUrl });
      setTimeout(() => { dlStatus = 'idle'; progress = 0; progressLabel = ''; }, 3000);
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
      dlStatus = 'error';
    }
  }

  const busy = $derived(dlStatus === 'loading' || dlStatus === 'downloading' || dlStatus === 'encoding');
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
  <button class="submit-btn" onclick={submit} disabled={busy || !url || !!timeError}>
    {dlStatus === 'done' ? '완료 ✓' : busy ? '처리중...' : '클립 생성 ✦'}
  </button>
</div>

{#if busy}
  <div class="form-row">
    <div class="dl-progress">
      <div class="progress-bar"><div class="progress-fill" style="width: {progress}%"></div></div>
      <span class="progress-label">{progressLabel}</span>
    </div>
  </div>
{/if}

{#if timeError}<p class="error">{timeError}</p>
{:else if err}<p class="error">{err}</p>{/if}
