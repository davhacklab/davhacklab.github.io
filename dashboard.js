import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    CONTENT_PATHS,
    DEFAULT_DASHBOARD_ANNOUNCEMENT,
    DEFAULT_EVENTS,
    DEFAULT_OVERVIEW_TASKS,
    DEFAULT_STUDENT_PROFILE,
    DEFAULT_VIDEO_COURSES,
    auth,
    escapeHtml,
    formatCompactDate,
    formatEventDate,
    getDisplayName,
    loadBootstrap,
    loadCommunityPosts,
    loadStudentProfile,
    normalizeCollaborationState,
    saveStudentProfile,
    startBootstrapPolling,
    stopBootstrapPolling,
    watchContent
} from "./portal-data.js";
import {
    getCourseAssignmentEntries,
    normalizeCourses,
    setCourseContentCompletion,
    syncProfileCourseStats
} from "./course-content.js";
import {
    getAcceptedCollaborationContacts,
    getPendingCollaborationRequests,
    loadUserCollaborationState,
    respondToCollaborationRequest
} from "./collaboration-state.js";
import { guardStudentPortal } from "./account-access.js";

const taskToneMap = {
    yellow: {
        cardClass: "task-yellow",
        dotClass: "yellow",
        linkClass: "yellow-link"
    },
    red: {
        cardClass: "task-red",
        dotClass: "red",
        linkClass: "red-link"
    },
    brown: {
        cardClass: "task-brown",
        dotClass: "brown",
        linkClass: "brown-link"
    }
};

const assignmentStatusMeta = {
    completed: {
        label: "Completed",
        actionLabel: "Reopen",
        className: "completed"
    },
    submitted: {
        label: "In Review",
        actionLabel: "Review Pending",
        className: "submitted"
    },
    "in-progress": {
        label: "In Progress",
        actionLabel: "Mark Done",
        className: "in-progress"
    },
    "up-next": {
        label: "Up Next",
        actionLabel: "Start Now",
        className: "up-next"
    }
};

const state = {
    user: null,
    profile: cloneData(DEFAULT_STUDENT_PROFILE),
    courses: normalizeCourses(DEFAULT_VIDEO_COURSES, DEFAULT_VIDEO_COURSES),
    tasks: cloneData(DEFAULT_OVERVIEW_TASKS),
    events: cloneData(DEFAULT_EVENTS),
    assignments: cloneData(DEFAULT_STUDENT_PROFILE.assignments || []),
    communityMetrics: {
        postsCount: 0,
        likesGivenCount: 0
    },
    savingAssignmentId: null,
    announcement: cloneData(DEFAULT_DASHBOARD_ANNOUNCEMENT),
    announcementOpen: false,
    announcementReady: false,
    collaboration: {
        userId: "",
        inbox: [],
        sent: [],
        contacts: []
    }
};

let calendarDate = new Date();
let stopWatchingTasks = null;
let stopWatchingEvents = null;
let stopWatchingCourses = null;
let stopWatchingAnnouncement = null;
let heroActionLink = "events.html";
let stopBootstrapRefresh = null;
let calendarManuallyNavigated = false;

const nameTargets = [
    document.getElementById("userName"),
    document.getElementById("profileName")
];

const profileAvatar = document.getElementById("profileAvatar");
const greetingCopy = document.getElementById("dashboardGreetingCopy");
const profileSubtitle = document.getElementById("profileSubtitle");
const profileEmail = document.getElementById("profileEmail");
const profileQuickStats = document.getElementById("profileQuickStats");
const profileTags = document.getElementById("profileTags");
const profileVerifiedBadge = document.getElementById("profileVerifiedBadge");
if (profileVerifiedBadge) {
    profileVerifiedBadge.hidden = true;
}
const profileEditBtn = document.getElementById("profileEditBtn");
const profileEditModal = document.getElementById("profileEditModal");
const profileEditForm = document.getElementById("profileEditForm");
const profileEditFeedback = document.getElementById("profileEditFeedback");
const profileVerifyStatus = document.getElementById("profileVerifyStatus");
const profileEditClose = document.getElementById("profileEditClose");
const profileEditCancel = document.getElementById("profileEditCancel");
const statCards = Array.from(document.querySelectorAll(".stat-card[data-route]"));
const profileEditFields = {
    displayName: document.getElementById("profileEditName"),
    email: document.getElementById("profileEditEmail"),
    headline: document.getElementById("profileEditHeadline"),
    school: document.getElementById("profileEditSchool"),
    track: document.getElementById("profileEditTrack"),
    location: document.getElementById("profileEditLocation"),
    phone: document.getElementById("profileEditPhone"),
    portfolioUrl: document.getElementById("profileEditPortfolio"),
    bio: document.getElementById("profileEditBio")
};
const taskCards = document.getElementById("taskCards");
const progressList = document.getElementById("progressList");
const assignmentList = document.getElementById("assignmentList");
const progressSummaryPill = document.getElementById("progressSummaryPill");
const assignmentSummaryPill = document.getElementById("assignmentSummaryPill");
const scheduleGridBody = document.getElementById("scheduleGridBody");
const scheduleSubtitle = document.getElementById("scheduleSubtitle");
const heroKicker = document.getElementById("heroKicker");
const heroTitle = document.getElementById("heroTitle");
const heroSummary = document.getElementById("heroSummary");
const heroMeta = document.getElementById("heroMeta");
const heroPrimaryBtn = document.getElementById("heroPrimaryBtn");
const heroSecondaryLink = document.getElementById("heroSecondaryLink");
const collabInboxCount = document.getElementById("collabInboxCount");
const collabInboxList = document.getElementById("collabInboxList");
const collabNetworkList = document.getElementById("collabNetworkList");
const dashboardAnnouncementModal = document.getElementById("dashboardAnnouncementModal");
const dashboardAnnouncementImage = document.getElementById("dashboardAnnouncementImage");
const dashboardAnnouncementEyebrow = document.getElementById("dashboardAnnouncementEyebrow");
const dashboardAnnouncementTitle = document.getElementById("dashboardAnnouncementTitle");
const dashboardAnnouncementSummary = document.getElementById("dashboardAnnouncementSummary");
const dashboardAnnouncementDetails = document.getElementById("dashboardAnnouncementDetails");
const dashboardAnnouncementAction = document.getElementById("dashboardAnnouncementAction");
const dashboardAnnouncementDismiss = document.getElementById("dashboardAnnouncementDismiss");
const dashboardAnnouncementClose = document.getElementById("dashboardAnnouncementClose");
const dashboardAnnouncementUpdated = document.getElementById("dashboardAnnouncementUpdated");
let assignmentFeedbackTimer = null;
const WALKTHROUGH_STORAGE_KEY_PREFIX = "hacklab.dashboard.walkthrough.v1.";
const WALKTHROUGH_PENDING_STORAGE_KEY_PREFIX = "hacklab.dashboard.walkthrough.pending.v1.";
const WALKTHROUGH_STEPS = [
    {
        selector: ".sidebar",
        title: "Navigate the dashboard",
        description: "This sidebar is your map. Overview is your home base, and Resources, Events, Community, Projects, and Articles are one click away."
    },
    {
        selector: ".banner-card",
        title: "Watch the live hero card",
        description: "This top card turns into your next launch point whenever a teacher publishes a new session or update."
    },
    {
        selector: ".stats-row",
        title: "Track your numbers fast",
        description: "These cards give you the quick count for courses, events, projects, and assignments as your profile updates."
    },
    {
        selector: ".rank-section",
        title: "Follow teacher checkpoints",
        description: "Rank Enhancement Tasks are the teacher-published checkpoints you should tackle next."
    },
    {
        selector: ".focus-grid",
        title: "Manage progress and assignments",
        description: "Use these two panels to keep an eye on learning progress and mark assignments as you move through them."
    },
    {
        selector: ".right-panel",
        title: "Use your personal side panel",
        description: "Your profile, calendar, and collaboration inbox stay here so you can see your status and project requests without leaving the page."
    }
];
let dashboardWalkthrough = null;
let walkthroughStarted = false;

function normalizeAnnouncement(value) {
    const nextValue = value && typeof value === "object" ? cloneData(value) : {};
    return {
        ...cloneData(DEFAULT_DASHBOARD_ANNOUNCEMENT),
        ...nextValue,
        id: nextValue.id || DEFAULT_DASHBOARD_ANNOUNCEMENT.id,
        imageUrl: nextValue.imageUrl || DEFAULT_DASHBOARD_ANNOUNCEMENT.imageUrl,
        ctaLabel: nextValue.ctaLabel || DEFAULT_DASHBOARD_ANNOUNCEMENT.ctaLabel,
        ctaUrl: nextValue.ctaUrl || "",
        isActive: Boolean(nextValue.isActive)
    };
}

function getAnnouncementRevision(announcement = state.announcement) {
    const safeAnnouncement = normalizeAnnouncement(announcement);
    return [
        safeAnnouncement.id || DEFAULT_DASHBOARD_ANNOUNCEMENT.id,
        safeAnnouncement.updatedAt || "",
        safeAnnouncement.title || ""
    ].join("::");
}

