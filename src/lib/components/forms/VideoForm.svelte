<script lang="ts">
  import { useVideoDownload } from '$lib/hooks/useVideoDownload.svelte';
  import ProgressBar from '../ui/ProgressBar.svelte';

  type Props = {
    url: string;
    onSuccess: (info: { title: string | null; url: string }) => void;
  };

  const { url, onSuccess }: Props = $props();

  const dl = useVideoDownload((info) => onSuccess(info));
  let recentlyDone = $state(false);

  $effect(() => {
    if (dl.status === 'done') {
      dl.triggerDownload();
      recentlyDone = true;
      setTimeout(() => { recentlyDone = false; }, 3000);
    }
  });
</script>

<div class="form-row time-row video-action">
  <div class="time-input">
    <span class="time-label" aria-hidden="true">비디오</span>
    {#if dl.busy}
      <ProgressBar progress={dl.progress} label={dl.progressLabel} />
    {/if}
  </div>
  <button class="submit-btn" onclick={() => dl.download(url)} disabled={dl.busy || !url}>
    {recentlyDone ? '완료 ✓' : dl.busy ? '처리중...' : '다운로드 ✦'}
  </button>
</div>
{#if dl.err}
  <p class="error">{dl.err}</p>
{/if}
