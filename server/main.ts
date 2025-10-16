// server.ts
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { v4 } from "https://deno.land/std@0.208.0/uuid/mod.ts";
import { Game } from "./game.ts";

export class Connection {
  public uuid: string = "";
  public game: Game;

  public constructor(ws, uuid, name) {
    this.client = ws;
  }
}

//map a connection to a player in a game
const conn: Map<WebSocket, string> = new Map();
const clients: Map<string, Connection> = new Map();
const games: Game[] = [];

function handler(req: Request): Response | Promise<Response> {

  //query active games
  if (req.method === "GET" && req.url.pathname === "/games") {
    return game_list();
  }

  //attempt to rejoin active game by UUID
  if (req.method === "POST" && req.url.pathname === "/rejoin") {
    return rejoin(req);
  }

  //create a websocket connection
  //should only happen on the /game page to join a game
  if (req.method === "GET" && req.upgrade === "websocket") {
    return make_websocket(req);
  }
}

function game_list(): Response | Promise<Response> {

}

function rejoin_game(req: Request): Response | Promise<Response> {

}

function make_websocket(req: Request): Response | Promise<Response> {
  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    //server should not send any messages on open, wait for client to send UUID
    connections.set(socket, "");
  };

  socket.onmessage = (e) => {
    const msg = JSON.parse(e.data);

    //make sure we get the client UUID first thing
    if (connections.get(socket) === "") {
      if (msg.uuid === null) {
        socket.close();
      }
      else if (msg.uuid === "0") {
        socket.send(JSON.stringify({uuid: String(crypto.randomUUID())}));
      }
      else if (v4.validate(msg.uuid)) {
        conn.set(socket, msg.uuid);
        clients.set(msg.uuid, new Connection(socket));
      }
      else {
        socket.close();
      }
    }
    
    let result = "";
    switch (msg.action):
      case "draw":
        clients.get(conn.get(socket)).game.player_draw(connection.get(socket));
        break;
      case "fold":
        clients.get(conn.get(socket)).game.player_fold(connection.get(socket));
        break;
      case "use":
        clients.get(conn.get(socket)).game.player_draw(connection.get(socket), msg.target);
        break;

    broadcast
  };

  socket.onclose = () => {
    connections.delete(socket);
  }

  return response;
}

function broadcast_next_action(game) {
  //const state = game.getState();
  //const payload = JSON.stringify({ type: "state", players: state });
  //for (const client of clients.values()) {
  //  client.send(payload);
  //}
}

console.log("WebSocket server on ws://localhost:8080");
games.push(new Game([["uuid", "Steve"]]));
console.log(crypto.randomUUID());
console.log(v4.validate(crypto.randomUUID()));
await serve(handler, { port: 8080 });

