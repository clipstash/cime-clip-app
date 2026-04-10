import { proxyUrl } from '$lib/utils/proxy';

// ── m3u8 파싱 결과 타입 ───────────────────────────────────────────
export type M3u8Info = {
	initUrl: string | null; // fMP4 초기화 세그먼트 URL (없으면 null)
	segments: string[]; // 미디어 세그먼트 URL 목록
	durations: number[]; // 각 세그먼트의 재생 시간 (초)
};

// ── m3u8 플레이리스트 파싱 ────────────────────────────────────────
// 프록시를 통해 m3u8을 가져온 뒤 세그먼트 목록과 init URL을 추출
// 마스터 플레이리스트인 경우 첫 번째 서브 플레이리스트를 재귀 파싱
export async function parseM3u8(m3u8Url: string): Promise<M3u8Info> {
	const fetchUrl = proxyUrl(m3u8Url);
	const res = await fetch(fetchUrl);
  
	if (!res.ok) {
		const msg = await res.text().catch(() => res.statusText);
		throw new Error(`m3u8 fetch 실패 (${res.status}): ${msg}`);
	}

	const text = await res.text();
	const base = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);

	// 마스터 플레이리스트: #EXT-X-STREAM-INF 포함 → 최고 화질(BANDWIDTH 최대) 서브 플레이리스트로 재귀
	if (text.includes('#EXT-X-STREAM-INF')) {
		const lines = text.split('\n').map((l) => l.trim());
		let bestUrl = '';
		let bestBandwidth = -1;
		let currentBandwidth = 0;
		for (const line of lines) {
			if (line.startsWith('#EXT-X-STREAM-INF')) {
				const bwMatch = line.match(/BANDWIDTH=(\d+)/);
				currentBandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;
			} else if (line && !line.startsWith('#')) {
				if (currentBandwidth > bestBandwidth) {
					bestBandwidth = currentBandwidth;
					bestUrl = line.startsWith('http') ? line : base + line;
				}
				currentBandwidth = 0;
			}
		}
		if (bestUrl) return parseM3u8(bestUrl);
		return { initUrl: null, segments: [], durations: [] };
	}

	// fMP4 초기화 세그먼트 추출 (#EXT-X-MAP:URI="...")
	// 상대 경로이면 base를 붙여 절대 URL로 변환
	let initUrl: string | null = null;
	const mapMatch = text.match(/#EXT-X-MAP:URI="([^"]+)"/);
  
	if (mapMatch) {
		const raw = mapMatch[1];
		initUrl = raw.startsWith('http') ? raw : base + raw;
	}

	// 미디어 세그먼트 목록 및 각 세그먼트 재생 시간 추출
	// #EXTINF 태그의 값을 nextDuration에 저장했다가 다음 세그먼트 URL에 매핑
	const lines = text.split('\n').map((line) => line.trim());
	const segments: string[] = [];
	const durations: number[] = [];
	let nextDuration = 0;

	for (const line of lines) {
		if (line.startsWith('#EXTINF:')) {
			nextDuration = parseFloat(line.slice(8).split(',')[0]) || 0;
		} else if (line && !line.startsWith('#')) {
			segments.push(line.startsWith('http') ? line : base + line);
			durations.push(nextDuration);
			nextDuration = 0;
		}
	}

	return { initUrl, segments, durations };
}
