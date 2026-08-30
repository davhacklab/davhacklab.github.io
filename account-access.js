import { getUserRole } from "./portal-data.js";

export async function resolveAccountRole(user) {
    const email = String(user?.email || "").trim();
    if (email) {
        return getUserRole(email);
    }

    return getUserRole(String(user?.uid || "").trim());
}

export async function guardStudentPortal(user) {
    if (!user) {
        window.location.href = "auth.html";
        return false;
    }

    const role = await resolveAccountRole(user);
    if (role === "teacher") {
        window.location.href = "teacher-dashboard.html";
        return false;
    }

    return true;
}

export async function guardTeacherPortal(user) {
    if (!user) {
        window.location.href = "auth.html";
        return false;
    }

    const role = await resolveAccountRole(user);
    if (role !== "teacher") {
        window.location.href = "dashboard.html";
        return false;
    }

    return true;
}
