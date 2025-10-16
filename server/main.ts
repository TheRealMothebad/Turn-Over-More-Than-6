// server.ts
import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { v4 } from "https://deno.land/std@0.208.0/uuid/mod.ts";
import { Game } from "./game.ts";

const clients = new Map<string, WebSocket>();
const game = new Game();

function handler(req: Request): Response | Promise<Response> {
  const { socket, response } = Deno.upgradeWebSocket(req);

  let clientId: string | null = null;

  socket.onopen = () => {
    clientId = v4.generate();
    clients.set(clientId, socket);

    // add to game with placeholder name
    game.addPlayer(clientId, "Player-" + clientId.slice(0, 4));

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
await serve(handler, { port: 8080 });

