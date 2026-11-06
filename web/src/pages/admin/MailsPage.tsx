// 送ったメールの履歴（管理者）。送信状況を表示し、送信前なら削除できる
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Loading, LoadError } from '@/components/Status';
import { db } from '@/lib/firebase';
import { formatDateTime } from '@/lib/format';
import { deleteMail, isMailDeletable, listMails, type MailDoc, type MailStatus } from '@/lib/mails';
import { mailsKey } from './adminKeys';

const statusLabels: Record<MailStatus, { text: string; className: string }> = {
  pending: { text: '送信待ち', className: 'badge' },
  sent: { text: '送信済み', className: 'badge badge-done' },
  failed: { text: '一部失敗', className: 'badge badge-few' },
};

export function MailsPage() {
  const mails = useQuery({ queryKey: mailsKey, queryFn: () => listMails(db) });

  if (mails.isPending) return <Loading />;
  if (mails.isError) return <LoadError />;

  return (
    <main className="main">
      <h1>メール</h1>
      <Link to="/admin/mails/new" className="button-primary">
        メールを書く
      </Link>
      {mails.data.length === 0 ? (
        <p>まだメールを送っていません。</p>
      ) : (
        <ul className="list">
          {mails.data.map((mail) => (
            <li key={mail.id}>
              <MailItem mail={mail} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function MailItem({ mail }: { mail: MailDoc }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => deleteMail(db, mail.id),
    // 失敗したときも読み直す（送信が始まっていることがあるため）
    onSettled: () => queryClient.invalidateQueries({ queryKey: mailsKey }),
  });
  const label = statusLabels[mail.status];
  const delivered = mail.deliveredUids?.length ?? 0;
  const failedNames = mail.recipients.filter((r) => mail.failedUids?.includes(r.uid)).map((r) => r.name);

  return (
    <article className="card">
      <div className="badges">
        <span className={label.className}>{label.text}</span>
      </div>
      <h2 className="card-title">{mail.subject}</h2>
      <dl className="summary">
        <dt>書いた人・日時</dt>
        <dd>
          {mail.createdByName}・{mail.createdAt ? formatDateTime(mail.createdAt.toDate()) : '—'}
        </dd>
        <dt>宛先</dt>
        <dd>
          {mail.recipients.length} 人（届けた人 {delivered} 人）
        </dd>
        {mail.sentAt && (
          <>
            <dt>送信を終えた日時</dt>
            <dd>{formatDateTime(mail.sentAt.toDate())}</dd>
          </>
        )}
        {failedNames.length > 0 && (
          <>
            <dt>届かなかった人</dt>
            <dd>
              {failedNames.join('、')}
              {mail.status === 'pending' && '（次の回に送り直します）'}
            </dd>
          </>
        )}
      </dl>
      <details>
        <summary>本文と宛先を見る</summary>
        <div className="stack">
          <p className="pre-wrap mail-body">{mail.body}</p>
          <p className="help">{mail.recipients.map((r) => r.name).join('、')}</p>
        </div>
      </details>

      {remove.isError && (
        <p className="error" role="alert">
          削除できませんでした。送信が始まった可能性があります。
        </p>
      )}
      {isMailDeletable(mail) &&
        (confirming ? (
          <div className="confirm" role="group" aria-label="削除の確認">
            <p>このメールを削除します。誰にも送られません。よろしいですか？</p>
            <div className="actions">
              <button type="button" className="button-danger" disabled={remove.isPending} onClick={() => remove.mutate()}>
                削除する
              </button>
              <button type="button" className="button-secondary" disabled={remove.isPending} onClick={() => setConfirming(false)}>
                やめる
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="button-secondary" onClick={() => setConfirming(true)}>
            送信をやめて削除する
          </button>
        ))}
    </article>
  );
}
