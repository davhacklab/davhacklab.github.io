import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    CONTENT_PATHS,
    DEFAULT_VIDEO_COURSES,
    auth,
    getDisplayName,
    saveContent,
    slugify,
    watchContent
} from "./portal-data.js";
import {
    DEFAULT_COURSE_EMBED_URL,
    findCourseContent,
    findCourseSection,
    getFirstCourseContent,
    isAssignmentContent,
    normalizeCourses,
    normalizeEmbedUrl
} from "./course-content.js";
import { guardTeacherPortal } from "./account-access.js";

const pageAccentEl = document.getElementById("teacherCoursePageAccent");
const subtitleEl = document.getElementById("teacherCourseSubtitle");
const playerFrameEl = document.getElementById("teacherCoursePlayerFrame");
const assignmentStageEl = document.getElementById("teacherAssignmentStage");
const assignmentTagPreviewEl = document.getElementById("teacherAssignmentTag");
const assignmentTitlePreviewEl = document.getElementById("teacherAssignmentTitle");
const assignmentSummaryPreviewEl = document.getElementById("teacherAssignmentSummary");
const assignmentMetaPreviewEl = document.getElementById("teacherAssignmentMeta");
const assignmentInstructionsPreviewEl = document.getElementById("teacherAssignmentInstructions");
const selectedLessonHeadingEl = document.getElementById("teacherSelectedLessonHeading");
const selectedLessonDurationEl = document.getElementById("teacherSelectedLessonDuration");
const sidebarStudentViewLinkEl = document.getElementById("teacherSidebarStudentViewLink");
const studentViewBtnEl = document.getElementById("teacherOpenStudentViewBtn");

const overviewFormEl = document.getElementById("teacherCourseOverviewForm");
const courseTitleEl = document.getElementById("teacherCourseTitle");
const courseAuthorsEl = document.getElementById("teacherCourseAuthors");
const coursePlaylistLabelEl = document.getElementById("teacherCoursePlaylistLabel");
const courseLessonCountEl = document.getElementById("teacherCourseLessonCount");
const courseAccessLabelEl = document.getElementById("teacherCourseAccessLabel");
const courseCtaLabelEl = document.getElementById("teacherCourseCtaLabel");
const coursePlayerEmbedUrlEl = document.getElementById("teacherCoursePlayerEmbedUrl");
const courseImageEl = document.getElementById("teacherCourseImage");
const courseDescriptionEl = document.getElementById("teacherCourseDescription");
const courseOverviewTextEl = document.getElementById("teacherCourseOverviewText");
const courseOverviewStatusEl = document.getElementById("teacherCourseOverviewStatus");

const lessonFormEl = document.getElementById("teacherLessonForm");
const lessonHeadingEl = document.getElementById("teacherSelectedLessonTitle");
const lessonSectionEl = document.getElementById("teacherSelectedLessonSection");
const contentTypeEl = document.getElementById("teacherContentType");
const lessonTitleEl = document.getElementById("teacherLessonTitle");
const lessonDurationInputEl = document.getElementById("teacherLessonDurationInput");
const lessonVideoUrlEl = document.getElementById("teacherLessonVideoUrl");
const lessonCompletedEl = document.getElementById("teacherLessonCompleted");
const videoFieldsEl = document.getElementById("teacherVideoFields");
const assignmentFieldsEl = document.getElementById("teacherAssignmentFields");
const assignmentTagInputEl = document.getElementById("teacherAssignmentTagInput");
const assignmentDueDateInputEl = document.getElementById("teacherAssignmentDueDateInput");
const assignmentPointsInputEl = document.getElementById("teacherAssignmentPointsInput");
const assignmentCtaInputEl = document.getElementById("teacherAssignmentCtaInput");
const assignmentSummaryInputEl = document.getElementById("teacherAssignmentSummaryInput");
const assignmentInstructionsInputEl = document.getElementById("teacherAssignmentInstructionsInput");
const lessonStatusEl = document.getElementById("teacherLessonStatus");
const lessonCancelBtn = document.getElementById("teacherLessonCancelBtn");
const lessonDeleteBtn = document.getElementById("teacherLessonDeleteBtn");
const lessonSaveBtn = document.getElementById("teacherLessonSaveBtn");

