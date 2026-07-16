// Cache mémoire TTL + wrappers fetch fail-soft.
// En prod multi-instances, remplacer l'implémentation par Redis derrière la même interface.

interface Entry<T> {
  value: T;
  expires: number;
}

// Survit au HMR de Next en dev via globalThis.
const store: Map<string, Entry<unknown>> =
  (globalThis as { __faCache?: Map<string, Entry<unknown>> }).__faCache ??
  new Map();
(globalThis as { __faCache?: Map<string, Entry<unknown>> }).__faCache = store;

/** Récupère du cache ou calcule via `producer`, avec TTL en secondes. */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  producer: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expires > now) return hit.value;
  const value = await producer();
  store.set(key, { value, expires: now + ttlSeconds * 1000 });
  return value;
}

const DEFAULT_TIMEOUT_MS = 12_000;

/** fetch avec timeout. Lève en cas d'échec (à capter en amont). */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Combine un éventuel signal externe avec le timeout.
  const externalSignal = init.signal;
  if (externalSignal) {
    externalSignal.addEventListener("abort", () => controller.abort(), {
      once: true,
    });
  }
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": "FranceAlert/0.1 (public safety information)",
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** GET JSON avec timeout ; lève si non-2xx. `timeoutMs` pour les serveurs lents. */
export async function fetchJson<T = unknown>(
  url: string,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<T> {
  const res = await fetchWithTimeout(url, init, timeoutMs);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} pour ${url}`);
  }
  return (await res.json()) as T;
}

/** GET texte avec timeout ; lève si non-2xx (CSV FIRMS, etc.). */
export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetchWithTimeout(url, init);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} pour ${url}`);
  }
  return await res.text();
}
