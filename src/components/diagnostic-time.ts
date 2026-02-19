export function formatRelativeTime(
  timestamp: string | null,
  nowMs: number
): string {
  if (!timestamp) return 'not yet loaded';

  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return timestamp;

  const deltaMs = Math.max(0, nowMs - parsed);
  const seconds = Math.floor(deltaMs / 1000);

  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
