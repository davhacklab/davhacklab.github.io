import { initializeApp, getApp, getApps } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    getDatabase,
    ref,
    get,
    child,
    set,
    remove,
    onValue
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import {
    CONTENT_PATHS,
    DEFAULT_ASKFORGE_QUESTIONS,
    DEFAULT_AUTHORITY_ARTICLES,
    DEFAULT_COMMUNITY_POSTS,
    DEFAULT_DASHBOARD_ANNOUNCEMENT,
    DEFAULT_EVENTS,
    DEFAULT_OVERVIEW_TASKS,
    DEFAULT_PROJECTS,
    DEFAULT_RESOURCES,
    DEFAULT_STUDENT_ARTICLES,
    DEFAULT_VIDEO_COURSES,
    DEFAULT_STUDENT_PROFILE
} from "./app-defaults.js";

export {
    CONTENT_PATHS,
    DEFAULT_ASKFORGE_QUESTIONS,
    DEFAULT_AUTHORITY_ARTICLES,
    DEFAULT_COMMUNITY_POSTS,
    DEFAULT_DASHBOARD_ANNOUNCEMENT,
    DEFAULT_EVENTS,
    DEFAULT_OVERVIEW_TASKS,
    DEFAULT_PROJECTS,
    DEFAULT_RESOURCES,
    DEFAULT_STUDENT_ARTICLES,
    DEFAULT_VIDEO_COURSES,
    DEFAULT_STUDENT_PROFILE
};

const API_POLL_INTERVAL = 30000;
const BOOTSTRAP_STORAGE_KEY = "hacklab.bootstrap.v1";
const BOOTSTRAP_CLIENT_TTL_MS = 45000;
const BOOTSTRAP_POLL_MS = 30000;
let memoryBootstrap = null;
let lastBootstrapSignature = "";
let bootstrapPollTimer = null;
let bootstrapPollUserId = "";
let bootstrapPollingActive = false;
const contentWatchers = new Map();
const inflightGetRequests = new Map();
let contentWatcherNotifyFrame = null;
const FILE_MODE_API_MESSAGE = "HackLab API is disabled in file mode. Run npm.cmd start and open http://127.0.0.1:3000/ for live data.";
const LOCAL_COLLAB_DIRECTORY_STORAGE_KEY = "hacklab.collaboration.directory.cache";
const FIREBASE_COLLECTIONS = {
    community: "portalCommunity",
    projects: "portalProjects",
    studentProfiles: "studentProfiles",
    collaboration: "collaborationStates"
};

export const firebaseConfig = {
    apiKey: "AIzaSyC2EOy4F6MmMDATo8sGCpmK-p2BEor3DeQ",
    authDomain: "hacklab-70033.firebaseapp.com",
    projectId: "hacklab-70033",
    storageBucket: "hacklab-70033.firebasestorage.app",
    messagingSenderId: "583481801792",
    appId: "1:583481801792:web:ba4ab54e541c415187f3a5",
    measurementId: "G-34QB0WY3LW"
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

const DEFAULT_CONTENT_MAP = {
    [CONTENT_PATHS.overviewTasks]: DEFAULT_OVERVIEW_TASKS,
    [CONTENT_PATHS.resources]: DEFAULT_RESOURCES,
    [CONTENT_PATHS.videoCourses]: DEFAULT_VIDEO_COURSES,
    [CONTENT_PATHS.events]: DEFAULT_EVENTS,
    [CONTENT_PATHS.authorityArticles]: DEFAULT_AUTHORITY_ARTICLES,
    [CONTENT_PATHS.studentArticles]: DEFAULT_STUDENT_ARTICLES,
    [CONTENT_PATHS.askForgeQuestions]: DEFAULT_ASKFORGE_QUESTIONS,
    [CONTENT_PATHS.dashboardAnnouncement]: DEFAULT_DASHBOARD_ANNOUNCEMENT
};

function resolveDataMode() {
    if (typeof window === "undefined") {
        return "api";
    }

    const explicitMode = String(window.HACKLAB_DATA_MODE || "").trim().toLowerCase();
    if (explicitMode === "api" || explicitMode === "firebase") {
        return explicitMode;
    }

    if (window.HACKLAB_API_BASE) {
        return "api";
    }

    const hostname = String(window.location.hostname || "").trim().toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith("onrender.com")) {
        return "api";
    }

    if (hostname.endsWith("github.io") || hostname.endsWith("netlify.app")) {
        return window.HACKLAB_API_BASE ? "api" : "firebase";
    }

    return "firebase";
}

function resolveApiRoot() {
    if (typeof window === "undefined") {
        return "/api";
    }

    if (window.HACKLAB_API_BASE) {
        return String(window.HACKLAB_API_BASE).replace(/\/+$/, "");
    }

    if (window.location.protocol === "file:") {
        return "";
    }

    const localHosts = new Set(["localhost", "127.0.0.1"]);
    if (localHosts.has(window.location.hostname) && window.location.port && window.location.port !== "3000") {
        return "http://127.0.0.1:3000/api";
    }

    return `${window.location.origin}/api`;
}

function resolveFallbackApiRoot() {
    if (typeof window === "undefined") {
        return "";
    }

    const hostname = String(window.location.hostname || "").trim().toLowerCase();
    if (!hostname.endsWith("netlify.app")) {
        return "";
    }

    if (window.HACKLAB_API_BASE) {
        return "";
    }

    return `${window.location.origin}/.netlify/functions/server/api`;
}

const DATA_MODE = resolveDataMode();
const API_ROOT = resolveApiRoot();
const FALLBACK_API_ROOT = resolveFallbackApiRoot();
const CONTENT_DATA_MODE = DATA_MODE;
const COMMUNITY_DATA_MODE = DATA_MODE;
const PROJECTS_DATA_MODE = DATA_MODE;
const STUDENT_PROFILE_DATA_MODE = DATA_MODE;
const COLLABORATION_DATA_MODE = DATA_MODE;

function shouldLogApiWarning(error) {
    return error?.message && error.message !== FILE_MODE_API_MESSAGE;
}

function readLocalCollaboratorDirectory() {
    if (typeof window === "undefined") {
        return {};
    }

    try {
        const rawValue = window.localStorage.getItem(LOCAL_COLLAB_DIRECTORY_STORAGE_KEY);
        const parsedValue = rawValue ? JSON.parse(rawValue) : {};
        return parsedValue && typeof parsedValue === "object" ? parsedValue : {};
    } catch (error) {
        console.warn("Unable to read cached collaboration directory:", error);
        return {};
    }
}

