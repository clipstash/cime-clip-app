<script lang="ts">
	import { makeBaseName } from '$lib/utils/filename';
	import { useTimeRange } from '$lib/hooks/useTimeRange.svelte';
	import { useVideoDownload } from '$lib/hooks/useVideoDownload.svelte';
	import { useClipDownload, MAX_CLIP_SEC } from '$lib/hooks/useClipDownload.svelte';
	import { clipListStore } from '$lib/stores/clipListStore.svelte';
	import HmsInput from '../ui/HmsInput.svelte';
	import TimelineSlider from '../ui/TimelineSlider.svelte';
	import ProgressBar from '../ui/ProgressBar.svelte';

	// ── Props 타입 ───────────────────────────────────────────────────
	type Props = {
		url: string;
		title: string | null;
		streamer: string | null;
		thumbnail: string | null;
		totalSec: number;
		durationLoaded: boolean;
		onSuccess: (info: {
			title: string | null;
			startSec: number;
			endSec: number;
			blobUrl: string;
			filename: string;
		}) => void;
		onVideoSuccess: (info: { title: string | null; url: string; blobUrl: string; filename: string }) => void;
	};

	const { url, title, streamer, thumbnail, totalSec, durationLoaded, onSuccess, onVideoSuccess }: Props = $props();

	// ── 훅 초기화 ────────────────────────────────────────────────────
	// 시간 범위(시작~종료) 및 타임라인 슬라이더 상태 관리
	const tr = useTimeRange(
		() => url,
		() => totalSec,
		() => durationLoaded
	);
	// 전체 영상 다운로드 상태 관리
	const videoDl = useVideoDownload((info) => onVideoSuccess(info));
	// 클립 다운로드 상태 관리
	const clipDl = useClipDownload((info) => onSuccess(info));

	// 전체 다운로드 파일명: url이 바뀌면 자동 초기화, 같은 url 내에서는 사용자 편집 유지
	let videoFilenameOverride = $state<{ url: string; value: string } | null>(null);
	const videoFilename = $derived(
		videoFilenameOverride?.url === url ? videoFilenameOverride.value : makeBaseName(title, streamer)
	);

	// 생성 예정 파일 목록 (클립 파트)
	const previewFiles = $derived.by(() => {
		if (!durationLoaded || tr.timeError || (tr.startSec === 0 && tr.endSec === 0)) return [];
		const baseName = makeBaseName(title, streamer);
		const files: { filename: string; timeLabel: string }[] = [];
		const clipCount = Math.ceil(tr.clipDuration / MAX_CLIP_SEC);
		if (clipCount <= 1) {
			files.push({ filename: `${baseName}.mp4`, timeLabel: `${tr.formatTime(tr.startSec)} ~ ${tr.formatTime(tr.endSec)}` });
		} else {
			for (let i = 0; i < clipCount; i++) {
				const start = tr.startSec + i * MAX_CLIP_SEC;
				const end = Math.min(tr.startSec + (i + 1) * MAX_CLIP_SEC, tr.endSec);
				files.push({ filename: `${baseName}_part${i + 1}.mp4`, timeLabel: `${tr.formatTime(start)} ~ ${tr.formatTime(end)}` });
			}
		}
		return files;
	});

	// 생성 예정 미리보기를 clipListStore에 동기화
	$effect(() => {
		if (!url || !durationLoaded || previewFiles.length === 0) {
			clipListStore.setPreview(null);
			return () => clipListStore.setPreview(null);
		}
		clipListStore.setPreview({
			files: previewFiles,
			title,
			streamer,
			thumbnail,
			busy: clipDl.busy,
			progress: clipDl.progress,
			progressLabel: clipDl.progressLabel,
			currentFileIdx: clipDl.currentFileIdx
		});
		return () => clipListStore.setPreview(null);
	});
</script>

