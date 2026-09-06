import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    CONTENT_PATHS,
    DEFAULT_AUTHORITY_ARTICLES,
    DEFAULT_DASHBOARD_ANNOUNCEMENT,
    DEFAULT_EVENTS,
    DEFAULT_OVERVIEW_TASKS,
    DEFAULT_PROJECTS,
    DEFAULT_RESOURCES,
    DEFAULT_VIDEO_COURSES,
    auth,
    createProject,
    cloneData,
    escapeHtml,
    formatCompactDate,
    formatEventDate,
    getDisplayName,
    loadStudentDirectory,
    loadProjects,
    saveStudentProfile,
    saveContent,
    slugify,
    watchContent
} from "./portal-data.js";
import { mountCommunityExperience } from "./community-experience.js";
import { getCourseItems, isAssignmentContent, normalizeCourses, setCourseContentCompletion, syncProfileCourseStats } from "./course-content.js";
import {
    getPendingCollaborationRequests,
    loadUserCollaborationState,
    respondToCollaborationRequest
} from "./collaboration-state.js";
import { guardTeacherPortal } from "./account-access.js";

const VALID_TABS = new Set(["overview", "resources", "events", "community", "projects", "articles"]);

const navItems = Array.from(document.querySelectorAll(".nav-item[data-tab]"));
const tabPanels = Array.from(document.querySelectorAll(".teacher-tab"));
const teacherSummaryCardEl = document.getElementById("teacherSummaryCard");
const teacherSummaryEyebrowEl = document.getElementById("teacherSummaryEyebrow");
const teacherSummaryTitleEl = document.getElementById("teacherSummaryTitle");
const teacherSummaryTextEl = document.getElementById("teacherSummaryText");
const teacherSummaryChipAEl = document.getElementById("teacherSummaryChipA");
const teacherSummaryChipBEl = document.getElementById("teacherSummaryChipB");
const teacherSummaryStatOneLabelEl = document.getElementById("teacherSummaryStatOneLabel");
const teacherSummaryStatOneValueEl = document.getElementById("teacherSummaryStatOneValue");
const teacherSummaryStatOneSubEl = document.getElementById("teacherSummaryStatOneSub");
const teacherSummaryStatTwoLabelEl = document.getElementById("teacherSummaryStatTwoLabel");
const teacherSummaryStatTwoValueEl = document.getElementById("teacherSummaryStatTwoValue");
const teacherSummaryStatTwoSubEl = document.getElementById("teacherSummaryStatTwoSub");

const overviewTaskForm = document.getElementById("overviewTaskForm");
const taskTitleEl = document.getElementById("taskTitle");
const taskDescriptionEl = document.getElementById("taskDescription");
const taskAccentEl = document.getElementById("taskAccent");
const taskActionLabelEl = document.getElementById("taskActionLabel");
const taskActionUrlEl = document.getElementById("taskActionUrl");
const taskCancelBtn = document.getElementById("taskCancelBtn");
const taskSubmitBtn = document.getElementById("taskSubmitBtn");
const overviewTaskListEl = document.getElementById("overviewTaskList");

const resourceForm = document.getElementById("resourceForm");
const resourceTypeEl = document.getElementById("resourceType");
const resourceBadgeEl = document.getElementById("resourceBadge");
const resourceMetaEl = document.getElementById("resourceMeta");
const resourceUrlEl = document.getElementById("resourceUrl");
const resourceTitleEl = document.getElementById("resourceTitle");
const resourceDescriptionEl = document.getElementById("resourceDescription");
const resourceFooterLeftEl = document.getElementById("resourceFooterLeft");
const resourceFooterRightEl = document.getElementById("resourceFooterRight");
const resourceCancelBtn = document.getElementById("resourceCancelBtn");
const resourceSubmitBtn = document.getElementById("resourceSubmitBtn");
const resourceListEl = document.getElementById("resourceList");
const videoCourseForm = document.getElementById("videoCourseForm");
const videoCourseTitleEl = document.getElementById("videoCourseTitle");
const videoCoursePlaylistLabelEl = document.getElementById("videoCoursePlaylistLabel");
const videoCourseLessonsEl = document.getElementById("videoCourseLessons");
const videoCourseAccessLabelEl = document.getElementById("videoCourseAccessLabel");
const videoCourseUrlEl = document.getElementById("videoCourseUrl");
const videoCourseDescriptionEl = document.getElementById("videoCourseDescription");
const videoCoursePlayerEmbedUrlEl = document.getElementById("videoCoursePlayerEmbedUrl");
const videoCourseAuthorsLineEl = document.getElementById("videoCourseAuthorsLine");
const videoCourseOverviewTextEl = document.getElementById("videoCourseOverviewText");
const videoCourseImageEl = document.getElementById("videoCourseImage");
const videoCourseCtaLabelEl = document.getElementById("videoCourseCtaLabel");
const videoCourseAvatarOneEl = document.getElementById("videoCourseAvatarOne");
const videoCourseAvatarTwoEl = document.getElementById("videoCourseAvatarTwo");
const videoCourseSectionOneTitleEl = document.getElementById("videoCourseSectionOneTitle");
const videoCourseSectionOneMetaEl = document.getElementById("videoCourseSectionOneMeta");
const videoCourseSectionOneLessonsEl = document.getElementById("videoCourseSectionOneLessons");
const videoCourseSectionTwoTitleEl = document.getElementById("videoCourseSectionTwoTitle");
const videoCourseSectionTwoMetaEl = document.getElementById("videoCourseSectionTwoMeta");
const videoCourseSectionTwoLessonsEl = document.getElementById("videoCourseSectionTwoLessons");
const videoCourseCancelBtn = document.getElementById("videoCourseCancelBtn");
const videoCourseSubmitBtn = document.getElementById("videoCourseSubmitBtn");
const videoCourseListEl = document.getElementById("videoCourseList");

const eventForm = document.getElementById("eventForm");
const eventBadgeEl = document.getElementById("eventBadge");
const eventMentorEl = document.getElementById("eventMentor");
const eventTitleEl = document.getElementById("eventTitle");
const eventSummaryEl = document.getElementById("eventSummary");
const eventDateEl = document.getElementById("eventDate");
const eventTimeRangeEl = document.getElementById("eventTimeRange");
const eventImageEl = document.getElementById("eventImage");
const eventJoinLinkEl = document.getElementById("eventJoinLink");
const eventLinkedCourseEl = document.getElementById("eventLinkedCourse");
const eventLinkedAssignmentEl = document.getElementById("eventLinkedAssignment");
const eventCancelBtn = document.getElementById("eventCancelBtn");
const eventSubmitBtn = document.getElementById("eventSubmitBtn");
const eventListEl = document.getElementById("eventList");

const articleAuthorityForm = document.getElementById("articleAuthorityForm");
const authorityAuthorEl = document.getElementById("authorityAuthor");
const authorityMetaEl = document.getElementById("authorityMeta");
const authorityTitleEl = document.getElementById("authorityTitle");
const authoritySummaryEl = document.getElementById("authoritySummary");
const authoritySupportNoteEl = document.getElementById("authoritySupportNote");
const authorityBodyEl = document.getElementById("authorityBody");
const authorityTopicEl = document.getElementById("authorityTopic");
const authorityReadTimeEl = document.getElementById("authorityReadTime");
const authorityReadsEl = document.getElementById("authorityReads");
const articleCancelBtn = document.getElementById("articleCancelBtn");
const articleSubmitBtn = document.getElementById("articleSubmitBtn");
const authorityArticleListEl = document.getElementById("authorityArticleList");
const teacherProjectForm = document.getElementById("teacherProjectForm");
const teacherProjectTitleEl = document.getElementById("teacherProjectTitle");
const teacherProjectSummaryEl = document.getElementById("teacherProjectSummary");
const teacherProjectCategoryEl = document.getElementById("teacherProjectCategory");
const teacherProjectBadgeEl = document.getElementById("teacherProjectBadge");
const teacherProjectStatusEl = document.getElementById("teacherProjectStatus");
const teacherProjectLinkEl = document.getElementById("teacherProjectLink");
const teacherProjectImageEl = document.getElementById("teacherProjectImage");
const teacherProjectSubmitBtn = document.getElementById("teacherProjectSubmitBtn");
const teacherProjectListEl = document.getElementById("teacherProjectList");
const teacherCollabCountEl = document.getElementById("teacherCollabCount");
const teacherCollabInboxEl = document.getElementById("teacherCollabInbox");
const studentDirectoryCountEl = document.getElementById("studentDirectoryCount");
const studentDirectoryListEl = document.getElementById("studentDirectoryList");
const dashboardAnnouncementForm = document.getElementById("dashboardAnnouncementForm");
const announcementEyebrowEl = document.getElementById("announcementEyebrow");
const announcementTitleEl = document.getElementById("announcementTitle");
const announcementSummaryEl = document.getElementById("announcementSummary");
const announcementDetailsEl = document.getElementById("announcementDetails");
const announcementImageUrlEl = document.getElementById("announcementImageUrl");
const announcementCtaLabelEl = document.getElementById("announcementCtaLabel");
const announcementCtaUrlEl = document.getElementById("announcementCtaUrl");
const announcementIsActiveEl = document.getElementById("announcementIsActive");
const announcementResetBtn = document.getElementById("announcementResetBtn");
const announcementSubmitBtn = document.getElementById("announcementSubmitBtn");
const announcementPreviewStatusEl = document.getElementById("announcementPreviewStatus");
const announcementPreviewImageEl = document.getElementById("announcementPreviewImage");
const announcementPreviewEyebrowEl = document.getElementById("announcementPreviewEyebrow");
const announcementPreviewTitleEl = document.getElementById("announcementPreviewTitle");
const announcementPreviewSummaryEl = document.getElementById("announcementPreviewSummary");
const announcementPreviewDetailsEl = document.getElementById("announcementPreviewDetails");
const announcementPreviewButtonEl = document.getElementById("announcementPreviewButton");
const announcementPreviewUpdatedEl = document.getElementById("announcementPreviewUpdated");

const RESOURCE_DEFAULT_URLS = {
    video: "video-courses.html",
    audio: "#",
    reading: "#"
};

const TASK_LEVELS = {
    yellow: "beginner",
    red: "intermediate",
    brown: "expert"
};

const TASK_LABELS = {
    yellow: "Beginner",
    red: "Intermediate",
    brown: "Expert"
};

const ARTICLE_ACCENTS = [
    "rgba(255, 209, 102, 0.22)",
    "rgba(249, 199, 79, 0.22)",
    "rgba(255, 193, 110, 0.18)"
];

let overviewTasks = cloneData(DEFAULT_OVERVIEW_TASKS);
let resources = cloneData(DEFAULT_RESOURCES);
let videoCourses = cloneData(DEFAULT_VIDEO_COURSES);
let events = cloneData(DEFAULT_EVENTS);
let authorityArticles = cloneData(DEFAULT_AUTHORITY_ARTICLES);
let publicProjects = cloneData(DEFAULT_PROJECTS);
let dashboardAnnouncement = cloneData(DEFAULT_DASHBOARD_ANNOUNCEMENT);
let studentDirectory = [];

