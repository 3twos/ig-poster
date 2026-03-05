const isDev = process.env.NODE_ENV !== "production";

export function perfMark(label: string): void {
  if (!isDev) return;
  performance.mark(label);
}

export function perfMeasure(label: string, startMark: string): void {
  if (!isDev) return;
  try {
    const entry = performance.measure(label, startMark);
    console.log(`[perf] ${label}: ${Math.round(entry.duration)}ms`);
    performance.clearMarks(startMark);
    performance.clearMeasures(label);
  } catch {
    // marks may have been cleared already
  }
}

export async function withPerf<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (!isDev) return fn();
  const start = `${label}:start`;
  performance.mark(start);
  try {
    return await fn();
  } finally {
    perfMeasure(label, start);
  }
}

export function withPerfSync<T>(label: string, fn: () => T): T {
  if (!isDev) return fn();
  const start = `${label}:start`;
  performance.mark(start);
  try {
    return fn();
  } finally {
    perfMeasure(label, start);
  }
}
