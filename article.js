import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    CONTENT_PATHS,
    DEFAULT_AUTHORITY_ARTICLES,
    DEFAULT_STUDENT_ARTICLES,
    auth,
    cloneData,
    escapeHtml,
    getDisplayName,
    saveContent,
    watchContent
} from "./portal-data.js";
import { guardStudentPortal } from "./account-access.js";
import { applyMarkdownFormat } from "./article-format.js";

const ARTICLE_DRAFT_STORAGE_PREFIX = "hacklab.article.draft.";
const ARTICLE_VIEW_STORAGE_KEY = "hacklab.article.view";
const ARTICLE_SAVED_STORAGE_KEY = "hacklab.article.saved";
const ARTICLE_ACCENTS = [
    "rgba(79, 209, 197, 0.2)",
    "rgba(167, 139, 250, 0.2)",
    "rgba(56, 189, 248, 0.18)",
    "rgba(251, 113, 133, 0.18)",
    "rgba(255, 209, 102, 0.18)"
];

let authorityArticles = normalizeArticles(DEFAULT_AUTHORITY_ARTICLES, "authority");
let studentArticles = normalizeArticles(DEFAULT_STUDENT_ARTICLES, "student");
const savedArticles = new Set();

let activeFilter = "all";
let selectedTopic = "Build Log";
let isComposerCollapsed = false;
let currentUserId = "";
let currentUserName = "Student";
let currentUserAvatar = "images/avatar.png";
let authorityWatcherAttached = false;
let studentWatcherAttached = false;
let currentDraftStorageKey = "guest";

const authorityFeatureEl = document.getElementById("authorityFeature");
const authorityListEl = document.getElementById("authorityList");
const articleFeedEl = document.getElementById("articleFeed");
const feedHeadingEl = document.getElementById("feedHeading");
const feedKickerEl = document.getElementById("feedKicker");
const feedMetaEl = document.getElementById("feedMeta");
const searchEl = document.getElementById("articleSearch");
const filterRowEl = document.getElementById("filterRow");
const topicGridEl = document.getElementById("topicGrid");
const composerCardEl = document.querySelector(".composer-card");
const toggleArticleComposerEl = document.getElementById("toggleArticleComposer");
const articleComposerBodyEl = document.getElementById("articleComposerBody");
const composerFormEl = document.getElementById("articleComposer");
const titleEl = document.getElementById("articleTitle");
const summaryEl = document.getElementById("articleSummary");
const bodyEl = document.getElementById("articleBody");
const takeawayEl = document.getElementById("articleTakeaway");
const formatToolbarEl = document.getElementById("articleFormatToolbar");
const composerMessageEl = document.getElementById("composerMessage");
const composerIdentityEl = document.getElementById("composerIdentity");
const composerNameEl = document.getElementById("composerName");
const composerAvatarEl = document.getElementById("composerAvatar");
const selectedTopicLabelEl = document.getElementById("selectedTopicLabel");
const feedBlockEl = document.getElementById("feedBlock");

