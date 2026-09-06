import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    CONTENT_PATHS,
    DEFAULT_STUDENT_PROFILE,
    DEFAULT_VIDEO_COURSES,
    auth,
    escapeHtml,
    getDisplayName,
    loadStudentProfile,
    saveStudentProfile,
    watchContent
} from "./portal-data.js";
import {
    DEFAULT_COURSE_EMBED_URL,
    findCourseContent,
    getFirstCourseContent,
    isAssignmentContent,
    isCourseContentCompleted,
    normalizeCourses,
    normalizeEmbedUrl,
    setCourseContentCompletion,
    syncProfileCourseStats
} from "./course-content.js";
import { guardStudentPortal } from "./account-access.js";
import { buildLessonAiPack } from "./course-ai-summary.js";

const pageAccentEl = document.getElementById("coursePageAccent");
const playerFrameEl = document.getElementById("coursePlayerFrame");
const assignmentStageEl = document.getElementById("courseAssignmentStage");
const assignmentTagEl = document.getElementById("courseAssignmentTag");
const assignmentTitleEl = document.getElementById("courseAssignmentTitle");
const assignmentSummaryEl = document.getElementById("courseAssignmentSummary");
const assignmentMetaEl = document.getElementById("courseAssignmentMeta");
const assignmentInstructionsEl = document.getElementById("courseAssignmentInstructions");
const assignmentReviewNoteEl = document.getElementById("courseAssignmentReviewNote");
const assignmentSubmissionUrlEl = document.getElementById("courseAssignmentSubmissionUrl");
const assignmentSubmissionNoteEl = document.getElementById("courseAssignmentSubmissionNote");
const assignmentSubmissionFeedbackEl = document.getElementById("courseAssignmentSubmissionFeedback");
const assignmentSubmitBtnEl = document.getElementById("courseAssignmentSubmitBtn");
const lessonTitleEl = document.getElementById("courseLessonTitle");
const lessonDurationEl = document.getElementById("courseLessonDuration");
const completeBtnEl = document.getElementById("courseContentCompleteBtn");
const courseInfoTitleEl = document.getElementById("courseInfoTitle");
const courseInfoAuthorsEl = document.getElementById("courseInfoAuthors");
const courseInfoDescriptionEl = document.getElementById("courseInfoDescription");
const sessionNotesListEl = document.getElementById("courseSessionNotesList");
const qaPlaceholderEl = document.getElementById("courseQaPlaceholder");
const reviewsPlaceholderEl = document.getElementById("courseReviewsPlaceholder");
const courseSectionsListEl = document.getElementById("courseSectionsList");
const courseAiPanelEl = document.getElementById("courseAiPanel");
const courseAiSourceBadgeEl = document.getElementById("courseAiSourceBadge");
const courseAiLessonTitleEl = document.getElementById("courseAiLessonTitle");
const courseAiSummaryTextEl = document.getElementById("courseAiSummaryText");
const courseAiKeyPointsEl = document.getElementById("courseAiKeyPoints");
const courseAiActionsEl = document.getElementById("courseAiActions");
const courseAiRefreshBtnEl = document.getElementById("courseAiRefreshBtn");

