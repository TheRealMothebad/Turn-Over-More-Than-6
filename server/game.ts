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
// -lost
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
  private round_number: number = 1;

  public constructor(players: [string, string][]) {
    players.forEach((player, index) => {
      let p = new Player(player[0], player[1], index)
      this.players.push(p);
      this.players_by_uuid.set(player[0], p);
    });

    this.build_deck();
    this.shuffle();

    this.current_player = 0;
    console.log(this.players);
    //console.log(this.deck);
  }

  get_player(uuid: string): Player {
     return this.players_by_uuid.get(uuid);
  }

  player_draw(player_uuid: string): [GameAction] {
    let player: Player = this.get_player(player_uuid);
    console.log("player", player.order, "draws on", this.current_player, "'s turn");

    //make sure that this player is supposed to draw
    //TODO: add error messages for illegal behavior
    //
    //if there is a player being forced to draw, only they can draw
    if (this.forced_draws != null && player.order != this.forced_draws[0]) {
      console.log("ERROR: Forced draw must happen first");
      return;
    }

    //if you have a special card, you have to play it instead of drawing
    if (this.has_special(player) && this.forced_draws == null) {
      console.log("ERROR: Unplayed special");
      return;
    }

    //if nobody is being forced to draw, it has to be your turn to draw
    if (this.forced_draws == null && player.order != this.current_player) {
      console.log("ERROR: Not your turn", player.order, this.current_player);
      return;
    }

    let card: string = this.deck[this.top_card];
    console.log("They drew", card);

    if (this.forced_draws == null) {
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
      this.top_card = 0;
      actions.push(new GameAction("shuffle", null, null, null));
    }

    //player dies if the card drawn matches one they have, and is not an action card
    if (player.cards.includes(card) && !["f", "s", "d"].includes(card)) {
      if (player.second_chances > 0) {
        player.second_chances--;
        this.discard.push(card);
      }
      else {
        console.log("player", player.order, "died lol");
        player.lost = true;
        //if the player dies from a forced draw then stop forcing them to draw cards
        if (this.forced_draws != null) {
          this.forced_draws = null;
        }

        //move all their cards to the discard
        while (player.cards.length > 0) {
          console.log("moving", player.cards[0],"to discard");
          this.discard.push(player.cards.shift());
        }

        //check if the round is over
        this.check_round_over();
        this.current_player = this.next_current();
      }
    }
    else {
      player.cards.push(card);
      this.check_round_over();

      //if current player has any special cards the turn does not advance until they are all used
      if (!this.has_special(player)) {
        console.log("setting new current player");
        this.current_player = this.next_current();
      }
    }

    console.log("draw over");

    return actions;
  }

  player_fold(player_uuid: string): [GameAction] {
    let player: Player = this.get_player(player_uuid);
    console.log(player.order,"is folding");
    
    //forced draws have to happen first
    if (this.forced_draws != null) {
      console.log("ERROR: Forced draw must happen first");
      return;
    }

    //it has to be this player's turn
    if (this.current_player != player.order) {
      console.log("ERROR: It has to be your turn");
      return;
    }
    
    //this player cannot have any unused specials
    if (this.has_special(player)) {
      console.log("ERROR: You must use specials first");
      return;
    }

    player.folded = true;

    //go to the next player's turn
    this.check_round_over();
    this.current_player = this.next_current();

    return [new GameAction("fold", player.order, null, null)];
  }

  player_use(player_uuid: string, target: number): [GameAction] {
    let player: Player = this.get_player(player_uuid);
    console.log(player.order,"is using on", target);

    if (target == null || target >= this.players.length) {
      console.log("ERROR: Bad target");
      return;
    }

    //forced draws have to happen first
    if (this.forced_draws != null) {
      console.log("ERROR: Forced draw must happen first");
      return;
    }

    //player has to have a special
    if (!this.has_special(player)) {
      console.log("ERROR: You must have a special");
      return;
    }

    //target has to be an active player
    if (!this.active(target)) {
      console.log("ERROR: You must be the active player");
      return;
    }

    //find the action card that the player drew first (in case multiple from draw three)
    let special: string;
    for (let card of player.cards) {
      if (["f", "s", "d"].includes(card)) {
        special = card;
        break;
      }
    }
    console.log("using", special, "on", target);

    //do the action on the target
    switch (special) {
      case "f":
        this.players[target].frozen = true;
        break;
      case "s":
        this.players[target].second_chances++;
        break;
      case "d":
        this.forced_draws = [target, 3];
        break;
    }

    //remove the special card from the player's hand and add to discard
    const special_index = player.cards.indexOf(special);
    if (special_index > -1) {
      let card = player.cards.splice(special_index, 1)[0];
      this.discard.push(card);
    }

    this.check_round_over();

    //if they have no more special cards advance the turn to the next player
    if (!this.has_special(player)) {
      this.current_player = this.next_current();
    }

    return [new GameAction("use", player.order, null, target)];
  }

  next_current() {
    let next_player: number = this.current_player;
    do {
      next_player = (next_player + 1) % this.players.length;
    } while (!this.active(next_player));
    console.log("new current is", next_player);
    return next_player;
  }

  active(order: number) {
    let p: Player = this.players[order];
    return !(p.frozen || p.folded || p.lost);
  }

  has_special(p: Player) {
    return (p.cards.includes("f") || p.cards.includes("s") || p.cards.includes("d"));
  }

  check_round_over() {
    let all_dead: boolean = true;
    let seven_cards: number = -1;
    console.log("checking round over");
    for (let p of this.players) {
      if (this.active(p.order)) {
        console.log(p.order, "is still kicking");
        all_dead = false;
      }
      let card_count = 0;
      for (let card of p.cards) {
        if (isFinite(card) && !card.startsWith("+")) {
          card_count++;
        }
      }
      if (card_count > 6) {
        seven_cards = p.order;
      }
    }
    
    if (all_dead || seven_cards >= 0) {
      console.log("round is over!");
      this.round_number++;
      for (let p of this.players) {
        if (!p.lost) {
          p.score += this.calc_score(p);
          if (p.order == seven_cards) {
            p.score += 15;
          }
        }
        //move the cards to the discard
        while (p.cards.length > 0) {
          this.discard.push(p.cards.shift());
        }
        p.second_chances = 0;
        p.lost = false;
        p.frozen = false;
        p.folded = false;
      }
      this.forced_draws = null;
    }
  }

  calc_score(p): number {
    let score = 0;
    let multiplier = 1;
    for (let card of p.cards) {
      if (card === "x2") {
        multiplier = 2;
      }
      if (!isNaN(card)) {
        score += parseInt(card);
      }
    }

    return score * multiplier;
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
    let copy: Game = { ...this }
    delete copy.deck;
    delete copy.top_card;
    copy.discard = this.discard[this.discard.length];
    return copy;
  }
}

