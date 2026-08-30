import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const UPLOAD_DIR = path.join(ROOT_DIR, "netlify-upload");

const ROOT_FILE_EXTENSIONS = new Set([".html", ".css", ".js"]);
const COPY_FILES = [
    "netlify.toml",
    "package.json",
    "package-lock.json",
    "app-defaults.js",
    "build.mjs",
    "NETLIFY_DEPLOY.md"
];
const COPY_DIRS = ["netlify", "server", "images", "scripts"];
const SKIP_DIR_NAMES = new Set([
    "node_modules",
    "dist",
    "netlify-upload",
    ".git",
    "refined"
]);

async function pathExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true;
    } catch {
        return false;
    }
}

async function copyFileIfExists(sourceRelative, targetRelative = sourceRelative) {
    const sourcePath = path.join(ROOT_DIR, sourceRelative);
    const targetPath = path.join(UPLOAD_DIR, targetRelative);

    if (!(await pathExists(sourcePath))) {
        return false;
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(sourcePath, targetPath);
    return true;
}

async function copyDirectoryRecursive(sourceRelative, targetRelative = sourceRelative) {
    const sourcePath = path.join(ROOT_DIR, sourceRelative);
    const targetPath = path.join(UPLOAD_DIR, targetRelative);

    if (!(await pathExists(sourcePath))) {
        return;
    }

    await fs.mkdir(targetPath, { recursive: true });
    const entries = await fs.readdir(sourcePath, { withFileTypes: true });

    await Promise.all(entries.map(async (entry) => {
        if (SKIP_DIR_NAMES.has(entry.name)) {
            return;
        }

        const nextSource = path.join(sourcePath, entry.name);
        const nextTarget = path.join(targetPath, entry.name);

        if (entry.isDirectory()) {
            await copyDirectoryRecursive(
                path.relative(ROOT_DIR, nextSource),
                path.relative(UPLOAD_DIR, nextTarget)
            );
            return;
        }

        await fs.copyFile(nextSource, nextTarget);
    }));
}

async function copyRootWebFiles() {
    const entries = await fs.readdir(ROOT_DIR, { withFileTypes: true });

    await Promise.all(entries.map(async (entry) => {
        if (!entry.isFile()) {
            return;
        }

        const extension = path.extname(entry.name).toLowerCase();
        if (!ROOT_FILE_EXTENSIONS.has(extension)) {
            return;
        }

        await fs.copyFile(
            path.join(ROOT_DIR, entry.name),
            path.join(UPLOAD_DIR, entry.name)
        );
    }));
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

async function copyDistOutput() {
    const distPath = path.join(ROOT_DIR, "dist");
    const uploadDistPath = path.join(UPLOAD_DIR, "dist");

    if (!(await pathExists(distPath))) {
        throw new Error("dist/ was not created. Build step failed.");
    }

    await fs.rm(uploadDistPath, { recursive: true, force: true });
    await copyDirectoryRecursive("dist", "dist");
}

async function writeUploadReadme(hasAstraBundle) {
    const bundleNote = hasAstraBundle
        ? "- secure-connect-hack-lab.zip is included (Astra DB on Netlify can work)."
        : `- secure-connect-hack-lab.zip is MISSING.
  Copy your Astra secure bundle into this folder before uploading, then set
  ASTRA_DB_SECURE_BUNDLE_PATH=secure-connect-hack-lab.zip in Netlify env vars.`;

    const readme = `HackLab — Netlify upload package
================================

This folder is ready to deploy. Do NOT upload only the "dist" subfolder.

WHAT IS INSIDE
--------------
- netlify.toml          Netlify build + API redirects
- netlify/functions/    Backend API (database)
- server/               API implementation
- dist/                 Built static site (already built)
- package.json          Dependencies for Netlify build

HOW TO DEPLOY (pick one)
------------------------

OPTION A — GitHub + Netlify (recommended)
1. Zip this entire "netlify-upload" folder OR push the main repo to GitHub.
2. Netlify → Add new site → Import from Git (or upload zip if your plan allows).
3. Build command: npm run build
4. Publish directory: dist
5. Add environment variables in Netlify (Site settings → Environment variables):
   ASTRA_DB_APPLICATION_TOKEN
   ASTRA_DB_ID
   ASTRA_DB_KEYSPACE
   ASTRA_DB_SECURE_BUNDLE_PATH=secure-connect-hack-lab.zip
6. Firebase Auth → add davhacklab.netlify.app to Authorized domains.

OPTION B — Netlify CLI (no Git)
1. Install: npm install -g netlify-cli
2. cd into this netlify-upload folder
3. netlify login
4. netlify init   (link to your site, first time only)
5. netlify deploy --prod

OPTION C — Drag & drop ONLY the "dist" folder
   WARNING: Website UI works but DATABASE/API will NOT work.
   Use only for a quick static preview.

ASTRA BUNDLE
------------
${bundleNote}

NEVER UPLOAD
------------
- .env
- Hack_Lab-token.json
- node_modules/ (Netlify installs this during build)

AFTER DEPLOY — TEST
-------------------
Open in browser:
  https://YOUR-SITE.netlify.app/api/health
Should return JSON with "ok": true (not 404).
`;

    await fs.writeFile(path.join(UPLOAD_DIR, "UPLOAD-README.txt"), readme, "utf8");
}

async function main() {
    console.log("Preparing netlify-upload/ ...");
    await fs.rm(UPLOAD_DIR, { recursive: true, force: true });
    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    for (const fileName of COPY_FILES) {
        await copyFileIfExists(fileName);
    }

    await copyRootWebFiles();

    for (const dirName of COPY_DIRS) {
        await copyDirectoryRecursive(dirName);
    }

    const bundleCopied = await copyFileIfExists("secure-connect-hack-lab.zip");

    console.log("Running npm run build ...");
    await runCommand("npm", ["run", "build"], ROOT_DIR);
    await copyDistOutput();

    await writeUploadReadme(bundleCopied);

    console.log("");
    console.log(`Done. Upload this folder to Netlify:`);
    console.log(`  ${UPLOAD_DIR}`);
    console.log("");
    console.log("Read UPLOAD-README.txt inside that folder for step-by-step instructions.");
    if (!bundleCopied) {
        console.log("");
        console.log("Note: Copy secure-connect-hack-lab.zip into netlify-upload/ before deploying.");
    }
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
