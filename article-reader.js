import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    CONTENT_PATHS,
    DEFAULT_AUTHORITY_ARTICLES,
    DEFAULT_STUDENT_ARTICLES,
    auth,
    escapeHtml,
    getDisplayName,
    loadContent
} from "./portal-data.js";
import { extractArticleOutline, renderArticleBodyHtml } from "./article-format.js";
import { guardStudentPortal } from "./account-access.js";

const ARTICLE_ACCENTS = [
    "rgba(79, 209, 197, 0.2)",
    "rgba(167, 139, 250, 0.2)",
    "rgba(56, 189, 248, 0.18)",
    "rgba(251, 113, 133, 0.18)",
    "rgba(255, 209, 102, 0.18)"
];

const readerHeroEl = document.getElementById("readerHero");
const readerMetaStripEl = document.getElementById("readerMetaStrip");
const readerArticleTitleEl = document.getElementById("readerArticleTitle");
const readerArticleBodyEl = document.getElementById("readerArticleBody");
const readerTakeawayEl = document.getElementById("readerTakeaway");
const readerAboutEl = document.getElementById("readerAbout");
const readerOutlineEl = document.getElementById("readerOutline");
const relatedArticlesEl = document.getElementById("relatedArticles");
const tabButtons = Array.from(document.querySelectorAll(".tab"));
const readerPanels = Array.from(document.querySelectorAll(".reader-panel"));

let currentUserName = "Student";
let allArticles = [];

function getArticleAccent(index = 0) {
    return ARTICLE_ACCENTS[index % ARTICLE_ACCENTS.length];
}

function normalizeArticles(items = [], roleFallback = "student") {
    if (!Array.isArray(items)) {
        return [];
    }

    return items.map((article, index) => ({
        id: article.id || `${roleFallback}-${Date.now()}-${index}`,
        role: article.role === "authority" ? "authority" : roleFallback,
        title: article.title || "Untitled article",
        summary: article.summary || "A short article summary will appear here.",
        supportNote: article.supportNote || "No takeaway was added yet.",
        body: article.body || article.summary || "No full article body has been written yet.",
        author: article.author || "HackLab Student",
        authorId: article.authorId || "",
        meta: article.meta || (roleFallback === "authority" ? "Official reading track" : "Student contributor"),
        topic: article.topic || "Build Log",
        readTime: article.readTime || "4 min read",
        reads: article.reads || "Fresh read",
        avatar: article.avatar || (roleFallback === "authority" ? "images/logo.png" : "images/avatar.png"),
        accentSoft: article.accentSoft || getArticleAccent(index),
        createdAt: article.createdAt || new Date().toISOString()
    }));
}

function getCurrentArticleId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || "";
}

function openPanel(panel) {
    tabButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.panel === panel);
    });

    readerPanels.forEach((section) => {
        section.classList.toggle("active", section.dataset.panel === panel);
    });
}

function renderEmptyState(message = "Article not found.") {
    if (readerHeroEl) {
        readerHeroEl.innerHTML = `
            <span class="reader-hero-kicker">Article reader</span>
            <h2>${escapeHtml(message)}</h2>
            <p class="reader-hero-summary">Return to the article feed and open a published article card.</p>
        `;
    }

    if (readerMetaStripEl) {
        readerMetaStripEl.innerHTML = `<span class="reader-empty">No article metadata is available.</span>`;
    }

    if (readerArticleTitleEl) {
        readerArticleTitleEl.textContent = message;
    }

    if (readerArticleBodyEl) {
        readerArticleBodyEl.innerHTML = `<p>The requested article is not available right now.</p>`;
    }

    if (readerTakeawayEl) {
        readerTakeawayEl.innerHTML = "<p class='reader-empty'>No takeaway available.</p>";
    }

    if (readerAboutEl) {
        readerAboutEl.innerHTML = "<p class='reader-empty'>No writer context available.</p>";
    }

    if (readerOutlineEl) {
        readerOutlineEl.innerHTML = "<span class='reader-empty'>No sections found.</span>";
    }

    if (relatedArticlesEl) {
        relatedArticlesEl.innerHTML = "<span class='reader-empty'>No related articles found.</span>";
    }
}

