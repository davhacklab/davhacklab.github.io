export const CONTENT_PATHS = {
    overviewTasks: "portalContent/overviewTasks",
    resources: "portalContent/resources",
    videoCourses: "portalContent/videoCourses",
    events: "portalContent/events",
    authorityArticles: "portalContent/authorityArticles",
    studentArticles: "portalContent/studentArticles",
    dashboardAnnouncement: "portalContent/dashboardAnnouncement",
    askForgeQuestions: "portalContent/askForgeQuestions"
};

export const DEFAULT_DASHBOARD_ANNOUNCEMENT = {
    id: "dashboard-announcement",
    eyebrow: "Latest announcement",
    title: "",
    summary: "",
    details: "",
    imageUrl: "images/class.png",
    ctaLabel: "Open details",
    ctaUrl: "",
    isActive: false,
    updatedAt: ""
};

export const DEFAULT_OVERVIEW_TASKS = [];

export const DEFAULT_RESOURCES = [
    {
        id: "resource-video-core",
        type: "video",
        badge: "Most active",
        meta: "42 lessons",
        title: "Video Courses",
        description: "Step into guided visual lessons with a cleaner path from beginner practice to polished project work.",
        footerLeft: "Best for deep dives",
        footerRight: "Open path",
        url: "video-courses.html"
    },
    {
        id: "resource-audio-core",
        type: "audio",
        badge: "Background mode",
        meta: "18 episodes",
        title: "Audio Podcasts",
        description: "Learn while walking, sketching, or traveling with short audio stories, recap notes, and idea breakdowns.",
        footerLeft: "Best for passive learning",
        footerRight: "Coming alive",
        url: "#"
    },
    {
        id: "resource-reading-core",
        type: "reading",
        badge: "Reference shelf",
        meta: "120 reads",
        title: "Library",
        description: "Return to frameworks, notes, and guides when you need quiet focus and a solid written reference.",
        footerLeft: "Best for revision",
        footerRight: "Browse shelf",
        url: "#"
    }
];

