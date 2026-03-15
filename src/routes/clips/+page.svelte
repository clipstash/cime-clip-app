<script lang="ts">
  import { onMount } from 'svelte';
  import '../../styles/page.css';
  import { getClips, deleteClip, fetchClipInfo, type Clip } from '$lib/api/clips';
  import { getVideos, deleteVideo, type Video } from '$lib/api/videos';
  import {
    stopRecord, pauseRecord, resumeRecord, cancelRecord,
    getActiveRecords, getRecord, type ActiveRecord
  } from '$lib/api/record';
  import { localUrl } from '$lib/utils/url';
  import Background from '$lib/components/Background.svelte';
  import Nav from '$lib/components/Nav.svelte';
  import ClipCard from './ClipCard.svelte';
  import VideoCard from './VideoCard.svelte';
  import RecordCard from './RecordCard.svelte';
  import PreviewModal from './PreviewModal.svelte';
  import SourcePreview from './SourcePreview.svelte';
  import ClipForm from './ClipForm.svelte';
  import VideoForm from './VideoForm.svelte';
  import RecordForm from './RecordForm.svelte';

  // ── 공통 ──
  let url = $state('');
  let modalUrl = $state('');
  let showModal = $state(false);

  // ── 소스 정보 ──
  let sourceTitle = $state<string | null>(null);
  let sourceThumbnail = $state<string | null>(null);
  let sourceIsLive = $state(false);
  let sourceLoading = $state(false);
  let totalSec = $state(3600);
  let durationLoaded = $state(false);

  $effect(() => {
    if (url !== null) {
      durationLoaded = false; sourceTitle = null; sourceThumbnail = null;
      sourceIsLive = false; sourceLoading = false;
    }
  });

  $effect(() => {
    const targetUrl = url;
    if (!targetUrl) return;
    sourceLoading = true;
    const t = setTimeout(async () => {
      const info = await fetchClipInfo(targetUrl);
      sourceTitle = info.title;
      sourceThumbnail = info.thumbnail;
      if (info.duration != null) { totalSec = info.duration; durationLoaded = true; sourceIsLive = false; }
      else { sourceIsLive = true; }
      sourceLoading = false;
    }, 600);
    return () => clearTimeout(t);
  });

  // ── 리스트 ──
  let clips = $state<Clip[]>([]);
  let videos = $state<Video[]>([]);
  let records = $state<ActiveRecord[]>([]);
  let pausedSet = $state(new Set<string>());
  let pausePending = $state(new Set<string>());

  // ── 모달 ──
  function openModal(fileUrl: string) { modalUrl = localUrl(fileUrl); showModal = true; }
  function closeModal() { showModal = false; modalUrl = ''; }

  // ── Fetch ──
  async function fetchClips() { clips = await getClips(); }
  async function fetchVideos() { videos = await getVideos(); }

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
      return existing ? { ...existing, status: r.status } : r;
    });
    const refreshed = await Promise.all(
      records
        .filter((r) => !activeNames.has(r.filename) && r.status !== 'completed' && r.status !== 'failed')
        .map(async (r) => { if (!r.id) return r; const fresh = await getRecord(r.id); return fresh ?? r; })
    );
    const terminal = records.filter((r) => !activeNames.has(r.filename) && (r.status === 'completed' || r.status === 'failed'));
    records = [...mergedActive, ...refreshed, ...terminal];
  }

  // ── 삭제 / 녹화 컨트롤 ──
  async function removeClip(id: string) {
    try { await deleteClip(id); clips = clips.filter((c) => c.id !== id); }
    catch { /* 무시 */ }
  }

  async function removeVideo(id: string) {
    try { await deleteVideo(id); videos = videos.filter((v) => v.id !== id); }
    catch { /* 무시 */ }
  }

  async function handlePause(filename: string) {
    pausedSet = new Set([...pausedSet, filename]);
    pausePending = new Set([...pausePending, filename]);
    try {
      const updated = await pauseRecord(filename);
      records = records.map((r) => r.filename === filename ? { ...r, ...updated } : r);
    } catch {
      pausedSet = new Set([...pausedSet].filter((f) => f !== filename));
    } finally { pausePending = new Set([...pausePending].filter((f) => f !== filename)); }
  }

  async function handleResume(filename: string) {
    pausedSet = new Set([...pausedSet].filter((f) => f !== filename));
    pausePending = new Set([...pausePending, filename]);
    try {
      const updated = await resumeRecord(filename);
      records = records.map((r) => r.filename === filename ? { ...r, ...updated } : r);
    } catch {
      pausedSet = new Set([...pausedSet, filename]);
    } finally { pausePending = new Set([...pausePending].filter((f) => f !== filename)); }
  }

  async function handleStop(filename: string) {
    records = records.map((r) => r.filename === filename ? { ...r, status: 'stopping' } : r);
    pausedSet = new Set([...pausedSet].filter((f) => f !== filename));
    try { await stopRecord(filename); } catch { /* 무시 */ }
  }

  async function handleCancel(filename: string) {
    records = records.map((r) => r.filename === filename ? { ...r, status: 'stopping' } : r);
    pausedSet = new Set([...pausedSet].filter((f) => f !== filename));
    try {
      const updated = await cancelRecord(filename);
      records = records.map((r) => r.filename === filename ? updated : r);
    } catch { /* 무시 */ }
  }

  function handleRemove(filename: string) { records = records.filter((r) => r.filename !== filename); }

  function handleRecordSuccess(record: ActiveRecord) {
    records = [record, ...records.filter((r) => r.filename !== record.filename)];
  }

  onMount(() => {
    fetchClips(); fetchVideos(); fetchActive();
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

  <div class="form-card">
    <div class="form-row">
      <input type="text" placeholder="URL을 입력하세요" bind:value={url} />
    </div>

    {#if url}
      <SourcePreview {url} {sourceLoading} {sourceThumbnail} {sourceTitle} {sourceIsLive} {durationLoaded} {totalSec} />
    {/if}

    <div class="action-divider"></div>
    <ClipForm {url} {totalSec} {durationLoaded} onSuccess={fetchClips} />

    <div class="action-divider"></div>
    <VideoForm {url} onSuccess={fetchVideos} />

    <div class="action-divider"></div>
    <RecordForm {url} onSuccess={handleRecordSuccess} />
  </div>
</section>

<section class="clips-section">
  <h2>목록</h2>
  {#if clips.length === 0 && videos.length === 0 && records.length === 0}
    <p class="empty">아직 항목이 없어요. URL을 입력해 시작해보세요!</p>
  {:else}
    <div class="clips-grid">
      {#each clips as clip (clip.id)}
        <ClipCard {clip} onRemove={removeClip} onPreview={openModal} />
      {/each}

      {#each videos as video (video.id)}
        <VideoCard {video} onRemove={removeVideo} onPreview={openModal} />
      {/each}

      {#each records as record (record.filename)}
        <RecordCard
          {record}
          isPaused={pausedSet.has(record.filename)}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
          onCancel={handleCancel}
          onRemove={handleRemove}
          onPreview={openModal}
        />
      {/each}
    </div>
  {/if}
</section>

{#if showModal}
  <PreviewModal url={modalUrl} onClose={closeModal} />
{/if}

<style>
  .action-divider {
    border-top: 1px solid #141414;
    margin: 0;
  }
</style>
