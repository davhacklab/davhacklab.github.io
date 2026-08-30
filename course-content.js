export const DEFAULT_COURSE_EMBED_URL = "https://www.youtube.com/embed/ER9SspLe4Hg?si=psSOzWKeyWVhl3t9";

function normalizeTextLines(value, fallbackValue = []) {
    if (Array.isArray(value)) {
        return value
            .map((item) => String(item || "").trim())
            .filter(Boolean);
    }

    if (typeof value === "string") {
        return value
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean);
    }

    return Array.isArray(fallbackValue) ? [...fallbackValue] : [];
}

export function normalizeEmbedUrl(url) {
    const input = String(url || "").trim();
    if (!input) return DEFAULT_COURSE_EMBED_URL;

    if (/youtube\.com\/embed\//i.test(input) || /player\.vimeo\.com/i.test(input)) {
        return input;
    }

    const shortMatch = input.match(/youtu\.be\/([a-zA-Z0-9_-]+)/i);
    if (shortMatch) {
        return `https://www.youtube.com/embed/${shortMatch[1]}`;
    }

    const watchMatch = input.match(/[?&]v=([a-zA-Z0-9_-]+)/i);
    if (watchMatch) {
        return `https://www.youtube.com/embed/${watchMatch[1]}`;
    }

    return input;
}

export function isAssignmentContent(item = {}) {
    return String(item.type || "").trim().toLowerCase() === "assignment";
}

export function isVideoContent(item = {}) {
    return !isAssignmentContent(item);
}

export function normalizeCourseContentItem(item = {}, sectionIndex = 0, itemIndex = 0, fallbackPlayerUrl = DEFAULT_COURSE_EMBED_URL) {
    const type = isAssignmentContent(item) ? "assignment" : "video";
    const title = item.title || `${type === "assignment" ? "Assignment" : "Lesson"} ${itemIndex + 1}`;
    const duration = type === "assignment"
        ? (item.duration || item.assignmentLabel || "Assignment")
        : (item.duration || "19 min");

    return {
        id: item.id || `${type}-${sectionIndex + 1}-${itemIndex + 1}`,
        type,
        title,
        duration,
        completed: Boolean(item.completed),
        videoUrl: type === "assignment"
            ? ""
            : normalizeEmbedUrl(item.videoUrl || fallbackPlayerUrl),
        summary: item.summary || item.assignmentSummary || "",
        instructions: normalizeTextLines(item.instructions || item.assignmentInstructions),
        tag: item.tag || item.assignmentTag || "",
        dueDate: item.dueDate || item.assignmentDueDate || "",
        points: item.points || item.assignmentPoints || "",
        ctaLabel: item.ctaLabel || (type === "assignment" ? "Submit assignment" : "Play lesson"),
        aiSummary: String(item.aiSummary || "").trim(),
        aiKeyPoints: normalizeTextLines(item.aiKeyPoints)
    };
}

export function normalizeCourseSections(course = {}) {
    const fallbackPlayerUrl = normalizeEmbedUrl(course.playerEmbedUrl || DEFAULT_COURSE_EMBED_URL);

    if (!Array.isArray(course.sections) || !course.sections.length) {
        return [
            {
                id: "section-1",
                title: "Section 1: Course Overview",
                meta: course.lessonCount || "New course",
                lessons: [
                    normalizeCourseContentItem({
                        id: "lesson-1-1",
                        title: course.title || "Course introduction",
                        duration: "19 min",
                        completed: true,
                        videoUrl: fallbackPlayerUrl
                    }, 0, 0, fallbackPlayerUrl)
                ]
            }
        ];
    }

    return course.sections
        .filter(Boolean)
        .map((section, sectionIndex) => {
            const rawItems = Array.isArray(section.lessons) && section.lessons.length
                ? section.lessons
                : Array.isArray(section.items) && section.items.length
                    ? section.items
                    : [];
            const lessons = rawItems.map((item, itemIndex) => normalizeCourseContentItem(item, sectionIndex, itemIndex, fallbackPlayerUrl));
            const lessonCount = lessons.length;

            return {
                id: section.id || `section-${sectionIndex + 1}`,
                title: section.title || `Section ${sectionIndex + 1}`,
                meta: section.meta || `${lessonCount || 1} item${lessonCount === 1 ? "" : "s"}`,
                lessons
            };
        });
}

