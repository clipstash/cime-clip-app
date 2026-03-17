export function localUrl(u?: string | null): string {
  if (!u) return '';
  if (u.startsWith('blob:')) return u;
  return u.replace(/^https?:\/\/localhost:\d+/, '');
}
