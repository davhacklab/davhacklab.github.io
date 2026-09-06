import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    DEFAULT_PROJECTS,
    DEFAULT_STUDENT_PROFILE,
    auth,
    createProject,
    deleteProject,
    escapeHtml,
    formatCompactCount,
    getDisplayName,
    likeProject,
    loadOpenCollaborators,
    loadBootstrap,
    loadProjects,
    peekBootstrapProjects,
    saveCollaborationState,
    loadStudentProfile,
    saveStudentProfile,
    startBootstrapPolling,
    stopBootstrapPolling
} from "./portal-data.js";
import {
    findSentCollaborationRequest,
    getAcceptedCollaborationContacts,
    hasAcceptedContact,
    loadUserCollaborationState,
    sendCollaborationRequest
} from "./collaboration-state.js";
import { guardStudentPortal } from "./account-access.js";

const projectsSearchInput = document.getElementById("projectsSearchInput");
const projectsSidebarSearch = document.getElementById("projectsSidebarSearch");
const projectFilterPills = document.getElementById("projectFilterPills");
const projectsGrid = document.getElementById("projectsGrid");
const projectPulse = document.getElementById("projectPulse");
const openProjectComposer = document.getElementById("openProjectComposer");
const openFavouriteProjects = document.getElementById("openFavouriteProjects");
const openTrendingProjects = document.getElementById("openTrendingProjects");
const openCollaboratePanel = document.getElementById("openCollaboratePanel");
const collabWidget = document.getElementById("collabWidget");
const collabAvailabilityToggle = document.getElementById("collabAvailabilityToggle");
const collabSearchInput = document.getElementById("collabSearchInput");
const collabCountPill = document.getElementById("collabCountPill");
const yourWorkCount = document.getElementById("yourWorkCount");
const favouritesCount = document.getElementById("favouritesCount");
const trendingCount = document.getElementById("trendingCount");
const projectUploadSection = document.getElementById("projectUploadSection");
const toggleProjectUpload = document.getElementById("toggleProjectUpload");
const projectUploadBody = document.getElementById("projectUploadBody");
const projectUploadForm = document.getElementById("projectUploadForm");
const projectTitleInput = document.getElementById("projectTitleInput");
const projectSummaryInput = document.getElementById("projectSummaryInput");
const projectLaneOptions = document.getElementById("projectLaneOptions");
const addProjectLaneBtn = document.getElementById("addProjectLaneBtn");
const customProjectLaneWrap = document.getElementById("customProjectLaneWrap");
const customProjectLaneInput = document.getElementById("customProjectLaneInput");
const saveProjectLaneBtn = document.getElementById("saveProjectLaneBtn");
const projectNetlifyInput = document.getElementById("projectNetlifyInput");
const projectUploadMessage = document.getElementById("projectUploadMessage");
const selectedCollaboratorsPanel = document.getElementById("selectedCollaboratorsPanel");
const selectedCollaboratorsList = document.getElementById("selectedCollaboratorsList");
const selectedCollaboratorsMeta = document.getElementById("selectedCollaboratorsMeta");

let currentUser = null;
let currentUserName = "HackLab Student";
let currentUserAvatar = "images/avatar.png";
let activeFilter = "featured";
let searchQuery = "";
let collabSearchQuery = "";
let allProjects = [...DEFAULT_PROJECTS];
let stopBootstrapRefresh = null;
let projectsRefreshFrame = null;
let isCollaborationOpen = false;
let activeSidebarView = "all";
let isUploadCollapsed = false;
const favouriteProjects = new Set();
const selectedCollaborators = new Map();
let currentCollaborationState = {
    userId: "",
    isOpenToCollaborate: false,
    profile: {
        name: "HackLab Student",
        avatar: "images/avatar.png",
        role: "student"
    },
    inbox: [],
    sent: [],
    contacts: []
};
let openCollaborators = [];
const FAVOURITE_PROJECTS_STORAGE_KEY = "hacklab.favoriteProjects";
const PROJECTS_VIEW_STORAGE_KEY = "hacklab.projects.view";
const PROJECTS_UPLOAD_DRAFT_STORAGE_KEY = "hacklab.projects.uploadDraft";
const COLLAB_AVAILABILITY_STORAGE_PREFIX = "hacklab.projects.openToCollaborate.";

