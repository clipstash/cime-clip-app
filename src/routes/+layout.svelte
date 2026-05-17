<script lang="ts">
	import '../styles/global.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>CIME Clip — 씨미 라이브 다운로드 · 클립 · 녹화</title>
	<meta name="description" content="씨미(CIME) 라이브 스트림을 구간 클립, 전체 다운로드, 실시간 녹화. 별도 설치 없이 브라우저에서 바로 사용." />
	<meta property="og:title" content="CIME Clip — 씨미 라이브 다운로드 · 클립 · 녹화" />
	<meta property="og:description" content="씨미 라이브를 클립하거나 전체 다운로드, 또는 실시간으로 녹화하세요." />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="https://cime-clip.app" />
</svelte:head>
{@render children()}