import {
  mockedComposerTranslationProtectedDraftScenario,
  mockedComposerTranslationScenario,
  realComposerTranslationScenario
} from '../../scenarios/translation/composer';
import {
  replacedTranslationToggleSurfacesScenario,
  translationDisplayScenario
} from '../../scenarios/translation/display';
import {
  mockedMessageTranslationScenario,
  mockedReplacedTranslationToggleScenario
} from '../../scenarios/translation/incoming';
import { translationSettingsReactScenario } from '../../scenarios/translation/settings';
import { rateLimitedTranslationScenario } from '../../scenarios/translation/rate-limit';
import {
  youtubeScenarioPairs as pair,
  youtubeScenarioTargets as target,
  type YouTubeScenario
} from './model';

export const translationScenarios: readonly YouTubeScenario[] = [
  {
    title: 'HTTP 429 pauses chat and composer translation and recovers without losing text',
    run: rateLimitedTranslationScenario,
    on: pair.liveLoggedIn
  },
  {
    title: 'translation display modes render for injected incoming messages',
    run: translationDisplayScenario,
    on: pair.liveLoggedOut
  },
  {
    title: 'the Translate setting reacts to an injected incoming message',
    run: translationSettingsReactScenario,
    on: pair.liveLoggedOut
  },
  {
    title: 'replaced translations toggle across chat surfaces',
    run: replacedTranslationToggleSurfacesScenario,
    on: pair.liveLoggedOut
  },
  {
    title: 'composer translation translates draft text with mocked Google Translate',
    run: mockedComposerTranslationScenario,
    on: pair.liveLoggedIn
  },
  {
    title: 'composer translation preserves mentions and emoji placeholders',
    run: mockedComposerTranslationProtectedDraftScenario,
    on: pair.liveLoggedIn
  },
  {
    title: 'incoming chat messages are translated',
    run: mockedMessageTranslationScenario,
    on: [...pair.liveLoggedOut, ...pair.replayLoggedIn]
  },
  {
    title: 'replaced translations toggle from the inline icon',
    run: mockedReplacedTranslationToggleScenario,
    on: [...pair.liveLoggedIn, ...pair.liveLoggedOut]
  },
  {
    title: 'composer translation translates draft text with real Google Translate',
    run: realComposerTranslationScenario,
    on: [target.liveLoggedIn],
    reason: 'This is the intentional real-provider integration variant of the mocked scenario.'
  }
];
