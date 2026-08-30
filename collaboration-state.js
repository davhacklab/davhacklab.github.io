import {
    loadCollaborationState,
    normalizeCollaborationState,
    saveCollaborationState
} from "./portal-data.js";

function cloneData(value) {
    return JSON.parse(JSON.stringify(value));
}

function createDefaultState(userId = "") {
    return normalizeCollaborationState({
        userId,
        inbox: [],
        sent: [],
        contacts: []
    }, userId);
}

function normalizeIdentity(identity = {}) {
    return {
        uid: String(identity.uid || "").trim(),
        name: String(identity.name || identity.displayName || "HackLab Member").trim() || "HackLab Member",
        email: String(identity.email || "").trim(),
        avatar: String(identity.avatar || identity.photoURL || "images/avatar.png").trim() || "images/avatar.png",
        role: String(identity.role || "student").trim() || "student"
    };
}

function buildRequestNote(fromIdentity, lane = "", projectTitle = "") {
    if (lane && projectTitle) {
        return `${fromIdentity.name} wants to collaborate in ${lane} using ${projectTitle}.`;
    }

    if (lane) {
        return `${fromIdentity.name} wants to collaborate with you in ${lane}.`;
    }

    if (projectTitle) {
        return `${fromIdentity.name} wants to collaborate with you on ${projectTitle}.`;
    }

    return `${fromIdentity.name} wants to collaborate with you on a HackLab project.`;
}

function upsertContact(contacts = [], contact = {}) {
    const nextContact = {
        userId: contact.userId || "",
        name: contact.name || "HackLab Member",
        email: contact.email || "",
        avatar: contact.avatar || "images/avatar.png",
        role: contact.role || "student",
        connectedAt: contact.connectedAt || new Date().toISOString()
    };

    const filteredContacts = contacts.filter((item) => item.userId !== nextContact.userId);
    return [nextContact, ...filteredContacts];
}

export async function loadUserCollaborationState(identity = {}, fallbackState = null) {
    const normalizedIdentity = normalizeIdentity(identity);
    if (!normalizedIdentity.uid) {
        return createDefaultState();
    }

    return loadCollaborationState(
        normalizedIdentity.uid,
        fallbackState ? normalizeCollaborationState(fallbackState, normalizedIdentity.uid) : createDefaultState(normalizedIdentity.uid)
    );
}

export function getPendingCollaborationRequests(state = {}) {
    return normalizeCollaborationState(state).inbox.filter((request) => request.status === "pending");
}

export function getAcceptedCollaborationContacts(state = {}) {
    return normalizeCollaborationState(state).contacts;
}

export function hasAcceptedContact(state = {}, userId = "") {
    if (!userId) return false;
    return getAcceptedCollaborationContacts(state).some((contact) => contact.userId === userId);
}

export function findSentCollaborationRequest(state = {}, userId = "") {
    if (!userId) return null;
    return normalizeCollaborationState(state).sent.find((request) => request.toUserId === userId) || null;
}

