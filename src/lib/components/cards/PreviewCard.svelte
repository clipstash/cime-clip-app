<script lang="ts">
  import ProgressBar from '../ui/ProgressBar.svelte';

  let { files, title, streamer, thumbnail, busy = false, progress = 0, progressLabel = '' }: {
    files: { filename: string; timeLabel: string }[];
    title: string | null;
    streamer: string | null;
    thumbnail: string | null;
    busy?: boolean;
    progress?: number;
    progressLabel?: string;
  } = $props();
</script>

{#each files as f}
<div class="clip-card preview-card" class:processing={busy}>
  {#if thumbnail}
    <div class="clip-thumb preview-thumb">
      <img src={thumbnail} alt="썸네일" />
      <span class="thumb-dur">{f.timeLabel}</span>
    </div>
  {/if}
  <div class="clip-header">
    <div class="clip-header-left">
      <span class="platform">CLIP</span>
      <span class="status" style="color: {busy ? '#f5a623' : '#555'}">{busy ? '처리 중' : '생성 예정'}</span>
    </div>
  </div>
  <p class="clip-title">{title ?? f.filename}</p>
  {#if streamer}<p class="clip-sub">{streamer}</p>{/if}
  <div class="clip-meta">
    <span>{f.filename}</span>
  </div>
  {#if busy}
    <div class="preview-progress">
      <ProgressBar {progress} label={progressLabel} />
    </div>
  {/if}
</div>
{/each}

<style>
  .preview-card {
    opacity: 0.6;
    border-style: dashed;
  }
  .preview-card:hover {
    opacity: 0.8;
  }
  .preview-card.processing {
    opacity: 1;
    border-color: #f5a623;
  }
  .preview-thumb {
    pointer-events: none;
  }
  .preview-thumb img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 1;
  }
  .preview-progress {
    margin-top: 0.5rem;
  }
</style>
