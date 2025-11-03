// server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { v4 } from "https://deno.land/std@0.224.0/uuid/mod.ts";
import { Game, GameAction } from "./game.ts";

export class Connection {
  public client: WebSocket;
  public uuid: string;
  public game: Game;

  public constructor(ws, uuid) {
    this.client = ws;
    this.uuid = uuid
    this.game = player_game_map.get(uuid);
  }
}

export class Lobby {
  public name: string;
  public uuid: string;
  //uuid, name
  public players: [string, string][] = []; 
  public host: string;

  public constructor(host_uuid: string, host_name: string, lobby_uuid: string, lobby_name: string) {
    this.name = lobby_name;
    this.uuid = lobby_uuid;
    this.host = host_uuid;
    this.players.push([host_uuid, host_name]);
  }
}

//map a connection to a player in a game
const conn: Map<WebSocket, Connection> = new Map();
const clients: Map<string, Connection> = new Map();

//actively running games
const games: Map<string, Game> = new Map();
const player_game_map: Map<string, Game> = new Map();
//pre-game lobbys
const lobbys: Map<string, Lobby> = new Map();

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // Handle OPTIONS preflight requests
  if (req.method === "OPTIONS") {
    return cors_response(new Response(null, { status: 204 }));
  }

  //query active games and open lobbys
  if (req.method === "GET" && url.pathname === "/games") {
    return cors_response(await game_list());
  }

  if (req.method === "POST" && url.pathname === "/create") {
    return cors_response(await create_lobby(req));
  }

  if (req.method === "POST" && url.pathname === "/join") {
    return cors_response(await join_lobby(req));
  }

  if (req.method === "GET" && url.pathname === "/game_status") {
    return cors_response(game_status(url));
  }

  if (req.method === "POST" && url.pathname === "/start") {
    return cors_response(await start_game(req));
  }

  //create a websocket connection
  //should only happen on the /game page to join a game
  if (req.method === "GET" && url.pathname === "/game" && req.headers.get("upgrade") === "websocket") {
    console.log("websocket");
    return make_websocket(req);
  }

  console.log("final, returning not found");
  return cors_response(new Response("Not Found", { status: 404 }));
}

function cors_response(response: Response): Response {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}