const tabButtons = Array.from(document.querySelectorAll(".tab[data-panel]"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel[data-panel]"));
const sidebarTabButtons = Array.from(document.querySelectorAll(".s-tab[data-sidebar-panel]"));
const sidebarPanels = Array.from(document.querySelectorAll(".sidebar-panel[data-sidebar-panel]"));

let activeCourses = normalizeCourses(DEFAULT_VIDEO_COURSES, DEFAULT_VIDEO_COURSES);
let currentProfile = JSON.parse(JSON.stringify(DEFAULT_STUDENT_PROFILE));
let currentUser = null;
let selectedCourseId = new URLSearchParams(window.location.search).get("courseId") || "";
let selectedSectionId = new URLSearchParams(window.location.search).get("sectionId") || "";
let selectedContentId = new URLSearchParams(window.location.search).get("contentId") || "";
let activePanel = "overview";
let activeSidebarPanel = "content";
let watcherAttached = false;
let courseRenderFrame = null;

const collapsedSectionIds = new Set();

function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
}

function formatSubmittedLabel(dateValue = "") {
    const timestamp = new Date(dateValue || 0).getTime();
    if (!Number.isFinite(timestamp)) return "recently";

    return new Date(timestamp).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function getSavedAssignmentEntry(assignmentId = "") {
    return Array.isArray(currentProfile.assignments)
        ? currentProfile.assignments.find((assignment) => (assignment.id || assignment.title) === assignmentId) || null
        : null;
}

function setAssignmentSubmissionFeedback(message = "", tone = "") {
    if (!assignmentSubmissionFeedbackEl) return;
    assignmentSubmissionFeedbackEl.textContent = message;
    assignmentSubmissionFeedbackEl.dataset.state = tone || "";
}

function getSelectedCourse() {
    return activeCourses.find((course) => course.id === selectedCourseId) || activeCourses[0] || null;
}

function syncSelection(course) {
    if (!course) return;

    const firstSelection = getFirstCourseContent(course);
    if (!selectedSectionId || !findCourseContent(course, selectedSectionId, selectedContentId).section) {
        selectedSectionId = firstSelection.section?.id || "";
    }

    const selectedResult = findCourseContent(course, selectedSectionId, selectedContentId);
    if (!selectedResult.section) {
        selectedSectionId = firstSelection.section?.id || "";
        selectedContentId = firstSelection.lesson?.id || "";
        return;
    }

    if (!selectedResult.lesson) {
        selectedContentId = selectedResult.section.lessons?.[0]?.id || firstSelection.lesson?.id || "";
    }
}

function setActivePanel(panelName) {
    activePanel = panelName;

    tabButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.panel === panelName);
    });

    tabPanels.forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.panel === panelName);
    });
}

