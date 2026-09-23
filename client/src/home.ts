import { requireSession } from "./session.js";

const session = requireSession();
if (session) {
  const avatar = document.querySelector("header .size-9.rounded-full span");
  if (avatar) {
    avatar.textContent = initials(session.username);
  }

  const createBtn = document.getElementById("instantMeetingBtn");
  createBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    const roomId = createRoomId();
    window.location.href = `meeting.html?room=${encodeURIComponent(roomId)}`;
  });

  const input = document.getElementById("roomCodeInput") as HTMLInputElement | null;
  const joinBtn = document.getElementById("submitCodeBtn");

  const joinRoom = (): void => {
    const roomId = parseRoomId(input?.value ?? "");
    if (!roomId) {
      window.alert("Enter a room code to join.");
      return;
    }
    window.location.href = `meeting.html?room=${encodeURIComponent(roomId)}`;
  };

  joinBtn?.addEventListener("click", joinRoom);
  input?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      joinRoom();
    }
  });
}

function createRoomId(): string {
  return `${randomPart()}-${randomPart()}`;
}

function randomPart(): string {
  return Math.random().toString(36).slice(2, 6);
}

function parseRoomId(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const url = new URL(trimmed, window.location.origin);
    const room = url.searchParams.get("room");
    if (room) {
      return room.trim();
    }
  } catch {
    // not a URL
  }
  return trimmed.replace(/^#/, "");
}

function initials(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) {
    return "U";
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