function game_list(): Response | Promise<Response> {
  const lobbyList = Array.from(lobbys.values()).map(lobby => ({
    name: lobby.name,
    uuid: lobby.uuid,
    playerCount: lobby.players.length,
  }));

  const gameList = Array.from(games.values()).map(game => ({
    name: game.name, // Assuming Game class has a 'name' property
    playerCount: game.players.length, // Assuming players_by_uuid is a Map
  }));

  const data = {
    lobbies: lobbyList,
    games: gameList,
  };

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function create_lobby(req: Request): Promise<Response> {
  console.log("attempting to create lobby");
  try {
    let { username, lobby_name } = await req.json();

    if (!username) {
      return new Response("Username is required.", { status: 400 });
    }
    if (!lobby_name) {
      return new Response("Lobby name is required.", { status: 400 });
    }
    if (username.length > 25) {
      username = username.substring(0, 25);
    }
    if (lobby_name.length > 15) {
      lobby_name = lobby_name.substring(0, 15);
    }

    const lobby_uuid = crypto.randomUUID();
    const host_uuid = crypto.randomUUID();

    const new_lobby = new Lobby( host_uuid, username, lobby_uuid, lobby_name);
    lobbys.set(lobby_uuid, new_lobby);
    console.log("lobby", new_lobby.name, new_lobby.uuid, "created");

    return new Response(JSON.stringify({ host_uuid }), { status: 200 });
  } catch (error) {
    console.error("Error creating lobby:", error);
    return new Response("Bad Request", { status: 400 });
  }
}

async function join_lobby(req: Request): Promise<Response> {
  try {
    let { username, lobby_uuid } = await req.json();
    console.log(username, "is attempting to join lobby", uuid);

    if (!username) {
      return new Response("Username is required.", { status: 400 });
    }
    if (!lobby_uuid) {
      return new Response("Lobby UUID is required.", { status: 400 });
    }

    if (username.length > 25) {
      username = username.substring(0, 25);
    }

    const lobbyToJoin = lobbys.get(lobby_uuid);

    if (!lobbyToJoin) {
      return new Response("Lobby not found.", { status: 404 });
    }

    const player_uuid = crypto.randomUUID();
    lobbyToJoin.players.push([player_uuid, username]);

    console.log(username, "joined lobby", lobbyToJoin.name, "and got uuid", player_uuid);

    return new Response(JSON.stringify({ player_uuid }), { status: 200 });
  } catch (error) {
    console.error("Error joining lobby:", error);
    return new Response("Bad Request", { status: 400 });
  }
}

function game_status(url: URL): Response {
  const uuid = url.searchParams.get("uuid");

  if (!uuid) {
    return new Response("Bad Request: Missing uuid parameter", { status: 400 });
  }

  const game_started = player_game_map.has(uuid);

  return new Response(JSON.stringify({ game_started }), { status: 200 });
}

async function start_game(req: Request): Promise<Response> {
  const { uuid } = await req.json();
  if (!uuid) {
    return new Response("Bad Request: Missing uuid", { status: 400 });
  }

  console.log(uuid, "tried to start a game");

  let target_lobby: Lobby | undefined;
  let target_uuid: string | undefined;
  for (const [lobby_uuid, lobby] of lobbys.entries()) {
    if (lobby.host === uuid) {
      target_lobby = lobby;
      target_uuid = lobby_uuid;
      break;
    }
  }

  if (!target_lobby || !target_uuid) {
    return new Response("Lobby not found or you are not the host.", { status: 404 });
  }

  const game = new Game(target_lobby.uuid, target_lobby.name, target_lobby.players);
  games.set(target_lobby.uuid, game);

  // Populate the player_game_map
  for (const [player_uuid, _] of target_lobby.players) {
    player_game_map.set(player_uuid, game);
  }

  lobbys.delete(target_uuid); // Remove the started lobby
  return new Response("Game started", { status: 200 });
}

function make_websocket(req: Request): Response | Promise<Response> {
  const { socket, response } = Deno.upgradeWebSocket(req);
  console.log("socket made");

  socket.onopen = () => {
    //server should not send any messages on open, wait for client to send UUID
    conn.set(socket, "");
    console.log("connection opened");
  };

  socket.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      const connection = conn.get(socket);

      // Handle initial UUID message
      if (connection === "") {
        if (msg.uuid && v4.validate(msg.uuid)) {
          const newConnection = new Connection(socket, msg.uuid);
          if (!newConnection.game) {
            console.log("no game found for uuid:", msg.uuid);
            socket.close();
            return;
          }
          conn.set(socket, newConnection);
          clients.set(msg.uuid, newConnection);
          let p = newConnection.game.get_player(msg.uuid)
          p.connected = true;
          broadcast_game_action(newConnection.game, new GameAction("connect", p.order, null, 1));
        } else {
          console.log("Invalid or missing UUID");
          socket.close();
        }
        return; // Return early after handling initial message
      }

      // Ensure connection is valid for subsequent messages
      if (!connection || typeof connection === 'string') {
        console.log("Invalid connection state");
        return;
      }

      let result: [GameAction];
      switch (msg.action) {
        case "draw":
          console.log("player", connection.game.get_player(connection.uuid).order, "requested to draw");
          result = connection.game.player_draw(connection.uuid);
          break;
        case "fold":
          console.log("player", connection.game.get_player(connection.uuid).order, "requested to fold");
          result = connection.game.player_fold(connection.uuid);
          break;
        case "use":
          console.log("player", connection.game.get_player(connection.uuid).order, "requested to use on", msg.target);
          result = connection.game.player_use(connection.uuid, msg.target);
          break;
        case "state":
          console.log("player", connection.game.get_player(connection.uuid).order, "requested gamestate");
          const serializedGame = connection.game.serialize();
          connection.client.send(JSON.stringify({ game: serializedGame }));
          return; // Return early to avoid broadcast
      }

      if (result) {
        for (const res of result) {
          broadcast_game_action(connection.game, res);
          if (res.action === "end") {
            end_game(connection.game);
            break;
          }
        }
      }
    } catch (error) {
      console.error("Error processing message:", error);
    }
  };

  socket.onclose = () => {
    let connection: Connection | string = conn.get(socket);
    if (typeof connection !== 'string' && connection.game) {
      let p = connection.game.get_player(connection.uuid)
      p.connected = false;
      broadcast_game_action(connection.game, new GameAction("connect", p.order, null, 0));
    }
    conn.delete(socket);
  }

  return response;
}

async function end_game(game: Game) {
  const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
  const safeGameName = game.name.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `./game-archives/${safeGameName}-${game.uuid}-${timestamp}.json`;

  try {
    await Deno.mkdir("./game-archives", { recursive: true });
    const game_json = JSON.stringify(game.serialize(), null, 2);
    await Deno.writeTextFile(filename, game_json);
    console.log(`Game ${game.uuid} saved to ${filename}`);
  } catch (e) {
    console.error(`Failed to save game ${game.uuid} to ${filename}:`, e);
  }

  for (const player_uuid of game.players_by_uuid.keys()) {
    player_game_map.delete(player_uuid);

    const player_conn = clients.get(player_uuid);
    if (player_conn) {
      // 1000 is normal closure
      player_conn.client.close(1000, "Game finished");
      clients.delete(player_uuid);
    }
  }

  games.delete(game.uuid);
  console.log(`Game ${game.uuid} has ended and been cleaned up.`);
}

function broadcast_game_action(game: Game, action: GameAction) {
  console.log("broadcast", action);
  const message = JSON.stringify({"action": action, "game": game.serialize()});

  game.players_by_uuid.forEach(p => {
    const player_conn = clients.get(p.uuid);
    if (player_conn != null && player_conn.client.readyState === WebSocket.OPEN) {
      player_conn.client.send(message);
    }
  });
}

console.log("tomt6 server on localhost:8080");
await serve(handler, { port: 8080 });

