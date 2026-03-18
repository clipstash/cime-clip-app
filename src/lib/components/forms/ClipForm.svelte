<script lang="ts">
	import { fetchFile } from '@ffmpeg/util';
	import { loadFfmpeg } from '$lib/ffmpeg';
	import { fetchClipInfo } from '$lib/api/clips';
	import { parseM3u8 } from '$lib/utils/stream';
	import { useTimeRange } from '$lib/hooks/useTimeRange.svelte';
	import { useVideoDownload } from '$lib/hooks/useVideoDownload.svelte';
	import HmsInput from '../ui/HmsInput.svelte';
	import TimelineSlider from '../ui/TimelineSlider.svelte';
	import ProgressBar from '../ui/ProgressBar.svelte';

	// ── Props 타입 ───────────────────────────────────────────────────
	type Props = {
		url: string;
		totalSec: number;
		durationLoaded: boolean;
		onSuccess: (info: {
			title: string | null;
			startSec: number;
			endSec: number;
			blobUrl: string;
		}) => void;
		onVideoSuccess: (info: { title: string | null; url: string }) => void;
	};

	const { url, totalSec, durationLoaded, onSuccess, onVideoSuccess }: Props = $props();

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
	type DlStatus = 'idle' | 'loading' | 'downloading' | 'encoding' | 'done' | 'error';

	let err = $state('');
	let cancelClipRequested = $state(false);
	let dlStatus = $state<DlStatus>('idle');
	let progress = $state(0);
	let progressLabel = $state('');
	let dlBlobUrl = $state('');
	let dlFileName = $state('');

	// 처리 중 여부 (버튼 비활성화 등에 사용)
	const busy = $derived(
		dlStatus === 'loading' || dlStatus === 'downloading' || dlStatus === 'encoding'
	);

	// ── 클립 생성 ────────────────────────────────────────────────────
	async function submit() {
		if (!url || dlStatus !== 'idle' || !!tr.timeError) return;

		cancelClipRequested = false;
		dlStatus = 'loading';
		err = '';
		progress = 0;

		try {
			// 1. 스트림 정보 조회 및 m3u8 URL 확인
			const info = await fetchClipInfo(url);
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
			const ffmpeg = await loadFfmpeg();
			dlStatus = 'downloading';

			// 5. 초기화 세그먼트(init) 다운로드 (fMP4 포맷일 때 필요)
			let initData: Uint8Array | null = null;
			if (initUrl) {
				initData = await fetchFile(`/stream/proxy?url=${encodeURIComponent(initUrl)}`);
			}

			// 6. 선택된 세그먼트 순차 다운로드 (취소 요청 시 중단)
			const segParts: Uint8Array[] = [];
			for (let idx = 0; idx < selectedIdxs.length; idx++) {
				if (cancelClipRequested) {
					dlStatus = 'idle';
					progress = 0;
					progressLabel = '';
					return;
				}
				segParts.push(
					await fetchFile(
						`/stream/proxy?url=${encodeURIComponent(segments[selectedIdxs[idx]])}`
					)
				);
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
			const parts: Uint8Array[] = initData ? [initData, ...segParts] : segParts;
			const totalBytes = parts.reduce((a, p) => a + p.byteLength, 0);
			const combined = new Uint8Array(totalBytes);
			let byteOffset = 0;
			for (const part of parts) {
				combined.set(part, byteOffset);
				byteOffset += part.byteLength;
			}
			await ffmpeg.writeFile('input.mp4', combined);

			// 8. FFmpeg로 구간 트림 (스트림 복사 방식 — 재인코딩 없음)
			dlStatus = 'encoding';
			progressLabel = 'MP4 변환 중...';
			progress = 82;
			await ffmpeg.exec([
				'-ss', String(tr.startSec),
				'-i', 'input.mp4',
				'-t', String(tr.endSec - tr.startSec),
				'-c', 'copy',
				'output.mp4'
			]);
			progress = 96;

			// 9. 결과 파일을 Blob URL로 변환
			const raw = (await ffmpeg.readFile('output.mp4')) as Uint8Array;
			const buf = new ArrayBuffer(raw.byteLength);
      
			new Uint8Array(buf).set(raw);
			const blob = new Blob([buf], { type: 'video/mp4' });
			const objUrl = URL.createObjectURL(blob);

			// 10. FFmpeg 임시 파일 정리
			await ffmpeg.deleteFile('input.mp4');
			await ffmpeg.deleteFile('output.mp4');

			// 11. 완료 처리
			progress = 100;
			progressLabel = '완료!';
			dlBlobUrl = objUrl;
			dlFileName = `${(info.title ?? 'clip').replace(/[\\/:*?"<>|]/g, '_')}.mp4`;
			dlStatus = 'done';
			onSuccess({ title: info.title, startSec: tr.startSec, endSec: tr.endSec, blobUrl: objUrl });
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
			dlStatus = 'error';
		}
	}

	// ── 클립 파일 다운로드 트리거 ────────────────────────────────────
	function triggerDownload() {
		const a = document.createElement('a');
		a.href = dlBlobUrl;
		a.download = dlFileName;
		a.click();

		// Blob URL 해제 및 상태 초기화
		URL.revokeObjectURL(dlBlobUrl);
		dlBlobUrl = '';
		dlFileName = '';
		dlStatus = 'idle';
		progress = 0;
		progressLabel = '';
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

	<!-- 클립 생성 버튼 (상태에 따라 다운로드 / 처리중 / 생성 표시) -->
	{#if dlStatus === 'done'}
		<button class="submit-btn" onclick={triggerDownload}>다운로드 ↓</button>
	{:else if busy}
		<button class="submit-btn" disabled>처리중...</button>
		<button class="cancel-btn" onclick={() => (cancelClipRequested = true)}>취소 ✕</button>
	{:else}
		<button class="submit-btn" onclick={submit} disabled={!url || !!tr.timeError}>클립 생성 ✦</button>
	{/if}

	<!-- 전체 영상 다운로드 버튼 (상태에 따라 다운로드 / 처리중 / 전체 다운로드 표시) -->
	{#if videoDl.status === 'done'}
		<button class="submit-btn" onclick={videoDl.triggerDownload}>다운로드 ↓</button>
	{:else if videoDl.busy}
		<button class="submit-btn" disabled>처리중...</button>
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
{:else if err}
	<p class="error">{err}</p>
{:else if videoDl.err}
	<p class="error">{videoDl.err}</p>
{/if}