export const DEFAULT_VIDEO_COURSES = [
    {
        id: "video-course-javascript-foundations",
        title: "Introduction to JavaScript",
        playlistLabel: "Frontend Playlist",
        lessonCount: "12 lessons",
        accessLabel: "FREE",
        description: "Build JavaScript confidence from syntax to practical UI interactions with short lessons that stay easy to revisit.",
        imageUrl: "images/session.png",
        mentorAvatars: ["images/avi.png", "images/tejas.png"],
        ctaLabel: "Enroll for free",
        courseUrl: "course-player.html",
        playerEmbedUrl: "https://www.youtube.com/embed/ER9SspLe4Hg?si=psSOzWKeyWVhl3t9",
        authorsLine: "By Tejas Sharma and Aviral Tyagi",
        overviewParagraphs: [
            "Description - Begin your JavaScript career today with a steady, practical learning flow.",
            "This course is built for students who want to move from the basics into real browser interactions without feeling lost.",
            "You will learn concepts in small steps, then apply them through simple interface and scripting exercises."
        ],
        sessionNotes: [
            "Keep a small list of syntax patterns you want to remember after each lesson.",
            "Replay the introduction section once before moving into DOM and interaction work."
        ],
        sections: [
            {
                title: "Section 1: The Basics of JavaScript",
                meta: "4 lessons | 2 hr 51 min",
                lessons: [
                    { title: "1. Introduction to JavaScript", duration: "19 min", completed: true, videoUrl: "https://www.youtube.com/embed/ER9SspLe4Hg?si=psSOzWKeyWVhl3t9" },
                    { title: "2. Variables and Data Types", duration: "24 min", completed: false, videoUrl: "https://www.youtube.com/embed/ER9SspLe4Hg?si=psSOzWKeyWVhl3t9" },
                    { title: "3. Conditions and Logic", duration: "18 min", completed: false, videoUrl: "https://www.youtube.com/embed/ER9SspLe4Hg?si=psSOzWKeyWVhl3t9" },
                    { title: "4. Functions in Practice", duration: "21 min", completed: false, videoUrl: "https://www.youtube.com/embed/ER9SspLe4Hg?si=psSOzWKeyWVhl3t9" },
                    {
                        type: "assignment",
                        title: "Checkpoint: Hello World in JavaScript",
                        tag: "Checkpoint",
                        dueDate: "Next Friday",
                        points: "20",
                        duration: "Assignment",
                        summary: "Create your first JavaScript file, run it locally, and submit a shareable link for teacher review.",
                        instructions: [
                            "Set up a simple HTML or Node file with a hello-world script.",
                            "Run the file and confirm the output works.",
                            "Upload the project to GitHub or Drive and submit the link below."
                        ],
                        aiSummary: "This checkpoint confirms you can write and run a basic JavaScript file before moving deeper into DOM work.",
                        aiKeyPoints: [
                            "Keep the script small and readable.",
                            "Test the output before submitting.",
                            "Use a public http(s) link teachers can open quickly."
                        ]
                    }
                ]
            },
            {
                title: "Section 2: The DOM of JavaScript",
                meta: "3 lessons | 3 hr 05 min",
                lessons: [
                    { title: "1. DOM Selection Basics", duration: "22 min", completed: false, videoUrl: "https://www.youtube.com/embed/ER9SspLe4Hg?si=psSOzWKeyWVhl3t9" },
                    { title: "2. Event Handling", duration: "27 min", completed: false, videoUrl: "https://www.youtube.com/embed/ER9SspLe4Hg?si=psSOzWKeyWVhl3t9" },
                    { title: "3. Building a Small Interaction", duration: "31 min", completed: false, videoUrl: "https://www.youtube.com/embed/ER9SspLe4Hg?si=psSOzWKeyWVhl3t9" }
                ]
            }
        ]
    },
    {
        id: "video-course-ui-systems",
        title: "UI Systems and Visual Hierarchy",
        playlistLabel: "Design Playlist",
        lessonCount: "9 lessons",
        accessLabel: "FREE",
        description: "A tighter visual design playlist on spacing, rhythm, and hierarchy for cleaner and more confident student interfaces.",
        imageUrl: "images/class.png",
        mentorAvatars: ["images/avi.png", "images/avatar.png"],
        ctaLabel: "Start playlist",
        courseUrl: "course-player.html",
        playerEmbedUrl: "https://www.youtube.com/embed/3Y6QJ1QxtvU",
        authorsLine: "By HackLab Design Mentors",
        overviewParagraphs: [
            "This playlist is focused on visual hierarchy, spacing, and interface clarity.",
            "Students can use it to improve weak layouts without redesigning an entire screen from scratch."
        ],
        sessionNotes: [
            "Compare before-and-after layouts to see hierarchy improvements more clearly."
        ],
        sections: [
            {
                title: "Section 1: Layout and Rhythm",
                meta: "3 lessons | 1 hr 42 min",
                lessons: [
                    { title: "1. Spacing Systems", duration: "18 min", completed: true, videoUrl: "https://www.youtube.com/embed/3Y6QJ1QxtvU" },
                    { title: "2. Alignment and Grids", duration: "22 min", completed: false, videoUrl: "https://www.youtube.com/embed/3Y6QJ1QxtvU" },
                    { title: "3. Visual Rhythm Review", duration: "20 min", completed: false, videoUrl: "https://www.youtube.com/embed/3Y6QJ1QxtvU" }
                ]
            },
            {
                title: "Section 2: Hierarchy and Emphasis",
                meta: "2 lessons | 58 min",
                lessons: [
                    { title: "1. Contrast and Emphasis", duration: "26 min", completed: false, videoUrl: "https://www.youtube.com/embed/3Y6QJ1QxtvU" },
                    { title: "2. Cleaning Up a Flat UI", duration: "32 min", completed: false, videoUrl: "https://www.youtube.com/embed/3Y6QJ1QxtvU" }
                ]
            }
        ]
    },
    {
        id: "video-course-build-workflows",
        title: "Creative Build Workflows",
        playlistLabel: "HackLab Sprint",
        lessonCount: "7 lessons",
        accessLabel: "FREE",
        description: "Follow the way HackLab mentors break a build into smaller checkpoints so projects feel easier to finish and review.",
        imageUrl: "images/python.png",
        mentorAvatars: ["images/tejas.png", "images/avatar.png"],
        ctaLabel: "Open course",
        courseUrl: "course-player.html",
        playerEmbedUrl: "https://www.youtube.com/embed/zOjov-2OZ0E",
        authorsLine: "By Tejas Sharma and HackLab Build Team",
        overviewParagraphs: [
            "This course shows how to split a project into checkpoints, reviews, and clear next steps.",
            "It works well for students who start strong but lose momentum before the final polish stage."
        ],
        sessionNotes: [
            "Keep milestone notes short so each checkpoint stays actionable."
        ],
        sections: [
            {
                title: "Section 1: Planning the Build",
                meta: "2 lessons | 54 min",
                lessons: [
                    { title: "1. Scoping the Build", duration: "25 min", completed: false, videoUrl: "https://www.youtube.com/embed/zOjov-2OZ0E" },
                    { title: "2. Setting Review Milestones", duration: "29 min", completed: false, videoUrl: "https://www.youtube.com/embed/zOjov-2OZ0E" }
                ]
            }
        ]
    },
    {
        id: "video-course-presentation-polish",
        title: "Presentation Polish for Demo Day",
        playlistLabel: "Showcase Track",
        lessonCount: "5 lessons",
        accessLabel: "FREE",
        description: "Sharpen your story, slide flow, and on-screen clarity before presenting your project to mentors or a live audience.",
        imageUrl: "images/session.png",
        mentorAvatars: ["images/avi.png", "images/tejas.png"],
        ctaLabel: "Watch now",
        courseUrl: "course-player.html",
        playerEmbedUrl: "https://www.youtube.com/embed/HAnw168huqA",
        authorsLine: "By Aviral Tyagi and Presentation Coaches",
        overviewParagraphs: [
            "A short track for students who want stronger project storytelling and cleaner delivery.",
            "Use it before mentor reviews, demo day, or any presentation where clarity matters."
        ],
        sessionNotes: [
            "Use the notes tab to keep your final story arc short, clear, and easy to rehearse."
        ],
        sections: [
            {
                title: "Section 1: Story and Flow",
                meta: "3 lessons | 1 hr 20 min",
                lessons: [
                    { title: "1. Opening the Story", duration: "18 min", completed: false, videoUrl: "https://www.youtube.com/embed/HAnw168huqA" },
                    { title: "2. Structuring Your Slides", duration: "27 min", completed: false, videoUrl: "https://www.youtube.com/embed/HAnw168huqA" },
                    { title: "3. Ending with Clarity", duration: "20 min", completed: false, videoUrl: "https://www.youtube.com/embed/HAnw168huqA" }
                ]
            }
        ]
    }
];