function compactText(value, maxLength = 140, fallback = "") {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return fallback;
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength).replace(/\s+\S*$/, "").trim()}...`;
}

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
        supportNote: article.supportNote || "Share the one lesson a reader should keep after the article closes.",
        body: article.body || article.summary || "No full article has been written yet.",
        author: article.author || "Student",
        authorId: article.authorId || "",
        meta: article.meta || (roleFallback === "authority" ? "Official reading track" : "Student contributor"),
        topic: article.topic || "Build Log",
        readTime: article.readTime || "4 min read",
        reads: article.reads || "Fresh read",
        avatar: article.avatar || (roleFallback === "authority" ? "images/logo.png" : "images/avatar.png"),
        accentSoft: article.accentSoft || getArticleAccent(index),
        createdAt: article.createdAt || new Date().toISOString(),
        updatedAt: article.updatedAt || article.createdAt || new Date().toISOString()
    })).sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
}

function readStorageJson(key, fallback) {
    try {
        const rawValue = window.localStorage.getItem(key);
        return rawValue ? JSON.parse(rawValue) : fallback;
    } catch (error) {
        console.warn(`Unable to read article storage key "${key}":`, error);
        return fallback;
    }
}

function writeStorageJson(key, value) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.warn(`Unable to write article storage key "${key}":`, error);
    }
}

function getDraftStorageKey() {
    return `${ARTICLE_DRAFT_STORAGE_PREFIX}${currentDraftStorageKey}`;
}

function syncSelectedTopicState() {
    topicGridEl?.querySelectorAll(".topic-chip").forEach((chip) => {
        chip.classList.toggle("selected", chip.dataset.topic === selectedTopic);
    });

    if (selectedTopicLabelEl) {
        selectedTopicLabelEl.textContent = selectedTopic;
    }
}

function persistComposerDraft() {
    writeStorageJson(getDraftStorageKey(), {
        title: titleEl?.value || "",
        summary: summaryEl?.value || "",
        body: bodyEl?.value || "",
        takeaway: takeawayEl?.value || "",
        selectedTopic
    });
}

function clearComposerDraft() {
    writeStorageJson(getDraftStorageKey(), {
        title: "",
        summary: "",
        body: "",
        takeaway: "",
        selectedTopic
    });
}

function restoreComposerDraft() {
    const draft = readStorageJson(getDraftStorageKey(), {});

    if (typeof draft.selectedTopic === "string" && draft.selectedTopic.trim()) {
        selectedTopic = draft.selectedTopic.trim();
    }

    if (titleEl && typeof draft.title === "string") {
        titleEl.value = draft.title;
    }

    if (summaryEl && typeof draft.summary === "string") {
        summaryEl.value = draft.summary;
    }

    if (bodyEl && typeof draft.body === "string") {
        bodyEl.value = draft.body;
    }

    if (takeawayEl && typeof draft.takeaway === "string") {
        takeawayEl.value = draft.takeaway;
    }

    syncSelectedTopicState();
}

function persistFeedState() {
    writeStorageJson(ARTICLE_VIEW_STORAGE_KEY, {
        filter: activeFilter,
        search: searchEl?.value || "",
        isComposerCollapsed
    });
}

function restoreFeedState() {
    const state = readStorageJson(ARTICLE_VIEW_STORAGE_KEY, {});

    if (typeof state.filter === "string" && ["all", "authority", "student", "mine"].includes(state.filter)) {
        activeFilter = state.filter;
    }

    if (searchEl && typeof state.search === "string") {
        searchEl.value = state.search;
    }

    if (typeof state.isComposerCollapsed === "boolean") {
        isComposerCollapsed = state.isComposerCollapsed;
    }
}

function persistSavedArticles() {
    writeStorageJson(ARTICLE_SAVED_STORAGE_KEY, [...savedArticles]);
}

function restoreSavedArticles() {
    savedArticles.clear();
    const stored = readStorageJson(ARTICLE_SAVED_STORAGE_KEY, []);
    if (!Array.isArray(stored)) return;

    stored.forEach((value) => {
        if (typeof value === "string" && value.trim()) {
            savedArticles.add(value);
        }
    });
}

function getAllArticles() {
    return [...authorityArticles, ...studentArticles].sort((left, right) => {
        if (left.role !== right.role) {
            return left.role === "authority" ? -1 : 1;
        }

        return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
    });
}

function getMyArticles() {
    return studentArticles.filter((article) => article.authorId === currentUserId);
}

function updateCounts() {
    return {
        authority: authorityArticles.length,
        student: studentArticles.length,
        mine: getMyArticles().length
    };
}

function deleteSavedArticle(articleId = "") {
    if (!articleId || !savedArticles.has(articleId)) return;
    savedArticles.delete(articleId);
    persistSavedArticles();
}

function renderStandfirst(text, className = "article-standfirst") {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    if (!clean) {
        return `<p class="${className}"><strong>No summary yet.</strong></p>`;
    }

    const punctuationIndex = clean.search(/[.!?]/);
    const splitAt = punctuationIndex > 18 && punctuationIndex < 96 ? punctuationIndex + 1 : Math.min(clean.length, 92);
    const lead = clean.slice(0, splitAt).trim();
    const rest = clean.slice(splitAt).trim();

    return `<p class="${className}"><strong>${escapeHtml(lead)}</strong>${rest ? ` <span>${escapeHtml(rest)}</span>` : ""}</p>`;
}

function getArticleMetaNote(article) {
    return compactText(article.supportNote || article.summary, 120, "Open the article for the full lesson.");
}

function renderAuthoritySection() {
    const [featuredArticle, ...restArticles] = authorityArticles;

    if (authorityFeatureEl && featuredArticle) {
        authorityFeatureEl.innerHTML = `
            <div class="authority-feature-inner" data-open-article="${escapeHtml(featuredArticle.id)}">
                <div class="authority-reading-grid">
                    <div class="authority-main">
                        <span class="authority-flag">Pinned Authority Article</span>
                        <h3>${escapeHtml(featuredArticle.title)}</h3>
                        ${renderStandfirst(featuredArticle.summary, "authority-summary")}
                        <div class="authority-note">
                            <span class="authority-note-label">Why students should read this</span>
                            <p>${escapeHtml(getArticleMetaNote(featuredArticle))}</p>
                        </div>
                        <div class="authority-tags">
                            <span class="authority-tag">${escapeHtml(featuredArticle.topic)}</span>
                            <span class="authority-tag">${escapeHtml(featuredArticle.readTime)}</span>
                            <span class="authority-tag">Priority for every student</span>
                        </div>
                        <div class="article-author-row">
                            <div class="author-block">
                                <img src="${escapeHtml(featuredArticle.avatar)}" alt="${escapeHtml(featuredArticle.author)}" />
                                <div class="author-copy">
                                    <strong>${escapeHtml(featuredArticle.author)}</strong>
                                    <span>${escapeHtml(featuredArticle.meta)}</span>
                                </div>
                            </div>
                            <button type="button" class="read-article-btn" data-open-article="${escapeHtml(featuredArticle.id)}">Read article</button>
                        </div>
                    </div>
                    <aside class="authority-side">
                        <div class="authority-side-card">
                            <span>Focus</span>
                            <strong>${escapeHtml(featuredArticle.topic)}</strong>
                        </div>
                        <div class="authority-side-card">
                            <span>Read length</span>
                            <strong>${escapeHtml(featuredArticle.readTime)}</strong>
                        </div>
                        <div class="authority-side-card">
                            <span>Reach</span>
                            <strong>${escapeHtml(featuredArticle.reads)}</strong>
                        </div>
                    </aside>
                </div>
            </div>
        `;
    } else if (authorityFeatureEl) {
        authorityFeatureEl.innerHTML = `
            <div class="authority-feature-inner">
                <div class="authority-reading-grid">
                    <div class="authority-main">
                        <span class="authority-flag">Authority Lane</span>
                        <h3>No highlighted authority article yet</h3>
                        ${renderStandfirst("A teacher can publish an official article from the teacher dashboard and it will appear here.", "authority-summary")}
                    </div>
                </div>
            </div>
        `;
    }

    if (authorityListEl) {
        authorityListEl.innerHTML = restArticles.map((article) => `
            <article class="mini-authority-card glass-panel" data-open-article="${escapeHtml(article.id)}">
                <span class="mini-flag">Authority</span>
                <h4>${escapeHtml(article.title)}</h4>
                ${renderStandfirst(article.summary, "mini-summary")}
                <div class="mini-note">
                    <span class="mini-note-label">Why open it</span>
                    <p>${escapeHtml(compactText(getArticleMetaNote(article), 108))}</p>
                </div>
                <div class="mini-footer">
                    <span class="mini-meta">${escapeHtml(article.topic)} - ${escapeHtml(article.readTime)}</span>
                    <button type="button" class="read-article-btn" data-open-article="${escapeHtml(article.id)}">Read article</button>
                </div>
            </article>
        `).join("");
    }
}

function getFilterHeading() {
    if (activeFilter === "authority") {
        return {
            kicker: "Official reading lane",
            heading: "Authority articles from the Astra feed"
        };
    }

    if (activeFilter === "student") {
        return {
            kicker: "Student writing lane",
            heading: "Student articles published across HackLab"
        };
    }

    if (activeFilter === "mine") {
        return {
            kicker: "Your byline",
            heading: "Articles you published into the live feed"
        };
    }

    return {
        kicker: "Discover and create",
        heading: "Articles from the live HackLab article feed"
    };
}

function getFilteredArticles() {
    const query = searchEl?.value.trim().toLowerCase() || "";

    return getAllArticles().filter((article) => {
        const isMine = article.authorId === currentUserId;
        const roleMatches =
            activeFilter === "all" ||
            (activeFilter === "authority" && article.role === "authority") ||
            (activeFilter === "student" && article.role === "student") ||
            (activeFilter === "mine" && isMine);

        if (!roleMatches) return false;
        if (!query) return true;

        const haystack = `${article.title} ${article.summary} ${article.supportNote || ""} ${article.body || ""} ${article.author} ${article.topic}`.toLowerCase();
        return haystack.includes(query);
    });
}

function renderFeed() {
    const filteredArticles = getFilteredArticles();
    const headingCopy = getFilterHeading();

    if (feedKickerEl) feedKickerEl.textContent = headingCopy.kicker;
    if (feedHeadingEl) feedHeadingEl.textContent = headingCopy.heading;
    if (feedMetaEl) {
        const counts = updateCounts();
        const label = filteredArticles.length === 1 ? "article" : "articles";
        feedMetaEl.textContent = `${filteredArticles.length} ${label} showing | ${counts.student} student | ${counts.authority} authority`;
    }

    if (!articleFeedEl) return;

    if (!filteredArticles.length) {
        articleFeedEl.innerHTML = `
            <div class="empty-state">
                No articles match this filter yet. Publish a student article or clear the search to see more from Astra.
            </div>
        `;
        return;
    }

    articleFeedEl.innerHTML = filteredArticles.map((article, index) => {
        const isAuthority = article.role === "authority";
        const isMine = article.authorId === currentUserId && article.role === "student";
        const typeClass = isAuthority ? "authority" : isMine ? "mine" : "student";
        const typeLabel = isAuthority ? "HackLab Authority" : isMine ? "My Article" : "Student Story";
        const cardClasses = [
            "article-card",
            isAuthority ? "is-authority" : "",
            index === 0 && activeFilter !== "mine" ? "is-wide" : ""
        ].filter(Boolean).join(" ");
        const savedLabel = savedArticles.has(article.id) ? "Saved" : "Save";
        const headAction = isMine
            ? `<button type="button" class="delete-article-btn" data-delete-article="${escapeHtml(article.id)}">Delete</button>`
            : `
                <button type="button" class="save-btn ${savedArticles.has(article.id) ? "is-saved" : ""}" data-article-id="${escapeHtml(article.id)}">
                    ${savedLabel}
                </button>
            `;

        return `
            <article class="${cardClasses}" data-open-article="${escapeHtml(article.id)}">
                <div class="article-card-inner">
                    <div class="article-card-head">
                        <span class="article-type ${typeClass}">${escapeHtml(typeLabel)}</span>
                        ${headAction}
                    </div>
                    <div class="article-cover" style="--card-soft: ${escapeHtml(article.accentSoft || getArticleAccent(index))};">
                        <span class="cover-topic">${escapeHtml(article.topic)}</span>
                        <span class="cover-time">${escapeHtml(article.readTime)}</span>
                        <div class="cover-lines">
                            <span class="cover-line wide"></span>
                            <span class="cover-line mid"></span>
                            <span class="cover-line short"></span>
                        </div>
                    </div>
                    <div class="article-copy">
                        <h3>${escapeHtml(article.title)}</h3>
                        ${renderStandfirst(article.summary, "article-standfirst")}
                        <div class="article-note">
                            <span class="article-note-label">${isMine ? "Writer takeaway" : "Why open it"}</span>
                            <p>${escapeHtml(getArticleMetaNote(article))}</p>
                        </div>
                    </div>
                    <div class="article-card-footer">
                        <div class="author-block">
                            <img src="${escapeHtml(article.avatar)}" alt="${escapeHtml(article.author)}" />
                            <div class="author-copy">
                                <strong>${escapeHtml(article.author)}</strong>
                                <span>${escapeHtml(article.meta)}</span>
                            </div>
                        </div>
                        <div class="article-card-footer-actions">
                            <span class="article-count">${escapeHtml(article.reads)}</span>
                            <button type="button" class="read-article-btn" data-open-article="${escapeHtml(article.id)}">Read article</button>
                        </div>
                    </div>
                </div>
            </article>
        `;
    }).join("");
}

function renderAll() {
    updateCounts();
    renderAuthoritySection();
    renderFeed();
}

function setComposerCollapsed(nextValue) {
    isComposerCollapsed = Boolean(nextValue);

    if (composerCardEl) {
        composerCardEl.classList.toggle("is-collapsed", isComposerCollapsed);
    }

    if (articleComposerBodyEl) {
        articleComposerBodyEl.hidden = isComposerCollapsed;
    }

    if (toggleArticleComposerEl) {
        toggleArticleComposerEl.setAttribute("aria-expanded", String(!isComposerCollapsed));
        toggleArticleComposerEl.textContent = isComposerCollapsed ? "Expand" : "Minimize";
    }

    persistFeedState();
}

function setComposerMessage(text, tone = "") {
    if (!composerMessageEl) return;
    composerMessageEl.textContent = text;
    composerMessageEl.classList.remove("success", "error");
    if (tone) composerMessageEl.classList.add(tone);
}

function setActiveFilter(filter) {
    activeFilter = filter;
    filterRowEl?.querySelectorAll(".filter-chip").forEach((chip) => {
        chip.classList.toggle("active", chip.dataset.filter === filter);
    });
    persistFeedState();
    renderFeed();
}

function openArticle(articleId = "") {
    if (!articleId) return;
    window.location.href = `article-reader.html?id=${encodeURIComponent(articleId)}`;
}

async function persistStudentArticles(nextArticles) {
    studentArticles = normalizeArticles(nextArticles, "student");
    await saveContent(CONTENT_PATHS.studentArticles, studentArticles);
}

async function publishArticle() {
    const title = titleEl?.value.trim() || "";
    const summary = summaryEl?.value.trim() || "";
    const body = bodyEl?.value.trim() || "";
    const supportNote = takeawayEl?.value.trim() || "";

    if (!title || !summary || !body) {
        setComposerMessage("Add a title, opening paragraph, and full article body before publishing.", "error");
        return;
    }

    const article = {
        id: `student-${Date.now()}`,
        role: "student",
        title,
        summary,
        supportNote: supportNote || "Keep the closing lesson sharp so another student can reuse it.",
        body,
        author: currentUserName,
        authorId: currentUserId,
        meta: "Student contributor",
        topic: selectedTopic,
        readTime: `${Math.max(3, Math.ceil(body.split(/\s+/).filter(Boolean).length / 180))} min read`,
        reads: "Fresh read",
        avatar: currentUserAvatar,
        accentSoft: getArticleAccent(studentArticles.length),
        createdAt: new Date().toISOString()
    };

    try {
        await persistStudentArticles([article, ...studentArticles.filter((item) => item.id !== article.id)]);
        if (titleEl) titleEl.value = "";
        if (summaryEl) summaryEl.value = "";
        if (bodyEl) bodyEl.value = "";
        if (takeawayEl) takeawayEl.value = "";
        clearComposerDraft();
        setComposerMessage("Your article is now live in the student article feed.", "success");
        setActiveFilter("mine");
        feedBlockEl?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        console.error("Unable to publish article:", error);
        setComposerMessage("Unable to publish the article right now.", "error");
    }
}

async function removeArticle(articleId = "") {
    const article = studentArticles.find((entry) => entry.id === articleId && entry.authorId === currentUserId);
    if (!article) return;

    if (!window.confirm("Delete this article from the student feed?")) {
        return;
    }

    try {
        deleteSavedArticle(articleId);
        await persistStudentArticles(studentArticles.filter((entry) => entry.id !== articleId));
        setComposerMessage("Your article has been deleted from the student feed.", "success");
        renderAll();
    } catch (error) {
        console.error("Unable to delete article:", error);
        setComposerMessage("Unable to delete this article right now.", "error");
    }
}

document.getElementById("logoutBtn")?.addEventListener("click", () => {
    signOut(auth).then(() => {
        window.location.href = "auth.html";
    }).catch((error) => {
        console.error("Logout Error:", error);
    });
});

filterRowEl?.addEventListener("click", (event) => {
    const button = event.target.closest(".filter-chip");
    if (!button) return;
    setActiveFilter(button.dataset.filter || "all");
});

topicGridEl?.addEventListener("click", (event) => {
    const button = event.target.closest(".topic-chip");
    if (!button) return;

    selectedTopic = button.dataset.topic || "Build Log";
    syncSelectedTopicState();
    persistComposerDraft();
});

toggleArticleComposerEl?.addEventListener("click", () => {
    setComposerCollapsed(!isComposerCollapsed);
});

formatToolbarEl?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-format]");
    if (!button) return;
    applyMarkdownFormat(bodyEl, button.dataset.format || "bold");
});

articleFeedEl?.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-article]");
    if (deleteButton) {
        void removeArticle(deleteButton.dataset.deleteArticle || "");
        return;
    }

    const saveButton = event.target.closest(".save-btn");
    if (saveButton) {
        const articleId = saveButton.dataset.articleId;
        if (!articleId) return;

        if (savedArticles.has(articleId)) {
            savedArticles.delete(articleId);
        } else {
            savedArticles.add(articleId);
        }

        persistSavedArticles();
        renderFeed();
        return;
    }

    const openButton = event.target.closest("[data-open-article]");
    if (openButton) {
        openArticle(openButton.dataset.openArticle || "");
    }
});

authorityFeatureEl?.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-open-article]");
    if (openButton) {
        openArticle(openButton.dataset.openArticle || "");
    }
});

authorityListEl?.addEventListener("click", (event) => {
    const openButton = event.target.closest("[data-open-article]");
    if (openButton) {
        openArticle(openButton.dataset.openArticle || "");
    }
});

searchEl?.addEventListener("input", () => {
    persistFeedState();
    renderFeed();
});

titleEl?.addEventListener("input", () => {
    persistComposerDraft();
    setComposerMessage("Keep the title specific so students know exactly what they are opening.");
});

summaryEl?.addEventListener("input", () => {
    persistComposerDraft();
    setComposerMessage("Use the opening paragraph to name the build, lesson, or mistake directly.");
});

bodyEl?.addEventListener("input", () => {
    persistComposerDraft();
    setComposerMessage("Write the full article here. Use headings, lists, and code only when they help clarity.");
});

takeawayEl?.addEventListener("input", () => {
    persistComposerDraft();
    setComposerMessage("The takeaway should be one clean thought another student can keep.");
});

composerFormEl?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await publishArticle();
});

restoreFeedState();
restoreSavedArticles();
syncSelectedTopicState();
setComposerCollapsed(isComposerCollapsed);
renderAll();

onAuthStateChanged(auth, async (user) => {
    if (!(await guardStudentPortal(user))) {
        return;
    }

    currentUserId = user.uid || "";
    currentUserName = getDisplayName(user, "Student");
    currentUserAvatar = user.photoURL || "images/avatar.png";
    currentDraftStorageKey = currentUserId || "guest";
    restoreComposerDraft();

    if (composerIdentityEl) {
        composerIdentityEl.textContent = `Writing as ${currentUserName}`;
    }
    if (composerNameEl) {
        composerNameEl.textContent = currentUserName;
    }
    if (composerAvatarEl) {
        composerAvatarEl.src = currentUserAvatar;
        composerAvatarEl.alt = `${currentUserName} avatar`;
    }

    renderAll();
    setActiveFilter(activeFilter);

    if (!authorityWatcherAttached) {
        authorityWatcherAttached = true;
        watchContent(CONTENT_PATHS.authorityArticles, DEFAULT_AUTHORITY_ARTICLES, (articles) => {
            authorityArticles = normalizeArticles(Array.isArray(articles) ? articles : cloneData(DEFAULT_AUTHORITY_ARTICLES), "authority");
            renderAll();
        });
    }

    if (!studentWatcherAttached) {
        studentWatcherAttached = true;
        watchContent(CONTENT_PATHS.studentArticles, DEFAULT_STUDENT_ARTICLES, (articles) => {
            studentArticles = normalizeArticles(Array.isArray(articles) ? articles : cloneData(DEFAULT_STUDENT_ARTICLES), "student");
            renderAll();
        });
    }
});
