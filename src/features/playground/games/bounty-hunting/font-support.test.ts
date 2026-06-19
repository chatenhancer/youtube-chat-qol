import { describe, expect, it } from 'vitest';
import deCatalog from '../../../../shared/locales/de.json';
import esCatalog from '../../../../shared/locales/es.json';
import frCatalog from '../../../../shared/locales/fr.json';
import idCatalog from '../../../../shared/locales/id.json';
import itCatalog from '../../../../shared/locales/it.json';
import nlCatalog from '../../../../shared/locales/nl.json';
import plCatalog from '../../../../shared/locales/pl.json';
import ptCatalog from '../../../../shared/locales/pt.json';
import trCatalog from '../../../../shared/locales/tr.json';
import viCatalog from '../../../../shared/locales/vi.json';

import {
  canRenderBountyHuntingBarnumText,
  canRenderBountyHuntingBartleText,
  canRenderBountyHuntingTexMexText,
  formatBountyHuntingTexMexTitleText
} from './font-support';

const CUSTOM_FONT_MESSAGE_KEYS = [
  'gamesBountyHuntingLoadingStatus',
  'gamesBountyHuntingWanted',
  'gamesBountyHuntingReady',
  'gamesBountyHuntingStarting',
  'gamesBountyHuntingRoundOver',
  'gamesBountyHuntingLedger',
  'gamesBountyHuntingBountiesClaimed',
  'gamesBountyHuntingMoneyEarned',
  'gamesBountyHuntingWinner',
  'gamesBountyHuntingClose',
  'gamesBountyHuntingOpen',
  'gamesBountyHuntingClaimed',
  'gamesBountyHuntingTimeRemaining',
  'gamesBountyHuntingYou',
  'gamesBountyHuntingThem',
  'gamesBountyHuntingTie'
] as const;

const COMPATIBLE_LOCALE_CATALOGS = [
  ['de', deCatalog],
  ['es', esCatalog],
  ['fr', frCatalog],
  ['id', idCatalog],
  ['it', itCatalog],
  ['nl', nlCatalog],
  ['pl', plCatalog],
  ['pt', ptCatalog],
  ['tr', trCatalog],
  ['vi', viCatalog]
] as const;

describe('Bounty Hunting font support', () => {
  it('matches the packaged custom font character map limits', () => {
    for (const canRenderText of [
      canRenderBountyHuntingBarnumText,
      canRenderBountyHuntingBartleText,
      canRenderBountyHuntingTexMexText
    ]) {
      expect(canRenderText('READY? 10: $5.00, OK!')).toBe(true);
      expect(canRenderText('3+ emojis')).toBe(false);
      expect(canRenderText('WINNER: {winner}')).toBe(false);
      expect(canRenderText('MAYÚS.')).toBe(false);
    }
  });

  it('formats Tex Mex title text in uppercase', () => {
    expect(formatBountyHuntingTexMexTitleText('The ledger')).toBe('THE LEDGER');
  });

  it('keeps compatible localized custom-font game labels inside the supported glyph set', () => {
    for (const [locale, catalog] of COMPATIBLE_LOCALE_CATALOGS) {
      for (const key of CUSTOM_FONT_MESSAGE_KEYS) {
        const text = catalog.messages[key].replace('{winner}', 'YOU');
        expect(canRenderBountyHuntingBarnumText(text), `${locale}.${key}`).toBe(true);
      }
    }
  });
});
