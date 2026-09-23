import { saveSession, usernameFromEmail } from "./session.js";
function showToast(message, isError = false) {
    const toast = document.getElementById("toast");
    const msgEl = document.getElementById("toast-message");
    const iconEl = document.getElementById("toast-icon");
    if (!toast || !msgEl || !iconEl) {
        return;
    }
    msgEl.textContent = message;
    iconEl.textContent = isError ? "error" : "check_circle";
    iconEl.className = isError
        ? "material-symbols-outlined text-secondary-fixed-dim text-[20px]"
        : "material-symbols-outlined text-tertiary-fixed text-[20px]";
    toast.classList.remove("translate-y-20", "opacity-0");
    toast.classList.add("translate-y-0", "opacity-100");
    window.setTimeout(() => {
        toast.classList.remove("translate-y-0", "opacity-100");
        toast.classList.add("translate-y-20", "opacity-0");
    }, 3200);
}
function isSignUpMode() {
    const heading = document.getElementById("form-heading");
    return heading?.textContent === "Join Peer Mesh";
}
const form = document.getElementById("auth-form");
form?.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const emailInput = document.getElementById("email");
    const passwordInput = document.getElementById("password");
    const nameInput = document.getElementById("fullName");
    const btn = document.getElementById("submit-btn");
    const textEl = document.getElementById("submit-text");
    const iconEl = document.getElementById("submit-icon");
    const spinner = document.getElementById("submit-spinner");
    const email = emailInput?.value.trim() ?? "";
    const password = passwordInput?.value.trim() ?? "";
    const fullName = nameInput?.value.trim() ?? "";
    if (!email || !password) {
        showToast("Email and password are required.", true);
        return;
    }
    if (isSignUpMode() && !fullName) {
        showToast("Full name is required to create an account.", true);
        return;
    }
    const username = usernameFromEmail(email, isSignUpMode() ? fullName : undefined);
    saveSession(email, username);
    if (btn) {
        btn.disabled = true;
    }
    if (textEl) {
        textEl.textContent = "Entering Room...";
    }
    iconEl?.classList.add("hidden");
    spinner?.classList.remove("hidden");
    showToast("Signed in. Opening home...");
    window.setTimeout(() => {
        window.location.href = "home.html";
    }, 400);
});
//# sourceMappingURL=login.js.map