function compactText(value, maxLength = 92, fallback = "") {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return fallback;
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength).replace(/\s+\S*$/, "").trim()}...`;
}

function buildProjectDetailsText(project) {
    const ownerName = project.ownerName || "HackLab Student";
    const category = project.category || "Student Build";
    const status = project.status || "New";
    const likesLabel = `${formatCompactCount(project.likesCount || 0)} likes`;
    const isCollabBuild = (project.collaboratorAvatars || []).length > 1 || /collab/i.test(status);
    const collaboratorNames = Array.isArray(project.collaboratorNames)
        ? project.collaboratorNames.filter((name) => name && name !== ownerName)
        : [];
    const collaborationLine = isCollabBuild
        ? collaboratorNames.length
            ? `Collaborators: ${collaboratorNames.join(", ")}.`
            : "Includes a multi-person build setup and feels ready for shared iteration."
        : "Reads like a focused single-owner build with a clear point of view.";

    const liveLine = project.projectLink ? ` Live project: ${project.projectLink}.` : "";
    return `Built by ${ownerName}. Category: ${category}. Stage: ${status}. ${collaborationLine} ${likesLabel} so far.${liveLine}`;
}

function isMineProject(project) {
    if (!project) return false;

    if (currentUser?.uid) {
        if (project.ownerId === currentUser.uid) {
            return true;
        }

        return Array.isArray(project.collaboratorIds) && project.collaboratorIds.includes(currentUser.uid);
    }

    if (project.ownerName === currentUserName) {
        return true;
    }

    return Array.isArray(project.collaboratorNames) && project.collaboratorNames.includes(currentUserName);
}

function isOwnedProject(project) {
    if (!project) return false;

    if (currentUser?.uid) {
        return project.ownerId === currentUser.uid;
    }

    return project.ownerName === currentUserName;
}

function getCollaborationIdentity() {
    return {
        uid: currentUser?.uid || "",
        name: currentUserName,
        email: currentUser?.email || currentCollaborationState.profile?.email || "",
        avatar: currentUserAvatar,
        role: "student"
    };
}

function getAcceptedContactMap() {
    return new Map(
        getAcceptedCollaborationContacts(currentCollaborationState).map((contact) => [contact.userId, contact])
    );
}

function getSelectedCollaboratorEntries() {
    return [...selectedCollaborators.values()];
}

function getVisibleOpenCollaborators() {
    return openCollaborators.filter((entry) => entry.userId && entry.isOpenToCollaborate && entry.userId !== currentUser?.uid && !entry.userId.startsWith("seed-"));
}

function syncCollaborationAvailabilityToggle() {
    if (!collabAvailabilityToggle) return;
    collabAvailabilityToggle.checked = Boolean(currentCollaborationState.isOpenToCollaborate);
}

function getCollaborationButtonLabel(person) {
    if (!person?.id) {
        return "Request";
    }

    if (selectedCollaborators.has(person.id)) {
        return "Added";
    }

    if (hasAcceptedContact(currentCollaborationState, person.id)) {
        return "Add";
    }

    const sentRequest = findSentCollaborationRequest(currentCollaborationState, person.id);
    if (sentRequest?.status === "pending") {
        return "Requested";
    }

    if (sentRequest?.status === "declined") {
        return "Request Again";
    }

    return "Request";
}

function getCollaborationButtonClass(person) {
    const label = getCollaborationButtonLabel(person);

    if (label === "Added") return "is-added";
    if (label === "Add") return "is-accepted";
    if (label === "Requested") return "is-requested";
    return "";
}

function setUploadMessage(text, tone = "") {
    if (!projectUploadMessage) return;
    projectUploadMessage.textContent = text;
    projectUploadMessage.classList.remove("success", "error");
    if (tone) {
        projectUploadMessage.classList.add(tone);
    }
}

function readStorageJson(key, fallback = {}) {
    try {
        const rawValue = window.localStorage.getItem(key);
        return rawValue ? JSON.parse(rawValue) : fallback;
    } catch (error) {
        console.warn(`Unable to read projects storage key "${key}":`, error);
        return fallback;
    }
}

function writeStorageJson(key, value) {
    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.warn(`Unable to write projects storage key "${key}":`, error);
    }
}

function syncProjectSearchFields() {
    if (projectsSearchInput) {
        projectsSearchInput.value = searchQuery;
    }
    if (projectsSidebarSearch) {
        projectsSidebarSearch.value = searchQuery;
    }
}

function getCollaborationAvailabilityStorageKey() {
    return `${COLLAB_AVAILABILITY_STORAGE_PREFIX}${currentUser?.uid || "guest"}`;
}

function persistLocalCollaborationAvailability(value) {
    try {
        window.localStorage.setItem(getCollaborationAvailabilityStorageKey(), JSON.stringify(Boolean(value)));
    } catch (error) {
        console.warn("Unable to persist collaboration availability locally:", error);
    }
}

function readLocalCollaborationAvailability() {
    try {
        const rawValue = window.localStorage.getItem(getCollaborationAvailabilityStorageKey());
        return rawValue === null ? null : Boolean(JSON.parse(rawValue));
    } catch (error) {
        console.warn("Unable to read local collaboration availability:", error);
        return null;
    }
}

function persistProjectsViewState() {
    writeStorageJson(PROJECTS_VIEW_STORAGE_KEY, {
        activeFilter,
        searchQuery,
        collabSearchQuery,
        activeSidebarView,
        isCollaborationOpen,
        isUploadCollapsed
    });
}

function restoreProjectsViewState() {
    const storedState = readStorageJson(PROJECTS_VIEW_STORAGE_KEY, {});

    if (typeof storedState.activeFilter === "string" && ["featured", "ui/ux", "ai", "build"].includes(storedState.activeFilter)) {
        activeFilter = storedState.activeFilter;
    }

    if (typeof storedState.searchQuery === "string") {
        searchQuery = storedState.searchQuery;
    }

    if (typeof storedState.collabSearchQuery === "string") {
        collabSearchQuery = storedState.collabSearchQuery;
    }

    if (typeof storedState.activeSidebarView === "string" && ["all", "mine", "favourites", "trending"].includes(storedState.activeSidebarView)) {
        activeSidebarView = storedState.activeSidebarView;
    }

    if (typeof storedState.isCollaborationOpen === "boolean") {
        isCollaborationOpen = storedState.isCollaborationOpen;
    }

    if (typeof storedState.isUploadCollapsed === "boolean") {
        isUploadCollapsed = storedState.isUploadCollapsed;
    }

    syncProjectSearchFields();
    if (collabSearchInput) {
        collabSearchInput.value = collabSearchQuery;
    }
}

function persistProjectDraft() {
    writeStorageJson(PROJECTS_UPLOAD_DRAFT_STORAGE_KEY, {
        title: projectTitleInput?.value || "",
        summary: projectSummaryInput?.value || "",
        projectLink: projectNetlifyInput?.value || "",
        selectedLane: getSelectedProjectLane(),
        customLane: getCustomLaneOption()?.querySelector('input[name="projectLane"]')?.value || "",
        selectedCollaborators: getSelectedCollaboratorEntries()
    });
}

function restoreProjectDraft() {
    const draft = readStorageJson(PROJECTS_UPLOAD_DRAFT_STORAGE_KEY, {});

    if (projectTitleInput && typeof draft.title === "string") {
        projectTitleInput.value = draft.title;
    }
    if (projectSummaryInput && typeof draft.summary === "string") {
        projectSummaryInput.value = draft.summary;
    }
    if (projectNetlifyInput && typeof draft.projectLink === "string") {
        projectNetlifyInput.value = draft.projectLink;
    }

    if (typeof draft.customLane === "string" && draft.customLane.trim()) {
        upsertCustomLaneOption(draft.customLane);
    }

    if (typeof draft.selectedLane === "string" && draft.selectedLane.trim()) {
        setSelectedProjectLane(draft.selectedLane);
    } else {
        setSelectedProjectLane(getDefaultLaneFromFilter());
    }

    selectedCollaborators.clear();
    if (Array.isArray(draft.selectedCollaborators)) {
        draft.selectedCollaborators.forEach((collaborator) => {
            if (!collaborator?.id) return;
            selectedCollaborators.set(collaborator.id, {
                id: collaborator.id,
                name: collaborator.name || "HackLab Collaborator",
                email: collaborator.email || "",
                avatar: collaborator.avatar || "images/avatar.png"
            });
        });
    }
}

function clearProjectDraft() {
    writeStorageJson(PROJECTS_UPLOAD_DRAFT_STORAGE_KEY, {
        title: "",
        summary: "",
        projectLink: "",
        selectedLane: getDefaultLaneFromFilter(),
        customLane: "",
        selectedCollaborators: []
    });
}

function setUploadCollapsed(nextValue) {
    isUploadCollapsed = Boolean(nextValue);

    if (projectUploadSection) {
        projectUploadSection.classList.toggle("is-collapsed", isUploadCollapsed);
    }

    if (projectUploadBody) {
        projectUploadBody.hidden = isUploadCollapsed;
    }

    if (toggleProjectUpload) {
        toggleProjectUpload.setAttribute("aria-expanded", String(!isUploadCollapsed));
        toggleProjectUpload.textContent = isUploadCollapsed ? "Expand" : "Minimize";
    }

    persistProjectsViewState();
}

function renderSelectedCollaborators() {
    if (!selectedCollaboratorsPanel || !selectedCollaboratorsList || !selectedCollaboratorsMeta) {
        return;
    }

    const collaborators = getSelectedCollaboratorEntries();
    selectedCollaboratorsPanel.hidden = !collaborators.length;

    if (!collaborators.length) {
        selectedCollaboratorsList.innerHTML = "";
        selectedCollaboratorsMeta.textContent = "Accepted collaborators will appear here once you add them.";
        return;
    }

    selectedCollaboratorsMeta.textContent = collaborators.length === 1
        ? "1 accepted collaborator is attached to this project draft."
        : `${collaborators.length} accepted collaborators are attached to this project draft.`;

    selectedCollaboratorsList.innerHTML = collaborators.map((collaborator) => `
        <div class="selected-collab-chip">
            <img src="${escapeHtml(collaborator.avatar || "images/avatar.png")}" alt="${escapeHtml(collaborator.name || "Collaborator")}" />
            <span>${escapeHtml(collaborator.name || "HackLab Collaborator")}</span>
            <button type="button" data-remove-collaborator="${escapeHtml(collaborator.id)}">Remove</button>
        </div>
    `).join("");
}

function syncSelectedCollaboratorsWithContacts() {
    const acceptedContacts = getAcceptedContactMap();

    [...selectedCollaborators.keys()].forEach((userId) => {
        const contact = acceptedContacts.get(userId);
        if (!contact) {
            selectedCollaborators.delete(userId);
            return;
        }

        selectedCollaborators.set(userId, {
            id: contact.userId,
            name: contact.name,
            email: contact.email || "",
            avatar: contact.avatar
        });
    });

    renderSelectedCollaborators();
    persistProjectDraft();
}

function loadFavouriteProjects() {
    try {
        const rawValue = window.localStorage.getItem(FAVOURITE_PROJECTS_STORAGE_KEY);
        const parsed = JSON.parse(rawValue || "[]");
        if (!Array.isArray(parsed)) return;
        parsed.forEach((value) => {
            if (typeof value === "string" && value.trim()) {
                favouriteProjects.add(value);
            }
        });
    } catch (error) {
        console.warn("Unable to load favourite projects:", error);
    }
}

function persistFavouriteProjects() {
    try {
        window.localStorage.setItem(FAVOURITE_PROJECTS_STORAGE_KEY, JSON.stringify([...favouriteProjects]));
    } catch (error) {
        console.warn("Unable to save favourite projects:", error);
    }
}

function normalizeProjectUrl(value) {
    const rawValue = String(value || "").trim();
    if (!rawValue) return null;

    const candidate = /^https?:\/\//i.test(rawValue) ? rawValue : `https://${rawValue}`;

    try {
        const url = new URL(candidate);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
            return null;
        }
        const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
        if (!hostname || !hostname.includes(".") || hostname.endsWith(".")) {
            return null;
        }
        url.hash = "";
        return url.toString();
    } catch {
        return null;
    }
}