<!-- ── 타임라인 슬라이더 (영상 길이가 로드된 경우에만 표시) ── -->
{#if durationLoaded}
	<TimelineSlider
		bind:trackEl={tr.trackEl}
		startPct={tr.startPct}
		endPct={tr.endPct}
		startSec={tr.startSec}
		endSec={tr.endSec}
		clipDuration={tr.clipDuration}
		{totalSec}
		onSeekToClick={tr.seekToClick}
		onStartDrag={tr.startDrag}
		onDragMove={tr.onDragMove}
		onDragEnd={() => (tr.dragging = null)}
		formatTime={tr.formatTime}
	/>
{/if}

<!-- ── 시간 입력 + 액션 버튼 행 ── -->
<div class="form-row time-row clip-action">
	<!-- 시작 시간 입력 -->
	<div class="time-input">
		<span class="time-label" aria-hidden="true">클립</span>
		<HmsInput
			bind:h={tr.start.h}
			bind:m={tr.start.m}
			bind:s={tr.start.s}
			ariaPrefix="시작"
			fieldPrefix="start"
			onFocus={(field) => (tr.focusedField = field)}
			onClamp={tr.clampField}
			onStep={(delta) => tr.step(delta, 'start')}
		/>
	</div>

	<!-- 종료 시간 입력 -->
	<div class="time-input">
		<span class="time-label" aria-hidden="true">→</span>
		<HmsInput
			bind:h={tr.end.h}
			bind:m={tr.end.m}
			bind:s={tr.end.s}
			ariaPrefix="종료"
			fieldPrefix="end"
			onFocus={(field) => (tr.focusedField = field)}
			onClamp={tr.clampField}
			onStep={(delta) => tr.step(delta, 'end')}
		/>
	</div>

	<!-- 클립 생성 버튼 -->
	{#if clipDl.busy}
		<button class="submit-btn" disabled>처리중...</button>
		<button class="cancel-btn" onclick={clipDl.cancel}>취소 ✕</button>
	{:else}
		<button class="submit-btn" onclick={() => clipDl.submit(url, tr.startSec, tr.endSec)} disabled={!url || !!tr.timeError}>클립 생성 ✦</button>
	{/if}
</div>

<!-- 전체 영상 다운로드 행 -->
<div class="form-row video-dl-row">
	<input
		class="filename-input"
		type="text"
		value={videoFilename}
		oninput={(e) => { videoFilenameOverride = { url, value: e.currentTarget.value }; }}
		placeholder="파일명 (확장자 제외)"
		disabled={videoDl.busy}
	/>
	{#if videoDl.busy}
		<button class="submit-btn" disabled>처리중...</button>
		{#if videoDl.status === 'downloading'}
			{#if videoDl.isPaused}
				<button class="cancel-btn" onclick={videoDl.resume}>재개 ▶</button>
			{:else}
				<button class="cancel-btn" onclick={videoDl.pause}>일시정지 ⏸</button>
			{/if}
		{/if}
		<button class="cancel-btn" onclick={videoDl.cancel}>취소 ✕</button>
	{:else}
		<button class="submit-btn" onclick={() => videoDl.download(url, videoFilename || makeBaseName(title, streamer))} disabled={!url}>전체 다운로드 ✦</button>
	{/if}
</div>

<!-- ── 진행률 바 ── -->
{#if clipDl.busy}
	<div class="form-row">
		<ProgressBar progress={clipDl.progress} label={clipDl.progressLabel} />
	</div>
{/if}

{#if videoDl.busy}
	<div class="form-row">
		<ProgressBar progress={videoDl.progress} label={videoDl.progressLabel} />
	</div>
{/if}

<!-- ── 에러 메시지 ── -->
{#if tr.timeError}
	<p class="error">{tr.timeError}</p>
{/if}
{#if clipDl.err}
	<p class="error">{clipDl.err}</p>
{/if}
{#if videoDl.err}
	<p class="error">{videoDl.err}</p>
{/if}

