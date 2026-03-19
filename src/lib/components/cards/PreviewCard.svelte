<script lang="ts">
  let { files, title, streamer, thumbnail }: {
    files: { filename: string; timeLabel: string }[];
    title: string | null;
    streamer: string | null;
    thumbnail: string | null;
  } = $props();
</script>

{#each files as f}
<div class="clip-card preview-card">
  {#if thumbnail}
    <div class="clip-thumb preview-thumb">
      <img src={thumbnail} alt="썸네일" />
      <span class="thumb-dur">{f.timeLabel}</span>
    </div>
  {/if}
  <div class="clip-header">
    <div class="clip-header-left">
      <span class="platform">CLIP</span>
      <span class="status" style="color: #555">생성 예정</span>
    </div>
  </div>
  <p class="clip-title">{title ?? f.filename}</p>
  {#if streamer}<p class="clip-sub">{streamer}</p>{/if}
  <div class="clip-meta">
    <span>{f.filename}</span>
  </div>
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
</style>