const normalizeNetlifyUrl = normalizeProjectUrl;

function getProjectLinkLabel(projectLink) {
    try {
        return new URL(projectLink).hostname.replace(/^www\./, "");
    } catch {
        return "Live project";
    }
}

function getDefaultLaneFromFilter() {
    if (activeFilter === "ai") return "AI";
    if (activeFilter === "build") return "Build Logs";
    return "UI/UX";
}

function getProjectLaneInputs() {
    return Array.from(projectLaneOptions?.querySelectorAll('input[name="projectLane"]') || []);
}

function getSelectedProjectLane() {
    return getProjectLaneInputs().find((input) => input.checked)?.value || getDefaultLaneFromFilter();
}

function setSelectedProjectLane(value) {
    getProjectLaneInputs().forEach((input) => {
        input.checked = input.value === value;
    });
}

function formatCustomLane(value) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, 28);
}

function getCustomLaneOption() {
    return projectLaneOptions?.querySelector('[data-custom-lane="true"]') || null;
}

function hideCustomLaneComposer(clearInput = false) {
    if (customProjectLaneWrap) {
        customProjectLaneWrap.hidden = true;
    }

    if (clearInput && customProjectLaneInput) {
        customProjectLaneInput.value = "";
    }
}

function showCustomLaneComposer() {
    if (!customProjectLaneWrap) return;
    customProjectLaneWrap.hidden = false;
    customProjectLaneInput?.focus();
    customProjectLaneInput?.select();
}

