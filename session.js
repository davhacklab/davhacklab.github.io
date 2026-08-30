/**
 * HackLab Session Room — PeerJS WebRTC
 * Role-based: host (teacher) vs student
 * Host controls: admit/deny, spotlight, screen share approval
 */

(function () {
  "use strict";

  // ====== URL PARAMS ======
  const params = new URLSearchParams(window.location.search);
  let roomId = params.get("room");
  const sessionTitle = params.get("title") || "HackLab Session";
  const userName = params.get("user") || "Participant";
  const role = params.get("role") || "student"; // "host" or "student"
  const isHost = role === "host";

  // ====== DOM REFS ======
  const mainVideo = document.getElementById("mainVideo");
  const mainVideoLabel = document.getElementById("mainVideoLabel");
  const mainVideoContainer = document.getElementById("mainVideoContainer");
  const selfVideo = document.getElementById("selfVideo");
  const participantStrip = document.getElementById("participantStrip");
  const chatMessages = document.getElementById("chatMessages");
  const chatInput = document.getElementById("chatInput");
  const btnSend = document.getElementById("btnSend");
  const btnMic = document.getElementById("btnMic");
  const btnCam = document.getElementById("btnCam");
  const btnScreen = document.getElementById("btnScreen");
  const btnEndCall = document.getElementById("btnEndCall");
  const btnBack = document.getElementById("btnBack");
  const btnCopyRoom = document.getElementById("btnCopyRoom");
  const roomIdDisplay = document.getElementById("roomIdDisplay");
  const roomTitleEl = document.getElementById("roomTitle");
  const roomSubtitleEl = document.getElementById("roomSubtitle");
  const participantCountEl = document.getElementById("participantCount");
  const admitQueueEl = document.getElementById("admitQueue");
  const waitingRoom = document.getElementById("waitingRoom");
  const btnLeaveWaiting = document.getElementById("btnLeaveWaiting");
  const spotlightBadge = document.getElementById("spotlightBadge");
  const screenSharePopup = document.getElementById("screenSharePopup");
  const screenSharePopupText = document.getElementById("screenSharePopupText");

  // ====== STATE ======
  let localStream = null;
  let screenStream = null;
  let peer = null;
  let connections = {}; // peerId -> { call, dataConn, stream, name, admitted }
  let waitingPeers = {}; // peerId -> { dataConn, name } — students waiting for admission
  let isMicOn = true;
  let isCamOn = true;
  let isScreenSharing = false;
  let currentSpotlight = null; // peerId currently spotlighted
  let screenShareApproved = isHost; // Host can always screen share
  let pendingScreenShareResolve = null;

  // Set room title
  roomTitleEl.textContent = sessionTitle;
  roomSubtitleEl.textContent = isHost ? "You are the host" : "HackLab Meeting Room";

  // ====== INIT ======
  async function init() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      mainVideo.srcObject = localStream;
      selfVideo.srcObject = localStream;
    } catch (err) {
      console.error("Media error:", err);
      addSystemMessage("⚠️ Could not access camera/microphone.");
    }

    if (isHost) {
      // Host: peer ID = room ID
      if (!roomId) roomId = generateRoomId();
      peer = new Peer(roomId, { debug: 0 });

      peer.on("open", (id) => {
        roomIdDisplay.textContent = roomId;
        updateUrl();
        addSystemMessage("🎓 You are the host. Share the room link to invite students.");
      });

      peer.on("error", (err) => {
        if (err.type === "unavailable-id") {
          // Room already exists, regenerate
          roomId = generateRoomId();
          peer = new Peer(roomId, { debug: 0 });
          setupHostListeners();
        }
        console.error("Peer error:", err);
      });

      setupHostListeners();
    } else {
      // Student: show waiting room, connect to host
      if (!roomId) {
        addSystemMessage("❌ No room ID provided.");
        return;
      }

      waitingRoom.style.display = "flex";

      peer = new Peer(undefined, { debug: 0 });

      peer.on("open", (id) => {
        roomIdDisplay.textContent = roomId;
        updateUrl();
        // Connect data channel to host for admission request
        const dataConn = peer.connect(roomId, { reliable: true });
        setupStudentDataChannel(dataConn);
      });

      peer.on("call", (call) => {
        if (localStream) call.answer(localStream);
        else call.answer();
        handleIncomingCall(call);
      });

      peer.on("connection", (dataConn) => {
        handlePeerDataConnection(dataConn);
      });

      peer.on("error", (err) => {
        console.error("Peer error:", err);
        addSystemMessage("❌ Could not connect to session. The host may not be online.");
        waitingRoom.style.display = "none";
      });
    }
  }

  function setupHostListeners() {
    peer.on("connection", (dataConn) => {
      // Student connecting — add to waiting list
      handleStudentJoinRequest(dataConn);
    });

    peer.on("call", (call) => {
      // Only answer calls from admitted students
      const peerId = call.peer;
      if (connections[peerId] && connections[peerId].admitted) {
        if (localStream) call.answer(localStream);
        else call.answer();
        handleIncomingCall(call);
      } else {
        // Queue the call — answer after admission
        if (!waitingPeers[peerId]) waitingPeers[peerId] = {};
        waitingPeers[peerId].pendingCall = call;
      }
    });
  }

  // ====== HOST: ADMISSION SYSTEM ======
  function handleStudentJoinRequest(dataConn) {
    const peerId = dataConn.peer;

    dataConn.on("open", () => {
      if (!waitingPeers[peerId]) waitingPeers[peerId] = {};
      waitingPeers[peerId].dataConn = dataConn;
    });

    dataConn.on("data", (raw) => {
      try {
        const msg = JSON.parse(raw);

        if (msg.type === "join-request") {
          // Student requesting admission
          if (!waitingPeers[peerId]) waitingPeers[peerId] = {};
          waitingPeers[peerId].name = msg.name || "Student";
          waitingPeers[peerId].dataConn = dataConn;
          renderAdmitQueue();
        } else if (msg.type === "chat" && connections[peerId] && connections[peerId].admitted) {
          addChatMessage(msg.sender || "Participant", msg.text, msg.time, false);
          // Relay chat to all other admitted peers
          broadcastToAll({ type: "chat", sender: msg.sender, text: msg.text, time: msg.time }, peerId);
        } else if (msg.type === "screen-share-request" && connections[peerId] && connections[peerId].admitted) {
          // Student requesting screen share permission
          handleScreenShareRequest(peerId, msg.name);
        } else if (msg.type === "name" && connections[peerId]) {
          connections[peerId].name = msg.name;
          updateParticipantTileLabel(peerId, msg.name);
        }
      } catch (e) {
        console.error("Data parse error:", e);
      }
    });

    dataConn.on("close", () => {
      if (waitingPeers[peerId]) {
        delete waitingPeers[peerId];
        renderAdmitQueue();
      }
      if (connections[peerId]) {
        removeParticipant(peerId);
      }
    });
  }

  function admitStudent(peerId) {
    const waiting = waitingPeers[peerId];
    if (!waiting) return;

    // Send admission confirmation
    if (waiting.dataConn && waiting.dataConn.open) {
      waiting.dataConn.send(JSON.stringify({ type: "admitted" }));
    }

    // Move from waiting to connections
    connections[peerId] = {
      dataConn: waiting.dataConn,
      name: waiting.name || "Student",
      admitted: true,
    };

    // Answer pending call if exists
    if (waiting.pendingCall) {
      if (localStream) waiting.pendingCall.answer(localStream);
      else waiting.pendingCall.answer();
      handleIncomingCall(waiting.pendingCall);
    } else {
      // Initiate call to student
      if (localStream) {
        const call = peer.call(peerId, localStream);
        handleIncomingCall(call);
      }
    }

    delete waitingPeers[peerId];
    renderAdmitQueue();
    updateParticipantCount();
    addSystemMessage(`🟢 ${connections[peerId].name} joined the session.`);

    // Notify all existing participants about the new one
    broadcastToAll({ type: "participant-joined", peerId, name: connections[peerId].name }, peerId);
  }

  function denyStudent(peerId) {
    const waiting = waitingPeers[peerId];
    if (waiting && waiting.dataConn && waiting.dataConn.open) {
      waiting.dataConn.send(JSON.stringify({ type: "denied" }));
    }
    delete waitingPeers[peerId];
    renderAdmitQueue();
  }

  function renderAdmitQueue() {
    const waitingList = Object.entries(waitingPeers).filter(([_, w]) => w.name);

    if (waitingList.length === 0) {
      admitQueueEl.style.display = "none";
      return;
    }

    admitQueueEl.style.display = "flex";
    admitQueueEl.innerHTML = waitingList.map(([pid, w]) => `
      <div class="join-request">
        <span><strong>${escapeHtml(w.name)}</strong> wants to join</span>
        <button class="btn-reject" data-deny="${pid}">✕</button>
        <button class="btn-accept" data-admit="${pid}">✓</button>
      </div>
    `).join("");

    admitQueueEl.querySelectorAll("[data-admit]").forEach((btn) => {
      btn.addEventListener("click", () => admitStudent(btn.dataset.admit));
    });
    admitQueueEl.querySelectorAll("[data-deny]").forEach((btn) => {
      btn.addEventListener("click", () => denyStudent(btn.dataset.deny));
    });
  }

  // ====== HOST: SCREEN SHARE APPROVAL ======
  function handleScreenShareRequest(peerId, name) {
    const conn = connections[peerId];
    if (!conn) return;

    // Show request to host in chat
    addSystemMessage(`📺 ${name || "A student"} is requesting to share their screen.`);

    // Add approve/deny inline
    const reqEl = document.createElement("div");
    reqEl.className = "chat-system-msg";
    reqEl.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; justify-content: center;">
        <button class="btn-accept" data-approve-ss="${peerId}" style="font-size:0.7rem; width:auto; padding:4px 12px; border-radius:6px;">Approve</button>
        <button class="btn-reject" data-deny-ss="${peerId}" style="font-size:0.7rem; width:auto; padding:4px 12px; border-radius:6px;">Deny</button>
      </div>
    `;
    chatMessages.appendChild(reqEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    reqEl.querySelector(`[data-approve-ss="${peerId}"]`).addEventListener("click", () => {
      if (conn.dataConn && conn.dataConn.open) {
        conn.dataConn.send(JSON.stringify({ type: "screen-share-approved" }));
      }
      reqEl.innerHTML = `<span>✅ Screen share approved for ${escapeHtml(name || "student")}</span>`;
    });

    reqEl.querySelector(`[data-deny-ss="${peerId}"]`).addEventListener("click", () => {
      if (conn.dataConn && conn.dataConn.open) {
        conn.dataConn.send(JSON.stringify({ type: "screen-share-denied" }));
      }
      reqEl.innerHTML = `<span>❌ Screen share denied for ${escapeHtml(name || "student")}</span>`;
    });
  }

  // ====== HOST: SPOTLIGHT ======
  function spotlightPeer(peerId) {
    currentSpotlight = peerId;

    // Update main video
    if (connections[peerId] && connections[peerId].stream) {
      mainVideo.srcObject = connections[peerId].stream;
      mainVideoLabel.querySelector("span").textContent = connections[peerId].name || "Participant";
      spotlightBadge.style.display = "block";
    }

    // Broadcast spotlight to all
    broadcastToAll({ type: "spotlight", peerId, name: connections[peerId]?.name || "Participant" });

    // Update tile highlights
    document.querySelectorAll(".participant-tile").forEach((t) => t.classList.remove("active-speaker"));
    const tile = document.getElementById("tile-" + peerId);
    if (tile) tile.classList.add("active-speaker");
  }

  function removeSpotlight() {
    currentSpotlight = null;
    if (localStream) {
      mainVideo.srcObject = localStream;
      mainVideoLabel.querySelector("span").textContent = "You";
    }
    spotlightBadge.style.display = "none";
    broadcastToAll({ type: "spotlight-clear" });
    document.querySelectorAll(".participant-tile").forEach((t) => t.classList.remove("active-speaker"));
  }

  // ====== STUDENT: DATA CHANNEL TO HOST ======
  function setupStudentDataChannel(dataConn) {
    dataConn.on("open", () => {
      // Send join request
      dataConn.send(JSON.stringify({ type: "join-request", name: userName }));
      connections["host"] = { dataConn, admitted: false };
    });

    dataConn.on("data", (raw) => {
      try {
        const msg = JSON.parse(raw);

        if (msg.type === "admitted") {
          // We're in!
          waitingRoom.style.display = "none";
          connections["host"].admitted = true;
          addSystemMessage("✅ You have been admitted to the session.");

          // Now call the host with our stream
          if (localStream) {
            const call = peer.call(roomId, localStream);
            handleIncomingCall(call);
          }
        } else if (msg.type === "denied") {
          waitingRoom.style.display = "none";
          addSystemMessage("❌ The host denied your request to join.");
          setTimeout(() => (window.location.href = "dashboard.html"), 2000);
        } else if (msg.type === "chat") {
          addChatMessage(msg.sender || "Participant", msg.text, msg.time, false);
        } else if (msg.type === "spotlight") {
          // Host spotlighted someone — update main video
          if (msg.peerId && connections[msg.peerId] && connections[msg.peerId].stream) {
            mainVideo.srcObject = connections[msg.peerId].stream;
            mainVideoLabel.querySelector("span").textContent = msg.name || "Participant";
            spotlightBadge.style.display = "block";
          }
        } else if (msg.type === "spotlight-clear") {
          // Host's stream as main (first connection is host for students)
          const hostConn = connections["host"];
          if (hostConn && hostConn.stream) {
            mainVideo.srcObject = hostConn.stream;
            mainVideoLabel.querySelector("span").textContent = "Host";
          }
          spotlightBadge.style.display = "none";
        } else if (msg.type === "screen-share-approved") {
          screenShareApproved = true;
          screenSharePopup.style.display = "none";
          if (pendingScreenShareResolve) {
            pendingScreenShareResolve(true);
            pendingScreenShareResolve = null;
          }
        } else if (msg.type === "screen-share-denied") {
          screenShareApproved = false;
          screenSharePopupText.textContent = "Screen share request denied by host.";
          setTimeout(() => (screenSharePopup.style.display = "none"), 2000);
          if (pendingScreenShareResolve) {
            pendingScreenShareResolve(false);
            pendingScreenShareResolve = null;
          }
        } else if (msg.type === "kicked") {
          addSystemMessage("🚫 You have been removed from the session.");
          setTimeout(() => endCall(), 1500);
        }
      } catch (e) {
        console.error("Data parse error:", e);
      }
    });

    dataConn.on("close", () => {
      addSystemMessage("🔴 Disconnected from the host.");
    });
  }

  // ====== COMMON: Handle peer data connections (for relayed messages) ======
  function handlePeerDataConnection(dataConn) {
    const peerId = dataConn.peer;

    dataConn.on("open", () => {
      if (!connections[peerId]) connections[peerId] = {};
      connections[peerId].dataConn = dataConn;

      dataConn.send(JSON.stringify({ type: "name", name: userName }));
    });

    dataConn.on("data", (raw) => {
      try {
        const msg = JSON.parse(raw);
        if (msg.type === "chat") {
          addChatMessage(msg.sender || "Participant", msg.text, msg.time, false);
        } else if (msg.type === "name") {
          if (connections[peerId]) {
            connections[peerId].name = msg.name;
            updateParticipantTileLabel(peerId, msg.name);
          }
        } else if (msg.type === "spotlight" && !isHost) {
          if (msg.peerId === peer.id) {
            // We're spotlighted — show our own stream
            mainVideo.srcObject = localStream;
            mainVideoLabel.querySelector("span").textContent = "You (Spotlight)";
          } else if (connections[msg.peerId] && connections[msg.peerId].stream) {
            mainVideo.srcObject = connections[msg.peerId].stream;
            mainVideoLabel.querySelector("span").textContent = msg.name || "Participant";
          }
          spotlightBadge.style.display = "block";
        } else if (msg.type === "spotlight-clear" && !isHost) {
          // Back to host video
          const hostStream = Object.values(connections).find((c) => c.stream);
          if (hostStream) {
            mainVideo.srcObject = hostStream.stream;
            mainVideoLabel.querySelector("span").textContent = "Host";
          }
          spotlightBadge.style.display = "none";
        }
      } catch (e) {
        console.error("Parse error:", e);
      }
    });

    dataConn.on("close", () => {
      removeParticipant(peerId);
    });
  }

  // ====== HANDLE INCOMING CALL ======
  function handleIncomingCall(call) {
    const peerId = call.peer;

    call.on("stream", (remoteStream) => {
      if (!connections[peerId]) connections[peerId] = {};
      connections[peerId].call = call;
      connections[peerId].stream = remoteStream;

      addParticipantTile(peerId, remoteStream);
      updateParticipantCount();

      // For students: first stream is the host — show as main video
      if (!isHost && mainVideo.srcObject === localStream) {
        mainVideo.srcObject = remoteStream;
        mainVideoLabel.querySelector("span").textContent = "Host";
      }
    });

    call.on("close", () => removeParticipant(peerId));
    call.on("error", () => removeParticipant(peerId));
  }

  // ====== PARTICIPANT TILES ======
  function addParticipantTile(peerId, stream) {
    if (document.getElementById("tile-" + peerId)) {
      const existingVid = document.getElementById("vid-" + peerId);
      if (existingVid) existingVid.srcObject = stream;
      return;
    }

    const tile = document.createElement("div");
    tile.className = "participant-tile";
    tile.id = "tile-" + peerId;

    const video = document.createElement("video");
    video.id = "vid-" + peerId;
    video.autoplay = true;
    video.playsInline = true;
    video.srcObject = stream;

    const name = document.createElement("span");
    name.className = "participant-name";
    name.textContent = (connections[peerId] && connections[peerId].name) || "Participant";

    tile.appendChild(video);
    tile.appendChild(name);

    // Click to switch main video (anyone can click)
    tile.addEventListener("click", () => {
      mainVideo.srcObject = stream;
      mainVideoLabel.querySelector("span").textContent = name.textContent;
      document.querySelectorAll(".participant-tile").forEach((t) => t.classList.remove("active-speaker"));
      tile.classList.add("active-speaker");
    });

    // Host: right-click context menu for spotlight
    if (isHost) {
      tile.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        if (currentSpotlight === peerId) {
          removeSpotlight();
        } else {
          spotlightPeer(peerId);
        }
      });

      // Add spotlight button
      const spotBtn = document.createElement("button");
      spotBtn.className = "tile-spotlight-btn";
      spotBtn.title = "Toggle Spotlight";
      spotBtn.textContent = "⭐";
      spotBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (currentSpotlight === peerId) removeSpotlight();
        else spotlightPeer(peerId);
      });
      tile.appendChild(spotBtn);
    }

    participantStrip.appendChild(tile);
  }

  function removeParticipant(peerId) {
    const tile = document.getElementById("tile-" + peerId);
    if (tile) tile.remove();

    const name = connections[peerId]?.name || "A participant";
    if (connections[peerId]) {
      if (connections[peerId].call) connections[peerId].call.close();
      delete connections[peerId];
    }
    updateParticipantCount();
    addSystemMessage(`🔴 ${name} left the session.`);

    // Reset main video if needed
    if (mainVideo.srcObject !== localStream) {
      const remaining = Object.values(connections).find((c) => c.stream);
      if (remaining) {
        mainVideo.srcObject = remaining.stream;
        mainVideoLabel.querySelector("span").textContent = remaining.name || "Participant";
      } else {
        mainVideo.srcObject = localStream;
        mainVideoLabel.querySelector("span").textContent = "You";
      }
    }
  }

  function updateParticipantTileLabel(peerId, name) {
    const tile = document.getElementById("tile-" + peerId);
    if (tile) {
      const label = tile.querySelector(".participant-name");
      if (label) label.textContent = name;
    }
  }

  function updateParticipantCount() {
    const count = 1 + Object.keys(connections).filter((k) => connections[k].admitted !== false).length;
    participantCountEl.textContent = count;
  }

  // ====== BROADCAST TO ALL ======
  function broadcastToAll(data, excludePeerId) {
    const json = JSON.stringify(data);
    Object.entries(connections).forEach(([pid, conn]) => {
      if (pid !== excludePeerId && conn.dataConn && conn.dataConn.open) {
        conn.dataConn.send(json);
      }
    });
  }

  // ====== CONTROLS ======
  btnMic.addEventListener("click", () => {
    if (!localStream) return;
    isMicOn = !isMicOn;
    localStream.getAudioTracks().forEach((t) => (t.enabled = isMicOn));
    btnMic.classList.toggle("muted", !isMicOn);
  });

  btnCam.addEventListener("click", () => {
    if (!localStream) return;
    isCamOn = !isCamOn;
    localStream.getVideoTracks().forEach((t) => (t.enabled = isCamOn));
    btnCam.classList.toggle("muted", !isCamOn);
  });

  btnScreen.addEventListener("click", async () => {
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    // Student: request permission first
    if (!isHost) {
      screenShareApproved = false;
      screenSharePopup.style.display = "flex";
      screenSharePopupText.textContent = "Requesting screen share permission from host...";

      // Send request to host
      const hostConn = connections["host"];
      if (hostConn && hostConn.dataConn && hostConn.dataConn.open) {
        hostConn.dataConn.send(JSON.stringify({ type: "screen-share-request", name: userName }));
      }

      // Wait for approval
      const approved = await new Promise((resolve) => {
        pendingScreenShareResolve = resolve;
        // Timeout after 30s
        setTimeout(() => {
          if (pendingScreenShareResolve) {
            pendingScreenShareResolve(false);
            pendingScreenShareResolve = null;
            screenSharePopupText.textContent = "Request timed out.";
            setTimeout(() => (screenSharePopup.style.display = "none"), 1500);
          }
        }, 30000);
      });

      if (!approved) return;
    }

    // Now actually share
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];

      Object.values(connections).forEach((conn) => {
        if (conn.call) {
          const sender = conn.call.peerConnection.getSenders().find((s) => s.track && s.track.kind === "video");
          if (sender) sender.replaceTrack(screenTrack);
        }
      });

      mainVideo.srcObject = screenStream;
      mainVideoLabel.querySelector("span").textContent = "Screen Share";
      isScreenSharing = true;
      btnScreen.classList.add("active");

      screenTrack.onended = () => stopScreenShare();
    } catch (err) {
      console.error("Screen share error:", err);
    }
  });

  function stopScreenShare() {
    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
      screenStream = null;
    }
    if (localStream) {
      const camTrack = localStream.getVideoTracks()[0];
      Object.values(connections).forEach((conn) => {
        if (conn.call) {
          const sender = conn.call.peerConnection.getSenders().find((s) => s.track && s.track.kind === "video");
          if (sender && camTrack) sender.replaceTrack(camTrack);
        }
      });
      mainVideo.srcObject = localStream;
      mainVideoLabel.querySelector("span").textContent = "You";
    }
    isScreenSharing = false;
    btnScreen.classList.remove("active");
    screenShareApproved = isHost;
  }

  btnEndCall.addEventListener("click", endCall);
  btnBack.addEventListener("click", endCall);
  if (btnLeaveWaiting) btnLeaveWaiting.addEventListener("click", endCall);

  async function endCall() {
    Object.values(connections).forEach((conn) => {
      if (conn.call) conn.call.close();
      if (conn.dataConn) conn.dataConn.close();
    });
    Object.values(waitingPeers).forEach((w) => {
      if (w.dataConn) w.dataConn.close();
    });
    connections = {};
    waitingPeers = {};
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    if (screenStream) screenStream.getTracks().forEach((t) => t.stop());
    if (peer) peer.destroy();

    // Mark session as ended in Firebase RTDB
    if (isHost && roomId) {
      try {
        const { getDatabase, ref, update } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js");
        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js");
        const firebaseConfig = {
          apiKey: "AIzaSyC2EOy4F6MmMDATo8sGCpmK-p2BEor3DeQ",
          authDomain: "hacklab-70033.firebaseapp.com",
          projectId: "hacklab-70033",
          storageBucket: "hacklab-70033.firebasestorage.app",
          messagingSenderId: "583481801792",
          appId: "1:583481801792:web:ba4ab54e541c415187f3a5",
          measurementId: "G-34QB0WY3LW"
        };
        const app = initializeApp(firebaseConfig, 'session-end');
        const db = getDatabase(app);
        update(ref(db, 'sessions/' + roomId), { status: 'ended' });
      } catch (e) {
        console.error("Error marking session as ended:", e);
      }
    }

    window.location.href = isHost ? "teacher-dashboard.html" : "dashboard.html";
  }

  // ====== CHAT ======
  btnSend.addEventListener("click", sendChat);
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChat();
    }
  });

  function sendChat() {
    const text = chatInput.value.trim();
    if (!text) return;
    const time = getTimeString();

    addChatMessage("You", text, time, true);

    const data = { type: "chat", sender: userName, text, time };

    if (isHost) {
      broadcastToAll(data);
    } else {
      // Send to host who relays
      const hostConn = connections["host"];
      if (hostConn && hostConn.dataConn && hostConn.dataConn.open) {
        hostConn.dataConn.send(JSON.stringify(data));
      }
    }

    chatInput.value = "";
    chatInput.focus();
  }

  function addChatMessage(sender, text, time, isSelf) {
    const el = document.createElement("div");
    el.className = "chat-message " + (isSelf ? "self" : "other");
    el.innerHTML = `
      <div class="chat-msg-header">
        <span class="chat-msg-sender">${escapeHtml(sender)}</span>
        <span class="chat-msg-time">${escapeHtml(time)}</span>
      </div>
      <div class="chat-msg-bubble">${escapeHtml(text)}</div>
    `;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function addSystemMessage(text) {
    const el = document.createElement("div");
    el.className = "chat-system-msg";
    el.innerHTML = `<span>${text}</span>`;
    chatMessages.appendChild(el);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // ====== COPY ROOM ID ======
  btnCopyRoom.addEventListener("click", () => {
    if (roomId) {
      const url = window.location.origin + window.location.pathname + "?role=student&room=" + roomId + "&title=" + encodeURIComponent(sessionTitle);
      navigator.clipboard.writeText(url).then(() => {
        const orig = roomIdDisplay.textContent;
        roomIdDisplay.textContent = "Copied!";
        setTimeout(() => (roomIdDisplay.textContent = orig), 1500);
      });
    }
  });

  // Self tile click
  document.getElementById("selfTile").addEventListener("click", () => {
    mainVideo.srcObject = localStream;
    mainVideoLabel.querySelector("span").textContent = "You";
    document.querySelectorAll(".participant-tile").forEach((t) => t.classList.remove("active-speaker"));
    document.getElementById("selfTile").classList.add("active-speaker");
    if (isHost && currentSpotlight) removeSpotlight();
  });

  // ====== HELPERS ======
  function generateRoomId() {
    const c = "abcdefghijklmnopqrstuvwxyz0123456789";
    let id = "hl-";
    for (let i = 0; i < 8; i++) id += c[Math.floor(Math.random() * c.length)];
    return id;
  }

  function getTimeString() {
    const now = new Date();
    let h = now.getHours();
    const m = now.getMinutes().toString().padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return h + ":" + m + " " + ampm;
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function updateUrl() {
    const url = new URL(window.location);
    url.searchParams.set("room", roomId);
    url.searchParams.set("title", sessionTitle);
    url.searchParams.set("role", role);
    window.history.replaceState({}, "", url);
  }

  // ====== START ======
  init();
})();
