// ── API / 유틸 ───────────────────────────────────────────────────
import { fetchClipInfo } from '$lib/api/clips';

// ── 스트림 소스 정보 스토어 ───────────────────────────────────────
// url 입력 시 600ms 디바운스 후 스트림 메타데이터를 자동으로 조회
// (제목, 썸네일, 재생 시간, 라이브 여부)
class SourceStore {
	// ── 반응형 상태 ────────────────────────────────────────────────
	url = $state(''); // 사용자가 입력한 스트림 URL
	title = $state<string | null>(null); // 스트림 제목
	thumbnail = $state<string | null>(null); // 썸네일 이미지 URL
	isLive = $state(false); // 라이브 스트림 여부 (duration이 없으면 true)
	loading = $state(false); // 메타데이터 조회 중 여부
	totalSec = $state(3600); // 영상 전체 길이 (초), 기본값 1시간
	durationLoaded = $state(false); // 재생 시간이 성공적으로 로드됐는지 여부

	constructor() {
		// $effect.root: 클래스 인스턴스는 컴포넌트 외부에서 생성되므로
		// $effect를 직접 사용할 수 없어 root로 감싸서 활성화
		$effect.root(() => {
			// url이 바뀌면 메타데이터 상태 초기화
			$effect(() => {
				void this.url;
				this.durationLoaded = false;
				this.title = null;
				this.thumbnail = null;
				this.isLive = false;
				this.loading = false;
			});

			// url 변경 후 600ms 디바운스 → 스트림 정보 자동 조회
			// duration이 있으면 VOD(totalSec 갱신), 없으면 라이브로 판단
			$effect(() => {
				const targetUrl = this.url;
				if (!targetUrl) return;
				this.loading = true;
				const t = setTimeout(async () => {
					const info = await fetchClipInfo(targetUrl);
					if (!info) {
						// API 오류: 라이브 여부 판단 불가 → isLive 변경 없이 로딩 종료
						this.loading = false;
						return;
					}
					this.title = info.title;
					this.thumbnail = info.thumbnail;
					this.isLive = info.is_live;
					if (info.duration != null) {
						this.totalSec = info.duration;
						this.durationLoaded = true;
					}
					this.loading = false;
				}, 600);
				return () => clearTimeout(t);
			});
		});
	}
}

export const sourceStore = new SourceStore();
