const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const ROOM_TTL_MS = 1000 * 60 * 60 * 8;
const MAX_LOG_ENTRIES = 18;

const PLAYER_SLOTS = [
  { color: "green", label: "Green", startIndex: 0 },
  { color: "yellow", label: "Yellow", startIndex: 13 },
  { color: "blue", label: "Blue", startIndex: 26 },
  { color: "red", label: "Red", startIndex: 39 }
];

const SAFE_BOARD_INDEXES = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8"
};

const rooms = new Map();

function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 18);
}

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  do {
    code = "";
    for (let index = 0; index < 6; index += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
  } while (rooms.has(code));

  return code;
}

function getBaseUrl(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || "http";
  return `${protocol}://${req.headers.host}`;
}

function buildShareUrl(baseUrl, code) {
  return `${baseUrl}/?room=${encodeURIComponent(code)}`;
}

function createPlayer(name, slot, id = crypto.randomUUID()) {
  return {
    color: slot.color,
    id,
    joinedAt: Date.now(),
    label: slot.label,
    name,
    online: false,
    tokenProgress: [-1, -1, -1, -1]
  };
}

function createRoom(hostName, baseUrl) {
  const code = createRoomCode();
  const hostSlot = PLAYER_SLOTS[0];
  const host = createPlayer(hostName, hostSlot);

  const room = {
    code,
    connections: new Map(),
    consecutiveSixes: 0,
    createdAt: Date.now(),
    currentRoll: null,
    hostId: host.id,
    lastRoll: null,
    log: [],
    players: [host],
    shareUrl: buildShareUrl(baseUrl, code),
    startedAt: null,
    status: "lobby",
    turnIndex: 0,
    updatedAt: Date.now(),
    winnerId: null
  };

  addLog(room, `${host.name} created the room.`);
  rooms.set(code, room);
  return room;
}

function touchRoom(room) {
  room.updatedAt = Date.now();
}

function addLog(room, text) {
  room.log.unshift({
    createdAt: Date.now(),
    id: crypto.randomUUID(),
    text
  });
  room.log = room.log.slice(0, MAX_LOG_ENTRIES);
}

function getRoom(code) {
  return rooms.get(String(code || "").trim().toUpperCase());
}

function getPlayer(room, playerId) {
  return room.players.find((player) => player.id === playerId) || null;
}

function getCurrentPlayer(room) {
  return room.players[room.turnIndex] || null;
}

function getPlayerSlotMeta(color) {
  return PLAYER_SLOTS.find((slot) => slot.color === color);
}

function getBoardIndex(color, progress) {
  const slot = getPlayerSlotMeta(color);
  return (slot.startIndex + progress) % 52;
}

function getLegalMoves(room, player) {
  if (room.status !== "playing" || room.currentRoll == null || room.winnerId) {
    return [];
  }

  const roll = room.currentRoll;
  return player.tokenProgress
    .map((progress, tokenIndex) => {
      if (progress === -1) {
        return roll === 6 ? { from: -1, to: 0, tokenIndex } : null;
      }

      const next = progress + roll;
      if (next > 57) {
        return null;
      }

      return { from: progress, to: next, tokenIndex };
    })
    .filter(Boolean);
}

function advanceTurn(room) {
  room.currentRoll = null;
  room.consecutiveSixes = 0;
  room.turnIndex = (room.turnIndex + 1) % room.players.length;
}

function captureTokens(room, activePlayer, destinationBoardIndex) {
  if (SAFE_BOARD_INDEXES.has(destinationBoardIndex)) {
    return 0;
  }

  let captureCount = 0;

  for (const opponent of room.players) {
    if (opponent.id === activePlayer.id) {
      continue;
    }

    opponent.tokenProgress = opponent.tokenProgress.map((progress) => {
      if (progress < 0 || progress > 51) {
        return progress;
      }

      const opponentBoardIndex = getBoardIndex(opponent.color, progress);
      if (opponentBoardIndex !== destinationBoardIndex) {
        return progress;
      }

      captureCount += 1;
      return -1;
    });
  }

  return captureCount;
}

function getPublicRoomState(room) {
  const currentPlayer = getCurrentPlayer(room);

  return {
    code: room.code,
    createdAt: room.createdAt,
    currentPlayerId: currentPlayer ? currentPlayer.id : null,
    currentRoll: room.currentRoll,
    hostId: room.hostId,
    lastRoll: room.lastRoll,
    log: room.log,
    players: room.players.map((player) => ({
      color: player.color,
      id: player.id,
      joinedAt: player.joinedAt,
      name: player.name,
      online: player.online,
      tokenProgress: player.tokenProgress
    })),
    shareUrl: room.shareUrl,
    startedAt: room.startedAt,
    status: room.status,
    turnIndex: room.turnIndex,
    updatedAt: room.updatedAt,
    winnerId: room.winnerId
  };
}

function sendRoomState(room) {
  const payload = `data: ${JSON.stringify(getPublicRoomState(room))}\n\n`;

  for (const responseSet of room.connections.values()) {
    for (const response of responseSet) {
      response.write(payload);
    }
  }
}

