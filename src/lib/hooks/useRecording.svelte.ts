import { SvelteSet } from 'svelte/reactivity';
import { loadFfmpeg } from '$lib/ffmpeg';
import { fetchClipInfo } from '$lib/api/clips';
import { parseM3u8 } from '$lib/utils/stream';
import { proxyUrl } from '$lib/utils/proxy';

export type RecordStatus = 'idle' | 'loading' | 'recording' | 'paused' | 'encoding' | 'error';

type OnSuccess = (info: { filename: string; url: string; blobUrl: string }) => void;

export function useRecording(onSuccess?: OnSuccess) {
	let status = $state<RecordStatus>('idle');
	let err = $state('');
	let segCount = $state(0);

	// ── 내부 변수 (반응형 불필요) ────────────────────────────────────
	let m3u8Url = '';
	let initData: Uint8Array | null = null;
	// sessions: 녹화 구간별 세그먼트 배열. 일시멈춤마다 새 세션 추가.
	let sessions: Uint8Array[][] = [[]];
	let segmentsSeen = new SvelteSet<string>();
	let pollTimerId: ReturnType<typeof setTimeout> | null = null;
	let isFirstPoll = true;
	// 폴링 세대 번호: pause/resume/stop 시 증가시켜 이전 in-flight 호출을 무효화
	let pollEpoch = 0;

	// 녹화 진행 중 여부 (일시멈춤 포함)
	const isActive = $derived(status === 'recording' || status === 'paused');

	// 컴포넌트 unmount 시 폴링 타이머 정리 (페이지 이동 중 백그라운드 polling 방지)
	$effect(() => {
		return () => {
			if (pollTimerId) { clearTimeout(pollTimerId); pollTimerId = null; }
		};
	});

	// ── 세그먼트 프록시 fetch ────────────────────────────────────────
	async function fetchSegment(segUrl: string): Promise<Uint8Array> {
		const res = await fetch(proxyUrl(segUrl));
		const buf = await res.arrayBuffer();
		return new Uint8Array(buf);
	}

	// ── m3u8 폴링: 3초마다 새 세그먼트 다운로드 ────────────────────
	async function pollSegments() {
		const myEpoch = pollEpoch;
		if (status !== 'recording' || !m3u8Url) return;
		try {
			const { initUrl, segments: newSegs } = await parseM3u8(m3u8Url);
			if (status !== 'recording' || pollEpoch !== myEpoch) return;
			if (initUrl && !initData) {
				initData = await fetchSegment(initUrl);
				if (status !== 'recording' || pollEpoch !== myEpoch) return;
			}
			if (isFirstPoll) {
				// 첫 폴링(또는 재개 직후): 기존 세그먼트는 seen 처리만 하고 다운로드하지 않음
				for (const seg of newSegs) segmentsSeen.add(seg);
				isFirstPoll = false;
			} else {
				const currentSession = sessions[sessions.length - 1];
				for (const seg of newSegs) {
					if (!segmentsSeen.has(seg)) {
						const data = await fetchSegment(seg);
						if (status !== 'recording' || pollEpoch !== myEpoch) return;
						segmentsSeen.add(seg);
						currentSession.push(data);
						segCount++;
					}
				}
			}
			err = '';
		} catch (e) {
			// 에러를 UI에 표시 (status는 유지하여 폴링 계속)
			err = `폴링 오류: ${e instanceof Error ? e.message : String(e)}`;
		}
		if (status === 'recording' && pollEpoch === myEpoch) {
			pollTimerId = setTimeout(pollSegments, 3000);
		}
	}

	// ── 녹화 시작 ────────────────────────────────────────────────────
	async function submit(url: string, filename: string) {
		if (!url || !filename || status !== 'idle') return;
		status = 'loading';
		err = '';
		initData = null;
		sessions = [[]];
		segmentsSeen = new SvelteSet();
		segCount = 0;
		isFirstPoll = true;

		try {
			const info = await fetchClipInfo(url);
			if (!info) throw new Error('스트림 정보를 불러올 수 없습니다');
			if (!info.m3u8_url) throw new Error('스트림 URL을 찾을 수 없습니다');
			m3u8Url = info.m3u8_url;
			status = 'recording';
			await pollSegments();
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
			status = 'error';
		}
	}

	// ── 일시멈춤 / 재개 ──────────────────────────────────────────────
	function pause() {
		if (status !== 'recording') return;
		pollEpoch++;  // 현재 in-flight pollSegments 호출을 무효화
		if (pollTimerId) { clearTimeout(pollTimerId); pollTimerId = null; }
		status = 'paused';
	}

	function resume() {
		if (status !== 'paused') return;
		pollEpoch++;  // 새 세대 시작
		sessions.push([]);    // 재개 후 세그먼트는 새 세션으로 분리 (타임스탬프 불연속 방지)
		isFirstPoll = true;   // 일시멈춤 구간 세그먼트는 seen 처리만 하고 건너뜀
		status = 'recording';
		pollSegments();
	}

	// ── 녹화 중지 → FFmpeg로 세그먼트 병합 후 단일 MP4 생성 ──────────
	async function stop(url: string, filename: string) {
		if (status !== 'recording' && status !== 'paused') return;
		pollEpoch++;  // 현재 in-flight pollSegments 호출을 무효화
		if (pollTimerId) { clearTimeout(pollTimerId); pollTimerId = null; }

		const nonEmptySessions = sessions.filter(s => s.length > 0);
		if (nonEmptySessions.length === 0) { err = '녹화된 세그먼트가 없습니다. 잠시 후 다시 시도하세요.'; status = 'error'; return; }

		let ffmpeg: Awaited<ReturnType<typeof loadFfmpeg>> | null = null;
		try {
			status = 'encoding';
			ffmpeg = await loadFfmpeg();

			// 세션의 raw fMP4 바이트를 ffmpeg FS에 기록하는 헬퍼
			async function writeSession(idx: number, file: string) {
				const parts: Uint8Array[] = initData ? [initData, ...nonEmptySessions[idx]] : [...nonEmptySessions[idx]];
				const totalBytes = parts.reduce((a, p) => a + p.byteLength, 0);
				const combined = new Uint8Array(totalBytes);
				let byteOffset = 0;
				for (const part of parts) { combined.set(part, byteOffset); byteOffset += part.byteLength; }
				await ffmpeg!.writeFile(file, combined);
			}

			if (nonEmptySessions.length === 1) {
				// 일시멈춤 없음: init + 세그먼트를 단일 바이너리로 병합
				await writeSession(0, 'input.mp4');
				const ret = await ffmpeg.exec(['-i', 'input.mp4', '-c', 'copy', '-movflags', '+faststart', 'output.mp4']);
				await ffmpeg.deleteFile('input.mp4');
				if (ret !== 0) throw new Error(`인코딩 실패 (코드: ${ret})`);
			} else {
				// 일시멈춤 있음:
				// 1단계 — 세션별 raw fMP4를 정규화된 MP4로 변환 (-copyts -start_at_zero 로 타임스탬프 0 기준으로 재조정)
				// 2단계 — concat demuxer로 순차 연결 (각 파일이 0부터 시작하므로 concat이 자동 오프셋 적용)
				const concatLines: string[] = [];
				for (let i = 0; i < nonEmptySessions.length; i++) {
					const rawFile = `session_raw_${i}.mp4`;
					const normFile = `session_${i}.mp4`;
					await writeSession(i, rawFile);
					const ret = await ffmpeg.exec(['-i', rawFile, '-c', 'copy', '-copyts', '-start_at_zero', normFile]);
					await ffmpeg.deleteFile(rawFile);
					if (ret !== 0) throw new Error(`세션 ${i} 타임스탬프 정규화 실패 (코드: ${ret})`);
					concatLines.push(`file '${normFile}'`);
				}
				await ffmpeg.writeFile('concat.txt', new TextEncoder().encode(concatLines.join('\n')));
				const ret = await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', '-movflags', '+faststart', 'output.mp4']);
				await ffmpeg.deleteFile('concat.txt');
				for (let i = 0; i < nonEmptySessions.length; i++) await ffmpeg.deleteFile(`session_${i}.mp4`);
				if (ret !== 0) throw new Error(`세션 병합 실패 (코드: ${ret})`);
			}

			const raw = (await ffmpeg.readFile('output.mp4')) as Uint8Array;
			const buf = new ArrayBuffer(raw.byteLength);
			new Uint8Array(buf).set(raw);
			const blob = new Blob([buf], { type: 'video/mp4' });
			const objUrl = URL.createObjectURL(blob);
			await ffmpeg.deleteFile('output.mp4');

			onSuccess?.({ filename: `${filename}.mp4`, url, blobUrl: objUrl });
			reset();
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
			status = 'error';
		} finally {
			ffmpeg?.terminate();
		}
	}

	// ── 상태 초기화 ──────────────────────────────────────────────────
	function reset() {
		pollEpoch++;  // 현재 in-flight pollSegments 호출을 무효화
		if (pollTimerId) { clearTimeout(pollTimerId); pollTimerId = null; }
		initData = null;
		sessions = [[]];
		segmentsSeen = new SvelteSet();
		segCount = 0;
		isFirstPoll = true;
		status = 'idle';
		err = '';
	}

	return {
		get status() { return status; },
		get segCount() { return segCount; },
		get err() { return err; },
		get isActive() { return isActive; },
		submit,
		pause,
		resume,
		stop,
		reset
	};
}
