import { validate } from "@std/uuid";
import { ServerGame } from "./server_game.ts";

//map a socket connection to a player UUID
const connections: Map<WebSocket, string|null> = new Map();
//map a player UUID to a socket
const clients: Map<string, WebSocket> = new Map();

//map a player UUID to a game
const player_to_game: Map<string, ServerGame> = new Map();

//actively running games
//game UUID to game object
const games: Map<string, ServerGame> = new Map();

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  //handle OPTIONS preflight requests
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
    return make_websocket(req);
  }

  console.log("Unrecognized API request", Request);
  return cors_response(new Response("Not Found", { status: 404 }));
}

function cors_response(response: Response): Response {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}

function game_list(): Response | Promise<Response> {
  const lobby_list = Array.from(games.values())
    .filter(game => {return game.expected_action == "start_game"})
    .map(game => ({
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
    if (game_name.length > 25) {
      game_name = game_name.substring(0, 25);
    }

    const game_uuid = crypto.randomUUID();
    const host_uuid = crypto.randomUUID();

    const game = new ServerGame(game_uuid, game_name, username);
    game.uuid_to_player.set(host_uuid, game.players[0]);
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
    else if (target_game.expected_action != "start_game") {
      return new Response("Game has already started.", { status: 404 });
    }

    const player_uuid = crypto.randomUUID();
    target_game.add_player_by_uuid(player_uuid, username);
    player_to_game.set(player_uuid, target_game);

    console.log(username, "joined lobby", target_game.name, "and got uuid", player_uuid);

    return new Response(JSON.stringify({ player_uuid }), { status: 200 });
  } catch (error) {
    console.error("Error joining lobby:", error);
    return new Response("Bad Request", { status: 400 });
  }
}

function make_websocket(req: Request): Response | Promise<Response> {
  // @ts-ignore
  const { socket, response } = Deno.upgradeWebSocket(req);
  console.log("socket made");

  socket.onopen = () => {
    //server should not send any messages on open, wait for client to send UUID
    connections.set(socket, null);
    console.log("connection opened, waiting for UUID");
  };

  //TODO: remove jsonization from here, could save on bandwidth?
  //also restrict message size max to size of uuid?
  socket.onmessage = (e: { data: string; }) => {
    try {
      const msg: string = e.data;
      const player_uuid = connections.get(socket);
      console.log("message is:",msg);

      //check if this is the first message on this socket (socket not yet mapped to a player UUID)
      if (!player_uuid) {
        //and make sure that it contains a player UUID
        if (validate(msg)) {
          //check that there is a game with a player with that uuid
          const game = player_to_game.get(msg);
          if (!game) {
            console.log("no game found for uuid:", msg);
            socket.close();
            return;
          }
          //game found! update all the maps
          connections.set(socket, msg);
          clients.set(msg, socket);
          console.log(game);
          const player = game.uuid_to_player.get(msg);
          if (!player) {
            console.log("no player found for uuid:", msg);
            socket.close();
            return;
          }
          console.log(player, msg);
          player.connected = true;
          socket.send(game.serialize(player.order));
          broadcast_action(game, "p" + JSON.stringify(player));
          broadcast_action(game, "c" + player.order);
        }
        //first message was not a UUID so abort the socket bc malformed client
        else {
          console.log("Invalid or missing UUID");
          socket.close();
        }
        //client ID by UUID completed, don't do anything else for this message
        return;
      }

      //because UUID is known, all further messages will be <=2 characters so it's an easy filter for malformed clients
      if (msg.length > 2 || msg.length == 0) {
        socket.close();
        return;
      }

      //easy to reference :)
      const game = player_to_game.get(player_uuid);
      const player = game?.uuid_to_player.get(player_uuid);
      let actions: string[] = [];

      if (!game || !player) {
        socket.close();
        return;
      }

      //client is requesting the game state
      if (msg == "r") {
        socket.send(game.serialize(player.order));
        return;
      }

      //handle messages from clients whose turn it is not (bad!)
      //not sure if this is the best way to handle this
      //another option is to send gamestate back to the client so that it can re-align
      //the only problem with that is if a client spams messages the server infinitely responds
      //with much bigger messages (easy dos attack)
      if (game.expected_action_player != player.order) {
        socket.close();
        return;
      }

      //check if the game is still in "lobby mode" (not yet started)
      if (game.expected_action === "start_game") {
        //this code is only run if player.order matches game.host_order
        //(which is the same as game.expected_action_player when in lobby mode)
        switch (msg) {
          //start the game
          case "s":
            //tell everyone that the game has started
            actions.push(game.start())
            break;
          case "kick":
            console.log("kick tried");
            //let host kick players (not themselves?)
            //not yet implemented
            break;
        }
      }
      //game is active!
      else {
        if (msg == "d" && game.expected_action === "draw_or_fold" || game.expected_action === "force_draw") {
          actions.push(...game.player_draw());
        }
        else if (msg == "f" && game.expected_action == "draw_or_fold") {
          actions.push(...game.player_fold());
        }
        //check if this is potentially an order number, and there is a player with that number
        else if (game.expected_action == "use" && !isNaN(+msg) && +msg < game.players.length) {
          actions.push(...game.player_use(+msg));
        }
        else {
          console.log("Unexpected message:", msg, "from client", player);
        }
      }
      console.log("actions is", actions);

      for (const action of actions) {
        broadcast_action(game, action);
      }
      //hack to let the game tell the networking handler that it's time to clean everything up
      if (game.winner_order != null) {
        end_game(game).catch(e => console.error("error in end_game:", e));
      }
    } catch (error) {
      console.error("Error processing message:", error);
    }
  };

  socket.onclose = () => {
    const player_uuid = connections.get(socket);
    //check if this socket was ever associated with a player
    if (player_uuid) {
      //delete all the map stuff and mark the player as disconnected
      const game = player_to_game.get(player_uuid);
      if (game) {
        const player = game.uuid_to_player.get(player_uuid);
        if (player) {
          player.connected = false;
          broadcast_action(game, "l" + player.order);
        }
      }
      connections.delete(socket);
      clients.delete(player_uuid);
    }
  };

  return response;
}

async function end_game(game: ServerGame) {
  const timestamp = new Date().toISOString().replace(/:/g, "-").replace(/\..+/, "");
  const safeGameName = game.name.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `./game-archives/${safeGameName}-${game.uuid}-${timestamp}.json`;

  try {
    // @ts-ignore
    await Deno.mkdir("./game-archives", { recursive: true });
    const game_json = JSON.stringify(game.serialize(null), null, 2);
    // @ts-ignore
    await Deno.writeTextFile(filename, game_json);
    console.log(`Game ${game.uuid} saved to ${filename}`);
  } catch (e) {
    console.error(`Failed to save game ${game.uuid} to ${filename}:`, e);
  }

  for (const player_uuid of game.uuid_to_player.keys()) {
    console.log("closing sockets");
    player_to_game.delete(player_uuid);
    const socket = clients.get(player_uuid);
    if (socket) {
      socket.close(1000, "Game Finished!");
      clients.delete(player_uuid);
      connections.delete(socket);
    }
  }

  games.delete(game.uuid);
  console.log(`Game ${game.uuid} has ended and been cleaned up.`);
}

function broadcast_action(game: ServerGame, action: string) {
  game.uuid_to_player.forEach((p, uuid) => {
    const socket = clients.get(uuid);
    if (socket != null && socket.readyState === WebSocket.OPEN) {
      socket.send(action);
    }
  });
}

console.log("tomt6 server on localhost:8080");
Deno.serve({ port: 8080 }, handler);

