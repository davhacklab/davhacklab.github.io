import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    CONTENT_PATHS,
    DEFAULT_EVENTS,
    auth,
    escapeHtml,
    formatCompactDate,
    formatEventDate,
    watchContent
} from "./portal-data.js";
import { guardStudentPortal } from "./account-access.js";

let allEvents = [...DEFAULT_EVENTS];
let activeView = "upcoming";
let searchQuery = "";
let eventsWatcherAttached = false;
let hasScrolledToRequestedEvent = false;
let shouldSyncRequestedEventView = true;
const EVENTS_VIEW_STORAGE_KEY = "hacklab.events.view";
const EVENTS_SEARCH_STORAGE_KEY = "hacklab.events.search";
const pageParams = new URLSearchParams(window.location.search);
let requestedEventId = pageParams.get("eventId") || "";

function getEventView(eventItem = {}) {
    const parsed = new Date(`${eventItem.date || "2026-01-01"}T23:59:59`);
    if (Number.isNaN(parsed.getTime())) {
        return "upcoming";
    }

    return parsed.getTime() < Date.now() ? "past" : "upcoming";
}

function restoreEventsState() {
    try {
        const storedView = window.sessionStorage.getItem(EVENTS_VIEW_STORAGE_KEY);
        const storedSearch = window.sessionStorage.getItem(EVENTS_SEARCH_STORAGE_KEY);

        if (storedView === "upcoming" || storedView === "past") {
            activeView = storedView;
        }

        if (typeof storedSearch === "string") {
            searchQuery = storedSearch.trim().toLowerCase();
        }
    } catch (error) {
        console.warn("Unable to restore events view state:", error);
    }

    const requestedView = pageParams.get("view");
    const requestedSearch = pageParams.get("search");

    if (requestedView === "upcoming" || requestedView === "past") {
        activeView = requestedView;
    }

    if (typeof requestedSearch === "string" && requestedSearch.trim()) {
        searchQuery = requestedSearch.trim().toLowerCase();
    }

    if (requestedEventId && !requestedSearch) {
        searchQuery = "";
    }
}

function persistEventsState() {
    try {
        window.sessionStorage.setItem(EVENTS_VIEW_STORAGE_KEY, activeView);
        window.sessionStorage.setItem(EVENTS_SEARCH_STORAGE_KEY, searchQuery);
    } catch (error) {
        console.warn("Unable to persist events view state:", error);
    }
}

function syncEventControls() {
    document.querySelectorAll(".toggle-btn").forEach((button) => {
        const buttonView = button.textContent.trim().toLowerCase();
        button.classList.toggle("active", buttonView === activeView);
    });

    const searchInput = document.querySelector(".search-input");
    if (searchInput) {
        searchInput.value = searchQuery;
    }
}

function toDateValue(eventItem) {
    return new Date(`${eventItem.date || "2026-01-01"}T00:00:00`).getTime();
}

function syncRequestedEventView() {
    if (!shouldSyncRequestedEventView) return;
    if (!requestedEventId) return;

    const requestedEvent = allEvents.find((eventItem) => eventItem.id === requestedEventId);
    if (!requestedEvent) return;

    const requiredView = getEventView(requestedEvent);
    if (activeView !== requiredView) {
        activeView = requiredView;
        syncEventControls();
        persistEventsState();
    }

    shouldSyncRequestedEventView = false;
}

function getVisibleEvents() {
    const now = new Date();
    return allEvents
        .filter((eventItem) => {
            const eventDate = new Date(`${eventItem.date || "2026-01-01"}T23:59:59`);
            const isPast = eventDate < now;
            const matchesView = activeView === "past" ? isPast : !isPast;
            const haystack = `${eventItem.title} ${eventItem.summary} ${eventItem.mentor} ${eventItem.badge}`.toLowerCase();
            const matchesSearch = !searchQuery || haystack.includes(searchQuery);
            return matchesView && matchesSearch;
        })
        .sort((left, right) => {
            if (activeView === "past") {
                return toDateValue(right) - toDateValue(left);
            }

            return toDateValue(left) - toDateValue(right);
        });
}

function getAssignmentRoute(eventItem = {}) {
    if (!eventItem.linkedCourseId || !eventItem.linkedAssignmentId) return "";

    const params = new URLSearchParams();
    params.set("courseId", eventItem.linkedCourseId);

    if (eventItem.linkedSectionId) {
        params.set("sectionId", eventItem.linkedSectionId);
    }

    params.set("contentId", eventItem.linkedAssignmentId);
    return `course-player.html?${params.toString()}`;
}

