import type {
  PublicStickAroundGame,
  StickAroundHazardEvent,
  StickAroundInputSnapshot,
  StickAroundPlayerRole
} from '../../../../shared/playground/stick-around';

export type {
  PublicStickAroundGame,
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
  fontsReady: boolean;
  logo: HTMLImageElement | null;
  spritesheet: HTMLImageElement | null;
}

export interface StickAroundControls {
  jump: boolean;
  left: boolean;
  right: boolean;
}
