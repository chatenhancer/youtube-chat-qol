import type {
  PublicStickAroundGame,
  StickAroundControls,
  StickAroundHazardEvent,
  StickAroundInputSnapshot,
  StickAroundPlayerRole
} from '../../../../shared/playground/stick-around';

export type {
  PublicStickAroundGame,
  StickAroundControls,
  StickAroundHazardEvent,
  StickAroundInputSnapshot,
  StickAroundPlayerRole
};

export interface StickAroundFrameRect {
  h: number;
  w: number;
  x: number;
  y: number;
}

export interface StickAroundAnimationFrame {
  duration: number;
  frame: StickAroundFrameRect;
  name: string;
}

export interface StickAroundAssets {
  animations: Record<string, StickAroundAnimationFrame[]>;
  darkLogo: HTMLImageElement | null;
  darkSpritesheet: HTMLImageElement | null;
  fontsReady: boolean;
  logo: HTMLImageElement | null;
  spritesheet: HTMLImageElement | null;
}
