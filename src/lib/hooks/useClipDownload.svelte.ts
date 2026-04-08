import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { loadFfmpeg } from '$lib/ffmpeg';
import { fetchClipInfo } from '$lib/api/clips';
import { parseM3u8 } from '$lib/utils/stream';
import { proxyUrl } from '$lib/utils/proxy';
import { makeBaseName } from '$lib/utils/filename';

// ── 상태 타입 ────────────────────────────────────────────────────
type DlStatus = 'idle' | 'loading' | 'downloading' | 'encoding' | 'error';

export const MAX_CLIP_SEC = 3600; // 60분 최대 클립 길이

// 진행률 구간: 다운로드 0~80%, 인코딩 82~96%, 완료 100%
const PROGRESS_DOWNLOAD_END = 80;
const PROGRESS_ENCODE_START = 82;
const PROGRESS_ENCODE_RANGE = 14;

type OnSuccess = (info: {
	title: string | null;
	startSec: number;
	endSec: number;
	blobUrl: string;
	filename: string;
}) => void;

export function useClipDownload(onSuccess: OnSuccess) {
	let dlStatus = $state<DlStatus>('idle');
	let progress = $state(0);
	let progressLabel = $state('');
	let currentFileIdx = $state(0);
	let err = $state('');
	let cancelRequested = false;

	const busy = $derived(
		dlStatus === 'loading' || dlStatus === 'downloading' || dlStatus === 'encoding'
	);

	// ── 헬퍼 함수 ───────────────────────────────────────────────────

	function fmtTime(sec: number) {
		const h = Math.floor(sec / 3600);
		const m = Math.floor((sec % 3600) / 60);
		const s = Math.floor(sec % 60);
		const mm = String(m).padStart(2, '0');
		const ss = String(s).padStart(2, '0');
		return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
	}

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
	async function submit(url: string, startSec: number, endSec: number) {
		if (!url || dlStatus !== 'idle') return;

		cancelRequested = false;
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
			const { idxs: selectedIdxs, firstCumTime: firstSegCumTime } = filterSegments(segments, durations, startSec, endSec);
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
			if (cancelRequested) { dlStatus = 'idle'; progress = 0; progressLabel = ''; return; }
			let completedFetches = 0;
			let completedSec = 0;
			const totalSelectedSec = selectedIdxs.reduce((acc, idx) => acc + (durations[idx] || 0), 0);
			const segParts = await Promise.all(
				selectedIdxs.map((segIdx) =>
					fetchFile(proxyUrl(segments[segIdx])).then((data) => {
						if (!cancelRequested) {
							completedFetches++;
							completedSec += durations[segIdx] ?? 0;
							progress = Math.round((completedFetches / selectedIdxs.length) * PROGRESS_DOWNLOAD_END);
							progressLabel = totalSelectedSec > 0
								? `${fmtTime(completedSec)} / ${fmtTime(totalSelectedSec)}`
								: `${completedFetches} / ${selectedIdxs.length} 세그먼트`;
						}
						return data;
					})
				)
			);
			if (cancelRequested) { dlStatus = 'idle'; progress = 0; progressLabel = ''; return; }

			// 7. 세그먼트 바이너리 병합 → FFmpeg 입력 파일로 기록
			await ffmpeg.writeFile('input.mp4', concatBuffers(initData ? [initData, ...segParts] : segParts));

			// 8. FFmpeg로 구간 트림 — 60분 초과 시 파트별 분할 → 파트별 onSuccess 콜백
			dlStatus = 'encoding';
			const totalClipDur = endSec - startSec;
			const numParts = Math.ceil(totalClipDur / MAX_CLIP_SEC);
			const baseName = makeBaseName(info.title, info.streamer);

			for (let i = 0; i < numParts; i++) {
				const chunkStart = startSec + i * MAX_CLIP_SEC;
				const chunkDur = Math.min(MAX_CLIP_SEC, endSec - chunkStart);
				const outFile = `output_${i}.mp4`;

				currentFileIdx = i;
				progressLabel = numParts > 1
					? `파트 ${i + 1}/${numParts} 인코딩 중...`
					: 'MP4 변환 중...';
				progress = PROGRESS_ENCODE_START + Math.round((i / numParts) * PROGRESS_ENCODE_RANGE);

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

	function cancel() {
		cancelRequested = true;
	}

	return {
		get busy() { return busy; },
		get progress() { return progress; },
		get progressLabel() { return progressLabel; },
		get currentFileIdx() { return currentFileIdx; },
		get err() { return err; },
		submit,
		cancel
	};
}