const notesFormEl = document.getElementById("teacherSessionNotesForm");
const sessionNotesTextEl = document.getElementById("teacherSessionNotesText");
const sessionNotesStatusEl = document.getElementById("teacherSessionNotesStatus");

const addSectionBtn = document.getElementById("teacherAddSectionBtn");
const sectionFormEl = document.getElementById("teacherSectionForm");
const sectionTitleEl = document.getElementById("teacherSectionTitle");
const sectionMetaEl = document.getElementById("teacherSectionMeta");
const sectionCancelBtn = document.getElementById("teacherSectionCancelBtn");
const sectionSaveBtn = document.getElementById("teacherSectionSaveBtn");
const sectionsListEl = document.getElementById("teacherCourseSectionsList");

const tabButtons = Array.from(document.querySelectorAll(".tab[data-panel]"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel[data-panel]"));
const pageParams = new URLSearchParams(window.location.search);
const requestedPanel = pageParams.get("panel") || "";
const requestedDraftType = pageParams.get("draft") || "";

let activeCourses = normalizeCourses(DEFAULT_VIDEO_COURSES, DEFAULT_VIDEO_COURSES);
let selectedCourseId = pageParams.get("courseId") || "";
let selectedSectionId = pageParams.get("sectionId") || "";
let selectedContentId = pageParams.get("contentId") || "";
let activePanel = ["overview", "lesson", "notes"].includes(requestedPanel) ? requestedPanel : "overview";
let teacherName = "HackLab Teacher";
let watcherAttached = false;
let sectionEditorMode = "add";
let editingSectionId = "";
let contentEditorMode = ["video", "assignment"].includes(requestedDraftType) ? "add" : "edit";
let draftContentType = requestedDraftType === "assignment" ? "assignment" : "video";

const collapsedSectionIds = new Set();

function makeId(prefix, value) {
    return `${prefix}-${slugify(value)}-${Date.now().toString(36).slice(-5)}`;
}

function parseMultilineText(value) {
    return String(value || "")
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function setStatus(element, message, isError = false) {
    if (!element) return;
    element.textContent = message || "";
    element.dataset.state = isError ? "error" : "success";
}

function clearStatus(element) {
    if (!element) return;
    element.textContent = "";
    delete element.dataset.state;
}

function getSelectedCourse() {
    return activeCourses.find((course) => course.id === selectedCourseId) || activeCourses[0] || null;
}

function syncSelection(course) {
    if (!course) return;

    const firstSelection = getFirstCourseContent(course);

    if (!selectedSectionId || !findCourseSection(course, selectedSectionId)) {
        selectedSectionId = firstSelection.section?.id || "";
    }

    const selectedSection = findCourseSection(course, selectedSectionId);
    if (!selectedSection) {
        selectedContentId = "";
        contentEditorMode = "edit";
        return;
    }

    const contentIds = Array.isArray(selectedSection.lessons)
        ? selectedSection.lessons.map((item) => item.id)
        : [];

    if (contentEditorMode === "edit" && (!selectedContentId || !contentIds.includes(selectedContentId))) {
        selectedContentId = selectedSection.lessons[0]?.id || "";
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

    updateUrl();
}

function updateUrl() {
    const params = new URLSearchParams();
    if (selectedCourseId) params.set("courseId", selectedCourseId);
    if (selectedSectionId) params.set("sectionId", selectedSectionId);
    if (selectedContentId) params.set("contentId", selectedContentId);
    if (activePanel && activePanel !== "overview") params.set("panel", activePanel);
    if (contentEditorMode === "add") params.set("draft", draftContentType || "video");

    window.history.replaceState({}, "", `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`);
}

function getContentEditorState(course) {
    const fallbackSelection = getFirstCourseContent(course);
    const selectedSection = findCourseSection(course, selectedSectionId) || fallbackSelection.section;

    if (!selectedSection) {
        return { section: null, content: null, isDraft: contentEditorMode === "add" };
    }

    if (contentEditorMode === "add") {
        const isAssignment = draftContentType === "assignment";
        return {
            section: selectedSection,
            content: {
                id: "",
                type: draftContentType,
                title: "",
                duration: isAssignment ? "Assignment" : "19 min",
                completed: false,
                videoUrl: course.playerEmbedUrl || DEFAULT_COURSE_EMBED_URL,
                summary: "",
                instructions: [],
                tag: isAssignment ? "Checkpoint" : "",
                dueDate: "",
                points: "",
                ctaLabel: isAssignment ? "Submit assignment" : "Play lesson"
            },
            isDraft: true
        };
    }

    const result = findCourseContent(course, selectedSection.id, selectedContentId);
    return {
        section: result.section || selectedSection,
        content: result.lesson || selectedSection.lessons[0] || null,
        isDraft: false
    };
}

function closeSectionEditor() {
    sectionEditorMode = "add";
    editingSectionId = "";
    sectionFormEl?.reset();
    if (sectionFormEl) sectionFormEl.hidden = true;
    if (sectionSaveBtn) sectionSaveBtn.textContent = "Save Section";
}

function openSectionEditor(section = null) {
    sectionEditorMode = section ? "edit" : "add";
    editingSectionId = section?.id || "";
    if (sectionTitleEl) sectionTitleEl.value = section?.title || "";
    if (sectionMetaEl) sectionMetaEl.value = section?.meta || "";
    if (sectionFormEl) sectionFormEl.hidden = false;
    if (sectionSaveBtn) sectionSaveBtn.textContent = section ? "Save Section" : "Add Section";
    sectionTitleEl?.focus();
}

function updateStudentViewLinks(course) {
    const params = new URLSearchParams();
    if (course?.id) params.set("courseId", course.id);
    if (selectedSectionId) params.set("sectionId", selectedSectionId);
    if (selectedContentId) params.set("contentId", selectedContentId);
    const href = `course-player.html${params.toString() ? `?${params.toString()}` : ""}`;

    if (sidebarStudentViewLinkEl) sidebarStudentViewLinkEl.href = href;
    if (studentViewBtnEl) studentViewBtnEl.href = href;
}

function renderOverviewForm(course) {
    if (courseTitleEl) courseTitleEl.value = course.title || "";
    if (courseAuthorsEl) courseAuthorsEl.value = course.authorsLine || "";
    if (coursePlaylistLabelEl) coursePlaylistLabelEl.value = course.playlistLabel || "";
    if (courseLessonCountEl) courseLessonCountEl.value = course.lessonCount || "";
    if (courseAccessLabelEl) courseAccessLabelEl.value = course.accessLabel || "FREE";
    if (courseCtaLabelEl) courseCtaLabelEl.value = course.ctaLabel || "Enroll for free";
    if (coursePlayerEmbedUrlEl) coursePlayerEmbedUrlEl.value = course.playerEmbedUrl || DEFAULT_COURSE_EMBED_URL;
    if (courseImageEl) courseImageEl.value = course.imageUrl || "images/session.png";
    if (courseDescriptionEl) courseDescriptionEl.value = course.description || "";
    if (courseOverviewTextEl) {
        courseOverviewTextEl.value = Array.isArray(course.overviewParagraphs)
            ? course.overviewParagraphs.join("\n")
            : "";
    }
}

function renderNotesForm(course) {
    if (sessionNotesTextEl) {
        sessionNotesTextEl.value = Array.isArray(course.sessionNotes)
            ? course.sessionNotes.join("\n")
            : "";
    }
}

function setContentFieldVisibility(type = "video") {
    if (videoFieldsEl) videoFieldsEl.hidden = type !== "video";
    if (assignmentFieldsEl) assignmentFieldsEl.hidden = type !== "assignment";
}

function renderAssignmentPreview(content = {}, isDraft = false) {
    if (!assignmentStageEl || !assignmentTitlePreviewEl || !assignmentSummaryPreviewEl || !assignmentMetaPreviewEl || !assignmentInstructionsPreviewEl) {
        return;
    }

    assignmentStageEl.hidden = false;
    if (playerFrameEl) playerFrameEl.hidden = true;
    if (assignmentTagPreviewEl) assignmentTagPreviewEl.textContent = content.tag || "Course Assignment";

    assignmentTitlePreviewEl.textContent = content.title || (isDraft ? "New assignment draft" : "Assignment");
    assignmentSummaryPreviewEl.textContent = content.summary || "Write a clearer assignment summary so students immediately understand what to submit.";

    const meta = [];
    if (content.dueDate) meta.push(`<span class="assignment-stage-chip">Due ${content.dueDate}</span>`);
    if (content.points) meta.push(`<span class="assignment-stage-chip">${content.points} pts</span>`);
    meta.push(`<span class="assignment-stage-chip">${isDraft ? "Draft preview" : "Student view preview"}</span>`);
    assignmentMetaPreviewEl.innerHTML = meta.join("");

    const instructions = Array.isArray(content.instructions) && content.instructions.length
        ? content.instructions
        : ["Add one instruction per line so students get a clear step-by-step brief."];
    assignmentInstructionsPreviewEl.innerHTML = instructions.map((instruction) => `<li>${instruction}</li>`).join("");
}

function renderVideoPreview(course, content) {
    if (assignmentStageEl) assignmentStageEl.hidden = true;
    if (playerFrameEl) {
        playerFrameEl.hidden = false;
        playerFrameEl.src = normalizeEmbedUrl(content?.videoUrl || course.playerEmbedUrl || DEFAULT_COURSE_EMBED_URL);
    }
}

function renderContentEditor(course) {
    const { section, content, isDraft } = getContentEditorState(course);
    const type = content?.type || draftContentType || "video";
    const isAssignment = isAssignmentContent(content);

    if (lessonHeadingEl) {
        lessonHeadingEl.textContent = isDraft
            ? (isAssignment ? "Add a new assignment" : "Add a new video")
            : (content?.title || "Select content from the right side");
    }

    if (lessonSectionEl) lessonSectionEl.textContent = section?.title || "No section selected";
    if (selectedLessonHeadingEl) selectedLessonHeadingEl.textContent = content?.title || course.title || "Select or add content";
    if (selectedLessonDurationEl) {
        selectedLessonDurationEl.textContent = isAssignment
            ? (content?.dueDate ? `Due ${content.dueDate}` : "Assignment preview")
            : (content?.duration || "No video selected");
    }

    if (contentTypeEl) contentTypeEl.value = type;
    if (lessonTitleEl) lessonTitleEl.value = content?.title || "";
    if (lessonDurationInputEl) lessonDurationInputEl.value = content?.duration || (isAssignment ? "Assignment" : "19 min");
    if (lessonVideoUrlEl) lessonVideoUrlEl.value = content?.videoUrl || course.playerEmbedUrl || DEFAULT_COURSE_EMBED_URL;
    if (lessonCompletedEl) lessonCompletedEl.checked = Boolean(content?.completed);
    if (assignmentTagInputEl) assignmentTagInputEl.value = content?.tag || "";
    if (assignmentDueDateInputEl) assignmentDueDateInputEl.value = content?.dueDate || "";
    if (assignmentPointsInputEl) assignmentPointsInputEl.value = content?.points || "";
    if (assignmentCtaInputEl) assignmentCtaInputEl.value = content?.ctaLabel || (isAssignment ? "Submit assignment" : "Play lesson");
    if (assignmentSummaryInputEl) assignmentSummaryInputEl.value = content?.summary || "";
    if (assignmentInstructionsInputEl) {
        assignmentInstructionsInputEl.value = Array.isArray(content?.instructions) ? content.instructions.join("\n") : "";
    }

    setContentFieldVisibility(type);

    if (lessonDeleteBtn) {
        lessonDeleteBtn.disabled = isDraft || !content?.id;
        lessonDeleteBtn.style.opacity = lessonDeleteBtn.disabled ? "0.55" : "1";
    }

    if (lessonSaveBtn) {
        lessonSaveBtn.textContent = isDraft
            ? (isAssignment ? "Add Assignment" : "Add Video")
            : (isAssignment ? "Save Assignment" : "Save Video");
    }

    if (isAssignment) {
        renderAssignmentPreview(content, isDraft);
        return;
    }

    renderVideoPreview(course, content);
}

function renderSections(course) {
    if (!sectionsListEl) return;

    if (!course.sections.length) {
        sectionsListEl.innerHTML = `
            <div class="content-empty">
                Add your first section, then populate it with videos and assignments.
            </div>
        `;
        return;
    }

    sectionsListEl.innerHTML = course.sections.map((section) => {
        const isCollapsed = collapsedSectionIds.has(section.id);
        const lessonMarkup = Array.isArray(section.lessons) && section.lessons.length
            ? section.lessons.map((content) => {
                const isActive = contentEditorMode !== "add" && section.id === selectedSectionId && content.id === selectedContentId;
                const isAssignment = isAssignmentContent(content);
                const pillClass = content.completed ? "completed" : (isAssignment ? "assignment" : "");
                const pillLabel = content.completed ? "Done" : (isAssignment ? "Task" : "Play");
                const metaText = isAssignment ? (content.dueDate ? `Due ${content.dueDate}` : "Assignment brief") : (content.duration || "Video");

                return `
                    <button
                        type="button"
                        class="content-item content-item-button ${isActive ? "active" : ""} ${isAssignment ? "assignment-item" : ""}"
                        data-action="select-content"
                        data-section-id="${section.id}"
                        data-content-id="${content.id}"
                    >
                        <span class="lesson-status-pill ${pillClass}">${pillLabel}</span>
                        <div class="item-details">
                            <h4>${content.title}</h4>
                            <div class="item-meta-row">
                                <span class="item-time">${metaText}</span>
                                <span class="item-time">${isAssignment ? "Assignment" : "Video"}</span>
                            </div>
                        </div>
                    </button>
                `;
            }).join("")
            : `
                <div class="content-empty">
                    No content in this section yet. Use Add Video or Add Assignment to create the first one.
                </div>
            `;

        return `
            <div class="section-group" data-section-id="${section.id}">
                <button type="button" class="section-header ${isCollapsed ? "collapsed" : ""}" data-action="toggle-section" data-section-id="${section.id}">
                    <div class="section-header-content">
                        <div class="sh-info">
                            <h3>${section.title}</h3>
                            <span>${section.meta}</span>
                        </div>
                        <div class="section-header-actions">
                            <span class="section-tool-btn" data-action="add-video" data-section-id="${section.id}">Add Video</span>
                            <span class="section-tool-btn" data-action="add-assignment" data-section-id="${section.id}">Add Assignment</span>
                            <span class="section-tool-btn" data-action="edit-section" data-section-id="${section.id}">Edit</span>
                            <span class="section-tool-btn delete" data-action="delete-section" data-section-id="${section.id}">Delete</span>
                            <span class="section-tool-btn toggle" data-action="toggle-section" data-section-id="${section.id}">${isCollapsed ? "+" : "-"}</span>
                        </div>
                    </div>
                </button>
                <div class="section-items">
                    ${lessonMarkup}
                </div>
            </div>
        `;
    }).join("");
}

function renderCourse() {
    const course = getSelectedCourse();
    if (!course) return;

    selectedCourseId = course.id;
    syncSelection(course);
    updateUrl();
    updateStudentViewLinks(course);

    document.title = `${course.title} - Teacher Course Builder`;
    if (pageAccentEl) pageAccentEl.textContent = course.title;
    if (subtitleEl) {
        subtitleEl.textContent = `${teacherName}, edit the overview, notes, sections, videos, and assignment checkpoints for this course in one place.`;
    }

    renderOverviewForm(course);
    renderNotesForm(course);
    renderContentEditor(course);
    renderSections(course);
    setActivePanel(activePanel);
}

async function persistCourses(nextCourses, options = {}) {
    await saveContent(CONTENT_PATHS.videoCourses, nextCourses);

    if (typeof options.selectedSectionId !== "undefined") selectedSectionId = options.selectedSectionId;
    if (typeof options.selectedContentId !== "undefined") selectedContentId = options.selectedContentId;
    if (typeof options.contentEditorMode !== "undefined") contentEditorMode = options.contentEditorMode;
    if (typeof options.draftContentType !== "undefined") draftContentType = options.draftContentType;

    activeCourses = normalizeCourses(nextCourses, DEFAULT_VIDEO_COURSES);
    renderCourse();
}

tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
        setActivePanel(button.dataset.panel || "overview");
    });
});

