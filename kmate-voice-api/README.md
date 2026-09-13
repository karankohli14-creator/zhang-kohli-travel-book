# K-Mate Voice API v1

This standalone Vercel project keeps the ElevenLabs API key and cloned-voice ID off the public K-Mate website. The browser sends approved coaching text to `/api/speak`; the function calls ElevenLabs on the server and returns MP3 audio.

## Endpoints

- `GET /api/health` — reports whether the required variables are configured, without revealing their values.
- `POST /api/speak` — generates speech. Requires `X-KMate-Voice-Key` and an allowed browser origin.

Example request body:

```json
{
  "text": "Before moving, compare your opponent's checks, captures, and threats.",
  "context": "principle"
}
```

Recognized contexts are `live-coach`, `hint`, `puzzle`, `move-feedback`, `principle`, `post-game`, `training-plan`, `lesson`, `short`, and `general`. Short interactive contexts use Eleven Flash v2.5 by default; longer coaching uses Multilingual v2.

## Deploy in Vercel

1. In Vercel choose **Add New → Project**.
2. Import `karankohli14-creator/zhang-kohli-travel-book` from GitHub.
3. Set **Root Directory** to `kmate-voice-api`.
4. Leave the framework preset as **Other**.
5. Add the environment variables below for Production, Preview, and Development.
6. Deploy.

Required variables:

- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`
- `KMATE_VOICE_ACCESS_KEY` — generate a private random value of at least 32 characters. It is not the ElevenLabs key.

Recommended variable:

- `KMATE_ALLOWED_ORIGINS=https://karankohli14-creator.github.io,http://localhost:4173,http://127.0.0.1:4173`

Optional variables are documented in `.env.example`.

After deployment, open `/api/health`. A ready service returns JSON containing `"ready": true`. Never paste real secret values into GitHub, browser JavaScript, screenshots, or chat.

## Security included in v1

- Server-only ElevenLabs credentials
- Browser-origin allowlist
- A separate private K-Mate access key
- Constant-time access-key comparison
- Text length and request-body limits
- Basic per-IP rate limiting
- No caching of generated audio
- Generic provider errors that do not expose credentials

The in-memory rate limiter is intentionally a basic beta safeguard. A commercial public launch should replace it with durable distributed rate limiting and user authentication.
