// ── 외부 라이브러리 ──────────────────────────────────────────────
import { fetchFile } from '@ffmpeg/util';
import { loadFfmpeg } from '$lib/ffmpeg';

// ── API / 유틸 ───────────────────────────────────────────────────
import { fetchClipInfo } from '$lib/api/clips';
import { parseM3u8 } from '$lib/utils/stream';

// ── 상태 타입 ────────────────────────────────────────────────────
type DlStatus = 'idle' | 'loading' | 'downloading' | 'encoding' | 'done' | 'error';

// ── 전체 영상 다운로드 훅 ─────────────────────────────────────────
// m3u8 → 전체 세그먼트 다운로드 → FFmpeg concat → Blob URL 반환
export function useVideoDownload(onSuccess?: (info: { title: string | null; url: string }) => void) {
	// ── 반응형 상태 ──────────────────────────────────────────────────
	let status = $state<DlStatus>('idle');
	let progress = $state(0); // 진행률 (0~100)
	let progressLabel = $state(''); // 진행 상태 텍스트 (UI 표시용)
	let blobUrl = $state(''); // 완성된 영상의 Blob URL
	let fileName = $state(''); // 다운로드 파일명
	let err = $state(''); // 에러 메시지

	// ── 내부 변수 (반응형 불필요) ─────────────────────────────────────
	let cancelRequested = false; // 취소 요청 플래그 (다음 세그먼트 루프에서 확인)

	// 다운로드/인코딩 진행 중 여부 (버튼 비활성화 등에 사용)
	const busy = $derived(status === 'loading' || status === 'downloading' || status === 'encoding');

	// ── 전체 영상 다운로드 ────────────────────────────────────────────
	async function download(url: string) {
		if (!url || status !== 'idle') return;
		cancelRequested = false;
		status = 'loading';
		err = '';
		progress = 0;

		try {
			// 1. 스트림 정보 조회 및 m3u8 URL 확인
			const info = await fetchClipInfo(url);
			if (!info || !info.m3u8_url) throw new Error('스트림 URL을 찾을 수 없습니다');

			// 2. m3u8 파싱 → 전체 세그먼트 목록 추출
			const { initUrl, segments } = await parseM3u8(info.m3u8_url);
			if (segments.length === 0) throw new Error('세그먼트를 찾을 수 없습니다');

			// 3. FFmpeg 로드
			const ffmpeg = await loadFfmpeg();
			status = 'downloading';
			const segNames: string[] = [];

			// 4. 초기화 세그먼트(init) 다운로드 (fMP4 포맷일 때 필요)
			let initData: Uint8Array | null = null;
			if (initUrl) {
				initData = await fetchFile(`/stream/proxy?url=${encodeURIComponent(initUrl)}`);
			}

			// 5. 전체 세그먼트 순차 다운로드 (취소 요청 시 중단)
			//    fMP4이면 initData를 각 세그먼트 앞에 붙여 독립 재생 가능하게 처리
			for (let i = 0; i < segments.length; i++) {
				if (cancelRequested) {
					status = 'idle';
					progress = 0;
					progressLabel = '';
					return;
				}
				const segData = await fetchFile(`/stream/proxy?url=${encodeURIComponent(segments[i])}`);
				const name = `seg${String(i).padStart(5, '0')}.mp4`;
				if (initData) {
					const combined = new Uint8Array(initData.byteLength + segData.byteLength);
					combined.set(initData, 0);
					combined.set(segData, initData.byteLength);
					await ffmpeg.writeFile(name, combined);
				} else {
					await ffmpeg.writeFile(name, segData);
				}
				segNames.push(name);
				progress = Math.round(((i + 1) / segments.length) * 80);
				progressLabel = `${i + 1} / ${segments.length} 세그먼트`;
			}
			if (cancelRequested) {
				status = 'idle';
				progress = 0;
				progressLabel = '';
				return;
			}

			// 6. FFmpeg concat으로 세그먼트 이어붙이기 (스트림 복사)
			status = 'encoding';
			progressLabel = 'MP4 변환 중...';
			progress = 82;

			const concatList = segNames.map((n) => `file '${n}'`).join('\n');
			await ffmpeg.writeFile('concat.txt', concatList);
			await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'output.mp4']);
			progress = 96;

			// 7. 결과 파일을 Blob URL로 변환
			const raw = (await ffmpeg.readFile('output.mp4')) as Uint8Array;
			const buf = new ArrayBuffer(raw.byteLength);
			new Uint8Array(buf).set(raw);
			const blob = new Blob([buf], { type: 'video/mp4' });
			const objUrl = URL.createObjectURL(blob);

			// 8. FFmpeg 임시 파일 정리
			for (const name of segNames) await ffmpeg.deleteFile(name);
			await ffmpeg.deleteFile('concat.txt');
			await ffmpeg.deleteFile('output.mp4');

			// 9. 완료 처리
			progress = 100;
			progressLabel = '완료!';
			blobUrl = objUrl;
			fileName = `${(info.title ?? 'video').replace(/[\\/:*?"<>|]/g, '_')}.mp4`;
			status = 'done';
			onSuccess?.({ title: info.title, url });
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
			status = 'error';
		}
	}

	// ── 파일 다운로드 트리거 ──────────────────────────────────────────
	// Blob URL로 앵커 클릭 → 다운로드 후 URL 해제 및 상태 초기화
	function triggerDownload() {
		const a = document.createElement('a');
		a.href = blobUrl;
		a.download = fileName;
		a.click();
		URL.revokeObjectURL(blobUrl);
		blobUrl = '';
		fileName = '';
		status = 'idle';
		progress = 0;
		progressLabel = '';
	}

	// ── 다운로드 취소 ─────────────────────────────────────────────────
	// 다음 세그먼트 루프 진입 시 cancelRequested를 확인해 중단
	function cancel() {
		cancelRequested = true;
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
		get blobUrl() {
			return blobUrl;
		},
		get err() {
			return err;
		},
		get busy() {
			return busy;
		},
		download,
		triggerDownload,
		cancel
	};
}
