// game.ts
export type PlayerID = string;

export interface Player {
  id: PlayerID;
  name: string;
  hand: string[];
}

export class Game {
  private players: Map<PlayerID, Player> = new Map();

  addPlayer(id: PlayerID, name: string) {
    if (!this.players.has(id)) {
      this.players.set(id, { id, name, hand: [] });
    }
  }

  removePlayer(id: PlayerID) {
    this.players.delete(id);
  }

  dealCard(id: PlayerID, card: string) {
    const player = this.players.get(id);
    if (player) {
      player.hand.push(card);
    }
  }

  getState() {
    // expose minimal public state
    return Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      handCount: p.hand.length,
    }));
  }
}

