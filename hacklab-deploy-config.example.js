/**
 * Local production test only — GitHub Actions generates dist/hacklab-deploy-config.js
 *
 * Copy to hacklab-deploy-config.js at repo root for manual testing, or set env when building:
 *   set HACKLAB_API_URL=https://your-api.onrender.com
 *   npm run build
 */
window.HACKLAB_PAGES_BASE = "";
window.HACKLAB_API_BASE = "https://YOUR-API-HOST.onrender.com/api";
window.HACKLAB_DATA_MODE = "api";
