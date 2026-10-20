// 参加申し込みの一覧（管理者）。役割を選んで承認するか、削除する
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAdminMember } from '@/components/RequireAdmin';
import { Loading, LoadError } from '@/components/Status';
import { db } from '@/lib/firebase';
import {
  approveApplication,
  deleteApplication,
  listApplications,
  type Application,
  type AssignableRole,
} from '@/lib/membership';

/** ログアウトのときに ['admin'] ごと消す（SessionProvider） */
const applicationsKey = ['admin', 'applications'] as const;

const dateFormat = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });

export function ApplicationsPage() {
  const me = useAdminMember();
  const applications = useQuery({ queryKey: applicationsKey, queryFn: () => listApplications(db) });

  if (applications.isPending) return <Loading />;
  if (applications.isError) return <LoadError />;

  return (
    <main className="main">
      <h1>参加申し込み</h1>
      {applications.data.length === 0 ? (
        <p>新しい申し込みはありません。</p>
      ) : (
        <ul className="list">
          {applications.data.map((app) => (
            <li key={app.uid}>
              <ApplicationItem application={app} canApproveAsAdmin={me.role === 'owner'} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

interface ApplicationItemProps {
  application: Application;
  /** 管理者として承認できるのは特権管理者だけ */
  canApproveAsAdmin: boolean;
}

function ApplicationItem({ application, canApproveAsAdmin }: ApplicationItemProps) {
  const queryClient = useQueryClient();
  const [role, setRole] = useState<AssignableRole>('member');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // 失敗したときも読み直す（ほかの管理者が先に承認・削除していることがあるため）
  const refetch = () => queryClient.invalidateQueries({ queryKey: applicationsKey });
  const approve = useMutation({ mutationFn: () => approveApplication(db, application, role), onSettled: refetch });
  const remove = useMutation({ mutationFn: () => deleteApplication(db, application.uid), onSettled: refetch });
  const busy = approve.isPending || remove.isPending;

  return (
    <article className="card">
      <h2 className="card-title">
        {application.realName}
        <span className="card-subtitle">（{application.nickname}）</span>
      </h2>
      <dl className="summary">
        <dt>メールアドレス</dt>
        <dd>{application.email}</dd>
        <dt>参加申し込みの理由</dt>
        <dd className="pre-wrap">{application.reason}</dd>
        <dt>申込日時</dt>
        <dd>{application.createdAt ? dateFormat.format(application.createdAt.toDate()) : '—'}</dd>
      </dl>

      {approve.isError && (
        <p className="error" role="alert">
          承認できませんでした。時間をおいて、もう一度お試しください。
        </p>
      )}
      {remove.isError && (
        <p className="error" role="alert">
          削除できませんでした。時間をおいて、もう一度お試しください。
        </p>
      )}

      {confirmingDelete ? (
        <div className="confirm" role="group" aria-label="削除の確認">
          <p>{application.realName} さんの申し込みを削除します。よろしいですか？</p>
          <div className="actions">
            <button type="button" className="button-danger" disabled={busy} onClick={() => remove.mutate()}>
              削除する
            </button>
            <button type="button" className="button-secondary" disabled={busy} onClick={() => setConfirmingDelete(false)}>
              やめる
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          {canApproveAsAdmin && (
            <label className="field">
              <span className="label">役割</span>
              <select
                className="input"
                value={role}
                disabled={busy}
                onChange={(e) => setRole(e.target.value as AssignableRole)}
              >
                <option value="member">参加者</option>
                <option value="admin">管理者</option>
              </select>
            </label>
          )}
          <button type="button" className="button-primary" disabled={busy} onClick={() => approve.mutate()}>
            {role === 'admin' ? '管理者として承認する' : '参加者として承認する'}
          </button>
          <button type="button" className="button-secondary" disabled={busy} onClick={() => setConfirmingDelete(true)}>
            削除する
          </button>
        </div>
      )}
    </article>
  );
}