function setActiveSidebarPanel(panelName = "content") {
    activeSidebarPanel = panelName;

    sidebarTabButtons.forEach((button) => {
        const isActive = button.dataset.sidebarPanel === panelName;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    sidebarPanels.forEach((panel) => {
        const isActive = panel.dataset.sidebarPanel === panelName;
        panel.classList.toggle("active", isActive);
        panel.hidden = !isActive;
    });
}

function getCurrentSection(course) {
    const { section } = findCourseContent(course, selectedSectionId, selectedContentId);
    return section || getFirstCourseContent(course).section;
}

function getCurrentContent(course) {
    const selected = findCourseContent(course, selectedSectionId, selectedContentId);
    if (selected.section && selected.lesson) {
        return selected;
    }

    return getFirstCourseContent(course);
}

function updateUrl() {
    const params = new URLSearchParams(window.location.search);
    if (selectedCourseId) {
        params.set("courseId", selectedCourseId);
    }
    if (selectedSectionId) {
        params.set("sectionId", selectedSectionId);
    } else {
        params.delete("sectionId");
    }
    if (selectedContentId) {
        params.set("contentId", selectedContentId);
    } else {
        params.delete("contentId");
    }

    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
}

function renderAiSummaryPanel(course, content) {
    if (!courseAiSummaryTextEl || !courseAiKeyPointsEl || !courseAiLessonTitleEl) return;

    const section = getCurrentSection(course);
    const aiPack = buildLessonAiPack(course, section, content);

    if (courseAiLessonTitleEl) {
        courseAiLessonTitleEl.textContent = content?.title || course.title || "Lesson summary";
    }

    if (courseAiSourceBadgeEl) {
        courseAiSourceBadgeEl.textContent = aiPack.source === "teacher" ? "Teacher curated" : "HackLab AI";
    }

    courseAiSummaryTextEl.textContent = aiPack.summary;
    courseAiKeyPointsEl.innerHTML = aiPack.keyPoints.length
        ? aiPack.keyPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("")
        : "<li>No key points available for this item yet.</li>";

    if (courseAiActionsEl) {
        if (isAssignmentContent(content)) {
            courseAiActionsEl.innerHTML = `
                <button type="button" class="ai-summary-action-btn" data-action="focus-assignment">
                    Open assignment workspace
                </button>
            `;
        } else {
            courseAiActionsEl.innerHTML = `
                <button type="button" class="ai-summary-action-btn" data-action="focus-video">
                    Jump to video player
                </button>
            `;
        }
    }
}

function renderAssignmentStage(course, content, assignmentEntry = null) {
    if (!assignmentStageEl || !assignmentTitleEl || !assignmentSummaryEl || !assignmentMetaEl || !assignmentInstructionsEl) {
        return;
    }

    assignmentStageEl.hidden = false;
    if (playerFrameEl) {
        playerFrameEl.hidden = true;
    }

    const reviewStatus = String(assignmentEntry?.reviewStatus || "").toLowerCase();
    const isVerified = reviewStatus === "verified" || Boolean(assignmentEntry?.verifiedByTeacher) || assignmentEntry?.status === "completed";
    const hasSubmission = Boolean(String(assignmentEntry?.submissionUrl || "").trim());

    if (assignmentTagEl) {
        assignmentTagEl.textContent = content.tag || "Course Assignment";
    }

    assignmentTitleEl.textContent = content.title || course.title || "Assignment";
    assignmentSummaryEl.textContent = content.summary || "Review the assignment brief and finish the task before marking it complete.";

    const meta = [];
    if (content.dueDate) {
        meta.push(`<span class="assignment-stage-chip">Due ${escapeHtml(content.dueDate)}</span>`);
    }
    if (content.points) {
        meta.push(`<span class="assignment-stage-chip">Max ${escapeHtml(String(content.points))} pts</span>`);
    }
    meta.push(`<span class="assignment-stage-chip">${escapeHtml(isVerified ? "Verified by teacher" : hasSubmission ? "Submitted for review" : "Waiting for submission")}</span>`);
    if (assignmentEntry?.awardedPoints) {
        meta.push(`<span class="assignment-stage-chip">${escapeHtml(String(assignmentEntry.awardedPoints))} pts awarded</span>`);
    }
    assignmentMetaEl.innerHTML = meta.join("");

    const instructions = Array.isArray(content.instructions) && content.instructions.length
        ? content.instructions
        : ["Open the brief, finish the task, and submit your assignment link for teacher review."];

    assignmentInstructionsEl.innerHTML = instructions
        .map((instruction) => `<li>${escapeHtml(instruction)}</li>`)
        .join("");

    if (assignmentReviewNoteEl) {
        const reviewNote = isVerified
            ? (assignmentEntry?.teacherFeedback
                ? `Verified by your teacher. Note: ${assignmentEntry.teacherFeedback}`
                : "Verified by your teacher. This assignment now counts as completed on your dashboard.")
            : hasSubmission
                ? `Submitted on ${formatSubmittedLabel(assignmentEntry?.submittedAt)}. It is now waiting in the teacher dashboard for review.`
                : "";

        assignmentReviewNoteEl.hidden = !reviewNote;
        assignmentReviewNoteEl.textContent = reviewNote;
    }

    if (assignmentSubmissionUrlEl) {
        assignmentSubmissionUrlEl.value = assignmentEntry?.submissionUrl || "";
        assignmentSubmissionUrlEl.disabled = isVerified;
    }

    if (assignmentSubmissionNoteEl) {
        assignmentSubmissionNoteEl.textContent = isVerified
            ? "This assignment is verified. Your submitted link is now locked on the student side."
            : hasSubmission
                ? "Your link is already visible in the teacher dashboard. You can still update it until the teacher verifies it."
                : "Paste your Drive, GitHub, Figma, Netlify, or project link here and submit it for teacher review.";
    }

    if (assignmentSubmitBtnEl) {
        assignmentSubmitBtnEl.disabled = isVerified;
        assignmentSubmitBtnEl.textContent = isVerified
            ? "Verified"
            : (hasSubmission ? "Update Submission" : "Submit for Review");
    }
}

function renderVideoStage(course, content) {
    if (assignmentStageEl) {
        assignmentStageEl.hidden = true;
    }
    if (playerFrameEl) {
        playerFrameEl.hidden = false;
        playerFrameEl.src = normalizeEmbedUrl(content?.videoUrl || course.playerEmbedUrl || DEFAULT_COURSE_EMBED_URL);
    }
}

function renderCoursePanels(course, content) {
    if (pageAccentEl) pageAccentEl.textContent = course.title;
    if (courseInfoTitleEl) courseInfoTitleEl.textContent = course.title;
    if (courseInfoAuthorsEl) courseInfoAuthorsEl.textContent = course.authorsLine;
    if (courseInfoDescriptionEl) {
        courseInfoDescriptionEl.innerHTML = course.overviewParagraphs
            .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
            .join("");
    }

    if (sessionNotesListEl) {
        sessionNotesListEl.innerHTML = course.sessionNotes.length
            ? course.sessionNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")
            : "<li>No session notes have been added for this course yet.</li>";
    }

    if (qaPlaceholderEl) {
        qaPlaceholderEl.textContent = `Ask about ${course.title} in the community page if you want help with the current lesson or assignment.`;
    }

    if (reviewsPlaceholderEl) {
        const itemCount = course.sections.reduce((count, section) => count + section.lessons.length, 0);
        reviewsPlaceholderEl.textContent = `${course.sections.length} section${course.sections.length === 1 ? "" : "s"} and ${itemCount} content item${itemCount === 1 ? "" : "s"} are live in this playlist.`;
    }

    const assignmentEntry = isAssignmentContent(content) ? getSavedAssignmentEntry(content?.id) : null;
    const isCompleted = isCourseContentCompleted(currentProfile, course.id, content?.id) || Boolean(content?.completed);

    if (lessonTitleEl) {
        lessonTitleEl.textContent = content?.title || course.title;
    }

    if (lessonDurationEl) {
        lessonDurationEl.textContent = isAssignmentContent(content)
            ? (content?.dueDate ? `Due ${content.dueDate}` : "Assignment")
            : (content?.duration || course.lessonCount || "New course");
    }

    if (completeBtnEl) {
        if (isAssignmentContent(content)) {
            completeBtnEl.hidden = false;
            const assignmentEntry = getSavedAssignmentEntry(content?.id);
            const isSubmitted = Boolean(String(assignmentEntry?.submissionUrl || "").trim());
            completeBtnEl.textContent = isSubmitted ? "Update submission" : "Focus submission";
            completeBtnEl.dataset.mode = "assignment";
        } else {
            completeBtnEl.hidden = false;
            completeBtnEl.dataset.mode = "video";
            completeBtnEl.textContent = isCompleted ? "Mark Incomplete" : "Mark Complete";
        }
    }

    setAssignmentSubmissionFeedback("", "");

    if (isAssignmentContent(content)) {
        renderAssignmentStage(course, content, assignmentEntry);
    } else {
        renderVideoStage(course, content);
    }

    renderAiSummaryPanel(course, content);
}

function renderSections(course) {
    if (!courseSectionsListEl) return;

    courseSectionsListEl.innerHTML = course.sections.map((section) => {
        const isCollapsed = collapsedSectionIds.has(section.id);
        const lessonsMarkup = section.lessons.length
            ? section.lessons.map((content) => {
                const isActive = section.id === selectedSectionId && content.id === selectedContentId;
                const isCompleted = isCourseContentCompleted(currentProfile, course.id, content.id) || Boolean(content.completed);
                const isAssignment = isAssignmentContent(content);
                const pillClass = isCompleted ? "completed" : (isAssignment ? "assignment" : "");
                const pillLabel = isCompleted ? "Done" : (isAssignment ? "Task" : "Play");
                const metaText = isAssignment
                    ? (content.dueDate ? `Due ${content.dueDate}` : "Open assignment brief")
                    : content.duration;

                return `
                    <button
                        type="button"
                        class="content-item content-item-button ${isActive ? "active" : ""} ${isAssignment ? "assignment-item" : ""}"
                        data-action="select-content"
                        data-section-id="${escapeHtml(section.id)}"
                        data-content-id="${escapeHtml(content.id)}"
                    >
                        <span class="lesson-status-pill ${pillClass}">${escapeHtml(pillLabel)}</span>
                        <div class="item-details">
                            <h4>${escapeHtml(content.title)}</h4>
                            <span class="item-time">${escapeHtml(metaText || "Open content")}</span>
                        </div>
                    </button>
                `;
            }).join("")
            : `<div class="content-empty">This section does not have any videos or assignments yet.</div>`;

        return `
            <div class="section-group" data-section-id="${escapeHtml(section.id)}">
                <button type="button" class="section-header ${isCollapsed ? "collapsed" : ""}" data-action="toggle-section" data-section-id="${escapeHtml(section.id)}">
                    <div class="sh-info">
                        <h3>${escapeHtml(section.title)}</h3>
                        <span>${escapeHtml(section.meta)}</span>
                    </div>
                    <div class="sh-icon">${isCollapsed ? "+" : "-"}</div>
                </button>
                <div class="section-items">
                    ${lessonsMarkup}
                </div>
            </div>
        `;
    }).join("");
}

function renderCourse() {
    if (courseRenderFrame) {
        return;
    }

    courseRenderFrame = window.requestAnimationFrame(() => {
        courseRenderFrame = null;

        const course = getSelectedCourse();
        if (!course) return;

        selectedCourseId = course.id;
        syncSelection(course);
        updateUrl();

        document.title = `${course.title} - HackLab`;

        const { lesson } = getCurrentContent(course);
        renderCoursePanels(course, lesson);
        renderSections(course);
        setActivePanel(activePanel);
        setActiveSidebarPanel(activeSidebarPanel);
    });
}

function syncProfileAssignmentState(profile, lesson, isComplete) {
    if (!isAssignmentContent(lesson)) {
        return cloneData(profile);
    }

    const nextProfile = cloneData(profile);
    const nextAssignments = Array.isArray(nextProfile.assignments) ? [...nextProfile.assignments] : [];
    const assignmentIndex = nextAssignments.findIndex((assignment) => (assignment.id || assignment.title) === lesson.id);
    const nextAssignment = {
        ...(assignmentIndex >= 0 ? nextAssignments[assignmentIndex] : {}),
        id: lesson.id,
        title: lesson.title || "Course assignment",
        status: isComplete ? "completed" : "in-progress",
        source: "course-assignment"
    };

    if (assignmentIndex >= 0) {
        nextAssignments[assignmentIndex] = nextAssignment;
    } else {
        nextAssignments.push(nextAssignment);
    }

    nextProfile.assignments = nextAssignments;
    return nextProfile;
}

async function persistProfile(nextProfile) {
    if (!currentUser) return;

    const profileWithStats = syncProfileCourseStats({
        ...nextProfile,
        displayName: (currentProfile.displayName && currentProfile.displayName !== "HackLab Student") ? currentProfile.displayName : getDisplayName(currentUser, "Student"),
        email: currentProfile.email || currentUser.email || ""
    }, activeCourses);

    currentProfile = cloneData(profileWithStats);
    await saveStudentProfile(currentUser.uid, currentProfile);
}

async function handleCompleteToggle() {
    const course = getSelectedCourse();
    const { lesson } = getCurrentContent(course);
    if (!course || !lesson || !currentUser) return;

    if (isAssignmentContent(lesson)) {
        setActiveSidebarPanel("content");
        assignmentStageEl?.scrollIntoView({ behavior: "smooth", block: "center" });
        assignmentSubmissionUrlEl?.focus();
        return;
    }

    const isCompleted = isCourseContentCompleted(currentProfile, course.id, lesson.id) || Boolean(lesson.completed);
    const nextProfile = syncProfileAssignmentState(
        setCourseContentCompletion(currentProfile, course.id, lesson, !isCompleted),
        lesson,
        !isCompleted
    );

    try {
        completeBtnEl && (completeBtnEl.disabled = true);
        await persistProfile(nextProfile);
        renderCourse();
    } catch (error) {
        console.error("Unable to update course progress:", error);
    } finally {
        completeBtnEl && (completeBtnEl.disabled = false);
    }
}

async function handleAssignmentSubmission() {
    const course = getSelectedCourse();
    const { lesson } = getCurrentContent(course);
    if (!course || !lesson || !currentUser || !isAssignmentContent(lesson)) return;

    const existingAssignment = getSavedAssignmentEntry(lesson.id) || {};
    const isVerified = String(existingAssignment.reviewStatus || "").toLowerCase() === "verified"
        || Boolean(existingAssignment.verifiedByTeacher)
        || existingAssignment.status === "completed";
    if (isVerified) return;

    const submissionUrl = String(assignmentSubmissionUrlEl?.value || "").trim();
    if (!/^https?:\/\/\S+/i.test(submissionUrl)) {
        setAssignmentSubmissionFeedback("Add a valid http(s) link before sending it for review.", "error");
        assignmentSubmissionUrlEl?.focus();
        return;
    }

    const nextProfile = cloneData(currentProfile);
    const nextAssignments = Array.isArray(nextProfile.assignments) ? [...nextProfile.assignments] : [];
    const assignmentIndex = nextAssignments.findIndex((assignment) => (assignment.id || assignment.title) === lesson.id);
    const nextAssignment = {
        ...(assignmentIndex >= 0 ? nextAssignments[assignmentIndex] : {}),
        id: lesson.id,
        title: lesson.title || "Course assignment",
        source: "course-assignment",
        courseId: course.id,
        courseTitle: course.title || "",
        sectionId: selectedSectionId,
        tag: lesson.tag || "",
        points: lesson.points || "",
        status: "submitted",
        reviewStatus: "submitted",
        submissionUrl,
        submittedAt: new Date().toISOString(),
        reviewedAt: "",
        verifiedByTeacher: false,
        awardedPoints: 0,
        teacherFeedback: ""
    };

    if (assignmentIndex >= 0) {
        nextAssignments[assignmentIndex] = nextAssignment;
    } else {
        nextAssignments.push(nextAssignment);
    }

    nextProfile.assignments = nextAssignments;

    try {
        if (assignmentSubmitBtnEl) assignmentSubmitBtnEl.disabled = true;
        await persistProfile(nextProfile);
        renderCourse();
        setAssignmentSubmissionFeedback("Assignment link sent to the teacher dashboard for review.", "success");
    } catch (error) {
        console.error("Unable to submit assignment link:", error);
        setAssignmentSubmissionFeedback("Unable to send the assignment link right now.", "error");
    } finally {
        if (assignmentSubmitBtnEl && !getSavedAssignmentEntry(lesson.id)?.verifiedByTeacher) {
            assignmentSubmitBtnEl.disabled = false;
        }
    }
}

tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
        setActivePanel(button.dataset.panel || "overview");
    });
});