function setPlayerOnline(room, playerId, isOnline) {
  const player = getPlayer(room, playerId);
  if (!player) {
    return;
  }

  player.online = isOnline;
  touchRoom(room);
  sendRoomState(room);
}

function upsertPlayer(room, playerId, name) {
  const normalizedName = normalizeName(name);
  if (!normalizedName) {
    throw new Error("Please enter a player name.");
  }

  if (playerId) {
    const existingPlayer = getPlayer(room, playerId);
    if (existingPlayer) {
      existingPlayer.name = normalizedName;
      touchRoom(room);
      return existingPlayer;
    }
  }

  if (room.status !== "lobby") {
    throw new Error("This game has already started. Ask a current player to share their browser tab to reconnect.");
  }

  if (room.players.length >= PLAYER_SLOTS.length) {
    throw new Error("This room is full.");
  }

  const slot = PLAYER_SLOTS[room.players.length];
  const newPlayer = createPlayer(normalizedName, slot, playerId || crypto.randomUUID());
  room.players.push(newPlayer);
  addLog(room, `${newPlayer.name} joined as ${slot.label}.`);
  touchRoom(room);
  return newPlayer;
}

function resetRoomForGame(room) {
  room.status = "playing";
  room.startedAt = Date.now();
  room.turnIndex = 0;
  room.currentRoll = null;
  room.consecutiveSixes = 0;
  room.winnerId = null;
  room.lastRoll = null;

  for (const player of room.players) {
    player.tokenProgress = [-1, -1, -1, -1];
  }

  addLog(room, "The game has started.");
  addLog(room, `${room.players[0].name} goes first.`);
  touchRoom(room);
}

function handleRoll(room, player) {
  if (room.status !== "playing") {
    throw new Error("Start the game before rolling.");
  }

  if (room.winnerId) {
    throw new Error("The game is finished.");
  }

  if (room.currentRoll != null) {
    throw new Error("Choose a token for the current dice roll first.");
  }

  if (getCurrentPlayer(room)?.id !== player.id) {
    throw new Error("It is not your turn.");
  }

  const roll = Math.floor(Math.random() * 6) + 1;
  room.currentRoll = roll;
  room.lastRoll = roll;

  if (roll === 6) {
    room.consecutiveSixes += 1;
  } else {
    room.consecutiveSixes = 0;
  }

  addLog(room, `${player.name} rolled a ${roll}.`);

  if (room.consecutiveSixes >= 3) {
    addLog(room, `${player.name} rolled three 6s in a row and loses the turn.`);
    advanceTurn(room);
    addLog(room, `It is now ${getCurrentPlayer(room).name}'s turn.`);
  } else {
    const legalMoves = getLegalMoves(room, player);
    if (!legalMoves.length) {
      room.currentRoll = null;
      room.consecutiveSixes = 0;
      addLog(room, `${player.name} has no legal move.`);
      advanceTurn(room);
      addLog(room, `It is now ${getCurrentPlayer(room).name}'s turn.`);
    }
  }

  touchRoom(room);
}

function handleMove(room, player, tokenIndex) {
  if (room.status !== "playing") {
    throw new Error("Start the game before moving tokens.");
  }

  if (room.winnerId) {
    throw new Error("The game is finished.");
  }

  if (getCurrentPlayer(room)?.id !== player.id) {
    throw new Error("It is not your turn.");
  }

  const legalMove = getLegalMoves(room, player).find((move) => move.tokenIndex === tokenIndex);
  if (!legalMove) {
    throw new Error("That token cannot move for the current roll.");
  }

  const roll = room.currentRoll;
  player.tokenProgress[tokenIndex] = legalMove.to;

  let captureCount = 0;
  if (legalMove.to >= 0 && legalMove.to <= 51) {
    captureCount = captureTokens(room, player, getBoardIndex(player.color, legalMove.to));
  }

  const tokenNumber = tokenIndex + 1;
  if (legalMove.from === -1) {
    addLog(room, `${player.name} moved token ${tokenNumber} out of the yard.`);
  } else if (legalMove.to === 57) {
    addLog(room, `${player.name} brought token ${tokenNumber} home.`);
  } else {
    addLog(room, `${player.name} moved token ${tokenNumber} ${roll} spaces.`);
  }

  if (captureCount > 0) {
    addLog(room, `${player.name} captured ${captureCount} token${captureCount === 1 ? "" : "s"}.`);
  }

  room.currentRoll = null;

  if (player.tokenProgress.every((progress) => progress === 57)) {
    room.status = "finished";
    room.winnerId = player.id;
    room.consecutiveSixes = 0;
    addLog(room, `${player.name} wins the game!`);
    touchRoom(room);
    return;
  }

  if (roll === 6) {
    addLog(room, `${player.name} gets an extra turn.`);
  } else {
    advanceTurn(room);
    addLog(room, `It is now ${getCurrentPlayer(room).name}'s turn.`);
  }

  touchRoom(room);
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(data));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

