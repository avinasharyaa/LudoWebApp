const BOARD_OFFSET = 70;
const CELL_SIZE = 44;
const TOKEN_RADIUS = 16;
const DICE_PIPS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8]
};

function gridCenter(col, row) {
  return {
    x: BOARD_OFFSET + col * CELL_SIZE + CELL_SIZE / 2,
    y: BOARD_OFFSET + row * CELL_SIZE + CELL_SIZE / 2
  };
}

function gridRect(col, row, width = 1, height = 1, inset = 0) {
  return {
    x: BOARD_OFFSET + col * CELL_SIZE + inset,
    y: BOARD_OFFSET + row * CELL_SIZE + inset,
    width: width * CELL_SIZE - inset * 2,
    height: height * CELL_SIZE - inset * 2
  };
}

function toCenters(cells) {
  return cells.map(([col, row]) => gridCenter(col, row));
}

function getStarPoints(cx, cy, outerRadius, innerRadius, points = 5) {
  const starPoints = [];

  for (let index = 0; index < points * 2; index += 1) {
    const angle = -Math.PI / 2 + (Math.PI * index) / points;
    const radius = index % 2 === 0 ? outerRadius : innerRadius;
    starPoints.push(`${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`);
  }

  return starPoints.join(" ");
}

const TRACK_GRID = [
  [8, 1],
  [8, 2],
  [8, 3],
  [8, 4],
  [8, 5],
  [9, 6],
  [10, 6],
  [11, 6],
  [12, 6],
  [13, 6],
  [14, 6],
  [14, 7],
  [14, 8],
  [13, 8],
  [12, 8],
  [11, 8],
  [10, 8],
  [9, 8],
  [8, 9],
  [8, 10],
  [8, 11],
  [8, 12],
  [8, 13],
  [8, 14],
  [7, 14],
  [6, 14],
  [6, 13],
  [6, 12],
  [6, 11],
  [6, 10],
  [6, 9],
  [5, 8],
  [4, 8],
  [3, 8],
  [2, 8],
  [1, 8],
  [0, 8],
  [0, 7],
  [0, 6],
  [1, 6],
  [2, 6],
  [3, 6],
  [4, 6],
  [5, 6],
  [6, 5],
  [6, 4],
  [6, 3],
  [6, 2],
  [6, 1],
  [6, 0],
  [7, 0],
  [8, 0]
];

const PLAYER_META = {
  green: {
    color: "#1ca44d",
    homeGrid: [
      [7, 2],
      [7, 3],
      [7, 4],
      [7, 5],
      [7, 6],
      [7, 7]
    ],
    label: "Green",
    laneFill: "#65d97a",
    softFill: "#e6f8ea",
    startIndex: 0,
    yardGrid: [
      [10, 2],
      [12, 2],
      [10, 4],
      [12, 4]
    ],
    zone: { col: 9, fill: "#17a34a", row: 0 }
  },
  yellow: {
    color: "#e5ba13",
    homeGrid: [
      [12, 7],
      [11, 7],
      [10, 7],
      [9, 7],
      [8, 7],
      [7, 7]
    ],
    label: "Yellow",
    laneFill: "#ffe36b",
    softFill: "#fff6cb",
    startIndex: 13,
    yardGrid: [
      [10, 10],
      [12, 10],
      [10, 12],
      [12, 12]
    ],
    zone: { col: 9, fill: "#f2c318", row: 9 }
  },
  blue: {
    color: "#2596f5",
    homeGrid: [
      [7, 12],
      [7, 11],
      [7, 10],
      [7, 9],
      [7, 8],
      [7, 7]
    ],
    label: "Blue",
    laneFill: "#77c5ff",
    softFill: "#e5f3ff",
    startIndex: 26,
    yardGrid: [
      [2, 10],
      [4, 10],
      [2, 12],
      [4, 12]
    ],
    zone: { col: 0, fill: "#2095f1", row: 9 }
  },
  red: {
    color: "#eb3a37",
    homeGrid: [
      [2, 7],
      [3, 7],
      [4, 7],
      [5, 7],
      [6, 7],
      [7, 7]
    ],
    label: "Red",
    laneFill: "#ff7b77",
    softFill: "#ffe3e2",
    startIndex: 39,
    yardGrid: [
      [2, 2],
      [4, 2],
      [2, 4],
      [4, 4]
    ],
    zone: { col: 0, fill: "#ee312e", row: 0 }
  }
};