function getAnnouncementDismissStorageKey(user = state.user) {
    return user?.uid ? `hacklab.dashboard.announcement.dismissed.${user.uid}` : "";
}

function getDismissedAnnouncementRevision(user = state.user) {
    const storageKey = getAnnouncementDismissStorageKey(user);
    if (!storageKey || typeof window === "undefined") return "";

    try {
        return window.localStorage.getItem(storageKey) || "";
    } catch {
        return "";
    }
}

function setDismissedAnnouncementRevision(revision, user = state.user) {
    const storageKey = getAnnouncementDismissStorageKey(user);
    if (!storageKey || typeof window === "undefined") return;

    try {
        window.localStorage.setItem(storageKey, revision || "");
    } catch {
        return;
    }
}

function formatAnnouncementUpdatedAt(value) {
    if (!value) return "Waiting for the next teacher update";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "Updated recently";
    return `Updated ${parsed.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    })}`;
}

function formatAnnouncementParagraphs(text) {
    return String(text || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function ensureAssignmentFeedback() {
    if (!assignmentList?.parentElement) return null;

    let feedbackEl = assignmentList.parentElement.querySelector(".assignment-feedback");
    if (feedbackEl) return feedbackEl;

    feedbackEl = document.createElement("p");
    feedbackEl.className = "assignment-feedback";
    feedbackEl.hidden = true;
    assignmentList.parentElement.insertBefore(feedbackEl, assignmentList);
    return feedbackEl;
}

function setAssignmentFeedback(text = "", tone = "") {
    const feedbackEl = ensureAssignmentFeedback();
    if (!feedbackEl) return;

    feedbackEl.textContent = text;
    feedbackEl.classList.remove("success", "error");
    feedbackEl.hidden = !text;

    if (tone) {
        feedbackEl.classList.add(tone);
    }

    if (assignmentFeedbackTimer) {
        window.clearTimeout(assignmentFeedbackTimer);
        assignmentFeedbackTimer = null;
    }

    if (text) {
        assignmentFeedbackTimer = window.setTimeout(() => {
            feedbackEl.textContent = "";
            feedbackEl.classList.remove("success", "error");
            feedbackEl.hidden = true;
        }, 2600);
    }
}

function getWalkthroughStorageKey(userId = "") {
    return `${WALKTHROUGH_STORAGE_KEY_PREFIX}${userId || "guest"}`;
}

function getWalkthroughPendingStorageKey(userId = "") {
    return `${WALKTHROUGH_PENDING_STORAGE_KEY_PREFIX}${userId || "guest"}`;
}

function hasSeenWalkthrough(userId = "") {
    if (state.profile?.walkthroughCompletedAt) {
        return true;
    }

    try {
        return window.localStorage.getItem(getWalkthroughStorageKey(userId)) === "done";
    } catch (error) {
        console.warn("Unable to read walkthrough state:", error);
        return false;
    }
}

function isWalkthroughPending(userId = "") {
    try {
        return window.localStorage.getItem(getWalkthroughPendingStorageKey(userId)) === "pending";
    } catch (error) {
        console.warn("Unable to read walkthrough pending state:", error);
        return false;
    }
}

async function markWalkthroughSeen(userId = "") {
    try {
        window.localStorage.setItem(getWalkthroughStorageKey(userId), "done");
        window.localStorage.removeItem(getWalkthroughPendingStorageKey(userId));
    } catch (error) {
        console.warn("Unable to save walkthrough state:", error);
    }

    if (!userId || state.user?.uid !== userId) {
        return;
    }

    state.profile = {
        ...state.profile,
        walkthroughCompletedAt: new Date().toISOString()
    };

    try {
        await saveStudentProfile(userId, state.profile);
    } catch (error) {
        console.warn("Unable to persist walkthrough completion:", error);
    }
}

function isWalkthroughTargetVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
        return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

function getVisibleWalkthroughSteps() {
    return WALKTHROUGH_STEPS
        .map((step) => ({
            ...step,
            target: document.querySelector(step.selector)
        }))
        .filter((step) => isWalkthroughTargetVisible(step.target));
}

function clearWalkthroughHighlight() {
    if (dashboardWalkthrough?.activeTarget) {
        dashboardWalkthrough.activeTarget.classList.remove("walkthrough-target-highlight");
        dashboardWalkthrough.activeTarget = null;
    }
}

function positionWalkthroughSpotlight(target) {
    if (!dashboardWalkthrough?.spotlight || !target) return;

    const pad = 12;
    const rect = target.getBoundingClientRect();
    const { spotlight } = dashboardWalkthrough;
    const computedRadius = window.getComputedStyle(target).borderRadius;
    const radius = computedRadius && computedRadius !== "0px" ? computedRadius : "24px";

    spotlight.style.top = `${Math.round(Math.max(8, rect.top - pad))}px`;
    spotlight.style.left = `${Math.round(Math.max(8, rect.left - pad))}px`;
    spotlight.style.width = `${Math.round(Math.max(0, rect.width + pad * 2))}px`;
    spotlight.style.height = `${Math.round(Math.max(0, rect.height + pad * 2))}px`;
    spotlight.style.borderRadius = radius;
}

function positionWalkthroughCard(target) {
    if (!dashboardWalkthrough || !target) return;

    positionWalkthroughSpotlight(target);

    const { card } = dashboardWalkthrough;
    const viewportPadding = 16;
    const gap = 18;
    const rect = target.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();

    let top = rect.bottom + gap;
    if (top + cardRect.height > window.innerHeight - viewportPadding) {
        top = rect.top - cardRect.height - gap;
    }
    if (top < viewportPadding) {
        top = Math.max(viewportPadding, window.innerHeight - cardRect.height - viewportPadding);
    }

    let left = rect.left;
    if (left + cardRect.width > window.innerWidth - viewportPadding) {
        left = rect.right - cardRect.width;
    }
    left = Math.min(Math.max(viewportPadding, left), window.innerWidth - cardRect.width - viewportPadding);

    card.style.top = `${Math.round(top)}px`;
    card.style.left = `${Math.round(left)}px`;
}

function renderWalkthroughStep(index) {
    if (!dashboardWalkthrough) return;

    const { steps, titleEl, bodyEl, countEl, backBtn, nextBtn, overlay } = dashboardWalkthrough;
    const boundedIndex = Math.max(0, Math.min(index, steps.length - 1));
    const step = steps[boundedIndex];
    if (!step?.target) return;

    dashboardWalkthrough.currentIndex = boundedIndex;
    clearWalkthroughHighlight();

    step.target.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "nearest"
    });

    titleEl.textContent = step.title;
    bodyEl.textContent = step.description;
    countEl.textContent = `${boundedIndex + 1} / ${steps.length}`;
    backBtn.disabled = boundedIndex === 0;
    nextBtn.textContent = boundedIndex === steps.length - 1 ? "Finish" : "Next";
    overlay.hidden = false;
    document.body.classList.add("dashboard-tour-active");

    const revealTarget = () => {
        step.target.classList.add("walkthrough-target-highlight");
        dashboardWalkthrough.activeTarget = step.target;
        positionWalkthroughCard(step.target);
    };

    window.setTimeout(revealTarget, 220);
    window.setTimeout(revealTarget, 480);
}

function closeWalkthrough(markSeen = true) {
    if (!dashboardWalkthrough) return;

    clearWalkthroughHighlight();
    dashboardWalkthrough.overlay.hidden = true;
    document.body.classList.remove("dashboard-tour-active");

    if (markSeen && state.user?.uid) {
        void markWalkthroughSeen(state.user.uid);
    }
}

function moveWalkthrough(direction = 1) {
    if (!dashboardWalkthrough) return;

    const nextIndex = dashboardWalkthrough.currentIndex + direction;
    if (nextIndex >= dashboardWalkthrough.steps.length) {
        closeWalkthrough(true);
        return;
    }

    renderWalkthroughStep(nextIndex);
}

