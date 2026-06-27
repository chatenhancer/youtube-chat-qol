/**
 * Background service worker entrypoint.
 *
 * Keep each background responsibility in its own module so the translation
 * bridge and toolbar status logic can evolve independently.
 */
import './action-status';
import './active-chat-keepalive';
import './playground';
import './translate';
import './window-focus';
