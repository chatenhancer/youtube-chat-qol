import type { GameId } from '../../protocol/messages';

export interface ComputerPlayerProfile {
  availableGames: readonly GameId[];
  connectionId: string;
  displayName: string;
  userId: string;
}

interface ComputerPlayerProfileConfig {
  availableGames?: readonly GameId[];
  displayName: string;
  gameId: GameId;
  slug?: string;
}

interface ChessComputerPlayerDefinition {
  profile: ComputerPlayerProfile;
  stockfishElo: number;
}

function createComputerPlayerProfile(config: ComputerPlayerProfileConfig): ComputerPlayerProfile {
  const id = config.slug
    ? `server:computer:${config.gameId}:${config.slug}`
    : `server:computer:${config.gameId}`;
  return {
    availableGames: config.availableGames ?? [config.gameId],
    connectionId: id,
    displayName: config.displayName,
    userId: id
  };
}

function createChessComputerPlayerDefinition(
  slug: string,
  displayName: string,
  stockfishElo: number
): ChessComputerPlayerDefinition {
  return {
    profile: createComputerPlayerProfile({
      displayName,
      gameId: 'chess',
      slug
    }),
    stockfishElo
  };
}

const CHESS_COMPUTER_PLAYER_DEFINITION_BY_KEY = {
  beginner: createChessComputerPlayerDefinition('beginner', 'Computer (Beginner)', 750),
  club: createChessComputerPlayerDefinition('club', 'Computer (Club)', 1700),
  master: createChessComputerPlayerDefinition('master', 'Computer (Master)', 2500)
} as const;

const CHESS_COMPUTER_PLAYER_DEFINITIONS = [
  CHESS_COMPUTER_PLAYER_DEFINITION_BY_KEY.beginner,
  CHESS_COMPUTER_PLAYER_DEFINITION_BY_KEY.club,
  CHESS_COMPUTER_PLAYER_DEFINITION_BY_KEY.master
] as const satisfies readonly ChessComputerPlayerDefinition[];

export const COMPUTER_PLAYER_PROFILE_BY_KEY = {
  bountyHunting: createComputerPlayerProfile({
    displayName: 'Computer (Bounty Hunter)',
    gameId: 'bounty-hunting'
  }),
  chessBeginner: CHESS_COMPUTER_PLAYER_DEFINITION_BY_KEY.beginner.profile,
  chessClub: CHESS_COMPUTER_PLAYER_DEFINITION_BY_KEY.club.profile,
  chessMaster: CHESS_COMPUTER_PLAYER_DEFINITION_BY_KEY.master.profile,
  replayTrivia: createComputerPlayerProfile({
    displayName: 'Computer',
    gameId: 'replay-trivia'
  }),
  stickAround: createComputerPlayerProfile({
    displayName: 'Computer (Stick Around!)',
    gameId: 'stick-around'
  })
} as const;

export const REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE = COMPUTER_PLAYER_PROFILE_BY_KEY.replayTrivia;
export const CHESS_COMPUTER_PLAYER_BEGINNER_PROFILE = COMPUTER_PLAYER_PROFILE_BY_KEY.chessBeginner;
export const CHESS_COMPUTER_PLAYER_CLUB_PROFILE = COMPUTER_PLAYER_PROFILE_BY_KEY.chessClub;
export const CHESS_COMPUTER_PLAYER_MASTER_PROFILE = COMPUTER_PLAYER_PROFILE_BY_KEY.chessMaster;
export const BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE = COMPUTER_PLAYER_PROFILE_BY_KEY.bountyHunting;
export const STICK_AROUND_COMPUTER_PLAYER_PROFILE = COMPUTER_PLAYER_PROFILE_BY_KEY.stickAround;

export const DEFAULT_COMPUTER_PLAYER_PROFILE = REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE;
export const CHESS_COMPUTER_PLAYER_PROFILES = [
  CHESS_COMPUTER_PLAYER_BEGINNER_PROFILE,
  CHESS_COMPUTER_PLAYER_CLUB_PROFILE,
  CHESS_COMPUTER_PLAYER_MASTER_PROFILE
] as const satisfies readonly ComputerPlayerProfile[];
export const COMPUTER_PLAYER_PROFILES = [
  REPLAY_TRIVIA_COMPUTER_PLAYER_PROFILE,
  ...CHESS_COMPUTER_PLAYER_PROFILES,
  BOUNTY_HUNTING_COMPUTER_PLAYER_PROFILE,
  STICK_AROUND_COMPUTER_PLAYER_PROFILE
] as const satisfies readonly ComputerPlayerProfile[];

export function isComputerPlayerUserId(userId: string): boolean {
  return COMPUTER_PLAYER_PROFILES.some((profile) => profile.userId === userId);
}

export function getChessComputerPlayerStockfishElo(userId: string): number | undefined {
  return CHESS_COMPUTER_PLAYER_DEFINITIONS.find((definition) =>
    definition.profile.userId === userId
  )?.stockfishElo;
}
