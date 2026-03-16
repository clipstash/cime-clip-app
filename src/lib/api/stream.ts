import { API_URL } from './config';

export type StreamInfo = {
  m3u8_url: string | null;
  title: string | null;
  thumbnail: string | null;
};

export async function getStreamInfo(url: string): Promise<StreamInfo> {
  const res = await fetch(`${API_URL}/stream-info?url=${encodeURIComponent(url)}`);
  if (!res.ok) return { m3u8_url: null, title: null, thumbnail: null };
  return res.json();
}

export async function parseM3u8(m3u8Url: string): Promise<string[]> {
  const proxyUrl = `${API_URL}/proxy?url=${encodeURIComponent(m3u8Url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) return [];
  const text = await res.text();
  const base = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => (line.startsWith('http') ? line : base + line));
}
