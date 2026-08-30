import crypto from "node:crypto";
import dns from "node:dns";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import cassandra from "cassandra-driver";
import dotenv from "dotenv";
import express from "express";

import { createMemoryCache } from "./api-cache.js";
import {
    DEFAULT_ASKFORGE_QUESTIONS,
    CONTENT_PATHS,
    DEFAULT_AUTHORITY_ARTICLES,
    DEFAULT_COMMUNITY_POSTS,
    DEFAULT_DASHBOARD_ANNOUNCEMENT,
    DEFAULT_EVENTS,
    DEFAULT_OVERVIEW_TASKS,
    DEFAULT_PROJECTS,
    DEFAULT_RESOURCES,
    DEFAULT_STUDENT_ARTICLES,
    DEFAULT_STUDENT_PROFILE,
    DEFAULT_VIDEO_COURSES
} from "../app-defaults.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_DIR = path.join(__dirname, "data");
const FALLBACK_STORE_PATH = path.join(DATA_DIR, "local-store.json");
const TOKEN_FILE_PATH = path.join(ROOT_DIR, "Hack_Lab-token.json");

dotenv.config({ path: path.join(ROOT_DIR, ".env") });

// Windows/corporate DNS often refuses queryA; cassandra-driver needs working resolve4.
const configuredDnsServers = String(process.env.DNS_SERVERS || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
if (configuredDnsServers.length) {
    dns.setServers(configuredDnsServers);
} else if (!["1", "true", "yes"].includes(String(process.env.LOCAL_DEV || "").trim().toLowerCase())) {
    dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const ASTRA_DB_ID = process.env.ASTRA_DB_ID || "";
const ASTRA_DB_KEYSPACE = process.env.ASTRA_DB_KEYSPACE || "";
const ASTRA_DB_SECURE_BUNDLE_PATH = process.env.ASTRA_DB_SECURE_BUNDLE_PATH || "";

function listSecureBundleCandidates() {
    const searchRoots = [
        ROOT_DIR,
        process.env.NETLIFY_FUNC_ROOT || "",
        process.env.LAMBDA_TASK_ROOT || "",
        process.cwd()
    ]
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
        .filter((entry, index, list) => list.indexOf(entry) === index);

    const candidates = [];

    for (const searchRoot of searchRoots) {
        try {
            const matches = fs.readdirSync(searchRoot, { withFileTypes: true })
                .filter((entry) => entry.isFile() && /^secure-connect.*\.zip$/i.test(entry.name))
                .map((entry) => path.join(searchRoot, entry.name));
            candidates.push(...matches);
        } catch {
            // Ignore unreadable directories in serverless runtimes.
        }
    }

    return candidates.sort();
}

function resolveSecureBundlePath() {
    const configuredPath = ASTRA_DB_SECURE_BUNDLE_PATH
        ? (path.isAbsolute(ASTRA_DB_SECURE_BUNDLE_PATH)
            ? ASTRA_DB_SECURE_BUNDLE_PATH
            : path.resolve(ROOT_DIR, ASTRA_DB_SECURE_BUNDLE_PATH))
        : "";

    if (configuredPath && fs.existsSync(configuredPath)) {
        return configuredPath;
    }

    const autoDetectedBundle = listSecureBundleCandidates()[0];

    if (autoDetectedBundle) {
        return autoDetectedBundle;
    }

    if (configuredPath) {
        throw new Error(`Secure connect bundle not found at ${configuredPath}`);
    }

    throw new Error("Secure connect bundle not configured. Add ASTRA_DB_SECURE_BUNDLE_PATH or place a secure-connect zip in the project root.");
}

function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
}

function parseCompactCount(value) {
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

function createIsoNow() {
    return new Date().toISOString();
}

function getAstraToken() {
    if (process.env.ASTRA_DB_APPLICATION_TOKEN) {
        return process.env.ASTRA_DB_APPLICATION_TOKEN;
    }

    if (!fs.existsSync(TOKEN_FILE_PATH)) {
        return "";
    }

    try {
        const raw = fs.readFileSync(TOKEN_FILE_PATH, "utf8");
        const parsed = JSON.parse(raw);
        return parsed.token || "";
    } catch (error) {
        console.warn("Unable to read local Astra token file:", error);
        return "";
    }
}

const ASTRA_DB_APPLICATION_TOKEN = getAstraToken();

const DEPRECATED_COMMUNITY_POST_IDS = new Set(["community-post-tejas"]);

function withoutDeprecatedCommunityPosts(posts) {
    return posts.filter((post) => !DEPRECATED_COMMUNITY_POST_IDS.has(post.id));
}

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
        id: post.id || crypto.randomUUID(),
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
        createdAt: post.createdAt || createIsoNow()
    };
}

function normalizeProject(project, visibility = "public") {
    return {
        id: project.id || crypto.randomUUID(),
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
        createdAt: project.createdAt || createIsoNow()
    };
}

function normalizeCollaborationRequest(request = {}) {
    const status = String(request.status || "pending").toLowerCase();

    return {
        id: request.id || crypto.randomUUID(),
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
        createdAt: request.createdAt || createIsoNow()
    };
}

