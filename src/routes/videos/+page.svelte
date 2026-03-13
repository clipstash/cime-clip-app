<script lang="ts">
  import { onMount } from 'svelte';
  import '../../styles/page.css';
  import { getVideos, createVideo, deleteVideo, type Video } from '$lib/api/videos';

  let url = $state('');
  let totalTime = $state('');
  let loading = $state(false);
  let videos = $state<Video[]>([]);
  let errorMsg = $state('');

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

  function statusColor(status?: string) {
    if (status === 'completed') return '#4ade80';
    if (status === 'failed') return '#f87171';
    if (status === 'processing') return '#facc15';
    return '#888888';
  }

  function statusLabel(status?: string) {
    if (status === 'completed') return '✅ 완료';
    if (status === 'failed') return '❌ 실패';
    if (status === 'processing') return '⏳ 처리중';
    return '🕐 대기중';
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

<div class="bg-gradient"></div>
<div class="stars">
  <span class="star-1">✦</span>
  <span class="star-2">✦</span>
  <span class="star-3">✦</span>
  <span class="star-4">✦</span>
  <span class="star-5">✦</span>
  <span class="star-6">✦</span>
  <span class="star-7">✦</span>
  <span class="star-8">✦</span>
  <span class="star-9">✦</span>
  <span class="star-10">✦</span>
  <span class="star-11">✦</span>
  <span class="star-12">✦</span>
</div>

<nav>
  <div class="nav-left">
    <a href="/">ClipDown</a>
  </div>
  <div class="nav-right">
    <a href="/clips">Clips</a>
    <a href="/record">Record</a>
    <a href="/videos" class="nav-active">Videos</a>
  </div>
</nav>

<section class="hero">
  <p class="label">cime video downloader</p>
  <h1>Download.<br/>Full. Video.</h1>
  <p class="desc">씨미 라이브 영상 전체를<br/>빠르게 다운로드하세요.</p>

  <div class="form-card">
    <div class="form-row">
      <input
        type="text"
        placeholder="URL을 입력하세요"
        bind:value={url}
      />
    </div>
    <div class="form-row time-row">
      <div class="time-input">
        <label for="total-time">총 시간 (선택)</label>
        <input
          id="total-time"
          type="text"
          placeholder="예: 01:30:00"
          bind:value={totalTime}
        />
      </div>
      <button onclick={submitVideo} disabled={loading || !url}>
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
            {#if video.total_time}
              <span>총 시간: {video.total_time}</span>
            {/if}
            {#if video.file_size}
              <span>{(video.file_size / 1024 / 1024).toFixed(1)} MB</span>
            {/if}
          </div>
          {#if video.s3_url && video.status === 'completed'}
            <a class="download-btn" href={video.s3_url} download>다운로드</a>
          {/if}
          {#if video.error_message}
            <p class="clip-error">{video.error_message}</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>
