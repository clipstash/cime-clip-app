<script lang="ts">
  import { onMount } from 'svelte';
  import '../../styles/page.css';
  import { getVideos, createVideo, deleteVideo, type Video } from '$lib/api/videos';
  import { statusColor, statusLabel } from '$lib/utils/status';
  import Background from '$lib/components/Background.svelte';
  import Nav from '$lib/components/Nav.svelte';

  let url = $state('');
  let totalTime = $state('');
  let loading = $state(false);
  let videos = $state<Video[]>([]);
  let errorMsg = $state('');

  let modalUrl = $state('');
  let showModal = $state(false);

  function localUrl(u?: string) {
    return u ? u.replace(/^https?:\/\/localhost:\d+/, '') : '';
  }

  function openModal(fileUrl: string) {
    modalUrl = localUrl(fileUrl);
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    modalUrl = '';
  }

  async function fetchVideos() {
    videos = await getVideos();
  }

  async function submitVideo() {
    if (!url) return;
    loading = true;
    errorMsg = '';
    try {
      await createVideo(url, totalTime || null);
      await fetchVideos();
      url = '';
      totalTime = '';
    } catch (e: any) {
      errorMsg = e.message;
    } finally {
      loading = false;
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

  onMount(() => {
    fetchVideos();
    const interval = setInterval(fetchVideos, 3000);
    return () => clearInterval(interval);
  });
</script>

<Background />
<Nav active="videos" />

<section class="hero">
  <p class="label">cime video downloader</p>
  <h1>Download.<br/>Full. Video.</h1>
  <p class="desc">씨미 라이브 영상 전체를<br/>빠르게 다운로드하세요.</p>

  <div class="form-card">
    <div class="form-row">
      <input type="text" placeholder="URL을 입력하세요" bind:value={url} />
    </div>
    <div class="form-row time-row">
      <div class="time-input">
        <label for="total-time">총 시간 (선택)</label>
        <input id="total-time" type="text" placeholder="예: 01:30:00" bind:value={totalTime} />
      </div>
      <button class="submit-btn" onclick={submitVideo} disabled={loading || !url}>
        {loading ? '처리중...' : '다운로드 ✦'}
      </button>
    </div>
    {#if errorMsg}
      <p class="error">{errorMsg}</p>
    {/if}
  </div>
</section>

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
                <span class="status" style="color: {statusColor(video.status)}">
                  {statusLabel(video.status)}
                </span>
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

{#if showModal}
  <div class="modal-backdrop" onclick={closeModal} role="presentation">
    <div class="modal-box" onclick={(e) => e.stopPropagation()} role="dialog">
      <button class="modal-close" onclick={closeModal} aria-label="닫기">×</button>
      <video class="modal-video" src={modalUrl} controls autoplay></video>
    </div>
  </div>
{/if}
