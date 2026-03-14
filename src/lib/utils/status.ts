export function statusColor(status?: string): string {
  if (status === 'completed') return '#4ade80';
  if (status === 'failed') return '#f87171';
  if (status === 'processing') return '#facc15';
  if (status === 'pending') return '#888888';
  return '#888888';
}

export function statusLabel(status?: string): string {
  if (status === 'completed') return '✅ 완료';
  if (status === 'failed') return '❌ 실패';
  if (status === 'processing') return '⏳ 처리중';
  if (status === 'pending') return '🕐 대기중';
  return '🕐 대기중';
}