for (const meta of Object.values(PLAYER_META)) {
  meta.homeSlots = toCenters(meta.homeGrid);
  meta.yardSlots = toCenters(meta.yardGrid);
}

const START_INDEX_TO_META = new Map(
  Object.values(PLAYER_META).map((meta) => [meta.startIndex, meta])
);

const SAFE_BOARD_INDEXES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const TRACK_COORDS = TRACK_GRID.map(([col, row]) => ({
  ...gridCenter(col, row),
  col,
  row
}));

const state = {
  isStreamLive: false,
  playerId: null,
  reconnectTimer: null,
  room: null,
  stream: null
};

const roomFromUrl = new URLSearchParams(window.location.search).get("room");

const createForm = document.getElementById("createForm");
const joinForm = document.getElementById("joinForm");
const createNameInput = document.getElementById("createName");
const joinNameInput = document.getElementById("joinName");
const joinCodeInput = document.getElementById("joinCode");
const welcomePanel = document.getElementById("welcomePanel");
const gamePanel = document.getElementById("gamePanel");
const roomCodeBadge = document.getElementById("roomCodeBadge");
const shareLinkInput = document.getElementById("shareLinkInput");
const copyLinkButton = document.getElementById("copyLinkButton");
const copyCodeButton = document.getElementById("copyCodeButton");
const connectionBadge = document.getElementById("connectionBadge");
const statusHeadline = document.getElementById("statusHeadline");
const statusSubline = document.getElementById("statusSubline");
const hostActions = document.getElementById("hostActions");
const turnActions = document.getElementById("turnActions");
const playersList = document.getElementById("playersList");
const logList = document.getElementById("logList");
const dicePanel = document.getElementById("dicePanel");
const boardHint = document.getElementById("boardHint");
const boardSvg = document.getElementById("boardSvg");
const toast = document.getElementById("toast");

createNameInput.value = localStorage.getItem("ludo:lastName") || "";
joinNameInput.value = localStorage.getItem("ludo:lastName") || "";
joinCodeInput.value = roomFromUrl || "";

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => {
    toast.classList.add("hidden");
  }, 2600);
}

function rememberName(name) {
  localStorage.setItem("ludo:lastName", name);
  createNameInput.value = name;
  joinNameInput.value = name;
}

function roomStorageKey(code) {
  return `ludo:room:${String(code || "").toUpperCase()}`;
}

function getStoredPlayerId(code) {
  return localStorage.getItem(roomStorageKey(code));
}

function storePlayerId(code, playerId) {
  localStorage.setItem(roomStorageKey(code), playerId);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function setConnectionState(kind, label) {
  state.isStreamLive = kind === "live";
  connectionBadge.textContent = label;
  connectionBadge.className = `connection-badge${kind === "live" ? " live" : kind === "down" ? " down" : ""}`;
}

function updateUrlWithRoom(code) {
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("room", code);
  window.history.replaceState({}, "", nextUrl);
}

function getViewer() {
  if (!state.room) {
    return null;
  }

  return state.room.players.find((player) => player.id === state.playerId) || null;
}

function getCurrentPlayer() {
  if (!state.room) {
    return null;
  }

  return state.room.players.find((player) => player.id === state.room.currentPlayerId) || null;
}

function getBoardIndex(player, progress) {
  return (PLAYER_META[player.color].startIndex + progress) % 52;
}

function getLegalMovesForViewer() {
  const viewer = getViewer();
  if (!viewer || !state.room || state.room.currentRoll == null || state.room.currentPlayerId !== viewer.id) {
    return [];
  }

  return viewer.tokenProgress
    .map((progress, tokenIndex) => {
      if (progress === -1) {
        return state.room.currentRoll === 6 ? { tokenIndex, from: -1, to: 0 } : null;
      }

      const next = progress + state.room.currentRoll;
      if (next > 57) {
        return null;
      }

      return { tokenIndex, from: progress, to: next };
    })
    .filter(Boolean);
}

function getPositionForToken(player, tokenIndex, progress) {
  const meta = PLAYER_META[player.color];
  if (progress === -1) {
    const { x, y } = meta.yardSlots[tokenIndex];
    return { key: `yard-${player.id}-${tokenIndex}`, x, y };
  }

  if (progress >= 0 && progress <= 51) {
    const boardIndex = getBoardIndex(player, progress);
    const { x, y } = TRACK_COORDS[boardIndex];
    return { key: `track-${boardIndex}`, x, y };
  }

  const { x, y } = meta.homeSlots[progress - 52];
  return { key: `home-${player.color}-${progress}`, x, y };
}

function getStackOffset(index, count) {
  if (count <= 1) {
    return { x: 0, y: 0 };
  }

  const angle = (Math.PI * 2 * index) / count - Math.PI / 2;
  const radius = count === 2 ? 10 : count <= 4 ? 13 : 16;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius
  };
}