let editingTaskId = null;
let editingResourceId = null;
let editingVideoCourseId = null;
let editingEventId = null;
let editingArticleId = null;
let watchersAttached = false;
let announcementFormHydrated = false;
let cleanupTeacherCommunity = null;
let teacherUser = null;
let teacherUserName = "HackLab Teacher";
let teacherUserAvatar = "images/avatar.png";
let teacherCollaborationState = {
    userId: "",
    inbox: [],
    sent: [],
    contacts: []
};
let teacherCollaborationTimer = null;

function normalizeCollection(value, fallback) {
    if (Array.isArray(value)) {
        return value
            .filter(Boolean)
            .map((item, index) => ({
                ...item,
                id: item.id || `item-${index + 1}`
            }));
    }

    if (value && typeof value === "object") {
        return Object.values(value)
            .filter(Boolean)
            .map((item, index) => ({
                ...item,
                id: item.id || `item-${index + 1}`
            }));
    }

    if (typeof value === "undefined" || value === null) {
        return cloneData(fallback);
    }

    return [];
}

function formatCount(value) {
    return String(Math.max(0, Number(value) || 0)).padStart(2, "0");
}

function countUnique(items, pickValue) {
    return new Set(
        items
            .map((item) => pickValue(item))
            .filter(Boolean)
    ).size;
}

function getActiveTabName() {
    return navItems.find((item) => item.classList.contains("active"))?.dataset.tab || "overview";
}

function getNextEvent() {
    return sortEventsByDate(events).find((eventItem) => eventItem?.date) || sortEventsByDate(events)[0] || null;
}

function updateSummaryCard(tabName = getActiveTabName()) {
    if (!teacherSummaryCardEl) return;

    const safeTab = VALID_TABS.has(tabName) ? tabName : "overview";
    teacherSummaryCardEl.hidden = safeTab === "community";

    if (safeTab === "community") {
        return;
    }

    const nextEvent = getNextEvent();
    const summaryByTab = {
        overview: {
            eyebrow: "Overview progress",
            title: "Guide the first tasks students notice across HackLab.",
            text: "Use this control lane to keep the opening student experience clear, balanced, and worth acting on right away.",
            chipA: "Live overview edits",
            chipB: `${formatCount(overviewTasks.length)} tasks active`,
            statOne: {
                label: "Tasks",
                value: formatCount(overviewTasks.length),
                sub: "overview items live"
            },
            statTwo: {
                label: "Levels",
                value: formatCount(countUnique(overviewTasks, (task) => task.accent || task.level)),
                sub: "difficulty lanes active"
            }
        },
        resources: {
            eyebrow: "Resources progress",
            title: "Keep the learning library fresh and easy to navigate.",
            text: "Refresh the student resource lane with the right balance of formats, stronger labels, and clearer open paths.",
            chipA: "Resource updates go live",
            chipB: `${formatCount(videoCourses.length)} video course${videoCourses.length === 1 ? "" : "s"} live`,
            statOne: {
                label: "Cards",
                value: formatCount(resources.length),
                sub: "resource blocks visible"
            },
            statTwo: {
                label: "Courses",
                value: formatCount(videoCourses.length),
                sub: "playlist entries live"
            }
        },
        events: {
            eyebrow: "Events progress",
            title: "Keep the student calendar current before sessions get missed.",
            text: "This lane helps you keep upcoming sessions timely, visible, and easier for students to join without confusion.",
            chipA: "Session lineup synced",
            chipB: nextEvent ? `${formatCompactDate(nextEvent.date) || "Next live"} next` : "Add the next live session",
            statOne: {
                label: "Sessions",
                value: formatCount(events.length),
                sub: "upcoming cards ready"
            },
            statTwo: {
                label: "Next live",
                value: nextEvent ? (formatCompactDate(nextEvent.date) || "TBA") : "--",
                sub: nextEvent?.title || "schedule pending"
            }
        },
        projects: {
            eyebrow: "Projects progress",
            title: "Publish spotlight projects that rise to the top for students.",
            text: "Everything you publish here goes into the public student gallery, and spotlight entries stay featured first.",
            chipA: "Public project lane synced",
            chipB: `${formatCount(publicProjects.filter((project) => project.isFeatured).length)} spotlight project${publicProjects.filter((project) => project.isFeatured).length === 1 ? "" : "s"} live`,
            statOne: {
                label: "Builds",
                value: formatCount(publicProjects.length),
                sub: "public project cards visible"
            },
            statTwo: {
                label: "Spotlights",
                value: formatCount(publicProjects.filter((project) => project.isFeatured).length),
                sub: "featured cards shown first"
            }
        },
        articles: {
            eyebrow: "Articles progress",
            title: "Shape the authority lane students trust first.",
            text: "Keep the highlighted article feed current so students notice the strongest official reading picks first.",
            chipA: "Authority lane updates",
            chipB: `${formatCount(authorityArticles.length)} article picks live`,
            statOne: {
                label: "Articles",
                value: formatCount(authorityArticles.length),
                sub: "authority cards published"
            },
            statTwo: {
                label: "Topics",
                value: formatCount(countUnique(authorityArticles, (article) => article.topic)),
                sub: "themes in the authority lane"
            }
        }
    };

    const config = summaryByTab[safeTab] || summaryByTab.overview;

    if (teacherSummaryEyebrowEl) teacherSummaryEyebrowEl.textContent = config.eyebrow;
    if (teacherSummaryTitleEl) teacherSummaryTitleEl.textContent = config.title;
    if (teacherSummaryTextEl) teacherSummaryTextEl.textContent = config.text;
    if (teacherSummaryChipAEl) teacherSummaryChipAEl.textContent = config.chipA;
    if (teacherSummaryChipBEl) teacherSummaryChipBEl.textContent = config.chipB;
    if (teacherSummaryStatOneLabelEl) teacherSummaryStatOneLabelEl.textContent = config.statOne.label;
    if (teacherSummaryStatOneValueEl) teacherSummaryStatOneValueEl.textContent = config.statOne.value;
    if (teacherSummaryStatOneSubEl) teacherSummaryStatOneSubEl.textContent = config.statOne.sub;
    if (teacherSummaryStatTwoLabelEl) teacherSummaryStatTwoLabelEl.textContent = config.statTwo.label;
    if (teacherSummaryStatTwoValueEl) teacherSummaryStatTwoValueEl.textContent = config.statTwo.value;
    if (teacherSummaryStatTwoSubEl) teacherSummaryStatTwoSubEl.textContent = config.statTwo.sub;
}

function syncHash(tabName) {
    const nextHash = `#${tabName}`;
    const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
    window.history.replaceState(null, "", nextUrl);
}

function openTab(tabName, options = {}) {
    const safeTab = VALID_TABS.has(tabName) ? tabName : "overview";

    navItems.forEach((item) => {
        item.classList.toggle("active", item.dataset.tab === safeTab);
    });

    tabPanels.forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.panel === safeTab);
    });

    updateSummaryCard(safeTab);

    if (options.syncHash !== false) {
        syncHash(safeTab);
    }
}

function getRequestedTab() {
    const requested = window.location.hash.replace("#", "").trim();
    return VALID_TABS.has(requested) ? requested : "overview";
}

function setFormMode(submitButton, cancelButton, isEditing, addLabel, saveLabel) {
    if (submitButton) {
        submitButton.textContent = isEditing ? saveLabel : addLabel;
    }

    if (cancelButton) {
        cancelButton.disabled = !isEditing;
        cancelButton.style.opacity = isEditing ? "1" : "0.55";
    }
}

function makeId(prefix, value) {
    return `${prefix}-${slugify(value)}-${Date.now().toString(36).slice(-5)}`;
}

function sortEventsByDate(items) {
    return [...items].sort((left, right) => {
        const leftValue = new Date(`${left.date || "2099-01-01"}T00:00:00`).getTime();
        const rightValue = new Date(`${right.date || "2099-01-01"}T00:00:00`).getTime();
        return leftValue - rightValue;
    });
}

function getArticleAccent(index) {
    return ARTICLE_ACCENTS[index % ARTICLE_ACCENTS.length];
}

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