function upsertCustomLaneOption(rawValue) {
    const laneValue = formatCustomLane(rawValue);
    if (!laneValue || !projectLaneOptions) return null;

    let customOption = getCustomLaneOption();
    if (!customOption) {
        customOption = document.createElement("label");
        customOption.className = "upload-lane-option is-custom";
        customOption.dataset.customLane = "true";
        customOption.innerHTML = `
            <input type="radio" name="projectLane" />
            <span></span>
        `;
        projectLaneOptions.appendChild(customOption);
    }

    const input = customOption.querySelector('input[name="projectLane"]');
    const label = customOption.querySelector("span");
    if (!input || !label) return null;

    customOption.hidden = false;
    input.value = laneValue;
    input.checked = true;
    label.textContent = laneValue;
    return customOption;
}

function resetCustomLane() {
    const customOption = getCustomLaneOption();
    if (!customOption) {
        hideCustomLaneComposer(true);
        return;
    }

    const input = customOption.querySelector('input[name="projectLane"]');
    const label = customOption.querySelector("span");
    if (input) {
        input.checked = false;
        input.value = "";
    }
    if (label) {
        label.textContent = "";
    }
    customOption.hidden = true;
    hideCustomLaneComposer(true);
}

function matchesFilter(project) {
    if (activeFilter === "featured") {
        return Boolean(project.isFeatured);
    }

    const haystack = `${project.title} ${project.summary} ${project.category} ${project.badge} ${project.status} ${project.projectLink || ""} ${(project.collaboratorNames || []).join(" ")}`.toLowerCase();

    if (activeFilter === "ui/ux") {
        return /ui|ux|design|brand|layout/.test(haystack);
    }

    if (activeFilter === "ai") {
        return /ai|assistant|voice|prompt|ml|machine/.test(haystack);
    }

    if (activeFilter === "build") {
        return /build|journal|showcase|case study|workflow|demo/.test(haystack);
    }

    return true;
}

function getVisibleProjects() {
    const query = searchQuery.trim().toLowerCase();
    let visibleProjects = allProjects.filter((project) => {
        if (!matchesFilter(project)) return false;
        if (!query) return true;

        const haystack = `${project.title} ${project.summary} ${project.ownerName} ${project.category} ${project.badge} ${project.status} ${project.projectLink || ""} ${(project.collaboratorNames || []).join(" ")}`.toLowerCase();
        return haystack.includes(query);
    });

    if (!visibleProjects.length && activeFilter === "featured") {
        visibleProjects = allProjects.filter((project) => {
            if (!query) return true;
            const haystack = `${project.title} ${project.summary} ${project.ownerName} ${project.category} ${project.badge} ${project.status} ${project.projectLink || ""} ${(project.collaboratorNames || []).join(" ")}`.toLowerCase();
            return haystack.includes(query);
        });
    }

    if (activeSidebarView === "mine") {
        visibleProjects = visibleProjects.filter((project) => isMineProject(project));
    }

    if (activeSidebarView === "favourites") {
        visibleProjects = visibleProjects.filter((project) => favouriteProjects.has(project.id));
    }

    if (activeSidebarView === "trending") {
        visibleProjects = [...visibleProjects].sort((left, right) => (right.likesCount || 0) - (left.likesCount || 0)).slice(0, 6);
    }

    return visibleProjects;
}

function updateFilterUi() {
    projectFilterPills?.querySelectorAll(".filter-pill").forEach((pill) => {
        pill.classList.toggle("active", pill.dataset.filter === activeFilter);
    });
}

function syncSearchInputs(source) {
    const nextValue = source?.value || "";
    searchQuery = nextValue;

    if (projectsSearchInput && projectsSearchInput !== source) {
        projectsSearchInput.value = nextValue;
    }
    if (projectsSidebarSearch && projectsSidebarSearch !== source) {
        projectsSidebarSearch.value = nextValue;
    }

    persistProjectsViewState();
    renderProjectsPage();
}

function renderHeroStats(visibleProjects) {
    const heroValues = document.querySelectorAll(".hero-stat strong");
    const heroSubLabels = document.querySelectorAll(".hero-stat .hero-stat-sub");
    const collabCount = getVisibleOpenCollaborators().length;

    if (heroValues[0]) {
        heroValues[0].textContent = String(visibleProjects.length).padStart(2, "0");
    }

    if (heroValues[1]) {
        heroValues[1].textContent = String(collabCount).padStart(2, "0");
    }

    if (heroSubLabels[0]) {
        heroSubLabels[0].textContent = visibleProjects.length === 1 ? "active project card" : "active project cards";
    }

    if (heroSubLabels[1]) {
        heroSubLabels[1].textContent = collabCount === 1 ? "student open to collaborate" : "students open to collaborate";
    }
}

function renderProjectsGrid(visibleProjects) {
    if (!projectsGrid) return;

    if (!visibleProjects.length) {
        projectsGrid.innerHTML = `
            <div class="project-card">
                <div class="card-body">
                    <div class="card-topline">
                        <span class="card-tag">No matches</span>
                        <span class="card-status">Try again</span>
                    </div>
                    <h3 class="card-title">No project cards match this filter</h3>
                    <p class="card-desc">Clear the search or switch filters.</p>
                </div>
            </div>
        `;
        return;
    }

    projectsGrid.innerHTML = visibleProjects.map((project) => `
        <div class="project-card" data-project-id="${escapeHtml(project.id)}">
            <div class="card-body">
                <div class="card-topline">
                    <span class="card-tag">${escapeHtml(project.category || "Student Build")}</span>
                    <span class="card-status">${escapeHtml(project.status || "New")}</span>
                </div>
                <h3 class="card-title">${escapeHtml(project.title)}</h3>
                <p class="card-desc">${escapeHtml(compactText(project.summary, 74, "A clean student build worth opening."))}</p>
                ${project.projectLink ? `
                    <a class="project-link-anchor" href="${escapeHtml(project.projectLink)}" target="_blank" rel="noopener noreferrer">
                        ${escapeHtml(getProjectLinkLabel(project.projectLink))}
                    </a>
                ` : ""}
                <button
                    class="project-save-btn ${favouriteProjects.has(project.id) ? "is-saved" : ""}"
                    type="button"
                    data-save-project="${escapeHtml(project.id)}"
                >
                    ${favouriteProjects.has(project.id) ? "Saved" : "Save"}
                </button>
                <details class="project-details">
                    <summary class="details-toggle">More details</summary>
                    <p class="card-extra">${escapeHtml(buildProjectDetailsText(project))}</p>
                </details>
                <div class="card-footer">
                    <span class="likes-count likes-trigger" data-project-id="${escapeHtml(project.id)}" data-visibility="${escapeHtml(project.visibility || "public")}" tabindex="0">${escapeHtml(formatCompactCount(project.likesCount))} likes</span>
                    <div class="card-footer-actions">
                        ${isOwnedProject(project) ? `<button class="project-delete-btn" type="button" data-delete-project="${escapeHtml(project.id)}">Delete</button>` : ""}
                        <button class="checkout-btn" type="button" data-open-project="${escapeHtml(project.id)}">Check Out</button>
                    </div>
                </div>
            </div>
        </div>
    `).join("");
}

