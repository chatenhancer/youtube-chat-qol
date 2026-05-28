/**
 * Profile popup type definitions.
 *
 * Shared source metadata needed to render a recent-messages card and open the
 * associated YouTube channel.
 */
import type { UserIdentity } from '../user-message-history';

export interface ProfileSource {
  authorName: string;
  avatarSrc: string;
  identity: UserIdentity;
  profileUrl: string;
}