export const DEFAULT_EVENTS = [
    {
        id: "event-visual-design",
        badge: "Live",
        title: "Introduction to Visual Design",
        summary: "A sharper session on layout rhythm, pacing, and visual hierarchy for stronger student project presentations.",
        mentor: "Aviral Tyagi",
        date: "2026-11-14",
        timeRange: "5:00 PM - 6:00 PM",
        image: "images/python.png",
        joinLink: "#"
    },
    {
        id: "event-coding-sprint",
        badge: "Hot",
        title: "Creative Coding Build Sprint",
        summary: "A collaborative build block where students translate ideas into cleaner demos with mentor checkpoints.",
        mentor: "Tejas Sharma",
        date: "2026-11-16",
        timeRange: "6:00 PM - 7:30 PM",
        image: "images/session.png",
        joinLink: "#"
    },
    {
        id: "event-demo-coaching",
        badge: "Prep",
        title: "Demo Day Presentation Coaching",
        summary: "A guided rehearsal session focused on storytelling, slide flow, and presentation confidence before showcase day.",
        mentor: "Rhea Sethi",
        date: "2026-11-18",
        timeRange: "4:30 PM - 5:30 PM",
        image: "images/class.png",
        joinLink: "#"
    }
];

export const DEFAULT_AUTHORITY_ARTICLES = [
    {
        id: "authority-build-logs",
        role: "authority",
        title: "How to document experiments so your next build moves faster",
        summary: "HackLab mentors outline a repeatable way to capture ideas, tests, and lessons so every student can improve without losing context.",
        supportNote: "A clear build log should help the next student repeat your wins and avoid your dead ends.",
        body: `## Start with the decision, not the diary

Students usually lose time because they write down what happened instead of why a choice was made. A useful build log opens with the decision itself: what changed, what was tested, and what the team expected to learn. That makes the article valuable even for someone who never saw the original project.

## Keep every experiment in the same frame

Use one consistent structure for each experiment:

- what you tried
- why you tried it
- what result you saw
- what you changed next

When every section follows the same pattern, mentors can scan faster and future collaborators can spot the real turning points instead of guessing.

## Capture the small evidence

Do not wait for a perfect case study. A screenshot, one failed prompt, a short bug note, or a two-line metric is often enough to explain why a change mattered. Those small proofs make your next article stronger and your next build faster because you are not rebuilding the reasoning from memory.

## Close with the next-action lesson

The best article ending is not a slogan. It is a specific rule the next student can use immediately. End with one practical sentence that says what to repeat, what to avoid, and what signal to watch first during the next build cycle.`,
        author: "HackLab Editorial Desk",
        meta: "Official reading track",
        topic: "Build Systems",
        readTime: "6 min read",
        reads: "1.9k reads",
        avatar: "images/logo.png",
        accentSoft: "rgba(255, 209, 102, 0.22)"
    },
    {
        id: "authority-demo-days",
        role: "authority",
        title: "Designing demo days so every student can ship with clarity",
        summary: "A practical structure for presenting projects, collecting feedback, and making every demo feel confident instead of rushed.",
        supportNote: "A demo works better when the audience knows the problem, the build choice, and the proof in under two minutes.",
        body: `## Build the demo around one clear promise

Every good demo begins with a single promise: what the project helps a person do better. If the audience cannot repeat that promise after the first minute, the rest of the presentation feels noisy.

## Show the journey in three beats

Keep the structure simple:

1. the problem you noticed
2. the thing you built
3. the evidence that it worked

This order helps students avoid overexplaining process before the audience understands the result.

## Reduce visual clutter before review day

The strongest student demos usually remove more than they add. Cut extra slides, hide unfinished branches, and make the live path obvious. If a viewer has to ask where to look, the story is still too crowded.

## Collect feedback with categories

After the presentation, separate feedback into three groups: clarity, usefulness, and next-step ideas. That gives the team something actionable instead of one mixed pile of comments. It also turns demo day into a planning tool instead of a one-time performance.`,
        author: "HackLab Authority",
        meta: "Mentor reviewed",
        topic: "Presentation",
        readTime: "4 min read",
        reads: "1.2k reads",
        avatar: "images/logo.png",
        accentSoft: "rgba(249, 199, 79, 0.22)"
    },
    {
        id: "authority-review-checklist",
        role: "authority",
        title: "The review checklist we use before any HackLab article goes live",
        summary: "Use this editorial checklist to sharpen structure, improve readability, and keep technical writeups clear for the whole student community.",
        supportNote: "If an article is hard to scan, it will also be hard to remember.",
        body: `## Check the opening first

The first paragraph should answer three questions immediately:

- what the article is about
- why the reader should care
- what kind of lesson they will leave with

If the opening hides those answers, the article is not ready.

## Make the structure visible

Readers should be able to scan the page and understand the shape of the article before reading every line. Use headings, short paragraphs, lists, and code blocks where they actually help the explanation.

## Keep examples concrete

Replace vague phrases like "we improved the system" with direct evidence. Name the prompt, bug, UI change, workflow step, or metric. Specific examples make technical writing feel trustworthy.

## End with a reusable takeaway

The closing line should give the student a rule, pattern, or checkpoint they can reuse in their own work. Good endings do not just summarize; they transfer judgment.`,
        author: "HackLab Content Team",
        meta: "Pinned guidance",
        topic: "Writing Quality",
        readTime: "5 min read",
        reads: "980 reads",
        avatar: "images/logo.png",
        accentSoft: "rgba(255, 209, 102, 0.18)"
    }
];