export function normalizeCourse(course = {}, index = 0) {
    const playerEmbedUrl = normalizeEmbedUrl(course.playerEmbedUrl || DEFAULT_COURSE_EMBED_URL);
    const description = course.description || "A teacher-curated video course will appear here.";

    return {
        id: course.id || `video-course-${index + 1}`,
        title: course.title || "Untitled course",
        playlistLabel: course.playlistLabel || "HackLab Playlist",
        lessonCount: course.lessonCount || "New course",
        accessLabel: course.accessLabel || "FREE",
        description,
        imageUrl: course.imageUrl || "images/session.png",
        mentorAvatars: Array.isArray(course.mentorAvatars) && course.mentorAvatars.length
            ? course.mentorAvatars
            : ["images/avi.png", "images/tejas.png"],
        ctaLabel: course.ctaLabel || "Enroll for free",
        courseUrl: course.courseUrl || "course-player.html",
        playerEmbedUrl,
        authorsLine: course.authorsLine || "By HackLab Mentors",
        overviewParagraphs: normalizeTextLines(course.overviewParagraphs, [description]),
        sessionNotes: normalizeTextLines(course.sessionNotes),
        sections: normalizeCourseSections({
            ...course,
            playerEmbedUrl
        })
    };
}

export function normalizeCourses(value, fallbackValue = []) {
    const source = Array.isArray(value) && value.length
        ? value
        : (Array.isArray(fallbackValue) ? fallbackValue : []);

    return source
        .filter(Boolean)
        .map((course, index) => normalizeCourse(course, index));
}

export function findCourseSection(course, sectionId) {
    return Array.isArray(course?.sections)
        ? course.sections.find((section) => section.id === sectionId) || null
        : null;
}

export function findCourseLesson(course, sectionId, lessonId) {
    const section = findCourseSection(course, sectionId);
    if (!section) return { section: null, lesson: null };

    const lesson = Array.isArray(section.lessons)
        ? section.lessons.find((item) => item.id === lessonId) || null
        : null;

    return { section, lesson };
}

export function findCourseContent(course, sectionId, contentId) {
    return findCourseLesson(course, sectionId, contentId);
}

export function getFirstCourseLesson(course) {
    const sections = Array.isArray(course?.sections) ? course.sections : [];

    for (const section of sections) {
        if (Array.isArray(section.lessons) && section.lessons.length) {
            return {
                section,
                lesson: section.lessons[0]
            };
        }
    }

    return {
        section: sections[0] || null,
        lesson: null
    };
}

export function getFirstCourseContent(course) {
    return getFirstCourseLesson(course);
}

export function getCourseItems(course = {}) {
    const sections = Array.isArray(course.sections) ? course.sections : [];
    return sections.flatMap((section) => {
        const items = Array.isArray(section.lessons) ? section.lessons : [];
        return items.map((item) => ({
            section,
            item
        }));
    });
}

export function getCourseProgressState(profile = {}, courseId = "") {
    if (!courseId) {
        return {
            completedContentIds: [],
            startedContentIds: [],
            submittedAssignmentIds: [],
            updatedAt: ""
        };
    }

    const courseProgress = profile?.courseProgress && typeof profile.courseProgress === "object"
        ? profile.courseProgress
        : {};
    const progress = courseProgress[courseId] && typeof courseProgress[courseId] === "object"
        ? courseProgress[courseId]
        : {};

    return {
        completedContentIds: Array.isArray(progress.completedContentIds) ? [...progress.completedContentIds] : [],
        startedContentIds: Array.isArray(progress.startedContentIds) ? [...progress.startedContentIds] : [],
        submittedAssignmentIds: Array.isArray(progress.submittedAssignmentIds) ? [...progress.submittedAssignmentIds] : [],
        updatedAt: progress.updatedAt || ""
    };
}

export function isCourseContentCompleted(profile = {}, courseId = "", contentId = "") {
    if (!courseId || !contentId) return false;
    const progress = getCourseProgressState(profile, courseId);
    return progress.completedContentIds.includes(contentId);
}

export function setCourseContentCompletion(profile = {}, courseId = "", item = {}, isComplete = true) {
    if (!courseId || !item?.id) {
        return JSON.parse(JSON.stringify(profile || {}));
    }

    const nextProfile = JSON.parse(JSON.stringify(profile || {}));
    nextProfile.courseProgress ||= {};

    const currentState = getCourseProgressState(nextProfile, courseId);
    const completedContentIds = new Set(currentState.completedContentIds);
    const startedContentIds = new Set(currentState.startedContentIds);
    const submittedAssignmentIds = new Set(currentState.submittedAssignmentIds);

    startedContentIds.add(item.id);

    if (isComplete) {
        completedContentIds.add(item.id);
        if (isAssignmentContent(item)) {
            submittedAssignmentIds.add(item.id);
        }
    } else {
        completedContentIds.delete(item.id);
        if (isAssignmentContent(item)) {
            submittedAssignmentIds.delete(item.id);
        }
    }

    nextProfile.courseProgress[courseId] = {
        completedContentIds: [...completedContentIds],
        startedContentIds: [...startedContentIds],
        submittedAssignmentIds: [...submittedAssignmentIds],
        updatedAt: new Date().toISOString()
    };

    return nextProfile;
}

