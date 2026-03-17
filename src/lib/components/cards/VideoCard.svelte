<script lang="ts">
  import { statusColor, statusLabel } from '$lib/utils/status';
  import { localUrl } from '$lib/utils/url';
  import type { Video } from '$lib/api/videos';

  let { video, onRemove, onPreview }: {
    video: Video;
    onRemove: (id: string) => void;
    onPreview: (url: string) => void;
  } = $props();

  let thumbEl = $state<HTMLVideoElement | null>(null);
  let thumbReady = $state(false);
</script>

<div class="clip-card">
  {#if video.file_url && video.status === 'completed'}
    <div class="clip-thumb" onclick={() => onPreview(video.file_url!)} onkeydown={(e) => e.key === 'Enter' && onPreview(video.file_url!)} role="button" tabindex="0" aria-label="미리보기">
      <video
        bind:this={thumbEl}
        src={localUrl(video.file_url)}
        muted
        preload="metadata"
        onloadedmetadata={() => {
          if (thumbEl && isFinite(thumbEl.duration)) thumbEl.currentTime = Math.min(thumbEl.duration * 0.1, 5);
        }}
        onseeked={() => { thumbReady = true; }}
        class:thumb-ready={thumbReady}
      ><track kind="captions" /></video>
      {#if !thumbReady}<div class="thumb-ph">▶</div>{/if}
      <div class="thumb-overlay"><div class="thumb-play">▶</div></div>
      {#if video.total_time}<span class="thumb-dur">{video.total_time}</span>{/if}
    </div>
  {/if}
  <div class="clip-header">
    <div class="clip-header-left">
      <span class="platform">VIDEO</span>
      {#if video.status}
        <span class="status" style="color: {statusColor(video.status)}">{statusLabel(video.status)}</span>
      {/if}
    </div>
    <button class="delete-btn" onclick={() => onRemove(video.id)} aria-label="삭제">×</button>
  </div>
  <p class="clip-title">{video.title ?? video.url}</p>
  <div class="clip-meta">
    {#if video.total_time}<span>총 시간: {video.total_time}</span>{/if}
    {#if video.file_size}<span>{(Number(video.file_size) / 1024 / 1024).toFixed(1)} MB</span>{/if}
  </div>
  {#if video.file_url && video.status === 'completed'}
    <div class="clip-actions">
      <button class="preview-card-btn" onclick={() => onPreview(video.file_url!)}>미리보기</button>
      <a class="download-btn" href={localUrl(video.file_url)} download>다운로드</a>
    </div>
  {/if}
  {#if video.error_message}<p class="clip-error">{video.error_message}</p>{/if}
</div>
