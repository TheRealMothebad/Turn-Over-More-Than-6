# Turn Over More Than 6

A multiplayer push-your-luck card game for the browser, in the vein of Flip 7. Play it at
[tomt6.umbriac.com](https://tomt6.umbriac.com).

## The game

On your turn you either draw a card or fold.

- Number cards (0 to 12) are worth their value. Drawing a number you already hold busts you, and you
  score nothing for the round.
- Folding banks the points in front of you and takes you out of the round.
- Modifier cards add points (+2 to +10) or double your total (x2).
- Action cards are played on any player still in the round, yourself included:
  - Freeze makes them fold on the spot.
  - Draw Three makes them draw three cards.
  - Second Chance saves them from their next bust.
- Turning over seven different number cards ends the round at once and earns a 15 point bonus.

A round ends when nobody is left in it. The game ends after the first round in which someone reaches
200 points, and the highest score wins.

## Architecture

The rules live in one place, `shared/game.ts`, and both the server and the client run them.

```
shared/game.ts     the rules: a state machine tracking whose move it is and what they may do
server/            Deno server: lobbies over HTTP, games over WebSocket
client/            the browser UI, plain HTML, CSS and JavaScript
```

The server (`server/server_game.ts`) extends the shared `Game` class with the parts players must not
see or control: the deck, the shuffle and the discard pile. It validates each move and then broadcasts
only what happened, in messages a few characters long: the card that was drawn, a fold, or the target
of an action card.

The client keeps its own copy of the same `Game` class and applies each message to it, so it arrives at
the same state as the server without the full state being sent on every move. The full state is only
sent when a client connects or asks to resync. `build.sh` bundles `shared/game.ts` into
`client/game.shared.js` for the browser; run it after changing the shared code.

Because both sides run the same logic, the server and the client have to be deployed together whenever
`shared/game.ts` changes.

## Running it locally

Requires [Deno](https://deno.com).

```
cd server
deno task dev        # server on localhost:8080
deno task test       # game logic tests
```

Serve `client/` with any static file server. To point it at the local server, create `client/dev.js`
containing `window.IS_DEV = true;` (the file is ignored by git).

`client/game.html?demo` runs a game against bots entirely in the browser, with no server.

## Deploying

`deploy.sh` builds the server image, uploads it to the VPS through Portainer and swaps the running
container. `docker-compose.yml` records how that container is configured. The client is published
separately with GitHub Pages from the
[tomt6-client](https://github.com/TheRealMothebad/tomt6-client) repository, which holds the contents of
`client/`.

## Credits

The game logic, server and protocol were written by John Umbriac. The user interface in `client/` was
written by Claude, Anthropic's AI model, working to John's direction.