function renderPulseWidget() {
    if (!projectPulse) return;

    const readyToSubmit = allProjects.filter((project) => /new|live|demo|polished/i.test(project.status || "")).length;
    const waitingForReview = allProjects.filter((project) => /review/i.test(project.status || "")).length;
    const openForCollab = getVisibleOpenCollaborators().length;

    projectPulse.innerHTML = `
        <p class="section-kicker">Project pulse</p>
        <div class="pulse-row">
            <span>Ready now</span>
            <strong>${String(readyToSubmit).padStart(2, "0")}</strong>
        </div>
        <div class="pulse-row">
            <span>In review</span>
            <strong>${String(waitingForReview).padStart(2, "0")}</strong>
        </div>
        <div class="pulse-row">
            <span>Collab-ready</span>
            <strong>${String(openForCollab).padStart(2, "0")}</strong>
        </div>
    `;
}

function renderCollaborateWidget() {
    if (!collabWidget) return;
    const collabList = collabWidget.querySelector(".collab-list");
    if (!collabList) return;

    const suggestions = [];
    const seen = new Set();
    const acceptedContacts = getAcceptedContactMap();
    const pushSuggestion = (person = {}) => {
        if (!person.id || seen.has(person.id) || person.id === currentUser?.uid) {
            return;
        }

        seen.add(person.id);
        suggestions.push(person);
    };

    acceptedContacts.forEach((contact) => {
        const recentProject = allProjects.find((project) => {
            return project.ownerId === contact.userId
                || (Array.isArray(project.collaboratorIds) && project.collaboratorIds.includes(contact.userId));
        });

        pushSuggestion({
            id: contact.userId,
            name: contact.name || recentProject?.ownerName || "HackLab Collaborator",
            email: contact.email || "",
            avatar: contact.avatar || recentProject?.ownerAvatar || "images/avatar.png",
            focus: recentProject?.category || "Accepted collaborator",
            projectTitle: recentProject?.title || "Ready to join your next project"
        });
    });

    getVisibleOpenCollaborators().forEach((entry) => {
        const acceptedContact = acceptedContacts.get(entry.userId);
        const recentProject = allProjects.find((project) => {
            return project.ownerId === entry.userId
                || (Array.isArray(project.collaboratorIds) && project.collaboratorIds.includes(entry.userId));
        });

        pushSuggestion({
            id: entry.userId,
            name: acceptedContact?.name || entry.profile?.name || recentProject?.ownerName || "HackLab Student",
            email: acceptedContact?.email || entry.profile?.email || "",
            avatar: acceptedContact?.avatar || entry.profile?.avatar || recentProject?.ownerAvatar || "images/avatar.png",
            focus: entry.focus || recentProject?.category || "Open to collaborate",
            projectTitle: entry.projectTitle || recentProject?.title || "Ready to join a new build"
        });
    });

    const query = collabSearchQuery.trim().toLowerCase();
    const filteredSuggestions = query
        ? suggestions.filter((person) => {
            const haystack = `${person.name} ${person.focus} ${person.projectTitle}`.toLowerCase();
            return haystack.includes(query);
        })
        : suggestions;
    const visibleSuggestions = filteredSuggestions.slice(0, 8);
    if (collabCountPill) {
        collabCountPill.textContent = String(visibleSuggestions.length).padStart(2, "0");
    }

    if (!visibleSuggestions.length) {
        collabList.innerHTML = `
            <div class="collab-empty">
                No accepted collaborators or open students match right now. Try a different search or lane.
            </div>
        `;
        return;
    }

    collabList.innerHTML = visibleSuggestions.map((person) => `
        <article class="collab-card">
            <div class="collab-copy">
                <h4>${escapeHtml(person.name)}</h4>
                <p>${escapeHtml(person.focus)}</p>
                ${person.email ? `<span class="collab-context">${escapeHtml(person.email)}</span>` : ""}
                <span class="collab-context">Recent: ${escapeHtml(compactText(person.projectTitle, 26, "Student build"))}</span>
            </div>
            <button
                class="collab-request-btn ${getCollaborationButtonClass(person)}"
                type="button"
                data-collab-id="${escapeHtml(person.id)}"
                data-collab-name="${escapeHtml(person.name)}"
                data-collab-email="${escapeHtml(person.email || "")}"
                data-collab-avatar="${escapeHtml(person.avatar || "images/avatar.png")}"
            >
                ${escapeHtml(getCollaborationButtonLabel(person))}
            </button>
        </article>
    `).join("");
}

function syncCollaborationAccordion() {
    if (!openCollaboratePanel || !collabWidget) return;

    openCollaboratePanel.setAttribute("aria-expanded", String(isCollaborationOpen));
    openCollaboratePanel.classList.toggle("is-open", isCollaborationOpen);
    collabWidget.hidden = !isCollaborationOpen;
}

