import {
    CONTENT_PATHS,
    DEFAULT_ASKFORGE_QUESTIONS,
    DEFAULT_COMMUNITY_POSTS,
    createCommunityPost,
    deleteCommunityPost,
    escapeHtml,
    formatCompactCount,
    getDisplayName,
    getUserRole,
    likeCommunityPost,
    loadBootstrap,
    loadCommunityPosts,
    saveContent,
    startBootstrapPolling,
    updateCommunityPost,
    watchContent
} from "./portal-data.js";
const QUESTION_COUNT_FORMATTER = new Intl.NumberFormat("en-IN");
const MAX_ATTACHMENT_EDGE = 1080;
const MAX_ATTACHMENT_DATA_URL_LENGTH = 450000;

function normalizeAuthorRole(entry, currentUserId = "", currentUserRole = "student") {
    const explicitRole = String(entry?.authorRole || entry?.role || "")
        .trim()
        .toLowerCase();

    if (explicitRole === "teacher" || explicitRole === "student") {
        return explicitRole;
    }

    const authorId = String(entry?.authorId || "").trim();
    if (authorId && currentUserId && authorId === currentUserId) {
        return currentUserRole === "teacher" ? "teacher" : "student";
    }

    if (authorId === "seed-mentor" || authorId.includes("mentor")) {
        return "teacher";
    }

    return "student";
}

function normalizeAnswer(answer, questionId, index, currentUserId = "", currentUserRole = "student") {
    return {
        id: answer?.id || `${questionId}-answer-${index + 1}`,
        authorId: answer?.authorId || "anonymous",
        authorName: answer?.authorName || "HackLab Member",
        authorRole: normalizeAuthorRole(answer, currentUserId, currentUserRole),
        authorAvatar: answer?.authorAvatar || "images/avatar.png",
        text: String(answer?.text || "").trim(),
        createdAt: answer?.createdAt || new Date().toISOString()
    };
}

function normalizeQuestion(question, index, currentUserId = "", currentUserRole = "student") {
    const questionId = question?.id || `askforge-question-${Date.now().toString(36)}-${index + 1}`;
    return {
        id: questionId,
        authorId: question?.authorId || "anonymous",
        authorName: question?.authorName || "HackLab Member",
        authorRole: normalizeAuthorRole(question, currentUserId, currentUserRole),
        authorAvatar: question?.authorAvatar || "images/avatar.png",
        title: String(question?.title || "").trim() || "Untitled question",
        description: String(question?.description || question?.text || "").trim() || "No description added yet.",
        createdAt: question?.createdAt || new Date().toISOString(),
        answers: Array.isArray(question?.answers)
            ? question.answers.map((answer, answerIndex) => normalizeAnswer(answer, questionId, answerIndex, currentUserId, currentUserRole))
            : []
    };
}

function normalizeQuestionCollection(value, fallback = DEFAULT_ASKFORGE_QUESTIONS, currentUserId = "", currentUserRole = "student") {
    const source = Array.isArray(value)
        ? value
        : value && typeof value === "object"
            ? Object.values(value)
            : fallback;

    return source
        .filter(Boolean)
        .map((question, index) => normalizeQuestion(question, index, currentUserId, currentUserRole));
}

function sortQuestionsNewestFirst(questions) {
    return [...questions].sort((left, right) => {
        const leftTime = new Date(left?.createdAt || 0).getTime();
        const rightTime = new Date(right?.createdAt || 0).getTime();
        return rightTime - leftTime;
    });
}

function formatRelativeTime(dateValue) {
    const timestamp = new Date(dateValue || 0).getTime();
    if (!Number.isFinite(timestamp)) return "just now";

    const difference = Math.max(0, Date.now() - timestamp);
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (difference < minute) return "just now";

    if (difference < hour) {
        const minutes = Math.max(1, Math.round(difference / minute));
        return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
    }

    if (difference < day) {
        const hours = Math.max(1, Math.round(difference / hour));
        return `${hours} hr${hours === 1 ? "" : "s"} ago`;
    }

    if (difference < 30 * day) {
        const days = Math.max(1, Math.round(difference / day));
        return `${days} day${days === 1 ? "" : "s"} ago`;
    }

    return new Date(timestamp).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function formatQuestionCount(value) {
    const numeric = Math.max(0, Number(value) || 0);
    return `${QUESTION_COUNT_FORMATTER.format(numeric)} Question${numeric === 1 ? "" : "s"}`;
}

function makeId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function getUploadIconMarkup() {
    return `
        <span class="icon-gif" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
                <path d="M12 15.5V5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                <path d="M8.5 9L12 5.5L15.5 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                <path d="M5.5 15.5V17.25C5.5 18.2165 6.2835 19 7.25 19H16.75C17.7165 19 18.5 18.2165 18.5 17.25V15.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
            </svg>
        </span>
    `;
}

function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
        };
        image.onerror = (error) => {
            URL.revokeObjectURL(objectUrl);
            reject(error || new Error("Unable to load the selected image."));
        };
        image.src = objectUrl;
    });
}

async function createCompressedImagePayload(file) {
    const image = await loadImageFromFile(file);
    const largestEdge = Math.max(image.width, image.height, 1);
    const outputType = "image/jpeg";
    const edgeSteps = [MAX_ATTACHMENT_EDGE, 920, 820, 720, 620, 520, 420];
    const qualitySteps = [0.82, 0.74, 0.66, 0.58, 0.5];
    let bestCandidate = "";

    for (const edgeLimit of edgeSteps) {
        const scale = largestEdge > edgeLimit ? edgeLimit / largestEdge : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));

        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("Canvas is unavailable for image compression.");
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        for (const quality of qualitySteps) {
            const candidate = canvas.toDataURL(outputType, quality);
            bestCandidate = candidate;

            if (candidate.length <= MAX_ATTACHMENT_DATA_URL_LENGTH) {
                return {
                    mediaType: outputType,
                    mediaDataUrl: candidate
                };
            }
        }
    }

    if (bestCandidate && bestCandidate.length <= MAX_ATTACHMENT_DATA_URL_LENGTH) {
        return {
            mediaType: outputType,
            mediaDataUrl: bestCandidate
        };
    }

    throw new Error("This image is still too large after compression.");
}

function matchesSearch(value, searchTerm) {
    if (!searchTerm) return true;
    return String(value || "").toLowerCase().includes(searchTerm);
}

function renderRoleBadge(role) {
    if (role !== "teacher") return "";
    return `<span class="author-badge author-badge-teacher">Teacher</span>`;
}

function formatParagraphs(text) {
    return escapeHtml(String(text || "")).replace(/\n/g, "<br />");
}

