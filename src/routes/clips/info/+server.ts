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
	uploader?: string; // 스트리머/채널 이름
	channel?: string; // 채널 이름 (uploader 없을 때 fallback)
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

// ── m3u8 플레이리스트에서 총 재생 시간 및 라이브 여부 계산 ─────
// 마스터 플레이리스트면 첫 번째 variant로 재귀, 미디어 플레이리스트면 EXTINF 합산
// #EXT-X-ENDLIST 없으면 라이브(진행 중) 스트림으로 판단
async function getDurationFromM3u8(
	m3u8Url: string
): Promise<{ duration: number | undefined; isLive: boolean }> {
	try {
		const res = await fetch(m3u8Url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
		if (!res.ok) return { duration: undefined, isLive: false };
		const text = await res.text();

		// 마스터 플레이리스트: #EXT-X-STREAM-INF 포함 → 첫 번째 variant URL로 재귀
		if (text.includes('#EXT-X-STREAM-INF')) {
			const variantMatch = text.match(/^(?!#)(\S+)$/m);
			if (!variantMatch) return { duration: undefined, isLive: false };
			const variantUrl = variantMatch[1].startsWith('http')
				? variantMatch[1]
				: new URL(variantMatch[1], m3u8Url).href;
			return getDurationFromM3u8(variantUrl);
		}

		// #EXT-X-ENDLIST 없으면 라이브 스트림
		const isLive = !text.includes('#EXT-X-ENDLIST');

		// 미디어 플레이리스트: #EXTINF 값 합산
		const durations = [...text.matchAll(/#EXTINF:([\d.]+)/g)].map((m) => parseFloat(m[1]));
		if (durations.length === 0) return { duration: undefined, isLive };
		return { duration: Math.round(durations.reduce((a, b) => a + b, 0)), isLive };
	} catch {
		return { duration: undefined, isLive: false };
	}
}

// ── HTML 메타태그 파싱 (순수 함수) ──────────────────────────────
// og:title / og:image / m3u8 URL 패턴으로 스트림 메타데이터 추출
function parsePageMeta(html: string, pageUrl: string): {
	title: string | undefined;
	thumbnail: string | undefined;
	uploader: string | undefined;
	manifest_url: string | undefined;
	is_live: boolean;
} {
	// 플랫폼명: og:site_name (제목에서 제거하기 위해 먼저 추출)
	const siteNameMatch = html.match(/<meta[^>]+property="og:site_name"[^>]+content="([^"]+)"/);
	const siteName = siteNameMatch?.[1] ?? null;
	// 제목: og:title → <title> 순서로 시도, 플랫폼명(" - 씨미" 등) 제거
	const rawTitleMatch =
		html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/) ??
		html.match(/<title>([^<]+)<\/title>/);
	const rawTitle = rawTitleMatch?.[1] ?? undefined;
	const title = rawTitle && siteName
		? rawTitle.replace(new RegExp(`\\s*-\\s*${siteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), '').trim()
		: rawTitle;
	// 썸네일: og:image 메타태그
	const thumbnailMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);
	// 스트리머 이름: URL slug로 페이지 내 JSON에서 실제 채널 name 추출
	// ci.me는 <script type="application/json"> 안에 {"slug":"...", "name":"..."} 형태로 채널 정보를 포함함
	let uploader: string | undefined;
	const slugMatch = pageUrl.match(/\/@([^/?#]+)/);
	if (slugMatch) {
		const slug = slugMatch[1];
		const escapedSlug = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		// slug 앞뒤 200자 내에서 name 필드 탐색 (slug → name, name → slug 두 방향 시도)
		const slugToName = html.match(
			new RegExp(`"slug":"${escapedSlug}"[^{}]{0,200}"name":"([^"]+)"`)
		);
		const nameToSlug = html.match(
			new RegExp(`"name":"([^"]+)"[^{}]{0,200}"slug":"${escapedSlug}"`)
		);
		const found = slugToName?.[1] ?? nameToSlug?.[1];
		if (found) uploader = found;
	}

	// m3u8 URL: 라이브(playback.live-video.net) → VOD(ivs/v1) 순서로 시도
	// 채널별 서브도메인(예: 13e6217ef783.ap-northeast-2.playback.live-video.net)을 포함한 전체 URL 추출
	const liveM3u8Match = html.match(
		/https?:\/\/[^"'\s]*playback\.live-video\.net[^"'\s]*\.m3u8[^"'\s]*/
	);
	const vodM3u8Match = html.match(
		/https?:\/\/[^\s"']*ivs\/v1\/[^\s"']*\/media\/hls\/master\.m3u8[^\s"']*/
	);
	const rawM3u8 = liveM3u8Match?.[0] ?? vodM3u8Match?.[0] ?? null;
	// 프로토콜이 없는 상대 URL이면 https:// 붙여 절대 URL로 변환
	const manifest_url = rawM3u8
		? rawM3u8.startsWith('http')
			? rawM3u8
			: `https://${rawM3u8}`
		: undefined;

	// 라이브 판단 우선순위:
	// 1. playback.live-video.net m3u8 URL이 HTML에 있음
	// 2. URL 경로가 /live로 끝남 (ci.me/@username/live 패턴)
	const is_live = liveM3u8Match != null || /\/live\/?$/i.test(pageUrl);

	return { title, thumbnail: thumbnailMatch?.[1] ?? undefined, uploader, manifest_url, is_live };
}

// ── duration 해석 (메타태그 우선, fallback으로 m3u8 EXTINF 합산) ─
async function resolveDuration(
	html: string,
	manifest_url: string | undefined,
	is_live: boolean
): Promise<number | undefined> {
	const durationMetaMatch = html.match(
		/<meta[^>]+(?:property|name)="video:duration"[^>]+content="(\d+)"/
	) ?? html.match(/<meta[^>]+content="(\d+)"[^>]+(?:property|name)="video:duration"/);
	if (durationMetaMatch) return parseInt(durationMetaMatch[1], 10);
	if (!is_live && manifest_url) {
		const m3u8Result = await getDurationFromM3u8(manifest_url);
		return m3u8Result.duration;
	}
	return undefined;
}

// ── HTML 스크래핑으로 스트림 정보 조회 ──────────────────────────
// yt-dlp가 지원하지 않는 사이트(ci.me 등)를 위한 fallback
async function getInfoViaScraping(url: string): Promise<YtDlpInfo> {
	const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
	const html = await res.text();
	const meta = parsePageMeta(html, url);
	const duration = await resolveDuration(html, meta.manifest_url, meta.is_live);
	return { ...meta, duration };
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
	if (targetUrl.length > 4096) {
		error(400, 'URL too long');
	}
	try {
		new URL(targetUrl);
	} catch {
		error(400, 'Invalid url parameter');
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
			streamer: info.uploader ?? info.channel ?? null,
			duration,
			is_live: isLive,
			thumbnail: info.thumbnail ?? null,
			m3u8_url: extractM3u8Url(info)
		});
	} catch {
		error(502, '스트림 URL 정보 조회 실패');
	}
};