function getDiceFaceMarkup(value) {
  const activePips = new Set(DICE_PIPS[value] || []);

  return `
    <div class="dice-face${value ? " active" : ""}" aria-hidden="true">
      ${Array.from({ length: 9 }, (_, index) => `
        <span class="dice-pip${activePips.has(index) ? " on" : ""}"></span>
      `).join("")}
    </div>
  `;
}

function setBoardHud(message, markup) {
  dicePanel.innerHTML = markup;
  boardHint.textContent = message;
}

function renderBoard() {
  const legalMoves = new Set(getLegalMovesForViewer().map((move) => move.tokenIndex));
  const tokenGroups = new Map();
  const boardFrame = gridRect(0, 0, 15, 15, 0);
  const centerFrame = gridRect(6, 6, 3, 3, 0);
  const centerPoint = gridCenter(7, 7);

  if (state.room) {
    for (const player of state.room.players) {
      player.tokenProgress.forEach((progress, tokenIndex) => {
        const slot = getPositionForToken(player, tokenIndex, progress);
        if (!tokenGroups.has(slot.key)) {
          tokenGroups.set(slot.key, []);
        }

        tokenGroups.get(slot.key).push({
          baseX: slot.x,
          baseY: slot.y,
          color: PLAYER_META[player.color].color,
          isLegal: player.id === state.playerId && legalMoves.has(tokenIndex),
          playerName: player.name,
          tokenIndex
        });
      });
    }
  }

  const zonesMarkup = Object.values(PLAYER_META)
    .map((meta) => {
      const zoneRect = gridRect(meta.zone.col, meta.zone.row, 6, 6, 0);
      const innerRect = gridRect(meta.zone.col + 1, meta.zone.row + 1, 4, 4, 0);

      return `
        <rect class="home-zone" x="${zoneRect.x}" y="${zoneRect.y}" width="${zoneRect.width}" height="${zoneRect.height}" fill="${meta.zone.fill}"></rect>
        <rect class="home-inner" x="${innerRect.x}" y="${innerRect.y}" width="${innerRect.width}" height="${innerRect.height}"></rect>
      `;
    })
    .join("");

  const yardMarkup = Object.values(PLAYER_META)
    .flatMap((meta) =>
      meta.yardSlots.map(
        ({ x, y }) => `<circle class="yard-pocket" cx="${x}" cy="${y}" r="20"></circle>`
      )
    )
    .join("");

  const trackMarkup = TRACK_COORDS.map(({ col, row, x, y }, index) => {
    const slotRect = gridRect(col, row, 1, 1, 2);
    const safe = SAFE_BOARD_INDEXES.has(index);
    const startMeta = START_INDEX_TO_META.get(index);
    const fill = startMeta ? startMeta.softFill : "#fffdf8";
    const stroke = startMeta ? startMeta.color : "rgba(14, 34, 72, 0.18)";
    const extraClass = `${safe ? " safe" : ""}${startMeta ? " start" : ""}`;

    return `
      <rect class="track-slot${extraClass}" x="${slotRect.x}" y="${slotRect.y}" width="${slotRect.width}" height="${slotRect.height}" rx="8" fill="${fill}" stroke="${stroke}"></rect>
      ${safe ? `<polygon class="safe-star" points="${getStarPoints(x, y, 10, 5)}"></polygon>` : ""}
    `;
  }).join("");

  const laneMarkup = Object.values(PLAYER_META)
    .flatMap((meta) =>
      meta.homeGrid.slice(0, -1).map(([col, row]) => {
        const laneRect = gridRect(col, row, 1, 1, 2);
        return `
          <rect class="lane-slot" x="${laneRect.x}" y="${laneRect.y}" width="${laneRect.width}" height="${laneRect.height}" rx="8" fill="${meta.laneFill}"></rect>
        `;
      })
    )
    .join("");

  const arrowMarkup = `
    <g class="board-arrow" fill="${PLAYER_META.green.color}">
      <rect x="394" y="50" width="12" height="22" rx="6"></rect>
      <polygon points="384,70 416,70 400,96"></polygon>
    </g>
    <g class="board-arrow" fill="${PLAYER_META.yellow.color}">
      <rect x="728" y="394" width="22" height="12" rx="6"></rect>
      <polygon points="704,400 730,384 730,416"></polygon>
    </g>
    <g class="board-arrow" fill="${PLAYER_META.blue.color}">
      <rect x="394" y="728" width="12" height="22" rx="6"></rect>
      <polygon points="384,730 416,730 400,704"></polygon>
    </g>
    <g class="board-arrow" fill="${PLAYER_META.red.color}">
      <rect x="50" y="394" width="22" height="12" rx="6"></rect>
      <polygon points="70,384 70,416 96,400"></polygon>
    </g>
  `;

  const centerMarkup = `
    <rect class="center-frame" x="${centerFrame.x}" y="${centerFrame.y}" width="${centerFrame.width}" height="${centerFrame.height}"></rect>
    <polygon class="center-triangle" fill="${PLAYER_META.green.color}" points="${centerFrame.x},${centerFrame.y} ${centerFrame.x + centerFrame.width},${centerFrame.y} ${centerPoint.x},${centerPoint.y}"></polygon>
    <polygon class="center-triangle" fill="${PLAYER_META.yellow.color}" points="${centerFrame.x + centerFrame.width},${centerFrame.y} ${centerFrame.x + centerFrame.width},${centerFrame.y + centerFrame.height} ${centerPoint.x},${centerPoint.y}"></polygon>
    <polygon class="center-triangle" fill="${PLAYER_META.blue.color}" points="${centerFrame.x},${centerFrame.y + centerFrame.height} ${centerFrame.x + centerFrame.width},${centerFrame.y + centerFrame.height} ${centerPoint.x},${centerPoint.y}"></polygon>
    <polygon class="center-triangle" fill="${PLAYER_META.red.color}" points="${centerFrame.x},${centerFrame.y} ${centerFrame.x},${centerFrame.y + centerFrame.height} ${centerPoint.x},${centerPoint.y}"></polygon>
    <circle class="center-core" cx="${centerPoint.x}" cy="${centerPoint.y}" r="12"></circle>
  `;

  const tokenMarkup = Array.from(tokenGroups.values())
    .flatMap((group) =>
      group.map((token, index) => {
        const offset = getStackOffset(index, group.length);
        const tokenIndexAttr = token.isLegal ? ` data-token-index="${token.tokenIndex}"` : "";
        const interactionAttrs = token.isLegal ? ' tabindex="0" role="button"' : "";
        return `
          <g class="token${token.isLegal ? " legal" : ""}"${tokenIndexAttr}${interactionAttrs} transform="translate(${token.baseX + offset.x} ${token.baseY + offset.y})">
            ${token.isLegal ? '<circle class="token-hitbox" r="30"></circle>' : ""}
            <ellipse class="token-shadow" cx="2" cy="16" rx="12" ry="5"></ellipse>
            <circle class="token-circle" r="${TOKEN_RADIUS}" fill="${token.color}"></circle>
            <circle class="token-sheen" cx="-4" cy="-5" r="5"></circle>
            <text class="token-text" y="1">${token.tokenIndex + 1}</text>
            <title>${token.playerName} token ${token.tokenIndex + 1}</title>
          </g>
        `;
      })
    )
    .join("");

  boardSvg.innerHTML = `
    <defs>
      <filter id="boardShadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="0" dy="18" stdDeviation="16" flood-color="rgba(8,20,45,0.26)"></feDropShadow>
      </filter>
    </defs>
    <g filter="url(#boardShadow)">
      <rect class="board-surface" x="${boardFrame.x}" y="${boardFrame.y}" width="${boardFrame.width}" height="${boardFrame.height}" rx="18"></rect>
      ${zonesMarkup}
      ${yardMarkup}
      ${trackMarkup}
      ${laneMarkup}
      ${centerMarkup}
    </g>
    ${arrowMarkup}
    ${tokenMarkup}
  `;
}