function renderSidebarViewState() {
    const viewButtons = [
        { element: openProjectComposer, view: "mine" },
        { element: openFavouriteProjects, view: "favourites" },
        { element: openTrendingProjects, view: "trending" }
    ];

    viewButtons.forEach(({ element, view }) => {
        element?.classList.toggle("is-active", activeSidebarView === view);
    });
}

function renderSidebarActionCounts() {
    const yourProjects = allProjects.filter((project) => isMineProject(project));
    const trendingProjects = [...allProjects].sort((left, right) => (right.likesCount || 0) - (left.likesCount || 0)).slice(0, 6);

    if (yourWorkCount) {
        yourWorkCount.textContent = String(yourProjects.length).padStart(2, "0");
    }
    if (favouritesCount) {
        favouritesCount.textContent = String(favouriteProjects.size).padStart(2, "0");
    }
    if (trendingCount) {
        trendingCount.textContent = String(trendingProjects.length).padStart(2, "0");
    }
}

function renderProjectsPage() {
    updateFilterUi();
    syncCollaborationAccordion();
    syncCollaborationAvailabilityToggle();

    const visibleProjects = getVisibleProjects();
    renderHeroStats(visibleProjects);
    renderProjectsGrid(visibleProjects);
    renderPulseWidget();
    renderCollaborateWidget();
    renderSidebarViewState();
    renderSidebarActionCounts();
}

async function refreshProjects() {
    allProjects = await loadProjects("public", DEFAULT_PROJECTS);
    await refreshOpenCollaboratorStates();
    scheduleProjectsPageRender();
}

function scheduleProjectsPageRender() {
    if (projectsRefreshFrame) {
        return;
    }

    projectsRefreshFrame = window.requestAnimationFrame(() => {
        projectsRefreshFrame = null;
        renderProjectsPage();
    });
}

async function refreshCollaborationState() {
    if (!currentUser?.uid) return;

    const localAvailability = readLocalCollaborationAvailability();
    const fallbackState = {
        ...currentCollaborationState,
        userId: currentUser.uid,
        profile: {
            name: currentUserName,
            email: currentUser?.email || currentCollaborationState.profile?.email || "",
            avatar: currentUserAvatar,
            role: "student"
        },
        isOpenToCollaborate: localAvailability ?? currentCollaborationState.isOpenToCollaborate
    };

    currentCollaborationState = await loadUserCollaborationState(getCollaborationIdentity(), fallbackState);
    if (localAvailability !== null) {
        currentCollaborationState = {
            ...currentCollaborationState,
            profile: {
                name: currentUserName,
                email: currentUser?.email || currentCollaborationState.profile?.email || "",
                avatar: currentUserAvatar,
                role: "student"
            },
            isOpenToCollaborate: localAvailability
        };
    } else {
        persistLocalCollaborationAvailability(currentCollaborationState.isOpenToCollaborate);
        currentCollaborationState = {
            ...currentCollaborationState,
            profile: {
                name: currentUserName,
                email: currentUser?.email || currentCollaborationState.profile?.email || "",
                avatar: currentUserAvatar,
                role: "student"
            }
        };
    }
    syncCollaborationAvailabilityToggle();
    syncSelectedCollaboratorsWithContacts();
    renderProjectsPage();
}

async function refreshOpenCollaboratorStates() {
    openCollaborators = (await loadOpenCollaborators())
        .filter((entry) => entry.userId && entry.userId !== currentUser?.uid);
}

async function bumpSubmittedProjects() {
    if (!currentUser) return;

    const profile = await loadStudentProfile(currentUser.uid, {
        ...DEFAULT_STUDENT_PROFILE,
        displayName: currentUserName
    });

    profile.displayName = currentUserName;
    profile.email = currentUser.email || profile.email || "";
    profile.role = profile.role || "student";
    profile.stats = {
        ...(profile.stats || {}),
        submittedProjects: (profile.stats?.submittedProjects || 0) + 1
    };

    await saveStudentProfile(currentUser.uid, profile);
}

async function handleProjectCreation(event) {
    event.preventDefault();

    if (!currentUser) return;

    const title = projectTitleInput?.value.trim() || "";
    const summary = projectSummaryInput?.value.trim() || "";
    const category = getSelectedProjectLane();
    const projectLink = normalizeNetlifyUrl(projectNetlifyInput?.value || "");

    if (!title || !summary) {
        setUploadMessage("Add both a heading and a short description.", "error");
        return;
    }

    if (!projectLink) {
        setUploadMessage("Paste a valid live project link (e.g. https://your-project.com).", "error");
        return;
    }

    const acceptedContacts = getAcceptedContactMap();
    const collaboratorEntries = getSelectedCollaboratorEntries().filter((collaborator) => acceptedContacts.has(collaborator.id));

    if (selectedCollaborators.size && collaboratorEntries.length !== selectedCollaborators.size) {
        setUploadMessage("Only accepted collaborators can be added to a project card.", "error");
        return;
    }

    try {
        await createProject({
            visibility: "public",
            ownerId: currentUser.uid,
            ownerName: currentUserName,
            ownerAvatar: currentUserAvatar,
            collaboratorIds: [currentUser.uid, ...collaboratorEntries.map((collaborator) => collaborator.id)],
            collaboratorNames: [currentUserName, ...collaboratorEntries.map((collaborator) => collaborator.name)],
            collaboratorAvatars: [currentUserAvatar, ...collaboratorEntries.map((collaborator) => collaborator.avatar || "images/avatar.png")],
            title,
            summary,
            category,
            badge: "Live",
            status: collaboratorEntries.length ? "Collab Live Demo" : "Live Demo",
            imageUrl: "images/session.png",
            projectLink
        });

        await bumpSubmittedProjects();
        await refreshProjects();
        projectUploadForm?.reset();
        selectedCollaborators.clear();
        resetCustomLane();
        setSelectedProjectLane(getDefaultLaneFromFilter());
        clearProjectDraft();
        renderSelectedCollaborators();
        setUploadMessage(
            collaboratorEntries.length
                ? "Project added. Your accepted collaborator is attached to the live card."
                : "Project added. Students can open the live project build now.",
            "success"
        );
        searchQuery = title;
        syncSearchInputs({ value: searchQuery });
    } catch (error) {
        console.error("Unable to create project:", error);
        setUploadMessage("Unable to add the project right now.", "error");
    }
}

