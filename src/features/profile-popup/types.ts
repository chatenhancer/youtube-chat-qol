import type { UserIdentity } from '../user-message-history';

export interface ProfileSource {
  authorName: string;
  avatarSrc: string;
  identity: UserIdentity;
  profileUrl: string;
}
