<script lang="ts">
  import { fetchClipInfo } from '$lib/api/clips';
  import { useRecording } from '$lib/hooks/useRecording.svelte';

  // ── Props 타입 ───────────────────────────────────────────────────
  type Props = {
    url: string;
    onSuccess?: (info: { filename: string; url: string; blobUrl: string }) => void;
  };

  const { url, onSuccess }: Props = $props();

  // ── 훅 초기화 ────────────────────────────────────────────────────
  const rec = useRecording((info) => onSuccess?.(info));

  // ── UI 상태 (RecordForm에 남는 것) ───────────────────────────────
  let recFileName = $state('');
  let titleLoading = $state(false);
  let fileNameEdited = $state(false);

  // ── URL 변경 시 제목 자동 조회 → 파일명 초기값 설정 ─────────────
  $effect(() => {
    const targetUrl = url;
    if (!targetUrl) { titleLoading = false; return; }
    if (fileNameEdited) return;
    titleLoading = true;
    const t = setTimeout(async () => {
      const info = await fetchClipInfo(targetUrl);
      if (info && info.title && !fileNameEdited) {
        const today = new Date();
        const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
        recFileName = info.streamer
          ? `[${info.streamer}] ${info.title}_${dateStr}`
          : `${info.title}_${dateStr}`;
      }
      titleLoading = false;
    }, 600);
    return () => clearTimeout(t);
  });
</script>

<div class="form-row record-row">
  {#if rec.status === 'idle' || rec.status === 'error'}
    <div class="record-input">
      <label for="rec-file-name">녹화{titleLoading ? ' (불러오는 중...)' : ''}</label>
      <input id="rec-file-name" type="text" placeholder="파일명 (예: stream_20260313)" bind:value={recFileName}
        oninput={() => { fileNameEdited = recFileName.length > 0; }} />
    </div>
    <button class="submit-btn" onclick={() => rec.submit(url, recFileName)} disabled={!url || !recFileName}>
      녹화 시작 ✦
    </button>
  {:else if rec.status === 'loading'}
    <span class="rec-info">스트림 확인 중...</span>
  {:else if rec.isActive}
    <div class="rec-controls">
      <span class="rec-dot" class:paused={rec.status === 'paused'}></span>
      <span class="rec-info">{rec.status === 'paused' ? '일시멈춤' : '녹화 중'} — {rec.segCount} 세그먼트</span>
      {#if rec.status === 'recording'}
        <button class="rec-btn rec-btn-pause" onclick={rec.pause}>일시멈춤</button>
      {:else}
        <button class="rec-btn rec-btn-resume" onclick={rec.resume}>재개</button>
      {/if}
      <button class="rec-btn rec-btn-stop" onclick={() => rec.stop(url, recFileName)}>완료</button>
      <button class="rec-btn rec-btn-cancel" onclick={rec.reset}>취소</button>
    </div>
  {:else if rec.status === 'encoding'}
    <span class="rec-info">MP4 변환 중... ({rec.segCount} 세그먼트)</span>
  {/if}
</div>
{#if rec.err}
  <p class="error">{rec.err}</p>
{/if}
