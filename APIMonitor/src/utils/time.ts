export function parseIsoTimestampToMs(iso: string): number {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) { throw new Error(`Invalid ISO timestamp: ${iso}`); }
  return ms;
}

export function isoTimestampFromMs(ms: number): string {
  return new Date(ms).toISOString();
}