function renderArticle(article) {
    if (!article) {
        renderEmptyState("This article could not be found");
        return;
    }

    const isAuthority = article.role === "authority";
    const outline = extractArticleOutline(article.body);
    const relatedArticles = allArticles
        .filter((item) => item.id !== article.id && (item.topic === article.topic || item.role === article.role))
        .slice(0, 4);

    if (readerHeroEl) {
        readerHeroEl.innerHTML = `
            <span class="reader-hero-kicker">${escapeHtml(isAuthority ? "HackLab authority article" : "Student article")}</span>
            <h2>${escapeHtml(article.title)}</h2>
            <p class="reader-hero-summary">${escapeHtml(article.summary)}</p>
            <div class="reader-chip-row">
                <span class="reader-chip">${escapeHtml(article.topic)}</span>
                <span class="reader-chip">${escapeHtml(article.readTime)}</span>
                <span class="reader-chip">${escapeHtml(article.reads)}</span>
            </div>
        `;
    }

    if (readerMetaStripEl) {
        readerMetaStripEl.innerHTML = `
            <div class="reader-meta-main">
                <img class="reader-author-avatar" src="${escapeHtml(article.avatar)}" alt="${escapeHtml(article.author)}" />
                <div class="reader-meta-copy">
                    <strong>${escapeHtml(article.author)}</strong>
                    <span>${escapeHtml(article.meta)}</span>
                </div>
            </div>
            <div class="reader-meta-stats">
                <span class="reader-stat-pill">${escapeHtml(article.topic)}</span>
                <span class="reader-stat-pill">${escapeHtml(article.readTime)}</span>
                <span class="reader-stat-pill">${escapeHtml(article.reads)}</span>
            </div>
        `;
    }

    if (readerArticleTitleEl) {
        readerArticleTitleEl.textContent = article.title;
    }

    if (readerArticleBodyEl) {
        readerArticleBodyEl.innerHTML = renderArticleBodyHtml(article.body);
    }

    if (readerTakeawayEl) {
        readerTakeawayEl.innerHTML = `<p>${escapeHtml(article.supportNote)}</p>`;
    }

    if (readerAboutEl) {
        readerAboutEl.innerHTML = `
            <p><strong>${escapeHtml(article.author)}</strong> published this ${escapeHtml(isAuthority ? "authority" : "student")} article for the HackLab reading lane.</p>
            <p>The piece is filed under <strong>${escapeHtml(article.topic)}</strong> and is framed as <strong>${escapeHtml(article.meta)}</strong>.</p>
            <p>${escapeHtml(currentUserName)}, use the article tab for the full read and the outline on the right if you want to jump section by section.</p>
        `;
    }

    if (readerOutlineEl) {
        readerOutlineEl.innerHTML = outline.length
            ? outline.map((item) => `
                <a class="outline-link level-${item.level}" href="#${escapeHtml(item.id)}">${escapeHtml(item.title)}</a>
            `).join("")
            : "<span class='reader-empty'>This article does not have markdown headings yet.</span>";
    }

    if (relatedArticlesEl) {
        relatedArticlesEl.innerHTML = relatedArticles.length
            ? relatedArticles.map((item) => `
                <a class="related-card" href="article-reader.html?id=${encodeURIComponent(item.id)}">
                    <strong>${escapeHtml(item.title)}</strong>
                    <span class="related-meta">${escapeHtml(item.topic)} · ${escapeHtml(item.readTime)}</span>
                </a>
            `).join("")
            : "<span class='reader-empty'>No related articles available yet.</span>";
    }
}

async function hydrateArticleReader() {
    const articleId = getCurrentArticleId();
    const [authority, student] = await Promise.all([
        loadContent(CONTENT_PATHS.authorityArticles, DEFAULT_AUTHORITY_ARTICLES),
        loadContent(CONTENT_PATHS.studentArticles, DEFAULT_STUDENT_ARTICLES)
    ]);

    allArticles = [
        ...normalizeArticles(authority, "authority"),
        ...normalizeArticles(student, "student")
    ];

    const article = allArticles.find((item) => item.id === articleId);
    renderArticle(article);
}

document.getElementById("logoutBtn")?.addEventListener("click", () => {
    signOut(auth).then(() => {
        window.location.href = "auth.html";
    }).catch((error) => {
        console.error("Logout Error:", error);
    });
});

tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
        openPanel(button.dataset.panel || "article");
    });
});

openPanel("article");

onAuthStateChanged(auth, async (user) => {
    if (!(await guardStudentPortal(user))) {
        return;
    }

    currentUserName = getDisplayName(user, "Student");

    try {
        await hydrateArticleReader();
    } catch (error) {
        console.error("Unable to load article reader:", error);
        renderEmptyState("Unable to load this article right now");
    }
});
