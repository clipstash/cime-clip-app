import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

interface YtDlpInfo {
	title?: string;
	duration?: number;
	thumbnail?: string;
	manifest_url?: string;
	is_live?: boolean;
	live_status?: string;
	formats?: Array<{ protocol?: string; manifest_url?: string; url?: string }>;
}

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

function extractM3u8Url(info: YtDlpInfo): string | null {
	if (info.manifest_url) return info.manifest_url;
	const m3u8Format = info.formats?.find((f) =>
		['m3u8', 'm3u8_native'].includes(f.protocol ?? '')
	);
	return m3u8Format?.manifest_url ?? m3u8Format?.url ?? null;
}

async function getInfoViaScraping(url: string): Promise<YtDlpInfo> {
	const res = await fetch(url, {
		headers: { 'User-Agent': 'Mozilla/5.0' }
	});
	const html = await res.text();

	const titleMatch =
		html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/) ??
		html.match(/<title>([^<]+)<\/title>/);
	const thumbnailMatch = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/);

	const liveM3u8Match = html.match(
		/playback\.live-video\.net\/api\/video\/v1\/[^\s"']+\.m3u8[^\s"']*/
	);
	const vodM3u8Match = html.match(/ivs\/v1\/[^\s"']+\/media\/hls\/master\.m3u8[^\s"']*/);
	const rawM3u8 = liveM3u8Match?.[0] ?? vodM3u8Match?.[0] ?? null;
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

export const GET: RequestHandler = async ({ url }) => {
	const targetUrl = url.searchParams.get('url');
	if (!targetUrl) {
		error(400, 'Missing url parameter');
	}

	const isCime = /ci\.?me|cime/i.test(targetUrl);

	try {
		let info: YtDlpInfo;

		if (isCime) {
			info = await getInfoViaScraping(targetUrl);
			if (!info.manifest_url) {
				info = await getInfoViaYtDlp(targetUrl);
			}
		} else {
			info = await getInfoViaYtDlp(targetUrl);
		}

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