function writeLocalCollaboratorDirectory(directory = {}) {
    if (typeof window === "undefined") {
        return;
    }

    try {
        window.localStorage.setItem(LOCAL_COLLAB_DIRECTORY_STORAGE_KEY, JSON.stringify(directory));
    } catch (error) {
        console.warn("Unable to cache collaboration directory:", error);
    }
}

function cacheCollaborationStateForDirectory(state = {}) {
    const normalizedState = normalizeCollaborationState(state, state.userId || "");
    if (!normalizedState.userId) {
        return;
    }

    const directory = readLocalCollaboratorDirectory();
    directory[normalizedState.userId] = normalizeOpenCollaborator(normalizedState);
    writeLocalCollaboratorDirectory(directory);
}

function cacheOpenCollaboratorEntries(entries = []) {
    const directory = readLocalCollaboratorDirectory();
    const visibleIds = new Set();

    entries.forEach((entry) => {
        const normalizedEntry = normalizeOpenCollaborator(entry);
        if (!normalizedEntry.userId) {
            return;
        }

        directory[normalizedEntry.userId] = normalizedEntry;
        visibleIds.add(normalizedEntry.userId);
    });

    Object.keys(directory).forEach((userId) => {
        if (visibleIds.has(userId)) {
            return;
        }

        directory[userId] = {
            ...normalizeOpenCollaborator(directory[userId]),
            isOpenToCollaborate: false
        };
    });

    writeLocalCollaboratorDirectory(directory);
}

function readCachedOpenCollaborators() {
    return Object.values(readLocalCollaboratorDirectory())
        .map((entry) => normalizeOpenCollaborator(entry))
        .filter((entry) => entry.userId && entry.isOpenToCollaborate);
}

export function cloneData(value) {
    if (typeof value === "undefined") return undefined;
    return JSON.parse(JSON.stringify(value));
}

function createTimestamp() {
    return new Date().toISOString();
}

function createClientId(prefix = "item") {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sortByCreatedAtDesc(items = []) {
    return [...items].sort((left, right) => {
        const leftValue = new Date(left.createdAt || 0).getTime();
        const rightValue = new Date(right.createdAt || 0).getTime();
        return rightValue - leftValue;
    });
}

function sortProjects(projects = []) {
    return [...projects].sort((left, right) => {
        if (Boolean(right.isFeatured) !== Boolean(left.isFeatured)) {
            return Number(right.isFeatured) - Number(left.isFeatured);
        }

        if ((right.likesCount || 0) !== (left.likesCount || 0)) {
            return (right.likesCount || 0) - (left.likesCount || 0);
        }

        return new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime();
    });
}

function normalizeRecordMap(value) {
    return value && typeof value === "object" ? value : {};
}

async function readFirebaseValue(path) {
    const snapshot = await get(ref(db, path));
    return snapshot.exists() ? snapshot.val() : undefined;
}

async function writeFirebaseValue(path, value) {
    const normalizedPath = String(path || "").replace(/^\/+/, "");
    if (normalizedPath === "users" || normalizedPath.startsWith("users/")) {
        console.warn("HackLab no longer writes to Firebase users/; use Astra or studentProfiles instead.");
        return cloneData(value);
    }

    const nextValue = cloneData(value);
    await set(ref(db, path), nextValue);
    return nextValue;
}

async function removeFirebaseValue(path) {
    await remove(ref(db, path));
}

function watchFirebaseValue(path, fallbackValue, callback) {
    const unsubscribe = onValue(
        ref(db, path),
        (snapshot) => {
            const nextValue = snapshot.exists()
                ? snapshot.val()
                : cloneData(fallbackValue);
            callback(cloneData(nextValue));
        },
        (error) => {
            console.warn(`Unable to watch Firebase path ${path}:`, error);
            callback(cloneData(fallbackValue));
        }
    );

    return () => {
        unsubscribe();
    };
}

export function getDisplayName(user, fallback = "HackLab Member") {
    if (!user) return fallback;
    if (user.displayName) return user.displayName;
    if (user.email) return user.email.split("@")[0];
    return fallback;
}

export function normalizeAccountEmail(email = "") {
    return String(email || "").trim().toLowerCase();
}

function extractTeacherEmails(value) {
    const teacherEntries = value && typeof value === "object" ? Object.values(value) : [];
    return teacherEntries
        .map((entry) => {
            if (typeof entry === "string") {
                return entry.trim().toLowerCase();
            }

            if (entry && typeof entry === "object" && typeof entry.email === "string") {
                return entry.email.trim().toLowerCase();
            }

            return "";
        })
        .filter(Boolean);
}

let teacherEmailCache = null;
let teacherEmailCacheAt = 0;
const TEACHER_EMAIL_CACHE_MS = 60000;

async function loadTeacherEmailSet() {
    const now = Date.now();
    if (teacherEmailCache && now - teacherEmailCacheAt < TEACHER_EMAIL_CACHE_MS) {
        return teacherEmailCache;
    }

    const snapshot = await get(child(ref(db), "teachers"));
    teacherEmailCache = new Set(extractTeacherEmails(snapshot.exists() ? snapshot.val() : {}));
    teacherEmailCacheAt = now;
    return teacherEmailCache;
}

export async function isTeacherEmail(email = "") {
    const normalizedEmail = normalizeAccountEmail(email);
    if (!normalizedEmail) {
        return false;
    }

    const teacherEmails = await loadTeacherEmailSet();
    return teacherEmails.has(normalizedEmail);
}

export async function getUserRole(identifier = "") {
    const normalizedIdentifier = String(identifier || "").trim().toLowerCase();
    const emailCandidates = new Set();

    if (normalizedIdentifier.includes("@")) {
        emailCandidates.add(normalizedIdentifier);
    }

    const currentUser = auth.currentUser;
    if (currentUser) {
        const currentUid = String(currentUser.uid || "").trim().toLowerCase();
        const currentEmail = normalizeAccountEmail(currentUser.email);
        if (currentEmail && (!normalizedIdentifier || normalizedIdentifier === currentUid)) {
            emailCandidates.add(currentEmail);
        }
    }

    if (!emailCandidates.size) {
        return "student";
    }

    const teacherEmails = await loadTeacherEmailSet();
    return [...emailCandidates].some((email) => teacherEmails.has(email)) ? "teacher" : "student";
}

async function getAuthHeaders() {
    const headers = {};

    if (auth.currentUser) {
        try {
            const token = await auth.currentUser.getIdToken();
            if (token) headers.Authorization = `Bearer ${token}`;
        } catch (error) {
            console.warn("Unable to attach Firebase token:", error);
        }
    }

    return headers;
}

function getBootstrapStorageKey(userId = "") {
    return `${BOOTSTRAP_STORAGE_KEY}:${userId || "anonymous"}`;
}

function readBootstrapFromSession(userId = "") {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        const rawValue = window.sessionStorage.getItem(getBootstrapStorageKey(userId));
        if (!rawValue) return null;

        const parsed = JSON.parse(rawValue);
        if (!parsed?.data || !parsed?.savedAt) return null;
        if (Date.now() - parsed.savedAt > BOOTSTRAP_CLIENT_TTL_MS) {
            window.sessionStorage.removeItem(getBootstrapStorageKey(userId));
            return null;
        }

        return parsed.data;
    } catch (error) {
        console.warn("Unable to read bootstrap cache:", error);
        return null;
    }
}

