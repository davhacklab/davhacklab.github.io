import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.join(ROOT_DIR, "dist");
const FOLDER_DIR = path.join(ROOT_DIR, "netlify-folder");

const HACKLAB_CONFIG_SNIPPET = `<script>window.HACKLAB_DATA_MODE="api";</script>`;

const COPY_FILES = [
    "netlify.toml",
    "package.json",
    "package-lock.json",
    "app-defaults.js",
    "build.mjs"
];

const COPY_DIRS = ["netlify", "server", "images"];

const NETLIFY_TOML = `[build]
command = "echo Pre-built — static files already in this folder"
publish = "."

[functions]
directory = "netlify/functions"
included_files = ["secure-connect-hack-lab.zip", "server/data/local-store.json"]

[[redirects]]
from = "/api/*"
to = "/.netlify/functions/server/api/:splat"
status = 200
force = true

[[headers]]
for = "/*"

[headers.values]
X-Content-Type-Options = "nosniff"
Referrer-Policy = "strict-origin-when-cross-origin"
X-Frame-Options = "SAMEORIGIN"

[[headers]]
for = "/*.html"

[headers.values]
Cache-Control = "public, max-age=0, must-revalidate"

[[headers]]
for = "/*.js"

[headers.values]
Cache-Control = "public, max-age=0, must-revalidate"

[[headers]]
for = "/*.css"

[headers.values]
Cache-Control = "public, max-age=0, must-revalidate"

[[headers]]
for = "/images/*"

[headers.values]
Cache-Control = "public, max-age=31536000, immutable"
`;

const README = `HackLab — Netlify deploy (Astra database + Firebase auth only)
================================================================

DATA: Astra DB via /api (Netlify Function)
AUTH: Firebase Authentication only (login / signup / teachers list)

IMPORTANT — DRAG-AND-DROP ALONE DOES NOT START ASTRA
----------------------------------------------------
Netlify drag deploy only uploads static files. The Astra API needs the
serverless function in netlify/functions/.

Use ONE of these methods:

METHOD 1 — Netlify CLI (fastest from this folder)
-------------------------------------------------
1. Install: npm install -g netlify-cli
2. Open terminal IN THIS FOLDER (netlify-folder)
3. netlify login
4. netlify link          (first time only — pick your site)
5. Double-click DEPLOY.bat   OR run:  netlify deploy --prod

METHOD 2 — GitHub + Netlify (best long-term)
--------------------------------------------
Push the main project repo (not only this folder) to GitHub.
Netlify build: npm run build
Publish: dist
Set env vars below on Netlify.

BEFORE DEPLOY — NETLIFY ENVIRONMENT VARIABLES
---------------------------------------------
Site settings → Environment variables → add ALL of:

  ASTRA_DB_APPLICATION_TOKEN   (your Astra token)
  ASTRA_DB_ID                  (your database id)
  ASTRA_DB_KEYSPACE            (e.g. hacklab)
  ASTRA_DB_SECURE_BUNDLE_PATH  = secure-connect-hack-lab.zip

Copy secure-connect-hack-lab.zip into THIS folder before deploying
(if it is not already here).

FIREBASE (auth only)
--------------------
Firebase Console → Authentication → Authorized domains
Add: YOUR-SITE.netlify.app

Teachers: Firebase RTDB path "teachers" (email allowlist only).
Portal data is NOT stored in Firebase — it lives in Astra.

AFTER DEPLOY — TEST
-------------------
https://YOUR-SITE.netlify.app/api/health
Should return JSON: { "ok": true, "storage": { ... } }

If you see 404, the function did not deploy — use METHOD 1 or 2 above.

DO NOT UPLOAD
-------------
.env
Hack_Lab-token.json
node_modules (Netlify installs on build)
`;

const DEPLOY_BAT = `@echo off
cd /d "%~dp0"
echo.
echo HackLab — deploying site + Astra API to Netlify...
echo.
netlify deploy --prod --dir=. --functions=netlify/functions
echo.
pause
`;

async function pathExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

function runCommand(command, args, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            stdio: "inherit",
            shell: process.platform === "win32"
        });

        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`${command} exited with code ${code}`));
        });
    });
}

