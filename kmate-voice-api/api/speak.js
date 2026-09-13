import {
  applyCors,
  consumeRateLimit,
  createRequestId,
  hasValidAccessKey,
  isOriginAllowed,
  readJsonBody,
  sendJson,
} from '../lib/security.js';

const LIVE_CONTEXTS = new Set(['live-coach', 'hint', 'puzzle', 'move-feedback', 'short']);
const VALID_CONTEXTS = new Set([
  ...LIVE_CONTEXTS,
  'principle',
  'post-game',
  'training-plan',
  'lesson',
  'general',
]);

function cleanText(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function modelForContext(context) {
  if (LIVE_CONTEXTS.has(context)) {
    return process.env.ELEVENLABS_LOW_LATENCY_MODEL_ID || 'eleven_flash_v2_5';
  }
  return process.env.ELEVENLABS_QUALITY_MODEL_ID || 'eleven_multilingual_v2';
}

export default async function handler(request, response) {
  const requestId = createRequestId();
  applyCors(request, response);

  if (!isOriginAllowed(request)) {
    return sendJson(response, 403, { error: 'Origin is not allowed.' }, requestId);
  }

  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.setHeader('X-KMate-Request-Id', requestId);
    return response.end();
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(response, 405, { error: 'Method not allowed.' }, requestId);
  }

  const apiKey = String(process.env.ELEVENLABS_API_KEY || '');
  const voiceId = String(process.env.ELEVENLABS_VOICE_ID || '');
  const accessKey = String(process.env.KMATE_VOICE_ACCESS_KEY || '');
  if (!apiKey || !voiceId || !accessKey) {
    return sendJson(response, 503, { error: 'Voice service is not configured.' }, requestId);
  }

  if (!hasValidAccessKey(request)) {
    return sendJson(response, 401, { error: 'Voice access key is invalid.' }, requestId);
  }

  const rate = consumeRateLimit(request);
  response.setHeader('X-RateLimit-Remaining', String(rate.remaining));
  if (!rate.allowed) {
    response.setHeader('Retry-After', String(rate.retryAfterSeconds));
    return sendJson(response, 429, { error: 'Too many voice requests. Please wait a moment.' }, requestId);
  }

  let body;
  try {
    body = await readJsonBody(request);
  } catch (error) {
    const status = error?.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
    return sendJson(response, status, { error: status === 413 ? 'Request is too large.' : 'Request body must be valid JSON.' }, requestId);
  }

  const text = cleanText(body?.text);
  const context = VALID_CONTEXTS.has(body?.context) ? body.context : 'general';
  if (!text) return sendJson(response, 400, { error: 'Text is required.' }, requestId);
  if (text.length > 1_200) {
    return sendJson(response, 400, { error: 'Text must be 1,200 characters or fewer.' }, requestId);
  }

  const modelId = modelForContext(context);
  const outputFormat = process.env.ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_128';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 28_000);

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          apply_text_normalization: 'auto',
        }),
        signal: controller.signal,
      },
    );

    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 600);
      console.error('ElevenLabs request failed', {
        requestId,
        status: upstream.status,
        context,
        modelId,
        detail,
      });
      return sendJson(response, 502, { error: 'The voice provider could not generate audio.' }, requestId);
    }

    const audio = Buffer.from(await upstream.arrayBuffer());
    response.statusCode = 200;
    response.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg');
    response.setHeader('Content-Length', String(audio.length));
    response.setHeader('Content-Disposition', 'inline; filename="kmate-coach.mp3"');
    response.setHeader('Cache-Control', 'private, no-store, max-age=0');
    response.setHeader('X-KMate-Request-Id', requestId);
    response.setHeader('X-KMate-Voice-Model', modelId);
    return response.end(audio);
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    console.error('K-Mate voice generation failed', {
      requestId,
      timedOut,
      name: error?.name,
      message: error?.message,
    });
    return sendJson(
      response,
      timedOut ? 504 : 500,
      { error: timedOut ? 'Voice generation timed out.' : 'Voice generation failed.' },
      requestId,
    );
  } finally {
    clearTimeout(timeout);
  }
}
