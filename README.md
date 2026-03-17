# cime-clip-app

씨미(CIME) 라이브 스트림 클립 다운로드 · 전체 영상 다운로드 · 실시간 녹화를 위한 SvelteKit 프론트엔드입니다.

## 사전 요구사항

| 항목 | 버전 |
|------|------|
| Node.js | 18 이상 |
| npm | 9 이상 |

백엔드(`cime-clip-server/`)가 `http://localhost:8000`에서 실행 중이어야 합니다.

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

- **VOD**: 시작/종료 시간을 지정해 구간 클립 다운로드, 또는 전체 영상 다운로드
- **라이브 스트림**: 실시간 녹화 시작/중지

## 스택

- **SvelteKit v2** + **Svelte 5** (runes) + **TypeScript**
- **Tailwind CSS v4** + Custom CSS
- **Vite** 개발 서버 (API 프록시 `/api/*` → `http://localhost:8000`)

## 프로젝트 구조

```
src/
├── lib/
│   ├── api/
│   │   ├── config.ts          # API_URL 기본 경로 (/api/v1)
│   │   ├── clips.ts           # 클립 다운로드 API
│   │   ├── videos.ts          # 전체 영상 다운로드 API
│   │   └── record.ts          # 녹화 API
│   ├── components/
│   │   ├── Background.svelte  # 데코레이티브 배경
│   │   ├── Nav.svelte         # 상단 네비게이션
│   │   ├── PreviewModal.svelte
│   │   ├── SourcePreview.svelte
│   │   ├── cards/
│   │   │   ├── ClipCard.svelte
│   │   │   ├── VideoCard.svelte
│   │   │   └── RecordCard.svelte
│   │   └── forms/
│   │       ├── ClipForm.svelte
│   │       ├── VideoForm.svelte
│   │       └── RecordForm.svelte
│   ├── stores/
│   │   ├── sourceStore.svelte.ts   # URL 입력 및 소스 정보 상태
│   │   └── clipListStore.svelte.ts # 클립/영상/녹화 목록 상태
│   ├── ffmpeg/
│   │   └── index.ts           # 브라우저 ffmpeg-wasm 래퍼
│   └── utils/
│       ├── status.ts          # 상태 표시 유틸 (statusColor, statusLabel)
│       ├── stream.ts          # 스트림 유틸
│       └── url.ts             # URL 유틸
├── routes/
│   ├── +layout.svelte         # 전역 레이아웃
│   └── +page.svelte           # 메인 페이지 (단일 페이지 앱)
└── styles/
    ├── global.css
    └── page.css
```

## API 연결

백엔드 API 기본 경로는 `src/lib/api/config.ts`의 `API_URL`로 관리합니다 (기본값: `/api/v1`).

SvelteKit 개발 서버는 `vite.config.ts`의 프록시 설정을 통해 `/api/*` 요청을 `http://localhost:8000`으로 전달합니다.
