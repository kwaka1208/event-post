// 管理者への問い合わせ（メンバー）。送った内容は、次の毎時の実行で管理者全員にメールで届く。
// 管理者がそのメールに返信すると、送った人のメールアドレスに届く
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMember } from '@/components/RequireMember';
import { TextField } from '@/components/TextField';
import { isPermissionDenied } from '@/lib/errors';
import { db } from '@/lib/firebase';
import { sendInquiry } from '@/lib/inquiries';
import { LIMITS } from '@/lib/limits';

export function ContactPage() {
  const me = useMember();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendInquiry(db, me, { subject: subject.trim(), body: body.trim() });
      setSent(true);
      setSubject('');
      setBody('');
    } catch (e) {
      setError(
        isPermissionDenied(e)
          ? '送れませんでした。入力内容を確認して、もう一度お試しください。'
          : '送れませんでした。通信状況を確認して、もう一度お試しください。',
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <main className="main">
        <section className="card">
          <h1 className="card-title">問い合わせを受け付けました</h1>
          <p>1 時間ほどのうちに、管理者にメールで届きます。管理者からの返事は、{me.email} に届きます。</p>
          <div className="actions">
            <Link to="/me" className="button-secondary">
              マイページへ
            </Link>
            <button type="button" className="button-text" onClick={() => setSent(false)}>
              別の問い合わせを書く
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="main">
      <form className="card" onSubmit={(e) => void handleSubmit(e)}>
        <h1 className="card-title">管理者に問い合わせる</h1>
        <p>
          グループの管理者全員にメールで届きます。管理者からの返事は、{me.email} に届きます。
        </p>
        <TextField label="件名" value={subject} onChange={setSubject} maxLength={LIMITS.inquirySubject} required />
        <TextField label="内容" value={body} onChange={setBody} maxLength={LIMITS.inquiryBody} required multiline rows={8} />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button-primary" disabled={busy}>
          送る
        </button>
      </form>
    </main>
  );
}
