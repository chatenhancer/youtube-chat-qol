/** Document-start entrypoint kept separate from the reusable Lite bootstrap API. */
import { injectYouTubeMessageDataPage } from '../../youtube/message-data-page-injection';
import { initLiteModeBootstrap } from './bootstrap';

// Safari cannot declare a MAIN-world content script, so start its page-world
// adapter here instead of waiting for the normal content script at document idle.
injectYouTubeMessageDataPage();
initLiteModeBootstrap();
