// ── 외부 라이브러리 ──────────────────────────────────────────────
import { fetchFile } from '@ffmpeg/util';
import { loadFfmpeg } from '$lib/ffmpeg';

// ── API / 유틸 ───────────────────────────────────────────────────
import { fetchClipInfo } from '$lib/api/clips';
import { parseM3u8 } from '$lib/utils/stream';
import { proxyUrl } from '$lib/utils/proxy';

// ── 상태 타입 ────────────────────────────────────────────────────
type DlStatus = 'idle' | 'loading' | 'downloading' | 'encoding' | 'error';

const MAX_CLIP_SEC = 3600; // 60분 최대 파트 길이

// ── 전체 영상 다운로드 훅 ─────────────────────────────────────────
// m3u8 → 전체 세그먼트 다운로드 → FFmpeg concat → 파트별 onSuccess 콜백
// 60분 초과 시 파트별 분할
export function useVideoDownload(onSuccess?: (info: { title: string | null; url: string; blobUrl: string; filename: string }) => void) {
	// ── 반응형 상태 ──────────────────────────────────────────────────
	let status = $state<DlStatus>('idle');
	let progress = $state(0); // 진행률 (0~100)
	let progressLabel = $state(''); // 진행 상태 텍스트 (UI 표시용)
	let err = $state(''); // 에러 메시지

	// ── 내부 변수 (반응형 불필요) ─────────────────────────────────────
	let cancelRequested = false; // 취소 요청 플래그 (다음 세그먼트 루프에서 확인)
	let pauseRequested = $state(false); // 일시정지 요청 플래그

	// 다운로드/인코딩 진행 중 여부 (버튼 비활성화 등에 사용)
	const busy = $derived(status === 'loading' || status === 'downloading' || status === 'encoding');

	// ── 전체 영상 다운로드 ────────────────────────────────────────────
	async function download(url: string) {
		if (!url || status !== 'idle') return;
		cancelRequested = false;
		pauseRequested = false;
		status = 'loading';
		err = '';
		progress = 0;

		let ffmpeg: Awaited<ReturnType<typeof loadFfmpeg>> | null = null;
		try {
			// 1. 스트림 정보 조회 및 m3u8 URL 확인
			const info = await fetchClipInfo(url);
			if (!info || !info.m3u8_url) throw new Error('스트림 URL을 찾을 수 없습니다');

			// 2. m3u8 파싱 → 전체 세그먼트 목록 추출
			const { initUrl, segments, durations } = await parseM3u8(info.m3u8_url);
			if (segments.length === 0) throw new Error('세그먼트를 찾을 수 없습니다');

			// 3. 세그먼트를 60분 단위 파트로 그룹화
			const partGroups: number[][] = [[]];
			let cumDur = 0;
			for (let i = 0; i < segments.length; i++) {
				const d = durations[i] || 2;
				if (cumDur + d > MAX_CLIP_SEC && partGroups[partGroups.length - 1].length > 0) {
					partGroups.push([]);
					cumDur = 0;
				}
				partGroups[partGroups.length - 1].push(i);
				cumDur += d;
			}

			// 4. FFmpeg 로드
			ffmpeg = await loadFfmpeg();
			status = 'downloading';

			// 5. 초기화 세그먼트(init) 다운로드 (fMP4 포맷일 때 필요)
			let initData: Uint8Array | null = null;
			if (initUrl) {
				initData = await fetchFile(proxyUrl(initUrl));
			}

			// 6. 전체 세그먼트 순차 다운로드 → 메모리에 보관
			const segDatas: Uint8Array[] = [];
			for (let i = 0; i < segments.length; i++) {
				// 일시정지 대기 — 취소되면 즉시 탈출
				while (pauseRequested && !cancelRequested) {
					await new Promise<void>((r) => setTimeout(r, 200));
				}
				if (cancelRequested) {
					status = 'idle';
					progress = 0;
					progressLabel = '';
					return;
				}
				segDatas.push(await fetchFile(proxyUrl(segments[i])));
				progress = Math.round(((i + 1) / segments.length) * 80);
				progressLabel = `${i + 1} / ${segments.length} 세그먼트`;
			}
			if (cancelRequested) {
				status = 'idle';
				progress = 0;
				progressLabel = '';
				return;
			}

			// 7. 파트별 FFmpeg 인코딩 (스트림 복사) → 파트별 onSuccess 콜백
			//    fMP4: init + 파트 세그먼트를 단일 바이너리로 합쳐 입력 (moov 중복 방지)
			status = 'encoding';
			const numParts = partGroups.length;
			const baseName = (info.title ?? 'video').replace(/[\\/:*?"<>|]/g, '_');

			for (let p = 0; p < numParts; p++) {
				const inputFile = `input_${p}.mp4`;
				const outFile = `output_${p}.mp4`;
				progressLabel = numParts > 1
					? `파트 ${p + 1}/${numParts} 인코딩 중...`
					: 'MP4 변환 중...';
				progress = 82 + Math.round((p / numParts) * 14);

				const partSegs = partGroups[p].map((i) => segDatas[i]);
				const parts: Uint8Array[] = initData ? [initData, ...partSegs] : partSegs;
				const totalBytes = parts.reduce((a, b) => a + b.byteLength, 0);
				const combined = new Uint8Array(totalBytes);
				let byteOffset = 0;
				for (const part of parts) { combined.set(part, byteOffset); byteOffset += part.byteLength; }
				await ffmpeg.writeFile(inputFile, combined);
				await ffmpeg.exec(['-i', inputFile, '-c', 'copy', '-movflags', '+faststart', outFile]);
				await ffmpeg.deleteFile(inputFile);

				const raw = (await ffmpeg.readFile(outFile)) as Uint8Array;
				const buf = new ArrayBuffer(raw.byteLength);
				new Uint8Array(buf).set(raw);
				const blob = new Blob([buf], { type: 'video/mp4' });
				const blobUrl = URL.createObjectURL(blob);
				const filename = numParts > 1 ? `${baseName}_part${p + 1}.mp4` : `${baseName}.mp4`;
				onSuccess?.({ title: info.title, url, blobUrl, filename });
				await ffmpeg.deleteFile(outFile);
			}

			// 8. 완료 처리
			progress = 100;
			progressLabel = '완료!';
			status = 'idle';
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
			status = 'error';
		} finally {
			ffmpeg?.terminate();
		}
	}

	// ── 다운로드 취소/일시정지/재개 ──────────────────────────────────
	function cancel() {
		cancelRequested = true;
		pauseRequested = false;
	}

	function pause() {
		pauseRequested = true;
	}

	function resume() {
		pauseRequested = false;
	}

	// ── 반환 객체 (반응형 getter 노출) ───────────────────────────────
	return {
		get status() {
			return status;
		},
		get progress() {
			return progress;
		},
		get progressLabel() {
			return progressLabel;
		},
		get err() {
			return err;
		},
		get busy() {
			return busy;
		},
		get isPaused() {
			return pauseRequested;
		},
		download,
		cancel,
		pause,
		resume
	};
}