sidebarTabButtons.forEach((button) => {
    button.addEventListener("click", () => {
        setActiveSidebarPanel(button.dataset.sidebarPanel || "content");
        if (button.dataset.sidebarPanel === "ai") {
            const course = getSelectedCourse();
            const { lesson } = getCurrentContent(course);
            renderAiSummaryPanel(course, lesson);
        }
    });
});

courseAiRefreshBtnEl?.addEventListener("click", () => {
    const course = getSelectedCourse();
    const { lesson } = getCurrentContent(course);
    renderAiSummaryPanel(course, lesson);
});

courseAiPanelEl?.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!action) return;

    if (action === "focus-assignment") {
        setActiveSidebarPanel("content");
        assignmentStageEl?.scrollIntoView({ behavior: "smooth", block: "center" });
        assignmentSubmissionUrlEl?.focus();
        return;
    }

    if (action === "focus-video") {
        setActiveSidebarPanel("content");
        playerFrameEl?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
});

courseSectionsListEl?.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;

    const action = actionTarget.dataset.action;
    const sectionId = actionTarget.dataset.sectionId || "";
    const contentId = actionTarget.dataset.contentId || "";

    if (action === "toggle-section") {
        if (collapsedSectionIds.has(sectionId)) {
            collapsedSectionIds.delete(sectionId);
        } else {
            collapsedSectionIds.add(sectionId);
        }
        renderCourse();
        return;
    }

    if (action === "select-content") {
        selectedSectionId = sectionId;
        selectedContentId = contentId;
        setActiveSidebarPanel("content");
        renderCourse();
    }
});

completeBtnEl?.addEventListener("click", handleCompleteToggle);
assignmentSubmitBtnEl?.addEventListener("click", handleAssignmentSubmission);

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

    currentUser = user;
    currentProfile = syncProfileCourseStats(await loadStudentProfile(user.uid, {
        ...DEFAULT_STUDENT_PROFILE,
        displayName: getDisplayName(user, "Student"),
        email: user.email || ""
    }), activeCourses);
    renderCourse();

    if (!watcherAttached) {
        watcherAttached = true;
        watchContent(CONTENT_PATHS.videoCourses, DEFAULT_VIDEO_COURSES, (courses) => {
            activeCourses = normalizeCourses(courses, DEFAULT_VIDEO_COURSES);
            currentProfile = syncProfileCourseStats(currentProfile, activeCourses);
            renderCourse();
        });
    }
});