function renderPlayers() {
  if (!state.room) {
    playersList.innerHTML = "";
    return;
  }

  const winner = state.room.players.find((player) => player.id === state.room.winnerId) || null;

  playersList.innerHTML = state.room.players
    .map((player) => {
      const homeCount = player.tokenProgress.filter((progress) => progress === 57).length;
      const activeClass = player.id === state.room.currentPlayerId ? " active" : "";
      const chips = [];

      if (player.id === state.playerId) {
        chips.push('<span class="pill">You</span>');
      }
      if (player.id === state.room.hostId) {
        chips.push('<span class="pill">Host</span>');
      }
      if (player.online) {
        chips.push('<span class="pill">Online</span>');
      }
      if (winner && winner.id === player.id) {
        chips.push('<span class="pill">Winner</span>');
      }

      return `
        <div class="player-row${activeClass}">
          <span class="player-chip" style="background:${PLAYER_META[player.color].color}"></span>
          <div>
            <div class="player-name">
              <strong>${player.name}</strong>
              ${chips.join("")}
            </div>
            <div class="label">${PLAYER_META[player.color].label} · ${homeCount}/4 home</div>
          </div>
          <div class="pill">${player.tokenProgress.filter((progress) => progress === -1).length} yard</div>
        </div>
      `;
    })
    .join("");
}

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function renderLog() {
  if (!state.room) {
    logList.innerHTML = "";
    return;
  }

  logList.innerHTML = state.room.log
    .map(
      (entry) => `
        <div class="log-row">
          <p>${entry.text}</p>
          <div class="log-time">${formatTime(entry.createdAt)}</div>
        </div>
      `
    )
    .join("");
}

