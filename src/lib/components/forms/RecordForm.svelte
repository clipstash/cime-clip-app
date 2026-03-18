<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { loadFfmpeg } from '$lib/ffmpeg';
	import { fetchClipInfo } from '$lib/api/clips';
	import { parseM3u8 } from '$lib/utils/stream';

	// ── Props 타입 ───────────────────────────────────────────────────
	type Props = {
		url: string;
		onSuccess?: (info: { filename: string; url: string; blobUrl: string }) => void;
	};

	const { url, onSuccess }: Props = $props();

	// ── 상태 타입 ────────────────────────────────────────────────────
	type RecordStatus = 'idle' | 'loading' | 'recording' | 'paused' | 'encoding' | 'done' | 'error';

	// ── 반응형 상태 ──────────────────────────────────────────────────
	let recFileName = $state('');
	let recBlobUrl = $state('');
	let status = $state<RecordStatus>('idle');
	let err = $state('');
	let segCount = $state(0); // 다운로드된 세그먼트 수 (UI 표시용)
	let titleLoading = $state(false); // 스트림 제목 자동 조회 중 여부
	let fileNameEdited = $state(false); // 사용자가 직접 파일명을 수정했는지 여부

	// ── 내부 변수 (반응형 불필요) ─────────────────────────────────────
	let m3u8Url = ''; // 스트림의 m3u8 URL
	let initData: Uint8Array | null = null; // fMP4 초기화 세그먼트 (있을 경우)
	let segments: Uint8Array[] = []; // 수집된 세그먼트 바이너리 목록
	let segmentsSeen = new SvelteSet<string>(); // 이미 처리한 세그먼트 URL (중복 방지)
	let pollTimerId: ReturnType<typeof setTimeout> | null = null; // 폴링 타이머 ID
	let isFirstPoll = true; // 첫 폴링 여부 (기존 세그먼트 건너뛰기용)

	// ── 스트림 제목 자동 조회 ─────────────────────────────────────────
	// url이 바뀌면 600ms 디바운스 후 제목을 가져와 파일명 기본값으로 설정
	// 사용자가 파일명을 직접 수정한 경우(fileNameEdited)에는 덮어쓰지 않음
	$effect(() => {
		const targetUrl = url;
		if (!targetUrl) {
			titleLoading = false;
			return;
		}
		if (fileNameEdited) return;
		titleLoading = true;
		const t = setTimeout(async () => {
			const info = await fetchClipInfo(targetUrl);
			if (info.title && !fileNameEdited) recFileName = info.title;
			titleLoading = false;
		}, 600);
		return () => clearTimeout(t);
	});

	// ── 세그먼트 1개 다운로드 (프록시 경유) ──────────────────────────
	async function fetchSegment(segUrl: string): Promise<Uint8Array> {
		const proxyUrl = `/stream/proxy?url=${encodeURIComponent(segUrl)}`;
		const res = await fetch(proxyUrl);
		const buf = await res.arrayBuffer();
		return new Uint8Array(buf);
	}

	// ── 세그먼트 폴링 (3초 간격 반복) ───────────────────────────────
	// m3u8를 파싱해 새 세그먼트만 골라 다운로드하고, 녹화 중이면 자신을 재호출
	async function pollSegments() {
		if (status !== 'recording' || !m3u8Url) return;
		try {
			const { initUrl, segments: newSegs } = await parseM3u8(m3u8Url);

			// 초기화 세그먼트(init) — 아직 받지 않은 경우에만 1회 다운로드
			if (initUrl && !initData) {
				initData = await fetchSegment(initUrl);
			}

			if (isFirstPoll) {
				// 첫 폴링: 이미 올라온 세그먼트는 seen 처리만 하고 다운로드하지 않음
				// (녹화 시작 이전 과거 세그먼트 제외)
				for (const seg of newSegs) segmentsSeen.add(seg);
				isFirstPoll = false;
			} else {
				// 이후 폴링: seen 목록에 없는 새 세그먼트만 다운로드
				for (const seg of newSegs) {
					if (!segmentsSeen.has(seg)) {
						segmentsSeen.add(seg);
						const data = await fetchSegment(seg);
						segments.push(data);
						segCount = segments.length;
					}
				}
			}
		} catch {
			/* 세그먼트 fetch 실패는 무시하고 다음 폴링 계속 진행 */
		}

		// 아직 녹화 중이면 3초 후 재호출
		if (status === 'recording') {
			pollTimerId = setTimeout(pollSegments, 3000);
		}
	}

	// ── 녹화 시작 ────────────────────────────────────────────────────
	async function submit() {
		if (!url || !recFileName || status !== 'idle') return;

		// 상태 초기화
		status = 'loading';
		err = '';
		initData = null;
		segments = [];
		segmentsSeen = new SvelteSet();
		segCount = 0;
		isFirstPoll = true;

		try {
			// 1. 스트림 정보 조회 → m3u8 URL 확인
			const info = await fetchClipInfo(url);
			if (!info.m3u8_url) throw new Error('스트림 URL을 찾을 수 없습니다');
			m3u8Url = info.m3u8_url;

			// 2. 녹화 상태로 전환 후 폴링 시작
			status = 'recording';
			await pollSegments();
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
			status = 'error';
		}
	}

	// ── 일시멈춤 ─────────────────────────────────────────────────────
	function pauseRecording() {
		if (status !== 'recording') return;
		if (pollTimerId) {
			clearTimeout(pollTimerId);
			pollTimerId = null;
		}
		status = 'paused';
	}

	// ── 녹화 재개 ────────────────────────────────────────────────────
	function resumeRecording() {
		if (status !== 'paused') return;
		status = 'recording';
		pollSegments();
	}

	// ── 녹화 완료 → FFmpeg 인코딩 ───────────────────────────────────
	async function stopRecording() {
		if (status !== 'recording' && status !== 'paused') return;

		// 폴링 중단
		if (pollTimerId) {
			clearTimeout(pollTimerId);
			pollTimerId = null;
		}

		// 수집된 세그먼트가 없으면 그냥 idle로 복귀
		if (segments.length === 0) {
			status = 'idle';
			return;
		}

		try {
			status = 'encoding';
			const ffmpeg = await loadFfmpeg();

			// 1. 각 세그먼트를 FFmpeg 가상 파일시스템에 기록
			//    fMP4 포맷이면 initData를 각 세그먼트 앞에 붙여서 독립 재생 가능하게 처리
			const segNames: string[] = [];
			for (let i = 0; i < segments.length; i++) {
				const name = `seg${String(i).padStart(5, '0')}.mp4`;
				if (initData) {
					const combined = new Uint8Array(initData.byteLength + segments[i].byteLength);
					combined.set(initData, 0);
					combined.set(segments[i], initData.byteLength);
					await ffmpeg.writeFile(name, combined);
				} else {
					await ffmpeg.writeFile(name, segments[i]);
				}
				segNames.push(name);
			}

			// 2. concat 리스트 파일 생성 후 세그먼트 이어붙이기 (스트림 복사)
			const concatList = segNames.map((n) => `file '${n}'`).join('\n');
			await ffmpeg.writeFile('concat.txt', concatList);
			await ffmpeg.exec([
				'-f', 'concat',
				'-safe', '0',
				'-i', 'concat.txt',
				'-c', 'copy',
				'output.mp4'
			]);

			// 3. 결과 파일을 Blob URL로 변환
			const raw = (await ffmpeg.readFile('output.mp4')) as Uint8Array;
			const buf = new ArrayBuffer(raw.byteLength);
			new Uint8Array(buf).set(raw);
			const blob = new Blob([buf], { type: 'video/mp4' });
			const objUrl = URL.createObjectURL(blob);

			// 4. FFmpeg 임시 파일 정리
			for (const name of segNames) await ffmpeg.deleteFile(name);
			await ffmpeg.deleteFile('concat.txt');
			await ffmpeg.deleteFile('output.mp4');

			// 5. 완료 처리
			recBlobUrl = objUrl;
			status = 'done';
			onSuccess?.({ filename: recFileName, url, blobUrl: objUrl });
		} catch (e) {
			err = e instanceof Error ? e.message : String(e);
			status = 'error';
		}
	}

	// ── 상태 전체 초기화 ─────────────────────────────────────────────
	function reset() {
		if (pollTimerId) {
			clearTimeout(pollTimerId);
			pollTimerId = null;
		}
		initData = null;
		segments = [];
		segmentsSeen = new SvelteSet();
		segCount = 0;
		isFirstPoll = true;
		status = 'idle';
		err = '';
	}

	// ── 녹화 파일 다운로드 트리거 ────────────────────────────────────
	function triggerRecDownload() {
		const a = document.createElement('a');
		a.href = recBlobUrl;
		a.download = `${recFileName.replace(/[\\/:*?"<>|]/g, '_')}.mp4`;
		a.click();

		// Blob URL 해제 후 상태 초기화
		URL.revokeObjectURL(recBlobUrl);
		recBlobUrl = '';
		reset();
	}

	// 녹화 진행 중 여부 (녹화 중 또는 일시멈춤)
	const isActive = $derived(status === 'recording' || status === 'paused');