async function copyFileIfExists(sourceRelative, targetRelative = sourceRelative) {
    const sourcePath = path.join(ROOT_DIR, sourceRelative);
    const targetPath = path.join(FOLDER_DIR, targetRelative);

    if (!(await pathExists(sourcePath))) {
        return false;
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
    return true;
}

async function copyDirectoryRecursive(sourceRelative, targetRelative = sourceRelative) {
    const sourcePath = path.join(ROOT_DIR, sourceRelative);
    const targetPath = path.join(FOLDER_DIR, targetRelative);

    if (!(await pathExists(sourcePath))) {
        return;
    }

    await fs.mkdir(targetPath, { recursive: true });
    const entries = await fs.readdir(sourcePath, { withFileTypes: true });

    await Promise.all(entries.map(async (entry) => {
        const nextSource = path.join(sourcePath, entry.name);
        const nextTarget = path.join(targetPath, entry.name);

        if (entry.isDirectory()) {
            await copyDirectoryRecursive(
                path.relative(ROOT_DIR, nextSource),
                path.relative(FOLDER_DIR, nextTarget)
            );
            return;
        }

        await fs.copyFile(nextSource, nextTarget);
    }));
}

async function copyDistToFolderRoot() {
    const entries = await fs.readdir(DIST_DIR, { withFileTypes: true });

    await Promise.all(entries.map(async (entry) => {
        const sourcePath = path.join(DIST_DIR, entry.name);
        const targetPath = path.join(FOLDER_DIR, entry.name);

        if (entry.isDirectory()) {
            await fs.cp(sourcePath, targetPath, { recursive: true });
            return;
        }

        await fs.copyFile(sourcePath, targetPath);
    }));
}

async function injectConfigIntoHtmlFiles() {
    const entries = await fs.readdir(FOLDER_DIR, { withFileTypes: true });

    await Promise.all(entries.map(async (entry) => {
        if (!entry.isFile() || !entry.name.endsWith(".html")) {
            return;
        }

        const filePath = path.join(FOLDER_DIR, entry.name);
        let html = await fs.readFile(filePath, "utf8");

        html = html.replace(
            /<script>window\.HACKLAB_DATA_MODE="firebase";<\/script>\s*/gi,
            ""
        );

        if (html.includes('HACKLAB_DATA_MODE="api"')) {
            return;
        }

        if (html.includes("</head>")) {
            html = html.replace("</head>", `  ${HACKLAB_CONFIG_SNIPPET}\n</head>`);
        } else {
            html = `${HACKLAB_CONFIG_SNIPPET}\n${html}`;
        }

        await fs.writeFile(filePath, html, "utf8");
    }));
}

async function main() {
    console.log("Building static site...");
    await runCommand("npm", ["run", "build"], ROOT_DIR);

    console.log("Creating netlify-folder/ (Astra + Firebase auth)...");
    await fs.rm(FOLDER_DIR, { recursive: true, force: true });
    await fs.mkdir(FOLDER_DIR, { recursive: true });

    await copyDistToFolderRoot();

    for (const fileName of COPY_FILES) {
        await copyFileIfExists(fileName);
    }

    for (const dirName of COPY_DIRS) {
        await copyDirectoryRecursive(dirName);
    }

    const bundleCopied = await copyFileIfExists("secure-connect-hack-lab.zip");

    await fs.writeFile(path.join(FOLDER_DIR, "netlify.toml"), `${NETLIFY_TOML.trim()}\n`, "utf8");
    await injectConfigIntoHtmlFiles();
    await fs.writeFile(path.join(FOLDER_DIR, "README-FIRST.txt"), README, "utf8");
    await fs.writeFile(path.join(FOLDER_DIR, "DEPLOY.bat"), DEPLOY_BAT, "utf8");

    console.log("");
    console.log("netlify-folder is ready:");
    console.log(`  ${FOLDER_DIR}`);
    console.log("");
    console.log("Astra data + Firebase auth only.");
    console.log("Run DEPLOY.bat (Netlify CLI) — drag alone will NOT run Astra.");
    if (!bundleCopied) {
        console.log("");
        console.log("Copy secure-connect-hack-lab.zip into netlify-folder/ before deploy.");
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
