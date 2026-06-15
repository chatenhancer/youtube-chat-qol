import { describe, expect, it } from 'vitest';
import {
  describeChromeWebStoreStatus,
  getSubmittedRevisionVersion,
  isChromeWebStoreSubmissionBlocked
} from './chrome-webstore.mjs';

describe('Chrome Web Store status helpers', () => {
  it('reads the submitted revision version from distribution channels', () => {
    const status = {
      submittedItemRevisionStatus: {
        state: 'PENDING_REVIEW',
        distributionChannels: [
          {
            crxVersion: '1.2.5',
            deployPercentage: 100
          }
        ]
      }
    };

    expect(getSubmittedRevisionVersion(status)).toBe('1.2.5');
    expect(describeChromeWebStoreStatus(status)).toBe('PENDING_REVIEW (1.2.5)');
  });

  it('treats pending and staged submitted revisions as blocked', () => {
    expect(isChromeWebStoreSubmissionBlocked({
      submittedItemRevisionStatus: {
        state: 'PENDING_REVIEW'
      }
    })).toBe(true);
    expect(isChromeWebStoreSubmissionBlocked({
      submittedItemRevisionStatus: {
        state: 'STAGED'
      }
    })).toBe(true);
    expect(isChromeWebStoreSubmissionBlocked({
      submittedItemRevisionStatus: {
        state: 'PUBLISHED'
      }
    })).toBe(false);
  });
});
