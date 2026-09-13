import { randomUUID, timingSafeEqual } from 'node:crypto';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://karankohli14-creator.github.io',
  'http://localhost:3000',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

const rateBuckets = globalThis.__KMATE_VOICE_RATE_BUCKETS__ || new Map();
globalThis.__KMATE_VOICE_RATE_BUCKETS__ = rateBuckets;

function header(request, name) {
  const value = request?.headers?.[name] ?? request?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function allowedOrigins() {
  const configured = String(process.env.KMATE_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

export function createRequestId() {
  return randomUUID();
}

export function isOriginAllowed(request) {
  const origin = String(header(request, 'origin') || '').trim();
  // Command-line and server-to-server requests do not include Origin. They
  // still need the private access key before speech can be generated.
  return !origin || allowedOrigins().has(origin);
}

export function applyCors(request, response) {
  const origin = String(header(request, 'origin') || '').trim();
  if (origin && allowedOrigins().has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-KMate-Voice-Key');
  response.setHeader('Access-Control-Expose-Headers', 'X-KMate-Request-Id, X-KMate-Voice-Model');
  response.setHeader('Access-Control-Max-Age', '86400');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}

function constantTimeEqual(first, second) {
  const a = Buffer.from(String(first || ''));
  const b = Buffer.from(String(second || ''));
  if (!a.length || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function hasValidAccessKey(request) {
  const expected = String(process.env.KMATE_VOICE_ACCESS_KEY || '');
  const received = String(header(request, 'x-kmate-voice-key') || '');
  return constantTimeEqual(received, expected);
}

function clientAddress(request) {
  const forwarded = String(header(request, 'x-forwarded-for') || '').split(',')[0].trim();
  return forwarded || String(header(request, 'x-real-ip') || 'unknown');
}

export function consumeRateLimit(request) {
  const now = Date.now();
  const windowMs = 60_000;
  const maximum = Math.max(1, Math.min(60, Number(process.env.KMATE_VOICE_REQUESTS_PER_MINUTE) || 12));
  const key = clientAddress(request);
  let bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= windowMs) {
    bucket = { startedAt: now, count: 0 };
    rateBuckets.set(key, bucket);
  }
  bucket.count += 1;

  // Avoid retaining an unbounded number of stale serverless-instance entries.
  if (rateBuckets.size > 2_000) {
    for (const [address, value] of rateBuckets.entries()) {
      if (now - value.startedAt >= windowMs * 2) rateBuckets.delete(address);
    }
  }

  return {
    allowed: bucket.count <= maximum,
    remaining: Math.max(0, maximum - bucket.count),
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.startedAt + windowMs - now) / 1000)),
  };
}

export async function readJsonBody(request, maximumBytes = 20_000) {
  if (request.body && typeof request.body === 'object' && !Buffer.isBuffer(request.body)) {
    return request.body;
  }
  if (typeof request.body === 'string') {
    if (Buffer.byteLength(request.body, 'utf8') > maximumBytes) throw new Error('PAYLOAD_TOO_LARGE');
    return JSON.parse(request.body || '{}');
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumBytes) throw new Error('PAYLOAD_TOO_LARGE');
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(raw || '{}');
}

export function sendJson(response, statusCode, payload, requestId = null) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  if (requestId) response.setHeader('X-KMate-Request-Id', requestId);
  response.end(JSON.stringify(payload));
}