async function handleProjectLike(target) {
    const projectId = target.dataset.projectId;
    const visibility = target.dataset.visibility || "public";
    if (!projectId) return;

    try {
        await likeProject(visibility, projectId);
        await refreshProjects();
    } catch (error) {
        console.error("Unable to like project:", error);
    }
}

async function handleProjectDelete(target) {
    const projectId = target.dataset.deleteProject;
    if (!projectId || !currentUser?.uid) return;

    const project = allProjects.find((item) => item.id === projectId);
    if (!project || !isOwnedProject(project)) return;

    if (!window.confirm(`Delete "${project.title}" from your projects?`)) {
        return;
    }

    try {
        await deleteProject(project.visibility || "public", projectId, currentUser.uid);
        await refreshProjects();
        setUploadMessage(`${project.title} has been removed from your project list.`, "success");
    } catch (error) {
        console.error("Unable to delete project:", error);
        setUploadMessage("Unable to delete that project right now.", "error");
    }
}

function handleProjectSave(target) {
    const projectId = target.dataset.saveProject;
    if (!projectId) return;

    if (favouriteProjects.has(projectId)) {
        favouriteProjects.delete(projectId);
        setUploadMessage("Project removed from favourites.");
    } else {
        favouriteProjects.add(projectId);
        setUploadMessage("Project saved to favourites.", "success");
    }

    persistFavouriteProjects();
    renderProjectsPage();
}

function handleProjectOpen(target) {
    const projectId = target.dataset.openProject;
    const project = allProjects.find((item) => item.id === projectId);
    if (!project) return;

    if (project.projectLink) {
        window.open(project.projectLink, "_blank", "noopener,noreferrer");
        return;
    }

    setUploadMessage(`No live project link is attached to ${project.title} yet.`, "error");
}

function handleOpenUpload(event) {
    event.preventDefault();
    activeSidebarView = activeSidebarView === "mine" ? "all" : "mine";
    setUploadCollapsed(false);
    if (activeSidebarView === "mine") {
        projectUploadSection?.scrollIntoView({ behavior: "smooth", block: "start" });
        hideCustomLaneComposer(false);
        setSelectedProjectLane(getDefaultLaneFromFilter());
        projectTitleInput?.focus();
    }
    persistProjectsViewState();
    renderProjectsPage();
}

function handleAddProjectLane(event) {
    event.preventDefault();
    const customOption = getCustomLaneOption();
    if (customOption) {
        const customInput = customOption.querySelector('input[name="projectLane"]');
        if (customProjectLaneInput && customInput?.value) {
            customProjectLaneInput.value = customInput.value;
        }
    }
    showCustomLaneComposer();
}

function handleSaveProjectLane() {
    const laneValue = formatCustomLane(customProjectLaneInput?.value || "");
    if (!laneValue) {
        setUploadMessage("Add a lane name before using it.", "error");
        return;
    }

    upsertCustomLaneOption(laneValue);
    hideCustomLaneComposer(false);
    persistProjectDraft();
    setUploadMessage(`Using lane: ${laneValue}.`);
}

function handleOpenCollaboration(event) {
    event.preventDefault();
    isCollaborationOpen = !isCollaborationOpen;
    persistProjectsViewState();
    syncCollaborationAccordion();
}

function handleToggleProjectUpload() {
    setUploadCollapsed(!isUploadCollapsed);
}

async function handleCollaborationAction(button) {
    if (!button || !currentUser?.uid) return;

    const collaboratorId = button.dataset.collabId;
    const collaboratorName = button.dataset.collabName || "HackLab Collaborator";
    const collaboratorEmail = button.dataset.collabEmail || "";
    const collaboratorAvatar = button.dataset.collabAvatar || "images/avatar.png";
    if (!collaboratorId) return;

    const actionLabel = getCollaborationButtonLabel({ id: collaboratorId });
    if (actionLabel === "Added") {
        selectedCollaborators.delete(collaboratorId);
        persistProjectDraft();
        renderSelectedCollaborators();
        renderCollaborateWidget();
        setUploadMessage(`${collaboratorName} removed from the project draft.`);
        return;
    }

    if (actionLabel === "Add") {
        selectedCollaborators.set(collaboratorId, {
            id: collaboratorId,
            name: collaboratorName,
            email: collaboratorEmail,
            avatar: collaboratorAvatar
        });
        persistProjectDraft();
        renderSelectedCollaborators();
        renderCollaborateWidget();
        setUploadMessage(`${collaboratorName} added to the project draft.`, "success");
        return;
    }

    try {
        button.disabled = true;
        await sendCollaborationRequest({
            fromIdentity: getCollaborationIdentity(),
            toIdentity: {
                uid: collaboratorId,
                name: collaboratorName,
                email: collaboratorEmail,
                avatar: collaboratorAvatar
            },
            lane: getSelectedProjectLane(),
            projectTitle: projectTitleInput?.value.trim() || ""
        });
        await refreshCollaborationState();
        setUploadMessage(`Collaboration request sent to ${collaboratorName}.`, "success");
    } catch (error) {
        console.error("Unable to send collaboration request:", error);
        setUploadMessage("Unable to send the collaboration request right now.", "error");
    } finally {
        button.disabled = false;
        renderCollaborateWidget();
    }
}