function normalizeCollaborationContact(contact = {}) {
    return {
        userId: contact.userId || "",
        name: contact.name || "HackLab Member",
        email: contact.email || "",
        avatar: contact.avatar || "images/avatar.png",
        role: contact.role || "student",
        connectedAt: contact.connectedAt || createIsoNow()
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

function normalizeCollaborationState(state = {}, userId = "") {
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
        inbox: sortByCreatedAtDesc(inbox),
        sent: sortByCreatedAtDesc(sent),
        contacts,
        updatedAt: state.updatedAt || createIsoNow()
    };
}

function normalizeProfile(profile = {}) {
    const base = cloneData(DEFAULT_STUDENT_PROFILE);
    return {
        ...base,
        ...cloneData(profile),
        stats: {
            ...(base.stats || {}),
            ...cloneData(profile.stats || {})
        },
        progress: Array.isArray(profile.progress) ? cloneData(profile.progress) : cloneData(base.progress || []),
        assignments: Array.isArray(profile.assignments) ? cloneData(profile.assignments) : cloneData(base.assignments || []),
        teacherTags: Array.isArray(profile.teacherTags) ? cloneData(profile.teacherTags) : cloneData(base.teacherTags || []),
        courseProgress: profile.courseProgress && typeof profile.courseProgress === "object"
            ? cloneData(profile.courseProgress)
            : cloneData(base.courseProgress || {}),
        updatedAt: profile.updatedAt || createIsoNow()
    };
}

function sortByCreatedAtDesc(items) {
    return [...items].sort((left, right) => {
        const leftValue = new Date(left.createdAt || 0).getTime();
        const rightValue = new Date(right.createdAt || 0).getTime();
        return rightValue - leftValue;
    });
}

function sortProjects(projects) {
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

function buildInitialState() {
    const now = createIsoNow();

    return {
        content: Object.fromEntries(
            Object.entries(DEFAULT_CONTENT_MAP).map(([section, value]) => [
                section,
                {
                    value: cloneData(value),
                    updatedAt: now
                }
            ])
        ),
        community: {
            general: sortByCreatedAtDesc(DEFAULT_COMMUNITY_POSTS.map((post) => normalizeCommunityPost(post, "general")))
        },
        projects: {
            public: sortProjects(DEFAULT_PROJECTS.map((project) => normalizeProject(project, "public")))
        },
        collaboration: {},
        studentProfiles: {}
    };
}

class JsonStore {
    constructor(filePath) {
        this.filePath = filePath;
        this.data = null;
    }

    async init() {
        await fsPromises.mkdir(path.dirname(this.filePath), { recursive: true });
        await this.ensureData();
    }

    async ensureData() {
        if (this.data) return this.data;

        if (fs.existsSync(this.filePath)) {
            try {
                const raw = await fsPromises.readFile(this.filePath, "utf8");
                this.data = JSON.parse(raw);
            } catch (error) {
                console.warn("Unable to read local fallback store, rebuilding it:", error);
                this.data = buildInitialState();
                await this.persist();
            }
        } else {
            this.data = buildInitialState();
            await this.persist();
        }

        this.data.content ||= {};
        this.data.community ||= {};
        this.data.projects ||= {};
        this.data.collaboration ||= {};
        this.data.studentProfiles ||= {};

        return this.data;
    }

    async persist() {
        await fsPromises.writeFile(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
    }

    async getContent(section) {
        await this.ensureData();

        if (!this.data.content[section]) {
            this.data.content[section] = {
                value: cloneData(DEFAULT_CONTENT_MAP[section] || []),
                updatedAt: createIsoNow()
            };
            await this.persist();
        }

        return cloneData(this.data.content[section]);
    }

    async setContent(section, value) {
        await this.ensureData();
        this.data.content[section] = {
            value: cloneData(value),
            updatedAt: createIsoNow()
        };
        await this.persist();
        return cloneData(this.data.content[section]);
    }

    async listCommunityPosts(feed = "general") {
        await this.ensureData();

        if (!Array.isArray(this.data.community[feed]) || !this.data.community[feed].length) {
            if (feed === "general") {
                this.data.community[feed] = sortByCreatedAtDesc(DEFAULT_COMMUNITY_POSTS.map((post) => normalizeCommunityPost(post, feed)));
                await this.persist();
            } else {
                this.data.community[feed] = [];
            }
        }

        const normalized = sortByCreatedAtDesc(this.data.community[feed].map((post) => normalizeCommunityPost(post, feed)));
        const needsMigration = this.data.community[feed].some((post) => !Array.isArray(post.likedBy));
        if (needsMigration) {
            this.data.community[feed] = normalized;
            await this.persist();
        }
        const filtered = withoutDeprecatedCommunityPosts(normalized);
        if (filtered.length !== normalized.length) {
            this.data.community[feed] = filtered;
            await this.persist();
        }
        return filtered;
    }

    async createCommunityPost(payload) {
        await this.ensureData();

        const feed = payload.feed || "general";
        const post = normalizeCommunityPost({
            ...payload,
            id: crypto.randomUUID(),
            createdAt: createIsoNow(),
            likeCount: 0
        }, feed);

        this.data.community[feed] ||= [];
        this.data.community[feed].unshift(post);
        this.data.community[feed] = sortByCreatedAtDesc(this.data.community[feed]);
        await this.persist();
        return cloneData(post);
    }

    async updateCommunityPost(feed = "general", postId, payload) {
        await this.ensureData();
        this.data.community[feed] ||= [];

        const index = this.data.community[feed].findIndex((post) => post.id === postId);
        if (index === -1) {
            throw new Error("Community post not found.");
        }

        const currentPost = normalizeCommunityPost(this.data.community[feed][index], feed);
        if (String(currentPost.authorId || "") !== String(payload.authorId || "")) {
            throw new Error("You can only edit your own posts.");
        }

        const text = String(payload.text || "").trim();
        const mediaLabel = String(payload.mediaLabel || "").trim();
        const mediaType = String(payload.mediaType || currentPost.mediaType || "").trim();
        const mediaDataUrl = typeof payload.mediaDataUrl === "string"
            ? payload.mediaDataUrl
            : currentPost.mediaDataUrl || "";
        if (!text && !mediaLabel && !mediaDataUrl) {
            throw new Error("A post needs text or media.");
        }

        const nextPost = normalizeCommunityPost({
            ...currentPost,
            authorName: payload.authorName || currentPost.authorName,
            authorRole: payload.authorRole || currentPost.authorRole,
            authorAvatar: payload.authorAvatar || currentPost.authorAvatar,
            text,
            mediaLabel,
            mediaType,
            mediaDataUrl
        }, feed);

        this.data.community[feed][index] = nextPost;
        this.data.community[feed] = sortByCreatedAtDesc(this.data.community[feed]);
        await this.persist();
        return cloneData(nextPost);
    }

    async deleteCommunityPost(feed = "general", postId, authorId) {
        await this.ensureData();
        this.data.community[feed] ||= [];

        const index = this.data.community[feed].findIndex((post) => post.id === postId);
        if (index === -1) {
            throw new Error("Community post not found.");
        }

        const currentPost = normalizeCommunityPost(this.data.community[feed][index], feed);
        if (String(currentPost.authorId || "") !== String(authorId || "")) {
            throw new Error("You can only delete your own posts.");
        }

        const [deletedPost] = this.data.community[feed].splice(index, 1);
        await this.persist();
        return cloneData(deletedPost);
    }

    async likeCommunityPost(feed = "general", postId, userId = "") {
        await this.ensureData();
        this.data.community[feed] ||= [];

        const index = this.data.community[feed].findIndex((post) => post.id === postId);
        if (index === -1) {
            throw new Error("Community post not found.");
        }

        const post = normalizeCommunityPost(this.data.community[feed][index], feed);
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

        this.data.community[feed][index] = post;
        await this.persist();
        return cloneData(post);
    }

    async listProjects(visibility = "public") {
        await this.ensureData();

        if (!Array.isArray(this.data.projects[visibility]) || !this.data.projects[visibility].length) {
            if (visibility === "public") {
                this.data.projects[visibility] = sortProjects(DEFAULT_PROJECTS.map((project) => normalizeProject(project, visibility)));
                await this.persist();
            } else {
                this.data.projects[visibility] = [];
            }
        }

        return sortProjects(this.data.projects[visibility].map((project) => normalizeProject(project, visibility)));
    }

    async createProject(payload) {
        await this.ensureData();

        const visibility = payload.visibility || "public";
        const project = normalizeProject({
            ...payload,
            id: crypto.randomUUID(),
            createdAt: createIsoNow(),
            likesCount: 0
        }, visibility);

        this.data.projects[visibility] ||= [];
        this.data.projects[visibility].unshift(project);
        this.data.projects[visibility] = sortProjects(this.data.projects[visibility]);
        await this.persist();
        return cloneData(project);
    }

    async likeProject(visibility = "public", projectId) {
        await this.ensureData();
        this.data.projects[visibility] ||= [];

        const index = this.data.projects[visibility].findIndex((project) => project.id === projectId);
        if (index === -1) {
            throw new Error("Project not found.");
        }

        const project = this.data.projects[visibility][index];
        project.likesCount = parseCompactCount(project.likesCount) + 1;
        this.data.projects[visibility] = sortProjects(this.data.projects[visibility]);
        await this.persist();
        return cloneData(project);
    }

    async deleteProject(visibility = "public", projectId, requesterId = "") {
        await this.ensureData();
        this.data.projects[visibility] ||= [];

        const index = this.data.projects[visibility].findIndex((project) => project.id === projectId);
        if (index === -1) {
            throw new Error("Project not found.");
        }

        const project = normalizeProject(this.data.projects[visibility][index], visibility);
        if (String(project.ownerId || "") !== String(requesterId || "")) {
            throw new Error("You can only delete your own projects.");
        }

        const [deletedProject] = this.data.projects[visibility].splice(index, 1);
        await this.persist();
        return cloneData(deletedProject);
    }

    async getCollaborationState(userId) {
        await this.ensureData();

        if (!this.data.collaboration[userId]) {
            this.data.collaboration[userId] = normalizeCollaborationState({}, userId);
            await this.persist();
        }

        return normalizeCollaborationState(this.data.collaboration[userId], userId);
    }

    async setCollaborationState(userId, state) {
        await this.ensureData();
        this.data.collaboration[userId] = normalizeCollaborationState({
            ...state,
            userId,
            updatedAt: createIsoNow()
        }, userId);
        await this.persist();
        return normalizeCollaborationState(this.data.collaboration[userId], userId);
    }

    async listOpenCollaborators() {
        await this.ensureData();

        return Object.values(this.data.collaboration || {})
            .map((state) => normalizeCollaborationState(state, state.userId || ""))
            .filter((state) => state.isOpenToCollaborate && state.userId);
    }

    async getStudentProfile(userId) {
        await this.ensureData();

        if (!this.data.studentProfiles[userId]) {
            this.data.studentProfiles[userId] = normalizeProfile();
            await this.persist();
        }

        return normalizeProfile(this.data.studentProfiles[userId]);
    }

    async listStudentProfiles() {
        await this.ensureData();

        return Object.entries(this.data.studentProfiles || {})
            .map(([userId, profile]) => ({
                userId,
                profile: normalizeProfile(profile)
            }))
            .sort((left, right) => {
                const leftUpdated = new Date(left.profile?.updatedAt || 0).getTime();
                const rightUpdated = new Date(right.profile?.updatedAt || 0).getTime();
                return rightUpdated - leftUpdated;
            });
    }

    async setStudentProfile(userId, profile) {
        await this.ensureData();
        this.data.studentProfiles[userId] = normalizeProfile(profile);
        await this.persist();
        return normalizeProfile(this.data.studentProfiles[userId]);
    }

    async health() {
        await this.ensureData();
        return {
            mode: "local-fallback",
            filePath: this.filePath
        };
    }
}

class AstraStore {
    constructor() {
        this.client = null;
    }

    async init() {
        if (!ASTRA_DB_APPLICATION_TOKEN || !ASTRA_DB_KEYSPACE || !ASTRA_DB_SECURE_BUNDLE_PATH) {
            if (!ASTRA_DB_APPLICATION_TOKEN || !ASTRA_DB_KEYSPACE) {
                throw new Error("Astra configuration is incomplete. Add the keyspace and application token.");
            }
        }

        const bundlePath = resolveSecureBundlePath();

        this.client = new cassandra.Client({
            cloud: {
                secureConnectBundle: bundlePath
            },
            credentials: {
                username: "token",
                password: ASTRA_DB_APPLICATION_TOKEN
            },
            keyspace: ASTRA_DB_KEYSPACE
        });

        await this.client.connect();
        await this.client.execute(`
            CREATE TABLE IF NOT EXISTS app_content (
                section text PRIMARY KEY,
                payload text,
                updated_at timestamp
            )
        `);
        await this.client.execute(`
            CREATE TABLE IF NOT EXISTS community_posts (
                feed text,
                post_id text,
                payload text,
                created_at timestamp,
                PRIMARY KEY ((feed), post_id)
            )
        `);
        await this.client.execute(`
            CREATE TABLE IF NOT EXISTS student_projects (
                visibility text,
                project_id text,
                payload text,
                created_at timestamp,
                PRIMARY KEY ((visibility), project_id)
            )
        `);
        await this.client.execute(`
            CREATE TABLE IF NOT EXISTS student_profiles (
                user_id text PRIMARY KEY,
                payload text,
                updated_at timestamp
            )
        `);
        await this.client.execute(`
            CREATE TABLE IF NOT EXISTS collaboration_state (
                user_id text PRIMARY KEY,
                payload text,
                updated_at timestamp
            )
        `);
    }

    async getContent(section) {
        const result = await this.client.execute(
            "SELECT payload, updated_at FROM app_content WHERE section = ?",
            [section],
            { prepare: true }
        );

        if (!result.rowLength) {
            return this.setContent(section, cloneData(DEFAULT_CONTENT_MAP[section] || []));
        }

        const row = result.first();
        return {
            value: JSON.parse(row.payload || "[]"),
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : createIsoNow()
        };
    }

    async setContent(section, value) {
        const updatedAt = new Date();
        await this.client.execute(
            "INSERT INTO app_content (section, payload, updated_at) VALUES (?, ?, ?)",
            [section, JSON.stringify(value), updatedAt],
            { prepare: true }
        );

        return {
            value: cloneData(value),
            updatedAt: updatedAt.toISOString()
        };
    }

    async listCommunityPosts(feed = "general") {
        const result = await this.client.execute(
            "SELECT post_id, payload FROM community_posts WHERE feed = ?",
            [feed],
            { prepare: true }
        );

        if (!result.rowLength && feed === "general") {
            for (const post of DEFAULT_COMMUNITY_POSTS.map((item) => normalizeCommunityPost(item, feed))) {
                await this.client.execute(
                    "INSERT INTO community_posts (feed, post_id, payload, created_at) VALUES (?, ?, ?, ?)",
                    [feed, post.id, JSON.stringify(post), new Date(post.createdAt)],
                    { prepare: true }
                );
            }

            return this.listCommunityPosts(feed);
        }

        const posts = withoutDeprecatedCommunityPosts(
            sortByCreatedAtDesc(
                result.rows.map((row) => normalizeCommunityPost(JSON.parse(row.payload || "{}"), feed))
            )
        );

        for (const postId of DEPRECATED_COMMUNITY_POST_IDS) {
            if (result.rows.some((row) => row.post_id === postId)) {
                await this.client.execute(
                    "DELETE FROM community_posts WHERE feed = ? AND post_id = ?",
                    [feed, postId],
                    { prepare: true }
                ).catch(() => { });
            }
        }

        return posts;
    }

    async createCommunityPost(payload) {
        const feed = payload.feed || "general";
        const post = normalizeCommunityPost({
            ...payload,
            id: crypto.randomUUID(),
            createdAt: createIsoNow(),
            likeCount: 0
        }, feed);

        await this.client.execute(
            "INSERT INTO community_posts (feed, post_id, payload, created_at) VALUES (?, ?, ?, ?)",
            [feed, post.id, JSON.stringify(post), new Date(post.createdAt)],
            { prepare: true }
        );

        return cloneData(post);
    }

    async updateCommunityPost(feed = "general", postId, payload) {
        const result = await this.client.execute(
            "SELECT payload FROM community_posts WHERE feed = ? AND post_id = ?",
            [feed, postId],
            { prepare: true }
        );

        if (!result.rowLength) {
            throw new Error("Community post not found.");
        }

        const currentPost = normalizeCommunityPost(JSON.parse(result.first().payload || "{}"), feed);
        if (String(currentPost.authorId || "") !== String(payload.authorId || "")) {
            throw new Error("You can only edit your own posts.");
        }

        const text = String(payload.text || "").trim();
        const mediaLabel = String(payload.mediaLabel || "").trim();
        const mediaType = String(payload.mediaType || currentPost.mediaType || "").trim();
        const mediaDataUrl = typeof payload.mediaDataUrl === "string"
            ? payload.mediaDataUrl
            : currentPost.mediaDataUrl || "";
        if (!text && !mediaLabel && !mediaDataUrl) {
            throw new Error("A post needs text or media.");
        }

        const nextPost = normalizeCommunityPost({
            ...currentPost,
            authorName: payload.authorName || currentPost.authorName,
            authorRole: payload.authorRole || currentPost.authorRole,
            authorAvatar: payload.authorAvatar || currentPost.authorAvatar,
            text,
            mediaLabel,
            mediaType,
            mediaDataUrl
        }, feed);

        await this.client.execute(
            "INSERT INTO community_posts (feed, post_id, payload, created_at) VALUES (?, ?, ?, ?)",
            [feed, nextPost.id, JSON.stringify(nextPost), new Date(nextPost.createdAt)],
            { prepare: true }
        );

        return cloneData(nextPost);
    }

    async deleteCommunityPost(feed = "general", postId, authorId) {
        const result = await this.client.execute(
            "SELECT payload FROM community_posts WHERE feed = ? AND post_id = ?",
            [feed, postId],
            { prepare: true }
        );

        if (!result.rowLength) {
            throw new Error("Community post not found.");
        }

        const currentPost = normalizeCommunityPost(JSON.parse(result.first().payload || "{}"), feed);
        if (String(currentPost.authorId || "") !== String(authorId || "")) {
            throw new Error("You can only delete your own posts.");
        }

        await this.client.execute(
            "DELETE FROM community_posts WHERE feed = ? AND post_id = ?",
            [feed, postId],
            { prepare: true }
        );

        return cloneData(currentPost);
    }

    async likeCommunityPost(feed = "general", postId, userId = "") {
        const result = await this.client.execute(
            "SELECT payload FROM community_posts WHERE feed = ? AND post_id = ?",
            [feed, postId],
            { prepare: true }
        );

        if (!result.rowLength) {
            throw new Error("Community post not found.");
        }

        const post = normalizeCommunityPost(JSON.parse(result.first().payload || "{}"), feed);
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

        await this.client.execute(
            "INSERT INTO community_posts (feed, post_id, payload, created_at) VALUES (?, ?, ?, ?)",
            [feed, post.id, JSON.stringify(post), new Date(post.createdAt)],
            { prepare: true }
        );

        return cloneData(post);
    }

    async listProjects(visibility = "public") {
        const result = await this.client.execute(
            "SELECT project_id, payload FROM student_projects WHERE visibility = ?",
            [visibility],
            { prepare: true }
        );

        if (!result.rowLength && visibility === "public") {
            for (const project of DEFAULT_PROJECTS.map((item) => normalizeProject(item, visibility))) {
                await this.client.execute(
                    "INSERT INTO student_projects (visibility, project_id, payload, created_at) VALUES (?, ?, ?, ?)",
                    [visibility, project.id, JSON.stringify(project), new Date(project.createdAt)],
                    { prepare: true }
                );
            }

            return this.listProjects(visibility);
        }

        return sortProjects(
            result.rows.map((row) => normalizeProject(JSON.parse(row.payload || "{}"), visibility))
        );
    }

    async createProject(payload) {
        const visibility = payload.visibility || "public";
        const project = normalizeProject({
            ...payload,
            id: crypto.randomUUID(),
            createdAt: createIsoNow(),
            likesCount: 0
        }, visibility);

        await this.client.execute(
            "INSERT INTO student_projects (visibility, project_id, payload, created_at) VALUES (?, ?, ?, ?)",
            [visibility, project.id, JSON.stringify(project), new Date(project.createdAt)],
            { prepare: true }
        );

        return cloneData(project);
    }

    async likeProject(visibility = "public", projectId) {
        const result = await this.client.execute(
            "SELECT payload FROM student_projects WHERE visibility = ? AND project_id = ?",
            [visibility, projectId],
            { prepare: true }
        );

        if (!result.rowLength) {
            throw new Error("Project not found.");
        }

        const project = normalizeProject(JSON.parse(result.first().payload || "{}"), visibility);
        project.likesCount = parseCompactCount(project.likesCount) + 1;

        await this.client.execute(
            "INSERT INTO student_projects (visibility, project_id, payload, created_at) VALUES (?, ?, ?, ?)",
            [visibility, project.id, JSON.stringify(project), new Date(project.createdAt)],
            { prepare: true }
        );

        return cloneData(project);
    }

    async deleteProject(visibility = "public", projectId, requesterId = "") {
        const result = await this.client.execute(
            "SELECT payload FROM student_projects WHERE visibility = ? AND project_id = ?",
            [visibility, projectId],
            { prepare: true }
        );

        if (!result.rowLength) {
            throw new Error("Project not found.");
        }

        const project = normalizeProject(JSON.parse(result.first().payload || "{}"), visibility);
        if (String(project.ownerId || "") !== String(requesterId || "")) {
            throw new Error("You can only delete your own projects.");
        }

        await this.client.execute(
            "DELETE FROM student_projects WHERE visibility = ? AND project_id = ?",
            [visibility, projectId],
            { prepare: true }
        );

        return cloneData(project);
    }

    async getCollaborationState(userId) {
        const result = await this.client.execute(
            "SELECT payload FROM collaboration_state WHERE user_id = ?",
            [userId],
            { prepare: true }
        );

        if (!result.rowLength) {
            return this.setCollaborationState(userId, normalizeCollaborationState({}, userId));
        }

        return normalizeCollaborationState(JSON.parse(result.first().payload || "{}"), userId);
    }

    async setCollaborationState(userId, state) {
        const nextState = normalizeCollaborationState({
            ...state,
            userId,
            updatedAt: createIsoNow()
        }, userId);

        await this.client.execute(
            "INSERT INTO collaboration_state (user_id, payload, updated_at) VALUES (?, ?, ?)",
            [userId, JSON.stringify(nextState), new Date()],
            { prepare: true }
        );

        return normalizeCollaborationState(nextState, userId);
    }

    async listOpenCollaborators() {
        const result = await this.client.execute(
            "SELECT user_id, payload FROM collaboration_state"
        );

        return result.rows
            .map((row) => normalizeCollaborationState(JSON.parse(row.payload || "{}"), row.user_id || ""))
            .filter((state) => state.isOpenToCollaborate && state.userId);
    }

    async getStudentProfile(userId) {
        const result = await this.client.execute(
            "SELECT payload FROM student_profiles WHERE user_id = ?",
            [userId],
            { prepare: true }
        );

        if (!result.rowLength) {
            return this.setStudentProfile(userId, normalizeProfile());
        }

        return normalizeProfile(JSON.parse(result.first().payload || "{}"));
    }

    async listStudentProfiles() {
        const result = await this.client.execute(
            "SELECT user_id, payload FROM student_profiles"
        );

        return result.rows
            .map((row) => ({
                userId: row.user_id || "",
                profile: normalizeProfile(JSON.parse(row.payload || "{}"))
            }))
            .sort((left, right) => {
                const leftUpdated = new Date(left.profile?.updatedAt || 0).getTime();
                const rightUpdated = new Date(right.profile?.updatedAt || 0).getTime();
                return rightUpdated - leftUpdated;
            });
    }

    async setStudentProfile(userId, profile) {
        const nextProfile = normalizeProfile(profile);
        await this.client.execute(
            "INSERT INTO student_profiles (user_id, payload, updated_at) VALUES (?, ?, ?)",
            [userId, JSON.stringify(nextProfile), new Date()],
            { prepare: true }
        );
        return normalizeProfile(nextProfile);
    }

    async health() {
        return {
            mode: "astra",
            databaseId: ASTRA_DB_ID || "configured",
            keyspace: ASTRA_DB_KEYSPACE
        };
    }
}

async function createStore() {
    const fallbackStore = new JsonStore(FALLBACK_STORE_PATH);
    const useLocalOnly = ["1", "true", "yes"].includes(
        String(process.env.LOCAL_DEV || process.env.SKIP_ASTRA || "").trim().toLowerCase()
    );

    if (useLocalOnly) {
        await fallbackStore.init();
        return fallbackStore;
    }

    try {
        const astraStore = new AstraStore();
        await astraStore.init();
        return astraStore;
    } catch (error) {
        console.warn("Astra DB not reachable — using local data instead.");
        console.warn(`  (${error.message})`);
        await fallbackStore.init();
        return fallbackStore;
    }
}

const store = await createStore();

const API_CACHE_TTL_MS = Number.parseInt(process.env.API_CACHE_TTL_MS || "30000", 10);
const BOOTSTRAP_CACHE_TTL_MS = Number.parseInt(process.env.BOOTSTRAP_CACHE_TTL_MS || "15000", 10);
const apiCache = createMemoryCache(API_CACHE_TTL_MS);
const BOOTSTRAP_CONTENT_SECTIONS = Object.values(CONTENT_PATHS);

function invalidateApiCache(scope = "all") {
    if (scope === "all") {
        apiCache.clear();
        return;
    }

    if (scope === "bootstrap") {
        apiCache.deletePrefix("bootstrap:");
        return;
    }

    apiCache.deletePrefix("content:");
    apiCache.deletePrefix("community:");
    apiCache.deletePrefix("projects:");
    apiCache.deletePrefix("collaboration:");
    apiCache.deletePrefix("student:");
    apiCache.deletePrefix("bootstrap:");
}

async function getCachedContent(section) {
    const key = `content:${section}`;
    const cached = apiCache.get(key);
    if (cached) {
        return cached;
    }

    const payload = await store.getContent(section);
    const body = { section, ...payload };
    apiCache.set(key, body);
    return body;
}

async function getCachedCommunityPosts(feed = "general") {
    const key = `community:${feed}`;
    const cached = apiCache.get(key);
    if (cached) {
        return cached;
    }

    const posts = await store.listCommunityPosts(feed);
    const body = { feed, posts };
    apiCache.set(key, body);
    return body;
}

async function getCachedProjects(visibility = "public") {
    const key = `projects:${visibility}`;
    const cached = apiCache.get(key);
    if (cached) {
        return cached;
    }

    const projects = await store.listProjects(visibility);
    const body = { visibility, projects };
    apiCache.set(key, body);
    return body;
}

async function buildBootstrapPayload(userId = "") {
    const contentEntries = await Promise.all(
        BOOTSTRAP_CONTENT_SECTIONS.map(async (section) => {
            const payload = await getCachedContent(section);
            return [section, { value: payload.value, updatedAt: payload.updatedAt }];
        })
    );

    const [communityPayload, projectsPayload, profile, collaboration] = await Promise.all([
        getCachedCommunityPosts("general"),
        getCachedProjects("public"),
        userId
            ? store.getStudentProfile(userId).then((profile) => ({ profile })).catch(() => ({ profile: null }))
            : Promise.resolve({ profile: null }),
        userId
            ? store.getCollaborationState(userId).then((state) => ({ state })).catch(() => ({ state: null }))
            : Promise.resolve({ state: null })
    ]);

    return {
        fetchedAt: createIsoNow(),
        content: Object.fromEntries(contentEntries),
        community: {
            general: communityPayload.posts
        },
        projects: {
            public: projectsPayload.projects
        },
        studentProfile: profile.profile,
        collaboration: collaboration.state
    };
}

const app = express();

app.use(express.json({ limit: "12mb" }));
app.use((request, response, next) => {
    response.header("Access-Control-Allow-Origin", "*");
    response.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");

    if (request.method === "OPTIONS") {
        response.sendStatus(204);
        return;
    }

    next();
});

app.get("/api/health", async (request, response) => {
    response.json({
        ok: true,
        storage: await store.health()
    });
});

app.get("/api/bootstrap", async (request, response) => {
    try {
        const userId = String(request.query.userId || "").trim();
        const cacheKey = `bootstrap:${userId || "anonymous"}`;
        const cached = apiCache.get(cacheKey);
        if (cached) {
            response.set("Cache-Control", "private, max-age=10");
            response.json(cached);
            return;
        }

        const payload = await buildBootstrapPayload(userId);
        apiCache.set(cacheKey, payload, BOOTSTRAP_CACHE_TTL_MS);
        response.set("Cache-Control", "private, max-age=10");
        response.json(payload);
    } catch (error) {
        response.status(500).json({ error: error.message });
    }
});

app.get("/api/content/:section", async (request, response) => {
    try {
        const section = decodeURIComponent(request.params.section);
        const payload = await getCachedContent(section);
        response.set("Cache-Control", "private, max-age=15");
        response.json(payload);
    } catch (error) {
        response.status(500).json({ error: error.message });
    }
});

app.put("/api/content/:section", async (request, response) => {
    try {
        const section = decodeURIComponent(request.params.section);
        const payload = await store.setContent(section, request.body?.value ?? []);
        invalidateApiCache();
        response.json({
            section,
            ...payload
        });
    } catch (error) {
        response.status(500).json({ error: error.message });
    }
});

app.get("/api/community/posts", async (request, response) => {
    try {
        const feed = String(request.query.feed || "general");
        const payload = await getCachedCommunityPosts(feed);
        response.set("Cache-Control", "private, max-age=15");
        response.json(payload);
    } catch (error) {
        response.status(500).json({ error: error.message });
    }
});

app.post("/api/community/posts", async (request, response) => {
    try {
        const text = String(request.body?.text || "").trim();
        const mediaLabel = String(request.body?.mediaLabel || "").trim();
        const mediaType = String(request.body?.mediaType || "").trim();
        const mediaDataUrl = typeof request.body?.mediaDataUrl === "string" ? request.body.mediaDataUrl : "";
        const replyToPostId = String(request.body?.replyToPostId || "").trim();
        const replyToAuthorId = String(request.body?.replyToAuthorId || "").trim();
        const replyToAuthorName = String(request.body?.replyToAuthorName || "").trim();
        const replyToText = String(request.body?.replyToText || "").trim();

        if (!text && !mediaLabel && !mediaDataUrl) {
            response.status(400).json({ error: "A post needs text or media." });
            return;
        }

        const post = await store.createCommunityPost({
            feed: String(request.body?.feed || "general"),
            authorId: String(request.body?.authorId || "anonymous"),
            authorName: String(request.body?.authorName || "HackLab Member"),
            authorRole: String(request.body?.authorRole || "student"),
            authorAvatar: String(request.body?.authorAvatar || "images/avatar.png"),
            text,
            mediaLabel,
            mediaType,
            mediaDataUrl,
            replyToPostId,
            replyToAuthorId,
            replyToAuthorName,
            replyToText
        });

        invalidateApiCache();
        response.status(201).json({ post });
    } catch (error) {
        response.status(500).json({ error: error.message });
    }
});

app.patch("/api/community/posts/:postId", async (request, response) => {
    try {
        const text = String(request.body?.text || "").trim();
        const mediaLabel = String(request.body?.mediaLabel || "").trim();
        const mediaType = String(request.body?.mediaType || "").trim();
        const mediaDataUrl = typeof request.body?.mediaDataUrl === "string" ? request.body.mediaDataUrl : "";

        if (!text && !mediaLabel && !mediaDataUrl) {
            response.status(400).json({ error: "A post needs text or media." });
            return;
        }

        const post = await store.updateCommunityPost(
            String(request.body?.feed || "general"),
            request.params.postId,
            {
                authorId: String(request.body?.authorId || "anonymous"),
                authorName: String(request.body?.authorName || "HackLab Member"),
                authorRole: String(request.body?.authorRole || "student"),
                authorAvatar: String(request.body?.authorAvatar || "images/avatar.png"),
                text,
                mediaLabel,
                mediaType,
                mediaDataUrl
            }
        );

        invalidateApiCache();
        response.json({ post });
    } catch (error) {
        const statusCode = error.message.includes("only edit")
            ? 403
            : error.message.includes("not found")
                ? 404
                : 500;
        response.status(statusCode).json({ error: error.message });
    }
});

app.delete("/api/community/posts/:postId", async (request, response) => {
    try {
        const post = await store.deleteCommunityPost(
            String(request.body?.feed || "general"),
            request.params.postId,
            String(request.body?.authorId || "anonymous")
        );

        invalidateApiCache();
        response.json({ deleted: true, post });
    } catch (error) {
        const statusCode = error.message.includes("only delete")
            ? 403
            : error.message.includes("not found")
                ? 404
                : 500;
        response.status(statusCode).json({ error: error.message });
    }
});

app.post("/api/community/posts/:postId/like", async (request, response) => {
    try {
        const feed = String(request.body?.feed || "general");
        const userId = String(request.body?.userId || "");
        const post = await store.likeCommunityPost(feed, request.params.postId, userId);
        invalidateApiCache();
        response.json({ post });
    } catch (error) {
        response.status(404).json({ error: error.message });
    }
});

app.get("/api/projects", async (request, response) => {
    try {
        const visibility = String(request.query.visibility || "public");
        const payload = await getCachedProjects(visibility);
        response.set("Cache-Control", "private, max-age=15");
        response.json(payload);
    } catch (error) {
        response.status(500).json({ error: error.message });
    }
});

app.post("/api/projects", async (request, response) => {
    try {
        const title = String(request.body?.title || "").trim();
        const summary = String(request.body?.summary || "").trim();

        if (!title || !summary) {
            response.status(400).json({ error: "A project needs both a title and a summary." });
            return;
        }

        const project = await store.createProject({
            visibility: String(request.body?.visibility || "public"),
            ownerId: String(request.body?.ownerId || "anonymous"),
            ownerName: String(request.body?.ownerName || "HackLab Student"),
            ownerAvatar: String(request.body?.ownerAvatar || "images/avatar.png"),
            collaboratorIds: Array.isArray(request.body?.collaboratorIds) ? request.body.collaboratorIds : [],
            collaboratorNames: Array.isArray(request.body?.collaboratorNames) ? request.body.collaboratorNames : [],
            collaboratorAvatars: Array.isArray(request.body?.collaboratorAvatars) ? request.body.collaboratorAvatars : [],
            title,
            summary,
            category: String(request.body?.category || "Student Build"),
            status: String(request.body?.status || "New"),
            badge: String(request.body?.badge || "Fresh"),
            projectLink: String(request.body?.projectLink || ""),
            imageUrl: String(request.body?.imageUrl || "images/session.png"),
            isFeatured: Boolean(request.body?.isFeatured)
        });

        invalidateApiCache();
        response.status(201).json({ project });
    } catch (error) {
        response.status(500).json({ error: error.message });
    }
});

app.post("/api/projects/:projectId/like", async (request, response) => {
    try {
        const visibility = String(request.body?.visibility || "public");
        const project = await store.likeProject(visibility, request.params.projectId);
        invalidateApiCache();
        response.json({ project });
    } catch (error) {
        response.status(404).json({ error: error.message });
    }
});

app.delete("/api/projects/:projectId", async (request, response) => {
    try {
        const deletedProject = await store.deleteProject(
            String(request.body?.visibility || "public"),
            request.params.projectId,
            String(request.body?.requesterId || "anonymous")
        );
        invalidateApiCache();
        response.json({ deleted: true, project: deletedProject });
    } catch (error) {
        const statusCode = error.message.includes("own projects")
            ? 403
            : error.message.includes("not found")
                ? 404
                : 500;
        response.status(statusCode).json({ error: error.message });
    }
});

app.get("/api/collaboration/open", async (request, response) => {
    try {
        const collaborators = await store.listOpenCollaborators();
        response.json({ collaborators });
    } catch (error) {
        response.status(500).json({ error: error.message });
    }
});

app.get("/api/collaboration-directory/open", async (request, response) => {
    try {
        const collaborators = await store.listOpenCollaborators();
        response.json({ collaborators });
    } catch (error) {
        response.status(500).json({ error: error.message });
    }
});

app.get("/api/collaboration/:uid", async (request, response) => {
    try {
        const uid = request.params.uid;
        const key = `collaboration:${uid}`;
        const cached = apiCache.get(key);
        if (cached) {
            response.set("Cache-Control", "private, max-age=15");
            response.json(cached);
            return;
        }

        const state = await store.getCollaborationState(uid);
        const body = { state };
        apiCache.set(key, body);
        response.set("Cache-Control", "private, max-age=15");
        response.json(body);
    } catch (error) {
        response.status(500).json({ error: error.message });
    }
});

app.put("/api/collaboration/:uid", async (request, response) => {
    try {
        const state = await store.setCollaborationState(request.params.uid, request.body?.state || {});
        invalidateApiCache();
        response.json({ state });
    } catch (error) {
        response.status(500).json({ error: error.message });
    }
});

app.get("/api/students", async (request, response) => {
    try {
        const students = await store.listStudentProfiles();
        response.json({ students });
    } catch (error) {
        response.status(500).json({ error: error.message });
    }
});

app.get("/api/students/:uid/profile", async (request, response) => {
    try {
        const uid = request.params.uid;
        const key = `student:${uid}`;
        const cached = apiCache.get(key);
        if (cached) {
            response.set("Cache-Control", "private, max-age=15");
            response.json(cached);
            return;
        }

        const profile = await store.getStudentProfile(uid);
        const body = { profile };
        apiCache.set(key, body);
        response.set("Cache-Control", "private, max-age=15");
        response.json(body);
    } catch (error) {
        response.status(500).json({ error: error.message });
    }
});

app.put("/api/students/:uid/profile", async (request, response) => {
    try {
        const profile = await store.setStudentProfile(request.params.uid, request.body?.profile || {});
        invalidateApiCache();
        response.json({ profile });
    } catch (error) {
        response.status(500).json({ error: error.message });
    }
});

app.use(express.static(ROOT_DIR, {
    etag: true,
    lastModified: true,
    setHeaders(response, filePath) {
        if (filePath.endsWith(".html")) {
            response.setHeader("Cache-Control", "no-cache");
            return;
        }

        if (/\.(?:css|js|mjs|png|jpe?g|webp|gif|svg|ico|woff2?)$/i.test(filePath)) {
            response.setHeader("Cache-Control", "public, max-age=3600");
        }
    }
}));

app.get("/", (request, response) => {
    response.sendFile(path.join(ROOT_DIR, "index.html"));
});

const isDirectRun = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === __filename;

export { app, store, createStore };

if (isDirectRun) {
    const storageHealth = await store.health();
    app.listen(PORT, () => {
        console.log(`HackLab server running on http://127.0.0.1:${PORT}`);
        if (storageHealth.mode === "local-fallback") {
            console.log("Storage: local JSON (server/data/local-store.json) — fine for local dev.");
            console.log("Tip: add LOCAL_DEV=1 to .env to skip Astra connection attempts.");
        } else {
            console.log(`Storage: Astra (${storageHealth.keyspace || "connected"})`);
        }
    });
}
