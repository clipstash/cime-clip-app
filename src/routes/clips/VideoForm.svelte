<script lang="ts">
  import { createVideo } from '$lib/api/videos';

  type Props = {
    url: string;
    onSuccess: () => void;
  };

  const { url, onSuccess }: Props = $props();

  let totalTime = $state('');
  let loading = $state(false);
  let err = $state('');

  async function submit() {
    if (!url) return;
    loading = true; err = '';
    try {
      await createVideo(url, totalTime || null);
      totalTime = '';
      onSuccess();
    } catch (e) { err = e instanceof Error ? e.message : String(e); }
    finally { loading = false; }
  }
</script>

<div class="form-row time-row video-action">
  <div class="time-input">
    <span class="time-label" aria-hidden="true">비디오</span>
    <input type="text" placeholder="총 시간 (선택, 예: 01:30:00)" bind:value={totalTime} />
  </div>
  <button class="submit-btn" onclick={submit} disabled={loading || !url}>
    {loading ? '처리중...' : '다운로드 ✦'}
  </button>
</div>
{#if err}<p class="error">{err}</p>{/if}
