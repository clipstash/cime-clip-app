import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { execFile } from 'child_process';
import { promisify } from 'util';

// execFile을 Promise 기반으로 래핑
const execFileAsync = promisify(execFile);

// ── yt-dlp 응답 타입 ─────────────────────────────────────────────
interface YtDlpInfo {
	title?: string; // 영상 제목
	duration?: number; // 재생 시간 (초), 라이브이면 없음
	thumbnail?: string; // 썸네일 URL
	manifest_url?: string; // m3u8 마스터 플레이리스트 URL
	is_live?: boolean; // 라이브 스트림 여부
	live_status?: string; // 라이브 상태 문자열 ('is_live' 등)
	formats?: Array<{ protocol?: string; manifest_url?: string; url?: string }>; // 포맷 목록
}

// ── yt-dlp로 스트림 정보 조회 ────────────────────────────────────
// --dump-json 옵션으로 메타데이터만 추출 (실제 다운로드 없음)
async function getInfoViaYtDlp(url: string): Promise<YtDlpInfo> {
	const { stdout } = await execFileAsync('yt-dlp', [
		'--dump-json',
		'--skip-download',
		'--quiet',
		'--no-warnings',
		url
	]);
	return JSON.parse(stdout) as YtDlpInfo;
}

// ── YtDlpInfo에서 m3u8 URL 추출 ─────────────────────────────────
// manifest_url 우선, 없으면 formats 배열에서 m3u8 포맷 검색
function extractM3u8Url(info: YtDlpInfo): string | null {
	if (info.manifest_url) return info.manifest_url;
	const m3u8Format = info.formats?.find((f) =>
		['m3u8', 'm3u8_native'].includes(f.protocol ?? '')
	);
	return m3u8Format?.manifest_url ?? m3u8Format?.url ?? null;
}

// ── HTML 스크래핑으로 스트림 정보 조회 ──────────────────────────
// yt-dlp가 지원하지 않는 사이트(ci.me 등)를 위한 fallback
// og:title / og:image 메타태그와 m3u8 URL 패턴으로 추출
async function getInfoViaScraping(url: string): Promise<YtDlpInfo> {
	const res = await fetch(url, {
		headers: { 'User-Agent': 'Mozilla/5.0' }
	});
	const html = await res.text();

	// 제목: og:title → <title> 순서로 시도
	const titleMatch =
		html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/) ??
		html.match(/<title>([^<]+)<\/title>/);
	// 썸네일: og:image 메타태그
	const thumbnailMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);

	// m3u8 URL: 라이브(playback.live-video.net) → VOD(ivs/v1) 순서로 시도
	const liveM3u8Match = html.match(
		/playback\.live-video\.net\/api\/video\/v1\/[^\s"']+\.m3u8[^\s"']*/
	);
	const vodM3u8Match = html.match(/ivs\/v1\/[^\s"']+\/media\/hls\/master\.m3u8[^\s"']*/);
	const rawM3u8 = liveM3u8Match?.[0] ?? vodM3u8Match?.[0] ?? null;
	// 프로토콜이 없는 상대 URL이면 https:// 붙여 절대 URL로 변환
	const manifest_url = rawM3u8
		? rawM3u8.startsWith('http')
			? rawM3u8
			: `https://${rawM3u8}`
		: undefined;

	return {
		title: titleMatch?.[1] ?? undefined,
		thumbnail: thumbnailMatch?.[1] ?? undefined,
		manifest_url
	};
}

// ── 클립 정보 조회 엔드포인트 ────────────────────────────────────
// ci.me URL이면 스크래핑 우선 시도, 실패 시 yt-dlp로 폴백
// 그 외 URL은 yt-dlp 직접 사용
// GET /clips/info?url=<스트림_URL>
export const GET: RequestHandler = async ({ url }) => {
	// 쿼리 파라미터에서 대상 URL 추출
	const targetUrl = url.searchParams.get('url');
	if (!targetUrl) {
		error(400, 'Missing url parameter');
	}

	// ci.me 계열 URL 여부 판별
	const isCime = /ci\.?me|cime/i.test(targetUrl);

	try {
		let info: YtDlpInfo;

		if (isCime) {
			// ci.me: 스크래핑 먼저, manifest_url이 없으면 yt-dlp로 재시도
			info = await getInfoViaScraping(targetUrl);
			if (!info.manifest_url) {
				info = await getInfoViaYtDlp(targetUrl);
			}
		} else {
			info = await getInfoViaYtDlp(targetUrl);
		}

		// 라이브이면 duration을 null로 처리 (VOD만 duration 반환)
		const isLive = info.is_live || info.live_status === 'is_live';
		const duration =
			!isLive && typeof info.duration === 'number' && isFinite(info.duration) && info.duration > 0
				? Math.floor(info.duration)
				: null;

		return json({
			title: info.title ?? null,
			duration,
			thumbnail: info.thumbnail ?? null,
			m3u8_url: extractM3u8Url(info)
		});
	} catch {
		error(502, '스트림 URL 정보 조회 실패');
	}
};
