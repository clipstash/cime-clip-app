<script lang="ts">
  import { startRecord, fetchStreamTitle, type ActiveRecord } from '$lib/api/record';

  type Props = {
    url: string;
    onSuccess: (record: ActiveRecord) => void;
  };

  const { url, onSuccess }: Props = $props();

  let recFileName = $state('');
  let loading = $state(false);
  let err = $state('');
  let titleLoading = $state(false);
  let fileNameEdited = $state(false);

  $effect(() => {
    const targetUrl = url;
    if (!targetUrl) { titleLoading = false; return; }
    if (fileNameEdited) return;
    titleLoading = true;
    const t = setTimeout(async () => {
      const title = await fetchStreamTitle(targetUrl);
      if (title && !fileNameEdited) recFileName = title;
      titleLoading = false;
    }, 600);
    return () => clearTimeout(t);
  });

  async function submit() {
    if (!url || !recFileName) return;
    loading = true; err = '';
    try {
      const record = await startRecord(url, recFileName);
      recFileName = ''; fileNameEdited = false;
      onSuccess(record);
    } catch (e) { err = e instanceof Error ? e.message : String(e); }
    finally { loading = false; }
  }
</script>

<div class="form-row record-row">
  <div class="record-input">
    <label for="rec-file-name">녹화{titleLoading ? ' (불러오는 중...)' : ''}</label>
    <input id="rec-file-name" type="text" placeholder="파일명 (예: stream_20260313)" bind:value={recFileName}
      oninput={() => { fileNameEdited = recFileName.length > 0; }} />
  </div>
  <button class="submit-btn" onclick={submit} disabled={loading || !url || !recFileName}>
    {loading ? '시작중...' : '녹화 시작 ✦'}
  </button>
</div>
{#if err}<p class="error">{err}</p>{/if}