overviewFormEl?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus(courseOverviewStatusEl);

    const course = getSelectedCourse();
    if (!course) return;

    const payload = {
        ...course,
        title: courseTitleEl?.value.trim() || "Untitled course",
        authorsLine: courseAuthorsEl?.value.trim() || "By HackLab Mentors",
        playlistLabel: coursePlaylistLabelEl?.value.trim() || "HackLab Playlist",
        lessonCount: courseLessonCountEl?.value.trim() || "New course",
        accessLabel: courseAccessLabelEl?.value.trim() || "FREE",
        ctaLabel: courseCtaLabelEl?.value.trim() || "Enroll for free",
        playerEmbedUrl: normalizeEmbedUrl(coursePlayerEmbedUrlEl?.value.trim() || course.playerEmbedUrl || DEFAULT_COURSE_EMBED_URL),
        imageUrl: courseImageEl?.value.trim() || "images/session.png",
        description: courseDescriptionEl?.value.trim() || "A teacher-curated video course will appear here.",
        overviewParagraphs: parseMultilineText(courseOverviewTextEl?.value || "")
    };

    const nextCourses = activeCourses.map((item) => item.id === course.id ? payload : item);

    try {
        await persistCourses(nextCourses);
        setStatus(courseOverviewStatusEl, "Overview saved for the student course player.");
    } catch (error) {
        console.error("Unable to save course overview:", error);
        setStatus(courseOverviewStatusEl, "Unable to save the overview right now.", true);
    }
});

