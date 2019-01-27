/*
 * Papayadyne Industries P-800 Infiltration Unit
 * Created for the r/MadeInAbyss Discord's King of the Hill competition.
 * Prioritizes coins it's likely to get to first, dodging hazards and pouncing
 * on inferior bots in the process.
 *
 * Current improvements to be made:
 * * The bot could be smarter on how it chooses between adjacent coins,
 *   prioritizing those with foes closer to grabbing it. This serves the dual
 *   purpose of both having a higher chance of collecting both coins before a
 *   foe, as well as slaying and harvesting weaker foes aiming for the same.
 */

// Object wrappers for the major entity types
// Ensures syntactic consistency for more
// general-use functions. Sorry for eating up
// your RAM, Shad.

// Any given coordinate can be a tile.
let arena;

class Tile {
  constructor(x, y) {
    this.x = x;
    this.y = y;

    // Finds taxicab distance to other entity
    this.distanceTo = entity => Math.abs(this.x - entity.x) + Math.abs(this.y - entity.y);
    // Finds cartesian distance to other entity via pythagorean theorem
    this.cartesianDistanceTo = entity => Math.sqrt((Math.abs(this.x - entity.x) ** 2) + (Math.abs(this.y - entity.y) ** 2));
    // Ranks an array of entities and finds the closest ones
    this.nearest = entityArr => [...entityArr].sort((a, b) => this.distanceTo(a) - this.distanceTo(b));
    // Checks if tile is in the arena
    this.isInBounds = arenaLength => (0 <= this.x && this.x <= arenaLength && 0 <= this.y && this.y <= arenaLength);
    // Returns an array of all the tiles within a step of this one.
    this.adjacent = () => {
      let out = [];
      
      out.push(
        new Tile(this.x, this.y),     // self
        new Tile(this.x, this.y - 1), // north
        new Tile(this.x, this.y + 1), // south
        new Tile(this.x + 1, this.y), // east
        new Tile(this.x - 1, this.y)  // west
      );
      return out;
    };
    // Checks if other tile refers to the same coordinates.
    this.matches = tile => (this.x === tile.x && this.y === tile.y);
    // Checks if other tile is within a step of this one.
    this.isAdjacentTo = tile => (this.distanceTo(tile) === 1);
  }
}

// Entities include bots and coins. Only coins construct this class directly.
class Entity extends Tile {
  constructor(strength, x, y) {
    super(x, y);
    // Strength here is defined by its value in coins.
    this.strength = strength;
  }
}

// Bots include all players. Only mine constructs from this class directly.
class Bot extends Entity {
  constructor(strength, x, y) {
    super(strength, x, y);
    // Adjacent tile list excluding out-of-bounds coordinates.
    this.canMoveTo = tile => {
      return out.filter(this.adjacent() => tile.isInBounds(arena));
    };
  }
}

// Foes are all the bots that aren't mine. Eat or be eaten.
class Foe extends Bot {
  constructor(strength, x, y) {
    super(strength, x, y);
    // Checks if another bot (probably mine) can kill this one without dying.
    this.isKillableBy = entity => {
      return this.strength < entity.strength;
    }
  }
}


