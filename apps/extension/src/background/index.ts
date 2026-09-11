/**
 * Background service worker entrypoint.
 *
 * Keep each background responsibility in its own module so the translation
 * bridge and toolbar status logic can evolve independently.
 */
import './action-status';
import './active-chat-keepalive';
import './attach-open-chats';
import './onboarding';
import './playground';
import './profile-avatar';
import './translate';
import './window-focus';
