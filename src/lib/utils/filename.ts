/**
 * 파일명 베이스 생성: [스트리머] 제목_YYYYMMDD
 * 파일시스템 금지 문자는 _로 치환
 */
export function makeBaseName(title: string | null, streamer: string | null): string {
	const d = new Date();
	const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
	const raw = streamer
		? `[${streamer}] ${title ?? 'clip'}_${dateStr}`
		: `${title ?? 'clip'}_${dateStr}`;
	return raw.replace(/[\\/:*?"<>|]/g, '_');
}