export function getCourseCompletionPercent(course = {}, profile = {}) {
    const items = getCourseItems(course).map(({ item }) => item);
    if (!items.length) return 0;

    const completedCount = items.filter((item) => {
        if (isCourseContentCompleted(profile, course.id, item.id)) {
            return true;
        }

        return Boolean(item.completed);
    }).length;

    return Math.round((completedCount / items.length) * 100);
}

export function getCompletedCourseCount(courses = [], profile = {}) {
    return courses.filter((course) => getCourseCompletionPercent(course, profile) >= 100).length;
}

export function getCompletedCourseAssignmentCount(courses = [], profile = {}) {
    return courses.reduce((count, course) => {
        return count + getCourseItems(course)
            .map(({ item }) => item)
            .filter((item) => isAssignmentContent(item) && isCourseContentCompleted(profile, course.id, item.id))
            .length;
    }, 0);
}

export function buildCourseProgressEntries(courses = [], profile = {}) {
    return courses.map((course) => ({
        id: `progress-${course.id}`,
        courseId: course.id,
        title: course.title || "Untitled course",
        percent: getCourseCompletionPercent(course, profile)
    }));
}

export function getCourseAssignmentEntries(courses = [], profile = {}) {
    return courses.flatMap((course) => getCourseItems(course)
        .filter(({ item }) => isAssignmentContent(item))
        .map(({ section, item }) => ({
            id: item.id,
            type: "course-assignment",
            courseId: course.id,
            sectionId: section.id,
            title: item.title,
            summary: item.summary || "Open the assignment to review the task brief and instructions.",
            status: isCourseContentCompleted(profile, course.id, item.id)
                ? "completed"
                : "up-next",
            actionUrl: `course-player.html?courseId=${encodeURIComponent(course.id)}&sectionId=${encodeURIComponent(section.id)}&contentId=${encodeURIComponent(item.id)}`,
            tag: item.tag || "",
            dueDate: item.dueDate || "",
            points: item.points || "",
            ctaLabel: item.ctaLabel || "Open assignment"
        })));
}

function getCourseAssignmentIdSet(courses = []) {
    return new Set(
        courses.flatMap((course) => getCourseItems(course)
            .map(({ item }) => item)
            .filter((item) => isAssignmentContent(item))
            .map((item) => item.id))
    );
}

function normalizeOptionalStatOverride(value) {
    const numeric = Number.parseInt(value, 10);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : null;
}

function getTeacherManagedStat(profile = {}, key = "") {
    const teacherManagedStats = profile?.teacherManagedStats && typeof profile.teacherManagedStats === "object"
        ? profile.teacherManagedStats
        : {};
    return normalizeOptionalStatOverride(teacherManagedStats[key]);
}

export function syncProfileCourseStats(profile = {}, courses = []) {
    const nextProfile = JSON.parse(JSON.stringify(profile || {}));
    nextProfile.stats ||= {};
    const completedCoursesOverride = getTeacherManagedStat(nextProfile, "completedCourses");
    const completedAssignmentsOverride = getTeacherManagedStat(nextProfile, "completedAssignments");

    if (Array.isArray(courses) && courses.length) {
        nextProfile.progress = buildCourseProgressEntries(courses, nextProfile);
        nextProfile.stats.completedCourses = completedCoursesOverride ?? getCompletedCourseCount(courses, nextProfile);

        const courseAssignmentIds = getCourseAssignmentIdSet(courses);
        const standaloneCompletedAssignments = Array.isArray(nextProfile.assignments)
            ? nextProfile.assignments.filter((assignment) => assignment?.status === "completed" && !courseAssignmentIds.has(assignment.id)).length
            : 0;

        nextProfile.stats.completedAssignments = completedAssignmentsOverride
            ?? (getCompletedCourseAssignmentCount(courses, nextProfile) + standaloneCompletedAssignments);
        return nextProfile;
    }

    nextProfile.progress = Array.isArray(nextProfile.progress) ? nextProfile.progress : [];
    nextProfile.stats.completedCourses = completedCoursesOverride ?? (Number(nextProfile.stats.completedCourses) || 0);
    nextProfile.stats.completedAssignments = completedAssignmentsOverride ?? (Number(nextProfile.stats.completedAssignments) || 0);
    return nextProfile;
}
