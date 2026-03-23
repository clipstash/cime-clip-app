<script lang="ts">
	import { fetchFile } from '@ffmpeg/util';
	import { loadFfmpeg } from '$lib/ffmpeg';
	import { fetchClipInfo } from '$lib/api/clips';
	import { parseM3u8 } from '$lib/utils/stream';
	import { proxyUrl } from '$lib/utils/proxy';
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

	// ── 클립 다운로드 상태 ───────────────────────────────────────────
	type DlStatus = 'idle' | 'loading' | 'downloading' | 'encoding' | 'error';

	const MAX_CLIP_SEC = 3600; // 60분 최대 클립 길이

	let err = $state('');
	let cancelClipRequested = $state(false);
	let pauseClipRequested = $state(false);
	let dlStatus = $state<DlStatus>('idle');
	let progress = $state(0);
	let progressLabel = $state('');

	// 처리 중 여부 (버튼 비활성화 등에 사용)
	const busy = $derived(
		dlStatus === 'loading' || dlStatus === 'downloading' || dlStatus === 'encoding'
	);

	// 파일명 베이스: [스트리머] 제목_YYYYMMDD 형식 (녹화와 동일)
	function makeBaseName(t: string | null, s: string | null): string {
		const today = new Date();
		const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
		const raw = s ? `[${s}] ${t ?? 'clip'}_${dateStr}` : `${t ?? 'clip'}_${dateStr}`;
		return raw.replace(/[\\/:*?"<>|]/g, '_');
	}

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
			progressLabel
		});
		return () => clipListStore.setPreview(null);
	});

	// ── 클립 생성 ────────────────────────────────────────────────────
	async function submit() {
		if (!url || dlStatus !== 'idle' || !!tr.timeError) return;

		cancelClipRequested = false;
		pauseClipRequested = false;
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
			let cumTime = 0;
			const selectedIdxs: number[] = [];
			for (let i = 0; i < segments.length; i++) {
				const segDur = durations[i] || 2;
				if (cumTime + segDur > tr.startSec && cumTime < tr.endSec) selectedIdxs.push(i);
				cumTime += segDur;
			}
			if (selectedIdxs.length === 0) throw new Error('지정한 구간이 현재 스트림 범위를 벗어납니다');

			// 4. FFmpeg 로드
			ffmpeg = await loadFfmpeg();
			dlStatus = 'downloading';

			// 5. 초기화 세그먼트(init) 다운로드 (fMP4 포맷일 때 필요)
			let initData: Uint8Array | null = null;
			if (initUrl) {
				initData = await fetchFile(proxyUrl(initUrl));
			}

			// 6. 선택된 세그먼트 순차 다운로드 (취소/일시정지 요청 시 처리)
			const segParts: Uint8Array[] = [];
			for (let idx = 0; idx < selectedIdxs.length; idx++) {
				// 일시정지 대기 — 취소되면 즉시 탈출
				while (pauseClipRequested && !cancelClipRequested) {
					await new Promise<void>((r) => setTimeout(r, 200));
				}
				if (cancelClipRequested) {
					dlStatus = 'idle';
					progress = 0;
					progressLabel = '';
					return;
				}
				segParts.push(await fetchFile(proxyUrl(segments[selectedIdxs[idx]])));
				progress = Math.round(((idx + 1) / selectedIdxs.length) * 80);
				progressLabel = `${idx + 1} / ${selectedIdxs.length} 세그먼트`;
			}

			if (cancelClipRequested) {
				dlStatus = 'idle';
				progress = 0;
				progressLabel = '';
				return;
			}

			// 7. 세그먼트 바이너리 병합 → FFmpeg 입력 파일로 기록
			const combined_parts: Uint8Array[] = initData ? [initData, ...segParts] : segParts;
			const totalBytes = combined_parts.reduce((a, p) => a + p.byteLength, 0);
			const combined = new Uint8Array(totalBytes);
			let byteOffset = 0;
			for (const part of combined_parts) {
				combined.set(part, byteOffset);
				byteOffset += part.byteLength;
			}
			await ffmpeg.writeFile('input.mp4', combined);

			// 8. FFmpeg로 구간 트림 — 60분 초과 시 파트별 분할 → 파트별 onSuccess 콜백
			dlStatus = 'encoding';
			const totalClipDur = tr.endSec - tr.startSec;
			const numParts = Math.ceil(totalClipDur / MAX_CLIP_SEC);
			const baseName = makeBaseName(info.title, info.streamer);

			for (let i = 0; i < numParts; i++) {
				const chunkStart = tr.startSec + i * MAX_CLIP_SEC;
				const chunkDur = Math.min(MAX_CLIP_SEC, tr.endSec - chunkStart);
				const outFile = `output_${i}.mp4`;

				progressLabel = numParts > 1
					? `파트 ${i + 1}/${numParts} 인코딩 중...`
					: 'MP4 변환 중...';
				progress = 82 + Math.round((i / numParts) * 14);

				await ffmpeg.exec([
					'-ss', String(chunkStart),
					'-i', 'input.mp4',
					'-t', String(chunkDur),
					'-c', 'copy',
					outFile
				]);

				const raw = (await ffmpeg.readFile(outFile)) as Uint8Array;
				const buf = new ArrayBuffer(raw.byteLength);
				new Uint8Array(buf).set(raw);
				const blob = new Blob([buf], { type: 'video/mp4' });
				const filename = numParts > 1 ? `${baseName}_part${i + 1}.mp4` : `${baseName}.mp4`;
				onSuccess({ title: info.title, startSec: chunkStart, endSec: chunkStart + chunkDur, blobUrl: URL.createObjectURL(blob), filename });
				await ffmpeg.deleteFile(outFile);
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
			bind:h={tr.startH}
			bind:m={tr.startM}
			bind:s={tr.startS}
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
			bind:h={tr.endH}
			bind:m={tr.endM}
			bind:s={tr.endS}
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
		{#if dlStatus === 'downloading'}
			{#if pauseClipRequested}
				<button class="cancel-btn" onclick={() => (pauseClipRequested = false)}>재개 ▶</button>
			{:else}
				<button class="cancel-btn" onclick={() => (pauseClipRequested = true)}>일시정지 ⏸</button>
			{/if}
		{/if}
		<button class="cancel-btn" onclick={() => { cancelClipRequested = true; pauseClipRequested = false; }}>취소 ✕</button>
	{:else}
		<button class="submit-btn" onclick={submit} disabled={!url || !!tr.timeError}>클립 생성 ✦</button>
	{/if}

	<!-- 전체 영상 다운로드 버튼 -->
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
		<button class="submit-btn" onclick={() => videoDl.download(url)} disabled={!url}>전체 다운로드 ✦</button>
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

