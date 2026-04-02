<script lang="ts">
	import { FFmpeg } from '@ffmpeg/ffmpeg';
	import { fetchFile } from '@ffmpeg/util';
	import { loadFfmpeg } from '$lib/ffmpeg';
	import { fetchClipInfo } from '$lib/api/clips';
	import { parseM3u8 } from '$lib/utils/stream';
	import { proxyUrl } from '$lib/utils/proxy';
	import { makeBaseName } from '$lib/utils/filename';
	import { useTimeRange } from '$lib/hooks/useTimeRange.svelte';
	import { useVideoDownload } from '$lib/hooks/useVideoDownload.svelte';
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

	// 전체 다운로드 파일명: url이 바뀌면 자동 초기화, 같은 url 내에서는 사용자 편집 유지
	let videoFilenameOverride = $state<{ url: string; value: string } | null>(null);
	const videoFilename = $derived(
		videoFilenameOverride?.url === url ? videoFilenameOverride.value : makeBaseName(title, streamer)
	);

	// ── 클립 다운로드 상태 ───────────────────────────────────────────
	type DlStatus = 'idle' | 'loading' | 'downloading' | 'encoding' | 'error';

	const MAX_CLIP_SEC = 3600; // 60분 최대 클립 길이

	// 진행률 구간: 다운로드 0~80%, 인코딩 82~96%, 완료 100%
	const PROGRESS_DOWNLOAD_END = 80;
	const PROGRESS_ENCODE_START = 82;
	const PROGRESS_ENCODE_RANGE = 14;

	let err = $state('');
	let cancelClipRequested = false;
	let dlStatus = $state<DlStatus>('idle');
	let progress = $state(0);
	let progressLabel = $state('');
	let currentFileIdx = $state(0);

	// 처리 중 여부 (버튼 비활성화 등에 사용)
	const busy = $derived(
		dlStatus === 'loading' || dlStatus === 'downloading' || dlStatus === 'encoding'
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
			busy,
			progress,
			progressLabel,
			currentFileIdx
		});
		return () => clipListStore.setPreview(null);
	});

	// ── 헬퍼 함수 ───────────────────────────────────────────────────

	// 선택 구간에 해당하는 세그먼트 인덱스 및 첫 세그먼트 시작 시간 반환
	function filterSegments(
		segments: string[],
		durations: number[],
		startSec: number,
		endSec: number
	): { idxs: number[]; firstCumTime: number } {
		let cumTime = 0;
		const idxs: number[] = [];
		let firstCumTime = 0;
		for (let i = 0; i < segments.length; i++) {
			const segDur = durations[i] || 2;
			if (cumTime + segDur > startSec && cumTime < endSec) {
				if (idxs.length === 0) firstCumTime = cumTime;
				idxs.push(i);
			}
			cumTime += segDur;
		}
		return { idxs, firstCumTime };
	}

	// Uint8Array 배열을 하나로 병합
	function concatBuffers(parts: Uint8Array[]): Uint8Array {
		const total = parts.reduce((a, p) => a + p.byteLength, 0);
		const out = new Uint8Array(total);
		let offset = 0;
		for (const p of parts) { out.set(p, offset); offset += p.byteLength; }
		return out;
	}

	// FFmpeg로 input.mp4를 seekSec 지점부터 durSec 길이로 트림하여 ArrayBuffer 반환
	async function trimPart(ffmpeg: FFmpeg, outFile: string, seekSec: number, durSec: number): Promise<ArrayBuffer> {
		await ffmpeg.exec(['-ss', String(seekSec), '-i', 'input.mp4', '-t', String(durSec), '-c', 'copy', outFile]);
		const raw = (await ffmpeg.readFile(outFile)) as Uint8Array;
		await ffmpeg.deleteFile(outFile);
		const buf = new ArrayBuffer(raw.byteLength);
		new Uint8Array(buf).set(raw);
		return buf;
	}

	// ── 클립 생성 ────────────────────────────────────────────────────
	async function submit() {
		if (!url || dlStatus !== 'idle' || !!tr.timeError) return;

		cancelClipRequested = false;
		dlStatus = 'loading';
		err = '';
		progress = 0;

		let ffmpeg: Awaited<ReturnType<typeof loadFfmpeg>> | null = null;
		try {
			// 1. 스트림 정보 조회 및 m3u8 URL 확인
			const info = await fetchClipInfo(url);
			if (!info) throw new Error('스트림 정보를 불러올 수 없습니다');
			if (!info.m3u8_url) throw new Error('스트림 URL을 찾을 수 없습니다');

			// 2. m3u8 파싱 → 세그먼트 목록 추출
			const { initUrl, segments, durations } = await parseM3u8(info.m3u8_url);
			if (segments.length === 0) throw new Error('세그먼트를 찾을 수 없습니다');

			// 3. 선택 구간에 해당하는 세그먼트 인덱스 필터링
			// firstSegCumTime: 첫 번째 선택 세그먼트 시작 시간 (FFmpeg seek 오프셋 계산용)
			const { idxs: selectedIdxs, firstCumTime: firstSegCumTime } = filterSegments(segments, durations, tr.startSec, tr.endSec);
			if (selectedIdxs.length === 0) throw new Error('지정한 구간이 현재 스트림 범위를 벗어납니다');

			// 4. FFmpeg 로드
			ffmpeg = await loadFfmpeg();
			dlStatus = 'downloading';

			// 5. 초기화 세그먼트(init) 다운로드 (fMP4 포맷일 때 필요)
			let initData: Uint8Array | null = null;
			if (initUrl) {
				initData = await fetchFile(proxyUrl(initUrl));
			}

			// 6. 선택된 세그먼트 병렬 다운로드
			if (cancelClipRequested) { dlStatus = 'idle'; progress = 0; progressLabel = ''; return; }
			let completedFetches = 0;
			const segParts = await Promise.all(
				selectedIdxs.map((segIdx) =>
					fetchFile(proxyUrl(segments[segIdx])).then((data) => {
						if (!cancelClipRequested) {
							completedFetches++;
							progress = Math.round((completedFetches / selectedIdxs.length) * PROGRESS_DOWNLOAD_END);
							progressLabel = `${completedFetches} / ${selectedIdxs.length} 세그먼트`;
						}
						return data;
					})
				)
			);
			if (cancelClipRequested) { dlStatus = 'idle'; progress = 0; progressLabel = ''; return; }

			// 7. 세그먼트 바이너리 병합 → FFmpeg 입력 파일로 기록
			await ffmpeg.writeFile('input.mp4', concatBuffers(initData ? [initData, ...segParts] : segParts));

			// 8. FFmpeg로 구간 트림 — 60분 초과 시 파트별 분할 → 파트별 onSuccess 콜백
			dlStatus = 'encoding';
			const totalClipDur = tr.endSec - tr.startSec;
			const numParts = Math.ceil(totalClipDur / MAX_CLIP_SEC);
			const baseName = makeBaseName(info.title, info.streamer);

			for (let i = 0; i < numParts; i++) {
				const chunkStart = tr.startSec + i * MAX_CLIP_SEC;
				const chunkDur = Math.min(MAX_CLIP_SEC, tr.endSec - chunkStart);
				const outFile = `output_${i}.mp4`;

				currentFileIdx = i;
				progressLabel = numParts > 1
					? `파트 ${i + 1}/${numParts} 인코딩 중...`
					: 'MP4 변환 중...';
				progress = PROGRESS_ENCODE_START + Math.round((i / numParts) * PROGRESS_ENCODE_RANGE);

				// chunkStart - firstSegCumTime: 합친 파일 내 seek 오프셋 (절대/상대 PTS 모두 대응)
				// -ss를 -i 앞에 두어 keyframe 기준 fast seek → 블랙 스크린 방지
				const raw = await trimPart(ffmpeg, outFile, chunkStart - firstSegCumTime, chunkDur);
				const blob = new Blob([raw], { type: 'video/mp4' });
				const filename = numParts > 1 ? `${baseName}_part${i + 1}.mp4` : `${baseName}.mp4`;
				onSuccess({ title: info.title, startSec: chunkStart, endSec: chunkStart + chunkDur, blobUrl: URL.createObjectURL(blob), filename });
			}

			// 9. FFmpeg 입력 파일 정리
			await ffmpeg.deleteFile('input.mp4');

			// 10. 완료 처리
			progress = 100;
			progressLabel = '완료!';
			dlStatus = 'idle';
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
			dlStatus = 'error';
		} finally {
			ffmpeg?.terminate();
		}
	}
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
	{#if busy}
		<button class="submit-btn" disabled>처리중...</button>
		<button class="cancel-btn" onclick={() => { cancelClipRequested = true; }}>취소 ✕</button>
	{:else}
		<button class="submit-btn" onclick={submit} disabled={!url || !!tr.timeError}>클립 생성 ✦</button>
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
{#if busy}
	<div class="form-row">
		<ProgressBar {progress} label={progressLabel} />
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
{#if err}
	<p class="error">{err}</p>
{/if}
{#if videoDl.err}
	<p class="error">{videoDl.err}</p>
{/if}

