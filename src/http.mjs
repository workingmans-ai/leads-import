const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function requestJSON(
  url,
  options = {},
  { retries = 5, baseDelayMs = 400 } = {}
) {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, options);

    if (res.status === 429 || res.status >= 500) {
      if (i === retries) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} after ${retries} retries: ${text}`);
      }
      await sleep(baseDelayMs * 2 ** i);
      continue;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return res.json();
  }
}
