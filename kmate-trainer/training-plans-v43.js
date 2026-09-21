const TP_LOADER_VERSION = '43.0.0';
const partUrls = [1, 2, 3, 4, 5, 6, 7, 8].map((number) => `./training-plans-v43-part${number}.txt?v=${TP_LOADER_VERSION}`);
const responses = await Promise.all(partUrls.map(async (url) => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load ${url}: ${response.status}`);
  return response.text();
}));
const moduleUrl = URL.createObjectURL(new Blob([responses.join('')], { type: 'text/javascript' }));
try {
  await import(moduleUrl);
} finally {
  URL.revokeObjectURL(moduleUrl);
}
