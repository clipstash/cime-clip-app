<script lang="ts">
  import { statusColor, statusLabel } from '$lib/utils/status';
  import { localUrl } from '$lib/utils/url';
  import type { ActiveRecord } from '$lib/api/record';

  let { record, isPaused, onPause, onResume, onStop, onCancel, onRemove, onPreview }: {
    record: ActiveRecord;
    isPaused: boolean;
    onPause: (filename: string) => void;
    onResume: (filename: string) => void;
    onStop: (filename: string) => void;
    onCancel: (filename: string) => void;
    onRemove: (filename: string) => void;
    onPreview: (url: string) => void;
  } = $props();

  const isActive = $derived(record.status === 'processing');

  let thumbEl = $state<HTMLVideoElement | null>(null);
  let thumbReady = $state(false);
</script>

<div class="clip-card record-card">
  {#if record.file_url && record.status === 'completed'}
    <div class="clip-thumb" onclick={() => onPreview(record.file_url!)} onkeydown={(e) => e.key === 'Enter' && onPreview(record.file_url!)} role="button" tabindex="0" aria-label="미리보기">
      <video
        bind:this={thumbEl}
        src={localUrl(record.file_url)}
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
    </div>
  {/if}
  <div class="clip-header">
    <div class="clip-header-left">
      {#if isActive}<span class="rec-dot" class:paused={isPaused}></span>{/if}
      <span class="platform">REC</span>
      <span class="status" style="color: {statusColor(record.status)}">
        {record.status === 'stopping' ? '완료 중...' : isPaused ? '일시멈춤' : statusLabel(record.status)}
      </span>
    </div>
    {#if !isActive}
      <button class="delete-btn" onclick={() => onRemove(record.filename)} aria-label="닫기">×</button>
    {/if}
  </div>
  <p class="clip-title">{record.filename}</p>
  {#if record.url}<p class="clip-sub record-url">{record.url}</p>{/if}
  {#if record.error_message}<p class="clip-error">{record.error_message}</p>{/if}
  {#if isActive}
    <div class="rec-controls">
      {#if isPaused}
        <button class="rec-btn rec-btn-resume" onclick={() => onResume(record.filename)}>재개</button>
      {:else}
        <button class="rec-btn rec-btn-pause" onclick={() => onPause(record.filename)}>일시멈춤</button>
      {/if}
      <button class="rec-btn rec-btn-stop" onclick={() => onStop(record.filename)}>완료</button>
      <button class="rec-btn rec-btn-cancel" onclick={() => onCancel(record.filename)}>취소</button>
    </div>
  {/if}
  {#if record.status === 'completed' && record.file_url}
    <div class="clip-actions">
      <button class="preview-card-btn" onclick={() => onPreview(record.file_url!)}>미리보기</button>
      <a class="download-btn" href={localUrl(record.file_url)} download>다운로드</a>
    </div>
  {/if}
</div>