function writeBootstrapToSession(userId = "", data) {
    if (typeof window === "undefined" || !data) {
        return;
    }

    try {
        window.sessionStorage.setItem(getBootstrapStorageKey(userId), JSON.stringify({
            savedAt: Date.now(),
            data
        }));
    } catch (error) {
        console.warn("Unable to write bootstrap cache:", error);
    }
}

export function invalidateClientBootstrap() {
    memoryBootstrap = null;
    if (typeof window !== "undefined") {
        try {
            Object.keys(window.sessionStorage)
                .filter((key) => key.startsWith(BOOTSTRAP_STORAGE_KEY))
                .forEach((key) => window.sessionStorage.removeItem(key));
        } catch (error) {
            console.warn("Unable to clear bootstrap cache:", error);
        }
    }
}

function setMemoryBootstrap(data) {
    const nextSignature = data ? JSON.stringify(data) : "";
    const hasChanged = nextSignature !== lastBootstrapSignature;
    memoryBootstrap = data ? cloneData(data) : null;
    lastBootstrapSignature = nextSignature;
    return hasChanged;
}

export function peekBootstrapContent(path) {
    const entry = memoryBootstrap?.content?.[path];
    return typeof entry === "undefined" ? undefined : cloneData(entry?.value);
}

export function peekBootstrapPosts(feed = "general") {
    const posts = memoryBootstrap?.community?.[feed];
    return Array.isArray(posts) ? cloneData(posts) : undefined;
}

export function peekBootstrapProjects(visibility = "public") {
    const projects = memoryBootstrap?.projects?.[visibility];
    if (!Array.isArray(projects)) {
        return undefined;
    }

    return projects.map((project) => normalizeProject(project, visibility));
}

function dispatchBootstrapUpdate(data) {
    if (typeof window === "undefined" || !data) {
        return;
    }

    window.dispatchEvent(new CustomEvent("hacklab:bootstrap", {
        detail: cloneData(data)
    }));
}

function notifyContentWatchers() {
    if (typeof window === "undefined" || !contentWatchers.size) {
        return;
    }

    if (contentWatcherNotifyFrame) {
        return;
    }

    contentWatcherNotifyFrame = window.requestAnimationFrame(() => {
        contentWatcherNotifyFrame = null;
        contentWatchers.forEach((watchers, path) => {
            const nextValue = peekBootstrapContent(path);
            watchers.forEach((watcher) => {
                watcher.callback(
                    typeof nextValue === "undefined"
                        ? cloneData(watcher.fallbackValue)
                        : cloneData(nextValue)
                );
            });
        });
    });
}

export async function loadBootstrap(userId = "", { force = false } = {}) {
    if (!force) {
        if (memoryBootstrap) {
            return cloneData(memoryBootstrap);
        }

        const sessionCached = readBootstrapFromSession(userId);
        if (sessionCached) {
            setMemoryBootstrap(sessionCached);
            return cloneData(sessionCached);
        }
    }

    const query = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    const data = await requestJson(`/bootstrap${query}`, {
        method: "GET",
        cache: "default"
    });

    bootstrapPollUserId = userId || "";
    const hasChanged = setMemoryBootstrap(data);
    writeBootstrapToSession(userId, data);
    if (hasChanged) {
        dispatchBootstrapUpdate(data);
        notifyContentWatchers();
    }
    return cloneData(data);
}

export function startBootstrapPolling(userId = "") {
    if (typeof window === "undefined" || CONTENT_DATA_MODE === "firebase") {
        return () => { };
    }

    bootstrapPollUserId = userId || "";

    if (bootstrapPollingActive) {
        return () => stopBootstrapPolling();
    }

    bootstrapPollingActive = true;

    const refresh = () => {
        if (document.hidden) {
            return;
        }

        loadBootstrap(bootstrapPollUserId, { force: true }).catch((error) => {
            if (shouldLogApiWarning(error)) {
                console.warn("Unable to refresh bootstrap payload:", error);
            }
        });
    };

    refresh();

    bootstrapPollTimer = window.setInterval(refresh, BOOTSTRAP_POLL_MS);
    const handleVisibility = () => {
        if (!document.hidden) {
            refresh();
        }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
        document.removeEventListener("visibilitychange", handleVisibility);
        stopBootstrapPolling();
    };
}

export function stopBootstrapPolling() {
    bootstrapPollingActive = false;
    if (bootstrapPollTimer) {
        window.clearInterval(bootstrapPollTimer);
        bootstrapPollTimer = null;
    }
}

async function requestJson(path, options = {}) {
    if (!API_ROOT) {
        throw new Error(FILE_MODE_API_MESSAGE);
    }

    const method = (options.method || "GET").toUpperCase();
    const dedupeKey = method === "GET" ? `GET:${path}` : "";

    if (dedupeKey && inflightGetRequests.has(dedupeKey)) {
        return inflightGetRequests.get(dedupeKey);
    }

    const executeRequest = async () => {
        const requestHeaders = options.headers || {};
        const authHeaders = await getAuthHeaders();
        const fetchCache = options.cache || (method === "GET" ? "default" : "no-store");
        const buildRequestOptions = () => ({
            method,
            headers: {
                "Content-Type": "application/json",
                ...authHeaders,
                ...requestHeaders
            },
            body: typeof options.body === "undefined" ? undefined : JSON.stringify(options.body),
            cache: fetchCache
        });

        let response = await fetch(`${API_ROOT}${path}`, buildRequestOptions());
        if (
            response.status === 404 &&
            FALLBACK_API_ROOT &&
            `${API_ROOT}${path}` !== `${FALLBACK_API_ROOT}${path}`
        ) {
            response = await fetch(`${FALLBACK_API_ROOT}${path}`, buildRequestOptions());
        }

        if (!response.ok) {
            let message = `Request failed with status ${response.status}`;
            if (response.status === 413) {
                message = "Attachment is too large. Try a smaller image.";
            } else {
                const responseType = response.headers.get("content-type") || "";
                try {
                    if (responseType.includes("application/json")) {
                        const errorPayload = await response.json();
                        if (errorPayload?.error) {
                            message = errorPayload.error;
                        }
                    } else {
                        const errorText = await response.text();
                        if (errorText && !/<!doctype html/i.test(errorText)) {
                            message = errorText.trim();
                        }
                    }
                } catch (error) {
                    console.warn("Unable to parse API error payload:", error);
                }
            }
            throw new Error(message);
        }

        return response.json();
    };

    const requestPromise = executeRequest();
    if (dedupeKey) {
        inflightGetRequests.set(dedupeKey, requestPromise);
        requestPromise.finally(() => {
            inflightGetRequests.delete(dedupeKey);
        });
    }

    return requestPromise;
}

