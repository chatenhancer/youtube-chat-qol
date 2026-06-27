import { describe, expect, it } from 'vitest';
import {
  maskGithubActionsValue,
  maskGithubActionsValues
} from './github-actions-log.mjs';

describe('GitHub Actions log helpers', () => {
  it('does not emit masks outside GitHub Actions', () => {
    const lines = [];

    maskGithubActionsValue('secret-value', {
      env: {},
      output: (line) => lines.push(line)
    });

    expect(lines).toEqual([]);
  });

  it('escapes workflow command data when adding a mask', () => {
    const lines = [];

    maskGithubActionsValue('key%with\r\nlines', {
      env: { GITHUB_ACTIONS: 'true' },
      output: (line) => lines.push(line)
    });

    expect(lines).toEqual(['::add-mask::key%25with%0D%0Alines']);
  });

  it('skips empty values and duplicate masks', () => {
    const lines = [];

    maskGithubActionsValues(['alpha', '', 'alpha', '  '], {
      env: { GITHUB_ACTIONS: 'true' },
      output: (line) => lines.push(line)
    });

    expect(lines).toEqual(['::add-mask::alpha']);
  });
});
