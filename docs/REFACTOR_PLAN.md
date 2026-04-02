# 훅 추출 리팩토링 계획

> 작성일: 2026-04-02  
> 대상: `ClipForm.svelte`, `RecordForm.svelte`  
> 방안: 방안 1 (훅 추출) — 유틸 파일 분리(방안 2)는 미포함

---

## 배경

`ClipForm.svelte`와 `RecordForm.svelte` 두 파일 모두 다운로드/녹화 로직이 컴포넌트 안에 인라인으로 작성되어 있습니다. 이미 `useVideoDownload` 훅이 분리되어 있는 패턴을 동일하게 적용합니다.

---

## 목표 구조

```
src/lib/hooks/
├── useTimeRange.svelte.ts       (기존)
├── useVideoDownload.svelte.ts   (기존)
├── useClipDownload.svelte.ts    ← 신규
└── useRecordDownload.svelte.ts  ← 신규
```

---

## useClipDownload

### 훅으로 이동하는 것

| 항목 | 현재 위치 |
|------|-----------|
| `DlStatus` 타입 | ClipForm.svelte |
| `MAX_CLIP_SEC`, `PROGRESS_*` 상수 | ClipForm.svelte |
| `err`, `dlStatus`, `progress`, `progressLabel`, `currentFileIdx` 상태 | ClipForm.svelte |
| `cancelClipRequested` 변수 | ClipForm.svelte |
| `busy` derived | ClipForm.svelte |
| `filterSegments()`, `concatBuffers()`, `trimPart()` | ClipForm.svelte |
| `submit()` | ClipForm.svelte |

### 훅 인터페이스

```ts
function useClipDownload(
    onSuccess: (info: { title: string | null; startSec: number; endSec: number; blobUrl: string; filename: string }) => void
)

// 반환
{
    busy,           // $derived
    progress,       // $state
    progressLabel,  // $state
    currentFileIdx, // $state
    err,            // $state
    submit(url: string, startSec: number, endSec: number): Promise<void>,
    cancel(): void
}
```

### ClipForm에 남는 것

- `useTimeRange` 훅
- `videoDl` (`useVideoDownload` 훅)
- `videoFilenameOverride` / `videoFilename` 상태
- `previewFiles` derived (tr + MAX_CLIP_SEC 참조)
- `clipListStore` 동기화 `$effect`
- 템플릿 전체

### 템플릿 변경 (이름 교체 수준)

```svelte
<!-- 전 -->
{#if busy}
  <button onclick={() => { cancelClipRequested = true; }}>취소 ✕</button>
{:else}
  <button onclick={submit} disabled={!url || !!tr.timeError}>클립 생성 ✦</button>
{/if}
<ProgressBar {progress} label={progressLabel} />
{#if err}<p class="error">{err}</p>{/if}

<!-- 후 -->
{#if clipDl.busy}
  <button onclick={clipDl.cancel}>취소 ✕</button>
{:else}
  <button onclick={() => clipDl.submit(url, tr.startSec, tr.endSec)} disabled={!url || !!tr.timeError}>클립 생성 ✦</button>
{/if}
<ProgressBar progress={clipDl.progress} label={clipDl.progressLabel} />
{#if clipDl.err}<p class="error">{clipDl.err}</p>{/if}
```

### 위험도: 낮음

- `useVideoDownload`와 구조 동일 → 패턴 복사 수준
- `cancelClipRequested` → `cancelRequested`로 이름 변경 시 참조 누락 주의
- 타입 불일치는 `npm run check`로 대부분 사전 감지 가능

---

## useRecordDownload

### 훅으로 이동하는 것

| 항목 | 현재 위치 |
|------|-----------|
| `RecordStatus` 타입 | RecordForm.svelte |
| `status`, `segCount`, `err` 상태 | RecordForm.svelte |
| `m3u8Url`, `initData`, `sessions`, `segmentsSeen`, `pollTimerId`, `isFirstPoll`, `pollEpoch` | RecordForm.svelte |
| `isActive` derived | RecordForm.svelte |
| `fetchSegment()`, `pollSegments()` | RecordForm.svelte |
| `submit(url, filename)`, `pauseRecording()`, `resumeRecording()`, `stopRecording()`, `reset()` | RecordForm.svelte |
| `onDestroy` 폴링 타이머 정리 | RecordForm.svelte |

### 훅 인터페이스

```ts
function useRecordDownload(
    onSuccess?: (info: { filename: string; url: string; blobUrl: string }) => void
)

// 반환
{
    status,   // $state
    segCount, // $state
    err,      // $state
    isActive, // $derived
    submit(url: string, filename: string): Promise<void>,
    pause(): void,
    resume(): void,
    stop(): Promise<void>,
    reset(): void
}
```

### RecordForm에 남는 것

- `recFileName`, `fileNameEdited`, `titleLoading` 상태 (UI 입력 상태)
- URL 변경 시 파일명 자동 설정 `$effect`
- 템플릿 전체

### 위험도: 중간

#### 주의 사항 1 — `onDestroy` → `$effect` 전환 필수

컴포넌트에서는 `onDestroy`가 동작하지만, `.svelte.ts` 훅 파일에서는 지원되지 않습니다. `$effect` 클린업으로 전환해야 합니다.

```ts
// 현재 (RecordForm 컴포넌트 내)
onDestroy(() => {
    if (pollTimerId) { clearTimeout(pollTimerId); pollTimerId = null; }
});

// 훅 내에서 변경 후
$effect(() => {
    return () => {
        if (pollTimerId) { clearTimeout(pollTimerId); pollTimerId = null; }
    };
});
```

이를 누락하면 페이지 이동 후에도 폴링이 계속 실행되는 **런타임 오류**가 발생합니다. `npm run check`로는 감지되지 않습니다.

#### 주의 사항 2 — `SvelteSet` import 이동

`segmentsSeen = new SvelteSet()` 사용 시 `svelte/reactivity`에서 import를 훅 파일로 함께 이동해야 합니다.

#### 주의 사항 3 — `pollEpoch` 클로저 참조 확인

`pollSegments`, `pauseRecording`, `resumeRecording`, `stopRecording`, `reset` 다섯 함수가 `pollEpoch`를 공유합니다. 훅 클로저 내에서는 동일하게 동작하지만, 변수 하나라도 누락되면 **무한 폴링** 또는 **오래된 epoch 참조** 오류가 날 수 있습니다.

---

## 위험도 요약

| 항목 | 위험도 | `npm run check` 감지 |
|------|--------|----------------------|
| useClipDownload 전체 | 낮음 | ✅ 대부분 |
| useRecordDownload — `onDestroy` 전환 | 중간 | ❌ 런타임에만 나타남 |
| useRecordDownload — `SvelteSet` import | 낮음 | ✅ 감지됨 |
| useRecordDownload — `pollEpoch` 참조 | 낮음~중간 | ❌ 로직 오류 |

---

## 방안 1 vs 방안 1+2 비교

| | 방안 1만 | 방안 1+2 |
|---|---|---|
| 신규 파일 수 | 2개 | 3개 |
| 헬퍼 함수 위치 | 각 훅 내부 (private) | `utils/clip.ts` (독립, 테스트 가능) |
| `concatBuffers` 중복 | ❌ ClipDl·RecordDl 양쪽에 복사 | ✅ 공유 |
