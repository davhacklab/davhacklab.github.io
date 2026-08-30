import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    CONTENT_PATHS,
    DEFAULT_VIDEO_COURSES,
    auth,
    escapeHtml,
    watchContent
} from "./portal-data.js";
import { guardStudentPortal } from "./account-access.js";

const coursesGridEl = document.getElementById("coursesGrid");
const pageSubtitleEl = document.getElementById("videoCoursesSubtitle");
const loadMoreWrapEl = document.getElementById("videoCoursesLoadMoreWrap");
const loadMoreBtnEl = document.getElementById("videoCoursesLoadMoreBtn");

let activeCourses = [...DEFAULT_VIDEO_COURSES];
let visibleCourseCount = 8;
let courseWatcherAttached = false;

function normalizeCourseSections(course = {}) {
    if (!Array.isArray(course.sections)) return [];
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
                completed: Boolean(lesson.completed)
            })) : []
        }));
}

function normalizeCourses(value) {
    if (!Array.isArray(value)) {
        return [...DEFAULT_VIDEO_COURSES];
    }

    return value
        .filter(Boolean)
        .map((course, index) => ({
            id: course.id || `video-course-${index + 1}`,
            title: course.title || "Untitled course",
            playlistLabel: course.playlistLabel || "HackLab Playlist",
            lessonCount: course.lessonCount || "New course",
            accessLabel: course.accessLabel || "FREE",
            description: course.description || "A teacher-curated video course will appear here.",
            imageUrl: course.imageUrl || "images/session.png",
            mentorAvatars: Array.isArray(course.mentorAvatars) && course.mentorAvatars.length
                ? course.mentorAvatars
                : ["images/avi.png", "images/tejas.png"],
            ctaLabel: course.ctaLabel || "Enroll for free",
            courseUrl: course.courseUrl || "course-player.html",
            playerEmbedUrl: course.playerEmbedUrl || "https://www.youtube.com/embed/ER9SspLe4Hg?si=psSOzWKeyWVhl3t9",
            authorsLine: course.authorsLine || "By HackLab Mentors",
            overviewParagraphs: Array.isArray(course.overviewParagraphs) ? course.overviewParagraphs : [],
            sections: normalizeCourseSections(course)
        }));
}

function renderCourseCard(course) {
    const mentorMarkup = (course.mentorAvatars || [])
        .slice(0, 2)
        .map((avatarPath, index) => `
            <img src="${escapeHtml(avatarPath || "images/avatar.png")}" alt="Mentor ${index + 1}" />
        `)
        .join("");

    return `
        <article class="course-card glass" data-course-id="${escapeHtml(course.id)}">
            <div class="card-thumb">
                <div class="thumb-img-wrap">
                    <img src="${escapeHtml(course.imageUrl || "images/session.png")}" alt="${escapeHtml(course.title)}" />
                </div>
                <span class="free-badge">${escapeHtml(course.accessLabel || "FREE")}</span>
                <div class="card-profiles">${mentorMarkup}</div>
            </div>
            <div class="card-info">
                <div class="course-label-row">
                    <span class="course-tag">${escapeHtml(course.playlistLabel || "HackLab Playlist")}</span>
                    <span class="course-tag course-tag-muted">${escapeHtml(course.lessonCount || "New course")}</span>
                </div>
                <h3>${escapeHtml(course.title || "Untitled course")}</h3>
                <p>${escapeHtml(course.description || "A teacher-curated video course will appear here.")}</p>
                <button class="enroll-btn" type="button" data-course-id="${escapeHtml(course.id)}" data-course-url="${escapeHtml(course.courseUrl || "course-player.html")}">${escapeHtml(course.ctaLabel || "Enroll for free")}</button>
            </div>
        </article>
    `;
}

function renderVideoCourses() {
    if (!coursesGridEl) return;

    if (!activeCourses.length) {
        coursesGridEl.innerHTML = `
            <article class="course-card glass course-card-empty">
                <div class="card-info">
                    <div class="course-label-row">
                        <span class="course-tag">Playlist pending</span>
                    </div>
                    <h3>No video courses published yet</h3>
                    <p>Your teacher has not added any video courses right now. Check back soon for the first playlist.</p>
                </div>
            </article>
        `;
        if (pageSubtitleEl) {
            pageSubtitleEl.textContent = "The video course playlist is empty right now.";
        }
        if (loadMoreWrapEl) {
            loadMoreWrapEl.hidden = true;
        }
        return;
    }

    const visibleCourses = activeCourses.slice(0, visibleCourseCount);
    coursesGridEl.innerHTML = visibleCourses.map(renderCourseCard).join("");

    if (pageSubtitleEl) {
        pageSubtitleEl.textContent = `${activeCourses.length} teacher-curated video course${activeCourses.length === 1 ? "" : "s"} ready to explore.`;
    }

    if (loadMoreWrapEl) {
        loadMoreWrapEl.hidden = activeCourses.length <= visibleCourseCount;
    }
}

onAuthStateChanged(auth, async (user) => {
    if (!(await guardStudentPortal(user))) {
        return;
    }

    if (!courseWatcherAttached) {
        courseWatcherAttached = true;
        watchContent(CONTENT_PATHS.videoCourses, DEFAULT_VIDEO_COURSES, (courses) => {
            activeCourses = normalizeCourses(courses);
            visibleCourseCount = Math.max(8, Math.min(visibleCourseCount, Math.max(activeCourses.length, 8)));
            renderVideoCourses();
        });
    }
});

document.getElementById("logoutBtn")?.addEventListener("click", () => {
    signOut(auth).then(() => {
        window.location.href = "auth.html";
    }).catch((error) => {
        console.error("Logout Error:", error);
    });
});

coursesGridEl?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-course-url]");
    if (!button) return;

    const nextUrl = button.dataset.courseUrl || "";
    const courseId = button.dataset.courseId || "";
    if (nextUrl && nextUrl !== "#") {
        if (/course-player\.html/i.test(nextUrl) && courseId) {
            const separator = nextUrl.includes("?") ? "&" : "?";
            window.location.href = `${nextUrl}${separator}courseId=${encodeURIComponent(courseId)}`;
            return;
        }

        window.location.href = nextUrl;
    }
});

loadMoreBtnEl?.addEventListener("click", () => {
    visibleCourseCount += 4;
    renderVideoCourses();
});
