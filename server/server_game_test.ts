import { assertEquals } from "@std/assert";
import { ServerGame } from "./server_game.ts";
import { Player } from "../shared/game.ts";

/**
 * A test harness for running controlled ServerGame scenarios.
 */
export class GameTestHarness {
  game: ServerGame;

  /**
   * @param numPlayers The number of players in the game.
   * @param deck The deck of cards to use for the game.
   * @param playerNames Optional array of player names.
   */
  constructor(
    numPlayers: number,
    deck: string[],
    playerNames: string[] = [],
  ) {
    // 1. Create Game Instance
    const hostName = playerNames.length > 0 ? playerNames[0] : "Player 1";
    this.game = new ServerGame("test-game-uuid", "Test Game", hostName);
    for (let i = 1; i < numPlayers; i++) {
      const name = playerNames[i] || `Player ${i + 1}`;
      this.game.add_player_by_uuid(`player-${i}-uuid`, name);
    }

    // 2. Set Deck. Accessing private property for test setup.
    // deno-lint-ignore no-explicit-any
    (this.game as any).deck = deck;

    // 3. Set Game State to "started", bypassing the shuffle and hardcoded deck in ServerGame.start()
    this.game.expected_action = "draw_or_fold";
    this.game.expected_action_player = 0;
    this.game.current_turn = 0;
  }

  /**
   * Executes a sequence of actions.
   * @param actions An array of tuples [playerOrder, action, targetOrder?].
   *        'action' can be 'draw', 'fold', or 'use'.
   */
  runActions(actions: string[]) {
    for (const action of actions) {
        if (this.game.winner_order != null) {
            break; // Stop if game has ended
        }
      switch (action.charAt(0)) {
        case "d":
          this.game.player_draw();
          break;
        case "f":
          this.game.player_fold();
          break;
        case "u": {
          const target_order_number = +action.slice(1);
          if (isNaN(target_order_number)) {
            throw new Error("Target must be specified for 'use' action.");
          }
          this.game.player_use(target_order_number);
          break;
        }
      }
    }
  }

  /**
   * @param _order The player's order number.
   */
  draw(_order: number) {
    this.game.player_draw();
  }

  getGameState() {
    return this.game;
  }

  /**
   * @param order The player's order number.
   * @returns The Player object.
   */
  getPlayer(order: number): Player {
    return this.game.players[order];
  }
}

Deno.test("One player draws one card", () => {
  const deck = ["1", "2", "3", "4", "5", "6", "7"];
  const harness = new GameTestHarness(1, deck);
  const game = harness.game;

  harness.runActions(["d"]);
  assertEquals(game.players[0].cards, ["1"]);
  assertEquals(game.expected_action, "draw_or_fold");
  assertEquals(game.current_turn, 0); // Turn moves to player 1
  assertEquals(game.expected_action_player, 0);
});

Deno.test("Two players, one draw", () => {
  const deck = ["1", "2", "3", "4", "5", "6", "7"];
  const harness = new GameTestHarness(2, deck);

  // Player 0 (turn 0) draws "1"
  harness.draw(0);

  const game = harness.getGameState();
  assertEquals(game.players[0].cards, ["1"]);
  assertEquals(game.expected_action, "draw_or_fold");
  assertEquals(game.current_turn, 1); // Turn moves to player 1
  assertEquals(game.expected_action_player, 1);

  // Player 1 (turn 1) draws "2"
  harness.draw(1);
  assertEquals(game.players[1].cards, ["2"]);
  assertEquals(game.expected_action, "draw_or_fold");
  assertEquals(game.current_turn, 0); // Turn moves back to player 0
  assertEquals(game.expected_action_player, 0);
});

Deno.test("Self-freeze passes turn even with extra action cards in hand", () => {
  const deck = ["1", "2", "3"];
  const harness = new GameTestHarness(2, deck);
  const game = harness.game;

  game.players[0].cards = ["f", "s"];
  game.expected_action = "use";
  game.expected_action_player = 0;
  game.current_turn = 0;

  game.player_use(0);

  assertEquals(game.players[0].cards, ["s"]);
  assertEquals(game.players[0].frozen, true);
  assertEquals(game.current_turn, 1);
  assertEquals(game.expected_action, "draw_or_fold");
  assertEquals(game.expected_action_player, 1);
});

