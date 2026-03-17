<script lang="ts">
  import '../styles/page.css';
  import { sourceStore } from '$lib/stores/sourceStore.svelte';
  import { clipListStore } from '$lib/stores/clipListStore.svelte';
  import Background from '$lib/components/Background.svelte';
  import Nav from '$lib/components/Nav.svelte';
  import ClipCard from '$lib/components/cards/ClipCard.svelte';
  import VideoCard from '$lib/components/cards/VideoCard.svelte';
  import RecordCard from '$lib/components/cards/RecordCard.svelte';
  import PreviewModal from '$lib/components/PreviewModal.svelte';
  import SourcePreview from '$lib/components/SourcePreview.svelte';
  import ClipForm from '$lib/components/forms/ClipForm.svelte';
  import VideoForm from '$lib/components/forms/VideoForm.svelte';
  import RecordForm from '$lib/components/forms/RecordForm.svelte';
</script>

<Background />
<Nav active="clips" />

<section class="hero">
  <p class="label">cime clip & video & recorder</p>
  <h1>Download.<br/>Clip. Share.</h1>
  <p class="desc">씨미 라이브를 클립하거나 전체 다운로드,<br/>또는 실시간으로 녹화하세요.</p>

  <div class="form-card">
    <div class="form-row">
      <input type="text" placeholder="URL을 입력하세요" bind:value={sourceStore.url} />
    </div>

    {#if sourceStore.url}
      <SourcePreview
        url={sourceStore.url}
        sourceLoading={sourceStore.loading}
        sourceThumbnail={sourceStore.thumbnail}
        sourceTitle={sourceStore.title}
        sourceIsLive={sourceStore.isLive}
        durationLoaded={sourceStore.durationLoaded}
        totalSec={sourceStore.totalSec}
      />
    {/if}

    <div class="action-divider"></div>
    <ClipForm url={sourceStore.url} totalSec={sourceStore.totalSec} durationLoaded={sourceStore.durationLoaded} onSuccess={(info) => clipListStore.addClip(info)} />

    <div class="action-divider"></div>
    <VideoForm url={sourceStore.url} onSuccess={(info) => clipListStore.addVideo(info)} />

    <div class="action-divider"></div>
    <RecordForm url={sourceStore.url} onSuccess={(info) => clipListStore.addRecord(info)} />
  </div>
</section>

<section class="clips-section">
  <h2>목록</h2>
  {#if clipListStore.clips.length === 0 && clipListStore.videos.length === 0 && clipListStore.records.length === 0}
    <p class="empty">아직 항목이 없어요. URL을 입력해 시작해보세요!</p>
  {:else}
    <div class="clips-grid">
      {#each clipListStore.clips as clip (clip.id)}
        <ClipCard {clip} onRemove={(id) => clipListStore.removeClip(id)} onPreview={(u) => clipListStore.openModal(u)} />
      {/each}

      {#each clipListStore.videos as video (video.id)}
        <VideoCard {video} onRemove={(id) => clipListStore.removeVideo(id)} onPreview={(u) => clipListStore.openModal(u)} />
      {/each}

      {#each clipListStore.records as record (record.filename)}
        <RecordCard
          {record}
          isPaused={false}
          onPause={() => {}}
          onResume={() => {}}
          onStop={() => {}}
          onCancel={() => {}}
          onRemove={(f) => clipListStore.removeRecord(f)}
          onPreview={(u) => clipListStore.openModal(u)}
        />
      {/each}
    </div>
  {/if}
</section>

{#if clipListStore.showModal}
  <PreviewModal url={clipListStore.modalUrl} onClose={() => clipListStore.closeModal()} />
{/if}

<style>
  .action-divider {
    border-top: 1px solid #141414;
    margin: 0;
  }
</style>
