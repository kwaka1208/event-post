// ログイン状態の判定。どの画面を見せるかは、ここで決めた状態だけをもとに決める。
// 画面側の振り分けは見せ方の都合で、読み書きできる範囲はルール（firebase/firestore.rules）が決める。
import type { GroupProfile } from './group';
import type { Application, Member, SignedInUser } from './membership';

export type Session =
  /** グループがまだない。user があればグループを作れる */
  | { kind: 'no-group'; user: SignedInUser | null }
  | { kind: 'guest'; group: GroupProfile }
  /** ログイン済みで、メンバーでも申込中でもない */
  | { kind: 'newcomer'; group: GroupProfile; user: SignedInUser }
  | { kind: 'pending'; group: GroupProfile; user: SignedInUser; application: Application }
  | { kind: 'member'; group: GroupProfile; user: SignedInUser; member: Member };

export interface SessionInput {
  group: GroupProfile | null;
  user: SignedInUser | null;
  member: Member | null;
  application: Application | null;
}

export function resolveSession({ group, user, member, application }: SessionInput): Session {
  if (!group) return { kind: 'no-group', user };
  if (!user) return { kind: 'guest', group };
  if (member) return { kind: 'member', group, user, member };
  if (application) return { kind: 'pending', group, user, application };
  return { kind: 'newcomer', group, user };
}

/** ログインした後に最初に見せる画面 */
export function homePathFor(session: Session): string {
  switch (session.kind) {
    case 'no-group':
      return session.user ? '/setup' : '/';
    case 'guest':
      return '/';
    case 'newcomer':
    case 'pending':
      return '/join';
    case 'member':
      return '/events';
  }
}