function formatAnnouncementUpdatedAt(value) {
    if (!value) return "Waiting for first publish";
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

function parseOverviewParagraphs(text) {
    return String(text || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function formatOverviewParagraphs(paragraphs) {
    return Array.isArray(paragraphs) ? paragraphs.join("\n") : "";
}

function parseLessonLines(text) {
    return String(text || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
            const [titlePart = "", durationPart = "", statusPart = ""] = line.split("|").map((part) => part.trim());
            return {
                title: titlePart || "Untitled lesson",
                duration: durationPart || "19 min",
                completed: /done|complete|completed|checked/i.test(statusPart)
            };
        });
}

function formatLessonLines(lessons) {
    if (!Array.isArray(lessons)) return "";
    return lessons.map((lesson) => {
        const title = lesson?.title || "Untitled lesson";
        const duration = lesson?.duration || "19 min";
        const status = lesson?.completed ? "done" : "";
        return status ? `${title} | ${duration} | ${status}` : `${title} | ${duration}`;
    }).join("\n");
}

function normalizeCourseSections(course = {}) {
    if (Array.isArray(course.sections) && course.sections.length) {
        return course.sections
            .filter(Boolean)
            .map((section, index) => ({
                id: section.id || `section-${index + 1}`,
                title: section.title || `Section ${index + 1}`,
                meta: section.meta || "New section",
                lessons: Array.isArray(section.lessons) ? section.lessons.map((lesson, lessonIndex) => ({
                    id: lesson.id || `lesson-${index + 1}-${lessonIndex + 1}`,
                    title: lesson.title || `Lesson ${lessonIndex + 1}`,
                    duration: lesson.duration || "19 min",
                    completed: Boolean(lesson.completed),
                    videoUrl: lesson.videoUrl || course.playerEmbedUrl || "https://www.youtube.com/embed/ER9SspLe4Hg?si=psSOzWKeyWVhl3t9"
                })) : []
            }));
    }

    return [];
}

function mergeCourseSections(nextSections, existingCourse = {}) {
    const existingSections = normalizeCourseSections(existingCourse);

    return nextSections.map((section, sectionIndex) => {
        const existingSection = existingSections[sectionIndex] || {};
        const existingLessons = Array.isArray(existingSection.lessons) ? existingSection.lessons : [];

        return {
            id: existingSection.id || section.id || `section-${sectionIndex + 1}`,
            title: section.title || existingSection.title || `Section ${sectionIndex + 1}`,
            meta: section.meta || existingSection.meta || `${section.lessons.length} lesson${section.lessons.length === 1 ? "" : "s"}`,
            lessons: (Array.isArray(section.lessons) ? section.lessons : []).map((lesson, lessonIndex) => {
                const existingLesson = existingLessons[lessonIndex] || {};
                return {
                    id: existingLesson.id || lesson.id || `lesson-${sectionIndex + 1}-${lessonIndex + 1}`,
                    title: lesson.title || existingLesson.title || `Lesson ${lessonIndex + 1}`,
                    duration: lesson.duration || existingLesson.duration || "19 min",
                    completed: typeof lesson.completed === "boolean" ? lesson.completed : Boolean(existingLesson.completed),
                    videoUrl: lesson.videoUrl || existingLesson.videoUrl || existingCourse.playerEmbedUrl || "https://www.youtube.com/embed/ER9SspLe4Hg?si=psSOzWKeyWVhl3t9"
                };
            })
        };
    });
}

function getTeacherCourseEditorUrl(courseId = "", options = {}) {
    const params = new URLSearchParams();
    const safeId = String(courseId || "").trim();
    const safePanel = ["overview", "lesson", "notes"].includes(options.panel)
        ? options.panel
        : "";
    const safeDraft = ["video", "assignment"].includes(options.draft)
        ? options.draft
        : "";

    if (safeId) params.set("courseId", safeId);
    if (safePanel) params.set("panel", safePanel);
    if (safeDraft) params.set("draft", safeDraft);

    return `teacher-course-player.html${params.toString() ? `?${params.toString()}` : ""}`;
}

function parseTeacherTags(value = "") {
    return [...new Set(
        String(value || "")
            .split(/[,\n]/)
            .map((tag) => tag.trim())
            .filter(Boolean)
    )];
}

function getStudentAssignmentReviewEntries(profile = {}) {
    return (Array.isArray(profile.assignments) ? profile.assignments : [])
        .filter((assignment) => assignment?.source === "course-assignment" && (assignment.submissionUrl || assignment.reviewStatus === "verified" || assignment.status === "completed"))
        .sort((left, right) => {
            const leftTime = new Date(left?.reviewedAt || left?.submittedAt || 0).getTime();
            const rightTime = new Date(right?.reviewedAt || right?.submittedAt || 0).getTime();
            return rightTime - leftTime;
        });
}

function getStudentAssignmentReviewStatus(assignment = {}) {
    const reviewStatus = String(assignment.reviewStatus || "").toLowerCase();
    if (reviewStatus === "verified" || assignment.status === "completed" || assignment.verifiedByTeacher) {
        return {
            label: "Verified",
            className: "verified"
        };
    }

    if (assignment.submissionUrl) {
        return {
            label: "Submitted",
            className: "submitted"
        };
    }

    return {
        label: "Draft",
        className: "draft"
    };
}

function getCourseAssignmentOptions(courseId = "") {
    const courses = normalizeCourses(videoCourses, DEFAULT_VIDEO_COURSES);
    const filteredCourses = courseId
        ? courses.filter((course) => course.id === courseId)
        : courses;

    return filteredCourses.flatMap((course) => getCourseItems(course)
        .filter(({ item }) => isAssignmentContent(item))
        .map(({ section, item }) => ({
            courseId: course.id,
            sectionId: section.id,
            assignmentId: item.id,
            title: item.title || "Untitled assignment"
        })));
}

function renderEventLinkFields(selectedCourseId = "", selectedAssignmentId = "") {
    if (!eventLinkedCourseEl || !eventLinkedAssignmentEl) return;

    const courses = normalizeCourses(videoCourses, DEFAULT_VIDEO_COURSES);
    const availableAssignments = getCourseAssignmentOptions(selectedCourseId);

    eventLinkedCourseEl.innerHTML = [
        '<option value="">No linked course</option>',
        ...courses.map((course) => `<option value="${escapeHtml(course.id)}">${escapeHtml(course.title || "Untitled course")}</option>`)
    ].join("");
    eventLinkedCourseEl.value = selectedCourseId || "";

    const assignmentOptions = ['<option value="">Open session only</option>'];
    availableAssignments.forEach((assignment) => {
        assignmentOptions.push(
            `<option value="${escapeHtml(assignment.assignmentId)}">${escapeHtml(assignment.title)}</option>`
        );
    });
    eventLinkedAssignmentEl.innerHTML = assignmentOptions.join("");
    eventLinkedAssignmentEl.value = selectedAssignmentId || "";
}

function getLinkedAssignmentMeta(eventItem = {}) {
    if (!eventItem?.linkedCourseId || !eventItem?.linkedAssignmentId) return null;
    return getCourseAssignmentOptions(eventItem.linkedCourseId)
        .find((assignment) => assignment.assignmentId === eventItem.linkedAssignmentId) || null;
}

function normalizeProjectUrl(value) {
    const rawValue = String(value || "").trim();
    if (!rawValue) return "";

    const candidate = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;

    try {
        const url = new URL(candidate);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return "";
        }
        const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
        if (!hostname || !hostname.includes(".") || hostname.endsWith(".")) {
            return "";
        }

        url.hash = "";
        return url.toString();
    } catch {
        return "";
    }
}

const normalizeNetlifyUrl = normalizeProjectUrl;

function resetTaskForm() {
    editingTaskId = null;
    overviewTaskForm?.reset();
    if (taskAccentEl) taskAccentEl.value = "yellow";
    if (taskActionLabelEl) taskActionLabelEl.value = "Go Ahead";
    if (taskActionUrlEl) taskActionUrlEl.value = "#";
    setFormMode(taskSubmitBtn, taskCancelBtn, false, "Add Task", "Save Task");
}

function resetResourceForm() {
    editingResourceId = null;
    resourceForm?.reset();
    if (resourceTypeEl) resourceTypeEl.value = "video";
    if (resourceUrlEl) resourceUrlEl.value = RESOURCE_DEFAULT_URLS.video;
    setFormMode(resourceSubmitBtn, resourceCancelBtn, false, "Add Resource", "Save Resource");
}

function resetVideoCourseForm() {
    editingVideoCourseId = null;
    videoCourseForm?.reset();
    if (videoCourseAccessLabelEl) videoCourseAccessLabelEl.value = "FREE";
    if (videoCourseUrlEl) videoCourseUrlEl.value = "course-player.html";
    if (videoCoursePlayerEmbedUrlEl) videoCoursePlayerEmbedUrlEl.value = "https://www.youtube.com/embed/ER9SspLe4Hg?si=psSOzWKeyWVhl3t9";
    if (videoCourseAuthorsLineEl) videoCourseAuthorsLineEl.value = "By Tejas Sharma and Aviral Tyagi";
    if (videoCourseImageEl) videoCourseImageEl.value = "images/session.png";
    if (videoCourseCtaLabelEl) videoCourseCtaLabelEl.value = "Enroll for free";
    if (videoCourseAvatarOneEl) videoCourseAvatarOneEl.value = "images/avi.png";
    if (videoCourseAvatarTwoEl) videoCourseAvatarTwoEl.value = "images/tejas.png";
    if (videoCourseSectionOneTitleEl) videoCourseSectionOneTitleEl.value = "Section 1: The Basics of JavaScript";
    if (videoCourseSectionOneMetaEl) videoCourseSectionOneMetaEl.value = "4 lessons | 2 hr 51 min";
    if (videoCourseSectionOneLessonsEl) videoCourseSectionOneLessonsEl.value = "1. Introduction to JavaScript | 19 min | done\n2. Variables and Data Types | 24 min\n3. Conditions and Logic | 18 min";
    if (videoCourseSectionTwoTitleEl) videoCourseSectionTwoTitleEl.value = "Section 2: The DOM of JavaScript";
    if (videoCourseSectionTwoMetaEl) videoCourseSectionTwoMetaEl.value = "3 lessons | 3 hr 05 min";
    if (videoCourseSectionTwoLessonsEl) videoCourseSectionTwoLessonsEl.value = "1. DOM Selection Basics | 22 min\n2. Event Handling | 27 min";
    setFormMode(videoCourseSubmitBtn, videoCourseCancelBtn, false, "Add Video Course", "Save Video Course");
}

function resetEventForm() {
    editingEventId = null;
    eventForm?.reset();
    if (eventImageEl) eventImageEl.value = "images/class.png";
    if (eventJoinLinkEl) eventJoinLinkEl.value = "#";
    renderEventLinkFields();
    setFormMode(eventSubmitBtn, eventCancelBtn, false, "Add Session", "Save Session");
}

function resetArticleForm() {
    editingArticleId = null;
    articleAuthorityForm?.reset();
    setFormMode(articleSubmitBtn, articleCancelBtn, false, "Add Authority Article", "Save Authority Article");
}

function resetTeacherProjectForm() {
    teacherProjectForm?.reset();
    if (teacherProjectCategoryEl) teacherProjectCategoryEl.value = "Student Build";
    if (teacherProjectBadgeEl) teacherProjectBadgeEl.value = "Teacher Spotlight";
    if (teacherProjectStatusEl) teacherProjectStatusEl.value = "Spotlight";
    if (teacherProjectLinkEl) teacherProjectLinkEl.value = "";
    if (teacherProjectImageEl) teacherProjectImageEl.value = "images/session.png";
}

function fillAnnouncementForm(announcement = dashboardAnnouncement) {
    const safeAnnouncement = normalizeAnnouncement(announcement);
    if (announcementEyebrowEl) announcementEyebrowEl.value = safeAnnouncement.eyebrow || "";
    if (announcementTitleEl) announcementTitleEl.value = safeAnnouncement.title || "";
    if (announcementSummaryEl) announcementSummaryEl.value = safeAnnouncement.summary || "";
    if (announcementDetailsEl) announcementDetailsEl.value = safeAnnouncement.details || "";
    if (announcementImageUrlEl) announcementImageUrlEl.value = safeAnnouncement.imageUrl || DEFAULT_DASHBOARD_ANNOUNCEMENT.imageUrl;
    if (announcementCtaLabelEl) announcementCtaLabelEl.value = safeAnnouncement.ctaLabel || DEFAULT_DASHBOARD_ANNOUNCEMENT.ctaLabel;
    if (announcementCtaUrlEl) announcementCtaUrlEl.value = safeAnnouncement.ctaUrl || "";
    if (announcementIsActiveEl) announcementIsActiveEl.checked = Boolean(safeAnnouncement.isActive);
}

function renderOverviewTaskList() {
    if (!overviewTaskListEl) return;

    if (!overviewTasks.length) {
        overviewTaskListEl.innerHTML = `
            <article class="editor-card">
                <h4>No overview tasks yet</h4>
                <p>Create the first task and it will appear on the student overview page.</p>
            </article>
        `;
        updateSummaryCard();
        return;
    }

    overviewTaskListEl.innerHTML = overviewTasks.map((task) => `
        <article class="editor-card" data-task-id="${escapeHtml(task.id)}">
            <div class="editor-card-head">
                <div>
                    <p class="section-kicker">Overview task</p>
                    <h4>${escapeHtml(task.title || "Untitled task")}</h4>
                </div>
                <span class="editor-tag">${escapeHtml(TASK_LABELS[task.accent] || "Task")}</span>
            </div>
            <p>${escapeHtml(task.description || "Teacher guidance will appear here.")}</p>
            <div class="editor-card-tags">
                <span class="editor-tag">${escapeHtml(task.actionLabel || "Go Ahead")}</span>
                <span class="editor-tag">${escapeHtml(task.actionUrl || "#")}</span>
            </div>
            <div class="editor-actions">
                <button type="button" class="editor-btn" data-action="edit-task" data-id="${escapeHtml(task.id)}">Edit</button>
                <button type="button" class="editor-btn delete" data-action="delete-task" data-id="${escapeHtml(task.id)}">Delete</button>
            </div>
        </article>
    `).join("");

    updateSummaryCard();
}

function renderResourceList() {
    if (!resourceListEl) return;

    if (!resources.length) {
        resourceListEl.innerHTML = `
            <article class="editor-card">
                <h4>No resources published yet</h4>
                <p>Add a new video, audio, or reading card and it will show on the student resources page.</p>
            </article>
        `;
        updateSummaryCard();
        return;
    }

    resourceListEl.innerHTML = resources.map((resource) => `
        <article class="editor-card" data-resource-id="${escapeHtml(resource.id)}">
            <div class="editor-card-head">
                <div>
                    <p class="section-kicker">${escapeHtml((resource.type || "reading").toUpperCase())}</p>
                    <h4>${escapeHtml(resource.title || "Untitled resource")}</h4>
                </div>
                <span class="editor-tag">${escapeHtml(resource.meta || "Fresh update")}</span>
            </div>
            <p>${escapeHtml(resource.description || "This resource will appear on the student learning page.")}</p>
            <div class="editor-card-tags">
                <span class="editor-tag">${escapeHtml(resource.badge || "Teacher added")}</span>
                <span class="editor-tag">${escapeHtml(resource.footerLeft || "Open now")}</span>
                <span class="editor-tag">${escapeHtml(resource.footerRight || "Explore")}</span>
            </div>
            <div class="editor-actions">
                <button type="button" class="editor-btn" data-action="edit-resource" data-id="${escapeHtml(resource.id)}">Edit</button>
                <button type="button" class="editor-btn delete" data-action="delete-resource" data-id="${escapeHtml(resource.id)}">Delete</button>
            </div>
        </article>
    `).join("");

    updateSummaryCard();
}

function renderVideoCourseList() {
    if (!videoCourseListEl) return;

    if (!videoCourses.length) {
        videoCourseListEl.innerHTML = `
            <article class="editor-card">
                <h4>No video courses in the playlist yet</h4>
                <p>Create the first course here and it will appear on the student video courses page.</p>
            </article>
        `;
        updateSummaryCard();
        return;
    }

    videoCourseListEl.innerHTML = videoCourses.map((course) => `
        <article class="editor-card editor-card-clickable" data-video-course-id="${escapeHtml(course.id)}" data-course-editor-url="${escapeHtml(getTeacherCourseEditorUrl(course.id))}">
            <div class="editor-card-head">
                <div>
                    <p class="section-kicker">${escapeHtml(course.playlistLabel || "Playlist")}</p>
                    <h4>${escapeHtml(course.title || "Untitled course")}</h4>
                </div>
                <span class="editor-tag">${escapeHtml(course.lessonCount || "Course")}</span>
            </div>
            <p>${escapeHtml(course.description || "A teacher-managed video course will appear here.")}</p>
            <div class="editor-card-tags">
                <span class="editor-tag">${escapeHtml(course.accessLabel || "FREE")}</span>
                <span class="editor-tag">${escapeHtml(course.ctaLabel || "Enroll for free")}</span>
                <span class="editor-tag">${escapeHtml(course.courseUrl || "course-player.html")}</span>
            </div>
            <p class="editor-card-helper">Assignments live inside course sections. Use the quick action below to jump straight into the assignment editor.</p>
            <div class="editor-actions">
                <button type="button" class="editor-btn" data-action="open-video-course-editor" data-id="${escapeHtml(course.id)}">Videos & Assignments</button>
                <button type="button" class="editor-btn featured" data-action="add-course-assignment" data-id="${escapeHtml(course.id)}">Add Assignment</button>
                <button type="button" class="editor-btn" data-action="edit-video-course" data-id="${escapeHtml(course.id)}">Edit</button>
                <button type="button" class="editor-btn delete" data-action="delete-video-course" data-id="${escapeHtml(course.id)}">Delete</button>
            </div>
        </article>
    `).join("");

    updateSummaryCard();
}

function renderEventList() {
    if (!eventListEl) return;

    if (!events.length) {
        eventListEl.innerHTML = `
            <article class="editor-card">
                <h4>No upcoming sessions yet</h4>
                <p>Add a session and it will feed the student events page right away.</p>
            </article>
        `;
        updateSummaryCard();
        return;
    }

    eventListEl.innerHTML = sortEventsByDate(events).map((eventItem) => {
        const linkedAssignment = getLinkedAssignmentMeta(eventItem);
        return `
        <article class="editor-card" data-event-id="${escapeHtml(eventItem.id)}">
            <div class="editor-card-head">
                <div>
                    <p class="section-kicker">${escapeHtml(eventItem.badge || "Live")}</p>
                    <h4>${escapeHtml(eventItem.title || "Untitled session")}</h4>
                </div>
                <span class="editor-tag">${escapeHtml(formatCompactDate(eventItem.date) || "TBA")}</span>
            </div>
            <p>${escapeHtml(eventItem.summary || "Students will see your session summary here.")}</p>
            <div class="editor-card-tags">
                <span class="editor-tag">${escapeHtml(eventItem.mentor || "HackLab Teacher")}</span>
                <span class="editor-tag">${escapeHtml(formatEventDate(eventItem.date, eventItem.timeRange) || "Schedule pending")}</span>
                ${eventItem.linkedCourseId ? `<span class="editor-tag">${escapeHtml("Linked course")}</span>` : ""}
                ${linkedAssignment ? `<span class="editor-tag">${escapeHtml(linkedAssignment.title)}</span>` : ""}
            </div>
            <div class="editor-actions">
                <button type="button" class="editor-btn" data-action="edit-event" data-id="${escapeHtml(eventItem.id)}">Edit</button>
                <button type="button" class="editor-btn delete" data-action="delete-event" data-id="${escapeHtml(eventItem.id)}">Delete</button>
            </div>
        </article>
    `;
    }).join("");

    updateSummaryCard();
}

function renderAuthorityArticleList() {
    if (!authorityArticleListEl) return;

    if (!authorityArticles.length) {
        authorityArticleListEl.innerHTML = `
            <article class="editor-card">
                <h4>No authority articles published yet</h4>
                <p>Add an official article here and students will see it in the highlighted authority lane.</p>
            </article>
        `;
        updateSummaryCard();
        return;
    }

    authorityArticleListEl.innerHTML = authorityArticles.map((article, index) => `
        <article class="editor-card" data-article-id="${escapeHtml(article.id)}">
            <div class="editor-card-head">
                <div>
                    <p class="section-kicker">${index === 0 ? "Pinned first for students" : "Authority article"}</p>
                    <h4>${escapeHtml(article.title || "Untitled authority article")}</h4>
                </div>
                <span class="editor-tag">${escapeHtml(article.readTime || "Quick read")}</span>
            </div>
            <p>${escapeHtml(article.summary || "Students will see this summary in the article feed.")}</p>
            <div class="editor-card-tags">
                <span class="editor-tag">${escapeHtml(article.author || "HackLab Authority")}</span>
                <span class="editor-tag">${escapeHtml(article.topic || "General")}</span>
                <span class="editor-tag">${escapeHtml(article.reads || "Fresh pick")}</span>
            </div>
            <div class="editor-actions">
                <button type="button" class="editor-btn" data-action="edit-article" data-id="${escapeHtml(article.id)}">Edit</button>
                <button type="button" class="editor-btn delete" data-action="delete-article" data-id="${escapeHtml(article.id)}">Delete</button>
            </div>
        </article>
    `).join("");

    updateSummaryCard();
}

function renderTeacherProjectList() {
    if (!teacherProjectListEl) return;

    if (!publicProjects.length) {
        teacherProjectListEl.innerHTML = `
            <article class="editor-card">
                <h4>No public projects yet</h4>
                <p>Publish the first spotlight project and it will appear at the top of the student projects page.</p>
            </article>
        `;
        updateSummaryCard();
        return;
    }

    teacherProjectListEl.innerHTML = publicProjects.map((project) => `
        <article class="editor-card" data-project-id="${escapeHtml(project.id)}">
            <div class="editor-card-head">
                <div>
                    <p class="section-kicker">${project.isFeatured ? "Spotlight project" : "Public project"}</p>
                    <h4>${escapeHtml(project.title || "Untitled project")}</h4>
                </div>
                <span class="editor-tag">${escapeHtml(project.badge || "Fresh")}</span>
            </div>
            <p>${escapeHtml(project.summary || "A public project summary will appear here.")}</p>
            <div class="editor-card-tags">
                <span class="editor-tag">${escapeHtml(project.ownerName || "HackLab Teacher")}</span>
                <span class="editor-tag">${escapeHtml(project.category || "Student Build")}</span>
                <span class="editor-tag">${escapeHtml(project.status || "Spotlight")}</span>
                ${project.projectLink ? `<span class="editor-tag">${escapeHtml(project.projectLink)}</span>` : ""}
            </div>
        </article>
    `).join("");

    updateSummaryCard();
}

async function refreshTeacherProjects() {
    publicProjects = await loadProjects("public", DEFAULT_PROJECTS);
    renderTeacherProjectList();
}

function getTeacherCollaborationIdentity() {
    return {
        uid: teacherUser?.uid || "",
        name: teacherUserName,
        email: teacherUser?.email || "",
        avatar: teacherUserAvatar,
        role: "teacher"
    };
}

function renderTeacherCollaborationInbox() {
    if (!teacherCollabInboxEl || !teacherCollabCountEl) return;

    const pendingRequests = getPendingCollaborationRequests(teacherCollaborationState);
    teacherCollabCountEl.textContent = String(pendingRequests.length).padStart(2, "0");

    if (!pendingRequests.length) {
        teacherCollabInboxEl.innerHTML = `
            <article class="editor-card">
                <h4>No project requests waiting</h4>
                <p>When students request collaboration on projects, those approvals will appear here.</p>
            </article>
        `;
        return;
    }

    teacherCollabInboxEl.innerHTML = pendingRequests.map((request) => `
        <article class="editor-card teacher-collab-item">
            <div class="editor-card-head">
                <div>
                    <p class="section-kicker">${escapeHtml(request.lane || "Project collaboration")}</p>
                    <h4>${escapeHtml(request.fromUserName || "HackLab Student")}</h4>
                </div>
                <span class="editor-tag">${escapeHtml(request.projectTitle || "New project draft")}</span>
            </div>
            <p>${escapeHtml(request.note || `${request.fromUserName || "A student"} wants to collaborate with you.`)}</p>
            <div class="editor-actions">
                <button type="button" class="editor-btn" data-teacher-collab-accept="${escapeHtml(request.id)}">Accept</button>
            </div>
        </article>
    `).join("");
}

async function refreshTeacherCollaboration() {
    if (!teacherUser?.uid) return;

    teacherCollaborationState = await loadUserCollaborationState(getTeacherCollaborationIdentity());
    renderTeacherCollaborationInbox();
}

function renderStudentDirectory() {
    if (!studentDirectoryListEl || !studentDirectoryCountEl) return;

    studentDirectoryCountEl.textContent = `${String(studentDirectory.length).padStart(2, "0")} students`;

    if (!studentDirectory.length) {
        studentDirectoryListEl.innerHTML = `
            <article class="editor-card">
                <h4>No student profiles yet</h4>
                <p>Once students log in, their saved profile details will appear here and you can add teacher tags for them.</p>
            </article>
        `;
        return;
    }

    studentDirectoryListEl.innerHTML = studentDirectory.map((entry) => {
        const profile = entry.profile || {};
        const tags = Array.isArray(profile.teacherTags) ? profile.teacherTags : [];
        const stats = profile.stats || {};
        const assignmentReviews = getStudentAssignmentReviewEntries(profile);
        const detailLine = [
            profile.school || "",
            profile.track || "",
            profile.location || ""
        ].filter(Boolean).join(" | ");

        return `
            <article class="editor-card student-directory-item" data-student-id="${escapeHtml(entry.userId)}">
                <div class="student-directory-top">
                    <div class="student-directory-name">
                        <strong>${escapeHtml(profile.displayName || "Student")}</strong>
                        <span class="student-directory-email">${escapeHtml(profile.email || "No email added yet")}</span>
                    </div>
                    <span class="editor-tag">${escapeHtml(profile.headline || "Student profile")}</span>
                </div>
                <p>${escapeHtml(profile.bio || "This student has not added a full bio yet.")}</p>
                <div class="student-directory-meta">
                    <span>${escapeHtml(detailLine || "School, track, and location will appear here once added.")}</span>
                </div>
                <div class="editor-card-tags">
                    ${tags.length ? tags.map((tag) => `<span class="editor-tag">${escapeHtml(tag)}</span>`).join("") : '<span class="editor-tag">No teacher tags yet</span>'}
                </div>
                <div class="student-directory-stats">
                    <span class="editor-tag">${escapeHtml(`${stats.completedCourses || 0} courses`)}</span>
                    <span class="editor-tag">${escapeHtml(`${stats.completedAssignments || 0} assignments`)}</span>
                    <span class="editor-tag">${escapeHtml(`${stats.attendedEvents || 0} events`)}</span>
                    <span class="editor-tag">${escapeHtml(`${stats.submittedProjects || 0} projects`)}</span>
                </div>
                <div class="student-stat-editor">
                    <div class="submission-review-section-head">
                        <strong>Student dashboard numbers</strong>
                        <span>Teacher managed</span>
                    </div>
                    <div class="student-stat-editor-grid">
                        <label class="field-group">
                            <span>Courses completed</span>
                            <input
                                type="number"
                                min="0"
                                value="${escapeHtml(String(stats.completedCourses || 0))}"
                                placeholder="0"
                                data-student-stat-input="completedCourses"
                                data-student-id="${escapeHtml(entry.userId)}"
                            />
                        </label>
                        <label class="field-group">
                            <span>Assignments completed</span>
                            <input
                                type="number"
                                min="0"
                                value="${escapeHtml(String(stats.completedAssignments || 0))}"
                                placeholder="0"
                                data-student-stat-input="completedAssignments"
                                data-student-id="${escapeHtml(entry.userId)}"
                            />
                        </label>
                        <label class="field-group">
                            <span>Events attended</span>
                            <input
                                type="number"
                                min="0"
                                value="${escapeHtml(String(stats.attendedEvents || 0))}"
                                placeholder="0"
                                data-student-stat-input="attendedEvents"
                                data-student-id="${escapeHtml(entry.userId)}"
                            />
                        </label>
                        <label class="field-group">
                            <span>Projects submitted</span>
                            <input
                                type="number"
                                min="0"
                                value="${escapeHtml(String(stats.submittedProjects || 0))}"
                                placeholder="0"
                                data-student-stat-input="submittedProjects"
                                data-student-id="${escapeHtml(entry.userId)}"
                            />
                        </label>
                    </div>
                    <p class="student-stat-editor-note">These saved counts become the four top dashboard boxes for this student.</p>
                </div>
                <div class="submission-review-list">
                    <div class="submission-review-section-head">
                        <strong>Assignment submissions</strong>
                        <span>${escapeHtml(`${assignmentReviews.length} linked`)}</span>
                    </div>
                    ${assignmentReviews.length ? assignmentReviews.map((assignment) => {
            const reviewStatus = getStudentAssignmentReviewStatus(assignment);
            return `
                            <div class="submission-review-card" data-student-assignment-card data-student-id="${escapeHtml(entry.userId)}" data-assignment-id="${escapeHtml(assignment.id || "")}">
                                <div class="submission-review-head">
                                    <strong>${escapeHtml(assignment.title || "Course assignment")}</strong>
                                    <span class="submission-status-chip ${escapeHtml(reviewStatus.className)}">${escapeHtml(reviewStatus.label)}</span>
                                </div>
                                <div class="submission-review-meta">
                                    <span>${escapeHtml(assignment.courseTitle || "Linked course assignment")}</span>
                                    <span>${escapeHtml(assignment.submittedAt ? `Submitted ${formatCompactDate(String(assignment.submittedAt).slice(0, 10))}` : "Waiting for first submission")}</span>
                                    ${assignment.awardedPoints ? `<span>${escapeHtml(`${assignment.awardedPoints} pts awarded`)}</span>` : ""}
                                </div>
                                ${assignment.submissionUrl
                    ? `<a class="submission-review-link" href="${escapeHtml(assignment.submissionUrl)}" target="_blank" rel="noreferrer">Open submitted link</a>`
                    : '<span class="student-directory-empty">No submission link added yet.</span>'}
                                <div class="submission-review-fields">
                                    <label class="field-group">
                                        <span>Points given</span>
                                        <input type="number" min="0" value="${escapeHtml(String(assignment.awardedPoints || ""))}" placeholder="0" data-student-assignment-points />
                                    </label>
                                    <label class="field-group">
                                        <span>Teacher note</span>
                                        <input type="text" value="${escapeHtml(assignment.teacherFeedback || "")}" placeholder="Verified and ready for dashboard" data-student-assignment-feedback />
                                    </label>
                                </div>
                                <div class="editor-actions">
                                    <button type="button" class="editor-btn featured" data-student-assignment-verify="${escapeHtml(entry.userId)}">${escapeHtml(reviewStatus.className === "verified" ? "Update Review" : "Verify Submission")}</button>
                                </div>
                            </div>
                        `;
        }).join("") : '<div class="student-directory-empty">No assignment links submitted yet.</div>'}
                </div>
                <label class="field-group student-tag-input">
                    <span>Teacher tags</span>
                    <input
                        type="text"
                        value="${escapeHtml(tags.join(", "))}"
                        placeholder="Example: Consistent, Fast learner, Needs presentation polish"
                        data-student-tags-input="${escapeHtml(entry.userId)}"
                    />
                </label>
                <div class="editor-actions">
                    <button type="button" class="editor-btn featured" data-student-stats-save="${escapeHtml(entry.userId)}">Save Dashboard Stats</button>
                    <button type="button" class="editor-btn" data-student-tags-save="${escapeHtml(entry.userId)}">Save Tags</button>
                </div>
            </article>
        `;
    }).join("");
}

async function refreshStudentDirectory() {
    studentDirectory = await loadStudentDirectory([]);
    renderStudentDirectory();
}


async function persistOverviewTasks(nextTasks) {
    overviewTasks = nextTasks;
    await saveContent(CONTENT_PATHS.overviewTasks, nextTasks);
}

async function persistResources(nextResources) {
    resources = nextResources;
    await saveContent(CONTENT_PATHS.resources, nextResources);
}

async function persistVideoCourses(nextVideoCourses) {
    videoCourses = nextVideoCourses;
    await saveContent(CONTENT_PATHS.videoCourses, nextVideoCourses);
}

async function persistEvents(nextEvents) {
    events = sortEventsByDate(nextEvents);
    await saveContent(CONTENT_PATHS.events, events);
}

async function persistAuthorityArticles(nextArticles) {
    authorityArticles = nextArticles.map((article, index) => ({
        ...article,
        role: "authority",
        avatar: "images/logo.png",
        accentSoft: article.accentSoft || getArticleAccent(index)
    }));
    await saveContent(CONTENT_PATHS.authorityArticles, authorityArticles);
}

async function persistDashboardAnnouncement(nextAnnouncement) {
    dashboardAnnouncement = normalizeAnnouncement({
        ...nextAnnouncement,
        updatedAt: new Date().toISOString()
    });
    await saveContent(CONTENT_PATHS.dashboardAnnouncement, dashboardAnnouncement);
    fillAnnouncementForm(dashboardAnnouncement);
    renderDashboardAnnouncementPreview();
}

function fillTaskForm(task) {
    if (!task) return;
    editingTaskId = task.id;
    if (taskTitleEl) taskTitleEl.value = task.title || "";
    if (taskDescriptionEl) taskDescriptionEl.value = task.description || "";
    if (taskAccentEl) taskAccentEl.value = task.accent || "yellow";
    if (taskActionLabelEl) taskActionLabelEl.value = task.actionLabel || "Go Ahead";
    if (taskActionUrlEl) taskActionUrlEl.value = task.actionUrl || "#";
    setFormMode(taskSubmitBtn, taskCancelBtn, true, "Add Task", "Save Task");
    taskTitleEl?.focus();
}

function fillResourceForm(resource) {
    if (!resource) return;
    editingResourceId = resource.id;
    if (resourceTypeEl) resourceTypeEl.value = resource.type || "video";
    if (resourceBadgeEl) resourceBadgeEl.value = resource.badge || "";
    if (resourceMetaEl) resourceMetaEl.value = resource.meta || "";
    if (resourceUrlEl) resourceUrlEl.value = resource.url || RESOURCE_DEFAULT_URLS.video;
    if (resourceTitleEl) resourceTitleEl.value = resource.title || "";
    if (resourceDescriptionEl) resourceDescriptionEl.value = resource.description || "";
    if (resourceFooterLeftEl) resourceFooterLeftEl.value = resource.footerLeft || "";
    if (resourceFooterRightEl) resourceFooterRightEl.value = resource.footerRight || "";
    setFormMode(resourceSubmitBtn, resourceCancelBtn, true, "Add Resource", "Save Resource");
    resourceTitleEl?.focus();
}

function fillVideoCourseForm(course) {
    if (!course) return;
    const normalizedSections = normalizeCourseSections(course);
    editingVideoCourseId = course.id;
    if (videoCourseTitleEl) videoCourseTitleEl.value = course.title || "";
    if (videoCoursePlaylistLabelEl) videoCoursePlaylistLabelEl.value = course.playlistLabel || "";
    if (videoCourseLessonsEl) videoCourseLessonsEl.value = course.lessonCount || "";
    if (videoCourseAccessLabelEl) videoCourseAccessLabelEl.value = course.accessLabel || "FREE";
    if (videoCourseUrlEl) videoCourseUrlEl.value = course.courseUrl || "course-player.html";
    if (videoCourseDescriptionEl) videoCourseDescriptionEl.value = course.description || "";
    if (videoCoursePlayerEmbedUrlEl) videoCoursePlayerEmbedUrlEl.value = course.playerEmbedUrl || "https://www.youtube.com/embed/ER9SspLe4Hg?si=psSOzWKeyWVhl3t9";
    if (videoCourseAuthorsLineEl) videoCourseAuthorsLineEl.value = course.authorsLine || "";
    if (videoCourseOverviewTextEl) videoCourseOverviewTextEl.value = formatOverviewParagraphs(course.overviewParagraphs);
    if (videoCourseImageEl) videoCourseImageEl.value = course.imageUrl || "images/session.png";
    if (videoCourseCtaLabelEl) videoCourseCtaLabelEl.value = course.ctaLabel || "Enroll for free";
    if (videoCourseAvatarOneEl) videoCourseAvatarOneEl.value = course.mentorAvatars?.[0] || "images/avi.png";
    if (videoCourseAvatarTwoEl) videoCourseAvatarTwoEl.value = course.mentorAvatars?.[1] || "images/tejas.png";
    if (videoCourseSectionOneTitleEl) videoCourseSectionOneTitleEl.value = normalizedSections[0]?.title || "";
    if (videoCourseSectionOneMetaEl) videoCourseSectionOneMetaEl.value = normalizedSections[0]?.meta || "";
    if (videoCourseSectionOneLessonsEl) videoCourseSectionOneLessonsEl.value = formatLessonLines(normalizedSections[0]?.lessons);
    if (videoCourseSectionTwoTitleEl) videoCourseSectionTwoTitleEl.value = normalizedSections[1]?.title || "";
    if (videoCourseSectionTwoMetaEl) videoCourseSectionTwoMetaEl.value = normalizedSections[1]?.meta || "";
    if (videoCourseSectionTwoLessonsEl) videoCourseSectionTwoLessonsEl.value = formatLessonLines(normalizedSections[1]?.lessons);
    setFormMode(videoCourseSubmitBtn, videoCourseCancelBtn, true, "Add Video Course", "Save Video Course");
    videoCourseTitleEl?.focus();
}

function fillEventForm(eventItem) {
    if (!eventItem) return;
    editingEventId = eventItem.id;
    if (eventBadgeEl) eventBadgeEl.value = eventItem.badge || "";
    if (eventMentorEl) eventMentorEl.value = eventItem.mentor || "";
    if (eventTitleEl) eventTitleEl.value = eventItem.title || "";
    if (eventSummaryEl) eventSummaryEl.value = eventItem.summary || "";
    if (eventDateEl) eventDateEl.value = eventItem.date || "";
    if (eventTimeRangeEl) eventTimeRangeEl.value = eventItem.timeRange || "";
    if (eventImageEl) eventImageEl.value = eventItem.image || "images/class.png";
    if (eventJoinLinkEl) eventJoinLinkEl.value = eventItem.joinLink || "#";
    renderEventLinkFields(eventItem.linkedCourseId || "", eventItem.linkedAssignmentId || "");
    setFormMode(eventSubmitBtn, eventCancelBtn, true, "Add Session", "Save Session");
    eventTitleEl?.focus();
}

function fillArticleForm(article) {
    if (!article) return;
    editingArticleId = article.id;
    if (authorityAuthorEl) authorityAuthorEl.value = article.author || "";
    if (authorityMetaEl) authorityMetaEl.value = article.meta || "";
    if (authorityTitleEl) authorityTitleEl.value = article.title || "";
    if (authoritySummaryEl) authoritySummaryEl.value = article.summary || "";
    if (authoritySupportNoteEl) authoritySupportNoteEl.value = article.supportNote || "";
    if (authorityBodyEl) authorityBodyEl.value = article.body || "";
    if (authorityTopicEl) authorityTopicEl.value = article.topic || "";
    if (authorityReadTimeEl) authorityReadTimeEl.value = article.readTime || "";
    if (authorityReadsEl) authorityReadsEl.value = article.reads || "";
    setFormMode(articleSubmitBtn, articleCancelBtn, true, "Add Authority Article", "Save Authority Article");
    authorityTitleEl?.focus();
}

function renderDashboardAnnouncementPreview() {
    const announcement = normalizeAnnouncement(dashboardAnnouncement);
    const details = formatAnnouncementParagraphs(announcement.details);
    const hasMessage = Boolean(announcement.title || announcement.summary || details.length);

    if (announcementPreviewStatusEl) {
        announcementPreviewStatusEl.textContent = announcement.isActive ? "Popup live" : "Popup off";
    }

    if (announcementPreviewImageEl) {
        announcementPreviewImageEl.src = announcement.imageUrl || DEFAULT_DASHBOARD_ANNOUNCEMENT.imageUrl;
        announcementPreviewImageEl.alt = announcement.title || "Announcement preview";
    }

    if (announcementPreviewEyebrowEl) {
        announcementPreviewEyebrowEl.textContent = announcement.eyebrow || DEFAULT_DASHBOARD_ANNOUNCEMENT.eyebrow;
    }

    if (announcementPreviewTitleEl) {
        announcementPreviewTitleEl.textContent = announcement.title || "No live dashboard popup yet";
    }

    if (announcementPreviewSummaryEl) {
        announcementPreviewSummaryEl.textContent = announcement.summary || "Save an active announcement here and students will see it as soon as they enter their dashboard.";
    }

    if (announcementPreviewDetailsEl) {
        announcementPreviewDetailsEl.innerHTML = hasMessage
            ? (details.length
                ? details.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")
                : `<p>${escapeHtml(announcement.summary || "Students will see the full details here.")}</p>`)
            : "<p>Use the form on the left to add the full message, image, and action button.</p>";
    }

    if (announcementPreviewButtonEl) {
        announcementPreviewButtonEl.textContent = announcement.ctaLabel || DEFAULT_DASHBOARD_ANNOUNCEMENT.ctaLabel;
    }

    if (announcementPreviewUpdatedEl) {
        announcementPreviewUpdatedEl.textContent = formatAnnouncementUpdatedAt(announcement.updatedAt);
    }
}

function bindStaticEvents() {
    navItems.forEach((item) => {
        item.addEventListener("click", (event) => {
            event.preventDefault();
            openTab(item.dataset.tab || "overview");
        });
    });

    eventLinkedCourseEl?.addEventListener("change", () => {
        renderEventLinkFields(eventLinkedCourseEl.value || "", "");
    });

    window.addEventListener("hashchange", () => {
        openTab(getRequestedTab(), { syncHash: false });
    });

    document.getElementById("logoutBtn")?.addEventListener("click", () => {
        signOut(auth).then(() => {
            window.location.href = "auth.html";
        }).catch((error) => {
            console.error("Logout Error:", error);
        });
    });

    resourceTypeEl?.addEventListener("change", () => {
        if (!resourceUrlEl) return;
        const nextDefault = RESOURCE_DEFAULT_URLS[resourceTypeEl.value] || "#";
        const currentValue = resourceUrlEl.value.trim();
        if (!currentValue || Object.values(RESOURCE_DEFAULT_URLS).includes(currentValue)) {
            resourceUrlEl.value = nextDefault;
        }
    });

    taskCancelBtn?.addEventListener("click", resetTaskForm);
    resourceCancelBtn?.addEventListener("click", resetResourceForm);
    videoCourseCancelBtn?.addEventListener("click", resetVideoCourseForm);
    eventCancelBtn?.addEventListener("click", resetEventForm);
    articleCancelBtn?.addEventListener("click", resetArticleForm);
    announcementResetBtn?.addEventListener("click", () => {
        fillAnnouncementForm();
    });

    overviewTaskForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        const accent = taskAccentEl?.value || "yellow";
        const payload = {
            id: editingTaskId || makeId("task", taskTitleEl?.value || "overview-task"),
            title: taskTitleEl?.value.trim() || "Untitled task",
            description: taskDescriptionEl?.value.trim() || "Teacher guidance will appear here.",
            level: TASK_LEVELS[accent] || "beginner",
            accent,
            actionLabel: taskActionLabelEl?.value.trim() || "Go Ahead",
            actionUrl: taskActionUrlEl?.value.trim() || "#"
        };

        const nextTasks = editingTaskId
            ? overviewTasks.map((task) => task.id === editingTaskId ? payload : task)
            : [...overviewTasks, payload];

        try {
            await persistOverviewTasks(nextTasks);
            resetTaskForm();
        } catch (error) {
            console.error("Failed to save overview task:", error);
            window.alert("Unable to save this overview task right now.");
        }
    });

    resourceForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        const type = resourceTypeEl?.value || "video";
        const payload = {
            id: editingResourceId || makeId("resource", resourceTitleEl?.value || "resource"),
            type,
            badge: resourceBadgeEl?.value.trim() || "Teacher pick",
            meta: resourceMetaEl?.value.trim() || "Fresh update",
            url: resourceUrlEl?.value.trim() || RESOURCE_DEFAULT_URLS[type] || "#",
            title: resourceTitleEl?.value.trim() || "Untitled resource",
            description: resourceDescriptionEl?.value.trim() || "A teacher-managed resource will appear here.",
            footerLeft: resourceFooterLeftEl?.value.trim() || "Open now",
            footerRight: resourceFooterRightEl?.value.trim() || "Explore"
        };

        const nextResources = editingResourceId
            ? resources.map((resource) => resource.id === editingResourceId ? payload : resource)
            : [...resources, payload];

        try {
            await persistResources(nextResources);
            resetResourceForm();
        } catch (error) {
            console.error("Failed to save resource:", error);
            window.alert("Unable to save this resource right now.");
        }
    });

    videoCourseForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        const nextPlayerEmbedUrl = videoCoursePlayerEmbedUrlEl?.value.trim() || "https://www.youtube.com/embed/ER9SspLe4Hg?si=psSOzWKeyWVhl3t9";
        const existingCourse = editingVideoCourseId
            ? videoCourses.find((course) => course.id === editingVideoCourseId) || {}
            : {};

        const sections = [
            {
                title: videoCourseSectionOneTitleEl?.value.trim() || "",
                meta: videoCourseSectionOneMetaEl?.value.trim() || "",
                lessons: parseLessonLines(videoCourseSectionOneLessonsEl?.value || "")
            },
            {
                title: videoCourseSectionTwoTitleEl?.value.trim() || "",
                meta: videoCourseSectionTwoMetaEl?.value.trim() || "",
                lessons: parseLessonLines(videoCourseSectionTwoLessonsEl?.value || "")
            }
        ].filter((section) => section.title || section.meta || section.lessons.length)
            .map((section, index) => ({
                id: `section-${index + 1}`,
                title: section.title || `Section ${index + 1}`,
                meta: section.meta || `${section.lessons.length} lesson${section.lessons.length === 1 ? "" : "s"}`,
                lessons: section.lessons
            }));

        const mergedSections = mergeCourseSections(sections, {
            ...existingCourse,
            playerEmbedUrl: nextPlayerEmbedUrl
        });

        const payload = {
            id: editingVideoCourseId || makeId("video-course", videoCourseTitleEl?.value || "video-course"),
            title: videoCourseTitleEl?.value.trim() || "Untitled course",
            playlistLabel: videoCoursePlaylistLabelEl?.value.trim() || "HackLab Playlist",
            lessonCount: videoCourseLessonsEl?.value.trim() || "New course",
            accessLabel: videoCourseAccessLabelEl?.value.trim() || "FREE",
            description: videoCourseDescriptionEl?.value.trim() || "A teacher-managed video course will appear here.",
            playerEmbedUrl: nextPlayerEmbedUrl,
            authorsLine: videoCourseAuthorsLineEl?.value.trim() || "By HackLab Mentors",
            overviewParagraphs: parseOverviewParagraphs(videoCourseOverviewTextEl?.value || ""),
            imageUrl: videoCourseImageEl?.value.trim() || "images/session.png",
            mentorAvatars: [
                videoCourseAvatarOneEl?.value.trim() || "images/avi.png",
                videoCourseAvatarTwoEl?.value.trim() || "images/tejas.png"
            ].filter(Boolean),
            ctaLabel: videoCourseCtaLabelEl?.value.trim() || "Enroll for free",
            courseUrl: videoCourseUrlEl?.value.trim() || "course-player.html",
            sessionNotes: Array.isArray(existingCourse.sessionNotes) ? existingCourse.sessionNotes : [],
            sections: mergedSections
        };

        const nextVideoCourses = editingVideoCourseId
            ? videoCourses.map((course) => course.id === editingVideoCourseId ? payload : course)
            : [payload, ...videoCourses];

        try {
            await persistVideoCourses(nextVideoCourses);
            resetVideoCourseForm();
        } catch (error) {
            console.error("Failed to save video course:", error);
            window.alert("Unable to save this video course right now.");
        }
    });

    eventForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        const linkedCourseId = eventLinkedCourseEl?.value || "";
        const linkedAssignmentId = eventLinkedAssignmentEl?.value || "";
        const linkedAssignment = getCourseAssignmentOptions(linkedCourseId)
            .find((assignment) => assignment.assignmentId === linkedAssignmentId) || null;

        const payload = {
            id: editingEventId || makeId("event", eventTitleEl?.value || "session"),
            badge: eventBadgeEl?.value.trim() || "Live",
            mentor: eventMentorEl?.value.trim() || "HackLab Teacher",
            title: eventTitleEl?.value.trim() || "Untitled session",
            summary: eventSummaryEl?.value.trim() || "Students will see your session summary here.",
            date: eventDateEl?.value || "",
            timeRange: eventTimeRangeEl?.value.trim() || "TBA",
            image: eventImageEl?.value.trim() || "images/class.png",
            joinLink: eventJoinLinkEl?.value.trim() || "#",
            linkedCourseId,
            linkedSectionId: linkedAssignment?.sectionId || "",
            linkedAssignmentId
        };

        const nextEvents = editingEventId
            ? events.map((eventItem) => eventItem.id === editingEventId ? payload : eventItem)
            : [...events, payload];

        try {
            await persistEvents(nextEvents);
            resetEventForm();
        } catch (error) {
            console.error("Failed to save event:", error);
            window.alert("Unable to save this session right now.");
        }
    });

    articleAuthorityForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        const payload = {
            id: editingArticleId || makeId("authority", authorityTitleEl?.value || "authority-article"),
            role: "authority",
            title: authorityTitleEl?.value.trim() || "Untitled authority article",
            summary: authoritySummaryEl?.value.trim() || "Students will see this summary in the article feed.",
            supportNote: authoritySupportNoteEl?.value.trim() || "State the one lesson students should carry from this article.",
            body: authorityBodyEl?.value.trim() || authoritySummaryEl?.value.trim() || "No full article body has been written yet.",
            author: authorityAuthorEl?.value.trim() || "HackLab Authority",
            meta: authorityMetaEl?.value.trim() || "Mentor reviewed",
            topic: authorityTopicEl?.value.trim() || "General",
            readTime: authorityReadTimeEl?.value.trim() || "5 min read",
            reads: authorityReadsEl?.value.trim() || "Fresh pick",
            avatar: "images/logo.png",
            accentSoft: getArticleAccent(0)
        };

        const nextArticles = editingArticleId
            ? authorityArticles.map((article) => article.id === editingArticleId ? {
                ...article,
                ...payload
            } : article)
            : [payload, ...authorityArticles];

        try {
            await persistAuthorityArticles(nextArticles);
            resetArticleForm();
        } catch (error) {
            console.error("Failed to save authority article:", error);
            window.alert("Unable to save this authority article right now.");
        }
    });

    dashboardAnnouncementForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        const payload = {
            id: DEFAULT_DASHBOARD_ANNOUNCEMENT.id,
            eyebrow: announcementEyebrowEl?.value.trim() || DEFAULT_DASHBOARD_ANNOUNCEMENT.eyebrow,
            title: announcementTitleEl?.value.trim() || "",
            summary: announcementSummaryEl?.value.trim() || "",
            details: announcementDetailsEl?.value.trim() || "",
            imageUrl: announcementImageUrlEl?.value.trim() || DEFAULT_DASHBOARD_ANNOUNCEMENT.imageUrl,
            ctaLabel: announcementCtaLabelEl?.value.trim() || DEFAULT_DASHBOARD_ANNOUNCEMENT.ctaLabel,
            ctaUrl: announcementCtaUrlEl?.value.trim() || "",
            isActive: Boolean(announcementIsActiveEl?.checked)
        };

        if (!payload.title || !payload.summary || !payload.details) {
            window.alert("Add the title, summary, and full details before saving the dashboard announcement.");
            return;
        }

        try {
            if (announcementSubmitBtn) {
                announcementSubmitBtn.disabled = true;
                announcementSubmitBtn.textContent = "Saving...";
            }

            await persistDashboardAnnouncement(payload);
        } catch (error) {
            console.error("Failed to save dashboard announcement:", error);
            window.alert("Unable to save the dashboard announcement right now.");
        } finally {
            if (announcementSubmitBtn) {
                announcementSubmitBtn.disabled = false;
                announcementSubmitBtn.textContent = "Save Announcement";
            }
        }
    });

    teacherProjectForm?.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!teacherUser) return;

        const projectLink = normalizeProjectUrl(teacherProjectLinkEl?.value || "");
        if (teacherProjectLinkEl?.value.trim() && !projectLink) {
            window.alert("Add a valid live project link (e.g. https://your-project.com).");
            return;
        }

        try {
            if (teacherProjectSubmitBtn) {
                teacherProjectSubmitBtn.disabled = true;
                teacherProjectSubmitBtn.textContent = "Publishing...";
            }

            await createProject({
                visibility: "public",
                ownerId: teacherUser.uid,
                ownerName: teacherUserName,
                ownerAvatar: teacherUserAvatar,
                collaboratorAvatars: [teacherUserAvatar],
                title: teacherProjectTitleEl?.value.trim() || "Untitled project",
                summary: teacherProjectSummaryEl?.value.trim() || "A spotlight project published by the teacher.",
                category: teacherProjectCategoryEl?.value.trim() || "Student Build",
                badge: teacherProjectBadgeEl?.value.trim() || "Teacher Spotlight",
                status: teacherProjectStatusEl?.value.trim() || "Spotlight",
                projectLink,
                imageUrl: teacherProjectImageEl?.value.trim() || "images/session.png",
                isFeatured: true
            });

            resetTeacherProjectForm();
            await refreshTeacherProjects();
            openTab("projects");
        } catch (error) {
            console.error("Failed to publish spotlight project:", error);
            window.alert("Unable to publish this spotlight project right now.");
        } finally {
            if (teacherProjectSubmitBtn) {
                teacherProjectSubmitBtn.disabled = false;
                teacherProjectSubmitBtn.textContent = "Publish Spotlight Project";
            }
        }
    });

    teacherCollabInboxEl?.addEventListener("click", async (event) => {
        const acceptButton = event.target.closest("[data-teacher-collab-accept]");
        if (!acceptButton || !teacherUser?.uid) return;

        const requestId = acceptButton.dataset.teacherCollabAccept;
        if (!requestId) return;

        try {
            acceptButton.disabled = true;
            await respondToCollaborationRequest({
                recipientIdentity: getTeacherCollaborationIdentity(),
                requestId,
                decision: "accepted"
            });
            await refreshTeacherCollaboration();
        } catch (error) {
            console.error("Unable to accept teacher collaboration request:", error);
            window.alert("Unable to accept that collaboration request right now.");
        } finally {
            acceptButton.disabled = false;
        }
    });

    studentDirectoryListEl?.addEventListener("click", async (event) => {
        const verifyButton = event.target.closest("[data-student-assignment-verify]");
        if (verifyButton) {
            const reviewCard = verifyButton.closest("[data-student-assignment-card]");
            const studentId = reviewCard?.dataset.studentId || verifyButton.dataset.studentAssignmentVerify || "";
            const assignmentId = reviewCard?.dataset.assignmentId || "";
            const studentEntry = studentDirectory.find((entry) => entry.userId === studentId);
            const assignmentEntry = Array.isArray(studentEntry?.profile?.assignments)
                ? studentEntry.profile.assignments.find((assignment) => (assignment.id || assignment.title) === assignmentId)
                : null;
            const pointsInput = reviewCard?.querySelector("[data-student-assignment-points]");
            const feedbackInput = reviewCard?.querySelector("[data-student-assignment-feedback]");

            if (!studentEntry || !assignmentEntry || !assignmentEntry.submissionUrl) return;

            const awardedPoints = Math.max(0, Number.parseInt(pointsInput?.value || "0", 10) || 0);
            const teacherFeedback = String(feedbackInput?.value || "").trim();
            const nextAssignments = studentEntry.profile.assignments.map((assignment) => (
                (assignment.id || assignment.title) === assignmentId
                    ? {
                        ...assignment,
                        status: "completed",
                        reviewStatus: "verified",
                        verifiedByTeacher: true,
                        awardedPoints,
                        teacherFeedback,
                        reviewedAt: new Date().toISOString()
                    }
                    : assignment
            ));

            let nextProfile = {
                ...(studentEntry.profile || {}),
                assignments: nextAssignments
            };

            if (assignmentEntry.courseId) {
                nextProfile = setCourseContentCompletion(nextProfile, assignmentEntry.courseId, {
                    id: assignmentEntry.id,
                    type: "assignment"
                }, true);
            }

            nextProfile = syncProfileCourseStats(nextProfile, normalizeCourses(videoCourses, DEFAULT_VIDEO_COURSES));

            try {
                verifyButton.disabled = true;
                verifyButton.textContent = "Saving...";
                const savedProfile = await saveStudentProfile(studentId, nextProfile);
                studentDirectory = studentDirectory.map((entry) => (
                    entry.userId === studentId
                        ? { ...entry, profile: savedProfile }
                        : entry
                ));
                renderStudentDirectory();
            } catch (error) {
                console.error("Unable to verify assignment submission:", error);
                window.alert("Unable to verify this assignment right now.");
            } finally {
                verifyButton.disabled = false;
                verifyButton.textContent = "Verify Submission";
            }
            return;
        }

        const saveStatsButton = event.target.closest("[data-student-stats-save]");
        if (saveStatsButton) {
            const studentId = saveStatsButton.dataset.studentStatsSave;
            if (!studentId) return;

            const studentEntry = studentDirectory.find((entry) => entry.userId === studentId);
            if (!studentEntry) return;

            const readStatValue = (key) => {
                const input = studentDirectoryListEl.querySelector(`[data-student-stat-input="${key}"][data-student-id="${studentId}"]`);
                return Math.max(0, Number.parseInt(input?.value || "0", 10) || 0);
            };

            const savedStats = {
                completedCourses: readStatValue("completedCourses"),
                completedAssignments: readStatValue("completedAssignments"),
                attendedEvents: readStatValue("attendedEvents"),
                submittedProjects: readStatValue("submittedProjects")
            };

            const nextProfile = syncProfileCourseStats({
                ...(studentEntry.profile || {}),
                stats: {
                    ...(studentEntry.profile?.stats || {}),
                    ...savedStats
                },
                teacherManagedStats: {
                    ...(studentEntry.profile?.teacherManagedStats || {}),
                    ...savedStats
                }
            }, normalizeCourses(videoCourses, DEFAULT_VIDEO_COURSES));

            try {
                saveStatsButton.disabled = true;
                saveStatsButton.textContent = "Saving...";
                const savedProfile = await saveStudentProfile(studentId, nextProfile);
                studentDirectory = studentDirectory.map((entry) => (
                    entry.userId === studentId
                        ? { ...entry, profile: savedProfile }
                        : entry
                ));
                renderStudentDirectory();
            } catch (error) {
                console.error("Unable to save dashboard stats:", error);
                window.alert("Unable to save the dashboard stats right now.");
            } finally {
                saveStatsButton.disabled = false;
                saveStatsButton.textContent = "Save Dashboard Stats";
            }
            return;
        }

        const saveButton = event.target.closest("[data-student-tags-save]");
        if (!saveButton) return;

        const studentId = saveButton.dataset.studentTagsSave;
        if (!studentId) return;

        const input = studentDirectoryListEl.querySelector(`[data-student-tags-input="${studentId}"]`);
        const studentEntry = studentDirectory.find((entry) => entry.userId === studentId);
        if (!input || !studentEntry) return;

        const nextProfile = {
            ...(studentEntry.profile || {}),
            teacherTags: parseTeacherTags(input.value)
        };

        try {
            saveButton.disabled = true;
            saveButton.textContent = "Saving...";
            const savedProfile = await saveStudentProfile(studentId, nextProfile);
            studentDirectory = studentDirectory.map((entry) => (
                entry.userId === studentId
                    ? { ...entry, profile: savedProfile }
                    : entry
            ));
            renderStudentDirectory();
        } catch (error) {
            console.error("Unable to save student tags:", error);
            window.alert("Unable to save the teacher tags right now.");
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = "Save Tags";
        }
    });

    overviewTaskListEl?.addEventListener("click", async (event) => {
        const actionButton = event.target.closest("[data-action]");
        if (!actionButton) return;

        const action = actionButton.dataset.action;
        const id = actionButton.dataset.id;
        const task = overviewTasks.find((item) => item.id === id);

        if (action === "edit-task") {
            fillTaskForm(task);
            openTab("overview");
            return;
        }

        if (action === "delete-task" && task) {
            if (!window.confirm(`Delete "${task.title}" from the student overview?`)) return;

            try {
                await persistOverviewTasks(overviewTasks.filter((item) => item.id !== id));
                if (editingTaskId === id) resetTaskForm();
            } catch (error) {
                console.error("Failed to delete task:", error);
                window.alert("Unable to delete this task right now.");
            }
        }
    });

    resourceListEl?.addEventListener("click", async (event) => {
        const actionButton = event.target.closest("[data-action]");
        if (!actionButton) return;

        const action = actionButton.dataset.action;
        const id = actionButton.dataset.id;
        const resource = resources.find((item) => item.id === id);

        if (action === "edit-resource") {
            fillResourceForm(resource);
            openTab("resources");
            return;
        }

        if (action === "delete-resource" && resource) {
            if (!window.confirm(`Delete "${resource.title}" from the student resources page?`)) return;

            try {
                await persistResources(resources.filter((item) => item.id !== id));
                if (editingResourceId === id) resetResourceForm();
            } catch (error) {
                console.error("Failed to delete resource:", error);
                window.alert("Unable to delete this resource right now.");
            }
        }
    });

    videoCourseListEl?.addEventListener("click", async (event) => {
        const actionButton = event.target.closest("[data-action]");
        if (!actionButton) {
            const courseCard = event.target.closest("[data-course-editor-url]");
            if (courseCard) {
                window.location.href = courseCard.dataset.courseEditorUrl;
            }
            return;
        }

        const action = actionButton.dataset.action;
        const id = actionButton.dataset.id;
        const course = videoCourses.find((item) => item.id === id);

        if (action === "open-video-course-editor" && course) {
            window.location.href = getTeacherCourseEditorUrl(course.id);
            return;
        }

        if (action === "add-course-assignment" && course) {
            window.location.href = getTeacherCourseEditorUrl(course.id, {
                panel: "lesson",
                draft: "assignment"
            });
            return;
        }

        if (action === "edit-video-course") {
            fillVideoCourseForm(course);
            openTab("resources");
            return;
        }

        if (action === "delete-video-course" && course) {
            if (!window.confirm(`Delete "${course.title}" from the student video courses page?`)) return;

            try {
                await persistVideoCourses(videoCourses.filter((item) => item.id !== id));
                if (editingVideoCourseId === id) resetVideoCourseForm();
            } catch (error) {
                console.error("Failed to delete video course:", error);
                window.alert("Unable to delete this video course right now.");
            }
        }
    });

    eventListEl?.addEventListener("click", async (event) => {
        const actionButton = event.target.closest("[data-action]");
        if (!actionButton) return;

        const action = actionButton.dataset.action;
        const id = actionButton.dataset.id;
        const eventItem = events.find((item) => item.id === id);

        if (action === "edit-event") {
            fillEventForm(eventItem);
            openTab("events");
            return;
        }

        if (action === "delete-event" && eventItem) {
            if (!window.confirm(`Delete "${eventItem.title}" from the student events page?`)) return;

            try {
                await persistEvents(events.filter((item) => item.id !== id));
                if (editingEventId === id) resetEventForm();
            } catch (error) {
                console.error("Failed to delete event:", error);
                window.alert("Unable to delete this event right now.");
            }
        }
    });

    authorityArticleListEl?.addEventListener("click", async (event) => {
        const actionButton = event.target.closest("[data-action]");
        if (!actionButton) return;

        const action = actionButton.dataset.action;
        const id = actionButton.dataset.id;
        const article = authorityArticles.find((item) => item.id === id);

        if (action === "edit-article") {
            fillArticleForm(article);
            openTab("articles");
            return;
        }

        if (action === "delete-article" && article) {
            if (!window.confirm(`Delete "${article.title}" from the authority article lane?`)) return;

            try {
                await persistAuthorityArticles(authorityArticles.filter((item) => item.id !== id));
                if (editingArticleId === id) resetArticleForm();
            } catch (error) {
                console.error("Failed to delete authority article:", error);
                window.alert("Unable to delete this authority article right now.");
            }
        }
    });
}