Deno.test("Three players preserve turn order through freeze and draw-three chain", () => {
  const deck = ["f", "d", "f", "1", "2", "3"];
  const harness = new GameTestHarness(3, deck);
  const game = harness.game;

  // Player 0 draws freeze and immediately uses it on player 2.
  // The turn moves on as soon as the card is drawn, before it is played.
  harness.draw(0);
  assertEquals(game.players[0].cards, ["f"]);
  assertEquals(game.expected_action, "use");
  assertEquals(game.current_turn, 1);
  assertEquals(game.expected_action_player, 0);

  game.player_use(2);
  assertEquals(game.players[2].frozen, true);
  assertEquals(game.current_turn, 1);
  assertEquals(game.expected_action, "draw_or_fold");
  assertEquals(game.expected_action_player, 1);

  // Player 1 draws draw-three and uses it on player 0.
  harness.draw(1);
  assertEquals(game.players[1].cards, ["d"]);
  assertEquals(game.expected_action, "use");
  assertEquals(game.current_turn, 0);
  assertEquals(game.expected_action_player, 1);

  game.player_use(0);
  assertEquals(game.expected_action, "force_draw");
  assertEquals(game.current_turn, 0);
  assertEquals(game.expected_action_player, 0);

  // Player 0 resolves the forced draws, drawing another freeze.
  harness.draw(0);
  assertEquals(game.players[0].cards, ["f"]);
  assertEquals(game.expected_action, "force_draw");
  assertEquals(game.current_turn, 0);
  assertEquals(game.expected_action_player, 0);

  harness.draw(0);
  assertEquals(game.players[0].cards, ["f", "1"]);
  assertEquals(game.expected_action, "force_draw");
  assertEquals(game.current_turn, 0);
  assertEquals(game.expected_action_player, 0);

  harness.draw(0);
  assertEquals(game.players[0].cards, ["f", "1", "2"]);
  assertEquals(game.expected_action, "use");
  assertEquals(game.current_turn, 0);
  assertEquals(game.expected_action_player, 0);

  // Player 2 is already frozen, so they are not a valid target any more.
  assertEquals(game.player_use(2), []);
  assertEquals(game.expected_action, "use");

  // Player 0 freezes player 1. It was player 0's turn next (after player 1's draw three),
  // and it still is: the forced draws and the freeze do not use up their own turn.
  game.player_use(1);
  assertEquals(game.players[1].frozen, true);
  assertEquals(game.current_turn, 0);
  assertEquals(game.expected_action, "draw_or_fold");
  assertEquals(game.expected_action_player, 0);
});

Deno.test("Busting on a draw three does not give the busted player the turn", () => {
  const deck = ["d", "5", "1", "2"];
  const harness = new GameTestHarness(3, deck);
  const game = harness.game;
  game.players[1].cards = ["5"];

  // Player 0 draws draw-three and plays it on player 1, who is next in turn order.
  harness.draw(0);
  assertEquals(game.current_turn, 1);
  game.player_use(1);
  assertEquals(game.expected_action, "force_draw");
  assertEquals(game.expected_action_player, 1);

  // Player 1 draws a second 5 and busts. The turn must pass them by.
  harness.draw(1);
  assertEquals(game.players[1].lost, true);
  assertEquals(game.forced_draws, []);
  assertEquals(game.expected_action, "draw_or_fold");
  assertEquals(game.current_turn, 2);
  assertEquals(game.expected_action_player, 2);
});

Deno.test("A freeze drawn during forced draws does not skip the next player", () => {
  const deck = ["d", "f", "1", "2", "3"];
  const harness = new GameTestHarness(3, deck);
  const game = harness.game;

  // Player 0 draws draw-three (the turn moves to player 1) and plays it on player 2.
  harness.draw(0);
  game.player_use(2);
  harness.runActions(["d", "d", "d"]);
  assertEquals(game.players[2].cards, ["f", "1", "2"]);
  assertEquals(game.expected_action, "use");
  assertEquals(game.expected_action_player, 2);

  // Player 2 freezes player 0. Player 1 was next and must still be next.
  game.player_use(0);
  assertEquals(game.players[0].frozen, true);
  assertEquals(game.expected_action, "draw_or_fold");
  assertEquals(game.current_turn, 1);
  assertEquals(game.expected_action_player, 1);
});