notesFormEl?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus(sessionNotesStatusEl);

    const course = getSelectedCourse();
    if (!course) return;

    const nextCourses = activeCourses.map((item) => item.id === course.id
        ? { ...item, sessionNotes: parseMultilineText(sessionNotesTextEl?.value || "") }
        : item);

    try {
        await persistCourses(nextCourses);
        setStatus(sessionNotesStatusEl, "Session notes saved.");
    } catch (error) {
        console.error("Unable to save session notes:", error);
        setStatus(sessionNotesStatusEl, "Unable to save session notes right now.", true);
    }
});

contentTypeEl?.addEventListener("change", () => {
    draftContentType = contentTypeEl.value || "video";
    setContentFieldVisibility(draftContentType);
});

lessonCancelBtn?.addEventListener("click", () => {
    clearStatus(lessonStatusEl);
    contentEditorMode = "edit";

    const course = getSelectedCourse();
    const selectedSection = findCourseSection(course, selectedSectionId);
    if (selectedSection && Array.isArray(selectedSection.lessons) && selectedSection.lessons.length) {
        selectedContentId = selectedSection.lessons[0].id;
    }

    renderCourse();
});

lessonFormEl?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus(lessonStatusEl);

    const course = getSelectedCourse();
    const selectedSection = findCourseSection(course, selectedSectionId);
    const wasDraft = contentEditorMode === "add";

    if (!course || !selectedSection) {
        setStatus(lessonStatusEl, "Add or select a section before saving content.", true);
        return;
    }

    const type = contentTypeEl?.value || draftContentType || "video";
    const isAssignment = type === "assignment";
    const nextContent = {
        id: contentEditorMode === "add"
            ? makeId(isAssignment ? "assignment" : "lesson", lessonTitleEl?.value || "content")
            : (selectedContentId || makeId(isAssignment ? "assignment" : "lesson", lessonTitleEl?.value || "content")),
        type,
        title: lessonTitleEl?.value.trim() || (isAssignment ? "Untitled assignment" : "Untitled video"),
        duration: lessonDurationInputEl?.value.trim() || (isAssignment ? "Assignment" : "19 min"),
        completed: isAssignment ? false : Boolean(lessonCompletedEl?.checked),
        videoUrl: isAssignment ? "" : normalizeEmbedUrl(lessonVideoUrlEl?.value.trim() || course.playerEmbedUrl || DEFAULT_COURSE_EMBED_URL),
        tag: isAssignment ? (assignmentTagInputEl?.value.trim() || "Checkpoint") : "",
        dueDate: isAssignment ? (assignmentDueDateInputEl?.value.trim() || "") : "",
        points: isAssignment ? (assignmentPointsInputEl?.value.trim() || "") : "",
        ctaLabel: assignmentCtaInputEl?.value.trim() || (isAssignment ? "Submit assignment" : "Play lesson"),
        summary: isAssignment ? (assignmentSummaryInputEl?.value.trim() || "") : "",
        instructions: isAssignment ? parseMultilineText(assignmentInstructionsInputEl?.value || "") : []
    };

    const nextSections = course.sections.map((section) => {
        if (section.id !== selectedSection.id) return section;

        const nextLessons = contentEditorMode === "add"
            ? [...section.lessons, nextContent]
            : section.lessons.map((content) => content.id === selectedContentId ? nextContent : content);

        return {
            ...section,
            lessons: nextLessons,
            meta: `${nextLessons.length} item${nextLessons.length === 1 ? "" : "s"}`
        };
    });

    const nextCourses = activeCourses.map((item) => item.id === course.id ? { ...item, sections: nextSections } : item);

    try {
        await persistCourses(nextCourses, {
            selectedSectionId: selectedSection.id,
            selectedContentId: nextContent.id,
            contentEditorMode: "edit",
            draftContentType: type
        });
        setActivePanel("lesson");
        setStatus(lessonStatusEl, wasDraft ? `${isAssignment ? "Assignment" : "Video"} added to this section.` : `${isAssignment ? "Assignment" : "Video"} updated.`);
    } catch (error) {
        console.error("Unable to save content:", error);
        setStatus(lessonStatusEl, "Unable to save this content right now.", true);
    }
});

