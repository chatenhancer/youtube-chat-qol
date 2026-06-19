import { describe, expect, it } from 'vitest';
import { getPlaygroundAvatarInitial, getPlaygroundAvatarPresentation } from './playground-identity';

describe('playground identity helpers', () => {
  it('uses the generated player code for anonymous avatar initials', () => {
    expect(getPlaygroundAvatarInitial('Player TEST', 'test-user')).toBe('T');
    expect(getPlaygroundAvatarInitial('Player 1234', 'z9-user')).toBe('Z');
  });

  it('keeps normal display name initials unchanged', () => {
    expect(getPlaygroundAvatarInitial('Luna Chat', 'luna-user')).toBe('L');
    expect(getPlaygroundAvatarInitial('@Marco', 'marco-user')).toBe('M');
  });

  it('returns a shared avatar presentation for Playground UI surfaces', () => {
    expect(getPlaygroundAvatarPresentation({
      displayName: 'Player TEST',
      userId: 'test-user'
    })).toEqual({
      backgroundColor: 'hsl(255 45% 37%)',
      foregroundColor: '#fff',
      initial: 'T'
    });
  });

  it('uses built-in Computer profile labels for avatar initials and colors', () => {
    const avatars = [
      getPlaygroundAvatarPresentation({
        displayName: 'Computer (Beginner)',
        userId: 'server:computer:beginner'
      }),
      getPlaygroundAvatarPresentation({
        displayName: 'Computer (Club)',
        userId: 'server:computer:club'
      }),
      getPlaygroundAvatarPresentation({
        displayName: 'Computer (Master)',
        userId: 'server:computer:master'
      })
    ];

    expect(avatars.map((avatar) => avatar.initial)).toEqual(['B', 'C', 'M']);
    expect(avatars.map((avatar) => avatar.backgroundColor)).toEqual([
      'hsl(205 62% 34%)',
      'hsl(45 70% 30%)',
      'hsl(286 46% 36%)'
    ]);
    expect(new Set(avatars.map((avatar) => avatar.backgroundColor)).size).toBe(3);
  });
});
