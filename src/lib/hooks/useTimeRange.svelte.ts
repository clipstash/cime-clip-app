// ── 클립 시간 범위 및 타임라인 슬라이더 훅 ──────────────────────────
// url 변경 시 시간 초기화, 영상 길이 로드 시 종료 시간 자동 설정
export function useTimeRange(
	getUrl: () => string,
	getTotalSec: () => number,
	getDurationLoaded: () => boolean
) {
	// ── 반응형 상태: 시작/종료 시간 ──────────────────────────────────
	let start = $state({ h: 0, m: 0, s: 0 });
	let end = $state({ h: 0, m: 0, s: 0 });

	// ── 반응형 상태: UI 상호작용 ─────────────────────────────────────
	let focusedField = $state<string | null>(null); // 현재 포커스된 시간 입력 필드
	let trackEl = $state<HTMLDivElement | null>(null); // 타임라인 트랙 DOM 요소
	let dragging = $state<'start' | 'end' | null>(null); // 드래그 중인 핸들 ('start' | 'end')

	// ── 파생 값 ──────────────────────────────────────────────────────
	const startSec = $derived(start.h * 3600 + start.m * 60 + start.s); // 시작 시간 (초)
	const endSec = $derived(end.h * 3600 + end.m * 60 + end.s); // 종료 시간 (초)
	const clipDuration = $derived(Math.max(0, endSec - startSec)); // 클립 길이 (초)

	// 타임라인 상의 시작/종료 위치 비율 (0~100%)
	const startPct = $derived(
		getTotalSec() > 0 ? Math.min(100, (startSec / getTotalSec()) * 100) : 0
	);
	const endPct = $derived(
		getTotalSec() > 0 ? Math.min(100, (endSec / getTotalSec()) * 100) : 100
	);

	// 시간 범위 유효성 검증 메시지 (null이면 정상)
	// duration 미로드 또는 start=end=0이면 검증 생략
	const timeError = $derived(
		!getDurationLoaded() || (startSec === 0 && endSec === 0)
			? null
			: endSec <= startSec
				? '종료 시간이 시작 시간보다 늦어야 합니다'
				: clipDuration < 1
					? '클립 길이는 최소 1초 이상이어야 합니다'
					: endSec > getTotalSec()
						? '종료 시간이 영상 길이를 초과합니다'
						: null
	);

	// ── 필드 맵 ──────────────────────────────────────────────────────
	// 필드명 → getter/setter/최댓값 매핑 (clampField, step에서 사용)
	const fieldMap: Record<string, { get: () => number; set: (v: number) => void; max: number }> = {
		startH: { get: () => start.h, set: (v) => (start.h = v), max: 999 },
		startM: { get: () => start.m, set: (v) => (start.m = v), max: 59 },
		startS: { get: () => start.s, set: (v) => (start.s = v), max: 59 },
		endH: { get: () => end.h, set: (v) => (end.h = v), max: 999 },
		endM: { get: () => end.m, set: (v) => (end.m = v), max: 59 },
		endS: { get: () => end.s, set: (v) => (end.s = v), max: 59 }
	};

	// ── 초(sec) → H:M:S 상태 설정 ────────────────────────────────────
	// totalSec 범위 내로 클램프 후 시작 또는 종료 시간 업데이트
	function setFromSec(target: 'start' | 'end', sec: number) {
		sec = Math.max(0, Math.min(getTotalSec(), Math.round(sec)));
		const h = Math.floor(sec / 3600),
			m = Math.floor((sec % 3600) / 60),
			s = sec % 60;
		if (target === 'start') { start.h = h; start.m = m; start.s = s; }
		else { end.h = h; end.m = m; end.s = s; }
	}

	// ── 필드 값 범위 클램프 ───────────────────────────────────────────
	// 각 필드가 max를 초과하지 않도록 보정
	function clampField(key: string) {
		const field = fieldMap[key];
		if (!field) return;
		field.set(Math.max(0, Math.min(field.max, field.get())));
	}

	// ── 키보드 스텝 증감 ──────────────────────────────────────────────
	// 포커스된 필드(또는 기본값 초 필드)를 delta만큼 증감
	function step(delta: number, group: 'start' | 'end') {
		const key = focusedField ?? (group === 'start' ? 'startS' : 'endS');
		const field = fieldMap[key];
		if (!field) return;
		field.set(Math.max(0, Math.min(field.max, field.get() + delta)));
	}

	// ── 타임라인 핸들 드래그 시작 ────────────────────────────────────
	// Pointer capture로 핸들 밖으로 나가도 드래그 유지
	function startDrag(e: PointerEvent, which: 'start' | 'end') {
		e.preventDefault();
		e.stopPropagation();
		dragging = which;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}

	// ── 타임라인 핸들 드래그 이동 ────────────────────────────────────
	// 트랙 너비 대비 포인터 위치 비율로 시간 계산
	function onDragMove(e: PointerEvent) {
		if (!dragging || !trackEl) return;
		const rect = trackEl.getBoundingClientRect();
		setFromSec(
			dragging,
			Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * getTotalSec()
		);
	}

	// ── 타임라인 클릭으로 시간 이동 ──────────────────────────────────
	// 드래그 중이 아닐 때만 동작; 포커스된 핸들이 없으면 시작 시간 이동
	function seekToClick(e: MouseEvent) {
		if (dragging || !trackEl) return;
		const rect = trackEl.getBoundingClientRect();
		setFromSec(
			dragging ?? 'start',
			Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * getTotalSec()
		);
	}

	// ── 시간 포맷 변환 ────────────────────────────────────────────────
	// 1시간 미만이면 "M:SS", 이상이면 "H:MM:SS" 형식으로 반환
	function formatTime(sec: number) {
		const h = Math.floor(sec / 3600),
			m = Math.floor((sec % 3600) / 60),
			s = sec % 60;
		if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
		return `${m}:${String(s).padStart(2, '0')}`;
	}

	// ── url 변경 시 시작/종료 시간 초기화 ───────────────────────────
	// 새 URL 입력 시 start/end 모두 0:0:0으로 리셋
	// (duration 로드 후에도 자동 설정 없이 사용자가 직접 구간 설정)
	$effect(() => {
		void getUrl();
		start.h = 0; start.m = 0; start.s = 0;
		end.h = 0; end.m = 0; end.s = 0;
	});

	// ── 반환 객체 ────────────────────────────────────────────────────
	return {
		get start() { return start; },
		get end() { return end; },
		get focusedField() { return focusedField; },
		set focusedField(v: string | null) { focusedField = v; },
		get trackEl() { return trackEl; },
		set trackEl(v: HTMLDivElement | null) { trackEl = v; },
		get dragging() { return dragging; },
		set dragging(v: 'start' | 'end' | null) { dragging = v; },
		get startSec() { return startSec; },
		get endSec() { return endSec; },
		get clipDuration() { return clipDuration; },
		get startPct() { return startPct; },
		get endPct() { return endPct; },
		get timeError() { return timeError; },
		clampField,
		step,
		setFromSec,
		startDrag,
		onDragMove,
		seekToClick,
		formatTime
	};
}
