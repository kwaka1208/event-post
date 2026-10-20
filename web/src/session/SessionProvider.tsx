// ログイン中のユーザーと、グループ・メンバー・申し込みの読み込みをまとめ、Session として配る。
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { auth, db, googleProvider } from '@/lib/firebase';
import { getGroup } from '@/lib/group';
import { getApplication, getMember, type SignedInUser } from '@/lib/membership';
import { resolveSession, type Session } from '@/lib/session';

export type SessionStatus =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; session: Session };

interface SessionContextValue {
  state: SessionStatus;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  /** 書き込みのあとに、グループ・メンバー・申し込みを読み直す */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export const queryKeys = {
  group: ['group'] as const,
  member: (uid: string) => ['member', uid] as const,
  application: (uid: string) => ['application', uid] as const,
};

function toSignedInUser(user: User | null): SignedInUser | null {
  return user?.email ? { uid: user.uid, email: user.email } : null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // undefined は「Firebase Auth がまだ状態を返していない」
  const [authUser, setAuthUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setAuthUser), []);

  const user = toSignedInUser(authUser ?? null);
  const uid = user?.uid ?? '';

  const group = useQuery({ queryKey: queryKeys.group, queryFn: () => getGroup(db) });
  const member = useQuery({
    queryKey: queryKeys.member(uid),
    queryFn: () => getMember(db, uid),
    enabled: !!user,
  });
  const application = useQuery({
    queryKey: queryKeys.application(uid),
    queryFn: () => getApplication(db, uid),
    enabled: !!user,
  });

  const state = useMemo((): SessionStatus => {
    const queries = user ? [group, member, application] : [group];
    const failed = queries.find((q) => q.isError);
    if (failed) return { status: 'error', error: failed.error };
    if (authUser === undefined || queries.some((q) => q.isPending)) return { status: 'loading' };
    return {
      status: 'ready',
      session: resolveSession({
        group: group.data ?? null,
        user,
        member: user ? (member.data ?? null) : null,
        application: user ? (application.data ?? null) : null,
      }),
    };
  }, [authUser, user, group, member, application]);

  const login = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    queryClient.removeQueries({ queryKey: ['member'] });
    queryClient.removeQueries({ queryKey: ['application'] });
    queryClient.removeQueries({ queryKey: ['admin'] });
  }, [queryClient]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.group });
    if (uid) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.member(uid) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.application(uid) });
    }
  }, [queryClient, uid]);

  const value = useMemo(() => ({ state, login, logout, refresh }), [state, login, logout, refresh]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession は SessionProvider の中で使ってください');
  return value;
}
