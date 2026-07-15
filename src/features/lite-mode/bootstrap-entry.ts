/** Document-start entrypoint kept separate from the reusable Lite bootstrap API. */
import { injectYouTubeChatFeedPage } from '../../youtube/chat-feed/page-injection';
import { initLiteModeBootstrap } from './bootstrap';

// Safari cannot declare a MAIN-world content script, so start its page-world
// transport here instead of waiting for the normal content script at document idle.
injectYouTubeChatFeedPage();
initLiteModeBootstrap();
