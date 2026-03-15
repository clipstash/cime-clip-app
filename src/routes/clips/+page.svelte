<script lang="ts">
  import { onMount } from 'svelte';
  import '../../styles/page.css';
  import { getClips, createClip, deleteClip, type Clip } from '$lib/api/clips';
  import { getVideos, createVideo, deleteVideo, type Video } from '$lib/api/videos';
  import {
    startRecord, stopRecord, pauseRecord, resumeRecord, cancelRecord,
    getActiveRecords, getRecord, type ActiveRecord
  } from '$lib/api/record';
  import { statusColor, statusLabel } from '$lib/utils/status';
  import { localUrl } from '$lib/utils/url';
  import Background from '$lib/components/Background.svelte';
  import Nav from '$lib/components/Nav.svelte';

  // ── Mode ──
  let mode = $state<'clip' | 'video' | 'record'>('clip');

  // ── Shared ──
  let loading = $state(false);
  let errorMsg = $state('');
  let modalUrl = $state('');
  let showModal = $state(false);

  // ── Clip form state ──
  let url = $state('');
  let startH = $state(0), startM = $state(0), startS = $state(0);
  let endH   = $state(0), endM   = $state(0), endS   = $state(30);
  let totalSec = $state(3600);
  let focusedField = $state<string | null>(null);
  let clips = $state<Clip[]>([]);

  // ── Video form state ──
  let videoUrl = $state('');
  let totalTime = $state('');
  let videos = $state<Video[]>([]);

  // ── Record form state ──
  let recUrl = $state('');
  let recFileName = $state('');
  let records = $state<ActiveRecord[]>([]);
  let pausedSet = $state(new Set<string>());
  let pausePending = $state(new Set<string>());

  // ── Clip preview ──
  let probeEl = $state<HTMLVideoElement | null>(null);
  let videoEl = $state<HTMLVideoElement | null>(null);
  let videoCurrentTime = $state(0);
  let videoLoaded = $state(false);
  let videoError = $state(false);
  let showVideo = $state(false);

  // ── Timeline ──
  let trackEl = $state<HTMLDivElement | null>(null);
  let dragging = $state<'start' | 'end' | null>(null);
  let durationLoaded = $state(false);

  $effect(() => {
    url;
    durationLoaded = false;
  });

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

  async function fetchVideos() {
    videos = await getVideos();
  }

  async function fetchActive() {
    const { active, paused } = await getActiveRecords();
    for (const filename of pausePending) {
      if (pausedSet.has(filename)) paused.add(filename);
      else paused.delete(filename);
    }
    pausedSet = paused;
    const activeNames = new Set(active.map((r) => r.filename));

    const mergedActive = active.map((r) => {
      const existing = records.find((e) => e.filename === r.filename);
      if (existing?.status === 'stopping') return existing;
      return existing?.id ? { ...r, id: existing.id } : r;
    });

    const refreshed = await Promise.all(
      records
        .filter((r) => !activeNames.has(r.filename) && r.status !== 'completed' && r.status !== 'failed')
        .map(async (r) => {
          if (!r.id) return r;
          const fresh = await getRecord(r.id);
          return fresh ?? r;
        })
    );

    const terminal = records.filter((r) => !activeNames.has(r.filename) && (r.status === 'completed' || r.status === 'failed'));
    records = [...mergedActive, ...refreshed, ...terminal];
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

  async function submitVideo() {
    if (!videoUrl) return;
    loading = true;
    errorMsg = '';
    try {
      await createVideo(videoUrl, totalTime || null);
      await fetchVideos();
      videoUrl = '';
      totalTime = '';
    } catch (e: any) {
      errorMsg = e.message;
    } finally {
      loading = false;
    }
  }

  async function submitRecord() {
    if (!recUrl || !recFileName) return;
    loading = true;
    errorMsg = '';
    try {
      const record = await startRecord(recUrl, recFileName);
      recUrl = '';
      recFileName = '';
      records = [record, ...records.filter((r) => r.filename !== record.filename)];
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
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

  async function removeVideo(id: string) {
    try {
      await deleteVideo(id);
      videos = videos.filter((v) => v.id !== id);
    } catch (e: any) {
      errorMsg = e.message;
    }
  }

  async function handlePause(filename: string) {
    pausedSet = new Set([...pausedSet, filename]);
    pausePending = new Set([...pausePending, filename]);
    try {
      const updated = await pauseRecord(filename);
      records = records.map((r) => r.filename === filename ? { ...r, ...updated } : r);
    } catch (e) {
      pausedSet = new Set([...pausedSet].filter((f) => f !== filename));
      errorMsg = e instanceof Error ? e.message : String(e);
    } finally {
      pausePending = new Set([...pausePending].filter((f) => f !== filename));
    }
  }

  async function handleResume(filename: string) {
    pausedSet = new Set([...pausedSet].filter((f) => f !== filename));
    pausePending = new Set([...pausePending, filename]);
    try {
      const updated = await resumeRecord(filename);
      records = records.map((r) => r.filename === filename ? { ...r, ...updated } : r);
    } catch (e) {
      pausedSet = new Set([...pausedSet, filename]);
      errorMsg = e instanceof Error ? e.message : String(e);
    } finally {
      pausePending = new Set([...pausePending].filter((f) => f !== filename));
    }
  }

  async function handleStop(filename: string) {
    records = records.map((r) => r.filename === filename ? { ...r, status: 'stopping' } : r);
    pausedSet = new Set([...pausedSet].filter((f) => f !== filename));
    try {
      await stopRecord(filename);
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  async function handleCancel(filename: string) {
    records = records.map((r) => r.filename === filename ? { ...r, status: 'stopping' } : r);
    pausedSet = new Set([...pausedSet].filter((f) => f !== filename));
    try {
      const updated = await cancelRecord(filename);
      records = records.map((r) => r.filename === filename ? updated : r);
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  function handleRemove(filename: string) {
    records = records.filter((r) => r.filename !== filename);
  }

  onMount(() => {
    fetchClips();
    fetchVideos();
    fetchActive();
    const interval = setInterval(() => { fetchClips(); fetchVideos(); fetchActive(); }, 3000);
    return () => clearInterval(interval);
  });
</script>

<Background />
<Nav active="clips" />

<section class="hero">
  <p class="label">cime clip & video & recorder</p>
  <h1>Download.<br/>Clip. Share.</h1>
  <p class="desc">씨미 라이브를 클립하거나 전체 다운로드,<br/>또는 실시간으로 녹화하세요.</p>

  <div class="sub-tab-toggle">
    <button class:tab-active={mode === 'clip'} onclick={() => { mode = 'clip'; errorMsg = ''; }}>클립</button>
    <button class:tab-active={mode === 'video'} onclick={() => { mode = 'video'; errorMsg = ''; }}>비디오</button>
    <button class:tab-active={mode === 'record'} onclick={() => { mode = 'record'; errorMsg = ''; }}>녹화</button>
  </div>

  {#if mode === 'clip'}
    <div class="form-card">
      <div class="form-row">
        <input type="text" placeholder="URL을 입력하세요" bind:value={url} />
        {#if url && !showVideo}
          <button type="button" class="preview-open-btn" onclick={openSourcePreview}>미리보기</button>
        {/if}
      </div>

      {#if url && durationLoaded}
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
      {/if}

      <div class="form-row time-row">
        <div class="time-input">
          <span class="time-label" aria-hidden="true">시작</span>
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
          <span class="time-label" aria-hidden="true">종료</span>
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
          if (probeEl && isFinite(probeEl.duration)) { totalSec = Math.floor(probeEl.duration); durationLoaded = true; }
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
              if (videoEl && isFinite(videoEl.duration)) { totalSec = Math.floor(videoEl.duration); videoLoaded = true; durationLoaded = true; }
            }}
            ontimeupdate={() => { if (videoEl) videoCurrentTime = videoEl.currentTime; }}
            onerror={() => { videoError = true; videoLoaded = false; }}
          ><track kind="captions" /></video>
        {:else}
          <div class="video-error">직접 미리보기를 지원하지 않는 URL입니다.</div>
        {/if}
      </div>
    {/if}

  {:else if mode === 'video'}
    <div class="form-card">
      <div class="form-row">
        <input type="text" placeholder="URL을 입력하세요" bind:value={videoUrl} />
      </div>
      <div class="form-row time-row">
        <div class="time-input">
          <label for="total-time">총 시간 (선택)</label>
          <input id="total-time" type="text" placeholder="예: 01:30:00" bind:value={totalTime} />
        </div>
        <button class="submit-btn" onclick={submitVideo} disabled={loading || !videoUrl}>
          {loading ? '처리중...' : '다운로드 ✦'}
        </button>
      </div>
      {#if errorMsg}
        <p class="error">{errorMsg}</p>
      {/if}
    </div>

  {:else}
    <div class="form-card">
      <div class="form-row">
        <input type="text" placeholder="스트림 URL을 입력하세요" bind:value={recUrl} />
      </div>
      <div class="form-row record-row">
        <div class="record-input">
          <label for="rec-file-name">파일명</label>
          <input id="rec-file-name" type="text" placeholder="예: stream_20260313" bind:value={recFileName} />
        </div>
        <button class="submit-btn" onclick={submitRecord} disabled={loading || !recUrl || !recFileName}>
          {loading ? '시작중...' : '녹화 시작 ✦'}
        </button>
      </div>
      {#if errorMsg}
        <p class="error">{errorMsg}</p>
      {/if}
    </div>
  {/if}
</section>

{#if mode === 'clip'}
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

{:else if mode === 'video'}
  <section class="clips-section">
    <h2>비디오 목록</h2>
    {#if videos.length === 0}
      <p class="empty">아직 비디오가 없어요. URL을 입력해 다운로드를 시작하세요!</p>
    {:else}
      <div class="clips-grid">
        {#each videos as video}
          <div class="clip-card">
            <div class="clip-header">
              <div class="clip-header-left">
                <span class="platform">VIDEO</span>
                {#if video.status}
                  <span class="status" style="color: {statusColor(video.status)}">{statusLabel(video.status)}</span>
                {/if}
              </div>
              <button class="delete-btn" onclick={() => removeVideo(video.id)} aria-label="삭제">×</button>
            </div>
            <p class="clip-title">{video.title ?? video.url}</p>
            <div class="clip-meta">
              {#if video.total_time}<span>총 시간: {video.total_time}</span>{/if}
              {#if video.file_size}<span>{(Number(video.file_size) / 1024 / 1024).toFixed(1)} MB</span>{/if}
            </div>
            {#if video.file_url && video.status === 'completed'}
              <div class="clip-actions">
                <button class="preview-card-btn" onclick={() => openModal(video.file_url!)}>미리보기</button>
                <a class="download-btn" href={localUrl(video.file_url)} download>다운로드</a>
              </div>
            {/if}
            {#if video.error_message}
              <p class="clip-error">{video.error_message}</p>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>

{:else}
  <section class="clips-section">
    <h2>녹화 목록</h2>
    {#if records.length === 0}
      <p class="empty">현재 녹화 중인 스트림이 없어요.</p>
    {:else}
      <div class="clips-grid">
        {#each records as record (record.filename)}
          {@const isPaused = pausedSet.has(record.filename)}
          {@const isActive = record.status === 'processing'}
          <div class="clip-card record-card">
            <div class="clip-header">
              <div class="clip-header-left">
                {#if isActive}
                  <span class="rec-dot" class:paused={isPaused}></span>
                {/if}
                <span class="platform">REC</span>
                <span class="status" style="color: {statusColor(record.status)}">
                  {record.status === 'stopping' ? '완료 중...' : isPaused ? '일시멈춤' : statusLabel(record.status)}
                </span>
              </div>
              {#if !isActive}
                <button class="delete-btn" onclick={() => handleRemove(record.filename)} aria-label="닫기">×</button>
              {/if}
            </div>

            <p class="clip-title">{record.filename}</p>
            {#if record.url}
              <p class="clip-sub record-url">{record.url}</p>
            {/if}
            {#if record.error_message}
              <p class="clip-error">{record.error_message}</p>
            {/if}

            {#if isActive}
              <div class="rec-controls">
                {#if isPaused}
                  <button class="rec-btn rec-btn-resume" onclick={() => handleResume(record.filename)}>재개</button>
                {:else}
                  <button class="rec-btn rec-btn-pause" onclick={() => handlePause(record.filename)}>일시멈춤</button>
                {/if}
                <button class="rec-btn rec-btn-stop" onclick={() => handleStop(record.filename)}>완료</button>
                <button class="rec-btn rec-btn-cancel" onclick={() => handleCancel(record.filename)}>취소</button>
              </div>
            {/if}

            {#if record.status === 'completed' && record.file_url}
              <div class="clip-actions">
                <button class="preview-card-btn" onclick={() => openModal(record.file_url!)}>미리보기</button>
                <a class="download-btn" href={localUrl(record.file_url)} download>다운로드</a>
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>
{/if}

{#if showModal}
  <div class="modal-backdrop" onclick={closeModal} onkeydown={(e) => e.key === 'Escape' && closeModal()} role="presentation">
    <div class="modal-box" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <button class="modal-close" onclick={closeModal} aria-label="닫기">×</button>
      <video class="modal-video" src={modalUrl} controls autoplay><track kind="captions" /></video>
    </div>
  </div>
{/if}
