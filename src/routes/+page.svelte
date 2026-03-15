<script lang="ts">
  import { resolve } from '$app/paths';
  import '../styles/page.css';
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
      <h3>클립 · 녹화 · 다운로드</h3>
      <p class="feature-desc">구간 클립 생성, 실시간 녹화, 풀 영상 다운로드를 한 곳에서.</p>
      <ol class="manual-steps">
        <li>방송 URL 입력</li>
        <li>원하는 작업 탭 선택</li>
        <li>옵션 설정 후 실행</li>
        <li>완료 후 다운로드</li>
      </ol>
      <a href={resolve('/clips')} class="feature-btn">바로 가기 →</a>
    </div>

    <div class="feature-card">
      <div class="feature-icon">🕐</div>
      <h3>녹화 예약</h3>
      <p class="feature-desc">원하는 시각에 자동으로 녹화를 시작합니다. 미리 예약해두세요.</p>
      <ol class="manual-steps">
        <li>스트림 URL 입력</li>
        <li>파일명 입력</li>
        <li>예약 시각 설정</li>
        <li>녹화 시간 설정 (선택)</li>
      </ol>
      <a href={resolve('/schedule')} class="feature-btn">예약하기 →</a>
    </div>
  </div>
</section>
