<script lang="ts">
  import { onMount } from 'svelte';
  import '../../styles/page.css';
  import { getClips, createClip, deleteClip, type Clip } from '$lib/api/clips';
  import { statusColor, statusLabel } from '$lib/utils/status';
  import Background from '$lib/components/Background.svelte';
  import Nav from '$lib/components/Nav.svelte';

  // ── Form state ──
  let url = $state('');
  let startH = $state(0), startM = $state(0), startS = $state(0);
  let endH   = $state(0), endM   = $state(0), endS   = $state(30);
  let totalSec = $state(3600);
  let focusedField = $state<string | null>(null);
  let loading = $state(false);
  let errorMsg = $state('');

  // ── Clip list ──
  let clips = $state<Clip[]>([]);

  // ── Video preview ──
  let probeEl = $state<HTMLVideoElement | null>(null);
  let videoEl = $state<HTMLVideoElement | null>(null);
  let videoCurrentTime = $state(0);
  let videoLoaded = $state(false);
  let videoError = $state(false);
  let showVideo = $state(false);

  // ── Modal ──
  let modalUrl = $state('');
  let showModal = $state(false);

  // ── Timeline ──
  let trackEl = $state<HTMLDivElement | null>(null);
  let dragging = $state<'start' | 'end' | null>(null);

  const startSec    = $derived(startH * 3600 + startM * 60 + startS);
  const endSec      = $derived(endH   * 3600 + endM   * 60 + endS);
  const clipDuration = $derived(Math.max(0, endSec - startSec));
  const startPct    = $derived(totalSec > 0 ? Math.min(100, (startSec / totalSec) * 100) : 0);
  const endPct      = $derived(totalSec > 0 ? Math.min(100, (endSec   / totalSec) * 100) : 100);
  const playheadPct = $derived(totalSec > 0 ? Math.min(100, (videoCurrentTime / totalSec) * 100) : 0);

  const fieldMap: Record<string, { get: () => number; set: (v: number) => void; max: number }> = {
    startH: { get: () => startH, set: (v) => (startH = v), max: Infinity },
    startM: { get: () => startM, set: (v) => (startM = v), max: 59 },
    startS: { get: () => startS, set: (v) => (startS = v), max: 59 },
    endH:   { get: () => endH,   set: (v) => (endH   = v), max: Infinity },
    endM:   { get: () => endM,   set: (v) => (endM   = v), max: 59 },
    endS:   { get: () => endS,   set: (v) => (endS   = v), max: 59 },
  };

  function step(delta: number, group: 'start' | 'end') {
    const key = focusedField ?? (group === 'start' ? 'startS' : 'endS');
    const field = fieldMap[key];
    if (!field) return;
    field.set(Math.max(0, Math.min(field.max, field.get() + delta)));
  }

  function setFromSec(target: 'start' | 'end', sec: number) {
    sec = Math.max(0, Math.min(totalSec, Math.round(sec)));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (target === 'start') { startH = h; startM = m; startS = s; }
    else                    { endH   = h; endM   = m; endS   = s; }
    if (videoEl) videoEl.currentTime = sec;
  }

  function startDrag(e: PointerEvent, which: 'start' | 'end') {
    e.preventDefault();
    e.stopPropagation();
    dragging = which;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onDragMove(e: PointerEvent) {
    if (!dragging || !trackEl) return;
    const rect = trackEl.getBoundingClientRect();
    setFromSec(dragging, Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * totalSec);
  }

  function seekToClick(e: MouseEvent) {
    if (dragging || !trackEl || !videoEl) return;
    const rect = trackEl.getBoundingClientRect();
    videoEl.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * totalSec;
  }

  function formatTime(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function localUrl(u?: string) {
    return u ? u.replace(/^https?:\/\/localhost:\d+/, '') : '';
  }

  function openSourcePreview() {
    videoLoaded = false;
    videoError = false;
    showVideo = true;
  }

  function closeSourcePreview() {
    showVideo = false;
    videoLoaded = false;
    videoError = false;
  }

  function openModal(fileUrl: string) {
    modalUrl = localUrl(fileUrl);
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    modalUrl = '';
  }

  async function fetchClips() {
    clips = await getClips();
  }

  async function submitClip() {
    if (!url) return;
    loading = true;
    errorMsg = '';
    try {
      await createClip(url, startSec, endSec);
      await fetchClips();
      url = '';
      showVideo = false;
    } catch (e: any) {
      errorMsg = e.message;
    } finally {
      loading = false;
    }
  }

  async function removeClip(id: string) {
    try {
      await deleteClip(id);
      clips = clips.filter((c) => c.id !== id);
    } catch (e: any) {
      errorMsg = e.message;
    }
  }

  onMount(() => {
    fetchClips();
    const interval = setInterval(fetchClips, 3000);
    return () => clearInterval(interval);
  });
</script>

<Background />
<Nav active="clips" />

<section class="hero">
  <p class="label">cime clip downloader</p>
  <h1>Download.<br/>Clip. Share.</h1>
  <p class="desc">씨미 라이브 클립을 원하는 구간만<br/>빠르게 다운로드하세요.</p>

  <div class="form-card">
    <div class="form-row">
      <input type="text" placeholder="URL을 입력하세요" bind:value={url} />
      {#if url && !showVideo}
        <button type="button" class="preview-open-btn" onclick={openSourcePreview}>미리보기</button>
      {/if}
    </div>

    <div class="timeline-wrap">
      <div class="timeline-track" bind:this={trackEl} onclick={seekToClick} role="presentation">
        <div class="timeline-fill" style="left: {startPct}%; width: {Math.max(0, endPct - startPct)}%"></div>
        {#if videoLoaded}
          <div class="timeline-playhead" style="left: {playheadPct}%"></div>
        {/if}
        <div
          class="timeline-handle" style="left: {startPct}%"
          onpointerdown={(e) => startDrag(e, 'start')}
          onpointermove={onDragMove} onpointerup={() => (dragging = null)}
          role="slider" aria-label="시작 지점" aria-valuenow={startSec} tabindex="0"
        ></div>
        <div
          class="timeline-handle" style="left: {endPct}%"
          onpointerdown={(e) => startDrag(e, 'end')}
          onpointermove={onDragMove} onpointerup={() => (dragging = null)}
          role="slider" aria-label="종료 지점" aria-valuenow={endSec} tabindex="0"
        ></div>
      </div>
      <div class="timeline-labels">
        <span>{formatTime(0)}</span>
        <span class="timeline-badge">{formatTime(clipDuration)} 구간</span>
        <span>{formatTime(totalSec)}</span>
      </div>
    </div>

    <div class="form-row time-row">
      <div class="time-input">
        <label>시작</label>
        <div class="hms-inputs">
          <input type="number" bind:value={startH} min="0" aria-label="시작 시" onfocus={() => (focusedField = 'startH')} />
          <span class="hms-sep">:</span>
          <input type="number" bind:value={startM} min="0" max="59" aria-label="시작 분" onfocus={() => (focusedField = 'startM')} />
          <span class="hms-sep">:</span>
          <input type="number" bind:value={startS} min="0" max="59" aria-label="시작 초" onfocus={() => (focusedField = 'startS')} />
          <div class="hms-stepper">
            <button type="button" class="step-btn" onmousedown={(e) => { e.preventDefault(); step(1, 'start'); }}>▲</button>
            <button type="button" class="step-btn" onmousedown={(e) => { e.preventDefault(); step(-1, 'start'); }}>▼</button>
          </div>
        </div>
      </div>
      <div class="time-input">
        <label>종료</label>
        <div class="hms-inputs">
          <input type="number" bind:value={endH} min="0" aria-label="종료 시" onfocus={() => (focusedField = 'endH')} />
          <span class="hms-sep">:</span>
          <input type="number" bind:value={endM} min="0" max="59" aria-label="종료 분" onfocus={() => (focusedField = 'endM')} />
          <span class="hms-sep">:</span>
          <input type="number" bind:value={endS} min="0" max="59" aria-label="종료 초" onfocus={() => (focusedField = 'endS')} />
          <div class="hms-stepper">
            <button type="button" class="step-btn" onmousedown={(e) => { e.preventDefault(); step(1, 'end'); }}>▲</button>
            <button type="button" class="step-btn" onmousedown={(e) => { e.preventDefault(); step(-1, 'end'); }}>▼</button>
          </div>
        </div>
      </div>
      <button class="submit-btn" onclick={submitClip} disabled={loading}>
        {loading ? '처리중...' : '클립 생성 ✦'}
      </button>
    </div>

    {#if errorMsg}
      <p class="error">{errorMsg}</p>
    {/if}
  </div>

  <!-- URL 메타데이터 자동 감지 (hidden probe) -->
  {#if url}
    <video
      bind:this={probeEl}
      src={url}
      preload="metadata"
      style="display:none"
      onloadedmetadata={() => {
        if (probeEl && isFinite(probeEl.duration)) totalSec = Math.floor(probeEl.duration);
      }}
    ><track kind="captions" /></video>
  {/if}

  <!-- 소스 영상 미리보기 -->
  {#if showVideo && url}
    <div class="source-preview-wrap">
      <div class="source-preview-header">
        <span class="source-preview-label">소스 미리보기</span>
        <button type="button" class="video-close-btn" onclick={closeSourcePreview} aria-label="닫기">×</button>
      </div>
      {#if !videoError}
        <video
          bind:this={videoEl}
          src={url}
          class="video-preview"
          controls
          onloadstart={() => { videoLoaded = false; videoCurrentTime = 0; videoError = false; }}
          onloadedmetadata={() => {
            if (videoEl && isFinite(videoEl.duration)) { totalSec = Math.floor(videoEl.duration); videoLoaded = true; }
          }}
          ontimeupdate={() => { if (videoEl) videoCurrentTime = videoEl.currentTime; }}
          onerror={() => { videoError = true; videoLoaded = false; }}
        ><track kind="captions" /></video>
      {:else}
        <div class="video-error">직접 미리보기를 지원하지 않는 URL입니다.</div>
      {/if}
    </div>
  {/if}
</section>

<section class="clips-section">
  <h2>클립 목록</h2>
  {#if clips.length === 0}
    <p class="empty">아직 클립이 없어요. URL을 입력해 첫 클립을 만들어보세요!</p>
  {:else}
    <div class="clips-grid">
      {#each clips as clip}
        <div class="clip-card">
          <div class="clip-header">
            <div class="clip-header-left">
              <span class="platform">{clip.platform}</span>
              <span class="status" style="color: {statusColor(clip.status)}">{statusLabel(clip.status)}</span>
            </div>
            <button class="delete-btn" onclick={() => removeClip(clip.id)} aria-label="삭제">×</button>
          </div>
          <p class="clip-title">{clip.title ?? '정보 로딩 중...'}</p>
          <p class="clip-sub">{clip.streamer ?? '-'}</p>
          <div class="clip-meta">
            <span>{clip.start_time}s ~ {clip.end_time}s</span>
            {#if clip.file_size}
              <span>{(clip.file_size / 1024 / 1024).toFixed(1)} MB</span>
            {/if}
          </div>
          {#if clip.file_url && clip.status === 'completed'}
            <div class="clip-actions">
              <button class="preview-card-btn" onclick={() => openModal(clip.file_url!)}>미리보기</button>
              <a class="download-btn" href={localUrl(clip.file_url)} download>다운로드</a>
            </div>
          {/if}
          {#if clip.error_message}
            <p class="clip-error">{clip.error_message}</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

{#if showModal}
  <div class="modal-backdrop" onclick={closeModal} onkeydown={(e) => e.key === 'Escape' && closeModal()} role="presentation">
    <div class="modal-box" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <button class="modal-close" onclick={closeModal} aria-label="닫기">×</button>
      <video class="modal-video" src={modalUrl} controls autoplay><track kind="captions" /></video>
    </div>
  </div>
{/if}
