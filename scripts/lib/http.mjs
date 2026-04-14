import { toErrorMessage } from "./source-shared.mjs";

export async function fetchText(url, { headers, requestTimeoutMs, logPrefix = "" }) {
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      if (!response.ok) {
        if (attempt < maxAttempts && [502, 503, 504].includes(response.status)) {
          continue;
        }
        console.warn(`${logPrefix}request failed ${response.status} for ${url}`);
        return null;
      }
      return await response.text();
    } catch (error) {
      if (attempt < maxAttempts) {
        continue;
      }
      console.warn(`${logPrefix}request failed for ${url}: ${toErrorMessage(error)}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

export async function fetchJson(url, options) {
  const text = await fetchText(url, options);
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
