# 코드 가독성 리뷰

> 분석 기준일: 2026-04-02  
> 대상 브랜치: develop  
> 최종 업데이트: 2026-04-02 (완료: #1, #2, #3, #4, #6, #9)

---

## 요약

전반적으로 주석이 잘 달려 있고 관심사 분리(스토어 / 훅 / 유틸)가 명확합니다.  
개선 여지는 주로 **함수 길이**, **중복 로직**, **타입 중복**, **명명 일관성** 네 영역에 집중됩니다.

---

## ~~1. `ClipForm.svelte` — submit() 함수가 너무 길다~~ ✅ 완료

**위치**: `src/lib/components/forms/ClipForm.svelte:111-232`

`submit()`이 120줄짜리 단일 함수입니다. 내부에 번호가 붙은 9단계 주석이 있다는 것 자체가 분리 신호입니다.

**현재 구조**:
```
submit()
  1. 스트림 정보 조회
  2. m3u8 파싱
  3. 세그먼트 필터링
  4. FFmpeg 로드
  5. init 세그먼트 다운로드
  6. 세그먼트 병렬 다운로드
  7. 바이너리 병합
  8. FFmpeg 트림 (파트 분할 포함)
  9. 정리
```

**제안**: 단계별로 함수를 추출합니다.

```ts
// 3단계: 세그먼트 필터링
function filterSegments(segments, durations, startSec, endSec) { ... }

// 7단계: 바이너리 병합
function concatBuffers(parts: Uint8Array[]): Uint8Array { ... }

// 8단계: FFmpeg 트림 (파트 하나)
async function trimPart(ffmpeg, i, chunkStart, chunkDur, firstSegCumTime) { ... }
```

submit()은 이 함수들을 순서대로 호출하는 오케스트레이터 역할만 하게 됩니다.

---

## 2. ~~`makeBaseName()` 중복~~ ✅ 완료

**위치**:  
- `ClipForm.svelte:66-71`  
- `useVideoDownload.svelte.ts:63-67` (동일 로직 인라인)

두 군데에서 `[스트리머] 제목_YYYYMMDD` 형식의 파일명을 만듭니다. 나중에 포맷이 바뀌면 두 곳을 모두 수정해야 합니다.

**제안**: `src/lib/utils/filename.ts`로 추출합니다.

```ts
// utils/filename.ts
export function makeBaseName(title: string | null, streamer: string | null): string {
    const today = new Date();
    const dateStr = `${today.getFullYear()}${...}`;
    const raw = streamer ? `[${streamer}] ${title ?? 'clip'}_${dateStr}` : `${title ?? 'clip'}_${dateStr}`;
    return raw.replace(/[\\/:*?"<>|]/g, '_');
}
```

---

## 3. ~~`ClipListStore` — setPreview() 타입 중복~~ ✅ 완료

**위치**: `src/lib/stores/clipListStore.svelte.ts:18-42`

`preview` 필드 타입과 `setPreview()` 파라미터 타입이 완전히 동일하게 두 번 선언됩니다.

**현재**:
```ts
preview = $state<{
    files: ...; title: ...; streamer: ...; /* 8개 필드 */
} | null>(null);

setPreview(data: {
    files: ...; title: ...; streamer: ...; /* 동일한 8개 필드 */
} | null) { ... }
```

**제안**: 타입을 한 번만 선언합니다.

```ts
type PreviewState = {
    files: { filename: string; timeLabel: string }[];
    title: string | null;
    streamer: string | null;
    thumbnail: string | null;
    busy: boolean;
    progress: number;
    progressLabel: string;
    currentFileIdx: number;
};

preview = $state<PreviewState | null>(null);
setPreview(data: PreviewState | null) { this.preview = data; }
```

---

## 4. ~~`useTimeRange` — 반환 객체 보일러플레이트~~ ✅ 완료

**위치**: `src/lib/hooks/useTimeRange.svelte.ts:151-231`

getter/setter가 각각 6쌍(startH/M/S, endH/M/S) + 5개 읽기 전용 파생값으로 80줄을 차지합니다. Svelte 5의 Rune 한계상 완전 제거는 어렵지만, 반복 패턴을 줄일 수 있습니다.

**개선 가능 부분**: 시간 필드 6개는 구조적으로 동일합니다. 타입으로 그룹화하면 소비 측 코드가 간결해집니다.

```ts
// 현재: tr.startH, tr.startM, tr.startS (3개 별도 prop)
// 개선: tr.start = { h, m, s } — HmsInput과 TimelineSlider bind 패턴도 단순화됨
```

> 주의: 이 변경은 HmsInput/TimelineSlider의 bind 인터페이스도 함께 바꿔야 합니다. 영향 범위가 크므로 점진적으로 접근하세요.

---

## 5. `useVideoDownload` — pauseRequested $state 불필요

**위치**: `src/lib/hooks/useVideoDownload.svelte.ts:21`

```ts
let cancelRequested = false;       // 일반 변수 (UI에 노출 안 됨)
let pauseRequested = $state(false); // $state (UI에 노출됨: isPaused getter)
```

`pauseRequested`는 `isPaused` getter를 통해 UI에 바인딩되므로 `$state`가 맞습니다. 그러나 바로 위의 `cancelRequested`와 선언 방식이 달라 이유가 불명확합니다. 주석으로 차이를 명시하거나, 일관성을 위해 둘 다 `$state`로 통일하는 것이 좋습니다.

```ts
// cancelRequested: UI 반영 불필요 → 일반 변수
// pauseRequested: isPaused getter로 UI에 반영 → $state 필요
```

---

## 6. ~~`ClipForm.svelte` — 매직 넘버~~ ✅ 완료

**위치**: `src/lib/components/forms/ClipForm.svelte:163, 198`

```ts
progress = Math.round((completedFetches / selectedIdxs.length) * 80); // 왜 80?
progress = 82 + Math.round((i / numParts) * 14);                       // 왜 82, 14?
```

다운로드 80% + 인코딩 18% + 완료 2% 구조인 듯하지만 코드만으로는 불분명합니다.

**제안**:
```ts
const PROGRESS = {
    DOWNLOAD_END: 80,    // 세그먼트 다운로드 완료 시점
    ENCODE_START: 82,    // 인코딩 시작 시점
    ENCODE_RANGE: 14,    // 인코딩 구간 너비
} as const;
```

---

## 7. `+server.ts` (proxy) — causeMsg 인라인 계산 복잡도

**위치**: `src/routes/stream/proxy/+server.ts:61`

```ts
const causeMsg = cause instanceof Error ? ` (cause: ${cause.message})` : cause ? ` (cause: ${String(cause)})` : '';
```

한 줄에 세 가지 경우를 처리하고 있습니다. 함수로 추출하거나 줄을 나누면 읽기 쉬워집니다.

```ts
function formatCause(cause: unknown): string {
    if (cause instanceof Error) return ` (cause: ${cause.message})`;
    if (cause) return ` (cause: ${String(cause)})`;
    return '';
}
```

---

## 8. `+page.svelte` — 주석 처리된 코드

**위치**: `src/routes/+page.svelte:6, 18-19`

```svelte
// import Nav from '$lib/components/Nav.svelte';
<!-- <Nav /> -->
```

`Nav` 컴포넌트가 두 줄 모두 주석 처리돼 있습니다. 불필요하면 삭제, 향후 복구 예정이면 TODO 주석으로 의도를 명시하세요.

---

## 9. ~~`clips/info/+server.ts` — getInfoViaScraping() 길이~~ ✅ 완료

**위치**: `src/routes/clips/info/+server.ts:82-155`

70줄짜리 함수로, 다음 세 가지 책임을 동시에 집니다:
1. HTML fetch
2. 메타태그 파싱 (title / thumbnail / siteName / uploader / m3u8)
3. duration 계산 (메타태그 → m3u8 EXTINF 순서로 fallback)

**제안**: 적어도 다음 두 함수로 분리합니다.

```ts
function parseMetaTags(html: string, url: string): { title; thumbnail; uploader; manifest_url; is_live }
async function resolveDuration(manifest_url, is_live, html): Promise<number | undefined>
```

---

## 우선순위 요약

| 순위 | 항목 | 이유 | 상태 |
|------|------|------|------|
| 1 | ~~submit() 분리 (#1)~~ | 가장 큰 함수, 버그 유발 위험 | ✅ 완료 |
| 2 | ~~makeBaseName 중복 제거 (#2)~~ | 변경 시 두 곳 수정 필요 | ✅ 완료 |
| 3 | ~~PreviewState 타입 분리 (#3)~~ | 타입 변경 시 두 곳 수정 필요 | ✅ 완료 |
| 4 | ~~매직 넘버 상수화 (#6)~~ | 진행률 로직 변경 시 파악 어려움 | ✅ 완료 |
| 5 | ~~getInfoViaScraping 분리 (#9)~~ | 테스트/유지보수 어려움 | ✅ 완료 |
| 6 | ~~useTimeRange 구조화 (#4)~~ | 가독성 개선, 기능 영향 없음 | ✅ 완료 |
| 7 | 나머지 (#5, #7, #8) | 가독성 개선, 기능 영향 없음 | 미완료 |

---

## 조치 방안

### #1 — submit() 함수 분리

**파일**: `src/lib/components/forms/ClipForm.svelte`

`submit()` 내부의 순수 계산/변환 단계를 `<script>` 블록 상단에 독립 함수로 추출합니다. 상태(`dlStatus`, `progress` 등)를 직접 건드리지 않는 단계부터 시작하면 리스크가 낮습니다.

```ts
// 추출 1: 세그먼트 필터링 (현재 submit() 내 3단계)
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
        const dur = durations[i] || 2;
        if (cumTime + dur > startSec && cumTime < endSec) {
            if (idxs.length === 0) firstCumTime = cumTime;
            idxs.push(i);
        }
        cumTime += dur;
    }
    return { idxs, firstCumTime };
}

// 추출 2: 바이너리 병합 (현재 submit() 내 7단계)
function concatBuffers(parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((a, p) => a + p.byteLength, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) { out.set(p, offset); offset += p.byteLength; }
    return out;
}

// 추출 3: 파트 하나 트림 (현재 submit() 내 8단계 루프 바디)
async function trimPart(
    ffmpeg: FFmpeg,
    outFile: string,
    seekSec: number,
    durSec: number
): Promise<Uint8Array> {
    await ffmpeg.exec(['-ss', String(seekSec), '-i', 'input.mp4', '-t', String(durSec), '-c', 'copy', outFile]);
    const raw = (await ffmpeg.readFile(outFile)) as Uint8Array;
    await ffmpeg.deleteFile(outFile);
    return raw;
}
```

이 세 함수를 추출하면 `submit()`은 상태 관리 + 흐름 제어만 담당하는 ~50줄 함수가 됩니다.

---

### #2 — makeBaseName() 유틸 추출

**새 파일**: `src/lib/utils/filename.ts`

```ts
/**
 * 파일명 베이스 생성: [스트리머] 제목_YYYYMMDD
 * 파일시스템 금지 문자는 _로 치환
 */
export function makeBaseName(title: string | null, streamer: string | null): string {
    const d = new Date();
    const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const raw = streamer
        ? `[${streamer}] ${title ?? 'clip'}_${dateStr}`
        : `${title ?? 'clip'}_${dateStr}`;
    return raw.replace(/[\\/:*?"<>|]/g, '_');
}
```

**변경 대상**:
- `ClipForm.svelte:66-71` → `makeBaseName` 함수 제거, `import { makeBaseName } from '$lib/utils/filename'` 추가
- `useVideoDownload.svelte.ts:63-67` → 인라인 로직 제거, 동일 import 추가

---

### #3 — PreviewState 타입 분리

**파일**: `src/lib/stores/clipListStore.svelte.ts`

파일 상단에 타입을 선언하고 `preview` 필드와 `setPreview()` 모두 이 타입을 참조하도록 변경합니다.

```ts
// 파일 상단 (import 아래)에 추가
type PreviewState = {
    files: { filename: string; timeLabel: string }[];
    title: string | null;
    streamer: string | null;
    thumbnail: string | null;
    busy: boolean;
    progress: number;
    progressLabel: string;
    currentFileIdx: number;
};
```

`setPreview()` 시그니처도 `PreviewState | null`로 단순화합니다. `ClipForm.svelte`에서 `clipListStore.setPreview({...})` 호출 시 타입 추론이 그대로 동작합니다.

---

### #4 — useTimeRange 반환 객체 점진 개선

**파일**: `src/lib/hooks/useTimeRange.svelte.ts`

현재 6쌍의 H/M/S getter·setter를 `start`/`end` 객체로 묶는 방향입니다. Svelte 5에서는 `bind:` 지시어가 중첩 객체 프로퍼티에도 동작하므로 (`bind:h={tr.start.h}`) HmsInput 인터페이스 변경만 수반합니다.

단, 영향 범위(`HmsInput`, `TimelineSlider`, `ClipForm`)가 넓으므로 **별도 브랜치**에서 작업하고 `npm run check`로 타입 에러를 전수 확인한 뒤 병합하세요.

---

### #5 — pauseRequested / cancelRequested 불일치 주석 추가

**파일**: `src/lib/hooks/useVideoDownload.svelte.ts:20-21`

코드 변경 없이 주석만 추가합니다.

```ts
// cancelRequested: UI 반영 불필요(버튼 비활성화는 status로 처리) → 일반 변수
let cancelRequested = false;
// pauseRequested: isPaused getter로 버튼 텍스트에 반영 → $state 필요
let pauseRequested = $state(false);
```

---

### #6 — 매직 넘버 상수화

**파일**: `src/lib/components/forms/ClipForm.svelte`

`submit()` 위에 상수 블록을 추가합니다.

```ts
// 진행률 구간: 다운로드 0~80%, 인코딩 82~96%, 완료 100%
const PROGRESS_DOWNLOAD_END = 80;
const PROGRESS_ENCODE_START = 82;
const PROGRESS_ENCODE_RANGE = 14;
```

사용처를 교체합니다.

```ts
// 변경 전
progress = Math.round((completedFetches / selectedIdxs.length) * 80);
progress = 82 + Math.round((i / numParts) * 14);

// 변경 후
progress = Math.round((completedFetches / selectedIdxs.length) * PROGRESS_DOWNLOAD_END);
progress = PROGRESS_ENCODE_START + Math.round((i / numParts) * PROGRESS_ENCODE_RANGE);
```

---

### #7 — formatCause() 추출

**파일**: `src/routes/stream/proxy/+server.ts`

`isMediaSegment()` 옆에 헬퍼 함수를 추가합니다.

```ts
function formatCause(cause: unknown): string {
    if (cause instanceof Error) return ` (cause: ${cause.message})`;
    if (cause) return ` (cause: ${String(cause)})`;
    return '';
}
```

catch 블록을 단순화합니다.

```ts
// 변경 전
const causeMsg = cause instanceof Error ? ` (cause: ${cause.message})` : cause ? ` (cause: ${String(cause)})` : '';

// 변경 후
const causeMsg = formatCause((e as { cause?: unknown })?.cause);
```

---

### #8 — Nav 주석 처리 코드 정리

**파일**: `src/routes/+page.svelte`

재활성화 계획이 없다면 두 줄을 삭제합니다.

```diff
- // import Nav from '$lib/components/Nav.svelte';
  ...
- <!-- <Nav /> -->
```

재활성화 예정이라면 의도를 명시합니다.

```svelte
<!-- TODO: 네비게이션 복구 예정 — 모바일 레이아웃 확정 후 활성화 -->
<!-- import Nav from '$lib/components/Nav.svelte'; -->
```

---

### #9 — getInfoViaScraping() 분리

**파일**: `src/routes/clips/info/+server.ts`

HTML fetch와 파싱을 분리합니다.

```ts
// 분리 1: HTML에서 메타 정보만 파싱 (순수 함수, 테스트 가능)
function parsePageMeta(html: string, pageUrl: string): {
    title: string | undefined;
    thumbnail: string | undefined;
    uploader: string | undefined;
    manifest_url: string | undefined;
    is_live: boolean;
} { ... }

// 분리 2: duration 해석 (메타태그 우선, fallback으로 m3u8 EXTINF 합산)
async function resolveDuration(
    html: string,
    manifest_url: string | undefined,
    is_live: boolean
): Promise<number | undefined> { ... }

// getInfoViaScraping: fetch → parsePageMeta → resolveDuration 호출만 담당
async function getInfoViaScraping(url: string): Promise<YtDlpInfo> {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    const meta = parsePageMeta(html, url);
    const duration = await resolveDuration(html, meta.manifest_url, meta.is_live);
    return { ...meta, duration };
}
```

`parsePageMeta`는 순수 함수가 되므로 단위 테스트 작성이 가능해집니다.
