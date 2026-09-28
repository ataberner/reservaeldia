// The callable keeps its existing 45s limit. All I/O shares 40s, leaving 5s
// for validation, safe logs, serialization and delivery of a controlled error.
export const DESIGNER_AI_OPERATION_BUDGET_MS = 40_000;
export const DESIGNER_AI_ATTEMPT_TIMEOUT_MS = 25_000;
export const DESIGNER_AI_MIN_ATTEMPT_MS = 1_000;

export class DesignerAiDeadlineError extends Error {
  constructor() { super("Se agotó el tiempo disponible para Diseñador AI."); }
}

export function createDesignerAiDeadline({
  now = () => Date.now(),
  startedAt = now(),
}: { now?: () => number; startedAt?: number } = {}) {
  const remainingMs = () => Math.max(0, startedAt + DESIGNER_AI_OPERATION_BUDGET_MS - now());
  return {
    remainingMs,
    async run<T>(work: (signal: AbortSignal, timeoutMs: number) => Promise<T>, {
      maxMs = DESIGNER_AI_ATTEMPT_TIMEOUT_MS, minimumMs = DESIGNER_AI_MIN_ATTEMPT_MS,
    } = {}): Promise<T> {
      const timeoutMs = Math.min(maxMs, remainingMs());
      if (timeoutMs < minimumMs) throw new DesignerAiDeadlineError();
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const expired = new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new DesignerAiDeadlineError());
            controller.abort();
          }, timeoutMs);
        });
        const result = await Promise.race([Promise.resolve().then(() => work(controller.signal, timeoutMs)), expired]);
        if (remainingMs() <= 0) throw new DesignerAiDeadlineError();
        return result;
      } finally { clearTimeout(timer); }
    },
  };
}

export function designerAiRetryDelay(error: unknown, now: number): number | null {
  const source = error as { status?: number; code?: string; name?: string; headers?: { get?: (name: string) => string | null; [key: string]: unknown } } | null;
  const status = Number(source?.status || 0);
  const code = String(source?.code || "");
  if (["insufficient_quota", "billing_hard_limit_reached"].includes(code)) return null;
  const header = (name: string) => String(source?.headers?.get?.(name) ?? source?.headers?.[name] ?? "");
  if (header("x-should-retry") === "false") return null;
  if (!(error instanceof DesignerAiDeadlineError) && ![408, 409, 429].includes(status) && status < 500 &&
      !/APIConnection|Timeout/i.test(String(source?.name)) && !/timeout|etimedout|econnreset/i.test(code)) return null;
  const millis = Number(header("retry-after-ms"));
  if (Number.isFinite(millis) && millis > 0) return millis;
  const retryAfter = header("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - now;
    if (Number.isFinite(delay) && delay >= 0) return delay;
  }
  return 500 + Math.floor(Math.random() * 250);
}

export function waitDesignerAiRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DesignerAiDeadlineError()); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
