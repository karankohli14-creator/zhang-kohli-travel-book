const KM42_LOADER_VERSION = '42.0.0';
const partUrls = [1, 2, 3, 4, 5].map((number) => `./personalization-v42-part${number}.txt?v=${KM42_LOADER_VERSION}`);
const responses = await Promise.all(partUrls.map(async (url) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load ${url}: ${response.status}`);
  return response.text();
}));
// The assembled implementation runs from a blob URL. Resolve its content
// assets against the real K-Mate page rather than the temporary blob origin.
responses[0] = responses[0].replace(
  "const KM42_BASE_URL = new URL('./', import.meta.url);",
  "const KM42_BASE_URL = new URL('./', window.location.href);",
);
const moduleUrl = URL.createObjectURL(new Blob([responses.join('')], { type: 'text/javascript' }));
try {
  await import(moduleUrl);
} finally {
  URL.revokeObjectURL(moduleUrl);
}
