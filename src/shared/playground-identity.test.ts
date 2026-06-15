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
      backgroundColor: 'hsl(11 62% 28%)',
      foregroundColor: '#fff',
      initial: 'T'
    });
  });
});
