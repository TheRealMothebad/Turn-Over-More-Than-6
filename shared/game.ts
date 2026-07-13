//Game enters states depending on what the next expected action is
//x draws or folds
//x force draws 
//x plays an action card on y 
//- expected_action_player
//
//
//game fields:
//- expected_action_player
//- expected action 
//
//client action object:
//- omni-variable?
//
//UI
//
//server
//test how chains of draw three end up working
//


//DA GAMES GOTTA END!

export class Player {
  name: string;
  order: number;
  cards: string[] = [];
  frozen = false;
  folded = false;
  lost = false;
  second_chances = 0;
  score = 0;
  connected = false;

  constructor(name: string, order: number) {
    this.name = name;
    this.order = order;
    //temp for end game testing
    //this.score = 199;
  }
}

export class Game {
  public uuid: string;
  public name: string;
  public host_order: number;
  public players: Player[] = [];
  //equal to how many cards have been drawn
  //this is shared with the client so that it can know/show when the draw pile is empty, and being shuffled
  public top_card_index: number = 0;
  //similar to the "state" of the state machine
  public expected_action: "draw_or_fold"|"force_draw"|"use"|"start_game" = "start_game";
  //index in the players array
  public expected_action_player: number = 0;
  //tracks whose turn it is, this needs to be separate from the next_action_player bc draw three could make that be anyone
  public current_turn: number = 0;
  //the order number of the winner of the game
  public winner_order: number | null = null;
  //top card of the discard pile
  public discard_top: string | null = null;
  //which player is being forced to draw a card [order, draws_remaining, source_player_order]
  //this last parameter is needed for the extremely rare case that a draw three forces
  //a player to draw both another draw three and an additional action card, both need to be
  //played before normal play is resumed
  //this can cause chains which need to be tracked by this stack structure
  public forced_draws: [number, number, number][] = [];
  public round_number: number = 1;

  //game is deterministic (once seeded randomness is added), it should be able to replay from just these inputs
  //a client can use these + a list of server responses to replay a game as well
  public actions_log: string[] = [];

  public constructor(game_uuid: string, game_name: string, host_name: string) {
    this.uuid = game_uuid;
    this.name = game_name;
    this.host_order = this.add_player(host_name).order;
    this.expected_action_player = this.host_order;
  }

  start(): string {
    return "";
  }

  seven_cards_animation(player: Player) {}
  death_animation(player: Player, card: string) {}
  new_round_animation() {}
  game_over(winner_order: number) {}

  protected add_player(name: string): Player {
    const player = new Player(name, this.players.length);
    this.players[player.order] = player;
    console.log("added", name, "to game", this.name);
    return player;
  }

  //handle the consequences a non-forced draw
  regular_draw(card: string) {
    const player = this.players[this.expected_action_player];
    
    if (!this.check_handle_dead(player, card)) {
      //next card is safe, draw it!
      player.cards.push(card);
      //update the expected_action parameters (go to the next state of the state machine)
      if (this.is_action_card(card)) {
        //if the drawn card is a special then it needs to be used immediately by the current player
        this.expected_action = "use";
        //(the expected_action_player remains the same)
      }
      else {
        //if it's a normal card then check if the round is over
        this.check_handle_round_over();
      }
    }

    //if this is anything other than a feeeze, it becomes the next available player's turn
    //note that this happens after the round ends (if it does)
    //so all previously dead players are already revived and eligible
    //It also happens before any drawn action card is played!
    if (card != "f") {
      this.current_turn = this.next_in_turn_order();
    }
    console.log("current_turn has moved to", this.players[this.current_turn].order);

    //if anything other than an action card was drawn then the next player to act is the player whose turn it is
    if (!this.is_action_card(card)) {
      this.expected_action_player = this.current_turn;
    }
  }

