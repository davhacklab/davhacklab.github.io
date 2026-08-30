import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { auth, getUserRole } from "./portal-data.js";
import { guardStudentPortal } from "./account-access.js";
import { mountCommunityExperience } from "./community-experience.js";

let cleanupCommunity = null;
const body = document.body;
const sidebar = document.getElementById("communitySidebar");
const sidebarToggle = document.getElementById("communityMenuToggle");
const sidebarBackdrop = document.getElementById("communitySidebarBackdrop");

function closeCommunitySidebar() {
    body?.classList.remove("community-sidebar-open");
    if (sidebarToggle) {
        sidebarToggle.setAttribute("aria-expanded", "false");
    }
    if (sidebarBackdrop) {
        sidebarBackdrop.hidden = true;
    }
}

function openCommunitySidebar() {
    body?.classList.add("community-sidebar-open");
    if (sidebarToggle) {
        sidebarToggle.setAttribute("aria-expanded", "true");
    }
    if (sidebarBackdrop) {
        sidebarBackdrop.hidden = false;
    }
}

function toggleCommunitySidebar() {
    if (body?.classList.contains("community-sidebar-open")) {
        closeCommunitySidebar();
        return;
    }

    openCommunitySidebar();
}

function syncCommunitySidebarForViewport() {
    if (window.innerWidth > 980) {
        closeCommunitySidebar();
    }
}

sidebarToggle?.addEventListener("click", toggleCommunitySidebar);
sidebarBackdrop?.addEventListener("click", closeCommunitySidebar);
window.addEventListener("resize", syncCommunitySidebarForViewport);
window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        closeCommunitySidebar();
    }
});
sidebar?.addEventListener("click", (event) => {
    if (window.innerWidth > 980) return;
    const actionable = event.target.closest("a, button");
    if (!actionable) return;
    closeCommunitySidebar();
});
syncCommunitySidebarForViewport();

document.getElementById("logoutBtn")?.addEventListener("click", () => {
    signOut(auth).then(() => {
        window.location.href = "auth.html";
    }).catch((error) => {
        console.error("Logout Error:", error);
    });
});

onAuthStateChanged(auth, async (user) => {
    if (!(await guardStudentPortal(user))) {
        return;
    }

    try {
        const role = await getUserRole(user.email || user.uid) || "student";
        if (!cleanupCommunity) {
            cleanupCommunity = mountCommunityExperience({
                root: document,
                user,
                role,
                useHash: true,
                onRequireAuth: () => {
                    window.location.href = "auth.html";
                }
            });
        }
    } catch (error) {
        console.error("Unable to initialize community view:", error);
    }
});
