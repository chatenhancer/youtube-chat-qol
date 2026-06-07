/**
 * Enabled content features.
 *
 * Importing this module loads each enabled feature so it can register its
 * lifecycle hooks. Add a feature import here when a content feature should run
 * on YouTube live chat pages.
 *
 * Do not rely on this import order for behavior. Cross-feature sequencing
 * belongs to lifecycle phases in `lifecycle.ts`.
 */
import '../features/active-chat-keepalive';
import '../features/chat-drafts';
import '../features/chat-commands';
import '../features/composer-translation';
import '../features/user-message-history';
import '../features/mention-detection';
import '../features/focus-mode';
import '../features/live-edge';
import '../features/marked-users';
import '../features/menus';
import '../features/profile-popup';
import '../features/reply';
import '../features/inbox';
import '../features/frequent-emojis';
import '../features/enhanced-effect';
import '../features/translation';
