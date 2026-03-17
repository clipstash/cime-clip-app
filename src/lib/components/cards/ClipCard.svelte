<script lang="ts">
  import { statusColor, statusLabel } from '$lib/utils/status';
  import { localUrl } from '$lib/utils/url';
  import type { Clip } from '$lib/api/clips';

  let { clip, onRemove, onPreview }: {
    clip: Clip;
    onRemove: (id: string) => void;
    onPreview: (url: string) => void;
  } = $props();

  let thumbEl = $state<HTMLVideoElement | null>(null);
  let thumbReady = $state(false);

  function formatDur(sec: number) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  const clipDur = $derived(Math.max(0, clip.end_time - clip.start_time));
</script>

<div class="clip-card">
  {#if clip.file_url && clip.status === 'completed'}
    <div class="clip-thumb" onclick={() => onPreview(clip.file_url!)} onkeydown={(e) => e.key === 'Enter' && onPreview(clip.file_url!)} role="button" tabindex="0" aria-label="미리보기">
      <video
        bind:this={thumbEl}
        src={localUrl(clip.file_url)}
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
      <span class="thumb-dur">{formatDur(clipDur)}</span>
    </div>
  {/if}
  <div class="clip-header">
    <div class="clip-header-left">
      <span class="platform">{clip.platform}</span>
      <span class="status" style="color: {statusColor(clip.status)}">{statusLabel(clip.status)}</span>
    </div>
    <button class="delete-btn" onclick={() => onRemove(clip.id)} aria-label="삭제">×</button>
  </div>
  <p class="clip-title">{clip.title ?? '정보 로딩 중...'}</p>
  <p class="clip-sub">{clip.streamer ?? '-'}</p>
  <div class="clip-meta">
    <span>{clip.start_time}s ~ {clip.end_time}s</span>
    {#if clip.file_size}<span>{(clip.file_size / 1024 / 1024).toFixed(1)} MB</span>{/if}
  </div>
  {#if clip.file_url && clip.status === 'completed'}
    <div class="clip-actions">
      <button class="preview-card-btn" onclick={() => onPreview(clip.file_url!)}>미리보기</button>
      <a class="download-btn" href={localUrl(clip.file_url)} download>다운로드</a>
    </div>
  {/if}
  {#if clip.error_message}<p class="clip-error">{clip.error_message}</p>{/if}
</div>
