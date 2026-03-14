<script lang="ts">
  import { onMount } from 'svelte';
  import '../../styles/page.css';
  import '../../styles/record.css';
  import {
    getSchedules,
    createSchedule,
    cancelSchedule,
    type RecordSchedule
  } from '$lib/api/record';
  import { statusColor, statusLabel } from '$lib/utils/status';
  import Background from '$lib/components/Background.svelte';
  import Nav from '$lib/components/Nav.svelte';

  let url = $state('');
  let fileName = $state('');
  let scheduledAt = $state('');
  let duration = $state<number | ''>('');
  let loading = $state(false);
  let errorMsg = $state('');
  let schedules = $state<RecordSchedule[]>([]);

  async function fetchSchedules() {
    schedules = await getSchedules();
  }

  async function submitSchedule() {
    if (!url || !fileName || !scheduledAt) return;
    loading = true;
    errorMsg = '';
    try {
      const isoAt = new Date(scheduledAt).toISOString();
      await createSchedule(url, fileName, isoAt, duration !== '' ? Number(duration) : null);
      url = '';
      fileName = '';
      scheduledAt = '';
      duration = '';
      await fetchSchedules();
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function handleCancel(id: string) {
    try {
      await cancelSchedule(id);
      schedules = schedules.filter((s) => s.id !== id);
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('ko-KR');
  }

  onMount(() => {
    fetchSchedules();
    const interval = setInterval(fetchSchedules, 3000);
    return () => clearInterval(interval);
  });
</script>

<Background />
<Nav active="schedule" />

<section class="hero">
  <p class="label">cime live scheduler</p>
  <h1>Schedule.<br/>Record. Auto.</h1>
  <p class="desc">녹화 예약을 설정하고<br/>자동으로 녹화를 시작하세요.</p>

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
        <label for="sched-filename">파일명</label>
        <input
          id="sched-filename"
          type="text"
          placeholder="예: stream_20260315"
          bind:value={fileName}
        />
      </div>
    </div>
    <div class="form-row record-row">
      <div class="record-input">
        <label for="sched-at">예약 시각</label>
        <input
          id="sched-at"
          type="datetime-local"
          bind:value={scheduledAt}
        />
      </div>
      <div class="record-input">
        <label for="sched-duration">녹화 시간(초, 선택)</label>
        <input
          id="sched-duration"
          type="number"
          min="1"
          placeholder="예: 3600"
          bind:value={duration}
        />
      </div>
    </div>
    <div class="form-row">
      <button
        onclick={submitSchedule}
        disabled={loading || !url || !fileName || !scheduledAt}
      >
        {loading ? '등록중...' : '예약 등록 ✦'}
      </button>
    </div>
    {#if errorMsg}
      <p class="error">{errorMsg}</p>
    {/if}
  </div>
</section>

<section class="clips-section">
  <h2>예약 목록</h2>
  {#if schedules.length === 0}
    <p class="empty">예약된 녹화가 없어요.</p>
  {:else}
    <div class="clips-grid">
      {#each schedules as schedule (schedule.id)}
        <div class="clip-card record-card">
          <div class="clip-header">
            <div class="clip-header-left">
              <span class="platform">SCHED</span>
              <span class="status" style="color: {statusColor(schedule.status)}">
                {statusLabel(schedule.status)}
              </span>
            </div>
            {#if schedule.status === 'pending'}
              <button
                class="delete-btn"
                onclick={() => handleCancel(schedule.id)}
                aria-label="취소"
              >×</button>
            {/if}
          </div>
          <p class="clip-title">{schedule.filename}</p>
          <p class="clip-sub record-url">{schedule.url}</p>
          <div class="clip-meta">
            <span>예약: {formatDate(schedule.scheduled_at)}</span>
            {#if schedule.duration}
              <span>{schedule.duration}초</span>
            {/if}
          </div>
          <div class="clip-meta">
            <span>등록: {formatDate(schedule.created_at)}</span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>