  //handle the consequences a forced draw
  //note that while forced draws are happening, current_turn is already on the
  //player that play will resume with after the forced draws are completed
  //TODO: explore restructuring this, it's not clean :(
  force_draw(card: string) {
    const player = this.players[this.expected_action_player];

    //check if a player would die from this draw
    if (this.check_handle_dead(player, card)) {
      this.queue_unplayed_action_cards();
      return;
    }

    player.cards.push(card);
    //decrement the number of forced draws left
    this.forced_draws[this.forced_draws.length - 1][1]--;

    if (this.check_handle_round_over()) {
      this.expected_action_player = this.current_turn;
      this.expected_action = "draw_or_fold"
      return;
    }

    //check if this was the last forced draw
    if (this.forced_draws[this.forced_draws.length - 1][1] < 1) {
      //check for unplayed action cards in the drawing player's hand
      if (this.has_action_card(player)) {
        this.expected_action = "use";
      }
      //check for unplayed action cards in the hand of the player who forced these draws
      else {
        this.queue_unplayed_action_cards();
      }
    }
  }

  queue_unplayed_action_cards() {
    while (this.forced_draws.length > 0) {
      let top_forced_draw = this.forced_draws.pop()!;
      if (this.has_action_card(this.players[top_forced_draw[2]]) && this.active(this.players[top_forced_draw[2]].order)) {
        this.expected_action_player = top_forced_draw[2];
        this.expected_action = "use";
        return;
      }
    }

    this.expected_action_player = this.current_turn;
    this.expected_action = "draw_or_fold";
  }

  fold(): string {
    try {
      const player = this.players[this.expected_action_player];

      player.folded = true;
      this.check_handle_round_over();

      this.current_turn = this.next_in_turn_order();
      this.expected_action_player = this.current_turn;
      return "o";
    }
    catch (e) {
      console.log(e);
      return "e";
    }
  }

  use(target_order: number): string {
    const player = this.players[this.expected_action_player];
    const target = this.players[target_order];
    const self_freeze = target_order == player.order;

    //find the action card that the player drew first (in case multiple from draw three)
    let action_card = "";
    for (let card of player.cards) {
      if (["f", "s", "d"].includes(card)) {
        action_card = card;
        break;
      }
    }
    console.log(player.name, "using", action_card, "on", target.name);


    //remove the action card from the player's hand and add to discard
    const action_card_index = player.cards.indexOf(action_card);
    //not sure why this check would fail, but I guess I'll keep it in here for now
    if (action_card_index > -1) {
      let card = player.cards.splice(action_card_index, 1)[0];
      console.log("removed played", card, "from", player.order);
      this.discard(card);
    }

    //do the action on the target
    switch (action_card) {
      case "f":
        target.frozen = true;
        console.log(target.name, "is frozen");
        //this is the only way that the round could end during use, so check it here
        //more spaghetti to get the correct next player in the turn order bc freeze can change that
        this.check_handle_round_over()
        this.current_turn = this.next_in_turn_order()
        break;
      case "s":
        target.second_chances++;
        console.log(target.name, " now has", target.second_chances, "second changes");
        break;
      case "d":
        this.forced_draws.push([target_order, 3, player.order]);
        this.expected_action_player = target_order;
        this.expected_action = "force_draw"
        console.log(target.name, "needs to draw 3");
        break;
    }

    //if forced draws do not need to happen and there are no more action cards for this player to play
    if (action_card != "d" && (!this.has_action_card(player) || self_freeze)) {
      //this.current_turn = this.next_in_turn_order();
      this.expected_action_player = this.current_turn;
      this.expected_action = "draw_or_fold";
    }


    return target_order.toString();
  }

  //check for and handle the death of a player from a bad draw (forced or non-forced)
  check_handle_dead(player: Player, card: string): boolean {
    if (this.is_action_card(card)) {
      return false;
    }
    //check if this next card would kill the player
    if (player.cards.includes(card)) {
      console.log("killing", player.name);
      //discard that card
      this.discard(card);
      //see if they are spared by a second chance
      if (player.second_chances > 0) {
        player.second_chances--;
      }
      //no second chances, so they die
      else {
        this.deadify(player);
        // @ts-ignore
        this.death_animation(player, card);
        
        //handle all the checks and management for if the round is over
        this.check_handle_round_over();
      }
      return true;
    }
    return false;
  }

