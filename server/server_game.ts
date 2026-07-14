import { Game, Player } from "../shared/game.ts";

export class ServerGame extends Game {
  private deck!: string[];
  private discard_pile: string[] = [];
  private seed!: number;
  public uuid_to_player: Map<string, Player> = new Map();
  public winner: number | null = null;

  add_player_by_uuid(player_uuid: string, name: string): Player {
    let p: Player = this.add_player(name)
    this.uuid_to_player.set(player_uuid, p);
    return p;
  }

  //TODO: COME BACK TO THIS
  override start(): string {
    this.deck = Game.build_deck();
    this.shuffle();
    //hardcoded deck for additional manual testing
    //this.deck = ["1", "2", "f", "3", "4", "5", "f", "6", "7", "8", "9"]
    //this.deck = ["190", "191", "192", "193"]
    //this.deck = ["f", "d", "f", "1", "2", "3"];


    console.log("starting game with players", this.players);
    this.expected_action = "draw_or_fold";
    this.expected_action_player = 0;
    console.log(this.deck);
    return "g"
  }

  player_draw(): string[] {
    let actions: string[] = [];

    //shuffle discard into deck
    if (this.top_card_index >= this.deck.length) {
      this.deck = [...this.discard_pile];
      this.discard_pile = [];
      this.shuffle();
      this.top_card_index = 0;
      actions.push("shuffle");
      console.log("shuffling");
    }

    let card: string = this.deck[this.top_card_index];
    this.top_card_index++;

    if (this.expected_action == "draw_or_fold") {
      this.regular_draw(card);
    }
    else {
      this.force_draw(card);
    }
    actions.push(card);

    //hack to let main.ts know that the game is over
    if (this.expected_action as string == null) {
      actions.push("e");
    }

    return actions
  }

  player_fold(): string[] {
    console.log(`starting fold for p${this.expected_action_player}`);
    let actions: string[] = [];
    actions.push(this.fold());

    return actions;
  }

  player_use(target_order: number): string[] {
    let actions: string[] = [];
    actions.push(this.use(target_order));

    return actions;
  }

  override discard(card: string) {
    this.discard_pile.push(card);
  }

  //Fisher–Yates shuffle Algorithm
  //TODO: use seeded randomness for this with secret seed on server attached to the game object
  shuffle() {
    for (let i: number = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
    console.log("after shuffle deck", this.deck)
  }

  override seven_cards_animation(player: Player) {
  }
  override death_animation(player: Player) {
  }
  override new_round_animation() {
  }
  override game_over(winner_order: number) {
  }

  serialize(player_order: number | null): string {
    const public_game_state = {
      players: this.players,
      you: player_order,
      expected_action: this.expected_action,
      expected_action_player: this.expected_action_player,
      discard_top: this.discard_pile.length > 0 ? this.discard_pile[this.discard_pile.length - 1] : null,
      current_turn: this.current_turn,
      forced_draws: this.forced_draws,
      round_number: this.round_number,
      host_order: this.host_order,
      actions_log: this.actions_log
    };
    return JSON.stringify(public_game_state);
  }
}