function renderStatus() {
  if (!state.room) {
    statusHeadline.textContent = "Create or join a room to begin.";
    statusSubline.textContent = "";
    hostActions.innerHTML = "";
    turnActions.innerHTML = "";
    setBoardHud(
      "Create a room or join with a code to start playing.",
      `
        <div class="dice-card idle">
          <p class="dice-label">Dice</p>
          ${getDiceFaceMarkup(null)}
          <strong class="dice-value">--</strong>
          <p class="dice-caption">The roll will appear here.</p>
        </div>
      `
    );
    return;
  }

  const viewer = getViewer();
  const currentPlayer = getCurrentPlayer();
  const winner = state.room.players.find((player) => player.id === state.room.winnerId) || null;
  const legalMoves = getLegalMovesForViewer();
  const isViewerHost = viewer && viewer.id === state.room.hostId;
  const isViewerTurn = viewer && currentPlayer && viewer.id === currentPlayer.id;
  const visibleRoll = state.room.currentRoll ?? state.room.lastRoll ?? null;
  const diceLabel = state.room.currentRoll != null ? "Current Dice" : state.room.lastRoll != null ? "Last Dice" : "Dice";
  const diceCaption = state.room.currentRoll != null
    ? `Rolled ${state.room.currentRoll}`
    : state.room.lastRoll != null
      ? `Last value ${state.room.lastRoll}`
      : "Waiting for the first roll.";
  const showRollButton = state.room.status === "playing" && !winner && isViewerTurn && state.room.currentRoll == null;
  const diceMarkup = `
    <div class="dice-card${state.room.currentRoll != null ? " live" : ""}">
      <p class="dice-label">${diceLabel}</p>
      ${getDiceFaceMarkup(visibleRoll)}
      <strong class="dice-value">${visibleRoll ?? "--"}</strong>
      <p class="dice-caption">${diceCaption}</p>
      ${showRollButton ? '<button type="button" id="boardRollButton" class="dice-button">Roll Dice</button>' : ""}
    </div>
  `;

  if (state.room.status === "lobby") {
    statusHeadline.textContent = `${state.room.players.length} player${state.room.players.length === 1 ? "" : "s"} in the lobby`;
    statusSubline.textContent = "Share the link or room code, then start once everyone has joined.";
    hostActions.innerHTML = isViewerHost
      ? `<button type="button" id="startButton" ${state.room.players.length < 2 ? "disabled" : ""}>Start Game</button>`
      : "<p class=\"status-subline\">Waiting for the host to start the game.</p>";
    turnActions.innerHTML = "";
    setBoardHud(
      "Share the room link, then tap Start Game when everyone joins.",
      `
        <div class="dice-card idle">
          <p class="dice-label">Dice</p>
          ${getDiceFaceMarkup(null)}
          <strong class="dice-value">--</strong>
          <p class="dice-caption">Game has not started yet.</p>
        </div>
      `
    );
    return;
  }

  if (state.room.status === "finished" && winner) {
    statusHeadline.textContent = `${winner.name} wins the match`;
    statusSubline.textContent = "The board stays visible so everyone can see the final positions.";
    hostActions.innerHTML = "";
    turnActions.innerHTML = "";
    setBoardHud(`${winner.name} won the game.`, diceMarkup);
    return;
  }

  statusHeadline.textContent = currentPlayer ? `${currentPlayer.name}'s turn` : "Waiting for turn state";
  statusSubline.textContent = state.room.currentRoll == null
    ? isViewerTurn
      ? "Roll the dice when you're ready."
      : "Watch the board update live while your friend plays."
    : isViewerTurn
      ? `You rolled a ${state.room.currentRoll}. Choose one of your legal tokens.`
      : `${currentPlayer.name} rolled a ${state.room.currentRoll}.`;

  hostActions.innerHTML = "";
  setBoardHud(
    !currentPlayer
      ? "Waiting for the room to sync."
      : isViewerTurn
        ? state.room.currentRoll == null
          ? "Tap Roll Dice, then tap the glowing token you want to move."
          : legalMoves.length
            ? "Tap the glowing token you want to move. The token you tap will move."
            : "No legal token for this dice value."
        : state.room.currentRoll == null
          ? `Waiting for ${currentPlayer.name} to roll the dice.`
          : `Waiting for ${currentPlayer.name} to choose a token.`,
    diceMarkup
  );

  if (!isViewerTurn || !viewer) {
    turnActions.innerHTML = "";
    return;
  }

  if (state.room.currentRoll == null) {
    turnActions.innerHTML = "<p class=\"status-subline\">Use the dice box above the board, then tap the highlighted token you want to move.</p>";
    return;
  }

  if (!legalMoves.length) {
    turnActions.innerHTML = "<p class=\"status-subline\">No legal moves. The server will advance the turn automatically.</p>";
    return;
  }

  turnActions.innerHTML = legalMoves
    .map((move, index) => {
      const destination = move.to === 57 ? "home" : move.to === 0 && move.from === -1 ? "the track" : `step ${move.to}`;
      const intro = index === 0
        ? "<p class=\"status-subline\">Tap the glowing token on the board, or use a quick move button below.</p>"
        : "";
      return `
        ${intro}
        <div class="move-chip">
          <span>Move token ${move.tokenIndex + 1} to ${destination}</span>
          <button type="button" data-move-token="${move.tokenIndex}">Move</button>
        </div>
      `;
    })
    .join("");
}

