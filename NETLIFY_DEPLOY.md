# HackLab Netlify Deploy

## What changed

- Local development uses the Node API on `http://127.0.0.1:3000`.
- Netlify-hosted builds use the Netlify Function (`netlify/functions/server.js`) which serves the same `/api/*` Express routes backed by Astra DB.
- Netlify publishes from `dist/` so local secrets like `.env`, `Hack_Lab-token.json`, and the `server/` source are not exposed in static hosting.

## Netlify settings

- Build command: `npm run build`
- Publish directory: `dist`

`netlify.toml` already contains these settings.

## Astra + Netlify function checklist

Set these Netlify environment variables in Site settings → Environment variables:

1. `ASTRA_DB_APPLICATION_TOKEN`
2. `ASTRA_DB_ID`
3. `ASTRA_DB_KEYSPACE`
4. `ASTRA_DB_SECURE_BUNDLE_PATH` (for this repo use `secure-connect-hack-lab.zip`)

`netlify.toml` already includes:

- `included_files = ["secure-connect-hack-lab.zip", "server/data/local-store.json"]`
- Redirect rule `/api/* -> /.netlify/functions/server/api/:splat`

The build script also writes `dist/_redirects` with the same API rewrite as a safety fallback.

## Firebase auth checklist

Open Firebase Console for `hacklab-70033`:

1. Go to `Authentication`
2. Open `Settings`
3. Add `davhacklab.netlify.app` to `Authorized domains`

Without that, Google/Apple/email auth on the hosted site will fail with `auth/unauthorized-domain`.

## Data vs auth in production

- **Astra DB** — all portal data (content, community, projects, profiles, collaboration) via `/api/*` Netlify Function
- **Firebase** — authentication only + `teachers` email allowlist for teacher dashboard routing (not portal data)

## Drag-and-drop folder (Astra)

From project root:

```bash
npm run build:folder
```

Open `netlify-folder/README-FIRST.txt`. Use **DEPLOY.bat** or `netlify deploy --prod` from that folder. Plain drag-and-drop does not deploy serverless functions.

## Firebase usage in production

Firebase paths used:

- `teachers` (email allowlist for teacher dashboard routing only; not written by the app)

## Deploy flow

**Full step-by-step:** see **[GITHUB_DEPLOY.md](./GITHUB_DEPLOY.md)** (GitHub + Netlify, recommended).

1. Push the **full repo** to GitHub (must include `build.mjs`, `netlify/`, `server/`, `package.json` — not only `dist/`)
2. Connect it to Netlify
3. Deploy with the included `netlify.toml`
4. Add `davhacklab.netlify.app` in Firebase Auth authorized domains
5. Set Astra environment variables and confirm Function logs show successful Astra connection