function attachWatchers() {
    if (watchersAttached) return;
    watchersAttached = true;

    watchContent(CONTENT_PATHS.overviewTasks, DEFAULT_OVERVIEW_TASKS, (items) => {
        overviewTasks = normalizeCollection(items, DEFAULT_OVERVIEW_TASKS);
        renderOverviewTaskList();
    });

    watchContent(CONTENT_PATHS.resources, DEFAULT_RESOURCES, (items) => {
        resources = normalizeCollection(items, DEFAULT_RESOURCES);
        renderResourceList();
    });

    watchContent(CONTENT_PATHS.videoCourses, DEFAULT_VIDEO_COURSES, (items) => {
        videoCourses = normalizeCourses(items, DEFAULT_VIDEO_COURSES).map((course) => ({
            ...course,
            mentorAvatars: Array.isArray(course.mentorAvatars) && course.mentorAvatars.length
                ? course.mentorAvatars
                : ["images/avi.png", "images/tejas.png"]
        }));
        renderVideoCourseList();
        renderEventLinkFields(eventLinkedCourseEl?.value || "", eventLinkedAssignmentEl?.value || "");
    });

    watchContent(CONTENT_PATHS.events, DEFAULT_EVENTS, (items) => {
        events = sortEventsByDate(normalizeCollection(items, DEFAULT_EVENTS));
        renderEventList();
    });

    watchContent(CONTENT_PATHS.authorityArticles, DEFAULT_AUTHORITY_ARTICLES, (items) => {
        authorityArticles = normalizeCollection(items, DEFAULT_AUTHORITY_ARTICLES).map((article, index) => ({
            ...article,
            role: "authority",
            avatar: article.avatar || "images/logo.png",
            accentSoft: article.accentSoft || getArticleAccent(index)
        }));
        renderAuthorityArticleList();
    });

    watchContent(CONTENT_PATHS.dashboardAnnouncement, DEFAULT_DASHBOARD_ANNOUNCEMENT, (item) => {
        dashboardAnnouncement = normalizeAnnouncement(item);
        renderDashboardAnnouncementPreview();

        if (!announcementFormHydrated) {
            fillAnnouncementForm(dashboardAnnouncement);
            announcementFormHydrated = true;
        }
    });
}