function deriveQuestionTitle(description) {
    const clean = String(description || "").trim().replace(/\s+/g, " ");
    if (!clean) return "";
    if (clean.length <= 72) return clean;
    return `${clean.slice(0, 69).trimEnd()}...`;
}

function extractHashtagsFromText(text) {
    return Array.from(
        new Set(
            (String(text || "").match(/#[a-z0-9][a-z0-9_-]*/gi) || [])
                .map((tag) => tag.slice(1).toLowerCase())
                .filter(Boolean)
        )
    );
}

export function mountCommunityExperience({
    root = document,
    user = null,
    role = "student",
    useHash = false,
    onRequireAuth = null
} = {}) {
    const queryOne = (selector) => root?.querySelector?.(selector) || null;
    const queryAll = (selector) => Array.from(root?.querySelectorAll?.(selector) || []);

    const tabs = queryAll(".t-tab[data-tab]");
    const views = queryAll(".feed-view");
    const createBox = queryOne(".create-post-box");
    const searchInput = queryOne("#communitySearchInput");
    const postInput = queryOne(".post-input");
    const postFeed = queryOne(".post-feed");
    const postBtn = queryOne(".btn-post");
    const gifBtn = queryOne("#btnUploadGif");
    const fileInput = queryOne("#imageUpload");
    const composerAvatar = queryOne("#composerAvatar");

    const questionCountEl = queryOne(".question-count");
    const questionListEl = queryOne(".question-list");
    const questionFilterPills = queryAll("[data-question-filter]");
    const questionComposerEl = queryOne(".question-composer");
    const questionTitleInput = queryOne(".question-title-input");
    const questionDescriptionInput = queryOne(".question-description-input");
    const askQuestionBtn = queryOne(".ask-question-btn");
    const questionFormMessageEl = queryOne(".question-form-message");

    const questionDetailAvatarEl = queryOne(".qd-avatar");
    const questionDetailTitleEl = queryOne(".qd-title");
    const questionDetailDescriptionEl = queryOne(".qd-description");
    const answerTextarea = queryOne(".answer-textarea");
    const answerSubmitBtn = queryOne(".answer-submit-btn");
    const answerListEl = queryOne(".oa-list");
    const answerSortButtons = queryAll(".oa-filter");
    const notifListEl = queryOne(".notif-list");
    const trendingGridEl = queryOne(".trending-grid");
    const famousDoubtsListEl = queryOne(".famous-doubts-list");
    const widgetsColumnEl = queryOne(".widgets-column");
    const replyPreviewEl = (() => {
        if (!createBox) return null;
        const previewEl = document.createElement("div");
        previewEl.className = "composer-reply-preview";
        previewEl.hidden = true;
        createBox.insertAdjacentElement("afterend", previewEl);
        return previewEl;
    })();
    const attachmentPreviewEl = (() => {
        if (!createBox) return null;
        const previewEl = document.createElement("div");
        previewEl.className = "composer-attachment-preview";
        previewEl.hidden = true;
        if (replyPreviewEl) {
            replyPreviewEl.insertAdjacentElement("afterend", previewEl);
        } else {
            createBox.insertAdjacentElement("afterend", previewEl);
        }
        return previewEl;
    })();

    if (composerAvatar && user) {
        composerAvatar.src = user.photoURL || "images/avatar.png";
        composerAvatar.alt = `${getDisplayName(user, "HackLab Member")} avatar`;
    }

    let generalPosts = Array.isArray(DEFAULT_COMMUNITY_POSTS)
        ? DEFAULT_COMMUNITY_POSTS.map((post) => ({
            ...post,
            authorRole: normalizeAuthorRole(post, user?.uid || "", role)
        }))
        : [];
    let askForgeQuestions = normalizeQuestionCollection(DEFAULT_ASKFORGE_QUESTIONS, DEFAULT_ASKFORGE_QUESTIONS, user?.uid || "", role);
    let selectedQuestionId = askForgeQuestions[0]?.id || "";
    let questionFilter = "newest";
    let answerSort = "relevant";
    let selectedMediaLabel = "";
    let selectedMediaType = "";
    let selectedMediaDataUrl = "";
    let activeReplyTarget = null;
    let stopBootstrapRefresh = null;
    let stopWatchingQuestions = null;
    const authorRoleCache = new Map();
    const defaultPostPlaceholder = postInput?.getAttribute("placeholder") || "Share an update";

    const activeHash = useHash ? window.location.hash.replace(/^#/, "").trim().toLowerCase() : "";
    let activeView = activeHash === "askforge" || activeHash === "answer" || activeHash === "general"
        ? activeHash
        : "general";

    if (activeView === "answer" && !selectedQuestionId) {
        activeView = "askforge";
    }

    function getSearchTerm() {
        return String(searchInput?.value || "").trim().toLowerCase();
    }

    function requireUser() {
        if (user) return true;
        if (typeof onRequireAuth === "function") onRequireAuth();
        return false;
    }

    function rememberRole(authorId, authorRole) {
        if (!authorId || !authorRole) return;
        authorRoleCache.set(authorId, authorRole);
    }

    async function resolveAuthorRole(authorId, fallbackRole = "student") {
        if (!authorId) return fallbackRole;

        if (authorRoleCache.has(authorId)) {
            return authorRoleCache.get(authorId);
        }

        if (user?.uid && authorId === user.uid) {
            const currentRole = role === "teacher" ? "teacher" : "student";
            rememberRole(authorId, currentRole);
            return currentRole;
        }

        if (authorId === "seed-mentor" || authorId.includes("mentor")) {
            rememberRole(authorId, "teacher");
            return "teacher";
        }

        try {
            const resolvedRole = await getUserRole(authorId);
            const safeRole = resolvedRole === "teacher" ? "teacher" : "student";
            rememberRole(authorId, safeRole);
            return safeRole;
        } catch (error) {
            console.warn(`Unable to resolve role for ${authorId}:`, error);
            rememberRole(authorId, fallbackRole);
            return fallbackRole;
        }
    }

    async function hydratePostRoles(posts = []) {
        const safePosts = Array.isArray(posts) ? posts : [];
        const hydrated = await Promise.all(safePosts.map(async (post) => {
            const fallbackRole = normalizeAuthorRole(post, user?.uid || "", role);
            const authorRole = post.authorRole
                ? fallbackRole
                : await resolveAuthorRole(post.authorId, fallbackRole);

            rememberRole(post.authorId, authorRole);

            return {
                ...post,
                authorRole
            };
        }));

        generalPosts = hydrated;
        return hydrated;
    }

    function mergeReplyContextWithExistingPosts(posts = []) {
        const safePosts = Array.isArray(posts) ? posts : [];
        const existingPosts = Array.isArray(generalPosts) ? generalPosts : [];

        return safePosts.map((post) => {
            if (post.replyToPostId) {
                return post;
            }

            const existingPost = existingPosts.find((entry) => entry.id === post.id);
            if (!existingPost?.replyToPostId) {
                return post;
            }

            return {
                ...post,
                replyToPostId: existingPost.replyToPostId,
                replyToAuthorId: existingPost.replyToAuthorId,
                replyToAuthorName: existingPost.replyToAuthorName,
                replyToText: existingPost.replyToText
            };
        });
    }

    async function hydrateQuestionRoles(questions) {
        const hydrated = await Promise.all(questions.map(async (question) => {
            const fallbackRole = normalizeAuthorRole(question, user?.uid || "", role);
            const questionRole = question.authorRole
                ? fallbackRole
                : await resolveAuthorRole(question.authorId, fallbackRole);

            rememberRole(question.authorId, questionRole);

            const answers = await Promise.all((question.answers || []).map(async (answer) => {
                const answerFallbackRole = normalizeAuthorRole(answer, user?.uid || "", role);
                const answerRole = answer.authorRole
                    ? answerFallbackRole
                    : await resolveAuthorRole(answer.authorId, answerFallbackRole);

                rememberRole(answer.authorId, answerRole);

                return {
                    ...answer,
                    authorRole: answerRole
                };
            }));

            return {
                ...question,
                authorRole: questionRole,
                answers
            };
        }));

        askForgeQuestions = sortQuestionsNewestFirst(hydrated);
        if (!selectedQuestionId || !askForgeQuestions.some((question) => question.id === selectedQuestionId)) {
            selectedQuestionId = askForgeQuestions[0]?.id || "";
        }
    }

    function syncHash(viewName) {
        if (!useHash) return;
        const nextHash = `#${viewName}`;
        const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
        window.history.replaceState(null, "", nextUrl);
    }

    function setQuestionMessage(message) {
        if (questionFormMessageEl) {
            questionFormMessageEl.textContent = message;
        }
    }

    function getReplyPreviewText(post = {}) {
        const sourceText = String(post.text || post.mediaLabel || "").replace(/\s+/g, " ").trim();
        if (!sourceText) {
            return "Original message";
        }

        return sourceText.length > 140
            ? `${sourceText.slice(0, 137).trimEnd()}...`
            : sourceText;
    }

    function renderReplyPreview() {
        if (!replyPreviewEl) return;

        const hasReplyTarget = Boolean(activeReplyTarget?.postId) && activeView === "general";
        replyPreviewEl.hidden = !hasReplyTarget;

        if (!hasReplyTarget) {
            replyPreviewEl.innerHTML = "";
            if (postInput) {
                postInput.placeholder = defaultPostPlaceholder;
            }
            return;
        }

        if (postInput) {
            postInput.placeholder = `Reply to ${activeReplyTarget.authorName || "this post"}...`;
        }

        replyPreviewEl.innerHTML = `
            <div class="composer-reply-card">
                <div class="composer-reply-head">
                    <span class="composer-reply-label">Replying to ${escapeHtml(activeReplyTarget.authorName || "HackLab Member")}</span>
                    <button type="button" class="composer-reply-clear" data-action="clear-reply-target">Cancel</button>
                </div>
                <p class="composer-reply-text">${escapeHtml(activeReplyTarget.text || "Original message")}</p>
            </div>
        `;
    }

    function clearReplyTarget() {
        activeReplyTarget = null;
        renderReplyPreview();
    }

    function openReplyComposer(postId = "") {
        if (!requireUser()) return;

        const post = generalPosts.find((entry) => entry.id === postId);
        if (!post) return;

        activeReplyTarget = {
            postId: post.id,
            authorId: post.authorId || "",
            authorName: post.authorName || "HackLab Member",
            text: getReplyPreviewText(post)
        };

        setActiveView("general");
        createBox?.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
        renderReplyPreview();

        window.setTimeout(() => {
            postInput?.focus();
        }, 120);
    }

    function setMediaButtonLabel(label = "") {
        if (!gifBtn) return;

        if (!label) {
            gifBtn.innerHTML = `
                ${getUploadIconMarkup()}
                <span>Upload</span>
            `;
            return;
        }

        gifBtn.innerHTML = `
            ${getUploadIconMarkup()}
            <span>${escapeHtml(label)}</span>
        `;
    }

    function renderAttachmentPreview() {
        if (!attachmentPreviewEl) return;

        const hasAttachment = Boolean(selectedMediaLabel || selectedMediaDataUrl);
        attachmentPreviewEl.hidden = !hasAttachment || activeView !== "general";

        if (!hasAttachment) {
            attachmentPreviewEl.innerHTML = "";
            return;
        }

        const imageMarkup = selectedMediaType.startsWith("image/") && selectedMediaDataUrl
            ? `<img src="${escapeHtml(selectedMediaDataUrl)}" alt="${escapeHtml(selectedMediaLabel || "Selected image")}" class="composer-attachment-image" />`
            : `<div class="composer-attachment-file">${escapeHtml(selectedMediaLabel || "Attachment selected")}</div>`;

        attachmentPreviewEl.innerHTML = `
            <div class="composer-attachment-card">
                <div class="composer-attachment-head">
                    <span class="composer-attachment-label">Selected attachment</span>
                    <button type="button" class="composer-attachment-remove" data-action="clear-attachment">Remove</button>
                </div>
                ${imageMarkup}
                <span class="composer-attachment-name">${escapeHtml(selectedMediaLabel || "Attachment")}</span>
            </div>
        `;
    }

    function clearSelectedAttachment(options = {}) {
        const shouldResetInput = options.resetInput !== false;

        selectedMediaLabel = "";
        selectedMediaType = "";
        selectedMediaDataUrl = "";

        if (shouldResetInput && fileInput) {
            fileInput.value = "";
        }

        setMediaButtonLabel();
        renderAttachmentPreview();
    }

    function readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
            reader.onerror = () => reject(reader.error || new Error("Unable to read the selected file."));
            reader.readAsDataURL(file);
        });
    }

    function getVisibleTab(viewName = activeView) {
        return viewName === "general" ? "general" : "askforge";
    }

    function setActiveView(viewName, options = {}) {
        const normalizedView = viewName === "answer" && !selectedQuestionId ? "askforge" : viewName;
        activeView = normalizedView === "general" || normalizedView === "askforge" || normalizedView === "answer"
            ? normalizedView
            : "general";

        const visibleTab = getVisibleTab(activeView);

        tabs.forEach((tab) => {
            tab.classList.toggle("active", tab.dataset.tab === visibleTab);
        });

        views.forEach((view) => {
            view.classList.toggle("active", view.id === `view-${activeView}`);
        });

        if (createBox) {
            createBox.style.display = activeView === "general" ? "flex" : "none";
        }

        renderReplyPreview();
        renderAttachmentPreview();

        if (widgetsColumnEl) {
            widgetsColumnEl.style.display = "";
        }

        if (options.syncHash !== false) {
            syncHash(activeView);
        }
    }

    function buildPostMarkup(post) {
        const isOwner = Boolean(user?.uid && post.authorId === user.uid);
        const roleBadge = renderRoleBadge(post.authorRole);
        const replyMarkup = post.replyToPostId
            ? `
                <div class="post-reply-context">
                    <span class="post-reply-label">Replying to ${escapeHtml(post.replyToAuthorName || "HackLab Member")}</span>
                    <p class="post-reply-text">${escapeHtml(post.replyToText || "Original message")}</p>
                </div>
            `
            : "";
        const textMarkup = String(post.text || "").trim()
            ? `<p class="post-text">${formatParagraphs(post.text)}</p>`
            : "";
        const mediaMarkup = post.mediaType?.startsWith("image/") && post.mediaDataUrl
            ? `
                <figure class="post-media-wrap">
                    <img src="${escapeHtml(post.mediaDataUrl)}" alt="${escapeHtml(post.mediaLabel || "Community image")}" class="post-media-image" />
                    ${post.mediaLabel ? `<figcaption class="post-media-caption">${escapeHtml(post.mediaLabel)}</figcaption>` : ""}
                </figure>
            `
            : post.mediaLabel
                ? `<p class="post-media-label">Attachment: ${escapeHtml(post.mediaLabel)}</p>`
                : "";

        return `
            <article class="post-card" data-post-id="${escapeHtml(post.id)}">
                <div class="post-author-row">
                    <img src="${escapeHtml(post.authorAvatar || "images/avatar.png")}" alt="${escapeHtml(post.authorName)}" class="post-avatar" />
                    <div class="author-heading">
                        <h4 class="author-name">${escapeHtml(post.authorName || "HackLab Member")}</h4>
                        ${roleBadge}
                    </div>
                </div>
                <div class="post-bubble-container">
                    <div class="post-bubble">
                        ${replyMarkup}
                        ${textMarkup}
                        ${mediaMarkup}
                        <button class="reply-btn" type="button" data-action="reply-post" data-id="${escapeHtml(post.id)}">Reply</button>
                    </div>
                </div>
                <div class="post-actions">
                    <button class="action-btn" type="button" data-action="like-post" data-id="${escapeHtml(post.id)}" aria-label="Like post">👍 ${escapeHtml(formatCompactCount(post.likeCount || 0))}</button>
                    ${isOwner ? `<button class="action-btn action-btn-secondary" type="button" data-action="edit-post" data-id="${escapeHtml(post.id)}">Edit</button>` : ""}
                    ${isOwner ? `<button class="action-btn action-btn-danger" type="button" data-action="delete-post" data-id="${escapeHtml(post.id)}">Delete</button>` : ""}
                </div>
            </article>
        `;
    }

    function renderPosts() {
        if (!postFeed) return;

        const searchTerm = getSearchTerm();
        const visiblePosts = [...(Array.isArray(generalPosts) ? generalPosts : [])]
            .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
            .filter((post) => {
                if (!searchTerm) return true;
                return [
                    post.authorName,
                    post.text,
                    post.mediaLabel,
                    post.replyToAuthorName,
                    post.replyToText
                ].some((value) => matchesSearch(value, searchTerm));
            });

        if (!visiblePosts.length) {
            const emptyMessage = searchTerm
                ? "No community posts match this search yet. Try another keyword or publish a new update."
                : "No posts yet. Be the first to share an update with the community.";
            postFeed.innerHTML = `
                <div class="post-card">
                    <div class="post-bubble-container" style="padding-left: 0;">
                        <div class="post-bubble" style="max-width: 100%;">
                            <p class="post-text">${escapeHtml(emptyMessage)}</p>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        postFeed.innerHTML = visiblePosts.map(buildPostMarkup).join("");
    }

    function getNotificationSnippet(value, fallback = "") {
        const normalizedValue = String(value || "")
            .replace(/\s+/g, " ")
            .trim();

        if (!normalizedValue) {
            return fallback;
        }

        return normalizedValue.length > 84
            ? `${normalizedValue.slice(0, 81).trimEnd()}...`
            : normalizedValue;
    }

    function getNotificationItems() {
        const currentUserId = String(user?.uid || "").trim();
        if (!currentUserId) {
            return [];
        }

        const replyNotifications = (Array.isArray(generalPosts) ? generalPosts : [])
            .filter((post) => String(post.replyToAuthorId || "").trim() === currentUserId)
            .filter((post) => String(post.authorId || "").trim() !== currentUserId)
            .map((post) => ({
                id: `reply-${post.id}`,
                type: "reply",
                timestamp: new Date(post.createdAt || 0).getTime(),
                title: `${post.authorName || "A HackLab member"} replied to your post`,
                meta: `${formatRelativeTime(post.createdAt)} - ${getNotificationSnippet(post.text || post.mediaLabel, "Open the community lane to read it.")}`
            }));

        const answerNotifications = askForgeQuestions.flatMap((question) => {
            if (String(question.authorId || "").trim() !== currentUserId) {
                return [];
            }

            return (question.answers || [])
                .filter((answer) => String(answer.authorId || "").trim() !== currentUserId)
                .map((answer) => ({
                    id: `answer-${question.id}-${answer.id}`,
                    type: "answer",
                    timestamp: new Date(answer.createdAt || 0).getTime(),
                    title: `${answer.authorName || "A HackLab member"} answered your doubt`,
                    meta: `${formatRelativeTime(answer.createdAt)} - ${getNotificationSnippet(answer.text, question.title || "Open AskForge to review the answer.")}`
                }));
        });

        const likeNotifications = (Array.isArray(generalPosts) ? generalPosts : [])
            .filter((post) => String(post.authorId || "").trim() === currentUserId)
            .filter((post) => Number(post.likeCount || 0) > 0)
            .map((post) => {
                const likesCount = Number(post.likeCount || 0);
                const likeLabel = `${formatCompactCount(likesCount)} like${likesCount === 1 ? "" : "s"}`;

                return {
                    id: `like-${post.id}`,
                    type: "like",
                    timestamp: new Date(post.createdAt || 0).getTime(),
                    title: `Your post has ${likeLabel}`,
                    meta: `Live reaction count - ${getNotificationSnippet(post.text || post.mediaLabel, "Keep the momentum going in the community lane.")}`
                };
            });

        return [...replyNotifications, ...answerNotifications, ...likeNotifications]
            .sort((left, right) => {
                const leftTime = Number.isFinite(left.timestamp) ? left.timestamp : 0;
                const rightTime = Number.isFinite(right.timestamp) ? right.timestamp : 0;
                return rightTime - leftTime;
            })
            .slice(0, 4);
    }

    function getNotificationIconSvg(type) {
        switch (type) {
            case "reply":
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
            case "answer":
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>`;
            case "like":
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
            default:
                return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`;
        }
    }

    function renderNotifications() {
        if (!notifListEl) return;

        const notificationItems = getNotificationItems();
        if (!notificationItems.length) {
            notifListEl.innerHTML = `
                <div class="notif-pill notif-pill--empty">
                    <div class="notif-pill-icon" aria-hidden="true">
                        ${getNotificationIconSvg("empty")}
                    </div>
                    <div class="notif-pill-body">
                        <span class="notif-pill-title">No notifications yet</span>
                        <span class="notif-pill-meta">When anything happens in the community, it will appear here automatically.</span>
                    </div>
                </div>
            `;
            return;
        }

        notifListEl.innerHTML = notificationItems.map((item) => `
            <div class="notif-pill notif-pill--${escapeHtml(item.type)}">
                <div class="notif-pill-icon" aria-hidden="true">
                    ${getNotificationIconSvg(item.type)}
                </div>
                <div class="notif-pill-body">
                    <span class="notif-pill-title">${escapeHtml(item.title)}</span>
                    <span class="notif-pill-meta">${escapeHtml(item.meta)}</span>
                </div>
            </div>
        `).join("");
    }

    function getFilteredQuestions() {
        const searchTerm = getSearchTerm();
        return sortQuestionsNewestFirst(askForgeQuestions).filter((question) => {
            if (questionFilter === "unanswered" && (question.answers?.length || 0) > 0) {
                return false;
            }

            if (!searchTerm) return true;
            return [
                question.authorName,
                question.title,
                question.description
            ].some((value) => matchesSearch(value, searchTerm));
        });
    }

    function renderQuestions() {
        if (questionCountEl) {
            questionCountEl.textContent = formatQuestionCount(askForgeQuestions.length);
        }

        questionFilterPills.forEach((button) => {
            button.classList.toggle("active", button.dataset.questionFilter === questionFilter);
        });

        if (!questionListEl) return;

        const visibleQuestions = getFilteredQuestions();
        if (!visibleQuestions.length) {
            questionListEl.innerHTML = `
                <div class="question-card">
                    <div class="q-left">
                        <div class="q-info">
                            <h3 class="q-title">No matching doubts yet</h3>
                            <p class="q-meta">Try another search, switch filters, or post your own question above.</p>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        questionListEl.innerHTML = visibleQuestions.map((question) => {
            const answersCount = question.answers?.length || 0;
            const answerLabel = `${answersCount} answer${answersCount === 1 ? "" : "s"}`;
            return `
                <div class="question-card" data-question-id="${escapeHtml(question.id)}">
                    <div class="q-left">
                        <img src="${escapeHtml(question.authorAvatar || "images/avatar.png")}" alt="${escapeHtml(question.authorName)}" class="q-avatar" />
                        <div class="q-info">
                            <h3 class="q-title">${escapeHtml(question.title)}</h3>
                            <p class="q-meta">
                                by ${escapeHtml(question.authorName)}, asked ${escapeHtml(formatRelativeTime(question.createdAt))} · ${escapeHtml(answerLabel)}
                                ${renderRoleBadge(question.authorRole)}
                            </p>
                        </div>
                    </div>
                    <button class="btn-answer" type="button" data-open-question="${escapeHtml(question.id)}">Answer</button>
                </div>
            `;
        }).join("");
    }

    function getSelectedQuestion() {
        return askForgeQuestions.find((question) => question.id === selectedQuestionId) || askForgeQuestions[0] || null;
    }

    function sortAnswers(answers) {
        if (answerSort === "latest") {
            return [...answers].sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
        }

        return [...answers].sort((left, right) => {
            if (left.authorRole === "teacher" && right.authorRole !== "teacher") return -1;
            if (right.authorRole === "teacher" && left.authorRole !== "teacher") return 1;
            return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
        });
    }

    function renderAnswerView() {
        const question = getSelectedQuestion();

        answerSortButtons.forEach((button) => {
            const expectedSort = button.textContent.trim().toLowerCase() === "latest" ? "latest" : "relevant";
            button.classList.toggle("active", expectedSort === answerSort);
        });

        if (!question) {
            if (questionDetailTitleEl) questionDetailTitleEl.textContent = "Choose a question";
            if (questionDetailDescriptionEl) questionDetailDescriptionEl.textContent = "Open a doubt from AskForge to answer it in detail.";
            if (answerListEl) {
                answerListEl.innerHTML = `
                    <div class="oa-card">
                        <p class="oa-text">No question is selected yet.</p>
                        <p class="oa-author">Pick a doubt from AskForge first.</p>
                    </div>
                `;
            }
            return;
        }

        if (questionDetailAvatarEl) {
            questionDetailAvatarEl.src = question.authorAvatar || "images/avatar.png";
            questionDetailAvatarEl.alt = `${question.authorName} avatar`;
        }
        if (questionDetailTitleEl) {
            questionDetailTitleEl.textContent = question.title;
        }
        if (questionDetailDescriptionEl) {
            questionDetailDescriptionEl.textContent = question.description;
        }
        if (answerTextarea) {
            answerTextarea.placeholder = `Share an answer for ${question.authorName}'s doubt...`;
        }

        if (!answerListEl) return;

        const answers = sortAnswers(question.answers || []);
        if (!answers.length) {
            answerListEl.innerHTML = `
                <div class="oa-card">
                    <p class="oa-text">No answers yet. Be the first one to help with this doubt.</p>
                    <p class="oa-author">Fresh question</p>
                </div>
            `;
            return;
        }

        answerListEl.innerHTML = answers.map((answer) => `
            <div class="oa-card">
                <p class="oa-text">${formatParagraphs(answer.text)}</p>
                <p class="oa-author">
                    by - ${escapeHtml(answer.authorName)}
                    ${renderRoleBadge(answer.authorRole)}
                </p>
            </div>
        `).join("");
    }

    function renderFamousDoubts() {
        if (!famousDoubtsListEl) return;

        const searchTerm = getSearchTerm();
        const famousQuestions = [...askForgeQuestions]
            .filter((question) => {
                if (!searchTerm) return true;
                return [
                    question.authorName,
                    question.title,
                    question.description
                ].some((value) => matchesSearch(value, searchTerm));
            })
            .sort((left, right) => {
                const answerGap = (right.answers?.length || 0) - (left.answers?.length || 0);
                if (answerGap !== 0) return answerGap;
                return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
            })
            .slice(0, 3);

        if (!famousQuestions.length) {
            famousDoubtsListEl.innerHTML = `
                <div class="famous-doubt-item">
                    <div class="fd-top">
                        <div class="fd-info">
                            <h4>No famous doubts yet</h4>
                            <span class="fd-time">Ask the first one above</span>
                        </div>
                    </div>
                </div>
            `;
            return;
        }

        famousDoubtsListEl.innerHTML = famousQuestions.map((question) => `
            <div class="famous-doubt-item" data-question-id="${escapeHtml(question.id)}">
                <div class="fd-top">
                    <img src="${escapeHtml(question.authorAvatar || "images/avatar.png")}" alt="${escapeHtml(question.authorName)}" class="fd-avatar" />
                    <div class="fd-info">
                        <h4>${escapeHtml(question.title)}</h4>
                        <span class="fd-time">${escapeHtml(`${question.answers?.length || 0} answer${(question.answers?.length || 0) === 1 ? "" : "s"} · ${formatRelativeTime(question.createdAt)}`)}</span>
                    </div>
                </div>
                <button class="btn-answer-detail" type="button" data-detail-question="${escapeHtml(question.id)}">Answer in detail</button>
            </div>
        `).join("");
    }

    function renderTrendingTags() {
        if (!trendingGridEl) return;

        const trendMap = new Map();
        const addTags = (text, createdAt) => {
            extractHashtagsFromText(text).forEach((tag) => {
                const previous = trendMap.get(tag) || {
                    tag,
                    count: 0,
                    lastSeenAt: 0
                };

                const timestamp = new Date(createdAt || 0).getTime();
                trendMap.set(tag, {
                    tag,
                    count: previous.count + 1,
                    lastSeenAt: Math.max(previous.lastSeenAt, Number.isFinite(timestamp) ? timestamp : 0)
                });
            });
        };

        (Array.isArray(generalPosts) ? generalPosts : []).forEach((post) => {
            addTags(post.text, post.createdAt);
        });

        (Array.isArray(askForgeQuestions) ? askForgeQuestions : []).forEach((question) => {
            addTags(question.title, question.createdAt);
            addTags(question.description, question.createdAt);
            (question.answers || []).forEach((answer) => {
                addTags(answer.text, answer.createdAt);
            });
        });

        const trendingTags = [...trendMap.values()]
            .sort((left, right) => {
                if (right.count !== left.count) return right.count - left.count;
                if (right.lastSeenAt !== left.lastSeenAt) return right.lastSeenAt - left.lastSeenAt;
                return left.tag.localeCompare(right.tag);
            })
            .slice(0, 9);

        if (!trendingTags.length) {
            trendingGridEl.innerHTML = `
                <span class="trend-tag">Add #tags in posts or doubts</span>
            `;
            return;
        }

        trendingGridEl.innerHTML = trendingTags.map((entry) => `
            <button class="trend-tag" type="button" data-trend-tag="${escapeHtml(entry.tag)}">#${escapeHtml(entry.tag)}</button>
        `).join("");
    }

    function renderAll() {
        renderPosts();
        renderQuestions();
        renderAnswerView();
        renderNotifications();
        renderTrendingTags();
        renderFamousDoubts();
    }

    async function refreshPosts() {
        try {
            const nextPosts = await loadCommunityPosts("general", DEFAULT_COMMUNITY_POSTS);
            await hydratePostRoles(mergeReplyContextWithExistingPosts(nextPosts));
            renderPosts();
            renderNotifications();
            renderTrendingTags();
        } catch (error) {
            console.error("Unable to refresh the community feed:", error);
        }
    }

    async function applyBootstrapToCommunity(bootstrap) {
        if (!bootstrap) return;

        const posts = bootstrap.community?.general;
        if (Array.isArray(posts)) {
            await hydratePostRoles(mergeReplyContextWithExistingPosts(posts));
            renderPosts();
            renderNotifications();
            renderTrendingTags();
        }

        const questions = bootstrap.content?.[CONTENT_PATHS.askForgeQuestions]?.value;
        if (Array.isArray(questions)) {
            askForgeQuestions = normalizeQuestionCollection(questions, DEFAULT_ASKFORGE_QUESTIONS, user?.uid || "", role);
            await hydrateQuestionRoles(askForgeQuestions);
            renderQuestions();
            renderAnswerView();
            renderNotifications();
            renderTrendingTags();
            renderFamousDoubts();
        }
    }

    const handleCommunityBootstrap = (event) => {
        applyBootstrapToCommunity(event.detail).catch((error) => {
            console.error("Unable to apply community bootstrap:", error);
        });
    };

    async function publishPost() {
        if (!requireUser()) return;

        const text = String(postInput?.value || "").trim();
        if (!text && !selectedMediaLabel && !selectedMediaDataUrl) {
            return;
        }

        if (postBtn) {
            postBtn.disabled = true;
        }

        try {
            const createdPost = await createCommunityPost({
                feed: "general",
                authorId: user.uid,
                authorName: getDisplayName(user, role === "teacher" ? "HackLab Teacher" : "HackLab Member"),
                authorRole: role === "teacher" ? "teacher" : "student",
                authorAvatar: user.photoURL || "images/avatar.png",
                text,
                mediaLabel: selectedMediaLabel,
                mediaType: selectedMediaType,
                mediaDataUrl: selectedMediaDataUrl,
                replyToPostId: activeReplyTarget?.postId || "",
                replyToAuthorId: activeReplyTarget?.authorId || "",
                replyToAuthorName: activeReplyTarget?.authorName || "",
                replyToText: activeReplyTarget?.text || ""
            });

            generalPosts = [createdPost, ...generalPosts.filter((entry) => entry.id !== createdPost.id)];
            if (postInput) postInput.value = "";
            clearReplyTarget();
            clearSelectedAttachment();
            renderPosts();
            renderNotifications();
            renderTrendingTags();
        } catch (error) {
            console.error("Unable to publish this post:", error);
            window.alert("Unable to publish this post right now.");
        } finally {
            if (postBtn) {
                postBtn.disabled = false;
            }
        }
    }

    async function editPost(postId) {
        const post = generalPosts.find((entry) => entry.id === postId && entry.authorId === user?.uid);
        if (!post) return;

        const nextText = window.prompt("Edit your message", post.text || "");
        if (nextText === null) return;

        const trimmedText = nextText.trim();
        if (!trimmedText && !post.mediaLabel && !post.mediaDataUrl) {
            window.alert("Your message cannot be empty.");
            return;
        }

        try {
            const updatedPost = await updateCommunityPost("general", postId, {
                authorId: user.uid,
                text: trimmedText,
                mediaLabel: post.mediaLabel || "",
                mediaType: post.mediaType || "",
                mediaDataUrl: post.mediaDataUrl || ""
            });

            generalPosts = generalPosts.map((entry) => entry.id === postId ? {
                ...entry,
                ...updatedPost,
                authorRole: updatedPost.authorRole || entry.authorRole
            } : entry);
            renderPosts();
            renderNotifications();
        } catch (error) {
            console.error("Unable to edit this message:", error);
            window.alert("Unable to edit this message right now.");
        }
    }

    async function removePost(postId) {
        const post = generalPosts.find((entry) => entry.id === postId && entry.authorId === user?.uid);
        if (!post) return;

        if (!window.confirm("Delete this message from the community feed?")) {
            return;
        }

        try {
            await deleteCommunityPost("general", postId, user.uid);
            generalPosts = generalPosts.filter((entry) => entry.id !== postId);
            renderPosts();
            renderNotifications();
        } catch (error) {
            console.error("Unable to delete this message:", error);
            window.alert("Unable to delete this message right now.");
        }
    }

    async function likePost(postId) {
        const post = generalPosts.find((entry) => entry.id === postId);
        if (!post) return;

        try {
            const updatedPost = await likeCommunityPost("general", postId, user?.uid || "");
            generalPosts = generalPosts.map((entry) => entry.id === postId ? {
                ...entry,
                ...updatedPost,
                authorRole: updatedPost.authorRole || entry.authorRole
            } : entry);
            renderPosts();
            renderNotifications();
        } catch (error) {
            console.error("Unable to like this post:", error);
        }
    }

    async function publishQuestion() {
        if (!requireUser()) return;

        const description = String(questionDescriptionInput?.value || "").trim();
        const title = String(questionTitleInput?.value || "").trim() || deriveQuestionTitle(description);

        if (!description) {
            setQuestionMessage("Add the error details first so the community knows what you need help with.");
            questionDescriptionInput?.focus();
            return;
        }

        if (!title) {
            setQuestionMessage("Add a short title or write a fuller description first.");
            questionTitleInput?.focus();
            return;
        }

        if (askQuestionBtn) {
            askQuestionBtn.disabled = true;
            askQuestionBtn.textContent = "Posting...";
        }

        try {
            const nextQuestion = normalizeQuestion({
                id: makeId("askforge-question"),
                authorId: user.uid,
                authorName: getDisplayName(user, role === "teacher" ? "HackLab Teacher" : "HackLab Member"),
                authorRole: role === "teacher" ? "teacher" : "student",
                authorAvatar: user.photoURL || "images/avatar.png",
                title,
                description,
                createdAt: new Date().toISOString(),
                answers: []
            }, 0, user.uid, role);

            const nextQuestions = [nextQuestion, ...askForgeQuestions];
            await saveContent(CONTENT_PATHS.askForgeQuestions, nextQuestions);
            askForgeQuestions = sortQuestionsNewestFirst(nextQuestions);
            selectedQuestionId = nextQuestion.id;

            if (questionTitleInput) questionTitleInput.value = "";
            if (questionDescriptionInput) questionDescriptionInput.value = "";
            setQuestionMessage("Your doubt is live in AskForge now.");
            renderQuestions();
            renderFamousDoubts();
            renderAnswerView();
            renderNotifications();
            setActiveView("askforge");
        } catch (error) {
            console.error("Unable to post this doubt:", error);
            setQuestionMessage("Unable to post this doubt right now. Please try again.");
        } finally {
            if (askQuestionBtn) {
                askQuestionBtn.disabled = false;
                askQuestionBtn.textContent = "Ask Question";
            }
        }
    }

    function openQuestion(questionId) {
        if (!questionId) return;
        selectedQuestionId = questionId;
        renderAnswerView();
        setActiveView("answer");
    }

    async function publishAnswer() {
        if (!requireUser()) return;

        const question = getSelectedQuestion();
        if (!question) return;

        const text = String(answerTextarea?.value || "").trim();
        if (!text) {
            answerTextarea?.focus();
            return;
        }

        if (answerSubmitBtn) {
            answerSubmitBtn.disabled = true;
            answerSubmitBtn.textContent = "Posting...";
        }

        try {
            const nextAnswer = normalizeAnswer({
                id: makeId("askforge-answer"),
                authorId: user.uid,
                authorName: getDisplayName(user, role === "teacher" ? "HackLab Teacher" : "HackLab Member"),
                authorRole: role === "teacher" ? "teacher" : "student",
                authorAvatar: user.photoURL || "images/avatar.png",
                text,
                createdAt: new Date().toISOString()
            }, question.id, question.answers?.length || 0, user.uid, role);

            const nextQuestions = askForgeQuestions.map((entry) => {
                if (entry.id !== question.id) return entry;
                return {
                    ...entry,
                    answers: [...(entry.answers || []), nextAnswer]
                };
            });

            await saveContent(CONTENT_PATHS.askForgeQuestions, nextQuestions);
            askForgeQuestions = sortQuestionsNewestFirst(nextQuestions);
            if (answerTextarea) answerTextarea.value = "";
            renderQuestions();
            renderAnswerView();
            renderFamousDoubts();
            renderNotifications();
        } catch (error) {
            console.error("Unable to post this answer:", error);
            window.alert("Unable to post this answer right now.");
        } finally {
            if (answerSubmitBtn) {
                answerSubmitBtn.disabled = false;
                answerSubmitBtn.textContent = "Post Answer";
            }
        }
    }

    const handleTabClick = (event) => {
        const tab = event.currentTarget;
        const tabName = tab?.dataset.tab || "general";
        setActiveView(tabName === "askforge" ? "askforge" : "general");
    };

    const handleSearchInput = () => {
        renderAll();
    };

    const handleMediaButtonClick = () => {
        fileInput?.click();
    };

    const handleFileChange = async () => {
        const selectedFile = fileInput?.files?.[0];
        if (!selectedFile) {
            clearSelectedAttachment({ resetInput: false });
            return;
        }

        selectedMediaLabel = selectedFile.name || "";
        selectedMediaType = selectedFile.type || "";
        selectedMediaDataUrl = "";

        if (selectedMediaType.startsWith("image/")) {
            try {
                const compressedImage = await createCompressedImagePayload(selectedFile);
                selectedMediaType = compressedImage.mediaType;
                selectedMediaDataUrl = compressedImage.mediaDataUrl;
            } catch (error) {
                console.error("Unable to read the selected image:", error);
                clearSelectedAttachment({ resetInput: false });
                window.alert("This image is too large. Choose a smaller image or screenshot.");
                return;
            }
        }

        setMediaButtonLabel(selectedMediaLabel || "");
        renderAttachmentPreview();
    };

    const handleQuestionFilterClick = (event) => {
        const button = event.currentTarget;
        questionFilter = button?.dataset.questionFilter === "unanswered" ? "unanswered" : "newest";
        renderQuestions();
    };

    const handleAnswerSortClick = (event) => {
        const button = event.currentTarget;
        answerSort = button.textContent.trim().toLowerCase() === "latest" ? "latest" : "relevant";
        renderAnswerView();
    };

    const handlePostFeedClick = async (event) => {
        const actionButton = event.target.closest("[data-action]");
        if (!actionButton) return;

        const { action, id } = actionButton.dataset;

        if (action === "reply-post") {
            if (id) {
                openReplyComposer(id);
            }
            return;
        }

        if (!id) return;

        if (action === "like-post") {
            await likePost(id);
            return;
        }

        if (action === "edit-post") {
            await editPost(id);
            return;
        }

        if (action === "delete-post") {
            await removePost(id);
        }
    };

    const handleQuestionListClick = (event) => {
        const trigger = event.target.closest("[data-open-question]");
        if (!trigger) return;
        openQuestion(trigger.dataset.openQuestion || "");
    };

    const handleFamousDoubtsClick = (event) => {
        const trigger = event.target.closest("[data-detail-question]");
        if (!trigger) return;
        openQuestion(trigger.dataset.detailQuestion || "");
    };

    const handleTrendingGridClick = (event) => {
        const trigger = event.target.closest("[data-trend-tag]");
        if (!trigger || !searchInput) return;
        searchInput.value = trigger.dataset.trendTag || "";
        renderAll();
    };

    const handleAttachmentPreviewClick = (event) => {
        const trigger = event.target.closest('[data-action="clear-attachment"]');
        if (!trigger) return;
        clearSelectedAttachment();
    };

    const handleReplyPreviewClick = (event) => {
        const trigger = event.target.closest('[data-action="clear-reply-target"]');
        if (!trigger) return;
        clearReplyTarget();
    };

    const handleHashChange = () => {
        if (!useHash) return;

        const nextHash = window.location.hash.replace(/^#/, "").trim().toLowerCase();
        if (nextHash === "askforge") {
            setActiveView("askforge", { syncHash: false });
            return;
        }

        if (nextHash === "answer" && selectedQuestionId) {
            setActiveView("answer", { syncHash: false });
            return;
        }

        setActiveView("general", { syncHash: false });
    };

    tabs.forEach((tab) => {
        tab.addEventListener("click", handleTabClick);
    });
    searchInput?.addEventListener("input", handleSearchInput);
    postBtn?.addEventListener("click", publishPost);
    gifBtn?.addEventListener("click", handleMediaButtonClick);
    fileInput?.addEventListener("change", handleFileChange);
    postInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            publishPost();
        }
    });

    askQuestionBtn?.addEventListener("click", publishQuestion);
    questionDescriptionInput?.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            publishQuestion();
        }
    });

    answerSubmitBtn?.addEventListener("click", publishAnswer);
    answerTextarea?.addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            publishAnswer();
        }
    });

    questionFilterPills.forEach((button) => {
        button.addEventListener("click", handleQuestionFilterClick);
    });
    answerSortButtons.forEach((button) => {
        button.addEventListener("click", handleAnswerSortClick);
    });

    postFeed?.addEventListener("click", handlePostFeedClick);
    questionListEl?.addEventListener("click", handleQuestionListClick);
    famousDoubtsListEl?.addEventListener("click", handleFamousDoubtsClick);
    trendingGridEl?.addEventListener("click", handleTrendingGridClick);
    attachmentPreviewEl?.addEventListener("click", handleAttachmentPreviewClick);
    replyPreviewEl?.addEventListener("click", handleReplyPreviewClick);

    if (useHash) {
        window.addEventListener("hashchange", handleHashChange);
    }

    window.addEventListener("hacklab:bootstrap", handleCommunityBootstrap);

    if (user?.uid) {
        loadBootstrap(user.uid)
            .then((bootstrap) => applyBootstrapToCommunity(bootstrap))
            .catch((error) => {
                console.error("Unable to load community bootstrap:", error);
                refreshPosts();
            });
        stopBootstrapRefresh = startBootstrapPolling(user.uid);
    } else {
        refreshPosts();
    }

    stopWatchingQuestions = watchContent(CONTENT_PATHS.askForgeQuestions, DEFAULT_ASKFORGE_QUESTIONS, async (value) => {
        const normalizedQuestions = normalizeQuestionCollection(value, DEFAULT_ASKFORGE_QUESTIONS, user?.uid || "", role);
        await hydrateQuestionRoles(normalizedQuestions);
        renderQuestions();
        renderAnswerView();
        renderNotifications();
        renderTrendingTags();
        renderFamousDoubts();
    });

    setMediaButtonLabel();
    renderAttachmentPreview();
    setQuestionMessage("Your doubt will appear below as soon as you post it.");
    renderAll();
    setActiveView(activeView, { syncHash: false });

    return () => {
        window.removeEventListener("hacklab:bootstrap", handleCommunityBootstrap);
        stopBootstrapRefresh?.();
        stopWatchingQuestions?.();

        tabs.forEach((tab) => {
            tab.removeEventListener("click", handleTabClick);
        });
        searchInput?.removeEventListener("input", handleSearchInput);
        postBtn?.removeEventListener("click", publishPost);
        gifBtn?.removeEventListener("click", handleMediaButtonClick);
        fileInput?.removeEventListener("change", handleFileChange);
        askQuestionBtn?.removeEventListener("click", publishQuestion);
        answerSubmitBtn?.removeEventListener("click", publishAnswer);
        postFeed?.removeEventListener("click", handlePostFeedClick);
        questionListEl?.removeEventListener("click", handleQuestionListClick);
        famousDoubtsListEl?.removeEventListener("click", handleFamousDoubtsClick);
        trendingGridEl?.removeEventListener("click", handleTrendingGridClick);
        attachmentPreviewEl?.removeEventListener("click", handleAttachmentPreviewClick);
        replyPreviewEl?.removeEventListener("click", handleReplyPreviewClick);

        questionFilterPills.forEach((button) => {
            button.removeEventListener("click", handleQuestionFilterClick);
        });
        answerSortButtons.forEach((button) => {
            button.removeEventListener("click", handleAnswerSortClick);
        });

        if (useHash) {
            window.removeEventListener("hashchange", handleHashChange);
        }
    };
}