lessonDeleteBtn?.addEventListener("click", async () => {
    clearStatus(lessonStatusEl);

    const course = getSelectedCourse();
    const { section, content, isDraft } = getContentEditorState(course);
    if (!course || !section || !content || isDraft) return;

    if (!window.confirm(`Delete "${content.title}" from ${section.title}?`)) return;

    const nextSections = course.sections.map((item) => {
        if (item.id !== section.id) return item;

        const remainingContent = item.lessons.filter((currentContent) => currentContent.id !== content.id);
        return {
            ...item,
            lessons: remainingContent,
            meta: `${remainingContent.length} item${remainingContent.length === 1 ? "" : "s"}`
        };
    });

    const remainingSelectedSection = nextSections.find((item) => item.id === section.id) || nextSections[0] || null;
    const nextSelectedContent = remainingSelectedSection?.lessons?.[0]?.id || "";
    const nextCourses = activeCourses.map((item) => item.id === course.id ? { ...item, sections: nextSections } : item);

    try {
        await persistCourses(nextCourses, {
            selectedSectionId: remainingSelectedSection?.id || "",
            selectedContentId: nextSelectedContent,
            contentEditorMode: "edit"
        });
        setStatus(lessonStatusEl, "Content deleted.");
    } catch (error) {
        console.error("Unable to delete content:", error);
        setStatus(lessonStatusEl, "Unable to delete this content right now.", true);
    }
});