Deno.test("A freeze drawn during forced draws skips the next player only if it froze them", () => {
  const deck = ["d", "f", "1", "2", "3"];
  const harness = new GameTestHarness(3, deck);
  const game = harness.game;

  harness.draw(0);
  game.player_use(2);
  harness.runActions(["d", "d", "d"]);

  // Player 2 freezes player 1, whose turn it would have been. Play carries on with player 2.
  game.player_use(1);
  assertEquals(game.players[1].frozen, true);
  assertEquals(game.expected_action, "draw_or_fold");
  assertEquals(game.current_turn, 2);
  assertEquals(game.expected_action_player, 2);
});

Deno.test("Leftover action cards are played after a draw-three chain", () => {
  const deck = ["d", "d", "f", "1", "s", "2", "3", "4"];
  const harness = new GameTestHarness(3, deck);
  const game = harness.game;

  // Player 0 plays draw-three on player 1, who draws another draw-three and a freeze.
  harness.draw(0);
  game.player_use(1);
  harness.runActions(["d", "d", "d"]);
  assertEquals(game.players[1].cards, ["d", "f", "1"]);
  assertEquals(game.expected_action, "use");
  assertEquals(game.expected_action_player, 1);

  // Player 1 plays their draw-three on player 2, who draws a second chance.
  game.player_use(2);
  harness.runActions(["d", "d", "d"]);
  assertEquals(game.players[2].cards, ["s", "2", "3"]);
  assertEquals(game.expected_action, "use");
  assertEquals(game.expected_action_player, 2);

  // Once player 2 has played it, player 1 still has to play their freeze.
  game.player_use(2);
  assertEquals(game.players[2].second_chances, 1);
  assertEquals(game.expected_action, "use");
  assertEquals(game.expected_action_player, 1);
  assertEquals(game.players[1].cards, ["f", "1"]);

  // Only then does normal play resume, with player 1 (the player after player 0).
  game.player_use(2);
  assertEquals(game.players[2].frozen, true);
  assertEquals(game.players[1].cards, ["1"]);
  assertEquals(game.forced_draws, []);
  assertEquals(game.expected_action, "draw_or_fold");
  assertEquals(game.current_turn, 1);
  assertEquals(game.expected_action_player, 1);
});

Deno.test("A second chance during forced draws does not cancel the remaining draws", () => {
  const deck = ["d", "5", "1", "2", "3"];
  const harness = new GameTestHarness(2, deck);
  const game = harness.game;
  game.players[1].cards = ["5"];
  game.players[1].second_chances = 1;

  harness.draw(0);
  game.player_use(1);

  // The duplicate 5 is discarded and uses up the second chance, with two draws still to go.
  harness.draw(1);
  assertEquals(game.players[1].lost, false);
  assertEquals(game.players[1].second_chances, 0);
  assertEquals(game.players[1].cards, ["5"]);
  assertEquals(game.expected_action, "force_draw");
  assertEquals(game.expected_action_player, 1);
  assertEquals(game.forced_draws[0][1], 2);

  harness.runActions(["d", "d"]);
  assertEquals(game.players[1].cards, ["5", "1", "2"]);
  assertEquals(game.forced_draws, []);
  assertEquals(game.expected_action, "draw_or_fold");
  assertEquals(game.expected_action_player, 1);
});

Deno.test("Action cards can only be played on a valid, active player", () => {
  const harness = new GameTestHarness(3, ["1", "2", "3"]);
  const game = harness.game;
  game.players[0].cards = ["f"];
  game.players[2].folded = true;
  game.expected_action = "use";

  // None of these may change anything: not a player, not a whole number, out of range, folded.
  for (const target of [-1, 1.5, 3, NaN, 2]) {
    assertEquals(game.player_use(target), []);
  }
  assertEquals(game.players[0].cards, ["f"]);
  assertEquals(game.expected_action, "use");
  assertEquals(game.expected_action_player, 0);

  assertEquals(game.player_use(1), ["1"]);
  assertEquals(game.players[1].frozen, true);
  assertEquals(game.players[0].cards, []);
});

Deno.test("A freeze that ends the round starts the next round with the following player", () => {
  const harness = new GameTestHarness(3, ["f", "1", "2"]);
  const game = harness.game;
  game.players[1].folded = true;
  game.players[2].folded = true;
  game.players[0].cards = ["7"];

  // Player 0 is the last one in and has to freeze themself.
  harness.draw(0);
  game.player_use(0);
  assertEquals(game.round_number, 2);
  assertEquals(game.players[0].score, 7);
  assertEquals(game.players[0].frozen, false);
  assertEquals(game.expected_action, "draw_or_fold");
  assertEquals(game.current_turn, 1);
  assertEquals(game.expected_action_player, 1);
});