</script>

<!-- ── 녹화 컨트롤 행 ── -->
<div class="form-row record-row">
	{#if status === 'idle' || status === 'error'}
		<!-- 파일명 입력 + 녹화 시작 버튼 -->
		<div class="record-input">
			<label for="rec-file-name">녹화{titleLoading ? ' (불러오는 중...)' : ''}</label>
			<input
				id="rec-file-name"
				type="text"
				placeholder="파일명 (예: stream_20260313)"
				bind:value={recFileName}
				oninput={() => {
					fileNameEdited = recFileName.length > 0;
				}}
			/>
		</div>
		<button class="submit-btn" onclick={submit} disabled={!url || !recFileName}>녹화 시작 ✦</button>
	{:else if status === 'loading'}
		<!-- 스트림 확인 중 -->
		<span class="rec-info">스트림 확인 중...</span>
	{:else if isActive}
		<!-- 녹화 중 / 일시멈춤 상태 컨트롤 -->
		<div class="rec-controls">
			<span class="rec-dot" class:paused={status === 'paused'}></span>
			<span class="rec-info">{status === 'paused' ? '일시멈춤' : '녹화 중'} — {segCount} 세그먼트</span>
			{#if status === 'recording'}
				<button class="rec-btn rec-btn-pause" onclick={pauseRecording}>일시멈춤</button>
			{:else}
				<button class="rec-btn rec-btn-resume" onclick={resumeRecording}>재개</button>
			{/if}
			<button class="rec-btn rec-btn-stop" onclick={stopRecording}>완료</button>
			<button class="rec-btn rec-btn-cancel" onclick={reset}>취소</button>
		</div>
	{:else if status === 'encoding'}
		<!-- FFmpeg 인코딩 중 -->
		<span class="rec-info">MP4 변환 중... ({segCount} 세그먼트)</span>
	{:else if status === 'done'}
		<!-- 다운로드 준비 완료 -->
		<button class="submit-btn" onclick={triggerRecDownload}>다운로드 ↓</button>
	{/if}
</div>

<!-- ── 에러 메시지 ── -->
{#if err}
	<p class="error">{err}</p>
{/if}