function ensureDashboardWalkthrough() {
    if (dashboardWalkthrough) {
        return dashboardWalkthrough;
    }

    const overlay = document.createElement("div");
    overlay.className = "dashboard-walkthrough-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
        <div class="dashboard-walkthrough-spotlight" aria-hidden="true"></div>
        <div class="dashboard-walkthrough-card" role="dialog" aria-modal="true" aria-labelledby="walkthroughTitle">
            <button type="button" class="dashboard-walkthrough-close" aria-label="Close walkthrough">×</button>
            <span class="dashboard-walkthrough-kicker">Dashboard tour</span>
            <h3 id="walkthroughTitle" class="dashboard-walkthrough-title"></h3>
            <p class="dashboard-walkthrough-body"></p>
            <div class="dashboard-walkthrough-footer">
                <button type="button" class="dashboard-walkthrough-skip">Skip</button>
                <div class="dashboard-walkthrough-actions">
                    <span class="dashboard-walkthrough-count">1 / 1</span>
                    <button type="button" class="dashboard-walkthrough-back">Back</button>
                    <button type="button" class="dashboard-walkthrough-next">Next</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const card = overlay.querySelector(".dashboard-walkthrough-card");
    const titleEl = overlay.querySelector(".dashboard-walkthrough-title");
    const bodyEl = overlay.querySelector(".dashboard-walkthrough-body");
    const countEl = overlay.querySelector(".dashboard-walkthrough-count");
    const closeBtn = overlay.querySelector(".dashboard-walkthrough-close");
    const skipBtn = overlay.querySelector(".dashboard-walkthrough-skip");
    const backBtn = overlay.querySelector(".dashboard-walkthrough-back");
    const nextBtn = overlay.querySelector(".dashboard-walkthrough-next");

    const spotlight = overlay.querySelector(".dashboard-walkthrough-spotlight");

    dashboardWalkthrough = {
        overlay,
        spotlight,
        card,
        titleEl,
        bodyEl,
        countEl,
        closeBtn,
        skipBtn,
        backBtn,
        nextBtn,
        steps: [],
        currentIndex: 0,
        activeTarget: null
    };

    closeBtn?.addEventListener("click", () => closeWalkthrough(true));
    skipBtn?.addEventListener("click", () => closeWalkthrough(true));
    backBtn?.addEventListener("click", () => moveWalkthrough(-1));
    nextBtn?.addEventListener("click", () => moveWalkthrough(1));
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            closeWalkthrough(true);
        }
    });

    let walkthroughLayoutFrame = null;
    const syncWalkthroughLayout = () => {
        if (dashboardWalkthrough?.overlay.hidden || !dashboardWalkthrough.activeTarget) {
            return;
        }

        if (walkthroughLayoutFrame) {
            return;
        }

        walkthroughLayoutFrame = window.requestAnimationFrame(() => {
            walkthroughLayoutFrame = null;
            if (!dashboardWalkthrough?.overlay.hidden && dashboardWalkthrough.activeTarget) {
                positionWalkthroughCard(dashboardWalkthrough.activeTarget);
            }
        });
    };

    window.addEventListener("resize", syncWalkthroughLayout);
    window.addEventListener("scroll", syncWalkthroughLayout, true);

    document.addEventListener("keydown", (event) => {
        if (dashboardWalkthrough?.overlay.hidden) return;

        if (event.key === "Escape") {
            closeWalkthrough(true);
            return;
        }

        if (event.key === "ArrowRight") {
            moveWalkthrough(1);
            return;
        }

        if (event.key === "ArrowLeft") {
            moveWalkthrough(-1);
        }
    });

    return dashboardWalkthrough;
}

function maybeStartDashboardWalkthrough(user) {
    if (
        !user?.uid ||
        walkthroughStarted ||
        hasSeenWalkthrough(user.uid) ||
        !isWalkthroughPending(user.uid) ||
        !state.announcementReady ||
        state.announcementOpen
    ) {
        return;
    }

    const walkthrough = ensureDashboardWalkthrough();
    const steps = getVisibleWalkthroughSteps();
    if (!steps.length) {
        return;
    }

    walkthrough.steps = steps;
    walkthroughStarted = true;
    renderWalkthroughStep(0);
}

function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
}

function normalizeNumber(value, fallback = 0) {
    const numeric = Number.parseInt(value, 10);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizePercent(value) {
    return Math.max(0, Math.min(100, normalizeNumber(value, 0)));
}

function normalizeProfile(profile, user) {
    const fallbackProfile = {
        ...cloneData(DEFAULT_STUDENT_PROFILE),
        displayName: getDisplayName(user, DEFAULT_STUDENT_PROFILE.displayName),
        email: user?.email || ""
    };

    return {
        ...fallbackProfile,
        ...cloneData(profile || {}),
        stats: {
            ...(fallbackProfile.stats || {}),
            ...cloneData(profile?.stats || {})
        },
        progress: Array.isArray(profile?.progress) && profile.progress.length
            ? cloneData(profile.progress)
            : cloneData(fallbackProfile.progress || []),
        assignments: Array.isArray(profile?.assignments) && profile.assignments.length
            ? cloneData(profile.assignments)
            : cloneData(fallbackProfile.assignments || []),
        teacherTags: Array.isArray(profile?.teacherTags)
            ? cloneData(profile.teacherTags)
            : cloneData(fallbackProfile.teacherTags || []),
        courseProgress: profile?.courseProgress && typeof profile.courseProgress === "object"
            ? cloneData(profile.courseProgress)
            : cloneData(fallbackProfile.courseProgress || {})
    };
}

function getProfileRequiredFields(profile = {}) {
    return {
        displayName: profile.displayName,
        email: profile.email,
        headline: profile.headline,
        school: profile.school,
        track: profile.track,
        location: profile.location,
        phone: profile.phone,
        portfolioUrl: profile.portfolioUrl,
        bio: profile.bio
    };
}

function getProfileVerificationChecks(profile = {}) {
    const requiredFields = getProfileRequiredFields(profile);
    const normalizedDisplayName = String(requiredFields.displayName || "").trim().toLowerCase();
    const isMeaningfulText = (value, minimumLength = 2) => String(value || "").trim().length >= minimumLength;
    const hasValidUrl = (value = "") => /^https?:\/\/\S+/i.test(String(value || "").trim());
    const phoneDigits = String(requiredFields.phone || "").replace(/\D/g, "");

    return {
        displayName: isMeaningfulText(requiredFields.displayName, 2) && normalizedDisplayName !== "hacklab student",
        email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(requiredFields.email || "").trim()),
        headline: isMeaningfulText(requiredFields.headline, 2),
        school: isMeaningfulText(requiredFields.school, 2),
        track: isMeaningfulText(requiredFields.track, 2),
        location: isMeaningfulText(requiredFields.location, 2),
        phone: phoneDigits.length >= 7,
        portfolioUrl: hasValidUrl(requiredFields.portfolioUrl),
        bio: isMeaningfulText(requiredFields.bio, 8)
    };
}

function getFilledProfileFieldCount(profile = {}) {
    return Object.values(getProfileVerificationChecks(profile)).filter(Boolean).length;
}

function isProfileVerified(profile = {}) {
    const checks = getProfileVerificationChecks(profile);
    return Object.keys(checks).length > 0 && Object.values(checks).every(Boolean);
}

function syncProfileVerifiedBadge(profile = state.profile) {
    if (!profileVerifiedBadge) return;

    const verified = isProfileVerified(profile);
    profileVerifiedBadge.hidden = !verified;
    profileVerifiedBadge.setAttribute("aria-label", verified ? "Verified" : "Profile not verified");
    profileVerifiedBadge.setAttribute("title", verified ? "Verified" : "Complete your profile to unlock the verified badge");
}

function syncDerivedProfileState(profile = state.profile) {
    const nextProfile = syncProfileCourseStats(normalizeProfile(profile, state.user), state.courses);
    nextProfile.stats ||= {};

    if (!Array.isArray(state.courses) || !state.courses.length) {
        nextProfile.stats.completedAssignments = Array.isArray(nextProfile.assignments)
            ? nextProfile.assignments.filter((assignment) => assignment?.status === "completed").length
            : 0;
    }

    return nextProfile;
}

function syncStudentProfile() {
    state.profile = syncDerivedProfileState(state.profile);
    state.assignments = getVisibleAssignments();
}

function setProfileEditFeedback(text = "", tone = "") {
    if (!profileEditFeedback) return;
    profileEditFeedback.textContent = text;
    profileEditFeedback.dataset.state = tone || "";
}

function updateProfileVerificationCopy(profile = state.profile) {
    if (!profileVerifyStatus) return;

    const filledFields = getFilledProfileFieldCount(profile);
    const totalFields = Object.keys(getProfileRequiredFields(profile)).length;
    const remainingFields = Math.max(0, totalFields - filledFields);

    profileVerifyStatus.textContent = isProfileVerified(profile)
        ? "Verified tick active. Your profile now looks complete and trusted on the dashboard."
        : `Fill ${remainingFields} more core detail${remainingFields === 1 ? "" : "s"} properly to unlock the verified tick.`;
}

function openProfileEditor() {
    if (!profileEditModal) return;

    Object.entries(profileEditFields).forEach(([key, field]) => {
        if (!field) return;
        field.value = state.profile?.[key] || "";
    });

    syncProfileVerifiedBadge(state.profile);
    updateProfileVerificationCopy();
    setProfileEditFeedback("");
    profileEditModal.hidden = false;
}

function closeProfileEditor() {
    if (!profileEditModal) return;
    profileEditModal.hidden = true;
    syncProfileVerifiedBadge(state.profile);
    updateProfileVerificationCopy(state.profile);
    setProfileEditFeedback("");
}

function compactLabel(value = "", maxLength = 24) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function openRoute(route = "") {
    const nextRoute = String(route || "").trim();
    if (!nextRoute) return;

    if (nextRoute === "#profile-edit") {
        openProfileEditor();
        return;
    }

    if (/^https?:\/\//i.test(nextRoute)) {
        window.open(nextRoute, "_blank", "noopener,noreferrer");
        return;
    }

    if (nextRoute.startsWith("#")) {
        const target = document.querySelector(nextRoute);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
    }

    window.location.href = nextRoute;
}

