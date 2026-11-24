// メンバーからの問い合わせ（管理者）。メールで届いたものと同じ内容を、新しい順に表示する。
// 返信はメールで行う（届いたメールに返信するか、「Gmail で返信する」「メールアプリで返信する」から）
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Loading, LoadError } from '@/components/Status';
import { db } from '@/lib/firebase';
import { formatDateTime } from '@/lib/format';
import { deleteInquiry, gmailReplyHref, listInquiries, replyHref, type InquiryDoc } from '@/lib/inquiries';
import { inquiriesKey } from './adminKeys';

export function InquiriesPage() {
  const inquiries = useQuery({ queryKey: inquiriesKey, queryFn: () => listInquiries(db) });

  if (inquiries.isPending) return <Loading />;
  if (inquiries.isError) return <LoadError />;

  return (
    <main className="main">
      <h1>問い合わせ</h1>
      <p className="help">メンバーが「管理者に問い合わせる」から送った内容です。管理者全員にメールでも届きます。</p>
      {inquiries.data.length === 0 ? (
        <p>問い合わせはまだありません。</p>
      ) : (
        <ul className="list">
          {inquiries.data.map((inquiry) => (
            <li key={inquiry.id}>
              <InquiryItem inquiry={inquiry} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function InquiryItem({ inquiry }: { inquiry: InquiryDoc }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => deleteInquiry(db, inquiry.id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: inquiriesKey }),
  });

  return (
    <article className="card">
      <div className="badges">
        {inquiry.notifiedAt ? (
          <span className="badge badge-done">メールで通知済み</span>
        ) : (
          <span className="badge">通知待ち</span>
        )}
      </div>
      <h2 className="card-title">{inquiry.subject}</h2>
      <dl className="summary">
        <dt>送った人</dt>
        <dd>
          {inquiry.realName}（{inquiry.nickname}）
        </dd>
        <dt>メールアドレス</dt>
        <dd>{inquiry.email}</dd>
        <dt>送った日時</dt>
        <dd>{inquiry.createdAt ? formatDateTime(inquiry.createdAt.toDate()) : '—'}</dd>
      </dl>
      <p className="pre-wrap mail-body">{inquiry.body}</p>

      {remove.isError && (
        <p className="error" role="alert">
          削除できませんでした。通信状況を確認して、もう一度お試しください。
        </p>
      )}
      {confirming ? (
        <div className="confirm" role="group" aria-label="削除の確認">
          <p>
            この問い合わせを削除します。
            {!inquiry.notifiedAt && 'まだメールで通知していないので、管理者には届きません。'}
            よろしいですか？
          </p>
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
        <div className="actions">
          <a className="button-secondary" href={gmailReplyHref(inquiry)} target="_blank" rel="noopener noreferrer">
            Gmail で返信する
          </a>
          <a className="button-secondary" href={replyHref(inquiry)}>
            メールアプリで返信する
          </a>
          <button type="button" className="button-text" onClick={() => setConfirming(true)}>
            削除する
          </button>
        </div>
      )}
    </article>
  );
}
