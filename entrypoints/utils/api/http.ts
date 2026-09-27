const API_BASE = 'https://api.momentum-mod.org/v1';

const RATE_LIMIT = {
  short: { max: 8, window: 1_000 },
  long: { max: 120, window: 60_000 },
};

const MAX_RETRIES = 5;

export class HttpError extends Error {
  constructor(
    readonly status: number,
    path: string,
    readonly retryAfter?: number,
  ) {
    super(`${status} ${path}`);
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : Math.max(0, timestamp - Date.now());
}

async function request<T>(
  path: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new HttpError(
      response.status,
      url.pathname,
      parseRetryAfter(response.headers.get('retry-after')),
    );
  }
  return response.json() as Promise<T>;
}

const requestTimes: number[] = [];
let pauseUntil = 0;
let backoff = 0;

export const isRateLimited = (): boolean => Date.now() < pauseUntil;

function waitTime(now: number): number {
  while (requestTimes.length > 0 && now - requestTimes[0]! >= RATE_LIMIT.long.window) {
    requestTimes.shift();
  }

  let wait = 0;
  if (requestTimes.length >= RATE_LIMIT.long.max) {
    wait = requestTimes[requestTimes.length - RATE_LIMIT.long.max]! + RATE_LIMIT.long.window - now;
  }

  const recent = requestTimes.filter((time) => now - time < RATE_LIMIT.short.window);
  if (recent.length >= RATE_LIMIT.short.max) {
    wait = Math.max(wait, recent[recent.length - RATE_LIMIT.short.max]! + RATE_LIMIT.short.window - now);
  }
  return wait;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

async function reserveRequest(signal?: AbortSignal): Promise<void> {
  while (!signal?.aborted) {
    const now = Date.now();
    const wait = Math.max(pauseUntil - now, waitTime(now));
    if (wait <= 0) {
      requestTimes.push(now);
      return;
    }
    await delay(wait + 10, signal);
  }
}

export async function fetchLimited<T>(
  path: string,
  params: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await reserveRequest(signal);
    signal?.throwIfAborted();

    try {
      const result = await request<T>(path, params, signal);
      backoff = 0;
      return result;
    } catch (error) {
      if (error instanceof HttpError && error.status === 429 && attempt < MAX_RETRIES) {
        backoff = backoff ? Math.min(backoff * 2, 60_000) : 15_000;
        pauseUntil = Date.now() + Math.max(error.retryAfter ?? 0, backoff);
        continue;
      }
      throw error;
    }
  }
}
