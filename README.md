# HackLab

Student innovation community — learn, build, and collaborate.

## Stack

| Layer    | Service                                                   |
| -------- | --------------------------------------------------------- |
| Frontend | GitHub Pages                                              |
| Database | [DataStax Astra](https://astra.datastax.com) via Node API |
| Auth     | Firebase Authentication                                   |

## Local development

```bash
npm install
cp .env.example .env   # add your Astra + Firebase values
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000)

## Production deploy (GitHub + Astra)

See **[GITHUB_DEPLOY.md](./GITHUB_DEPLOY.md)** for the full guide (GitHub Pages + Render API).

Quick summary:

1. Push this repo to GitHub
2. Deploy API with **Render** (`render.yaml`)
3. Set GitHub secret `HACKLAB_API_URL` to your Render URL
4. Enable **GitHub Pages** from Actions

## Scripts

| Command                | Purpose                          |
| ---------------------- | -------------------------------- |
| `npm run dev`          | Local server + Astra             |
| `npm run build`        | Build `dist/` for GitHub Pages   |
| `npm run build:folder` | Legacy Netlify folder (optional) |
