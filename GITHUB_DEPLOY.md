# HackLab on GitHub (Pages + Astra)

GitHub **Pages** hosts the website (HTML/CSS/JS).  
GitHub cannot run the Astra database driver — the **API** runs on **Render** (free tier) from the **same repo**.  
**Firebase** is used for **login only**.

```
Browser → GitHub Pages (frontend)
       → Render API /api/* (Astra DB)
       → Firebase Auth (sign-in)
```

---

## 1. Push code to GitHub

Use a **private** repo if you commit `secure-connect-hack-lab.zip`.

Required in the repo:

- `build.mjs`, `package.json`, `package-lock.json`
- All `.html`, `.css`, `.js` at project root
- `server/` (Astra API)
- `render.yaml`
- `.github/workflows/deploy-github-pages.yml`
- `secure-connect-hack-lab.zip` (for Render)

Never commit: `.env`, `Hack_Lab-token.json`

---

## 2. Deploy the Astra API on Render

1. Go to [https://render.com](https://render.com) and sign in with **GitHub**.
2. **New** → **Blueprint** → select your `davhacklab` repo (uses `render.yaml`).
3. Set environment variables when prompted (same values as your local `.env`):

   | Key                          | Value            |
   | ---------------------------- | ---------------- |
   | `ASTRA_DB_APPLICATION_TOKEN` | your token       |
   | `ASTRA_DB_ID`                | your database id |
   | `ASTRA_DB_KEYSPACE`          | e.g. `hacklab`   |

4. Wait until deploy is **Live**.
5. Copy the service URL, e.g. `https://hacklab-api.onrender.com`
6. Test: `https://hacklab-api.onrender.com/api/health` → `"ok": true`

---

## 3. Enable GitHub Pages

1. GitHub repo → **Settings** → **Pages**
2. **Build and deployment** → Source: **GitHub Actions**
3. Repo → **Settings** → **Secrets and variables** → **Actions**

### Secret (required for Astra on Pages)

| Name              | Value                                                                   |
| ----------------- | ----------------------------------------------------------------------- |
| `HACKLAB_API_URL` | `https://hacklab-api.onrender.com` (your Render URL, no trailing slash) |

### Variable (only if using project Pages URL)

If your site is `https://USER.github.io/REPO_NAME/` (not a user root site):

| Name                 | Value                             |
| -------------------- | --------------------------------- |
| `HACKLAB_PAGES_BASE` | `/REPO_NAME` (e.g. `/davhacklab`) |

If your site is `https://USER.github.io/` leave this empty.

4. Push to `main` — workflow **Deploy GitHub Pages** runs automatically.

---

## 4. Firebase (auth only)

Firebase Console → **Authentication** → **Settings** → **Authorized domains**

Add:

- `YOUR_USERNAME.github.io`
- `hacklab-api.onrender.com` is not needed for Auth

Teachers list: Realtime Database path `teachers` (emails only).

---

## 5. Verify

1. `https://YOUR-API.onrender.com/api/health` — Astra OK
2. `https://YOUR_USERNAME.github.io/...` — site loads
3. Login works
4. Dashboard / community show data (from Astra via API)

Open browser DevTools → Network → requests should go to **Render** `/api/bootstrap`, not Firebase for posts.

---

## 6. Day-to-day updates

```bash
git add .
git commit -m "Your change"
git push
```

- GitHub Actions redeploys Pages
- Render redeploys API (if `server/` changed)

---

## Local development (unchanged)

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000` — uses local API + Astra from `.env`.

---

## Troubleshooting

| Issue                     | Fix                                                     |
| ------------------------- | ------------------------------------------------------- |
| Site loads, no data       | Set `HACKLAB_API_URL` secret; redeploy Pages workflow   |
| API health fails          | Render env vars + `secure-connect-hack-lab.zip` in repo |
| CORS errors               | Server allows `*`; ensure API URL is correct in secret  |
| Login unauthorized domain | Add `*.github.io` in Firebase Authorized domains        |
| 404 on assets             | Set `HACKLAB_PAGES_BASE` to `/your-repo-name`           |

---

## Why not Netlify?

This setup uses **GitHub Pages** for the site and **Render** for Astra. Netlify is optional and not required.
