<script lang="ts">
  import { onMount } from 'svelte';
  import '../styles/page.css';
  import { getClips, createClip, deleteClip, type Clip } from '$lib/api/clips';

  let url = $state('');
  let startTime = $state(0);
  let endTime = $state(30);
  let loading = $state(false);
  let clips = $state<Clip[]>([]);
  let errorMsg = $state('');

  async function fetchClips() {
    clips = await getClips();
  }

  async function submitClip() {
    if (!url) return;
    loading = true;
    errorMsg = '';
    try {
      await createClip(url, startTime, endTime);
      await fetchClips();
      url = '';
    } catch (e: any) {
      errorMsg = e.message;
    } finally {
      loading = false;
    }
  }

  function statusColor(status: string) {
    if (status === 'completed') return '#4ade80';
    if (status === 'failed') return '#f87171';
    if (status === 'processing') return '#facc15';
    return '#888888';
  }

  function statusLabel(status: string) {
    if (status === 'completed') return '✅ 완료';
    if (status === 'failed') return '❌ 실패';
    if (status === 'processing') return '⏳ 처리중';
    return '🕐 대기중';
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
    <span>Clips</span>
    <span>About</span>
  </div>
</nav>

<section class="hero">
  <p class="label">cime clip downloader</p>
  <h1>Download.<br/>Clip. Share.</h1>
  <p class="desc">씨미 라이브 클립을 원하는 구간만<br/>빠르게 다운로드하세요.</p>

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
        <label for="start-time">시작 (초)</label>
        <input id="start-time" type="number" bind:value={startTime} min="0" />
      </div>
      <div class="time-input">
        <label for="end-time">종료 (초)</label>
        <input id="end-time" type="number" bind:value={endTime} min="1" />
      </div>
      <button onclick={submitClip} disabled={loading}>
        {loading ? '처리중...' : '클립 생성 ✦'}
      </button>
    </div>
    {#if errorMsg}
      <p class="error">{errorMsg}</p>
    {/if}
  </div>
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
              <span class="status" style="color: {statusColor(clip.status)}">
                {statusLabel(clip.status)}
              </span>
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
          {#if clip.s3_url && clip.status === 'completed'}
            <a class="download-btn" href={clip.s3_url} download>다운로드</a>
          {/if}
          {#if clip.error_message}
            <p class="clip-error">{clip.error_message}</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>
