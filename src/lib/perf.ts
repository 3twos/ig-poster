const isDev = process.env.NODE_ENV !== "production";

export function perfMark(label: string): void {
  if (!isDev) return;
  performance.mark(label);
}

export function perfMeasure(label: string, startMark: string): void {
  if (!isDev) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const measureResult = performance.measure(label, startMark) as any;
    const duration: number | undefined =
      measureResult?.duration ??
      performance.getEntriesByName(label).at(-1)?.duration;
    if (duration != null) {
      console.log(`[perf] ${label}: ${Math.round(duration)}ms`);
    }
  } catch {
    // marks may have been cleared already or measure() is unsupported
    const fallback = performance.getEntriesByName(label).at(-1)?.duration;
    if (fallback != null) {
      console.log(`[perf] ${label}: ${Math.round(fallback)}ms`);
    }
  } finally {
    performance.clearMarks(startMark);
    performance.clearMeasures(label);
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
