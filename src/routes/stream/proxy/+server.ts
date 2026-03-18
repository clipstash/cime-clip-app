import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

// ── 스트림 프록시 엔드포인트 ──────────────────────────────────────
// 클라이언트가 직접 접근할 수 없는 외부 스트림 URL을 서버에서 중계
// CORS 우회 및 User-Agent 위장 목적으로 사용
// GET /stream/proxy?url=<외부_URL>
export const GET: RequestHandler = async ({ url }) => {
	// 쿼리 파라미터에서 대상 URL 추출
	const targetUrl = url.searchParams.get('url');
	if (!targetUrl) {
		error(400, 'Missing url parameter');
	}

	// 외부 URL 요청 (브라우저로 위장)
	let res: Response;
	try {
		res = await fetch(targetUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0'
			}
		});
	} catch (e) {
		error(502, 'Failed to fetch target URL');
	}

	// 업스트림 오류 처리
	if (!res.ok) {
		error(res.status, 'Upstream error');
	}

	// 원본 Content-Type 유지, 캐시 비활성화 후 응답
	const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
	const body = await res.arrayBuffer();

	return new Response(body, {
		status: 200,
		headers: {
			'content-type': contentType,
			'cache-control': 'no-store'
		}
	});
};