// This is the main function ran every game cycle to control my bot. It includes
// pathfinding and decision-making.
function step (selfData, othersData, coinData) {
  arena = selfData.arenaLength;
  
  let moves = ['none', 'north', 'south', 'east', 'west'];
  
  let me = new Bot(selfData.coins, selfData.locationX, selfData.locationY);
  
  let enemies = [];
  for (let index of othersData) {
    enemies.push(new Foe(...index))
  }
  
  let bots = [me, ...enemies];
  let coins = [];
  let isGold = true;
  for (let index of coinData) {
    coins.push(new Entity(isGold ? 5 : 2, ...index));
    isGold = false;
  }
  
  /* variables: 
   * - bots -- array of all bot entities
   * - enemies -- array of all bot entities excluding me
   * - coins -- array of all coins
   */
  
  // Orders coin array by how close I am compared to the competition.
  // The gold coin wins any ties in the sorting. If neither is gold, then the
  // one closest to me does.
  coins.sort((a, b) => {
    let ai;
    let bi;
    let an = a.nearest(bots);
    let bn = b.nearest(bots);
    for (let i = 0; i < an.length; i++) {
      if (an[i].matches(me)) {
        ai = i;
        i = an.length;
      }
    }
    for (let i = 0; i < bn.length; i++) {
      if (bn[i].matches(me)) {
        ai = i;
        i = bn.length;
      }
    }
    
    let out = ai - bi;
    
    if (out = 0) out = b.strength - a.strength;
    if (out = 0) out = a.distanceTo(me) - b.distanceTo(me);
  });
  
  // moveOptions is an array of all the tiles I can move to.
  // bestMoves is the moves array, but synced with the moveOptions indices.
  let moveOptions = me.adjacent();
  let bestMoves = [...moves];
  
  // Remove out-of-bounds tiles from consideration.
  for (let i = 0; i < moveOptions.length; i++) {
    if (!moveOptions[i].isInBounds(arena)) {
      bestMoves[i] = false;
      moveOptions[i] = false;
    }
  }
  moveOptions = moveOptions.filter(tile => tile);
  bestMoves = bestMoves.filter(move => move);
  
  // Gets list of deadly and killable (respectively) enemies that can be
  // collided with this step. Prey are sorted big-endian by value.
  let predators = enemies.filter(foe => ((!foe.isKillableBy(me)) && foe.distanceTo(me) < 3));
  let prey = enemies.filter(foe => (foe.isKillableBy(me) && foe.distanceTo(me) < 3));
  prey.sort((a, b) => return b.value - a.value);
  
  // Avoid tiles that allow collision with predators this step.
  let safeMoveOptions = [];
  let safeBestMoves = [];
  for (let i = 0; i < moveOptions.length; i++) {
    let safe = true;
    for (let foe of predators) {
      safe = (tile.isAdjacentTo(foe) || tile.matches(foe)) ? false : safe;
    }
    safeMoveOptions.push((safe) ? moveOptions[i] : false);
    safeBestMoves.push((safe) ? bestMoves[i] : false);
  }
  
  safeMoveOptions = moveOptions.filter(tile => tile);
  safeBestMoves = bestMoves.filter(move => move);
  
  // If every tile around me allows predator collision, prioritize the
  // tiles with predators themselves -- I figure they'll try to pounce on me,
  // which means we'll harmlessly phase through each other if I do the same.
  // This is essentially reverse chicken -- if they don't move, I lose.
  if (safeMoveOptions.length === 0) {
    for (let i = 0; i < moveOptions.length; i++) {
      let safe = true;
      for (let foe of predators) {
        safe = (tile.isAdjacentTo(foe)) ? false : safe;
      }
      safeMoveOptions.push((safe) ? moveOptions[i] : false);
      safeBestMoves.push((safe) ? bestMoves[i] : false);
    }
  }
  
  safeMoveOptions = moveOptions.filter(tile => tile);
  safeBestMoves = bestMoves.filter(move => move);
  
  // Check if any of the safe spaces have the target coin. If so, go for it.
  for (let i = 0; i < safeMoveOptions.length; i++) {
    if (safeMoveOptions[i].matches(coins[0])) return safeBestMoves[i];
  }
  
  // Check if any of the safe spaces are adjacent to prey. If so, pounce. The
  // way the prey are sorted means I'll automatically go for the most valuable,
  // and the way the moves are sorted means I'll prefer an ambush over a pounce
  // in case of two equally-valuable prey.
  for (let foe of prey) {
    for (let i = 0; i < safeMoveOptions.length; i++) {
      if (safeMoveOptions[i].isAdjacentTo(foe)) return safeBestMoves[i];
    }
  }
  
  // If there's nothing of value in the safe spaces, find out which is closest
  // to the current target coin. If two would be equally far, go with the one
  // closest in a cartesian system for more natural-looking movement.
  let lowestDistance = Infinity;
  let lowestCartesianDistance = Infinity;
  let idealIndex = -1;
  for (let i = 0; i < safeMoveOptions.length; i++) {
    if (safeMoveOptions[i].distanceTo(coins[0]) < lowestDistance) {
      lowestDistance = safeMoveOptions[i].distanceTo(coins[0]);
      lowestCartesianDistance = safeMoveOptions[i].cartesianDistanceTo(coins[0]);
      idealIndex = i;
    } else if (safeMoveOptions[i].distanceTo(coins[0]) === lowestDistance) {
      if (safeMoveOptions[i].cartesianDistanceTo(coins[0]) < lowestCartesianDistance) {
        lowestCartesianDistance = safeMoveOptions[i].cartesianDistanceTo(coins[0]);
        idealIndex = i;
      }
    }
  }
  
  // And finally, head for the target coin.
  return safeBestMoves[i];
}