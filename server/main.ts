// server.ts
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { v4 } from "https://deno.land/std@0.208.0/uuid/mod.ts";
import { Game } from "./game.ts";

const connections: Map<string, WebSocket> = new Map();
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
  if (req.method === "GET" && req.url.pathname === "/ws") {
    return make_websocket(req);
  }
}

function game_list(): Response | Promise<Response> {

}

function rejoin_game(req: Request): Response | Promise<Response> {

}

function make_websocket(req: Request): Response | Promise<Response> {
  const { socket, response } = Deno.upgradeWebSocket(req);

  let clientId: string | null = null;

  socket.onopen = () => {
    //server should not do anything on open, wait for client to send UUID

    clientId = crypto.randomUUID();
    clients.set(clientId, socket);

    // add to game with placeholder name

    socket.send(JSON.stringify({ type: "assignId", id: clientId }));
    broadcastGameState();
  };

  socket.onmessage = (e) => {
    const msg = JSON.parse(e.data);






    if (msg.type === "resume" && msg.id) {
      clientId = msg.id;
      clients.set(clientId, socket);
      game.addPlayer(clientId, "Player-" + clientId.slice(0, 4));
      broadcastGameState();
    }

    if (msg.type === "dealCard" && clientId) {
      game.dealCard(clientId, msg.card);
      broadcastGameState();
    }
  };

  socket.onclose = () => {
    if (clientId) {
      clients.delete(clientId);
      game.removePlayer(clientId);
      broadcastGameState();
    }
  };

  return response;
}

function broadcastGameState() {
  const state = game.getState();
  const payload = JSON.stringify({ type: "state", players: state });
  for (const client of clients.values()) {
    client.send(payload);
  }
}

console.log("WebSocket server on ws://localhost:8080");
games.push(new Game([["uuid", "Steve"]]));
await serve(handler, { port: 8080 });

