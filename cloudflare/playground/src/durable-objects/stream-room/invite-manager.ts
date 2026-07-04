import type { GameId, PublicInvite, PublicUserIdentity } from '../../protocol/messages';
import { ProtocolError } from '../../protocol/validation';

export interface PendingInvite {
  createdAt: number;
  expiresAt: number;
  fromUserId: string;
  gameId: GameId;
  inviteId: string;
  status: 'accepted' | 'cancelled' | 'ignored' | 'pending';
  toUserId: string;
}

export interface CreateInviteInput {
  fromUserId: string;
  gameId: GameId;
  inviteId: string;
  now: number;
  toUserId: string;
  ttlMs: number;
}

export class InviteManager {
  private readonly invites = new Map<string, PendingInvite>();

  createInvite(input: CreateInviteInput): PendingInvite {
    const invite: PendingInvite = {
      createdAt: input.now,
      expiresAt: input.now + input.ttlMs,
      fromUserId: input.fromUserId,
      gameId: input.gameId,
      inviteId: input.inviteId,
      status: 'pending',
      toUserId: input.toUserId
    };
    this.invites.set(invite.inviteId, invite);
    return invite;
  }

  getPendingInvite(inviteId: string): PendingInvite {
    this.pruneExpiredInvites();
    const invite = this.invites.get(inviteId);
    if (!invite || invite.status !== 'pending') {
      throw new ProtocolError('invite_not_found', 'Invite not found.');
    }
    return invite;
  }

  getPendingInviteFromUser(input: {
    fromUserId: string;
    gameId: GameId;
    toUserId: string;
  }): PendingInvite | null {
    this.pruneExpiredInvites();
    return [...this.invites.values()]
      .find((invite) =>
        invite.status === 'pending' &&
        invite.fromUserId === input.fromUserId &&
        invite.toUserId === input.toUserId &&
        invite.gameId === input.gameId
      ) || null;
  }

  getPublicInvites(
    forUserId: string,
    getPublicUser: (userId: string) => PublicUserIdentity
  ): PublicInvite[] {
    this.pruneExpiredInvites();
    return [...this.invites.values()]
      .filter((invite) => invite.status === 'pending')
      .filter((invite) => Boolean(forUserId) && (invite.fromUserId === forUserId || invite.toUserId === forUserId))
      .map((invite) => this.toPublicInvite(invite, getPublicUser));
  }

  setInviteStatus(invite: PendingInvite, status: PendingInvite['status']): void {
    invite.status = status;
  }

  toPublicInvite(
    invite: PendingInvite,
    getPublicUser: (userId: string) => PublicUserIdentity
  ): PublicInvite {
    return {
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      fromUser: getPublicUser(invite.fromUserId),
      gameId: invite.gameId,
      inviteId: invite.inviteId,
      status: invite.status,
      toUser: getPublicUser(invite.toUserId)
    };
  }

  private pruneExpiredInvites(): void {
    const now = Date.now();
    this.invites.forEach((invite, inviteId) => {
      if (invite.expiresAt <= now) this.invites.delete(inviteId);
    });
  }
}