export async function loadContent(path, fallbackValue) {
    if (CONTENT_DATA_MODE === "firebase") {
        try {
            const storedValue = await readFirebaseValue(path);
            return cloneData(typeof storedValue === "undefined" ? fallbackValue : storedValue);
        } catch (error) {
            console.warn(`Unable to load Firebase content for ${path}:`, error);
            return cloneData(fallbackValue);
        }
    }

    const cachedValue = peekBootstrapContent(path);
    if (typeof cachedValue !== "undefined") {
        return cloneData(cachedValue);
    }

    try {
        const payload = await requestJson(`/content/${encodeURIComponent(path)}`);
        return cloneData(payload?.value ?? fallbackValue);
    } catch (error) {
        if (shouldLogApiWarning(error)) {
            console.warn(`Unable to load content for ${path}:`, error);
        }
        return cloneData(fallbackValue);
    }
}

export async function saveContent(path, value) {
    if (CONTENT_DATA_MODE === "firebase") {
        return writeFirebaseValue(path, value);
    }

    const payload = await requestJson(`/content/${encodeURIComponent(path)}`, {
        method: "PUT",
        body: { value }
    });
    invalidateClientBootstrap();
    return cloneData(payload?.value ?? value);
}

export function watchContent(path, fallbackValue, callback) {
    if (CONTENT_DATA_MODE === "firebase") {
        return watchFirebaseValue(path, fallbackValue, callback);
    }

    const cachedValue = peekBootstrapContent(path);
    callback(typeof cachedValue !== "undefined" ? cloneData(cachedValue) : cloneData(fallbackValue));

    if (!contentWatchers.has(path)) {
        contentWatchers.set(path, new Set());
    }

    const watcher = { callback, fallbackValue };
    contentWatchers.get(path).add(watcher);

    return () => {
        const watchers = contentWatchers.get(path);
        if (!watchers) return;
        watchers.delete(watcher);
        if (!watchers.size) {
            contentWatchers.delete(path);
        }
    };
}

