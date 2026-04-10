import type { RequestHandler } from '@sveltejs/kit';

const pages = [
	{ path: '/', changefreq: 'weekly', priority: '1.0' }
];

export const GET: RequestHandler = ({ url }) => {
	const origin = url.origin;
	const urls = pages
		.map(
			({ path, changefreq, priority }) => `
  <url>
    <loc>${origin}${path}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
		)
		.join('');

	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}
</urlset>`;

	return new Response(xml, {
		headers: {
			'Content-Type': 'application/xml',
			'Cache-Control': 'max-age=3600'
		}
	});
};
