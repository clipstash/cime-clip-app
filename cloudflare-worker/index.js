/**
 * Cloudflare Worker — CORS 패스스루 프록시
 *
 * 역할: 브라우저가 직접 접근할 수 없는 외부 스트림 세그먼트 URL을
 *       CORS 헤더를 붙여 그대로 중계 (재인코딩·버퍼링 없음).
 *
 * 배포: wrangler deploy
 * 경로: GET https://<worker>.workers.dev/?url=<인코딩된_외부_URL>
 */

export default {
  async fetch(request) {
    // ── CORS 사전 요청 ──────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // ── URL 파라미터 검증 ───────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get('url');
    if (!targetUrl) {
      return new Response('Missing url parameter', { status: 400, headers: corsHeaders() });
    }

    // ── 업스트림 요청 (브라우저 위장) ──────────────────────────────
    let upstream;
    try {
      upstream = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: '*/*',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          Referer: 'https://ci.me/',
          Origin: 'https://ci.me'
        }
      });
    } catch (e) {
      return new Response(`Failed to fetch: ${e.message}`, {
        status: 502,
        headers: corsHeaders()
      });
    }

    if (!upstream.ok) {
      return new Response('Upstream error', {
        status: upstream.status,
        headers: corsHeaders()
      });
    }

    // ── 스트리밍 패스스루 (버퍼 없이 ReadableStream 그대로 전달) ───
    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...corsHeaders(),
        'Content-Type': contentType,
        'Cache-Control': 'no-store'
      }
    });
  }
};

// SharedArrayBuffer(ffmpeg.wasm)를 위한 CORS + CORP 헤더
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin'
  };
}
