import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    CONTENT_PATHS,
    DEFAULT_RESOURCES,
    auth,
    escapeHtml,
    watchContent
} from "./portal-data.js";
import { guardStudentPortal } from "./account-access.js";

let activeResources = [...DEFAULT_RESOURCES];
let resourceWatcherAttached = false;

onAuthStateChanged(auth, async (user) => {
    if (!(await guardStudentPortal(user))) {
        return;
    }

    if (!resourceWatcherAttached) {
        resourceWatcherAttached = true;
        watchContent(CONTENT_PATHS.resources, DEFAULT_RESOURCES, (resources) => {
            activeResources = Array.isArray(resources) ? resources : DEFAULT_RESOURCES;
            renderResources();
        });
    }
});

document.getElementById("logoutBtn")?.addEventListener("click", () => {
    signOut(auth).then(() => {
        window.location.href = "auth.html";
    }).catch((error) => {
        console.error("Logout Error:", error);
    });
});

function getResourceVisual(resource) {
    const type = resource.type || "reading";

    if (type === "video") {
        return `
            <div class="card-icon-wrap video-icon-wrap">
                <div class="yt-play">
                    <svg viewBox="0 0 68 48" xmlns="http://www.w3.org/2000/svg" class="yt-svg">
                        <path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C0 13.05 0 24 0 24s0 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C68 34.95 68 24 68 24s0-10.95-1.48-16.26z" fill="#f00"></path>
                        <path d="M45 24L27 14v20" fill="#fff"></path>
                    </svg>
                </div>
            </div>
        `;
    }

    if (type === "audio") {
        return `
            <div class="card-icon-wrap podcast-icon-wrap">
                <img src="images/audio.png" alt="Audio" class="card-img" />
            </div>
        `;
    }

    return `
        <div class="card-icon-wrap library-icon-wrap">
            <img src="images/read.png" alt="Reading" class="card-img" />
        </div>
    `;
}

function renderResources() {
    const resourceCards = document.getElementById("resourceCards");
    if (!resourceCards) return;

    const allCards = Array.isArray(activeResources) ? activeResources : DEFAULT_RESOURCES;
    const cards = allCards.slice(0, 3);

    if (!cards.length) {
        resourceCards.innerHTML = `
            <article class="resource-card resource-card-reading">
                <div class="resource-card-top">
                    <span class="resource-badge">Awaiting update</span>
                    <span class="resource-meta">Library refresh</span>
                </div>
                <div class="card-icon-wrap library-icon-wrap">
                    <img src="images/read.png" alt="Reading" class="card-img" />
                </div>
                <h3 class="card-title">No resources published yet</h3>
                <p class="card-desc">New learning resources will appear here as soon as they are added.</p>
                <div class="resource-footer">
                    <span>Check later</span>
                    <span>Dashboard sync</span>
                </div>
            </article>
        `;
    } else {
        resourceCards.innerHTML = cards.map((resource) => `
            <a href="${escapeHtml(resource.url || "#")}" class="resource-card resource-card-${escapeHtml(resource.type || "reading")}">
                <div class="resource-card-top">
                    <span class="resource-badge">${escapeHtml(resource.badge || "Fresh resource")}</span>
                    <span class="resource-meta">${escapeHtml(resource.meta || "Live now")}</span>
                </div>
                ${getResourceVisual(resource)}
                <h3 class="card-title">${escapeHtml(resource.title || "Untitled resource")}</h3>
                <p class="card-desc">${escapeHtml(resource.description || "A new HackLab resource will appear here.")}</p>
                <div class="resource-footer">
                    <span>${escapeHtml(resource.footerLeft || "Open now")}</span>
                    <span>${escapeHtml(resource.footerRight || "Explore")}</span>
                </div>
            </a>
        `).join("");
    }

    const uniqueTypes = new Set(cards.map((resource) => resource.type || "reading"));
    const formatsCount = document.getElementById("resourceFormatsCount");
    const itemsCount = document.getElementById("resourceItemsCount");
    const itemsLabel = document.getElementById("resourceItemsLabel");

    if (formatsCount) {
        formatsCount.textContent = String(uniqueTypes.size).padStart(2, "0");
    }
    if (itemsCount) {
        itemsCount.textContent = String(cards.length).padStart(2, "0");
    }
    if (itemsLabel) {
        itemsLabel.textContent = cards.length === 1 ? "learning resource" : "learning resources";
    }
}
