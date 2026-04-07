<script lang="ts">
  type Props = {
    startPct: number;
    endPct: number;
    startSec: number;
    endSec: number;
    clipDuration: number;
    totalSec: number;
    trackEl: HTMLDivElement | null;
    onSeekToClick: (e: MouseEvent) => void;
    onStartDrag: (e: PointerEvent, which: 'start' | 'end') => void;
    onDragMove: (e: PointerEvent) => void;
    onDragEnd: () => void;
    formatTime: (sec: number) => string;
  };

  let { startPct, endPct, startSec, endSec, clipDuration, totalSec, trackEl = $bindable(), onSeekToClick, onStartDrag, onDragMove, onDragEnd, formatTime }: Props = $props();
</script>

<div class="timeline-wrap">
  <div class="timeline-track" bind:this={trackEl} onclick={onSeekToClick} role="presentation">
    <div class="timeline-fill" style="left: {startPct}%; width: {Math.max(0, endPct - startPct)}%"></div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="timeline-handle" style="left: {startPct}%"
      onpointerdown={(e) => onStartDrag(e, 'start')} onpointermove={onDragMove} onpointerup={onDragEnd}
      onclick={(e) => e.stopPropagation()}
      role="slider" aria-label="시작 지점" aria-valuenow={startSec} aria-valuemin={0} aria-valuemax={totalSec} tabindex="0"
    ></div>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="timeline-handle" style="left: {endPct}%"
      onpointerdown={(e) => onStartDrag(e, 'end')} onpointermove={onDragMove} onpointerup={onDragEnd}
      onclick={(e) => e.stopPropagation()}
      role="slider" aria-label="종료 지점" aria-valuenow={endSec} aria-valuemin={0} aria-valuemax={totalSec} tabindex="0"
    ></div>
  </div>
  <div class="timeline-labels">
    <span>{formatTime(0)}</span>
    <span class="timeline-badge">{formatTime(clipDuration)} 구간</span>
    <span>{formatTime(totalSec)}</span>
  </div>
</div>
