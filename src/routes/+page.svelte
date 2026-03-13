<script lang="ts">
  import { resolve } from '$app/paths';
  import '../styles/page.css';
  import '../styles/landing.css';
  import Background from '$lib/components/Background.svelte';
  import Nav from '$lib/components/Nav.svelte';
</script>

<Background />
<Nav />

<section class="hero">
  <p class="label">cime clip app</p>
  <h1>Download.<br/>Clip. Share.</h1>
  <p class="desc">씨미 라이브를 가장 쉽게 저장하는 방법.<br/>클립 다운로드부터 실시간 녹화까지.</p>
</section>

<section class="feature-section">
  <div class="feature-grid">
    <div class="feature-card">
      <div class="feature-icon">✂️</div>
      <h3>클립 다운로드</h3>
      <p class="feature-desc">방송 URL과 원하는 구간을 입력하면 해당 부분만 잘라서 저장합니다.</p>
      <ol class="manual-steps">
        <li>방송 URL 입력</li>
        <li>시작 · 종료 시간 (초) 설정</li>
        <li>클립 생성 버튼 클릭</li>
        <li>완료 후 다운로드</li>
      </ol>
      <a href={resolve('/clips')} class="feature-btn">클립 만들기 →</a>
    </div>

    <div class="feature-card">
      <div class="feature-icon">⏺️</div>
      <h3>라이브 녹화</h3>
      <p class="feature-desc">씨미 라이브 방송을 실시간으로 녹화합니다. 방송이 끝나기 전에 저장하세요.</p>
      <ol class="manual-steps">
        <li>스트림 URL 입력</li>
        <li>저장할 파일명 입력</li>
        <li>녹화 시작 버튼 클릭</li>
        <li>원할 때 녹화 중지</li>
      </ol>
      <a href={resolve('/recording')} class="feature-btn">녹화 시작하기 →</a>
    </div>

    <div class="feature-card">
      <div class="feature-icon">🎬</div>
      <h3>풀 영상 다운로드</h3>
      <p class="feature-desc">씨미 라이브 영상 전체를 다운로드합니다. URL만 입력하면 끝.</p>
      <ol class="manual-steps">
        <li>영상 URL 입력</li>
        <li>총 시간 입력 (선택)</li>
        <li>다운로드 버튼 클릭</li>
        <li>완료 후 저장</li>
      </ol>
      <a href={resolve('/videos')} class="feature-btn">다운로드하기 →</a>
    </div>
  </div>
</section>
