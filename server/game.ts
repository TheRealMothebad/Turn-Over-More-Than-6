//Game
//
//deck
// - array of cards
//deck_position
//discard
//current_player index 
//forced draws
// - tuple [uuid, number]
//players
// - client UUID 
// - Pretty name
// - cards
// - frozen
// - folded
// - lost
// - extra lives
// - score
//
//
//
// Somewhere I need to do validation on players being targeted by their order #

export class Player {
  uuid: string;
  name: string;
  order: number;
  cards: string[] = [];
  frozen = false;
  folded = false;
  lost = false;
  second_chances = 0;
  score = 0;
  connected = false;

  constructor(uuid: string, name: string, order: number) {
    this.uuid = uuid;
    this.name = name;
    this.order = order;
  }
}

export class GameAction {
  private action: "draw" | "fold" | "use" | "shuffle";
  private actor: number;
  private card: string;
  private target: number;

  public constructor(action, actor: number, card: string, target: number | null) {
    this.action = action;
    this.actor = actor;
    this.card = card;
    this.target = target;
  }
}

export class Game {
  private players: Player[] = [];
  public players_by_uuid: Map<string, Player> = new Map();
  private deck: string[] = [];
  private top_card: number = 0;
  //when a player loses, all their cards go in the discard
  private discard: string[] = [];
  //index in the players array
  private current_player: number = 0;
  //which player is being forced to draw a card [order, draws_remaining]
  private forced_draws: [number, number];

  public constructor(players: [string, string][]) {
    players.forEach((player, index) => {
      let p = new Player(player[0], player[1], index)
      this.players.push(p);
      this.players_by_uuid.set(player[0], p);
    });

    this.build_deck();
    this.shuffle();

    this.current_player = players[0];
    console.log(this.players);
    //console.log(this.deck);
  }

  get_player(uuid: string): Player {
     return this.players_by_uuid.get(uuid);
  }

  player_draw(uuid: string): [GameAction] {
    console.log(this.deck);
    let player: Player = this.get_player(uuid);

    //make sure that this player is supposed to draw
    //TODO: add error messages for illegal behavior
    //
    //if there is a player being forced to draw, only they can draw
    if (this.forced_draws != null && player.order != this.forced_draws[0]) {
      return;
    }

    //if you have a special card, you have to play it instead of drawing
    if (has_special(player)) {
      return;
    }

    //if nobody is being forced to draw, it has to be your turn to draw
    if (player.order == this.forced_draws[0]) {
      return;
    }

    let card: string = this.deck[this.top_card];

    if (this.forced_draws == null) {
      //if current player has any special cards the turn does not advance until they are all used
      if (!this.has_special(player.order)) {
        this.current_player = this.next_current();
      }
    }
    else {
      this.forced_draws[1]--;
      if (this.forced_draws[1] == 0) {
        this.forced_draws = null;
      }
    }

    this.top_card++;
    let actions = [new GameAction("draw", player.order, card, null)];
    //shuffle discard into deck
    if (this.top_card > this.deck.length) {
      this.deck = this.discard;
      this.discard = [];
      this.shuffle();
      actions.push(new GameAction("shuffle", null, null, null));
    }

    //player dies if the card drawn matches one they have, and is not an action card
    if (card in player.cards && !(card in ["f", "s", "d"])) {
      if (player.second_chances > 0) {
        player.second_chances--;
      }
    }
    else {
      player.lost = true;
      //if the player dies from a forced draw then stop forcing them to draw cards
      if (this.forced_draws[0] == player.order) {
        this.forced_draws = null;
      }
    }

    return actions;
  }

  player_fold(player_uuid: string): [GameAction] {
    let player: Player = this.get_player(uuid);
    this.

  }

  player_use(player_uuid: string, target: number): [GameAction] {
    let player: Player = this.get_player(uuid);

    //forced draws have to happen first
    if (this.forced_draws != null) {
      return;
    }

    //player has to have a special
    if (!this.has_special(player.order)) {
      return;
    }

    //find the action card that the player drew first (in case multiple from draw three)
    let special: string;
    for (let card of player.hand) {
      if (card in ["f", "s", "d"]) {
        special = card;
        break;
      }
    }

    //do the action on the target
    switch (special) {
      case "f":
        if (this.active(target)) {

      }
    }

    //if they have no more special cards advance the turn to the next player
    if (!this.has_special(player.order)) {
      this.current_player = this.next_current();
    }
  }

  next_current() {
    do {
      this.current_player = (this.current_player + 1) % this.players.length;
    } while (!this.active(this.current_player));
  }

  active(order: number) {
    let p: Player = this.players[order];
    return !(p.frozen && p.folded && p.lost);
  }

  has_special(order: number) {
    let p: Player = this.players[order];
    return ("f" in p.cards || "s" in p.cards || "d" in p.cards);
  }

  build_deck() {
    let deck: string[] = [];
    //add the special cards
    for (let i: number = 0; i < 3; i++) {
      //freeze
      deck.push("f");
      //second chance
      deck.push("s");
      //draw three
      deck.push("d");
    }

    //times 2
    deck.push("x2");

    //extra point cards
    for (let i: number = 2; i <= 10; i += 2) {
      deck.push("+" + i);
    }

    //normal cards
    deck.push("0");
    for (let i: number = 1; i <= 12; i++) {
      for (let j: number = 0; j < i; j++) {
        deck.push(String(i));
      }
    }

    this.deck = deck;
  }

  //Fisher–Yates shuffle Algorithm
  shuffle() {
    for (let i: number = this.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }


  serialize() {
    console.log(Game);
  }
}

