<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import '../../styles/page.css';
  import {
    startRecord, stopRecord, pauseRecord, resumeRecord, cancelRecord,
    getActiveRecords, getRecord, type ActiveRecord
  } from '$lib/api/record';
  import { statusColor, statusLabel } from '$lib/utils/status';
  import Background from '$lib/components/Background.svelte';
  import Nav from '$lib/components/Nav.svelte';

  let url = $state('');
  let fileName = $state('');
  let loading = $state(false);
  let errorMsg = $state('');
  let records = $state<ActiveRecord[]>([]);
  let pausedSet = $state(new Set<string>());

  let modalUrl = $state('');
  let showModal = $state(false);

  function openModal(fileUrl: string) {
    modalUrl = localUrl(fileUrl);
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    modalUrl = '';
  }

  function localUrl(u?: string | null) {
    return u ? u.replace(/^https?:\/\/localhost:\d+/, '') : '';
  }

  async function fetchActive() {
    const { active, paused } = await getActiveRecords();
    pausedSet = paused;
    const activeNames = new Set(active.map((r) => r.filename));

    // active_list는 id가 없으므로 기존 레코드의 id를 유지
    const mergedActive = active.map((r) => {
      const existing = records.find((e) => e.filename === r.filename);
      return existing?.id ? { ...r, id: existing.id } : r;
    });

    const refreshed = await Promise.all(
      records
        .filter((r) => !activeNames.has(r.filename))
        .map(async (r) => {
          if (!r.id) return r;
          const fresh = await getRecord(r.id);
          return fresh ?? r;
        })
    );

    records = [...mergedActive, ...refreshed];
  }

  async function submitRecord() {
    if (!url || !fileName) return;
    loading = true;
    errorMsg = '';
    try {
      const record = await startRecord(url, fileName);
      url = '';
      fileName = '';
      records = [record, ...records.filter((r) => r.filename !== record.filename)];
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function handlePause(filename: string) {
    try {
      await pauseRecord(filename);
      pausedSet = new Set([...pausedSet, filename]);
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  async function handleResume(filename: string) {
    try {
      await resumeRecord(filename);
      pausedSet = new Set([...pausedSet].filter((f) => f !== filename));
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  async function handleStop(filename: string) {
    // 즉시 버튼 숨김 (완료 대기 중 표시)
    records = records.map((r) => r.filename === filename ? { ...r, status: 'stopping' } : r);
    pausedSet = new Set([...pausedSet].filter((f) => f !== filename));
    try {
      await stopRecord(filename);
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  async function handleCancel(filename: string) {
    records = records.map((r) => r.filename === filename ? { ...r, status: 'stopping' } : r);
    pausedSet = new Set([...pausedSet].filter((f) => f !== filename));
    try {
      const updated = await cancelRecord(filename);
      records = records.map((r) => r.filename === filename ? updated : r);
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  function handleRemove(filename: string) {
    records = records.filter((r) => r.filename !== filename);
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

  <div class="tab-toggle">
    <button onclick={() => goto('/clips')}>클립</button>
    <button onclick={() => goto('/clips')}>비디오</button>
    <button class="tab-active">녹화</button>
  </div>

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
      <button class="submit-btn" onclick={submitRecord} disabled={loading || !url || !fileName}>
        {loading ? '시작중...' : '녹화 시작 ✦'}
      </button>
    </div>
    {#if errorMsg}
      <p class="error">{errorMsg}</p>
    {/if}
  </div>
</section>

<section class="clips-section">
  <h2>녹화 목록</h2>
  {#if records.length === 0}
    <p class="empty">현재 녹화 중인 스트림이 없어요.</p>
  {:else}
    <div class="clips-grid">
      {#each records as record (record.filename)}
        {@const isPaused = pausedSet.has(record.filename)}
        {@const isActive = record.status === 'processing'}
        <div class="clip-card record-card">
          <div class="clip-header">
            <div class="clip-header-left">
              {#if isActive}
                <span class="rec-dot" class:paused={isPaused}></span>
              {/if}
              <span class="platform">REC</span>
              <span class="status" style="color: {statusColor(record.status)}">
                {record.status === 'stopping' ? '완료 중...' : isPaused ? '일시멈춤' : statusLabel(record.status)}
              </span>
            </div>
            {#if !isActive}
              <button class="delete-btn" onclick={() => handleRemove(record.filename)} aria-label="닫기">×</button>
            {/if}
          </div>

          <p class="clip-title">{record.filename}</p>
          {#if record.url}
            <p class="clip-sub record-url">{record.url}</p>
          {/if}
          {#if record.error_message}
            <p class="clip-error">{record.error_message}</p>
          {/if}

          {#if isActive}
            <div class="rec-controls">
              {#if isPaused}
                <button class="rec-btn rec-btn-resume" onclick={() => handleResume(record.filename)}>재개</button>
              {:else}
                <button class="rec-btn rec-btn-pause" onclick={() => handlePause(record.filename)}>일시멈춤</button>
              {/if}
              <button class="rec-btn rec-btn-stop" onclick={() => handleStop(record.filename)}>완료</button>
              <button class="rec-btn rec-btn-cancel" onclick={() => handleCancel(record.filename)}>취소</button>
            </div>
          {/if}

          {#if record.status === 'completed' && record.file_url}
            <div class="clip-actions">
              <button class="preview-card-btn" onclick={() => openModal(record.file_url!)}>미리보기</button>
              <a class="download-btn" href={localUrl(record.file_url)} download>다운로드</a>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

{#if showModal}
  <div class="modal-backdrop" onclick={closeModal} onkeydown={(e) => e.key === 'Escape' && closeModal()} role="presentation">
    <div class="modal-box" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <button class="modal-close" onclick={closeModal} aria-label="닫기">×</button>
      <video class="modal-video" src={modalUrl} controls autoplay><track kind="captions" /></video>
    </div>
  </div>
{/if}
