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
  import RecordForm from '$lib/components/forms/RecordForm.svelte';
  import PreviewCard from '$lib/components/cards/PreviewCard.svelte';
</script>

<Background />
<Nav />

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

    {#if sourceStore.url && !sourceStore.loading && !sourceStore.isLive}
      <div class="action-divider"></div>
      <ClipForm
        url={sourceStore.url}
        title={sourceStore.title}
        streamer={sourceStore.streamer}
        thumbnail={sourceStore.thumbnail}
        totalSec={sourceStore.totalSec}
        durationLoaded={sourceStore.durationLoaded}
        onSuccess={(info) => clipListStore.addClip(info)}
        onVideoSuccess={(info) => clipListStore.addVideo(info)}
      />
    {/if}

    {#if sourceStore.url && !sourceStore.loading && sourceStore.isLive}
      <div class="action-divider"></div>
      <RecordForm url={sourceStore.url} onSuccess={(info) => clipListStore.addRecord(info)} />
    {/if}
  </div>
</section>

{#if clipListStore.preview}
<section class="clips-section">
  <h2>생성 예정</h2>
  <div class="clips-grid">
    <PreviewCard
      files={clipListStore.preview.files}
      title={clipListStore.preview.title}
      streamer={clipListStore.preview.streamer}
      thumbnail={clipListStore.preview.thumbnail}
      busy={clipListStore.preview.busy}
      progress={clipListStore.preview.progress}
      progressLabel={clipListStore.preview.progressLabel}
      currentFileIdx={clipListStore.preview.currentFileIdx}
    />
  </div>
</section>
{/if}

{#if clipListStore.clips.length > 0 || clipListStore.videos.length > 0 || clipListStore.records.length > 0}
<section class="clips-section">
  <h2>목록</h2>
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
</section>
{/if}

{#if clipListStore.showModal}
  <PreviewModal url={clipListStore.modalUrl} onClose={() => clipListStore.closeModal()} />
{/if}
