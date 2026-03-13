<script lang="ts">
  import { onMount } from 'svelte';
  import '../../styles/page.css';
  import { getClips, createClip, deleteClip, type Clip } from '$lib/api/clips';
  import { statusColor, statusLabel } from '$lib/utils/status';
  import Background from '$lib/components/Background.svelte';
  import Nav from '$lib/components/Nav.svelte';

  let url = $state('');
  let startH = $state(0);
  let startM = $state(0);
  let startS = $state(0);
  let endH = $state(0);
  let endM = $state(0);
  let endS = $state(30);
  let focusedField = $state<string | null>(null);
  let loading = $state(false);
  let clips = $state<Clip[]>([]);
  let errorMsg = $state('');

  const fieldMap: Record<string, { get: () => number; set: (v: number) => void; max: number }> = {
    startH: { get: () => startH, set: (v) => (startH = v), max: Infinity },
    startM: { get: () => startM, set: (v) => (startM = v), max: 59 },
    startS: { get: () => startS, set: (v) => (startS = v), max: 59 },
    endH:   { get: () => endH,   set: (v) => (endH = v),   max: Infinity },
    endM:   { get: () => endM,   set: (v) => (endM = v),   max: 59 },
    endS:   { get: () => endS,   set: (v) => (endS = v),   max: 59 },
  };

  function step(delta: number, group: 'start' | 'end') {
    const key = focusedField ?? (group === 'start' ? 'startS' : 'endS');
    const field = fieldMap[key];
    if (!field) return;
    const next = Math.max(0, Math.min(field.max, field.get() + delta));
    field.set(next);
  }

  function toSeconds(h: number, m: number, s: number) {
    return h * 3600 + m * 60 + s;
  }

  async function fetchClips() {
    clips = await getClips();
  }

  async function submitClip() {
    if (!url) return;
    loading = true;
    errorMsg = '';
    try {
      await createClip(url, toSeconds(startH, startM, startS), toSeconds(endH, endM, endS));
      await fetchClips();
      url = '';
    } catch (e: any) {
      errorMsg = e.message;
    } finally {
      loading = false;
    }
  }

  async function removeClip(id: string) {
    try {
      await deleteClip(id);
      clips = clips.filter((c) => c.id !== id);
    } catch (e: any) {
      errorMsg = e.message;
    }
  }

  onMount(() => {
    fetchClips();
    const interval = setInterval(fetchClips, 3000);
    return () => clearInterval(interval);
  });
</script>

<Background />
<Nav active="clips" />

<section class="hero">
  <p class="label">cime clip downloader</p>
  <h1>Download.<br/>Clip. Share.</h1>
  <p class="desc">씨미 라이브 클립을 원하는 구간만<br/>빠르게 다운로드하세요.</p>

  <div class="form-card">
    <div class="form-row">
      <input
        type="text"
        placeholder="URL을 입력하세요"
        bind:value={url}
      />
    </div>
    <div class="form-row time-row">
      <div class="time-input">
        <label>시작</label>
        <div class="hms-inputs">
          <input type="number" bind:value={startH} min="0" aria-label="시작 시"
            onfocus={() => (focusedField = 'startH')} />
          <span class="hms-sep">:</span>
          <input type="number" bind:value={startM} min="0" max="59" aria-label="시작 분"
            onfocus={() => (focusedField = 'startM')} />
          <span class="hms-sep">:</span>
          <input type="number" bind:value={startS} min="0" max="59" aria-label="시작 초"
            onfocus={() => (focusedField = 'startS')} />
          <div class="hms-stepper">
            <button type="button" class="step-btn" onmousedown={(e) => { e.preventDefault(); step(1, 'start'); }}>▲</button>
            <button type="button" class="step-btn" onmousedown={(e) => { e.preventDefault(); step(-1, 'start'); }}>▼</button>
          </div>
        </div>
      </div>
      <div class="time-input">
        <label>종료</label>
        <div class="hms-inputs">
          <input type="number" bind:value={endH} min="0" aria-label="종료 시"
            onfocus={() => (focusedField = 'endH')} />
          <span class="hms-sep">:</span>
          <input type="number" bind:value={endM} min="0" max="59" aria-label="종료 분"
            onfocus={() => (focusedField = 'endM')} />
          <span class="hms-sep">:</span>
          <input type="number" bind:value={endS} min="0" max="59" aria-label="종료 초"
            onfocus={() => (focusedField = 'endS')} />
          <div class="hms-stepper">
            <button type="button" class="step-btn" onmousedown={(e) => { e.preventDefault(); step(1, 'end'); }}>▲</button>
            <button type="button" class="step-btn" onmousedown={(e) => { e.preventDefault(); step(-1, 'end'); }}>▼</button>
          </div>
        </div>
      </div>
      <button class="submit-btn" onclick={submitClip} disabled={loading}>
        {loading ? '처리중...' : '클립 생성 ✦'}
      </button>
    </div>
    {#if errorMsg}
      <p class="error">{errorMsg}</p>
    {/if}
  </div>
</section>

<section class="clips-section">
  <h2>클립 목록</h2>
  {#if clips.length === 0}
    <p class="empty">아직 클립이 없어요. URL을 입력해 첫 클립을 만들어보세요!</p>
  {:else}
    <div class="clips-grid">
      {#each clips as clip}
        <div class="clip-card">
          <div class="clip-header">
            <div class="clip-header-left">
              <span class="platform">{clip.platform}</span>
              <span class="status" style="color: {statusColor(clip.status)}">
                {statusLabel(clip.status)}
              </span>
            </div>
            <button class="delete-btn" onclick={() => removeClip(clip.id)} aria-label="삭제">×</button>
          </div>
          <p class="clip-title">{clip.title ?? '정보 로딩 중...'}</p>
          <p class="clip-sub">{clip.streamer ?? '-'}</p>
          <div class="clip-meta">
            <span>{clip.start_time}s ~ {clip.end_time}s</span>
            {#if clip.file_size}
              <span>{(clip.file_size / 1024 / 1024).toFixed(1)} MB</span>
            {/if}
          </div>
          {#if clip.file_url && clip.status === 'completed'}
            <a class="download-btn" href={clip.file_url} download>다운로드</a>
          {/if}
          {#if clip.error_message}
            <p class="clip-error">{clip.error_message}</p>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>
