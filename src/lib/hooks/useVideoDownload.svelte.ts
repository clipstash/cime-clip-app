// ── API / 유틸 ───────────────────────────────────────────────────
import { fetchClipInfo } from '$lib/api/clips';
import { parseM3u8 } from '$lib/utils/stream';
import { proxyUrl } from '$lib/utils/proxy';
import { makeBaseName } from '$lib/utils/filename';

// ── 상태 타입 ────────────────────────────────────────────────────
type DlStatus = 'idle' | 'loading' | 'downloading' | 'error';

// ── 전체 영상 다운로드 훅 ─────────────────────────────────────────
// m3u8 → 세그먼트 스트리밍 → File System Access API로 디스크에 직접 저장
// FFmpeg 불필요 — 세그먼트를 메모리에 누적하지 않으므로 대용량 영상도 안전
export function useVideoDownload(onSuccess?: (info: { title: string | null; url: string; blobUrl: string; filename: string }) => void) {
	// ── 반응형 상태 ──────────────────────────────────────────────────
	let status = $state<DlStatus>('idle');
	let progress = $state(0); // 진행률 (0~100)
	let progressLabel = $state(''); // 진행 상태 텍스트 (UI 표시용)
	let err = $state(''); // 에러 메시지

	// ── 내부 변수 (반응형 불필요) ─────────────────────────────────────
	// cancelRequested: UI 반영 불필요(버튼 비활성화는 status로 처리) → 일반 변수
	let cancelRequested = false;
	// pauseRequested: isPaused getter로 버튼 텍스트에 반영 → $state 필요
	let pauseRequested = $state(false);

	const busy = $derived(status === 'loading' || status === 'downloading');

	// ── 전체 영상 다운로드 ────────────────────────────────────────────
	// suggestedTitle: 파일 저장 대화상자에 표시할 기본 파일명 (ClipForm에서 전달)
	async function download(url: string, suggestedTitle?: string | null) {
		if (!url || status !== 'idle') return;

		if (!('showSaveFilePicker' in window)) {
			err = '이 브라우저는 스트리밍 다운로드를 지원하지 않습니다 (Chrome / Edge 권장)';
			status = 'error';
			return;
		}

		cancelRequested = false;
		pauseRequested = false;
		err = '';
		progress = 0;
		status = 'loading';
		progressLabel = '정보 가져오는 중...';

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const fsp = window as any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let writable: any;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		let fileHandle: any;

		try {
			// 1. 스트림 정보 조회 및 m3u8 URL 확인
			const info = await fetchClipInfo(url);
			if (!info || !info.m3u8_url) throw new Error('스트림 URL을 찾을 수 없습니다');

			// 2. m3u8 파싱 → 세그먼트 목록 추출
			const { initUrl, segments, durations } = await parseM3u8(info.m3u8_url);
			if (segments.length === 0) throw new Error('세그먼트를 찾을 수 없습니다');

			const totalSec = durations.reduce((a, b) => a + b, 0);
			const fmtTime = (sec: number) => {
				const h = Math.floor(sec / 3600);
				const m = Math.floor((sec % 3600) / 60);
				const s = Math.floor(sec % 60);
				const mm = String(m).padStart(2, '0');
				const ss = String(s).padStart(2, '0');
				return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
			};

			// 3. 파일 저장 대화상자 — 사용자가 저장 위치 선택
			//    fMP4(initUrl 있음) → .mp4 / MPEG-TS → .ts
			const isFmp4 = initUrl !== null;
			const baseName = makeBaseName(suggestedTitle ?? info.title, info.streamer);
			const ext = isFmp4 ? '.mp4' : '.ts';
			const mimeType = isFmp4 ? 'video/mp4' : 'video/mp2t';

			fileHandle = await fsp.showSaveFilePicker({
				suggestedName: `${baseName}${ext}`,
				types: [{ description: 'Video', accept: { [mimeType]: [ext] } }]
			});
			writable = await fileHandle.createWritable();

			status = 'downloading';

			// 4. 초기화 세그먼트(init) 스트리밍 (fMP4 포맷일 때 필요)
			if (initUrl) {
				progressLabel = '초기화 세그먼트...';
				const res = await fetch(proxyUrl(initUrl));
				if (!res.ok) throw new Error(`초기화 세그먼트 fetch 실패 (${res.status})`);
				await writable.write(await res.arrayBuffer());
			}

			// 5. 미디어 세그먼트 병렬 fetch → 디스크에 순서대로 스트리밍 (메모리 누적 없음)
			// CONCURRENCY개 선행 fetch로 대기 시간 단축, 쓰기는 순서 보장
			const fetchBuf = (segUrl: string) =>
				fetch(proxyUrl(segUrl)).then((r) => {
					if (!r.ok) throw new Error(`세그먼트 fetch 실패 (${r.status})`);
					return r.arrayBuffer();
				});

			const CONCURRENCY = 4;
			const fetches: (Promise<ArrayBuffer> | null)[] = new Array(segments.length).fill(null);
			for (let i = 0; i < Math.min(CONCURRENCY, segments.length); i++) {
				fetches[i] = fetchBuf(segments[i]);
			}

			for (let i = 0; i < segments.length; i++) {
				// 일시정지 대기
				while (pauseRequested && !cancelRequested) {
					await new Promise<void>((r) => setTimeout(r, 200));
				}
				if (cancelRequested) {
					await writable.abort();
					status = 'idle';
					progress = 0;
					progressLabel = '';
					return;
				}

				// 다음 세그먼트 선행 fetch 시작
				const ahead = i + CONCURRENCY;
				if (ahead < segments.length) {
					fetches[ahead] = fetchBuf(segments[ahead]);
				}

				const buf = await fetches[i]!;
				fetches[i] = null;
				await writable.write(buf);

				progress = Math.round(((i + 1) / segments.length) * 100);
				const elapsed = durations.slice(0, i + 1).reduce((a, b) => a + b, 0);
				progressLabel = totalSec > 0
					? `${fmtTime(elapsed)} / ${fmtTime(totalSec)}`
					: `${i + 1} / ${segments.length} 세그먼트`;
			}

			// 6. 완료 처리
			await writable.close();
			const filename = fileHandle?.name ?? `${baseName}${ext}`;
			onSuccess?.({ title: info.title, url, blobUrl: '', filename });
			progress = 100;
			progressLabel = '완료!';
			status = 'idle';
		} catch (e) {
			if (writable) {
				try { await writable.abort(); } catch { /* ignore */ }
			}
			// 사용자가 저장 대화상자를 취소한 경우
			if (e instanceof Error && e.name === 'AbortError') {
				status = 'idle';
				progress = 0;
				progressLabel = '';
				return;
			}
			err = e instanceof Error ? e.message : String(e);
			status = 'error';
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
		get status() { return status; },
		get progress() { return progress; },
		get progressLabel() { return progressLabel; },
		get err() { return err; },
		get busy() { return busy; },
		get isPaused() { return pauseRequested; },
		download: download as (url: string, suggestedTitle?: string | null) => Promise<void>,
		cancel,
		pause,
		resume
	};
}