bindStaticEvents();
resetTaskForm();
resetResourceForm();
resetVideoCourseForm();
resetEventForm();
resetArticleForm();
resetTeacherProjectForm();
renderDashboardAnnouncementPreview();
openTab(getRequestedTab(), { syncHash: false });

onAuthStateChanged(auth, async (user) => {
    if (!(await guardTeacherPortal(user))) {
        return;
    }

    teacherUser = user;
    teacherUserName = getDisplayName(user, "HackLab Teacher");
    teacherUserAvatar = user.photoURL || "images/avatar.png";

    attachWatchers();
    await Promise.all([
        refreshTeacherProjects(),
        refreshTeacherCollaboration(),
        refreshStudentDirectory()
    ]);

    if (!cleanupTeacherCommunity) {
        cleanupTeacherCommunity = mountCommunityExperience({
            root: document.getElementById("teacherCommunityRoot"),
            user,
            role: "teacher",
            useHash: false
        });
    }

    if (!teacherCollaborationTimer) {
        const refreshTeacherCollaborationIfVisible = () => {
            if (document.hidden) {
                return;
            }

            refreshTeacherCollaboration();
        };

        teacherCollaborationTimer = window.setInterval(refreshTeacherCollaborationIfVisible, 30000);
        document.addEventListener("visibilitychange", refreshTeacherCollaborationIfVisible);
    }

    openTab(getRequestedTab(), { syncHash: false });
});