  deadify(player: Player) {
    player.lost = true;

    //move their cards to the discard
    while (player.cards.length > 0) {
      this.discard(player.cards.shift()!);
    }
  }

  next_in_turn_order(): number {
    console.log("finding next turn player");
    let next_player: number = this.current_turn;

    //iterate through players till an alive one is found (guaranteed because the round has not ended)
    do {
      next_player = (next_player + 1) % this.players.length;
    } while (!this.active(next_player));

    console.log(next_player, "should go next");
    return next_player;
  }

  active(order: number) {
    let p: Player = this.players[order];
    return !(p.frozen || p.folded || p.lost);
  }

  is_action_card(card: string) {
    return card == "f" || card == "s" || card == "d";
  }

  has_action_card(p: Player) {
    return (p.cards.includes("f") || p.cards.includes("s") || p.cards.includes("d"));
  }

  count_normal_cards(player: Player) {
    let card_count = 0;
    player.cards.forEach(card => {
      if (isFinite(Number(card)) && !card.startsWith("+")) {
        card_count++;
      }
    });

    return card_count;
  }

  discard(card: string) {
    this.discard_top = card;
  }

  check_handle_round_over(): boolean {
    let all_dead: boolean = true;
    let seven_cards: boolean = false;

    console.log("checking round over");
    for (let p of this.players) {
      if (this.active(p.order)) {
        console.log(p.order, "is still kicking");
        all_dead = false;
      }
      if (!seven_cards) {
        seven_cards = this.count_normal_cards(p) > 6
      }
    }

    //round is over, total the scores and reset for the next round
    if (all_dead || seven_cards) {
      console.log("round is over!");
      this.sum_scores();
      this.reset_players();

      this.round_number++;

      if (this.check_handle_game_over()) {
        //trigger for the client's game over animation
        if (this.winner_order !== null) {
          console.log("Game is over", this.players[this.winner_order].name, "won");
          // @ts-ignore
          this.game_over(this.winner_order);
        }
        console.log("after game over");
      }
      else {
        // @ts-ignore
        this.new_round_animation();
      }
      console.log("returning true");
      return true;
    }
    return false;
  }

  check_handle_game_over(): boolean {
    let highest_scoring_player: number = 0;
    for (let i = 1; i < this.players.length; i++) {
      if (this.players[i].score > this.players[highest_scoring_player].score) {
        highest_scoring_player = i;
      }
    }

    if (this.players[highest_scoring_player].score >= 200) {
      this.winner_order = highest_scoring_player;
      return true;
    }
    return false;
  }

  sum_scores() {
    for (let p of this.players) {
      p.score += this.calc_score(p)
      if (this.count_normal_cards(p) > 6) {
        console.log(p.name, "got 7 cards! that's +15");
        //trigger for the client's celebration animation
        // @ts-ignore
        this.seven_cards_animation(p);
        p.score += 15;
      }
    }
  }

  reset_players() {
    for (let p of this.players) {
      //move the cards to the discard
      while (p.cards.length > 0) {
        this.discard(p.cards.shift()!);
      }
      p.second_chances = 0;
      p.lost = false;
      p.frozen = false;
      p.folded = false;
    }
    this.forced_draws = [];
  }

  calc_score(player: Player): number {
    let score = 0;
    let multiplier = 1;
    for (let card of player.cards) {
      if (card === "x2") {
        multiplier = 2;
      }
      if (!isNaN(Number(card))) {
        score += parseInt(card);
      }
    }

    return score * multiplier;
  }

  static build_deck(): string[] {
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

    return deck;
  }
}