function handleOpenFavourites(event) {
    event.preventDefault();
    activeSidebarView = activeSidebarView === "favourites" ? "all" : "favourites";
    persistProjectsViewState();
    renderProjectsPage();
    projectsGrid?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function handleOpenTrending(event) {
    event.preventDefault();
    activeSidebarView = activeSidebarView === "trending" ? "all" : "trending";
    persistProjectsViewState();
    renderProjectsPage();
    projectsGrid?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function bindStaticEvents() {
    document.getElementById("logoutBtn")?.addEventListener("click", () => {
        signOut(auth).then(() => {
            window.location.href = "auth.html";
        }).catch((error) => {
            console.error("Logout Error:", error);
        });
    });

    projectsSearchInput?.addEventListener("input", (event) => {
        syncSearchInputs(event.target);
    });

    projectsSidebarSearch?.addEventListener("input", (event) => {
        syncSearchInputs(event.target);
    });

    collabSearchInput?.addEventListener("input", (event) => {
        collabSearchQuery = event.target.value || "";
        persistProjectsViewState();
        renderCollaborateWidget();
    });

    projectFilterPills?.addEventListener("click", (event) => {
        const pill = event.target.closest(".filter-pill");
        if (!pill) return;

        activeFilter = pill.dataset.filter || "featured";
        persistProjectsViewState();
        renderProjectsPage();
    });

    openProjectComposer?.addEventListener("click", handleOpenUpload);
    openFavouriteProjects?.addEventListener("click", handleOpenFavourites);
    openTrendingProjects?.addEventListener("click", handleOpenTrending);
    openCollaboratePanel?.addEventListener("click", handleOpenCollaboration);
    toggleProjectUpload?.addEventListener("click", handleToggleProjectUpload);
    collabAvailabilityToggle?.addEventListener("change", async (event) => {
        const nextValue = Boolean(event.target.checked);
        const nextState = {
            ...currentCollaborationState,
            userId: currentUser?.uid || "",
            profile: {
                name: currentUserName,
                avatar: currentUserAvatar,
                role: "student"
            },
            isOpenToCollaborate: nextValue
        };

        currentCollaborationState = nextState;
        persistLocalCollaborationAvailability(nextValue);
        syncCollaborationAvailabilityToggle();

        try {
            currentCollaborationState = await saveCollaborationState(currentUser?.uid || "", nextState);
            await refreshOpenCollaboratorStates();
            await refreshCollaborationState();
            setUploadMessage(
                currentCollaborationState.isOpenToCollaborate
                    ? "You are now visible to students who want to collaborate."
                    : "You are now hidden from the collaborate list.",
                "success"
            );
        } catch (error) {
            console.error("Unable to toggle collaboration availability:", error);
            setUploadMessage("Unable to update your collaboration availability right now.", "error");
            syncCollaborationAvailabilityToggle();
        }
    });
    addProjectLaneBtn?.addEventListener("click", handleAddProjectLane);
    saveProjectLaneBtn?.addEventListener("click", handleSaveProjectLane);
    projectUploadForm?.addEventListener("submit", handleProjectCreation);
    projectTitleInput?.addEventListener("input", persistProjectDraft);
    projectSummaryInput?.addEventListener("input", persistProjectDraft);
    projectNetlifyInput?.addEventListener("input", persistProjectDraft);
    projectLaneOptions?.addEventListener("change", persistProjectDraft);
    customProjectLaneInput?.addEventListener("input", persistProjectDraft);

    customProjectLaneInput?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            handleSaveProjectLane();
        }
    });

    projectsGrid?.addEventListener("click", (event) => {
        const likeTarget = event.target.closest(".likes-trigger");
        if (likeTarget) {
            handleProjectLike(likeTarget);
            return;
        }

        const openTarget = event.target.closest("[data-open-project]");
        if (openTarget) {
            handleProjectOpen(openTarget);
            return;
        }

        const deleteTarget = event.target.closest("[data-delete-project]");
        if (deleteTarget) {
            handleProjectDelete(deleteTarget);
            return;
        }

        const saveTarget = event.target.closest("[data-save-project]");
        if (saveTarget) {
            handleProjectSave(saveTarget);
        }
    });

    collabWidget?.addEventListener("click", async (event) => {
        const requestButton = event.target.closest("[data-collab-id]");
        if (!requestButton) return;
        await handleCollaborationAction(requestButton);
    });

    selectedCollaboratorsList?.addEventListener("click", (event) => {
        const removeButton = event.target.closest("[data-remove-collaborator]");
        if (!removeButton) return;

        const collaboratorId = removeButton.dataset.removeCollaborator;
        if (!collaboratorId) return;

        selectedCollaborators.delete(collaboratorId);
        persistProjectDraft();
        renderSelectedCollaborators();
        renderCollaborateWidget();
    });

    projectsGrid?.addEventListener("keydown", (event) => {
        const likeTarget = event.target.closest(".likes-trigger");
        if (!likeTarget) return;

        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleProjectLike(likeTarget);
        }
    });
}

restoreProjectsViewState();
restoreProjectDraft();
bindStaticEvents();
loadFavouriteProjects();
syncCollaborationAccordion();
setUploadCollapsed(isUploadCollapsed);
renderSelectedCollaborators();

function handleProjectsBootstrap(event) {
    const cachedProjects = peekBootstrapProjects("public");
    if (cachedProjects) {
        allProjects = cachedProjects;
        scheduleProjectsPageRender();
    }
}

onAuthStateChanged(auth, async (user) => {
    if (!(await guardStudentPortal(user))) {
        stopBootstrapRefresh?.();
        stopBootstrapRefresh = null;
        stopBootstrapPolling();
        return;
    }

    currentUser = user;
    const cachedName = (typeof window !== "undefined" && window.localStorage?.getItem("hacklab.userDisplayName")) || "";
    currentUserName = (user.displayName && user.displayName !== "HackLab Student")
        ? user.displayName
        : (cachedName || getDisplayName(user, "Student"));
    currentUserAvatar = user.photoURL || "images/avatar.png";

    window.removeEventListener("hacklab:bootstrap", handleProjectsBootstrap);
    window.addEventListener("hacklab:bootstrap", handleProjectsBootstrap);

    try {
        await loadBootstrap(user.uid);
    } catch (error) {
        console.warn("Unable to load projects bootstrap:", error);
    }

    await Promise.all([
        refreshProjects(),
        refreshCollaborationState()
    ]);

    stopBootstrapRefresh?.();
    stopBootstrapRefresh = startBootstrapPolling(user.uid);
});