export const DEFAULT_STUDENT_ARTICLES = [];

export const DEFAULT_COMMUNITY_POSTS = [
    {
        id: "community-post-mentor",
        feed: "general",
        authorId: "seed-mentor",
        authorName: "Aviral Tyagi",
        authorRole: "teacher",
        authorAvatar: "images/avi.png",
        text: "Drop your cleanest before-and-after interface improvements here. Strong iteration is worth sharing.",
        mediaLabel: "",
        likeCount: 0,
        createdAt: "2026-03-19T15:30:00.000Z"
    }
];

export const DEFAULT_ASKFORGE_QUESTIONS = [
    {
        id: "askforge-windows-build",
        authorId: "seed-tejas",
        authorName: "Tejas Sharma",
        authorRole: "student",
        authorAvatar: "images/tejas.png",
        title: "Does anyone recognise this Build Error when compiling for Windows Desktop?",
        description: "The compiler trips over a dangling reference in the project configuration. I already tried a clean rebuild, but the desktop target still fails before packaging.",
        createdAt: "2026-03-25T10:58:00.000Z",
        answers: [
            {
                id: "askforge-answer-mentor-1",
                authorId: "seed-mentor",
                authorName: "Aviral Tyagi",
                authorRole: "teacher",
                authorAvatar: "images/avi.png",
                text: "Check whether the desktop target still points to an older artifact. Rebuild the target and verify the generated desktop config before packaging again.",
                createdAt: "2026-03-25T11:08:00.000Z"
            }
        ]
    },
    {
        id: "askforge-visual-hierarchy",
        authorId: "seed-rhea",
        authorName: "Rhea Sethi",
        authorRole: "student",
        authorAvatar: "images/avatar.png",
        title: "How do I improve weak visual hierarchy without redesigning the whole page?",
        description: "My layout feels flat and everything fights for attention. I want quick fixes that improve clarity without rebuilding the entire screen from scratch.",
        createdAt: "2026-03-24T15:42:00.000Z",
        answers: []
    }
];

