//Game
//
//deck
// - array of cards
//deck_position
//discard
//current_player
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




// game.ts
export class Player {
  uuid: string;
  name: string;
  cards: string[] = [];
  frozen = false;
  folded = false;
  lost = false;
  second_chances = 0;
  score = 0;

  constructor(uuid: string, name: string) {
    this.uuid = uuid;
    this.name = name;
  }
}

export class Game {
  private players: Map<string, Player> = new Map();
  private deck: string[] = [];
  private discard: string[] = [];
  private current_player: Player;
  private forced_draws: [Player, number];

  public constructor(players: [string, string][]) {
    for (const player: [string, string] of players) {
      this.players.set(player[0], new Player(player[0], player[1]));
    }

    this.build_deck();
    this.shuffle();
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

    console.log(deck);
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
    console.log(this.deck);
  }
}