export async function sendCollaborationRequest({
    fromIdentity,
    toIdentity,
    lane = "",
    projectTitle = ""
}) {
    const sender = normalizeIdentity(fromIdentity);
    const recipient = normalizeIdentity(toIdentity);

    if (!sender.uid || !recipient.uid) {
        throw new Error("Both users must be identified before sending a collaboration request.");
    }

    if (sender.uid === recipient.uid) {
        throw new Error("You cannot send a collaboration request to yourself.");
    }

    const [senderState, recipientState] = await Promise.all([
        loadUserCollaborationState(sender),
        loadUserCollaborationState(recipient)
    ]);

    if (hasAcceptedContact(senderState, recipient.uid)) {
        return {
            senderState,
            recipientState,
            status: "accepted"
        };
    }

    const existingRequest = findSentCollaborationRequest(senderState, recipient.uid);
    if (existingRequest?.status === "pending") {
        return {
            senderState,
            recipientState,
            status: "pending",
            request: existingRequest
        };
    }

    const requestId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `collab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    const note = buildRequestNote(sender, lane, projectTitle);

    const senderRequest = {
        id: requestId,
        fromUserId: sender.uid,
        fromUserName: sender.name,
        fromUserEmail: sender.email,
        fromUserAvatar: sender.avatar,
        toUserId: recipient.uid,
        toUserName: recipient.name,
        toUserEmail: recipient.email,
        toUserAvatar: recipient.avatar,
        lane,
        projectTitle,
        note,
        status: "pending",
        createdAt
    };

    const recipientRequest = cloneData(senderRequest);

    const nextSenderState = normalizeCollaborationState({
        ...senderState,
        userId: sender.uid,
        sent: [
            senderRequest,
            ...senderState.sent.filter((request) => request.toUserId !== recipient.uid)
        ]
    }, sender.uid);

    const nextRecipientState = normalizeCollaborationState({
        ...recipientState,
        userId: recipient.uid,
        inbox: [
            recipientRequest,
            ...recipientState.inbox.filter((request) => request.fromUserId !== sender.uid)
        ]
    }, recipient.uid);

    const [savedSenderState, savedRecipientState] = await Promise.all([
        saveCollaborationState(sender.uid, nextSenderState),
        saveCollaborationState(recipient.uid, nextRecipientState)
    ]);

    return {
        senderState: savedSenderState,
        recipientState: savedRecipientState,
        status: "pending",
        request: senderRequest
    };
}

export async function respondToCollaborationRequest({
    recipientIdentity,
    requestId,
    decision = "accepted"
}) {
    const recipient = normalizeIdentity(recipientIdentity);
    const normalizedDecision = decision === "declined" ? "declined" : "accepted";

    if (!recipient.uid || !requestId) {
        throw new Error("A valid request is required before responding.");
    }

    const recipientState = await loadUserCollaborationState(recipient);
    const request = recipientState.inbox.find((entry) => entry.id === requestId);

    if (!request) {
        throw new Error("Collaboration request not found.");
    }

    const sender = normalizeIdentity({
        uid: request.fromUserId,
        name: request.fromUserName,
        email: request.fromUserEmail,
        avatar: request.fromUserAvatar
    });
    const senderState = await loadUserCollaborationState(sender);

    const nextRecipientInbox = recipientState.inbox.map((entry) => {
        if (entry.id !== requestId) return entry;
        return {
            ...entry,
            status: normalizedDecision
        };
    });

    const nextSenderSent = senderState.sent.map((entry) => {
        if (entry.id !== requestId) return entry;
        return {
            ...entry,
            status: normalizedDecision
        };
    });

    const nextRecipientState = normalizeCollaborationState({
        ...recipientState,
        userId: recipient.uid,
        inbox: nextRecipientInbox,
        contacts: normalizedDecision === "accepted"
            ? upsertContact(recipientState.contacts, {
                userId: sender.uid,
                name: sender.name,
                email: sender.email,
                avatar: sender.avatar,
                role: sender.role
            })
            : recipientState.contacts
    }, recipient.uid);

    const nextSenderState = normalizeCollaborationState({
        ...senderState,
        userId: sender.uid,
        sent: nextSenderSent,
        contacts: normalizedDecision === "accepted"
            ? upsertContact(senderState.contacts, {
                userId: recipient.uid,
                name: recipient.name,
                email: recipient.email,
                avatar: recipient.avatar,
                role: recipient.role
            })
            : senderState.contacts
    }, sender.uid);

    const [savedRecipientState, savedSenderState] = await Promise.all([
        saveCollaborationState(recipient.uid, nextRecipientState),
        saveCollaborationState(sender.uid, nextSenderState)
    ]);

    return {
        recipientState: savedRecipientState,
        senderState: savedSenderState,
        request: {
            ...request,
            status: normalizedDecision
        }
    };
}
