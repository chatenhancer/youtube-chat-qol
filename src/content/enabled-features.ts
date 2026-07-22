/**
 * Enabled content features.
 *
 * Importing this module loads each enabled feature so it can register its
 * feature hooks. Add a feature import here when a content feature should run
 * on YouTube live chat pages.
 *
 * Do not rely on this import order for behavior. Feature callbacks must be
 * independent, and cross-feature data joins use stable message IDs.
 */
import '../features/active-chat-keepalive';
import '../features/chat-drafts';
import '../features/chat-commands';
import '../features/composer-translation';
import '../features/user-message-history';
import '../features/mention-detection';
import '../features/focus-mode';
import '../features/live-edge';
import '../features/avatar-rings';
import '../features/bookmarks';
import '../features/menus';
import '../features/profile-popup';
import '../features/reply';
import '../features/inbox';
import '../features/playground';
import '../features/frequent-emojis';
import '../features/enhanced-effect';
import '../features/translation';
import '../features/lite-mode';
