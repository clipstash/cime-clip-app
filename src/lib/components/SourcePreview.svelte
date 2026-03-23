<script lang="ts">
  type Props = {
    url: string;
    sourceLoading: boolean;
    sourceThumbnail: string | null;
    sourceTitle: string | null;
    sourceIsLive: boolean;
    durationLoaded: boolean;
    totalSec: number;
  };

  const { url, sourceLoading, sourceThumbnail, sourceTitle, sourceIsLive, durationLoaded, totalSec }: Props = $props();

  function formatTime(sec: number) {
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
</script>

<div class="inline-preview" class:has-thumb={!!sourceThumbnail}>
  {#if sourceLoading}
    <div class="source-info-loading">
      <span class="source-info-dot"></span>
      <span class="source-info-hint">정보 불러오는 중...</span>
    </div>
  {:else}
    {#if sourceThumbnail}
      <img src={sourceThumbnail} alt="" class="inline-preview-thumb" onerror={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
    {/if}
    <div class="source-info" class:on-thumb={!!sourceThumbnail}>
      <div class="source-info-left">
        <span class="source-info-badge">{sourceIsLive ? 'LIVE' : 'VOD'}</span>
        <div class="source-info-text">
          {#if sourceTitle}
            <p class="source-info-title">{sourceTitle}</p>
          {:else}
            <p class="source-info-title muted">제목 없음</p>
          {/if}
          <span class="source-info-dur">
            {#if durationLoaded}{formatTime(totalSec)}{:else if sourceIsLive}실시간 방송{:else}—{/if}
          </span>
        </div>
      </div>
      <button type="button" class="source-info-link" onclick={() => window.open(url, '_blank', 'noopener,noreferrer')} aria-label="원본 열기">↗</button>
    </div>
  {/if}
</div>
