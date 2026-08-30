import { isAssignmentContent } from "./course-content.js";

function normalizeLines(value = []) {
    if (Array.isArray(value)) {
        return value.map((item) => String(item || "").trim()).filter(Boolean);
    }

    if (typeof value === "string") {
        return value
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);
    }

    return [];
}

function buildGeneratedKeyPoints(course = {}, section = {}, content = {}) {
    const points = [];

    if (isAssignmentContent(content)) {
        points.push("Read the full assignment brief before you start building.");
        if (content.dueDate) points.push(`Due date: ${content.dueDate}`);
        if (content.points) points.push(`Scoring: up to ${content.points} points`);
        normalizeLines(content.instructions).slice(0, 3).forEach((step) => points.push(step));
        points.push("Submit a public http(s) link so your teacher can review the work.");
        return points.slice(0, 6);
    }

    points.push(`Core focus: ${content.title || "This lesson"}`);
    if (content.duration) points.push(`Suggested watch time: ${content.duration}`);
    if (section?.title) points.push(`Section context: ${section.title}`);
    if (content.summary) points.push(content.summary);

    normalizeLines(course.sessionNotes).slice(0, 2).forEach((note) => points.push(note));
    normalizeLines(course.overviewParagraphs).slice(0, 1).forEach((paragraph) => {
        points.push(paragraph.length > 120 ? `${paragraph.slice(0, 117).trimEnd()}...` : paragraph);
    });

    return [...new Set(points)].slice(0, 6);
}

function buildGeneratedSummary(course = {}, section = {}, content = {}) {
    if (isAssignmentContent(content)) {
        const dueLine = content.dueDate ? ` It is due ${content.dueDate}.` : "";
        const pointsLine = content.points ? ` This checkpoint is worth ${content.points} points.` : "";
        return `${content.summary || `This assignment checks how well you can apply ${course.title || "the course"} in a small deliverable.`}${dueLine}${pointsLine} Use the submission panel to send your link for teacher review.`;
    }

    const sectionLabel = section?.title ? ` in ${section.title}` : "";
    const durationLabel = content.duration ? ` (${content.duration})` : "";
    return `This lesson${sectionLabel}${durationLabel} helps you move through ${course.title || "the playlist"} with a clear concept focus on ${content.title || "the current topic"}. Review the key points below, then mark the lesson complete once you finish watching.`;
}

export function buildLessonAiPack(course = {}, section = {}, content = {}) {
    const customSummary = String(content?.aiSummary || "").trim();
    const customPoints = normalizeLines(content?.aiKeyPoints);

    return {
        summary: customSummary || buildGeneratedSummary(course, section, content),
        keyPoints: customPoints.length
            ? customPoints
            : buildGeneratedKeyPoints(course, section, content),
        source: customSummary ? "teacher" : "generated"
    };
}
