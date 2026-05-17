<script lang="ts">
  import '../styles/page.css';
  import { sourceStore } from '$lib/stores/sourceStore.svelte';
  import { clipListStore } from '$lib/stores/clipListStore.svelte';
  import Background from '$lib/components/Background.svelte';
  // import Nav from '$lib/components/Nav.svelte';
  import ClipCard from '$lib/components/cards/ClipCard.svelte';
  import VideoCard from '$lib/components/cards/VideoCard.svelte';
  import RecordCard from '$lib/components/cards/RecordCard.svelte';
  import PreviewModal from '$lib/components/PreviewModal.svelte';
  import SourcePreview from '$lib/components/SourcePreview.svelte';
  import ClipForm from '$lib/components/forms/ClipForm.svelte';
  import RecordForm from '$lib/components/forms/RecordForm.svelte';
  import PreviewCard from '$lib/components/cards/PreviewCard.svelte';
</script>

<svelte:head>
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"WebApplication","name":"CIME Clip","description":"씨미 라이브 스트림 클립·다운로드·녹화 웹앱","url":"https://cime-clip.app","applicationCategory":"MultimediaApplication","operatingSystem":"Web Browser","offers":{"@type":"Offer","price":"0","priceCurrency":"KRW"}}
  </script>
</svelte:head>

<Background />
<!-- <Nav /> -->

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

<section class="feature-section">
  <div class="feature-grid">
    <div class="feature-card">
      <p class="feature-icon">✂️</p>
      <h3>씨미 클립 추출</h3>
      <p class="feature-desc">CIME VOD에서 원하는 구간을 지정해 MP4 클립으로 저장. 시작·종료 시간을 초 단위로 입력하거나 타임라인 슬라이더로 드래그해 구간을 선택할 수 있습니다.</p>
      <ol class="manual-steps">
        <li>씨미 VOD URL 입력</li>
        <li>시작·종료 시간 지정</li>
        <li>CLIP 버튼으로 다운로드</li>
      </ol>
    </div>
    <div class="feature-card">
      <p class="feature-icon">⏺️</p>
      <h3>씨미 라이브 녹화</h3>
      <p class="feature-desc">씨미 라이브 녹화는 방송 URL을 입력하면 자동 감지됩니다. 3초 간격으로 새 세그먼트를 받아 저장하며, 일시정지 후 재개해도 끊김 없이 하나의 파일로 병합합니다.</p>
      <ol class="manual-steps">
        <li>씨미 라이브 URL 입력</li>
        <li>REC 버튼으로 녹화 시작</li>
        <li>STOP으로 완료 — MP4 저장</li>
      </ol>
    </div>
  </div>
</section>