function getEventAction(eventItem, index = 0) {
    const assignmentRoute = getAssignmentRoute(eventItem);
    if (assignmentRoute) {
        return {
            label: activeView === "past" ? "Open Assignment" : "View Assignment",
            route: assignmentRoute,
            external: false
        };
    }

    if (eventItem.joinLink && eventItem.joinLink !== "#") {
        return {
            label: activeView === "upcoming" && index === 0 ? "Join Now" : "Open Session",
            route: eventItem.joinLink,
            external: true
        };
    }

    return {
        label: activeView === "past" ? "Review Session" : "View Details",
        route: `events.html?view=${encodeURIComponent(getEventView(eventItem))}&eventId=${encodeURIComponent(eventItem.id || "")}`,
        external: false
    };
}

function openEventRoute(route = "", external = false) {
    if (!route || route === "#") return;

    if (external || /^https?:\/\//i.test(route)) {
        window.open(route, "_blank", "noopener,noreferrer");
        return;
    }

    window.location.href = route;
}

function renderAgenda(visibleEvents) {
    const liveAgendaCard = document.getElementById("liveAgendaCard");
    const nextAgendaList = document.getElementById("nextAgendaList");
    const firstEvent = visibleEvents[0];
    const agendaKicker = activeView === "past" ? "Most recent" : "Right now";

    if (liveAgendaCard && firstEvent) {
        liveAgendaCard.innerHTML = `
            <p class="section-kicker">${escapeHtml(agendaKicker)}</p>
            <h3>${escapeHtml(firstEvent.title)}</h3>
            <p>${escapeHtml(firstEvent.summary)}</p>
            <div class="agenda-meta">
                <span>Mentor: ${escapeHtml(firstEvent.mentor || "HackLab Teacher")}</span>
                <span>Window: ${escapeHtml(firstEvent.timeRange || "TBA")}</span>
                ${firstEvent.linkedAssignmentId ? `<span>Linked assignment available inside the course flow</span>` : ""}
            </div>
        `;
    } else if (liveAgendaCard) {
        liveAgendaCard.innerHTML = `
            <p class="section-kicker">${escapeHtml(agendaKicker)}</p>
            <h3>No session queued</h3>
            <p>Try switching between Upcoming and Past or clearing your search to view more sessions.</p>
            <div class="agenda-meta">
                <span>Mentor: --</span>
                <span>Window: TBA</span>
            </div>
        `;
    }

    if (nextAgendaList) {
        const nextItems = visibleEvents.slice(1, 4);
        if (!nextItems.length) {
            nextAgendaList.innerHTML = `
                <div class="mini-agenda-item">
                    <strong>--</strong>
                    <span>No more sessions in this lane yet.</span>
                </div>
            `;
            return;
        }

        nextAgendaList.innerHTML = nextItems.map((eventItem) => `
            <div class="mini-agenda-item">
                <strong>${escapeHtml(formatCompactDate(eventItem.date))}</strong>
                <span>${escapeHtml(eventItem.title)}</span>
            </div>
        `).join("");
    }
}