function renderRoom() {
  const hasRoom = Boolean(state.room);
  welcomePanel.classList.toggle("hidden", hasRoom);
  gamePanel.classList.toggle("hidden", !hasRoom);

  if (!hasRoom) {
    renderStatus();
    renderPlayers();
    renderLog();
    renderBoard();
    return;
  }

  roomCodeBadge.textContent = state.room.code;
  shareLinkInput.value = state.room.shareUrl;
  renderStatus();
  renderPlayers();
  renderLog();
  renderBoard();
}

async function rollDice() {
  if (!state.room) {
    return;
  }

  try {
    await api(`/api/rooms/${state.room.code}/roll`, {
      body: JSON.stringify({ playerId: state.playerId }),
      method: "POST"
    });
  } catch (error) {
    showToast(error.message);
  }
}

async function moveToken(tokenIndex) {
  if (!state.room) {
    return;
  }

  try {
    await api(`/api/rooms/${state.room.code}/move`, {
      body: JSON.stringify({
        playerId: state.playerId,
        tokenIndex: Number(tokenIndex)
      }),
      method: "POST"
    });
  } catch (error) {
    showToast(error.message);
  }
}

function attachRoomHandlers() {
  const startButton = document.getElementById("startButton");
  const boardRollButton = document.getElementById("boardRollButton");

  if (startButton) {
    startButton.onclick = async () => {
      try {
        await api(`/api/rooms/${state.room.code}/start`, {
          body: JSON.stringify({ playerId: state.playerId }),
          method: "POST"
        });
      } catch (error) {
        showToast(error.message);
      }
    };
  }

  if (boardRollButton) {
    boardRollButton.onclick = rollDice;
  }

  turnActions.querySelectorAll("[data-move-token]").forEach((button) => {
    button.onclick = async () => {
      await moveToken(button.getAttribute("data-move-token"));
    };
  });
}