addSectionBtn?.addEventListener("click", () => openSectionEditor());
sectionCancelBtn?.addEventListener("click", () => closeSectionEditor());

sectionFormEl?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const course = getSelectedCourse();
    if (!course) return;
    const wasAddMode = sectionEditorMode === "add";

    const nextTitle = sectionTitleEl?.value.trim() || "";
    if (!nextTitle) {
        sectionTitleEl?.focus();
        return;
    }

    const nextMeta = sectionMetaEl?.value.trim() || "";
    let nextSectionId = editingSectionId;
    let nextSections;

    if (sectionEditorMode === "edit" && editingSectionId) {
        nextSections = course.sections.map((section) => section.id === editingSectionId
            ? { ...section, title: nextTitle, meta: nextMeta || `${section.lessons.length} item${section.lessons.length === 1 ? "" : "s"}` }
            : section);
    } else {
        nextSectionId = makeId("section", nextTitle);
        nextSections = [...course.sections, { id: nextSectionId, title: nextTitle, meta: nextMeta || "0 items", lessons: [] }];
        contentEditorMode = "add";
        draftContentType = "video";
        selectedContentId = "";
    }

    collapsedSectionIds.delete(nextSectionId);
    const nextCourses = activeCourses.map((item) => item.id === course.id ? { ...item, sections: nextSections } : item);

    try {
        await persistCourses(nextCourses, {
            selectedSectionId: nextSectionId,
            selectedContentId,
            contentEditorMode,
            draftContentType
        });
        closeSectionEditor();
        if (wasAddMode) setActivePanel("lesson");
    } catch (error) {
        console.error("Unable to save section:", error);
        window.alert("Unable to save this section right now.");
    }
});

