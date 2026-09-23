import { createPeerId, displayNameFromPeerId, requireSession } from "./session.js";
import { SignalingClient } from "./websocket.js";
import { MeshPeerManager } from "./webrtc.js";
const session = requireSession();
const roomId = new URLSearchParams(window.location.search).get("room")?.trim() ?? "";
if (session && !roomId) {
    window.alert("Missing room id.");
    window.location.href = "home.html";
}
if (session && roomId) {
    void startMeeting(createPeerId(session.username), session.username, roomId);
}
async function startMeeting(localPeerId, username, currentRoomId) {
    hideMockTiles();
    setText("local-name", `${username} (You)`);
    setText("room-id-label", currentRoomId);
    setText("room-id-footer", currentRoomId);
    setText("header-initials", initials(username));
    updateParticipantCount(1);
    const localVideo = document.getElementById("local-video");
    const gallery = document.getElementById("view-gallery");
    if (!localVideo || !gallery) {
        return;
    }
    let localStream;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
        });
    }
    catch {
        window.alert("Camera or microphone permission is required.");
        window.location.href = "home.html";
        return;
    }
    localVideo.srcObject = localStream;
    localVideo.muted = true;
    await localVideo.play().catch(() => undefined);
    const signaling = new SignalingClient();
    const mesh = new MeshPeerManager(signaling, currentRoomId, (peerId, stream) => attachRemoteVideo(gallery, peerId, stream), (peerId) => {
        document.getElementById(`tile-${peerId}`)?.remove();
        updateParticipantCount(1 + mesh.peerCount());
    });
    mesh.setLocalStream(localStream);
    signaling.onMessage((message) => {
        void (async () => {
            switch (message.type) {
                case "ROOM_JOINED":
                    for (const peerId of message.peers) {
                        await mesh.connectToPeer(peerId);
                    }
                    updateParticipantCount(1 + mesh.peerCount());
                    break;
                case "USER_JOINED":
                    mesh.ensurePeer(message.peerId);
                    updateParticipantCount(1 + mesh.peerCount());
                    break;
                case "USER_LEFT":
                    mesh.removePeer(message.peerId);
                    break;
                case "OFFER":
                    if (message.fromPeerId && message.sdp) {
                        await mesh.handleOffer(message.fromPeerId, message.sdp);
                    }
                    break;
                case "ANSWER":
                    if (message.fromPeerId && message.sdp) {
                        await mesh.handleAnswer(message.fromPeerId, message.sdp);
                    }
                    break;
                case "ICE_CANDIDATE":
                    if (message.fromPeerId) {
                        await mesh.handleIce(message.fromPeerId, message.candidate, message.sdpMid, message.sdpMLineIndex);
                    }
                    break;
                case "ERROR":
                    console.error(message.message);
                    break;
            }
        })();
    });
    try {
        await signaling.connect();
        signaling.send({
            type: "JOIN_ROOM",
            roomId: currentRoomId,
            peerId: localPeerId,
        });
    }
    catch {
        window.alert("Could not connect to the signaling server at ws://localhost:3000.");
        stopStream(localStream);
        window.location.href = "home.html";
        return;
    }
    bindMediaButtons(localStream);
    bindLeave(() => {
        mesh.closeAll();
        signaling.close();
        stopStream(localStream);
    });
    document.getElementById("btn-leave-call")?.addEventListener("click", () => {
        mesh.closeAll();
        signaling.close();
        stopStream(localStream);
        window.location.href = "home.html";
    });
    bindCopy(currentRoomId);
}
function hideMockTiles() {
    document.querySelectorAll(".mock-remote-tile").forEach((el) => {
        el.classList.add("hidden");
    });
}
function attachRemoteVideo(gallery, peerId, stream) {
    const existing = document.getElementById(`video-${peerId}`);
    if (existing) {
        existing.srcObject = stream;
        return;
    }
    const tile = document.createElement("div");
    tile.id = `tile-${peerId}`;
    tile.className =
        "relative w-full h-full max-h-[78vh] bg-surface-card rounded-2xl overflow-hidden shadow-sm border border-surface-container flex items-center justify-center group aspect-video lg:aspect-auto";
    const video = document.createElement("video");
    video.id = `video-${peerId}`;
    video.autoplay = true;
    video.playsInline = true;
    video.className = "w-full h-full object-cover";
    video.srcObject = stream;
    const label = document.createElement("div");
    label.className =
        "absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-lg flex items-center gap-2 text-white text-xs font-medium tracking-wide";
    label.innerHTML = `<span class="material-symbols-outlined text-[16px] text-green-400">mic</span><span></span>`;
    const name = label.querySelector("span:last-child");
    if (name) {
        name.textContent = displayNameFromPeerId(peerId);
    }
    tile.append(video, label);
    gallery.append(tile);
    void video.play().catch(() => undefined);
}
function bindMediaButtons(stream) {
    const micBtn = document.getElementById("btn-toggle-mic");
    const camBtn = document.getElementById("btn-toggle-cam");
    const micIndicator = document.getElementById("alex-mic-indicator");
    const audio = stream.getAudioTracks()[0];
    const video = stream.getVideoTracks()[0];
    micBtn?.addEventListener("click", () => {
        if (!audio) {
            return;
        }
        audio.enabled = !audio.enabled;
        setControlState(micBtn, audio.enabled, "mic", "mic_off");
        if (micIndicator) {
            micIndicator.textContent = audio.enabled ? "mic" : "mic_off";
            micIndicator.className = audio.enabled
                ? "material-symbols-outlined text-[16px] text-green-400"
                : "material-symbols-outlined text-[16px] text-red-400";
        }
    });
    camBtn?.addEventListener("click", () => {
        if (!video) {
            return;
        }
        video.enabled = !video.enabled;
        setControlState(camBtn, video.enabled, "videocam", "videocam_off");
    });
}
function setControlState(button, enabled, onIcon, offIcon) {
    const icon = enabled ? onIcon : offIcon;
    button.innerHTML = `<span class="material-symbols-outlined text-[22px]">${icon}</span>`;
    if (enabled) {
        button.classList.add("bg-surface-card", "text-on-surface");
        button.classList.remove("bg-error", "text-white", "border-transparent");
    }
    else {
        button.classList.remove("bg-surface-card", "text-on-surface");
        button.classList.add("bg-error", "text-white", "border-transparent");
    }
}
function bindLeave(cleanup) {
    window.addEventListener("beforeunload", cleanup);
}
function bindCopy(roomId) {
    const copyBtn = document.getElementById("copy-room-btn");
    const toast = document.getElementById("toast-notification");
    copyBtn?.addEventListener("click", async () => {
        const link = `${window.location.origin}/meeting.html?room=${encodeURIComponent(roomId)}`;
        try {
            await navigator.clipboard.writeText(link);
        }
        catch {
            return;
        }
        toast?.classList.remove("opacity-0", "pointer-events-none");
        toast?.classList.add("opacity-100");
        window.setTimeout(() => {
            toast?.classList.remove("opacity-100");
            toast?.classList.add("opacity-0", "pointer-events-none");
        }, 2000);
    });
}
function updateParticipantCount(count) {
    const el = document.getElementById("participant-count");
    if (!el) {
        return;
    }
    el.textContent = `${count} participant${count === 1 ? "" : "s"}`;
}
function setText(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = value;
    }
}
function stopStream(stream) {
    for (const track of stream.getTracks()) {
        track.stop();
    }
}
function initials(name) {
    const parts = name.split(/[\s._-]+/).filter(Boolean);
    if (parts.length === 0) {
        return "U";
    }
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}
//# sourceMappingURL=meeting.js.map