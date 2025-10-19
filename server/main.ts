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

//map a connection to a player in a game
const conn: Map<WebSocket, Connection> = new Map();
const clients: Map<string, Connection> = new Map();
const games: Game[] = [];

function handler(req: Request): Response | Promise<Response> {
  console.log("Request received");

  //query active games
  if (req.method === "GET" && req.url.pathname === "/games") {
    return game_list();
  }

  if (req.method === "POST" && req.url.pathname === "/join") {
    return join_game(req);
  }

  //attempt to rejoin active game by UUID
  if (req.method === "POST" && req.url.pathname === "/rejoin") {
    return rejoin(req);
  }

  //something for joining lobbys, there user is given their UUID
  //String(crypto.randomUUID())

  //create a websocket connection
  //should only happen on the /game page to join a game
  if (req.method === "GET" && req.headers.get("upgrade") === "websocket") {
    console.log("websocket");
    return make_websocket(req);
  }

  console.log("final, returning not found");
  return new Response("Not Found", { status: 404 });
}

function game_list(): Response | Promise<Response> {

  return new Response("Bad Request", { status: 400 });
}

function join_game(req: Request): Response | Promise<Response> {
  
  return new Response("Bad Request", { status: 400 });
}

function rejoin_game(req: Request): Response | Promise<Response> {

  return new Response("Bad Request", { status: 400 });
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
        //console.log(connection);
        if (connection.game == null) {
          console.log("no game found");
          socket.close();
        }
        conn.set(socket, connection);
        clients.set(msg.uuid, connection);
      }
      else {
        socket.close();
      }
    }
    
    let result: [GameAction];
    switch (msg.action) {
      case "draw":
        result = conn.get(socket).game.player_draw(conn.get(socket).uuid);
        break;
      case "fold":
        result = conn.get(socket).game.player_fold(connection.get(socket));
        break;
      case "use":
        result = conn.get(socket).game.player_draw(connection.get(socket), msg.target);
        break;
      case "state":
        result = conn.get(socket).game.serialize();
    }
    
    if (result != null) {
      for (let res of result) {
        console.log("sending back", res);
        broadcast_game_action(conn.get(socket).game, res);
      }
    }
  };

  socket.onclose = () => {
    conn.delete(socket);
  }

  return response;
}


function broadcast_game_action(game: Game, action: GameAction) {
  console.log(action);
  let message = JSON.stringify(action);

  game.players_by_uuid.forEach(player => {
    clients.get(player.uuid).client.send(message);
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
games.push(new Game([["03561786-3352-4c85-82a9-f302f1cc68a0", "Steve"]]));
console.log(crypto.randomUUID());
console.log(v4.validate(crypto.randomUUID()));
await serve(handler, { port: 8080 });