function getDayKey(dateValue) {
    return [
        dateValue.getFullYear(),
        String(dateValue.getMonth() + 1).padStart(2, "0"),
        String(dateValue.getDate()).padStart(2, "0")
    ].join("-");
}

function getEventDateValue(eventItem) {
    if (!eventItem?.date) return Number.POSITIVE_INFINITY;
    const parsed = new Date(`${eventItem.date}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? Number.POSITIVE_INFINITY : parsed.getTime();
}

function sortEventsByDate(items) {
    return [...items].sort((left, right) => getEventDateValue(left) - getEventDateValue(right));
}

function getUpcomingEvents() {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    return sortEventsByDate(state.events).filter((eventItem) => {
        if (!eventItem?.date) return false;
        const parsed = new Date(`${eventItem.date}T23:59:59`);
        return !Number.isNaN(parsed.getTime()) && parsed.getTime() >= startOfToday.getTime();
    });
}

function getEventView(eventItem = {}) {
    const parsed = new Date(`${eventItem.date || "2026-01-01"}T23:59:59`);
    if (Number.isNaN(parsed.getTime())) {
        return "upcoming";
    }

    return parsed.getTime() < Date.now() ? "past" : "upcoming";
}

function getEventRoute(eventItem = {}) {
    const params = new URLSearchParams();
    params.set("view", getEventView(eventItem));

    if (eventItem.id) {
        params.set("eventId", eventItem.id);
    }

    return `events.html?${params.toString()}`;
}

function maybeAlignCalendarToEvents(force = false) {
    if (calendarManuallyNavigated && !force) return;

    const anchorEvent = getUpcomingEvents()[0] || sortEventsByDate(state.events)[0];
    if (!anchorEvent?.date) return;

    const parsed = new Date(`${anchorEvent.date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return;

    calendarDate = parsed;
}

function getCommunityGoalStatus(progressCount = 0, targetCount = 1) {
    if (progressCount >= targetCount) return "completed";
    if (progressCount > 0) return "in-progress";
    return "up-next";
}

function getProfileVerificationTask(profile = state.profile) {
    const completedDetails = getFilledProfileFieldCount(profile);
    const totalDetails = Object.keys(getProfileVerificationChecks(profile)).length;
    const verified = isProfileVerified(profile);

    return {
        id: "profile-verify-account",
        title: "Verify your account",
        description: verified
            ? "Your profile is verified and the badge is now active on your dashboard."
            : `${completedDetails}/${totalDetails} profile details completed. Fill the full profile to unlock the verified badge.`,
        status: verified
            ? "completed"
            : completedDetails > 0 ? "in-progress" : "up-next",
        actionUrl: "#profile-edit",
        ctaLabel: verified ? "Verified" : "Complete Profile",
        tag: "Profile",
        source: "profile-verification"
    };
}

function isLegacyVideoTask(task = {}) {
    const raw = `${task.id || ""} ${task.title || ""} ${task.description || ""}`.toLowerCase();
    return /news reporter|filmora|premiere|after effects|tnp news/.test(raw);
}

function getActiveOverviewTasks(tasks = []) {
    const safeTasks = Array.isArray(tasks)
        ? tasks.filter((task) => task && !isLegacyVideoTask(task))
        : [];

    return safeTasks.length ? safeTasks : cloneData(DEFAULT_OVERVIEW_TASKS);
}

function getVisibleAssignments() {
    const savedAssignments = Array.isArray(state.profile.assignments)
        ? cloneData(state.profile.assignments)
        : [];
    const savedMap = new Map();
    savedAssignments.forEach((assignment) => {
        if (assignment?.id) {
            savedMap.set(assignment.id, assignment);
            return;
        }

        if (assignment?.title) {
            savedMap.set(assignment.title, assignment);
        }
    });

    const mergeSavedAssignment = (assignment) => {
        const savedAssignment = savedMap.get(assignment.id) || savedMap.get(assignment.title);
        const shouldUseLiveStatus = assignment.source === "community-goal" || assignment.source === "profile-verification";
        return {
            ...savedAssignment,
            ...assignment,
            status: shouldUseLiveStatus
                ? (assignment.status || "up-next")
                : assignment.status === "completed"
                    ? "completed"
                    : (savedAssignment?.status || assignment.status || "up-next")
        };
    };

    const activeOverviewTasks = getActiveOverviewTasks(state.tasks);
    const taskAssignments = activeOverviewTasks.slice(0, 4).map((task, index) => {
        const key = task.id || task.title || `task-${index + 1}`;
        return mergeSavedAssignment({
            id: key,
            title: task.title || "Untitled task",
            description: task.description || "Teacher guidance will appear here.",
            actionUrl: task.actionUrl || "#",
            ctaLabel: task.actionLabel || "Go Ahead",
            source: "task",
            status: index === 0 ? "in-progress" : "up-next"
        });
    });

    const courseAssignments = getCourseAssignmentEntries(state.courses, state.profile).map((assignment) => mergeSavedAssignment({
        ...assignment,
        source: "course-assignment",
        description: assignment.summary || "Open this assignment inside the course player."
    }));

    const communityGoals = [
        {
            id: "community-goal-posts",
            title: "Create 3 community posts",
            description: `${Math.min(state.communityMetrics.postsCount, 3)}/3 posts completed in the community lane.`,
            status: getCommunityGoalStatus(state.communityMetrics.postsCount, 3),
            actionUrl: "community.html",
            ctaLabel: "Open Community",
            progressCount: state.communityMetrics.postsCount,
            targetCount: 3,
            source: "community-goal"
        },
        {
            id: "community-goal-likes",
            title: "Give 4 likes on community posts",
            description: `${Math.min(state.communityMetrics.likesGivenCount, 4)}/4 likes given on community posts.`,
            status: getCommunityGoalStatus(state.communityMetrics.likesGivenCount, 4),
            actionUrl: "community.html",
            ctaLabel: "Open Community",
            progressCount: state.communityMetrics.likesGivenCount,
            targetCount: 4,
            source: "community-goal"
        }
    ].map(mergeSavedAssignment);

    const knownAssignments = [...taskAssignments, ...courseAssignments, ...communityGoals];
    const extraAssignments = savedAssignments.filter((assignment) => {
        return !knownAssignments.some((item) => item.id === assignment.id || item.title === assignment.title);
    });

    const profileVerificationTask = getProfileVerificationTask(state.profile);
    const orderedAssignments = [
        profileVerificationTask,
        ...taskAssignments.slice(0, 1),
        ...communityGoals,
        ...taskAssignments.slice(1),
        ...courseAssignments,
        ...extraAssignments
    ].filter(Boolean);
    const seenAssignmentKeys = new Set();

    return orderedAssignments.filter((assignment) => {
        const key = assignment?.id || assignment?.title;
        if (!key || seenAssignmentKeys.has(key)) {
            return false;
        }

        seenAssignmentKeys.add(key);
        return true;
    });
}

function getRankTaskTone(assignment = {}, index = 0) {
    if (assignment.source === "community-goal") {
        if (assignment.status === "completed") return "brown";
        if (assignment.status === "in-progress") return "red";
        return "yellow";
    }

    if (assignment.status === "completed") return "brown";
    if (assignment.status === "in-progress" || assignment.status === "submitted") return "red";
    return index === 0 ? "brown" : "yellow";
}

function getRankShowcaseTasks(fallbackTasks = []) {
    const visibleAssignments = getVisibleAssignments().slice(0, 4);
    if (visibleAssignments.length) {
        return visibleAssignments.map((assignment, index) => {
            const statusKey = assignmentStatusMeta[assignment.status] ? assignment.status : "up-next";
            const detailCopy = assignment.teacherFeedback
                ? `Teacher note: ${assignment.teacherFeedback}`
                : assignment.description
                || (statusKey === "completed"
                    ? "You have already cleared this checkpoint."
                    : "Use this as your next dashboard checkpoint.");

            return {
                id: assignment.id || assignment.title || `rank-task-${index + 1}`,
                title: assignment.title || "Untitled task",
                description: detailCopy,
                accent: getRankTaskTone(assignment, index),
                actionLabel: assignment.ctaLabel || (assignment.actionUrl ? "Open details" : "Saved in dashboard"),
                actionUrl: assignment.actionUrl || "#"
            };
        });
    }

    return Array.isArray(fallbackTasks) ? fallbackTasks : cloneData(DEFAULT_OVERVIEW_TASKS);
}

function getLearningLevel(stats = {}) {
    const score = normalizeNumber(stats.completedCourses)
        + normalizeNumber(stats.attendedEvents)
        + normalizeNumber(stats.submittedProjects);

    if (score >= 24) return "Master Track";
    if (score >= 14) return "Builder Track";
    return "Starter Track";
}

function updateIdentity(user) {
    const name = getDisplayName(user, "HackLab Student");
    nameTargets.forEach((target) => {
        if (target) {
            target.replaceChildren(document.createTextNode(name));
        }
    });

    if (profileAvatar) {
        profileAvatar.src = user.photoURL || "images/avatar.png";
        profileAvatar.alt = name;
    }
}

function updateOverviewCopy() {
    if (!greetingCopy) return;

    const openAssignments = state.assignments.filter((assignment) => assignment.status !== "completed").length;
    const nextEvent = getUpcomingEvents()[0];

    if (nextEvent) {
        greetingCopy.textContent = `Your dashboard is synced. ${openAssignments} focus item${openAssignments === 1 ? "" : "s"} open before ${nextEvent.title}.`;
        return;
    }

    greetingCopy.textContent = `Your dashboard is synced. ${openAssignments} focus item${openAssignments === 1 ? "" : "s"} open right now.`;
}

function renderProfileCard() {
    const profile = state.profile || DEFAULT_STUDENT_PROFILE;
    const displayName = profile.displayName || getDisplayName(state.user, "HackLab Student");
    const level = getLearningLevel(profile.stats);
    const activeTracks = Array.isArray(profile.progress) ? profile.progress.length : 0;
    const openAssignments = state.assignments.filter((assignment) => assignment.status !== "completed").length;

    nameTargets.forEach((target) => {
        if (target) {
            target.replaceChildren(document.createTextNode(displayName));
        }
    });

    if (profileSubtitle) {
        profileSubtitle.textContent = `${profile.track || level} with ${openAssignments} active checkpoint${openAssignments === 1 ? "" : "s"}`;
    }

    if (profileEmail) {
        profileEmail.textContent = profile.email || state.user?.email || "Signed in with Firebase";
    }

    if (profileQuickStats) {
        const chips = [
            level,
            `${activeTracks} course track${activeTracks === 1 ? "" : "s"}`,
            `${openAssignments} assignment${openAssignments === 1 ? "" : "s"} open`
        ];

        const postsCount = state.communityMetrics?.postsCount || 0;
        const likesCount = state.communityMetrics?.likesGivenCount || 0;
        if (postsCount > 0) {
            chips.push(`${postsCount} post${postsCount === 1 ? "" : "s"}`);
        }
        if (likesCount > 0) {
            chips.push(`${likesCount} like${likesCount === 1 ? "" : "s"} given`);
        }

        profileQuickStats.innerHTML = chips.map((item) => `<span class="profile-chip">${escapeHtml(item)}</span>`).join("");
    }

    syncProfileVerifiedBadge(profile);

    if (profileTags) {
        const tags = Array.isArray(profile.teacherTags) ? profile.teacherTags : [];
        profileTags.innerHTML = tags.length
            ? tags.map((tag) => `<span class="profile-tag">${escapeHtml(tag)}</span>`).join("")
            : "";
        profileTags.hidden = !tags.length;
    }

    updateProfileVerificationCopy(profile);
}

function renderStats() {
    const stats = state.profile?.stats || DEFAULT_STUDENT_PROFILE.stats;
    const statMap = {
        completedCoursesCount: normalizeNumber(stats.completedCourses),
        attendedEventsCount: normalizeNumber(stats.attendedEvents),
        submittedProjectsCount: normalizeNumber(stats.submittedProjects),
        completedAssignmentsCount: normalizeNumber(stats.completedAssignments)
    };

    Object.entries(statMap).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = String(value);
        }
    });
}

