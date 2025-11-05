// server.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { v4 } from "https://deno.land/std@0.224.0/uuid/mod.ts";
import { Game, GameAction } from "./game.ts";

//map a socket connection to a player uuid 
const connections: Map<WebSocket, string> = new Map();
//map a player UUID to a socket
const clients: Map<string, WebSocket> = new Map();

//map a player UUID to a game
const player_to_game: Map<string, Game> = new Map();

//actively running games
//game uuid to game object
const games: Map<string, Game> = new Map();

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
    return cors_response(await create_game(req));
  }

  if (req.method === "POST" && url.pathname === "/join") {
    return cors_response(await join_game(req));
  }

  //create a websocket connection
  //should only happen on the /game page to join a game
  if(req.method === "GET" && url.pathname === "/game" && req.headers.get("upgrade") === "websocket") {
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
  const lobby_list = Array.from(games.values()).map(game => ({
    name: game.name,
    uuid: game.uuid,
    playerCount: game.players.length,
  }));

  return new Response(JSON.stringify({ lobbies: lobby_list }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function create_game(req: Request): Promise<Response> {
  console.log("attempting to create game lobby");
  try {
    let {game_name, username} = await req.json();

    if (!username) {
      return new Response("Username is required.", { status: 400 });
    }
    if (!game_name) {
      return new Response("Game name is required.", { status: 400 });
    }
    if (username.length > 25) {
      username = username.substring(0, 25);
    }
    if (game_name.length > 15) {
      game_name = game_name.substring(0, 15);
    }

    const game_uuid = crypto.randomUUID();
    const host_uuid = crypto.randomUUID();

    const game = new Game(game_uuid, game_name, host_uuid, username);
    games.set(game_uuid, game);
    player_to_game.set(host_uuid, game);
    console.log("game", game.name, game.uuid, "created");

    return new Response(JSON.stringify({ host_uuid }), { status: 200 });
  } catch (error) {
    console.error("Error creating lobby:", error);
    return new Response("Bad Request", { status: 400 });
  }
}

async function join_game(req: Request): Promise<Response> {
  try {
    let {game_uuid, username} = await req.json();
    console.log(username, "is attempting to join lobby", game_uuid);

    if (!game_uuid) {
      return new Response("Game UUID is required.", { status: 400 });
    }
    if (!username) {
      return new Response("Username is required.", { status: 400 });
    }

    if (username.length > 25) {
      username = username.substring(0, 25);
    }

    const target_game = games.get(game_uuid);

    if (!target_game) {
      return new Response("Game not found.", { status: 404 });
    }
    else if (target_game.started) {
      return new Response("Game has already started.", { status: 404 });
    }

    const player_uuid = crypto.randomUUID();
    target_game.add_player(player_uuid, username);
    player_to_game.set(player_uuid, target_game);

    console.log(username, "joined lobby", target_game.name, "and got uuid", player_uuid);

    return new Response(JSON.stringify({ player_uuid }), { status: 200 });
  } catch (error) {
    console.error("Error joining lobby:", error);
    return new Response("Bad Request", { status: 400 });
  }
}

function make_websocket(req: Request): Response | Promise<Response> {
  const { socket, response } = Deno.upgradeWebSocket(req);
  console.log("socket made");

  socket.onopen = () => {
    //server should not send any messages on open, wait for client to send UUID
    connections.set(socket, null);
    console.log("connection opened");
  };

  socket.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      const player_uuid = connections.get(socket);

      //check if this is the first message on this socket (socket not yet mapped to a player UUID)
      if (!player_uuid) {
        //and make sure that it contains a player UUID
        if (msg.uuid && v4.validate(msg.uuid)) {
          //check that there is a game with a player with that uuid
          const game = player_to_game.get(msg.uuid);
          if (!game) {
            console.log("no game found for uuid:", msg.uuid);
            socket.close();
            return;
          }
          //game found! update all the maps
          connections.set(socket, msg.uuid);
          clients.set(msg.uuid, socket);
          console.log(game);
          const player = game.get_player(msg.uuid);
          console.log(player, msg.uuid);
          player.connected = true;
          broadcast_game_action(game, new GameAction("connect", player.order, null, 1));
        }
        //first message was not a uuid so abort the socket bc malformed client
        else {
          console.log("Invalid or missing UUID");
          socket.close();
        }
        //client ID by uuid completed, don't do anything else for this message
        return;
      }

      //TODO: make this code comment more descriptive/understandable
      //ensure connection is valid for subsequent messages (weird?)
      if (!player_uuid) {
        console.log("Invalid connection state");
        return;
      }

      //easy to reference :)
      const game = player_to_game.get(player_uuid);

      //check if the game is still in "lobby mode" (not yet started)
      if (!game.started) {
        let action: GameAction;
        switch (msg.action) {
          case "start":
            action = game.start(player_uuid);
            break;
          case "kick":
            console.log("kick tried");
            //let host kick players (not themselves?)
            //not yet implemented
            break;
          case "state":
            //TODO: return lobby state (game state?)
            socket.send(JSON.stringify({game: game.lobby_state(player_uuid)}));
            break;
        }
        if (action) {
          broadcast_game_action(game, action);
        }
        //only lobby actions allowed until game starts
        return;
      }

      let actions: [GameAction];
      switch (msg.action) {
        case "draw":
          console.log("player", game.get_player(player_uuid).order, "requested to draw");
          actions = game.player_draw(player_uuid);
          break;
        case "fold":
          console.log("player", game.get_player(player_uuid).order, "requested to fold");
          actions = game.player_fold(player_uuid);
          break;
        case "use":
          console.log("player", game.get_player(player_uuid).order, "requested to use on", msg.target);
          actions = game.player_use(player_uuid, msg.target);
          break;
        case "state":
          console.log("player", game.get_player(player_uuid).order, "requested gamestate");
          clients.get(player_uuid).send(JSON.stringify({game: game.serialize(player_uuid)}));
          //return early to avoid broadcast
          return; 
      }

      if (actions) {
        for (const action of actions) {
          broadcast_game_action(game, action);
          //whatever man, naming stuff is hard
          if (action.action === "end") {
            end_game(game);
            break;
          }
        }
      }
    } catch (error) {
      console.error("Error processing message:", error);
    }
  };

  socket.onclose = () => {
    let player_uuid = connections.get(socket);
    //check if this socket was ever associated with a player
    if (player_uuid) {
      //delete all the map stuff and mark the player as disconnected
      const game = player_to_game.get(player_uuid);
      if (game) {
        let player = game.get_player(player_uuid);
        player.connected = false;
        broadcast_game_action(game, new GameAction("connect", player.order, null, 0));
      }
      connections.delete(socket);
      clients.delete(player_uuid);
    }
  };

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
    player_to_game.delete(player_uuid);
    let socket = clients.get(player_uuid);
    if (socket) {
      socket.close(1000, "Game Finished!");
      clients.delete(player_uuid);
      connections.delete(socket);
    }
  }

  games.delete(game.uuid);
  console.log(`Game ${game.uuid} has ended and been cleaned up.`);
}

function broadcast_game_action(game: Game, action: GameAction) {
  console.log("broadcast", action);

  game.players_by_uuid.forEach(p => {
    const message = JSON.stringify({"action": action, "game": game.serialize(p.uuid)});
    const socket = clients.get(p.uuid);
    if (socket != null && socket.readyState === WebSocket.OPEN) {
      socket.send(message);
    }
  });
}

console.log("tomt6 server on localhost:8080");
await serve(handler, { port: 8080 });

