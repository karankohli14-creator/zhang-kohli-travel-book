import { applyCors, createRequestId, isOriginAllowed, sendJson } from '../lib/security.js';

export default function handler(request, response) {
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

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET, OPTIONS');
    return sendJson(response, 405, { error: 'Method not allowed.' }, requestId);
  }

  const configured = {
    apiKey: Boolean(process.env.ELEVENLABS_API_KEY),
    voiceId: Boolean(process.env.ELEVENLABS_VOICE_ID),
    accessKey: Boolean(process.env.KMATE_VOICE_ACCESS_KEY),
  };

  return sendJson(response, 200, {
    ok: true,
    service: 'kmate-voice-api',
    version: '1.0.0',
    ready: Object.values(configured).every(Boolean),
    configured,
  }, requestId);
}
