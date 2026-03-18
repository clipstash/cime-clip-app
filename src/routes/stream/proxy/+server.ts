import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url }) => {
	const targetUrl = url.searchParams.get('url');
	if (!targetUrl) {
		error(400, 'Missing url parameter');
	}

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

	if (!res.ok) {
		error(res.status, 'Upstream error');
	}

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
