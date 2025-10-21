// server.ts
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { v4 } from "https://deno.land/std@0.208.0/uuid/mod.ts";
import { Game } from "./game.ts";

export class Connection {
  public client: WebSocket;
  public uuid: string;
  public game: Game;

  public constructor(ws, uuid) {
    this.client = ws;
    this.uuid = uuid
    this.game = find_game(uuid);
  }
}

export class Lobby {
  public players: [string, string][] = []; 
}

//map a connection to a player in a game
const conn: Map<WebSocket, Connection> = new Map();
const clients: Map<string, Connection> = new Map();
const games: Game[] = [];

async function handler(req: Request): Promise<Response> {
  console.log("Request received");
  const url = new URL(req.url);

  // Handle OPTIONS preflight requests
  if (req.method === "OPTIONS") {
    return cors_response(new Response(null, { status: 204 }));
  }

  //query active games
  if (req.method === "GET" && url.pathname === "/games") {
    return cors_response(await game_list());
  }

  if (req.method === "POST" && url.pathname === "/join") {
    return cors_response(await join_lobby(req));
  }

  if (req.method === "GET" && url.pathname === "/game_status") {
    return cors_response(game_status(url));
  }

  if (req.method === "POST" && url.pathname === "/start") {
    return cors_response(start_game());
  }

  //attempt to rejoin active game by UUID
  if (req.method === "POST" && url.pathname === "/rejoin") {
    return cors_response(await rejoin(req));
  }

  //something for joining lobbys, there user is given their UUID
  //String(crypto.randomUUID())

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

  return new Response("Bad Request", { status: 400 });
}

const lobby = new Lobby();

async function join_lobby(req: Request): Promise<Response> {
  console.log("attempting to join lobby");
  try {
    const { name } = await req.json();
    const uuid = crypto.randomUUID();
    
    lobby.players.push([uuid, name]);
    console.log(lobby);

    return new Response(JSON.stringify({ uuid }), { status: 200 });
  } catch (error) {
    console.error("Error joining lobby:", error);
    return new Response("Bad Request", { status: 400 });
  }
}

function game_status(url: URL): Response {
  const uuid = url.searchParams.get("uuid");
  let game_started = false;
  if (uuid) {
    for (const game of games) {
      if (game.get_player(uuid)) {
        game_started = true;
        break;
      }
    }
  }
  return new Response(JSON.stringify({ game_started }), { status: 200 });
}

function start_game(): Response {
  console.log("starting game");
  const game = new Game(lobby.players);
  games.push(game);
  lobby.players = [];
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
    const msg = JSON.parse(e.data);

    //make sure we get the client UUID first thing
    if (conn.get(socket) === "") {
      if (msg.uuid === null) {
        console.log("no message ID");
        socket.close();
      }
      else if (v4.validate(msg.uuid)) {
        let connection: Connection = new Connection(socket, msg.uuid);
        if (connection.game == null) {
          console.log("no game found");
          socket.close();
        }
        conn.set(socket, connection);
        clients.set(msg.uuid, connection);
        connection.game.get_player(msg.uuid).connected = true;
      }
      else {
        socket.close();
      }
      return; // Return early after handling initial message
    }
    
    let result: [GameAction];
    switch (msg.action) {
      case "draw":
        result = conn.get(socket).game.player_draw(conn.get(socket).uuid);
        break;
      case "fold":
        result = conn.get(socket).game.player_fold(conn.get(socket).uuid);
        break;
      case "use":
        console.log("use");
        result = conn.get(socket).game.player_use(conn.get(socket).uuid, msg.target);
        break;
      case "state":
        const serializedGame = conn.get(socket).game.serialize();
        conn.get(socket).client.send(JSON.stringify({"game": serializedGame}));
        return; // Return early to avoid broadcast
    }

    if (result != null) {
      for (let res of result) {
        console.log("sending back", res);
        broadcast_game_action(conn.get(socket).game, res);
      }
    }
  };

  socket.onclose = () => {
    let connection: Connection | string = conn.get(socket);
    if (typeof connection !== 'string' && connection.game) {
      connection.game.get_player(connection.uuid).connected = false;
    }
    conn.delete(socket);
  }

  return response;
}


function broadcast_game_action(game: Game, action: GameAction) {
  console.log(action);
  let message = JSON.stringify({"action": action, "game": game.serialize()});

  game.players_by_uuid.forEach(player => {
    let bees = clients.get(player.uuid);
    if (bees != null) {
      bees.client.send(message);
    }
  });
}

function find_game(uuid: string): Game {
  for (let game: Game of games) {
    if (game.get_player(uuid) != null) {
      console.log("found game");
      return game;
    }
  }
  return null;
}

console.log("WebSocket server on ws://localhost:8080");
await serve(handler, { port: 8080 });

