// @ts-ignore
import {assertEquals} from "https://deno.land/std@0.224.0/assert/mod.ts";
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
        case "u":
          let target_order_number = +action.slice(1);
          if (target_order_number === undefined) {
            throw new Error("Target must be specified for 'use' action.");
          }
          this.game.player_use(target_order_number);
          break;
      }
    }
  }

  /**
   * @param order The player's order number.
   * @returns The Player object.
   */
  getPlayer(order: number): Player {
    return this.game.players[order];
  }
}

// @ts-ignore
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

// @ts-ignore
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

// @ts-ignore
Deno.test("One player draws one card", () => {
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