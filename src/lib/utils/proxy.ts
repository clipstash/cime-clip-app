// CF Worker URL은 PUBLIC_CF_PROXY_URL 환경변수로 지정.
// 없으면 Vercel 서버 라우트(/stream/proxy)로 폴백.
import * as publicEnv from "$env/static/public";

const CF_PROXY_BASE: string =
	(publicEnv as Record<string, string>).PUBLIC_CF_PROXY_URL || "/stream/proxy";

/** 외부 스트림 URL을 프록시 경유 URL로 변환 */
export function proxyUrl(targetUrl: string): string {
	return `${CF_PROXY_BASE}?url=${encodeURIComponent(targetUrl)}`;
}