function renderCards(visibleEvents) {
    const sessionsGrid = document.getElementById("eventsSessionsGrid");
    if (!sessionsGrid) return;

    if (!visibleEvents.length) {
        sessionsGrid.innerHTML = `
            <div class="session-card glass-panel" style="padding: 32px; text-align: center;">
                <div class="card-info" style="width: 100%;">
                    <h3>No sessions match this filter</h3>
                    <p class="session-date">Try switching between Upcoming and Past or clearing your search.</p>
                </div>
            </div>
        `;
        return;
    }

    sessionsGrid.innerHTML = visibleEvents.map((eventItem, index) => {
        const action = getEventAction(eventItem, index);
        const isHighlighted = requestedEventId === eventItem.id;

        return `
            <div class="session-card glass-panel${isHighlighted ? " is-highlighted" : ""}" data-event-card-id="${escapeHtml(eventItem.id)}">
                <div class="session-topline">
                    <span class="ai-badge">${escapeHtml(eventItem.badge || "Live")}</span>
                    <span class="session-chip">${escapeHtml(formatCompactDate(eventItem.date) || "TBA")}</span>
                </div>
                <div class="card-info">
                    <div class="session-meta-row">
                        <span class="session-meta-chip">${escapeHtml(eventItem.mentor || "HackLab Teacher")}</span>
                        <span class="session-meta-chip">${escapeHtml(eventItem.timeRange || "TBA")}</span>
                        ${eventItem.linkedAssignmentId ? '<span class="session-meta-chip">Assignment linked</span>' : ""}
                    </div>
                    <h3>${escapeHtml(eventItem.title)}</h3>
                    <p class="session-date">${escapeHtml(formatEventDate(eventItem.date))}</p>
                    <p class="session-summary">${escapeHtml(eventItem.summary || "Session details will appear here once the teacher updates this event.")}</p>
                    <button class="join-btn" data-route="${escapeHtml(action.route)}" data-external="${action.external ? "true" : "false"}">${escapeHtml(action.label)} <span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M9 6.5L14.5 12L9 17.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg></span></button>
                </div>
            </div>
        `;
    }).join("");

    sessionsGrid.querySelectorAll(".join-btn").forEach((button) => {
        button.addEventListener("click", () => {
            openEventRoute(button.dataset.route || "", button.dataset.external === "true");
        });
    });

    if (requestedEventId && !hasScrolledToRequestedEvent) {
        const highlightedCard = sessionsGrid.querySelector(`[data-event-card-id="${requestedEventId}"]`);
        if (highlightedCard) {
            hasScrolledToRequestedEvent = true;
            window.requestAnimationFrame(() => {
                highlightedCard.scrollIntoView({ behavior: "smooth", block: "center" });
            });
        }
    }
}

function renderHeroStats(visibleEvents) {
    const countEl = document.getElementById("eventsCount");
    const countLabelEl = document.getElementById("eventsCountLabel");
    const nextTimeEl = document.getElementById("eventsNextTime");
    const nextTitleEl = document.getElementById("eventsNextTitle");
    const firstEvent = visibleEvents[0];

    if (countEl) countEl.textContent = String(visibleEvents.length).padStart(2, "0");
    if (countLabelEl) countLabelEl.textContent = activeView === "past"
        ? (visibleEvents.length === 1 ? "past session" : "past sessions")
        : (visibleEvents.length === 1 ? "active learning block" : "active learning blocks");
    if (nextTimeEl) nextTimeEl.textContent = firstEvent?.timeRange || "TBA";
    if (nextTitleEl) nextTitleEl.textContent = firstEvent?.title || "No session queued";
}

function renderEvents() {
    syncRequestedEventView();
    const visibleEvents = getVisibleEvents();
    const sectionKickerEl = document.getElementById("eventsSectionKicker");
    const sectionTitleEl = document.getElementById("eventsSectionTitle");

    if (sectionKickerEl) {
        sectionKickerEl.textContent = activeView === "past" ? "Past lineup" : "Upcoming lineup";
    }

    if (sectionTitleEl) {
        sectionTitleEl.textContent = activeView === "past"
            ? "Past sessions you can still review or open for linked assignments"
            : "Sessions worth keeping open in your calendar";
    }

    renderHeroStats(visibleEvents);
    renderAgenda(visibleEvents);
    renderCards(visibleEvents);
}

onAuthStateChanged(auth, async (user) => {
    if (!(await guardStudentPortal(user))) {
        return;
    }

    if (!eventsWatcherAttached) {
        eventsWatcherAttached = true;
        watchContent(CONTENT_PATHS.events, DEFAULT_EVENTS, (events) => {
            allEvents = Array.isArray(events) ? events : DEFAULT_EVENTS;
            renderEvents();
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

document.addEventListener("DOMContentLoaded", () => {
    restoreEventsState();
    syncEventControls();

    const toggleButtons = document.querySelectorAll(".toggle-btn");
    toggleButtons.forEach((button) => {
        button.addEventListener("click", () => {
            toggleButtons.forEach((item) => item.classList.remove("active"));
            button.classList.add("active");
            activeView = button.textContent.trim().toLowerCase();
            persistEventsState();
            renderEvents();
        });
    });

    document.querySelector(".search-input")?.addEventListener("input", (event) => {
        searchQuery = event.target.value.trim().toLowerCase();
        persistEventsState();
        renderEvents();
    });

    renderEvents();
});