async function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk.toString("utf8");
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON request body."));
      }
    });

    request.on("error", reject);
  });
}

function serveStaticFile(requestPath, response) {
  const safePath = requestPath === "/" ? "/index.html" : requestPath;
  const relativePath = safePath.replace(/^\/+/, "");
  const filePath = path.resolve(PUBLIC_DIR, relativePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendError(response, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, fileBuffer) => {
    if (error) {
      sendError(response, 404, "Not found");
      return;
    }

    response.writeHead(200, {
      "Cache-Control": safePath.endsWith(".html") ? "no-store" : "public, max-age=300",
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream"
    });
    response.end(fileBuffer);
  });
}

function handleStream(request, response, room, playerId) {
  const player = getPlayer(room, playerId);
  if (!player) {
    sendError(response, 404, "Player not found in this room.");
    return;
  }

  response.writeHead(200, {
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "Content-Type": "text/event-stream; charset=utf-8"
  });
  response.write("retry: 3000\n\n");

  if (!room.connections.has(playerId)) {
    room.connections.set(playerId, new Set());
  }

  const responseSet = room.connections.get(playerId);
  responseSet.add(response);

  player.online = true;
  touchRoom(room);
  sendRoomState(room);

  const heartbeat = setInterval(() => {
    response.write(": ping\n\n");
  }, 15000);

  request.on("close", () => {
    clearInterval(heartbeat);
    responseSet.delete(response);
    if (responseSet.size === 0) {
      room.connections.delete(playerId);
      setPlayerOnline(room, playerId, false);
    }
  });
}

function cleanupRooms() {
  const now = Date.now();

  for (const [code, room] of rooms.entries()) {
    if (now - room.updatedAt < ROOM_TTL_MS) {
      continue;
    }

    for (const responseSet of room.connections.values()) {
      for (const response of responseSet) {
        response.end();
      }
    }

    rooms.delete(code);
  }
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, getBaseUrl(request));

  if (request.method === "GET" && requestUrl.pathname === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    if (request.method === "POST" && requestUrl.pathname === "/api/rooms/create") {
      const body = await readJson(request);
      const name = normalizeName(body.name);

      if (!name) {
        sendError(response, 400, "Please enter your name.");
        return;
      }

      const room = createRoom(name, getBaseUrl(request));
      sendJson(response, 201, {
        playerId: room.hostId,
        room: getPublicRoomState(room)
      });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/rooms/join") {
      const body = await readJson(request);
      const roomCode = String(body.roomCode || "").trim().toUpperCase();
      const room = getRoom(roomCode);

      if (!room) {
        sendError(response, 404, "Room not found.");
        return;
      }

      const player = upsertPlayer(room, body.playerId, body.name);
      room.shareUrl = buildShareUrl(getBaseUrl(request), room.code);
      touchRoom(room);

      sendJson(response, 200, {
        playerId: player.id,
        room: getPublicRoomState(room)
      });
      sendRoomState(room);
      return;
    }

    const roomMatch = requestUrl.pathname.match(/^\/api\/rooms\/([A-Z0-9]+)(?:\/(stream|start|roll|move))?$/i);
    if (roomMatch) {
      const room = getRoom(roomMatch[1]);
      const action = roomMatch[2] || "";

      if (!room) {
        sendError(response, 404, "Room not found.");
        return;
      }

      if (request.method === "GET" && action === "stream") {
        handleStream(request, response, room, requestUrl.searchParams.get("playerId"));
        return;
      }

      const body = await readJson(request);
      const player = getPlayer(room, body.playerId);

      if (!player) {
        sendError(response, 404, "Player not found in this room.");
        return;
      }

      if (request.method === "POST" && action === "start") {
        if (room.hostId !== player.id) {
          sendError(response, 403, "Only the host can start the game.");
          return;
        }

        if (room.players.length < 2) {
          sendError(response, 400, "You need at least 2 players to start.");
          return;
        }

        resetRoomForGame(room);
        sendJson(response, 200, { room: getPublicRoomState(room) });
        sendRoomState(room);
        return;
      }

      if (request.method === "POST" && action === "roll") {
        handleRoll(room, player);
        sendJson(response, 200, { room: getPublicRoomState(room) });
        sendRoomState(room);
        return;
      }

      if (request.method === "POST" && action === "move") {
        handleMove(room, player, Number(body.tokenIndex));
        sendJson(response, 200, { room: getPublicRoomState(room) });
        sendRoomState(room);
        return;
      }
    }

    if (request.method === "GET") {
      serveStaticFile(requestUrl.pathname, response);
      return;
    }

    sendError(response, 404, "Not found");
  } catch (error) {
    sendError(response, 400, error.message || "Something went wrong.");
  }
});

setInterval(cleanupRooms, 1000 * 60 * 15).unref();

server.listen(PORT, () => {
  console.log(`Ludo server running at http://localhost:${PORT}`);
});
