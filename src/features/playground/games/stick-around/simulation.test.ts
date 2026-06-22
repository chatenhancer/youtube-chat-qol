import { describe, expect, it } from 'vitest';
import type { PublicStickAroundGame } from './types';
import {
  createStickAroundSimulation,
  getStickAroundComputerControls,
  getStickAroundFighterAnimation,
  getStickAroundWinnerUserId,
  STICK_AROUND_FIGHTER_HEIGHT,
  STICK_AROUND_STARTING_STOCKS,
  stepStickAroundSimulation
} from './simulation';

describe('Stick Around simulation', () => {
  it('places grounded fighters at the bottom of the arena', () => {
    const game = createGame();
    const simulation = createStickAroundSimulation(game, 320, 260, 1_000);

    expect(simulation.fighters['host-user'].y + STICK_AROUND_FIGHTER_HEIGHT).toBe(260);
    expect(simulation.fighters['guest-user'].y + STICK_AROUND_FIGHTER_HEIGHT).toBe(260);
  });

  it('keeps airborne fighters in the jumping animation state', () => {
    const game = createGame();
    const simulation = createStickAroundSimulation(game, 320, 260, 1_000);

    stepStickAroundSimulation(simulation, game, {
      'host-user': {
        jump: true,
        left: false,
        right: false
      }
    }, new Map(), 1_016);

    const fighter = simulation.fighters['host-user'];
    expect(fighter.grounded).toBe(false);
    expect(getStickAroundFighterAnimation(fighter, 1_016)).toBe('jumping');
  });

  it('keeps jumping when jump remains pressed through landing', () => {
    const game = createGame();
    const simulation = createStickAroundSimulation(game, 320, 260, 1_000);
    const controls = {
      jump: true,
      left: false,
      right: false
    };
    const fighter = simulation.fighters['host-user'];
    let landedWhilePressed = false;
    let jumpedAgainAfterLanding = false;

    for (let now = 1_050; now <= 3_000; now += 50) {
      const wasGrounded = fighter.grounded;
      stepStickAroundSimulation(simulation, game, {
        'host-user': controls
      }, new Map(), now);
      if (!wasGrounded && fighter.grounded) landedWhilePressed = true;
      if (landedWhilePressed && !fighter.grounded && fighter.vy < 0) {
        jumpedAgainAfterLanding = true;
        break;
      }
    }

    expect(landedWhilePressed).toBe(true);
    expect(jumpedAgainAfterLanding).toBe(true);
  });

  it('caps delayed frame movement to avoid visible teleports', () => {
    const game = createGame();
    const simulation = createStickAroundSimulation(game, 320, 260, 1_000);
    const fighter = simulation.fighters['host-user'];
    const startX = fighter.x;

    stepStickAroundSimulation(simulation, game, {
      'host-user': {
        jump: false,
        left: false,
        right: true
      }
    }, new Map(), 1_200);

    expect(simulation.frame).toBe(1);
    expect(fighter.x).toBeGreaterThan(startX);
    expect(fighter.x).toBeLessThan(startX + 3);
  });

  it('ignores stale remote inputs', () => {
    const game = createGame();
    const simulation = createStickAroundSimulation(game, 320, 260, 1_000);
    const fighter = simulation.fighters['guest-user'];
    const startX = fighter.x;

    stepStickAroundSimulation(simulation, game, {
      'guest-user': {
        frame: 1,
        jump: false,
        left: false,
        right: true,
        sentAt: 1_000,
        seq: 1,
        userId: 'guest-user'
      }
    }, new Map(), 2_000);

    expect(fighter.vx).toBe(0);
    expect(fighter.x).toBe(startX);
  });

  it('maps hazard message IDs to local chat text without server text', () => {
    const game = createGame({
      hazards: [{
        id: 'hazard-1',
        messageId: 'message-1',
        seed: 123,
        spawnAt: 1_000,
        weight: 2
      }]
    });
    const simulation = createStickAroundSimulation(game, 320, 260, 1_000);

    stepStickAroundSimulation(simulation, game, {}, new Map([
      ['message-1', 'hello from chat']
    ]), 1_000);

    expect(simulation.bubbles).toHaveLength(1);
    expect(simulation.bubbles[0].text).toBe('hello from chat');
  });

  it('falls chat bubbles with lateral physics and spin', () => {
    const game = createGame({
      hazards: [{
        id: 'hazard-1',
        messageId: 'message-1',
        seed: 123,
        spawnAt: 1_000,
        weight: 2
      }]
    });
    const simulation = createStickAroundSimulation(game, 320, 260, 1_000);

    stepStickAroundSimulation(simulation, game, {}, new Map([
      ['message-1', 'spinning chat']
    ]), 1_000);
    const bubble = simulation.bubbles[0];
    const startAngle = bubble.angle;
    const startX = bubble.x;
    const startY = bubble.y;
    const startVy = bubble.vy;

    stepStickAroundSimulation(simulation, game, {}, new Map(), 1_050);

    expect(bubble.y).toBeGreaterThan(startY);
    expect(bubble.vy).toBeGreaterThan(startVy);
    expect(bubble.x).not.toBe(startX);
    expect(bubble.angle).not.toBe(startAngle);
  });

  it('adds impact particles and shake when a bubble hits a fighter', () => {
    const game = createGame();
    const simulation = createStickAroundSimulation(game, 320, 260, 1_000);
    const fighter = simulation.fighters['host-user'];
    fighter.invulnerableUntil = 0;
    simulation.bubbles.push({
      angle: 0,
      height: 30,
      hitUserIds: new Set<string>(),
      id: 'bubble-1',
      seed: 123,
      spin: 0,
      text: 'hit',
      vx: 0,
      vy: 0,
      width: 70,
      x: fighter.x,
      y: fighter.y
    });

    stepStickAroundSimulation(simulation, game, {}, new Map(), 1_016);

    expect(fighter.damage).toBeGreaterThan(0);
    expect(simulation.flash).toBeGreaterThan(0);
    expect(simulation.particles.length).toBeGreaterThan(0);
    expect(simulation.shake).toBeGreaterThan(0);
  });

  it('lets invulnerable fighters get hit by overlapping bubbles after invulnerability ends', () => {
    const game = createGame();
    const simulation = createStickAroundSimulation(game, 320, 260, 1_000);
    const fighter = simulation.fighters['host-user'];
    fighter.invulnerableUntil = 1_040;
    simulation.bubbles.push({
      angle: 0,
      height: 30,
      hitUserIds: new Set<string>(),
      id: 'bubble-1',
      seed: 123,
      spin: 0,
      text: 'hit',
      vx: 0,
      vy: 0,
      width: 70,
      x: fighter.x,
      y: fighter.y
    });

    stepStickAroundSimulation(simulation, game, {}, new Map(), 1_016);

    expect(fighter.damage).toBe(0);
    expect(simulation.bubbles[0].hitUserIds.has(fighter.userId)).toBe(false);

    stepStickAroundSimulation(simulation, game, {}, new Map(), 1_048);

    expect(fighter.damage).toBeGreaterThan(0);
  });

  it('pushes side-hit defenders outward more than upward', () => {
    const game = createGame();
    const simulation = createStickAroundSimulation(game, 320, 260, 1_984);
    const attacker = simulation.fighters['host-user'];
    const defender = simulation.fighters['guest-user'];
    attacker.invulnerableUntil = 0;
    defender.invulnerableUntil = 0;
    attacker.x = 130;
    attacker.y = 206;
    attacker.vx = 190;
    defender.x = 155;
    defender.y = 206;
    defender.vx = 0;
    defender.vy = 0;

    stepStickAroundSimulation(simulation, game, {
      'host-user': {
        jump: false,
        left: false,
        right: true
      }
    }, new Map(), 2_000);

    expect(defender.damage).toBeGreaterThan(10);
    expect(defender.damage).toBeLessThan(11);
    expect(defender.vx).toBeGreaterThan(240);
    expect(Math.abs(defender.vx)).toBeGreaterThan(Math.abs(defender.vy) * 1.7);
    expect(defender.vy).toBeLessThan(0);
    expect(attacker.vx).toBeLessThan(150);
    expect(attacker.x + 30).toBeLessThanOrEqual(defender.x);
  });

  it('does not spam contact hits while fighters remain overlapped', () => {
    const game = createGame();
    const simulation = createStickAroundSimulation(game, 320, 260, 1_000);
    const attacker = simulation.fighters['host-user'];
    const defender = simulation.fighters['guest-user'];
    attacker.invulnerableUntil = 0;
    defender.invulnerableUntil = 0;
    attacker.x = 130;
    attacker.y = 206;
    attacker.vx = 225;
    defender.x = 155;
    defender.y = 206;

    stepStickAroundSimulation(simulation, game, {
      'host-user': {
        jump: false,
        left: false,
        right: true
      }
    }, new Map(), 2_000);
    const damageAfterHit = defender.damage;

    for (let now = 2_016; now < attacker.collisionUntil; now += 16) {
      attacker.x = 130;
      attacker.y = 206;
      attacker.vx = 225;
      defender.x = 155;
      defender.y = 206;
      stepStickAroundSimulation(simulation, game, {}, new Map(), now);
    }

    expect(defender.damage).toBe(damageAfterHit);
  });

  it('caps impact particles so repeated effects cannot build an unbounded backlog', () => {
    const game = createGame();
    const simulation = createStickAroundSimulation(game, 320, 260, 1_000);
    const fighter = simulation.fighters['host-user'];
    fighter.invulnerableUntil = 0;

    for (let index = 0; index < 40; index += 1) {
      simulation.bubbles.push({
        angle: 0,
        height: 30,
        hitUserIds: new Set<string>(),
        id: `bubble-${index}`,
        seed: index,
        spin: 0,
        text: 'hit',
        vx: 0,
        vy: 0,
        width: 70,
        x: fighter.x,
        y: fighter.y
      });
      stepStickAroundSimulation(simulation, game, {}, new Map(), 2_000 + index * 16);
      fighter.invulnerableUntil = 0;
    }

    expect(simulation.particles.length).toBeLessThanOrEqual(180);
  });

  it('lets fighters land on round-seeded platforms', () => {
    const game = createGame({
      roundSeed: 9_876
    });
    const simulation = createStickAroundSimulation(game, 360, 340, 1_000);
    const platform = simulation.platforms[0];
    const fighter = simulation.fighters['host-user'];
    fighter.grounded = false;
    fighter.invulnerableUntil = 0;
    fighter.vx = 0;
    fighter.vy = 120;
    fighter.x = platform.x + platform.width / 2 - 15;
    fighter.y = platform.y - STICK_AROUND_FIGHTER_HEIGHT - 2;

    stepStickAroundSimulation(simulation, game, {}, new Map(), 1_050);

    expect(fighter.grounded).toBe(true);
    expect(fighter.y + STICK_AROUND_FIGHTER_HEIGHT).toBe(platform.y);
  });

  it('shows attack animation before jump animation while airborne', () => {
    const game = createGame();
    const simulation = createStickAroundSimulation(game, 320, 260, 1_000);
    const fighter = simulation.fighters['host-user'];
    fighter.attackUntil = 1_200;
    fighter.grounded = false;

    expect(getStickAroundFighterAnimation(fighter, 1_100)).toBe('attacking');
  });

  it('drives the computer toward the opponent on open ground', () => {
    const game = createGame({
      players: {
        guest: {
          displayName: 'Computer',
          userId: 'server:computer:stick-around'
        },
        host: {
          displayName: 'Host',
          userId: 'host-user'
        }
      }
    });
    const simulation = createStickAroundSimulation(game, 360, 300, 1_000);

    const controls = getStickAroundComputerControls(simulation, 'server:computer:stick-around', 1_000);

    expect(controls.left).toBe(true);
    expect(controls.right).toBe(false);
  });

  it('steers the computer back inward near an arena edge', () => {
    const game = createGame({
      players: {
        guest: {
          displayName: 'Computer',
          userId: 'server:computer:stick-around'
        },
        host: {
          displayName: 'Host',
          userId: 'host-user'
        }
      }
    });
    const simulation = createStickAroundSimulation(game, 360, 300, 1_000);
    const computer = simulation.fighters['server:computer:stick-around'];
    const host = simulation.fighters['host-user'];
    computer.x = 8;
    host.x = -20;

    const controls = getStickAroundComputerControls(simulation, 'server:computer:stick-around', 1_000);

    expect(controls.left).toBe(false);
    expect(controls.right).toBe(true);
  });

  it('uses sparse deterministic computer jump pulses on flat ground', () => {
    const game = createGame({
      players: {
        guest: {
          displayName: 'Computer',
          userId: 'server:computer:stick-around'
        },
        host: {
          displayName: 'Host',
          userId: 'host-user'
        }
      },
      roundSeed: 0
    });
    const simulation = createStickAroundSimulation(game, 360, 300, 1_000);
    const computer = simulation.fighters['server:computer:stick-around'];
    const host = simulation.fighters['host-user'];
    computer.x = 170;
    host.x = 190;
    const jumpSamples: boolean[] = [];

    for (let now = 0; now <= 12_000; now += 120) {
      jumpSamples.push(getStickAroundComputerControls(simulation, 'server:computer:stick-around', now).jump);
    }

    const jumpCount = jumpSamples.filter(Boolean).length;
    expect(jumpCount).toBeGreaterThan(0);
    expect(jumpCount).toBeLessThan(jumpSamples.length / 4);
  });

  it('runs to a platform edge when the opponent is below it', () => {
    const game = createGame({
      players: {
        guest: {
          displayName: 'Computer',
          userId: 'server:computer:stick-around'
        },
        host: {
          displayName: 'Host',
          userId: 'host-user'
        }
      },
      roundSeed: 9_876
    });
    const simulation = createStickAroundSimulation(game, 360, 340, 1_000);
    const platform = simulation.platforms.find((candidate) => candidate.kind === 'center') || simulation.platforms[0];
    const computer = simulation.fighters['server:computer:stick-around'];
    const host = simulation.fighters['host-user'];
    computer.grounded = true;
    computer.x = platform.x + 12;
    computer.y = platform.y - STICK_AROUND_FIGHTER_HEIGHT;
    host.x = computer.x + 8;
    host.y = 340 - STICK_AROUND_FIGHTER_HEIGHT;

    const controls = getStickAroundComputerControls(simulation, 'server:computer:stick-around', 0);

    expect(controls.left).toBe(true);
    expect(controls.right).toBe(false);
    expect(controls.jump).toBe(false);
  });

  it('sizes chat bubbles from their local message text', () => {
    const game = createGame({
      hazards: [
        {
          id: 'short-hazard',
          messageId: 'short-message',
          seed: 123,
          spawnAt: 1_000,
          weight: 1
        },
        {
          id: 'long-hazard',
          messageId: 'long-message',
          seed: 456,
          spawnAt: 1_000,
          weight: 1
        }
      ]
    });
    const simulation = createStickAroundSimulation(game, 320, 260, 1_000);

    stepStickAroundSimulation(simulation, game, {}, new Map([
      ['short-message', 'ok'],
      ['long-message', 'this is a much longer chat bubble that should wrap onto more than one line']
    ]), 1_000);

    const shortBubble = simulation.bubbles.find((bubble) => bubble.id === 'short-hazard');
    const longBubble = simulation.bubbles.find((bubble) => bubble.id === 'long-hazard');
    expect(shortBubble).toBeDefined();
    expect(longBubble).toBeDefined();
    expect(longBubble!.width).toBeGreaterThan(shortBubble!.width);
    expect(longBubble!.height).toBeGreaterThan(shortBubble!.height);
  });

  it('declares the surviving player after a stock loss', () => {
    const game = createGame();
    const simulation = createStickAroundSimulation(game, 320, 260, 1_000);
    simulation.fighters['host-user'].stocks = 1;
    simulation.fighters['host-user'].grounded = false;
    simulation.fighters['host-user'].x = -80;
    simulation.fighters['host-user'].y = 999;

    stepStickAroundSimulation(simulation, game, {}, new Map(), 1_016);

    expect(simulation.fighters['host-user'].stocks).toBe(0);
    expect(getStickAroundWinnerUserId(simulation)).toBe('guest-user');
  });

  it('loses a stock when a fighter falls past the side of the arena', () => {
    const game = createGame();
    const simulation = createStickAroundSimulation(game, 320, 260, 1_000);
    const fighter = simulation.fighters['host-user'];
    fighter.x = -110;
    fighter.y = 180;

    stepStickAroundSimulation(simulation, game, {}, new Map(), 1_016);

    expect(fighter.stocks).toBe(STICK_AROUND_STARTING_STOCKS - 1);
    expect(fighter.x).toBeCloseTo(320 * 0.28 - 15);
    expect(fighter.y).toBe(36);
    expect(fighter.grounded).toBe(false);
  });
});

function createGame(overrides: Partial<PublicStickAroundGame> = {}): PublicStickAroundGame {
  return {
    finishReports: {},
    gameId: 'game-1',
    gameType: 'stick-around',
    hazards: [],
    inputs: {},
    phaseStartedAt: 1_000,
    players: {
      guest: {
        displayName: 'Guest',
        userId: 'guest-user'
      },
      host: {
        displayName: 'Host',
        userId: 'host-user'
      }
    },
    readyPlayers: {},
    roundSeed: 123,
    roundStartedAt: 1_000,
    status: 'active',
    ...overrides
  };
}