sectionsListEl?.addEventListener("click", async (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;

    const action = actionTarget.dataset.action;
    const sectionId = actionTarget.dataset.sectionId || "";
    const contentId = actionTarget.dataset.contentId || "";
    const course = getSelectedCourse();
    if (!course) return;

    if (action === "toggle-section") {
        collapsedSectionIds.has(sectionId) ? collapsedSectionIds.delete(sectionId) : collapsedSectionIds.add(sectionId);
        renderCourse();
        return;
    }

    if (action === "edit-section") {
        const section = findCourseSection(course, sectionId);
        if (section) openSectionEditor(section);
        return;
    }

    if (action === "delete-section") {
        const section = findCourseSection(course, sectionId);
        if (!section) return;
        if (!window.confirm(`Delete "${section.title}" and all content inside it?`)) return;

        const nextSections = course.sections.filter((item) => item.id !== sectionId);
        const nextSelection = getFirstCourseContent({ ...course, sections: nextSections });
        const nextCourses = activeCourses.map((item) => item.id === course.id ? { ...item, sections: nextSections } : item);

        try {
            await persistCourses(nextCourses, {
                selectedSectionId: nextSelection.section?.id || "",
                selectedContentId: nextSelection.lesson?.id || "",
                contentEditorMode: "edit"
            });
            closeSectionEditor();
        } catch (error) {
            console.error("Unable to delete section:", error);
            window.alert("Unable to delete this section right now.");
        }
        return;
    }

    if (action === "add-video" || action === "add-assignment") {
        selectedSectionId = sectionId;
        selectedContentId = "";
        contentEditorMode = "add";
        draftContentType = action === "add-assignment" ? "assignment" : "video";
        clearStatus(lessonStatusEl);
        setActivePanel("lesson");
        renderCourse();
        return;
    }

    if (action === "select-content") {
        selectedSectionId = sectionId;
        selectedContentId = contentId;
        contentEditorMode = "edit";
        clearStatus(lessonStatusEl);
        setActivePanel("lesson");
        renderCourse();
    }
});

document.getElementById("logoutBtn")?.addEventListener("click", () => {
    signOut(auth).then(() => {
        window.location.href = "auth.html";
    }).catch((error) => {
        console.error("Logout Error:", error);
    });
});

onAuthStateChanged(auth, async (user) => {
    if (!(await guardTeacherPortal(user))) {
        return;
    }

    teacherName = getDisplayName(user, "HackLab Teacher");

    if (!watcherAttached) {
        watcherAttached = true;
        watchContent(CONTENT_PATHS.videoCourses, DEFAULT_VIDEO_COURSES, (courses) => {
            activeCourses = normalizeCourses(courses, DEFAULT_VIDEO_COURSES);
            renderCourse();
        });
    }
});
