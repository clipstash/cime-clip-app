# cime-clip-app

ClipDown 프론트엔드 — SvelteKit 기반 영상 클립 다운로드 UI입니다.

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
npm run dev       # 개발 서버
npm run build     # 프로덕션 빌드
npm run preview   # 빌드 결과 미리보기
npm run check     # Svelte 타입 체크
npm run lint      # ESLint + Prettier 검사
npm run format    # Prettier 자동 포맷
```

## 구조

```
src/
├── lib/
│   ├── api/
│   │   ├── clips.ts      # 클립 API 호출
│   │   ├── videos.ts     # 영상 API 호출
│   │   └── record.ts     # 녹화 일정 API 호출
│   └── utils/
│       ├── status.ts     # 상태 표시 유틸
│       └── url.ts        # URL 유틸
└── routes/
    ├── clips/            # 클립/영상/녹화 관리 페이지
    │   ├── ClipForm.svelte
    │   ├── ClipCard.svelte
    │   ├── VideoForm.svelte
    │   ├── VideoCard.svelte
    │   ├── RecordForm.svelte
    │   ├── RecordCard.svelte
    │   ├── PreviewModal.svelte
    │   └── SourcePreview.svelte
    └── schedule/         # 녹화 일정 페이지
```

## API 연결

백엔드 API 기본 경로는 `src/lib/api/config.ts`의 `API_URL`로 관리합니다 (기본값: `/api/v1`).

SvelteKit 개발 서버는 `vite.config.ts`의 프록시 설정을 통해 API 요청을 백엔드로 전달합니다.

참고: ffmpeg-core.wasm이 32MB라 .gitignore에 추가하고 빌드 스크립트로 복사하는 방식 고려할 것.