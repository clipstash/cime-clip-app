# cime-clip-app

씨미(CIME) 라이브 스트림 클립 다운로드 · 전체 영상 다운로드 · 실시간 녹화를 위한 SvelteKit 웹 앱입니다.

모든 영상 처리(세그먼트 다운로드, FFmpeg 인코딩)는 **브라우저 내에서** 실행되며, 별도 백엔드 서버가 필요 없습니다.

## 사전 요구사항

| 항목 | 버전 |
|------|------|
| Node.js | 18 이상 |
| npm | 9 이상 |

> 스트림 메타데이터 조회(yt-dlp 방식)를 사용하려면 서버에 `yt-dlp`가 설치되어 있어야 합니다.

## 설치 및 실행

```bash
npm install
npm run dev       # 개발 서버 (http://localhost:5173)
```

## 명령어

```bash
npm run dev          # 개발 서버 (Vite)
npm run build        # 프로덕션 빌드
npm run preview      # 빌드 결과 미리보기
npm run check        # Svelte 타입 체크
npm run check:watch  # 타입 체크 (watch 모드)
npm run lint         # ESLint + Prettier 검사
npm run format       # Prettier 자동 포맷
```

## 기능

URL을 입력하면 소스 정보를 자동으로 감지합니다.

- **클립 추출**: 시작/종료 시간을 지정해 구간 클립 다운로드 (타임라인 슬라이더 또는 시:분:초 입력)
- **전체 영상 다운로드**: VOD 전체를 하나의 파일로 저장
- **실시간 녹화**: 라이브 스트림 녹화 시작·일시정지·재개·완료

## 아키텍처

**스택**: SvelteKit v2 + Svelte 5 (runes) + TypeScript + Tailwind CSS v4 + Vite

별도 백엔드 없음. 외부 호출이 필요한 API는 SvelteKit 서버 라우트로 구현되어 있으며 `npm run dev` 하나로 모두 구동된다.

| 서버 라우트 | 역할 |
| --- | --- |
| `GET /clips/info?url=` | yt-dlp 또는 HTML 스크래핑으로 스트림 메타데이터 조회 |
| `GET /stream/proxy?url=` | 외부 스트림 URL 중계 (CORS 우회) |

## 프로젝트 구조

```
src/
├── routes/
│   ├── +layout.svelte             # 전역 레이아웃 (favicon, global.css)
│   ├── +page.svelte               # 메인 페이지
│   ├── clips/info/+server.ts      # GET /clips/info — 스트림 메타데이터 조회
│   └── stream/proxy/+server.ts    # GET /stream/proxy — CORS 프록시
├── lib/
│   ├── api/
│   │   ├── clips.ts               # 클립 타입 및 fetchClipInfo()
│   │   ├── videos.ts              # 영상 타입
│   │   └── record.ts              # 녹화 타입
│   ├── hooks/
│   │   ├── useTimeRange.svelte.ts    # 시간 범위 선택 상태 및 로직
│   │   └── useVideoDownload.svelte.ts # 전체 영상 다운로드 상태 및 로직
│   ├── stores/
│   │   ├── sourceStore.svelte.ts     # URL 입력 및 소스 메타데이터 상태
│   │   └── clipListStore.svelte.ts   # 클립·영상·녹화 목록 및 프리뷰 모달 상태
│   ├── components/
│   │   ├── Background.svelte         # 데코레이티브 배경
│   │   ├── Nav.svelte                # 상단 네비게이션
│   │   ├── SourcePreview.svelte      # 스트림 메타데이터 표시 (썸네일, 제목, 길이)
│   │   ├── PreviewModal.svelte       # 영상 프리뷰 모달
│   │   ├── forms/
│   │   │   ├── ClipForm.svelte       # 클립 추출 폼 (시간 범위 + 다운로드 버튼)
│   │   │   ├── RecordForm.svelte     # 실시간 녹화 폼
│   │   │   └── VideoForm.svelte      # 전체 영상 다운로드 폼
│   │   ├── cards/
│   │   │   ├── ClipCard.svelte       # 완료된 클립 카드
│   │   │   ├── VideoCard.svelte      # 완료된 영상 다운로드 카드
│   │   │   └── RecordCard.svelte     # 완료된 녹화 카드
│   │   └── ui/
│   │       ├── HmsInput.svelte       # 시:분:초 입력 필드
│   │       ├── TimelineSlider.svelte # 드래그 가능한 타임라인 슬라이더
│   │       └── ProgressBar.svelte    # 다운로드/인코딩 진행 바
│   ├── ffmpeg/
│   │   └── index.ts               # 브라우저 FFmpeg WASM 래퍼
│   └── utils/
│       ├── status.ts              # statusColor(), statusLabel() 유틸
│       ├── stream.ts              # HLS(m3u8) 플레이리스트 파싱
│       └── url.ts                 # URL 정규화 유틸
└── styles/
    ├── global.css
    └── page.css
```

## 동작 방식

1. URL 입력 시 `/clips/info` 서버 라우트가 메타데이터(제목, 썸네일, 재생 시간, m3u8 URL)를 반환
2. 브라우저에서 m3u8 플레이리스트를 파싱해 세그먼트 목록 획득
3. CORS 우회가 필요한 경우 `/stream/proxy`를 경유해 세그먼트 다운로드
4. **FFmpeg WASM**이 브라우저 내에서 세그먼트를 합쳐 MP4로 저장

> FFmpeg WASM 동작을 위해 COOP/COEP 헤더가 필요합니다. `vite.config.ts`에 설정되어 있습니다.
