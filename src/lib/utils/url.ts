export function localUrl(u?: string | null): string {
  return u ? u.replace(/^https?:\/\/localhost:\d+/, '') : '';
}
