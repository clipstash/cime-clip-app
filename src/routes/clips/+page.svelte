<script lang="ts">
  import '../../styles/page.css';
  import { fetchClipInfo, type Clip } from '$lib/api/clips';
  import { type Video } from '$lib/api/videos';
  import { type ActiveRecord } from '$lib/api/record';
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

  // ── 모달 ──
  function openModal(fileUrl: string) { modalUrl = localUrl(fileUrl); showModal = true; }
  function closeModal() { showModal = false; modalUrl = ''; }

  // ── 삭제 ──
  function removeClip(id: string) {
    const clip = clips.find((c) => c.id === id);
    if (clip?.file_url?.startsWith('blob:')) URL.revokeObjectURL(clip.file_url);
    clips = clips.filter((c) => c.id !== id);
  }
  function removeVideo(id: string) { videos = videos.filter((v) => v.id !== id); }
  function handleRemove(filename: string) {
    const rec = records.find((r) => r.filename === filename);
    if (rec?.file_url?.startsWith('blob:')) URL.revokeObjectURL(rec.file_url);
    records = records.filter((r) => r.filename !== filename);
  }

  // ── 브라우저 다운로드 완료 핸들러 ──
  function handleClipSuccess(info: { title: string | null; startSec: number; endSec: number; blobUrl: string }) {
    const clip: Clip = {
      id: crypto.randomUUID(),
      platform: 'browser',
      status: 'completed',
      title: info.title ?? undefined,
      start_time: info.startSec,
      end_time: info.endSec,
      file_url: info.blobUrl,
    };
    clips = [clip, ...clips];
  }

  function handleVideoSuccess(info: { title: string | null; url: string }) {
    const video: Video = {
      id: crypto.randomUUID(),
      url: info.url,
      status: 'completed',
      title: info.title ?? undefined,
    };
    videos = [video, ...videos];
  }

  function handleRecordSuccess(info: { filename: string; url: string; blobUrl: string }) {
    const record: ActiveRecord = {
      id: crypto.randomUUID(),
      filename: info.filename,
      url: info.url,
      status: 'completed',
      file_url: info.blobUrl,
      error_message: null,
      started_at: null,
    };
    records = [record, ...records.filter((r) => r.filename !== info.filename)];
  }
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
    <ClipForm {url} {totalSec} {durationLoaded} onSuccess={handleClipSuccess} />

    <div class="action-divider"></div>
    <VideoForm {url} onSuccess={handleVideoSuccess} />

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
          isPaused={false}
          onPause={() => {}}
          onResume={() => {}}
          onStop={() => {}}
          onCancel={() => {}}
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