export function slugify(value) {
    return String(value || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || `item-${Date.now()}`;
}

export function formatEventDate(dateString, timeRange = "") {
    if (!dateString) return timeRange || "";
    const parsed = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return `${dateString}${timeRange ? ` ${timeRange}` : ""}`;
    const label = parsed.toLocaleDateString("en-US", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
    return timeRange ? `${label} - ${timeRange}` : label;
}

export function formatCompactDate(dateString) {
    if (!dateString) return "";
    const parsed = new Date(`${dateString}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateString;
    return parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric"
    });
}

export function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

export function parseCompactCount(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.max(0, Math.round(value));
    }

    const text = String(value || "").trim();
    if (!text) return 0;

    if (/k$/i.test(text)) {
        const numeric = Number.parseFloat(text.replace(/k$/i, ""));
        return Number.isFinite(numeric) ? Math.round(numeric * 1000) : 0;
    }

    const numeric = Number.parseInt(text.replace(/[^\d]/g, ""), 10);
    return Number.isFinite(numeric) ? numeric : 0;
}

export function formatCompactCount(value) {
    const numeric = parseCompactCount(value);

    if (numeric >= 1000) {
        const shortValue = numeric / 1000;
        const rounded = shortValue >= 10 ? shortValue.toFixed(1) : shortValue.toFixed(1);
        return `${rounded.replace(/\.0$/, "")}K`;
    }

    return String(numeric);
}

function normalizeCommunityPost(post, feed = "general") {
    const explicitRole = String(post.authorRole || post.role || "").trim().toLowerCase();
    const authorRole = explicitRole === "teacher"
        ? "teacher"
        : explicitRole === "student"
            ? "student"
            : (String(post.authorId || "") === "seed-mentor" ? "teacher" : "student");
    const replyToPostId = String(post.replyToPostId || "").trim();
    const replyToAuthorId = String(post.replyToAuthorId || "").trim();
    const replyToAuthorName = String(post.replyToAuthorName || "").trim();
    const replyToText = String(post.replyToText || "").trim();

    return {
        id: post.id || createClientId("community"),
        feed: post.feed || feed,
        authorId: post.authorId || "anonymous",
        authorName: post.authorName || "HackLab Member",
        authorRole,
        authorAvatar: post.authorAvatar || "images/avatar.png",
        text: post.text || "",
        mediaLabel: post.mediaLabel || "",
        mediaType: post.mediaType || "",
        mediaDataUrl: typeof post.mediaDataUrl === "string" ? post.mediaDataUrl : "",
        replyToPostId,
        replyToAuthorId,
        replyToAuthorName,
        replyToText,
        likeCount: parseCompactCount(post.likeCount),
        likedBy: Array.isArray(post.likedBy)
            ? [...new Set(post.likedBy.map((entry) => String(entry || "").trim()).filter(Boolean))]
            : [],
        createdAt: post.createdAt || createTimestamp()
    };
}

function normalizeProject(project, visibility = "public") {
    return {
        id: project.id || createClientId("project"),
        visibility: project.visibility || visibility,
        ownerId: project.ownerId || "anonymous",
        ownerName: project.ownerName || "HackLab Student",
        ownerAvatar: project.ownerAvatar || "images/avatar.png",
        collaboratorIds: Array.isArray(project.collaboratorIds) ? project.collaboratorIds.filter(Boolean) : [],
        collaboratorNames: Array.isArray(project.collaboratorNames) ? project.collaboratorNames.filter(Boolean) : [],
        collaboratorAvatars: Array.isArray(project.collaboratorAvatars) ? project.collaboratorAvatars : [],
        title: project.title || "Untitled project",
        summary: project.summary || "A student project summary will appear here.",
        category: project.category || "Student Build",
        status: project.status || "New",
        badge: project.badge || "Fresh",
        projectLink: project.projectLink || "",
        imageUrl: project.imageUrl || "images/session.png",
        likesCount: parseCompactCount(project.likesCount),
        isFeatured: Boolean(project.isFeatured),
        createdAt: project.createdAt || createTimestamp()
    };
}

function normalizeCollaborationRequest(request = {}) {
    const status = String(request.status || "pending").toLowerCase();

    return {
        id: request.id || createClientId("collab"),
        fromUserId: request.fromUserId || "",
        fromUserName: request.fromUserName || "HackLab Member",
        fromUserEmail: request.fromUserEmail || "",
        fromUserAvatar: request.fromUserAvatar || "images/avatar.png",
        toUserId: request.toUserId || "",
        toUserName: request.toUserName || "HackLab Member",
        toUserEmail: request.toUserEmail || "",
        toUserAvatar: request.toUserAvatar || "images/avatar.png",
        lane: request.lane || "",
        projectTitle: request.projectTitle || "",
        note: request.note || "",
        status: ["pending", "accepted", "declined"].includes(status) ? status : "pending",
        createdAt: request.createdAt || createTimestamp()
    };
}

function normalizeCollaborationContact(contact = {}) {
    return {
        userId: contact.userId || "",
        name: contact.name || "HackLab Member",
        email: contact.email || "",
        avatar: contact.avatar || "images/avatar.png",
        role: contact.role || "student",
        connectedAt: contact.connectedAt || createTimestamp()
    };
}

function normalizeCollaborationProfile(profile = {}) {
    return {
        name: profile.name || "HackLab Member",
        email: profile.email || "",
        avatar: profile.avatar || "images/avatar.png",
        role: profile.role || "student"
    };
}

function dedupeContacts(contacts) {
    const seen = new Set();

    return contacts.filter((contact) => {
        const key = String(contact.userId || "").trim();
        if (!key || seen.has(key)) {
            return false;
        }

        seen.add(key);
        return true;
    });
}

export function normalizeCollaborationState(state = {}, userId = "") {
    const sortByNewest = (items) => [...items].sort((left, right) => {
        const leftValue = new Date(left.createdAt || 0).getTime();
        const rightValue = new Date(right.createdAt || 0).getTime();
        return rightValue - leftValue;
    });

    const inbox = Array.isArray(state.inbox)
        ? state.inbox.map((request) => normalizeCollaborationRequest(request))
        : [];
    const sent = Array.isArray(state.sent)
        ? state.sent.map((request) => normalizeCollaborationRequest(request))
        : [];
    const contacts = Array.isArray(state.contacts)
        ? dedupeContacts(state.contacts.map((contact) => normalizeCollaborationContact(contact)))
        : [];

    return {
        userId: state.userId || userId || "",
        isOpenToCollaborate: Boolean(state.isOpenToCollaborate),
        profile: normalizeCollaborationProfile(state.profile || {}),
        inbox: sortByNewest(inbox),
        sent: sortByNewest(sent),
        contacts,
        updatedAt: state.updatedAt || createTimestamp()
    };
}

export function normalizeOpenCollaborator(entry = {}) {
    return {
        userId: entry.userId || "",
        isOpenToCollaborate: Boolean(entry.isOpenToCollaborate),
        profile: normalizeCollaborationProfile(entry.profile || {}),
        updatedAt: entry.updatedAt || createTimestamp()
    };
}

function normalizeStudentProfile(profile, fallbackValue = DEFAULT_STUDENT_PROFILE) {
    const base = cloneData(fallbackValue);
    return {
        ...base,
        ...cloneData(profile || {}),
        stats: {
            ...(base.stats || {}),
            ...cloneData(profile?.stats || {})
        },
        progress: Array.isArray(profile?.progress) ? cloneData(profile.progress) : cloneData(base.progress || []),
        assignments: Array.isArray(profile?.assignments) ? cloneData(profile.assignments) : cloneData(base.assignments || []),
        teacherTags: Array.isArray(profile?.teacherTags) ? cloneData(profile.teacherTags) : cloneData(base.teacherTags || []),
        courseProgress: profile?.courseProgress && typeof profile.courseProgress === "object"
            ? cloneData(profile.courseProgress)
            : cloneData(base.courseProgress || {}),
        updatedAt: profile?.updatedAt || base.updatedAt || createTimestamp()
    };
}

function buildProfileFromAuthUser(user = null, fallbackValue = DEFAULT_STUDENT_PROFILE) {
    if (!user) {
        return normalizeStudentProfile(fallbackValue, fallbackValue);
    }

    return normalizeStudentProfile({
        displayName: getDisplayName(user, fallbackValue.displayName),
        email: user.email || fallbackValue.email || "",
        avatar: user.photoURL || fallbackValue.avatar || "images/avatar.png",
        role: "student"
    }, fallbackValue);
}

function normalizeStudentDirectoryEntry(entry = {}) {
    const userId = entry.userId || entry.uid || entry.id || "";
    const profile = normalizeStudentProfile(entry.profile || entry, DEFAULT_STUDENT_PROFILE);
    return {
        userId,
        profile
    };
}

function buildCommunityFeedPath(feed = "general") {
    return `${FIREBASE_COLLECTIONS.community}/${feed}`;
}

function buildProjectVisibilityPath(visibility = "public") {
    return `${FIREBASE_COLLECTIONS.projects}/${visibility}`;
}

function buildStudentProfilePath(userId = "") {
    return `${FIREBASE_COLLECTIONS.studentProfiles}/${userId}`;
}

function buildCollaborationStatePath(userId = "") {
    return `${FIREBASE_COLLECTIONS.collaboration}/${userId}`;
}

export async function loadCommunityPosts(feed = "general", fallbackValue = DEFAULT_COMMUNITY_POSTS) {
    if (COMMUNITY_DATA_MODE === "firebase") {
        try {
            const storedPosts = normalizeRecordMap(await readFirebaseValue(buildCommunityFeedPath(feed)));
            const sourcePosts = Object.keys(storedPosts).length
                ? Object.values(storedPosts)
                : (feed === "general" ? fallbackValue : []);
            return sortByCreatedAtDesc(sourcePosts.map((post) => normalizeCommunityPost(post, feed)));
        } catch (error) {
            console.warn("Unable to load Firebase community posts:", error);
            return cloneData(fallbackValue).map((post) => normalizeCommunityPost(post, feed));
        }
    }

    const cachedPosts = peekBootstrapPosts(feed);
    if (cachedPosts) {
        return cachedPosts.map((post) => normalizeCommunityPost(post, feed));
    }

    try {
        const payload = await requestJson(`/community/posts?feed=${encodeURIComponent(feed)}`);
        const posts = Array.isArray(payload?.posts) ? payload.posts : fallbackValue;
        return posts.map((post) => normalizeCommunityPost(post, feed));
    } catch (error) {
        if (shouldLogApiWarning(error)) {
            console.warn("Unable to load community posts:", error);
        }
        return cloneData(fallbackValue).map((post) => normalizeCommunityPost(post, feed));
    }
}

export async function createCommunityPost(payload) {
    const safePayload = payload || {};
    const safeFeed = String(safePayload.feed || "general");

    if (COMMUNITY_DATA_MODE === "firebase") {
        const post = normalizeCommunityPost({
            ...safePayload,
            id: safePayload.id || createClientId("community"),
            createdAt: createTimestamp(),
            likeCount: 0,
            likedBy: []
        }, safeFeed);

        await writeFirebaseValue(`${buildCommunityFeedPath(safeFeed)}/${post.id}`, post);
        return post;
    }

    const response = await requestJson("/community/posts", {
        method: "POST",
        body: safePayload
    });
    invalidateClientBootstrap();
    return normalizeCommunityPost({
        ...safePayload,
        ...(response?.post || {})
    }, safeFeed);
}

export async function updateCommunityPost(feed, postId, payload) {
    if (COMMUNITY_DATA_MODE === "firebase") {
        const path = `${buildCommunityFeedPath(feed)}/${postId}`;
        const currentPost = await readFirebaseValue(path);
        if (!currentPost) {
            throw new Error("Community post not found.");
        }

        const normalizedCurrentPost = normalizeCommunityPost(currentPost, feed);
        if (String(normalizedCurrentPost.authorId || "") !== String(payload?.authorId || "")) {
            throw new Error("You can only edit your own posts.");
        }

        const text = String(payload?.text || "").trim();
        const mediaLabel = String(payload?.mediaLabel || "").trim();
        const mediaType = String(payload?.mediaType || normalizedCurrentPost.mediaType || "").trim();
        const mediaDataUrl = typeof payload?.mediaDataUrl === "string"
            ? payload.mediaDataUrl
            : normalizedCurrentPost.mediaDataUrl || "";
        if (!text && !mediaLabel && !mediaDataUrl) {
            throw new Error("A post needs text or media.");
        }

        const nextPost = normalizeCommunityPost({
            ...normalizedCurrentPost,
            authorName: payload?.authorName || normalizedCurrentPost.authorName,
            authorRole: payload?.authorRole || normalizedCurrentPost.authorRole,
            authorAvatar: payload?.authorAvatar || normalizedCurrentPost.authorAvatar,
            text,
            mediaLabel,
            mediaType,
            mediaDataUrl
        }, feed);

        await writeFirebaseValue(path, nextPost);
        return nextPost;
    }

    const response = await requestJson(`/community/posts/${encodeURIComponent(postId)}`, {
        method: "PATCH",
        body: {
            feed,
            ...payload
        }
    });
    invalidateClientBootstrap();
    return normalizeCommunityPost({
        id: postId,
        feed,
        ...(payload || {}),
        ...(response?.post || {})
    }, feed);
}

export async function deleteCommunityPost(feed, postId, authorId) {
    if (COMMUNITY_DATA_MODE === "firebase") {
        const path = `${buildCommunityFeedPath(feed)}/${postId}`;
        const currentPost = await readFirebaseValue(path);
        if (!currentPost) {
            throw new Error("Community post not found.");
        }

        const normalizedCurrentPost = normalizeCommunityPost(currentPost, feed);
        if (String(normalizedCurrentPost.authorId || "") !== String(authorId || "")) {
            throw new Error("You can only delete your own posts.");
        }

        await removeFirebaseValue(path);
        return normalizedCurrentPost;
    }

    const response = await requestJson(`/community/posts/${encodeURIComponent(postId)}`, {
        method: "DELETE",
        body: { feed, authorId }
    });
    invalidateClientBootstrap();
    return normalizeCommunityPost(response?.post || { id: postId, feed, authorId }, feed);
}

export async function likeCommunityPost(feed, postId, userId = "") {
    if (COMMUNITY_DATA_MODE === "firebase") {
        const path = `${buildCommunityFeedPath(feed)}/${postId}`;
        const currentPost = await readFirebaseValue(path);
        if (!currentPost) {
            throw new Error("Community post not found.");
        }

        const post = normalizeCommunityPost(currentPost, feed);
        const likedBy = new Set(Array.isArray(post.likedBy) ? post.likedBy : []);
        const safeUserId = String(userId || "").trim();

        if (safeUserId) {
            const alreadyLiked = likedBy.has(safeUserId);
            likedBy.add(safeUserId);
            post.likedBy = [...likedBy];
            if (!alreadyLiked) {
                post.likeCount = parseCompactCount(post.likeCount) + 1;
            }
        } else {
            post.likeCount = parseCompactCount(post.likeCount) + 1;
        }

        await writeFirebaseValue(path, post);
        return post;
    }

    const response = await requestJson(`/community/posts/${encodeURIComponent(postId)}/like`, {
        method: "POST",
        body: {
            feed,
            userId
        }
    });
    invalidateClientBootstrap();
    return normalizeCommunityPost(response?.post || { id: postId, feed }, feed);
}

export async function loadProjects(visibility = "public", fallbackValue = DEFAULT_PROJECTS) {
    if (PROJECTS_DATA_MODE === "firebase") {
        try {
            const storedProjects = normalizeRecordMap(await readFirebaseValue(buildProjectVisibilityPath(visibility)));
            const sourceProjects = Object.keys(storedProjects).length
                ? Object.values(storedProjects)
                : (visibility === "public" ? fallbackValue : []);
            return sortProjects(sourceProjects.map((project) => normalizeProject(project, visibility)));
        } catch (error) {
            console.warn("Unable to load Firebase projects:", error);
            return cloneData(fallbackValue).map((project) => normalizeProject(project, visibility));
        }
    }

    const cachedProjects = peekBootstrapProjects(visibility);
    if (cachedProjects) {
        return cloneData(cachedProjects);
    }

    try {
        const payload = await requestJson(`/projects?visibility=${encodeURIComponent(visibility)}`);
        const projects = Array.isArray(payload?.projects) ? payload.projects : fallbackValue;
        return projects.map((project) => normalizeProject(project, visibility));
    } catch (error) {
        if (shouldLogApiWarning(error)) {
            console.warn("Unable to load projects:", error);
        }
        return cloneData(fallbackValue).map((project) => normalizeProject(project, visibility));
    }
}

export async function createProject(payload) {
    const safePayload = payload || {};
    const visibility = String(safePayload.visibility || "public");

    if (PROJECTS_DATA_MODE === "firebase") {
        const project = normalizeProject({
            ...safePayload,
            id: safePayload.id || createClientId("project"),
            createdAt: createTimestamp(),
            likesCount: 0
        }, visibility);

        await writeFirebaseValue(`${buildProjectVisibilityPath(visibility)}/${project.id}`, project);
        return project;
    }

    const response = await requestJson("/projects", {
        method: "POST",
        body: safePayload
    });
    invalidateClientBootstrap();
    return normalizeProject(response?.project || safePayload, visibility);
}

export async function likeProject(visibility, projectId) {
    if (PROJECTS_DATA_MODE === "firebase") {
        const path = `${buildProjectVisibilityPath(visibility)}/${projectId}`;
        const currentProject = await readFirebaseValue(path);
        if (!currentProject) {
            throw new Error("Project not found.");
        }

        const nextProject = normalizeProject(currentProject, visibility);
        nextProject.likesCount = parseCompactCount(nextProject.likesCount) + 1;
        await writeFirebaseValue(path, nextProject);
        return nextProject;
    }

    const response = await requestJson(`/projects/${encodeURIComponent(projectId)}/like`, {
        method: "POST",
        body: { visibility }
    });
    invalidateClientBootstrap();
    return normalizeProject(response?.project || { id: projectId, visibility }, visibility);
}

export async function deleteProject(visibility, projectId, requesterId) {
    if (PROJECTS_DATA_MODE === "firebase") {
        const path = `${buildProjectVisibilityPath(visibility)}/${projectId}`;
        const currentProject = await readFirebaseValue(path);
        if (!currentProject) {
            throw new Error("Project not found.");
        }

        const normalizedProject = normalizeProject(currentProject, visibility);
        if (String(normalizedProject.ownerId || "") !== String(requesterId || "")) {
            throw new Error("You can only delete your own projects.");
        }

        await removeFirebaseValue(path);
        return normalizedProject;
    }

    const response = await requestJson(`/projects/${encodeURIComponent(projectId)}`, {
        method: "DELETE",
        body: {
            visibility,
            requesterId
        }
    });

    invalidateClientBootstrap();
    return normalizeProject(response?.project || { id: projectId, visibility, ownerId: requesterId }, visibility);
}

export async function loadStudentProfile(userId, fallbackValue = DEFAULT_STUDENT_PROFILE) {
    if (!userId) return normalizeStudentProfile(fallbackValue, fallbackValue);

    if (STUDENT_PROFILE_DATA_MODE === "firebase") {
        try {
            const savedProfile = await readFirebaseValue(buildStudentProfilePath(userId));
            const authUser = auth.currentUser?.uid === userId ? auth.currentUser : null;
            const authDefaults = buildProfileFromAuthUser(authUser, fallbackValue);

            if (savedProfile) {
                return normalizeStudentProfile({
                    ...authDefaults,
                    ...cloneData(savedProfile),
                    displayName: savedProfile.displayName || authDefaults.displayName,
                    email: savedProfile.email || authDefaults.email || ""
                }, fallbackValue);
            }

            return authDefaults;
        } catch (error) {
            console.warn("Unable to load Firebase student profile:", error);
            return normalizeStudentProfile(fallbackValue, fallbackValue);
        }
    }

    if (memoryBootstrap?.studentProfile && (!bootstrapPollUserId || bootstrapPollUserId === userId)) {
        return normalizeStudentProfile(memoryBootstrap.studentProfile, fallbackValue);
    }

    try {
        const payload = await requestJson(`/students/${encodeURIComponent(userId)}/profile`);
        return normalizeStudentProfile(payload?.profile, fallbackValue);
    } catch (error) {
        if (shouldLogApiWarning(error)) {
            console.warn("Unable to load student profile:", error);
        }
        return normalizeStudentProfile(fallbackValue, fallbackValue);
    }
}

export function watchStudentProfile(userId, fallbackValue = DEFAULT_STUDENT_PROFILE, callback = () => { }) {
    if (!userId) {
        callback(normalizeStudentProfile(fallbackValue, fallbackValue));
        return () => { };
    }

    if (STUDENT_PROFILE_DATA_MODE === "firebase") {
        return watchFirebaseValue(buildStudentProfilePath(userId), fallbackValue, (profile) => {
            callback(normalizeStudentProfile(profile, fallbackValue));
        });
    }

    let isClosed = false;
    let previousSignature = "";

    const emitProfile = (profile) => {
        const nextProfile = normalizeStudentProfile(profile, fallbackValue);
        const nextSignature = JSON.stringify(nextProfile);
        if (nextSignature === previousSignature) {
            return;
        }

        previousSignature = nextSignature;
        callback(nextProfile);
    };

    const emit = async () => {
        try {
            const nextProfile = await loadStudentProfile(userId, fallbackValue);
            if (!isClosed) {
                emitProfile(nextProfile);
            }
        } catch (error) {
            if (shouldLogApiWarning(error)) {
                console.warn("Unable to watch student profile:", error);
            }
        }
    };

    const handleBootstrapUpdate = (event) => {
        if (isClosed) return;
        const profile = event.detail?.studentProfile;
        if (profile && (!bootstrapPollUserId || bootstrapPollUserId === userId)) {
            emitProfile(profile);
        }
    };

    emit();
    window.addEventListener("hacklab:bootstrap", handleBootstrapUpdate);

    return () => {
        isClosed = true;
        window.removeEventListener("hacklab:bootstrap", handleBootstrapUpdate);
    };
}

export async function saveStudentProfile(userId, profile) {
    if (!userId) {
        throw new Error("A user ID is required to save a student profile.");
    }

    if (STUDENT_PROFILE_DATA_MODE === "firebase") {
        const nextProfile = normalizeStudentProfile({
            ...(profile || {}),
            updatedAt: createTimestamp()
        }, profile || DEFAULT_STUDENT_PROFILE);
        await writeFirebaseValue(buildStudentProfilePath(userId), nextProfile);
        return nextProfile;
    }

    const response = await requestJson(`/students/${encodeURIComponent(userId)}/profile`, {
        method: "PUT",
        body: { profile }
    });

    invalidateClientBootstrap();
    return normalizeStudentProfile(response?.profile, profile || DEFAULT_STUDENT_PROFILE);
}

export async function loadStudentDirectory(fallbackValue = []) {
    if (STUDENT_PROFILE_DATA_MODE === "firebase") {
        try {
            const studentProfilesNode = await readFirebaseValue(FIREBASE_COLLECTIONS.studentProfiles);
            const studentProfiles = normalizeRecordMap(studentProfilesNode);
            const teacherEmails = await loadTeacherEmailSet();

            const directory = Object.entries(studentProfiles)
                .map(([userId, profile]) => {
                    const normalizedProfile = normalizeStudentProfile(profile, DEFAULT_STUDENT_PROFILE);
                    const email = normalizeAccountEmail(normalizedProfile.email);
                    if (email && teacherEmails.has(email)) {
                        return null;
                    }

                    return {
                        userId,
                        profile: normalizedProfile
                    };
                })
                .filter(Boolean);

            return directory.sort((left, right) => {
                const leftUpdated = new Date(left.profile?.updatedAt || 0).getTime();
                const rightUpdated = new Date(right.profile?.updatedAt || 0).getTime();
                return rightUpdated - leftUpdated;
            });
        } catch (error) {
            console.warn("Unable to load Firebase student directory:", error);
            return Array.isArray(fallbackValue) ? fallbackValue.map((entry) => normalizeStudentDirectoryEntry(entry)) : [];
        }
    }

    try {
        const payload = await requestJson("/students");
        const students = Array.isArray(payload?.students) ? payload.students : fallbackValue;
        return students.map((entry) => normalizeStudentDirectoryEntry(entry));
    } catch (error) {
        if (shouldLogApiWarning(error)) {
            console.warn("Unable to load student directory:", error);
        }
        return Array.isArray(fallbackValue) ? fallbackValue.map((entry) => normalizeStudentDirectoryEntry(entry)) : [];
    }
}

export async function loadCollaborationState(userId, fallbackValue = { userId, inbox: [], sent: [], contacts: [] }) {
    if (!userId) {
        return normalizeCollaborationState(fallbackValue, userId);
    }

    if (COLLABORATION_DATA_MODE === "firebase") {
        try {
            const savedState = await readFirebaseValue(buildCollaborationStatePath(userId));
            const authUser = auth.currentUser?.uid === userId ? auth.currentUser : null;

            const baseState = normalizeCollaborationState(savedState || fallbackValue, userId);
            const normalizedProfile = normalizeCollaborationProfile({
                name: baseState.profile?.name && baseState.profile.name !== "HackLab Member"
                    ? baseState.profile.name
                    : (authUser ? getDisplayName(authUser, baseState.profile?.name) : baseState.profile?.name),
                email: baseState.profile?.email || authUser?.email || "",
                avatar: baseState.profile?.avatar && baseState.profile.avatar !== "images/avatar.png"
                    ? baseState.profile.avatar
                    : (authUser?.photoURL || baseState.profile?.avatar),
                role: baseState.profile?.role || "student"
            });

            const normalizedState = normalizeCollaborationState({
                ...baseState,
                profile: normalizedProfile
            }, userId);
            cacheCollaborationStateForDirectory(normalizedState);
            return normalizedState;
        } catch (error) {
            console.warn("Unable to load Firebase collaboration state:", error);
            return normalizeCollaborationState(fallbackValue, userId);
        }
    }

    if (memoryBootstrap?.collaboration && (!bootstrapPollUserId || bootstrapPollUserId === userId)) {
        const normalizedState = normalizeCollaborationState(memoryBootstrap.collaboration, userId);
        cacheCollaborationStateForDirectory(normalizedState);
        return normalizedState;
    }

    try {
        const payload = await requestJson(`/collaboration/${encodeURIComponent(userId)}`);
        const normalizedState = normalizeCollaborationState(payload?.state, userId);
        cacheCollaborationStateForDirectory(normalizedState);
        return normalizedState;
    } catch (error) {
        if (shouldLogApiWarning(error)) {
            console.warn("Unable to load collaboration state:", error);
        }
        return normalizeCollaborationState(fallbackValue, userId);
    }
}

export async function saveCollaborationState(userId, state) {
    if (!userId) {
        throw new Error("A user ID is required to save collaboration state.");
    }

    if (COLLABORATION_DATA_MODE === "firebase") {
        const normalizedState = normalizeCollaborationState({
            ...(state || {}),
            userId,
            updatedAt: createTimestamp()
        }, userId);
        await writeFirebaseValue(buildCollaborationStatePath(userId), normalizedState);
        cacheCollaborationStateForDirectory(normalizedState);
        return normalizedState;
    }

    const response = await requestJson(`/collaboration/${encodeURIComponent(userId)}`, {
        method: "PUT",
        body: { state }
    });
    invalidateClientBootstrap();

    const normalizedState = normalizeCollaborationState(response?.state, userId);
    cacheCollaborationStateForDirectory(normalizedState);
    return normalizedState;
}

export async function loadOpenCollaborators() {
    if (COLLABORATION_DATA_MODE === "firebase") {
        try {
            const states = normalizeRecordMap(await readFirebaseValue(FIREBASE_COLLECTIONS.collaboration));
            const collaborators = Object.values(states)
                .map((state) => normalizeOpenCollaborator(normalizeCollaborationState(state, state?.userId || "")))
                .filter((entry) => entry.userId && entry.isOpenToCollaborate);
            cacheOpenCollaboratorEntries(collaborators);
            return collaborators;
        } catch (error) {
            console.warn("Unable to load Firebase open collaborators:", error);
            return readCachedOpenCollaborators();
        }
    }

    const directoryPaths = ["/collaboration/open", "/collaboration-directory/open"];

    try {
        for (const path of directoryPaths) {
            try {
                const response = await requestJson(path);
                if (!Array.isArray(response?.collaborators)) {
                    continue;
                }

                const collaborators = response.collaborators.map((entry) => normalizeOpenCollaborator(entry));
                cacheOpenCollaboratorEntries(collaborators);
                return collaborators;
            } catch (error) {
                if (shouldLogApiWarning(error)) {
                    console.warn(`Unable to load open collaborators from ${path}:`, error);
                }
            }
        }

        return readCachedOpenCollaborators();
    } catch (error) {
        if (shouldLogApiWarning(error)) {
            console.warn("Unable to load open collaborators:", error);
        }
        return readCachedOpenCollaborators();
    }
}
