/**
 * Wrapper around fetch with a default timeout.
 * Prevents hanging requests to external services from blocking the server.
 */
export function fetchWithTimeout(
  url: string | URL,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const { timeoutMs = 10000, ...fetchInit } = init ?? {};
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, { ...fetchInit, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}
