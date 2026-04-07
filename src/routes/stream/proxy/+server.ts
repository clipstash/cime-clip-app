import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';

// ── 스트림 프록시 엔드포인트 ──────────────────────────────────────
// 클라이언트가 직접 접근할 수 없는 외부 스트림 URL을 서버에서 중계
// CORS 우회 및 User-Agent 위장 목적으로 사용
// GET /stream/proxy?url=<외부_URL>
//
// ※ 대역폭 절감 정책:
//   - 영상 세그먼트(대용량 바이너리) → CDN으로 307 리다이렉트
//     Amazon IVS CDN은 Access-Control-Allow-Origin: * 를 지원하므로
//     클라이언트가 CDN에서 직접 받아도 CORS 에러 없음 → Vercel 트래픽 절감
//   - m3u8 플레이리스트·썸네일 등 나머지 → 서버에서 직접 중계

function isMediaSegment(targetUrl: string): boolean {
	const pathname = targetUrl.split('?')[0].toLowerCase();
	return pathname.endsWith('.ts') || pathname.endsWith('.m4s') ||
		pathname.endsWith('.cmfv') || pathname.endsWith('.cmfa');
}

export const GET: RequestHandler = async ({ url }) => {
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

	// 세그먼트 요청: CDN으로 직접 리다이렉트 (Vercel 대역폭 절감)
	// - m3u8 플레이리스트, 썸네일 이미지 등은 제외하고 프록시로 처리
	// - 개발 환경에서는 CDN이 localhost CORS를 허용하지 않을 수 있어 직접 프록시
	if (!dev && isMediaSegment(targetUrl)) {
		return new Response(null, {
			status: 307,
			headers: { 'Location': targetUrl }
		});
	}

	// m3u8 플레이리스트: 서버에서 중계 (CORS 우회 필요)
	let res: Response;
	try {
		res = await fetch(targetUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				'Accept': '*/*',
				'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
				'Referer': 'https://ci.me/',
				'Origin': 'https://ci.me'
			}
		});
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		const cause = (e as { cause?: unknown })?.cause;
		const causeMsg = cause instanceof Error ? ` (cause: ${cause.message})` : cause ? ` (cause: ${String(cause)})` : '';
		error(502, `Failed to fetch target URL: ${msg}${causeMsg}`);
	}

	if (!res.ok) {
		error(res.status, 'Upstream error');
	}

	const contentType = res.headers.get('content-type') ?? 'application/vnd.apple.mpegurl';

	return new Response(res.body, {
		status: 200,
		headers: {
			'content-type': contentType,
			'cache-control': 'no-store',
			'cross-origin-resource-policy': 'cross-origin'
		}
	});
};