function connectStream(roomCode, playerId) {
  if (state.stream) {
    state.stream.close();
  }

  setConnectionState("connecting", "Connecting");

  const stream = new EventSource(`/api/rooms/${roomCode}/stream?playerId=${encodeURIComponent(playerId)}`);
  state.stream = stream;

  stream.onopen = () => {
    setConnectionState("live", "Live");
  };

  stream.onmessage = (event) => {
    state.room = JSON.parse(event.data);
    renderRoom();
    attachRoomHandlers();
    setConnectionState("live", "Live");
  };

  stream.onerror = () => {
    setConnectionState("down", "Reconnecting");
  };
}

async function finishJoin(payload, name) {
  rememberName(name);
  state.playerId = payload.playerId;
  state.room = payload.room;
  storePlayerId(payload.room.code, payload.playerId);
  updateUrlWithRoom(payload.room.code);
  renderRoom();
  attachRoomHandlers();
  connectStream(payload.room.code, payload.playerId);
}

async function createRoom(name) {
  const payload = await api("/api/rooms/create", {
    body: JSON.stringify({ name }),
    method: "POST"
  });

  await finishJoin(payload, name);
}

async function joinRoom(roomCode, name) {
  const normalizedCode = String(roomCode || "").trim().toUpperCase();
  const playerId = getStoredPlayerId(normalizedCode);
  const payload = await api("/api/rooms/join", {
    body: JSON.stringify({
      name,
      playerId,
      roomCode: normalizedCode
    }),
    method: "POST"
  });

  await finishJoin(payload, name);
}

createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = createNameInput.value.trim();

  try {
    await createRoom(name);
  } catch (error) {
    showToast(error.message);
  }
});

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = joinNameInput.value.trim();
  const roomCode = joinCodeInput.value.trim();

  try {
    await joinRoom(roomCode, name);
  } catch (error) {
    showToast(error.message);
  }
});

copyLinkButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(shareLinkInput.value);
    showToast("Share link copied.");
  } catch {
    showToast("Could not copy the share link.");
  }
});

copyCodeButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(roomCodeBadge.textContent);
    showToast("Room code copied.");
  } catch {
    showToast("Could not copy the room code.");
  }
});

function getTokenGroupFromEventTarget(target) {
  return target instanceof Element ? target.closest("[data-token-index]") : null;
}

async function handleBoardTokenInteraction(event) {
  const tokenGroup = getTokenGroupFromEventTarget(event.target);
  if (!tokenGroup || !state.room) {
    return;
  }

  if (typeof event.preventDefault === "function") {
    event.preventDefault();
  }

  await moveToken(tokenGroup.getAttribute("data-token-index"));
}

boardSvg.addEventListener("pointerup", handleBoardTokenInteraction);
boardSvg.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  await handleBoardTokenInteraction(event);
});

window.addEventListener("beforeunload", () => {
  if (state.stream) {
    state.stream.close();
  }
});

renderRoom();

if (roomFromUrl) {
  const savedPlayerId = getStoredPlayerId(roomFromUrl);
  const savedName = localStorage.getItem("ludo:lastName");

  if (savedPlayerId && savedName) {
    joinRoom(roomFromUrl, savedName).catch(() => {
      setConnectionState("down", "Join failed");
    });
  }
}
