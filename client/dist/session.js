const USER_ID_KEY = "userId";
const USERNAME_KEY = "username";
export function saveSession(userId, username) {
    sessionStorage.setItem(USER_ID_KEY, userId);
    sessionStorage.setItem(USERNAME_KEY, username);
    return { userId, username };
}
export function getSession() {
    const userId = sessionStorage.getItem(USER_ID_KEY);
    const username = sessionStorage.getItem(USERNAME_KEY);
    if (!userId || !username) {
        return null;
    }
    return { userId, username };
}
export function requireSession(redirectTo = "login.html") {
    const session = getSession();
    if (!session) {
        window.location.href = redirectTo;
        return null;
    }
    return session;
}
export function usernameFromEmail(email, fullName) {
    const name = fullName?.trim();
    if (name) {
        return name;
    }
    const local = email.split("@")[0]?.trim();
    return local && local.length > 0 ? local : "peer";
}
export function createPeerId(username) {
    return `${sanitizePeerPart(username)}_${crypto.randomUUID().slice(0, 8)}`;
}
export function displayNameFromPeerId(peerId) {
    const index = peerId.lastIndexOf("_");
    if (index <= 0) {
        return peerId;
    }
    return peerId.slice(0, index).replace(/-/g, " ");
}
function sanitizePeerPart(value) {
    const cleaned = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 16);
    return cleaned || "peer";
}
//# sourceMappingURL=session.js.map