export const DEFAULT_PROJECTS = [
    {
        id: "project-voicepal",
        visibility: "public",
        ownerId: "seed-aviral",
        ownerName: "Aviral Tyagi",
        ownerAvatar: "images/avi.png",
        collaboratorAvatars: ["images/avi.png", "images/tejas.png"],
        title: "VoicePal Assistant",
        summary: "A voice-driven assistant concept with cleaner flows, calmer UI, and stronger prompt sequencing for student productivity.",
        category: "AI Workflow",
        status: "Live Demo",
        badge: "Trending",
        imageUrl: "images/session.png",
        likesCount: 21500,
        isFeatured: true
    },
    {
        id: "project-herbalens",
        visibility: "public",
        ownerId: "seed-rhea",
        ownerName: "Rhea Sethi",
        ownerAvatar: "images/avatar.png",
        collaboratorAvatars: ["images/avatar.png", "images/avi.png"],
        title: "HerbaLens Scanner",
        summary: "A concept product that translates plant recognition into a practical student-facing experience with a cleaner information hierarchy.",
        category: "Case Study",
        status: "In Review",
        badge: "Health Tech",
        imageUrl: "images/HerbaLens.png",
        likesCount: 13800,
        isFeatured: false
    },
    {
        id: "project-brand-motion",
        visibility: "public",
        ownerId: "seed-tejas",
        ownerName: "Tejas Sharma",
        ownerAvatar: "images/tejas.png",
        collaboratorAvatars: ["images/tejas.png", "images/avatar.png"],
        title: "HackLab Brand Motion Pack",
        summary: "A reusable system of transitions, title cards, and visual elements built to help student presentations feel more refined.",
        category: "Design Journal",
        status: "New",
        badge: "Branding",
        imageUrl: "images/voicepal_logo.png",
        likesCount: 9700,
        isFeatured: false
    },
    {
        id: "project-absolute-cinema",
        visibility: "public",
        ownerId: "seed-cinema",
        ownerName: "Absolute Cinema Team",
        ownerAvatar: "images/avi.png",
        collaboratorAvatars: ["images/avi.png", "images/avatar.png"],
        title: "Absolute Cinema Showcase",
        summary: "A high-energy presentation project focused on sequencing, motion cues, and cleaner visual rhythm for final delivery moments.",
        category: "Showcase",
        status: "Polished",
        badge: "Media",
        imageUrl: "images/absolute_cinema.png",
        likesCount: 18200,
        isFeatured: false
    }
];

export const DEFAULT_STUDENT_PROFILE = {
    displayName: "Student",
    role: "student",
    email: "",
    headline: "",
    school: "",
    track: "",
    location: "",
    bio: "",
    phone: "",
    portfolioUrl: "",
    teacherTags: [],
    courseProgress: {},
    stats: {
        completedCourses: 0,
        attendedEvents: 0,
        submittedProjects: 0,
        completedAssignments: 0
    },
    progress: [],
    assignments: []
};
