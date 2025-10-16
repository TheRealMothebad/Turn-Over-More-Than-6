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

export class Player {
  uuid: string;
  name: string;
  cards: string[] = [];
  frozen = false;
  folded = false;
  lost = false;
  second_chances = 0;
  score = 0;
  connected = false;

  constructor(uuid: string, name: string) {
    this.uuid = uuid;
    this.name = name;
  }
}

export class Game {
  private players: Player[] = [];
  private players_by_uuid: Map<string, Player> = new Map();
  private deck: string[] = [];
  private top_card: number = 0;
  //when a player loses, all their cards go in the discard
  private discard: string[] = [];
  //index in the players array
  private current_player: number;
  private forced_draws: [string, number];

  public constructor(players: [string, string][]) {
    for (const player: [string, string] of players) {
      let p = new Player(player[0], player[1])
      this.players.push();
      this.players_by_uuid.set(player[0], p);
    }

    this.build_deck();
    this.shuffle();

    this.current_player = players[0];
    console.log(this.players);
    console.log(this.deck);
  }

  player_draw(player_uuid: string): string?? {
    
  }

  player_fold(player_uuid: string): {

  }

  player_use(player_uuid: string, target: number): {
    
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

  shuffle() {
    for (let i: number = this.deck.length - 1; i > 0; i--) {

      // Generate Random Index
      const j = Math.floor(Math.random() * (i + 1));

      // Swap elements
      [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
    }
  }


  serialize() {
    console.log(Game);
  }
}

