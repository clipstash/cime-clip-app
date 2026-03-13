<script lang="ts">
  import { onMount } from 'svelte';
  import '../../styles/page.css';
  import '../../styles/record.css';
  import { startRecord, stopRecord, getActiveRecords, type ActiveRecord } from '$lib/api/record';
  import Background from '$lib/components/Background.svelte';
  import Nav from '$lib/components/Nav.svelte';

  let url = $state('');
  let fileName = $state('');
  let loading = $state(false);
  let errorMsg = $state('');
  let activeRecords = $state<ActiveRecord[]>([]);

  async function fetchActive() {
    activeRecords = await getActiveRecords();
  }

  async function submitRecord() {
    if (!url || !fileName) return;
    loading = true;
    errorMsg = '';
    try {
      await startRecord(url, fileName);
      url = '';
      fileName = '';
      await fetchActive();
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function handleStop(filename: string) {
    try {
      await stopRecord(filename);
      activeRecords = activeRecords.filter((r) => r.filename !== filename);
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  onMount(() => {
    fetchActive();
    const interval = setInterval(fetchActive, 3000);
    return () => clearInterval(interval);
  });
</script>

<Background />
<Nav active="recording" />

<section class="hero">
  <p class="label">cime live recorder</p>
  <h1>Record.<br/>Live. Save.</h1>
  <p class="desc">씨미 라이브 방송을 실시간으로<br/>녹화하고 저장하세요.</p>

  <div class="form-card">
    <div class="form-row">
      <input
        type="text"
        placeholder="스트림 URL을 입력하세요"
        bind:value={url}
      />
    </div>
    <div class="form-row record-row">
      <div class="record-input">
        <label for="file-name">파일명</label>
        <input
          id="file-name"
          type="text"
          placeholder="예: stream_20260313"
          bind:value={fileName}
        />
      </div>
      <button onclick={submitRecord} disabled={loading || !url || !fileName}>
        {loading ? '시작중...' : '녹화 시작 ✦'}
      </button>
    </div>
    {#if errorMsg}
      <p class="error">{errorMsg}</p>
    {/if}
  </div>
</section>

<section class="clips-section">
  <h2>녹화 중</h2>
  {#if activeRecords.length === 0}
    <p class="empty">현재 녹화 중인 스트림이 없어요.</p>
  {:else}
    <div class="clips-grid">
      {#each activeRecords as record (record.filename)}
        <div class="clip-card record-card">
          <div class="clip-header">
            <div class="clip-header-left">
              <span class="rec-dot"></span>
              <span class="platform">REC</span>
            </div>
            <button class="delete-btn" onclick={() => handleStop(record.filename)} aria-label="중지">■</button>
          </div>
          <p class="clip-title">{record.filename}</p>
          {#if record.url}
            <p class="clip-sub record-url">{record.url}</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>