function renderTasks(tasks) {
    if (!taskCards) return;

    const safeTasks = getRankShowcaseTasks(Array.isArray(tasks) ? tasks : DEFAULT_OVERVIEW_TASKS);
    if (!safeTasks.length) {
        taskCards.innerHTML = `
            <div class="task-card task-yellow">
                <div class="task-dot yellow"></div>
                <div class="task-content">
                    <h4>No tasks scheduled yet</h4>
                    <p>Your teacher has not published overview tasks right now.</p>
                    <a href="resources.html" class="task-link yellow-link">Open Resources</a>
                </div>
            </div>
        `;
        return;
    }

    taskCards.innerHTML = safeTasks.map((task) => {
        const tone = taskToneMap[task.accent] || taskToneMap.yellow;
        const linkLabel = task.actionLabel || "Go Ahead";
        const linkUrl = task.actionUrl || "#";

        return `
            <div class="task-card ${tone.cardClass}">
                <div class="task-dot ${tone.dotClass}"></div>
                <div class="task-content">
                    <h4>${escapeHtml(task.title || "Untitled task")}</h4>
                    <p>${escapeHtml(task.description || "Teacher guidance will appear here.")}</p>
                    <div class="task-link-row">
                        <a href="${escapeHtml(linkUrl)}" class="task-link ${tone.linkClass}">${escapeHtml(linkLabel)}</a>
                        <span class="task-sync-chip" title="This task auto syncs with your saved dashboard progress.">Auto syncing</span>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

function renderProgress() {
    if (!progressList) return;

    const progressItems = Array.isArray(state.profile?.progress) ? state.profile.progress : [];
    if (progressSummaryPill) {
        progressSummaryPill.textContent = `${String(progressItems.length).padStart(2, "0")} active`;
    }

    if (!progressItems.length) {
        progressList.innerHTML = `
            <div class="focus-empty">
                <strong>No live learning tracks yet</strong>
                <span>Your saved course progress will show here as soon as a teacher publishes a course.</span>
            </div>
        `;
        return;
    }

    progressList.innerHTML = progressItems.map((item) => {
        const percent = normalizePercent(item.percent);
        return `
            <article class="progress-item">
                <div class="progress-top">
                    <div>
                        <h4>${escapeHtml(item.title || "Untitled track")}</h4>
                        <p>Progress is now synced to the content you complete inside the course player.</p>
                    </div>
                    <strong>${percent}%</strong>
                </div>
                <div class="progress-bar" aria-hidden="true">
                    <span style="width: ${percent}%"></span>
                </div>
            </article>
        `;
    }).join("");
}

function getAssignmentToggleState(assignment = {}) {
    if (assignment.source === "profile-verification") {
        return {
            disabled: assignment.status === "completed",
            label: assignment.status === "completed" ? "Verified" : "Verify Now"
        };
    }

    if ((assignment.id || "") === "task-js-hello-world") {
        return {
            disabled: true,
            label: assignment.status === "completed" ? "Verified" : "Submit Assignment"
        };
    }

    if (assignment.source === "community-goal") {
        return {
            disabled: true,
            label: assignment.status === "completed"
                ? "Auto Synced"
                : `${Math.min(Number(assignment.progressCount) || 0, Number(assignment.targetCount) || 0)}/${Number(assignment.targetCount) || 0} done`
        };
    }

    if (assignment.source === "task" && assignment.status === "completed" && (assignment.teacherFeedback || assignment.awardedPoints)) {
        return {
            disabled: true,
            label: "Verified"
        };
    }

    if (assignment.source === "course-assignment") {
        return {
            disabled: true,
            label: assignment.status === "completed"
                ? "Verified"
                : assignment.status === "submitted"
                    ? "Review Pending"
                    : "Open Assignment"
        };
    }

    return {
        disabled: false,
        label: assignmentStatusMeta[assignment.status]?.actionLabel || "Start Now"
    };
}

function renderAssignments() {
    if (!assignmentList) return;

    const openAssignments = state.assignments.filter((assignment) => assignment.status !== "completed").length;
    if (assignmentSummaryPill) {
        assignmentSummaryPill.textContent = `${String(openAssignments).padStart(2, "0")} open`;
    }

    if (!state.assignments.length) {
        assignmentList.innerHTML = `
            <div class="focus-empty">
                <strong>No focus items right now</strong>
                <span>New assignments will show here after your teacher updates the dashboard.</span>
            </div>
        `;
        return;
    }

    assignmentList.innerHTML = state.assignments.map((assignment) => {
        const statusKey = assignmentStatusMeta[assignment.status] ? assignment.status : "up-next";
        const statusMeta = assignmentStatusMeta[statusKey];
        const assignmentId = assignment.id || assignment.title;
        const isSaving = state.savingAssignmentId === assignmentId;
        const actionUrl = assignment.actionUrl || "";
        const actionLabel = assignment.ctaLabel || (actionUrl ? "Open details" : "Saved in dashboard");
        const toggleState = getAssignmentToggleState(assignment);
        const detailCopy = assignment.teacherFeedback
            ? `Teacher note: ${assignment.teacherFeedback}`
            : assignment.description
            || (statusKey === "completed" ? "You have already cleared this checkpoint." : "Use this as your next dashboard checkpoint.");

        return `
            <article class="assignment-item" data-assignment-entry="${escapeHtml(assignmentId)}" data-assignment-url="${escapeHtml(actionUrl)}">
                <div class="assignment-copy" data-assignment-open="${escapeHtml(assignmentId)}" role="button" tabindex="0">
                    <div class="assignment-title-row">
                        <h4>${escapeHtml(assignment.title || "Untitled assignment")}</h4>
                        <span class="assignment-status ${statusMeta.className}">${escapeHtml(statusMeta.label)}</span>
                    </div>
                    <p>${escapeHtml(detailCopy)}</p>
                    <div class="assignment-meta-row">
                        <span class="assignment-link-hint">${escapeHtml(actionLabel)}</span>
                        <span class="assignment-tag-chip" title="This task auto syncs with your saved dashboard progress.">Auto syncing</span>
                        ${assignment.tag ? `<span class="assignment-tag-chip">${escapeHtml(assignment.tag)}</span>` : ""}
                        ${assignment.awardedPoints ? `<span class="assignment-tag-chip">${escapeHtml(`${assignment.awardedPoints} pts awarded`)}</span>` : ""}
                    </div>
                </div>
                <button type="button" class="assignment-toggle" data-assignment-id="${escapeHtml(assignmentId)}" ${(isSaving || toggleState.disabled) ? "disabled" : ""}>
                    ${escapeHtml(isSaving ? "Saving..." : toggleState.label)}
                </button>
            </article>
        `;
    }).join("");
}

function renderHeroBanner() {
    const nextEvent = getUpcomingEvents()[0];

    if (!nextEvent) {
        heroActionLink = "events.html";

        if (heroKicker) heroKicker.textContent = "Teacher sync";
        if (heroTitle) heroTitle.textContent = "No live session is queued right now.";
        if (heroSummary) heroSummary.textContent = "Your dashboard is still active. Use this time to move through your current tasks and assignments.";
        if (heroMeta) {
            heroMeta.innerHTML = `
                <span class="banner-meta-chip">Waiting for next session</span>
                <span class="banner-meta-chip">Open resources in the meantime</span>
            `;
        }
        if (heroPrimaryBtn) heroPrimaryBtn.textContent = "Browse Events";
        if (heroSecondaryLink) heroSecondaryLink.href = "events.html";
        return;
    }

    const primaryLink = nextEvent.joinLink && nextEvent.joinLink !== "#" ? nextEvent.joinLink : "events.html";
    heroActionLink = primaryLink;

    if (heroKicker) heroKicker.textContent = nextEvent.badge || "Upcoming session";
    if (heroTitle) heroTitle.textContent = nextEvent.title || "Upcoming session";
    if (heroSummary) heroSummary.textContent = nextEvent.summary || "A fresh session is coming up next for your learning track.";
    if (heroMeta) {
        heroMeta.innerHTML = `
            <span class="banner-meta-chip">${escapeHtml(formatCompactDate(nextEvent.date) || "Date TBA")}</span>
            <span class="banner-meta-chip">${escapeHtml(nextEvent.timeRange || "Time TBA")}</span>
            <span class="banner-meta-chip">${escapeHtml(nextEvent.mentor || "HackLab Teacher")}</span>
        `;
    }
    if (heroPrimaryBtn) {
        heroPrimaryBtn.textContent = primaryLink === "events.html" ? "View Session" : "Join Session";
    }
    if (heroSecondaryLink) {
        heroSecondaryLink.href = "events.html";
    }
}

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

function renderCalendar() {
    const calTitle = document.getElementById("calTitle");
    const calRow = document.getElementById("calendarDayRow");
    if (!calTitle || !calRow) return;

    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    calTitle.textContent = `${monthNames[month]} ${year}`;

    const eventMap = new Map();
    state.events.forEach((eventItem) => {
        if (!eventItem?.date) return;
        const key = eventItem.date;
        const group = eventMap.get(key) || [];
        group.push(eventItem);
        eventMap.set(key, group);
    });

    const todayKey = getDayKey(new Date());
    const cells = [];

    for (let index = 0; index < 5; index += 1) {
        const dateCell = new Date(calendarDate);
        dateCell.setDate(calendarDate.getDate() + index);
        const dateKey = getDayKey(dateCell);
        const dayEvents = eventMap.get(dateKey) || [];
        const primaryEvent = dayEvents[0] || null;
        const markerCount = Math.min(dayEvents.length, 3);
        const titleText = dayEvents.map((item) => item.title).join(", ");
        const clickRoute = primaryEvent ? getEventRoute(primaryEvent) : "events.html";

        cells.push(`
            <div
                class="cal-day-cell${dateKey === todayKey ? " today" : ""}${dayEvents.length ? " has-event" : ""}"
                title="${escapeHtml(titleText)}"
                data-calendar-route="${escapeHtml(clickRoute)}"
                data-calendar-date="${escapeHtml(dateKey)}"
            >
                <span class="cal-day-label">${dayNames[dateCell.getDay()]}</span>
                <span class="cal-day-num">${dateCell.getDate()}</span>
                <div class="cal-day-events" aria-hidden="true">
                    ${Array.from({ length: markerCount }, () => '<span class="event-marker"></span>').join("")}
                </div>
                <span class="cal-day-note">${escapeHtml(primaryEvent ? compactLabel(primaryEvent.title, 18) : "Open events")}</span>
            </div>
        `);
    }

    calRow.innerHTML = cells.join("");
}

function renderSchedules() {
    if (!scheduleGridBody) return;

    const upcomingEvents = getUpcomingEvents().slice(0, 4);
    if (scheduleSubtitle) {
        scheduleSubtitle.textContent = upcomingEvents.length
            ? `${upcomingEvents.length} upcoming session${upcomingEvents.length === 1 ? "" : "s"} synced from teacher updates`
            : "Waiting for the next teacher-published session";
    }

    if (!upcomingEvents.length) {
        scheduleGridBody.innerHTML = `
            <div class="schedule-empty">
                <strong>No sessions in the queue</strong>
                <span>When your teacher adds events, the next ones will appear here automatically.</span>
            </div>
        `;
        return;
    }

    scheduleGridBody.innerHTML = upcomingEvents.map((eventItem) => {
        const hasJoinLink = eventItem.joinLink && eventItem.joinLink !== "#";
        const actionHref = hasJoinLink ? eventItem.joinLink : "events.html";

        return `
            <article class="schedule-item">
                <div class="schedule-item-head">
                    <div>
                        <span class="schedule-badge">${escapeHtml(eventItem.badge || "Live")}</span>
                        <h4>${escapeHtml(eventItem.title || "Upcoming session")}</h4>
                    </div>
                    <span class="schedule-date">${escapeHtml(formatCompactDate(eventItem.date) || "TBA")}</span>
                </div>
                <p class="schedule-summary">${escapeHtml(eventItem.summary || "Session details will appear here.")}</p>
                <div class="schedule-item-meta">
                    <span>${escapeHtml(eventItem.mentor || "HackLab Teacher")}</span>
                    <span>${escapeHtml(formatEventDate(eventItem.date, eventItem.timeRange) || "Schedule pending")}</span>
                </div>
                <div class="schedule-item-actions">
                    <a href="${escapeHtml(actionHref)}" class="schedule-link" ${hasJoinLink ? 'target="_blank" rel="noreferrer"' : ""}>
                        ${hasJoinLink ? "Join session" : "Open events"}
                    </a>
                </div>
            </article>
        `;
    }).join("");
}

function renderDynamicPanels() {
    renderHeroBanner();
    renderCalendar();
    renderSchedules();
    updateOverviewCopy();
}

function renderAnnouncementPopup() {
    const announcement = normalizeAnnouncement(state.announcement);
    const paragraphs = formatAnnouncementParagraphs(announcement.details);

    if (dashboardAnnouncementImage) {
        dashboardAnnouncementImage.src = announcement.imageUrl || DEFAULT_DASHBOARD_ANNOUNCEMENT.imageUrl;
        dashboardAnnouncementImage.alt = announcement.title || "Announcement image";
    }

    if (dashboardAnnouncementEyebrow) {
        dashboardAnnouncementEyebrow.textContent = announcement.eyebrow || DEFAULT_DASHBOARD_ANNOUNCEMENT.eyebrow;
    }

    if (dashboardAnnouncementTitle) {
        dashboardAnnouncementTitle.textContent = announcement.title || "No announcement is live right now.";
    }

    if (dashboardAnnouncementSummary) {
        dashboardAnnouncementSummary.textContent = announcement.summary || "Teacher updates will appear here first when a new dashboard announcement is published.";
    }

    if (dashboardAnnouncementDetails) {
        dashboardAnnouncementDetails.innerHTML = paragraphs.length
            ? paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")
            : "<p>The teacher has not added extra detail lines yet.</p>";
    }

    if (dashboardAnnouncementAction) {
        dashboardAnnouncementAction.textContent = announcement.ctaLabel || DEFAULT_DASHBOARD_ANNOUNCEMENT.ctaLabel;
        dashboardAnnouncementAction.disabled = !announcement.ctaUrl;
    }

    if (dashboardAnnouncementUpdated) {
        dashboardAnnouncementUpdated.textContent = formatAnnouncementUpdatedAt(announcement.updatedAt);
    }
}

function setAnnouncementModalOpen(isOpen) {
    if (!dashboardAnnouncementModal) return;
    state.announcementOpen = Boolean(isOpen);
    dashboardAnnouncementModal.hidden = !state.announcementOpen;
}

function closeAnnouncementPopup(options = {}) {
    const shouldRemember = options.remember !== false;
    if (shouldRemember) {
        setDismissedAnnouncementRevision(getAnnouncementRevision());
    }
    setAnnouncementModalOpen(false);

    if (state.user) {
        window.setTimeout(() => {
            maybeStartDashboardWalkthrough(state.user);
        }, 180);
    }
}

function maybeOpenAnnouncementPopup() {
    const announcement = normalizeAnnouncement(state.announcement);
    const hasRequiredContent = Boolean(announcement.title && announcement.summary && announcement.details);

    if (!announcement.isActive || !hasRequiredContent) {
        setAnnouncementModalOpen(false);
        if (state.user) {
            maybeStartDashboardWalkthrough(state.user);
        }
        return;
    }

    renderAnnouncementPopup();

    if (getDismissedAnnouncementRevision() === getAnnouncementRevision(announcement)) {
        if (state.user) {
            maybeStartDashboardWalkthrough(state.user);
        }
        return;
    }

    setAnnouncementModalOpen(true);
}

function getCollaborationIdentity(user = state.user) {
    return {
        uid: user?.uid || "",
        name: getDisplayName(user, "HackLab Student"),
        email: state.profile?.email || user?.email || "",
        avatar: user?.photoURL || "images/avatar.png",
        role: "student"
    };
}

function renderCollaborationPanel() {
    if (!collabInboxList || !collabNetworkList || !collabInboxCount) return;

    const pendingRequests = getPendingCollaborationRequests(state.collaboration);
    const acceptedContacts = getAcceptedCollaborationContacts(state.collaboration);

    collabInboxCount.textContent = String(pendingRequests.length).padStart(2, "0");

    if (!pendingRequests.length) {
        collabInboxList.innerHTML = `
            <div class="collab-empty-state">
                No pending collaboration requests right now.
            </div>
        `;
    } else {
        collabInboxList.innerHTML = pendingRequests.map((request) => `
            <article class="collab-inbox-item" data-collab-request-id="${escapeHtml(request.id)}">
                <div class="collab-inbox-copy">
                    <div class="collab-inbox-user">
                        <img src="${escapeHtml(request.fromUserAvatar || "images/avatar.png")}" alt="${escapeHtml(request.fromUserName || "HackLab Member")}" />
                        <div>
                            <strong>${escapeHtml(request.fromUserName || "HackLab Member")}</strong>
                            <span>${escapeHtml(request.fromUserEmail || request.lane || "Project collaboration")}</span>
                        </div>
                    </div>
                    <p>${escapeHtml(request.note || `${request.fromUserName || "A HackLab member"} wants to collaborate with you.`)}</p>
                </div>
                <button type="button" class="collab-accept-btn" data-collab-accept="${escapeHtml(request.id)}">
                    Accept
                </button>
            </article>
        `).join("");
    }

    if (!acceptedContacts.length) {
        collabNetworkList.innerHTML = `
            <div class="collab-network-empty">
                Accepted collaborators will show here after you approve a request.
            </div>
        `;
        return;
    }

    collabNetworkList.innerHTML = `
        <div class="collab-network-head">
            <span>Active collaborators</span>
            <a href="projects.html">Open projects</a>
        </div>
        <div class="collab-network-chips">
            ${acceptedContacts.map((contact) => `
                <span class="collab-network-chip">
                    <img src="${escapeHtml(contact.avatar || "images/avatar.png")}" alt="${escapeHtml(contact.name || "Collaborator")}" />
                    <span class="collab-network-copy">
                        <span>${escapeHtml(contact.name || "HackLab Collaborator")}</span>
                        <span class="collab-network-email">${escapeHtml(contact.email || "Email hidden")}</span>
                    </span>
                </span>
            `).join("")}
        </div>
    `;
}

async function refreshStudentProfile(user) {
    const profile = await loadStudentProfile(user.uid, {
        ...DEFAULT_STUDENT_PROFILE,
        displayName: getDisplayName(user, DEFAULT_STUDENT_PROFILE.displayName),
        email: user.email || ""
    });

    state.profile = normalizeProfile(profile, user);
    syncStudentProfile();

    renderProfileCard();
    renderStats();
    renderProgress();
    renderAssignments();
    updateOverviewCopy();
}

function applyCommunityMetricsFromPosts(posts) {
    if (!state.user?.uid || !Array.isArray(posts)) return;

    const userId = state.user.uid;
    state.communityMetrics = {
        postsCount: posts.filter((post) => post.authorId === userId).length,
        likesGivenCount: posts.filter((post) => Array.isArray(post.likedBy) && post.likedBy.includes(userId)).length
    };
    syncStudentProfile();
}

function applyBootstrapToDashboard(bootstrap) {
    if (!bootstrap || !state.user) return;

    const content = bootstrap.content || {};
    const readSection = (path) => content[path]?.value;

    const tasks = readSection(CONTENT_PATHS.overviewTasks);
    if (Array.isArray(tasks)) {
        state.tasks = cloneData(tasks);
    }

    const events = readSection(CONTENT_PATHS.events);
    if (Array.isArray(events)) {
        state.events = sortEventsByDate(cloneData(events));
        maybeAlignCalendarToEvents();
    }

    const courses = readSection(CONTENT_PATHS.videoCourses);
    if (Array.isArray(courses)) {
        state.courses = normalizeCourses(courses, DEFAULT_VIDEO_COURSES);
    }

    const announcement = readSection(CONTENT_PATHS.dashboardAnnouncement);
    if (typeof announcement !== "undefined") {
        state.announcement = normalizeAnnouncement(announcement);
        state.announcementReady = true;
    }

    if (bootstrap.studentProfile) {
        state.profile = normalizeProfile(bootstrap.studentProfile, state.user);
        syncStudentProfile();
    }

    if (bootstrap.collaboration) {
        state.collaboration = normalizeCollaborationState(bootstrap.collaboration, state.user.uid);
    }

    applyCommunityMetricsFromPosts(bootstrap.community?.general);

    renderTasks(state.tasks);
    renderProfileCard();
    renderStats();
    renderProgress();
    renderAssignments();
    updateOverviewCopy();
    renderCollaborationPanel();
    renderDynamicPanels();
    renderAnnouncementPopup();
    maybeOpenAnnouncementPopup();
    renderCalendar();
}

function handleDashboardBootstrap(event) {
    applyBootstrapToDashboard(event.detail);
}

async function refreshCommunityMetrics() {
    if (!state.user?.uid) return;

    try {
        const posts = await loadCommunityPosts("general");
        applyCommunityMetricsFromPosts(posts);
        renderAssignments();
        renderStats();
        renderProfileCard();
        renderProgress();
        updateOverviewCopy();
    } catch (error) {
        console.error("Unable to refresh community metrics:", error);
    }
}

async function refreshCollaborationState(user = state.user) {
    if (!user?.uid) return;

    state.collaboration = await loadUserCollaborationState(getCollaborationIdentity(user));
    renderCollaborationPanel();
}

async function persistAssignments(nextAssignments, previousAssignments, assignmentId) {
    if (!state.user) return;

    const nextAssignment = nextAssignments.find((assignment) => (assignment.id || assignment.title) === assignmentId);
    const previousAssignment = previousAssignments.find((assignment) => (assignment.id || assignment.title) === assignmentId);
    let nextProfile = normalizeProfile(state.profile, state.user);

    nextProfile.assignments = cloneData(nextAssignments);

    if (nextAssignment?.source === "course-assignment" && nextAssignment.courseId) {
        const shouldMarkComplete = nextAssignment.status === "completed";
        const wasCompleted = previousAssignment?.status === "completed";

        if (shouldMarkComplete || wasCompleted) {
            nextProfile = setCourseContentCompletion(
                nextProfile,
                nextAssignment.courseId,
                {
                    id: assignmentId,
                    type: "assignment"
                },
                shouldMarkComplete
            );
        }
    }

    state.profile = syncDerivedProfileState(nextProfile);
    state.assignments = getVisibleAssignments();

    renderProfileCard();
    renderStats();
    renderAssignments();
    renderProgress();
    updateOverviewCopy();

    try {
        await saveStudentProfile(state.user.uid, state.profile);
        setAssignmentFeedback("Assignment progress updated.", "success");
    } catch (error) {
        console.error("Unable to save assignment progress:", error);
        setAssignmentFeedback("Unable to save your assignment status right now.", "error");
        await refreshStudentProfile(state.user);
    } finally {
        state.savingAssignmentId = null;
        renderAssignments();
    }
}

async function handleAssignmentToggle(assignmentId) {
    if (!assignmentId) return;
    if (state.savingAssignmentId === assignmentId) return;

    const targetAssignment = state.assignments.find((assignment) => (assignment.id || assignment.title) === assignmentId);
    if (!targetAssignment || getAssignmentToggleState(targetAssignment).disabled) return;

    if (targetAssignment.source === "profile-verification") {
        openProfileEditor();
        return;
    }

    const previousAssignments = cloneData(state.assignments);
    const nextAssignments = state.assignments.map((assignment) => {
        if ((assignment.id || assignment.title) !== assignmentId) {
            return assignment;
        }

        if (assignment.status === "completed") {
            return {
                ...assignment,
                status: "in-progress"
            };
        }

        return {
            ...assignment,
            status: assignment.status === "in-progress" ? "completed" : "in-progress"
        };
    });

    state.savingAssignmentId = assignmentId;
    await persistAssignments(nextAssignments, previousAssignments, assignmentId);
}

function openHeroAction() {
    const link = heroActionLink || "events.html";

    if (/^https?:\/\//i.test(link)) {
        window.open(link, "_blank", "noopener,noreferrer");
        return;
    }

    window.location.href = link;
}

function attachWatchers() {
    if (!stopWatchingTasks) {
        stopWatchingTasks = watchContent(CONTENT_PATHS.overviewTasks, DEFAULT_OVERVIEW_TASKS, (tasks) => {
            state.tasks = Array.isArray(tasks) ? tasks : cloneData(DEFAULT_OVERVIEW_TASKS);
            syncStudentProfile();
            renderTasks(state.tasks);
            renderAssignments();
            renderProfileCard();
            updateOverviewCopy();
        });
    }

    if (!stopWatchingEvents) {
        stopWatchingEvents = watchContent(CONTENT_PATHS.events, DEFAULT_EVENTS, (events) => {
            state.events = sortEventsByDate(Array.isArray(events) ? events : cloneData(DEFAULT_EVENTS));
            maybeAlignCalendarToEvents();
            renderDynamicPanels();
        });
    }

    if (!stopWatchingCourses) {
        stopWatchingCourses = watchContent(CONTENT_PATHS.videoCourses, DEFAULT_VIDEO_COURSES, (courses) => {
            state.courses = normalizeCourses(courses, DEFAULT_VIDEO_COURSES);
            syncStudentProfile();
            renderProfileCard();
            renderStats();
            renderProgress();
            renderAssignments();
            updateOverviewCopy();
        });
    }

    if (!stopWatchingAnnouncement) {
        stopWatchingAnnouncement = watchContent(
            CONTENT_PATHS.dashboardAnnouncement,
            DEFAULT_DASHBOARD_ANNOUNCEMENT,
            (announcement) => {
                state.announcement = normalizeAnnouncement(announcement);
                state.announcementReady = true;
                renderAnnouncementPopup();
                maybeOpenAnnouncementPopup();
            }
        );
    }
}

document.getElementById("logoutBtn")?.addEventListener("click", () => {
    signOut(auth).then(() => {
        window.location.href = "auth.html";
    }).catch((error) => {
        console.error("Logout Error:", error);
    });
});

document.getElementById("calPrev")?.addEventListener("click", () => {
    calendarManuallyNavigated = true;
    calendarDate.setDate(calendarDate.getDate() - 5);
    renderCalendar();
});

document.getElementById("calNext")?.addEventListener("click", () => {
    calendarManuallyNavigated = true;
    calendarDate.setDate(calendarDate.getDate() + 5);
    renderCalendar();
});

heroPrimaryBtn?.addEventListener("click", openHeroAction);
dashboardAnnouncementAction?.addEventListener("click", () => {
    const link = normalizeAnnouncement(state.announcement).ctaUrl;
    closeAnnouncementPopup();

    if (!link) return;

    if (/^https?:\/\//i.test(link)) {
        window.open(link, "_blank", "noopener,noreferrer");
        return;
    }

    window.location.href = link;
});

dashboardAnnouncementDismiss?.addEventListener("click", () => {
    closeAnnouncementPopup();
});

dashboardAnnouncementClose?.addEventListener("click", () => {
    closeAnnouncementPopup();
});

dashboardAnnouncementModal?.addEventListener("click", (event) => {
    if (!event.target.closest("[data-announcement-dismiss]")) return;
    closeAnnouncementPopup();
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !profileEditModal?.hidden) {
        closeProfileEditor();
        return;
    }

    if (event.key === "Escape" && state.announcementOpen) {
        closeAnnouncementPopup();
    }
});

assignmentList?.addEventListener("click", async (event) => {
    const toggle = event.target.closest(".assignment-toggle[data-assignment-id]");
    if (toggle) {
        await handleAssignmentToggle(toggle.dataset.assignmentId || "");
        return;
    }

    const openTrigger = event.target.closest("[data-assignment-open]");
    if (!openTrigger) return;

    const assignmentId = openTrigger.dataset.assignmentOpen || "";
    const assignment = state.assignments.find((item) => (item.id || item.title) === assignmentId);
    if (assignment?.actionUrl) {
        openRoute(assignment.actionUrl);
    }
});

taskCards?.addEventListener("click", (event) => {
    const taskLink = event.target.closest(".task-link[href]");
    if (!taskLink) return;

    event.preventDefault();
    openRoute(taskLink.getAttribute("href") || "");
});

collabInboxList?.addEventListener("click", async (event) => {
    const acceptButton = event.target.closest("[data-collab-accept]");
    if (!acceptButton || !state.user?.uid) return;

    const requestId = acceptButton.dataset.collabAccept;
    if (!requestId) return;

    try {
        acceptButton.disabled = true;
        await respondToCollaborationRequest({
            recipientIdentity: getCollaborationIdentity(state.user),
            requestId,
            decision: "accepted"
        });
        await refreshCollaborationState(state.user);
        setAssignmentFeedback("Collaboration request accepted.", "success");
    } catch (error) {
        console.error("Unable to accept collaboration request:", error);
        setAssignmentFeedback("Unable to accept the collaboration request right now.", "error");
    } finally {
        acceptButton.disabled = false;
    }
});

assignmentList?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const openTrigger = event.target.closest("[data-assignment-open]");
    if (!openTrigger) return;

    event.preventDefault();
    const assignmentId = openTrigger.dataset.assignmentOpen || "";
    const assignment = state.assignments.find((item) => (item.id || item.title) === assignmentId);
    if (assignment?.actionUrl) {
        openRoute(assignment.actionUrl);
    }
});

document.getElementById("calendarDayRow")?.addEventListener("click", (event) => {
    const cell = event.target.closest("[data-calendar-route]");
    if (!cell) return;
    openRoute(cell.dataset.calendarRoute || "events.html");
});

statCards.forEach((card) => {
    const route = card.dataset.route || "";
    if (!route) return;

    card.addEventListener("click", () => {
        openRoute(route);
    });

    card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openRoute(route);
    });
});

profileEditBtn?.addEventListener("click", () => {
    openProfileEditor();
});

profileEditClose?.addEventListener("click", () => {
    closeProfileEditor();
});

profileEditCancel?.addEventListener("click", () => {
    closeProfileEditor();
});

profileEditModal?.addEventListener("click", (event) => {
    if (event.target.closest("[data-profile-dismiss]")) {
        closeProfileEditor();
    }
});

profileEditForm?.addEventListener("input", () => {
    const draftProfile = {
        ...state.profile,
        ...Object.fromEntries(
            Object.entries(profileEditFields).map(([key, field]) => [key, field?.value || ""])
        )
    };
    syncProfileVerifiedBadge(draftProfile);
    updateProfileVerificationCopy(draftProfile);
});

profileEditForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.user?.uid) return;

    try {
        const nextProfile = normalizeProfile({
            ...state.profile,
            ...Object.fromEntries(
                Object.entries(profileEditFields).map(([key, field]) => [key, field?.value.trim() || ""])
            ),
            email: (profileEditFields.email?.value.trim() || state.user.email || "").trim()
        }, state.user);

        setProfileEditFeedback("Saving your profile...", "info");
        state.profile = syncDerivedProfileState(nextProfile);
        state.assignments = getVisibleAssignments();

        await saveStudentProfile(state.user.uid, state.profile);

        renderProfileCard();
        renderStats();
        renderProgress();
        renderAssignments();
        updateOverviewCopy();
        setProfileEditFeedback("Profile updated successfully.", "success");

        window.setTimeout(() => {
            closeProfileEditor();
        }, 500);
    } catch (error) {
        console.error("Unable to save profile:", error);
        setProfileEditFeedback("Unable to save your profile right now.", "error");
    }
});

renderTasks(state.tasks);
renderProgress();
renderAssignments();
renderDynamicPanels();
renderCollaborationPanel();
renderAnnouncementPopup();
maybeAlignCalendarToEvents(true);
renderCalendar();

window.addEventListener("hacklab:bootstrap", handleDashboardBootstrap);

onAuthStateChanged(auth, async (user) => {
    if (!(await guardStudentPortal(user))) {
        return;
    }

    state.user = user;
    updateIdentity(user);

    try {
        const bootstrap = await loadBootstrap(user.uid);
        applyBootstrapToDashboard(bootstrap);
    } catch (error) {
        console.error("Unable to load dashboard bootstrap:", error);
        await Promise.all([
            refreshStudentProfile(user),
            refreshCollaborationState(user)
        ]);
        await refreshCommunityMetrics();
    }

    attachWatchers();

    stopBootstrapRefresh?.();
    stopBootstrapRefresh = startBootstrapPolling(user.uid);

    window.setTimeout(() => {
        maybeStartDashboardWalkthrough(user);
    }, 360);
});
