// メールを書く（管理者）。宛先は「全員」「タグで選ぶ」「選んだ人」、または ?event=ID のときは「イベントの申込者」。
// 保存すると送信待ちになり、毎時の Actions が 1 人ずつ送る
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useAdminMember } from '@/components/RequireAdmin';
import { Loading, LoadError } from '@/components/Status';
import { TextField } from '@/components/TextField';
import { getEvent } from '@/lib/events';
import { db } from '@/lib/firebase';
import { LIMITS } from '@/lib/limits';
import { createMail, recipientOf, type MailRecipient } from '@/lib/mails';
import { allTags, listMembers, membersWithTags, tagsOf, type Member } from '@/lib/membership';
import { listRegistrations } from '@/lib/registrations';
import { adminEventsKey } from './adminEventsKey';
import { mailsKey, membersKey } from './adminKeys';

type Mode = 'all' | 'tag' | 'select' | 'event';

export function MailComposePage() {
  const [params] = useSearchParams();
  const eventId = params.get('event');
  const members = useQuery({ queryKey: membersKey, queryFn: () => listMembers(db) });
  const event = useQuery({
    queryKey: [...adminEventsKey, eventId ?? '', 'mail-recipients'],
    queryFn: async () => {
      const ev = await getEvent(db, eventId!);
      return ev ? { title: ev.title, registrants: await listRegistrations(db, eventId!) } : null;
    },
    enabled: !!eventId,
  });

  if (members.isPending || (eventId && event.isPending)) return <Loading />;
  if (members.isError || event.isError) return <LoadError />;

  const eventRecipients = event.data ? { title: event.data.title, recipients: event.data.registrants.map(recipientOf) } : null;
  return <MailForm members={members.data} eventRecipients={eventRecipients} />;
}

function MailForm({
  members,
  eventRecipients,
}: {
  members: Member[];
  eventRecipients: { title: string; recipients: MailRecipient[] } | null;
}) {
  const me = useAdminMember();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>(eventRecipients ? 'event' : 'all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const tags = useMemo(() => allTags(members), [members]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);

  const recipients = useMemo(() => {
    if (mode === 'event') return eventRecipients?.recipients ?? [];
    const list =
      mode === 'all'
        ? members
        : mode === 'tag'
          ? membersWithTags(members, selectedTags)
          : members.filter((m) => selected.has(m.uid));
    return list.map(recipientOf);
  }, [mode, members, selected, selectedTags, eventRecipients]);

  const save = useMutation({
    mutationFn: () => createMail(db, me, { subject: subject.trim(), body: body.trim(), recipients }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: mailsKey });
      navigate('/admin/mails');
    },
    onError: () => setConfirming(false),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const found: string[] = [];
    if (recipients.length === 0) found.push('宛先を 1 人以上選んでください。');
    if (recipients.length > LIMITS.mailRecipients) found.push(`宛先は ${LIMITS.mailRecipients} 人までにしてください。`);
    if (!subject.trim()) found.push('件名を入力してください。');
    if (!body.trim()) found.push('本文を入力してください。');
    setErrors(found);
    if (found.length === 0) setConfirming(true);
  }

  const toggle = (uid: string) => setSelected((s) => toggled(s, uid));

  return (
    <main className="main">
      <form className="card" onSubmit={handleSubmit} noValidate>
        <h1 className="card-title">メールを書く</h1>

        <fieldset className="field fieldset">
          <legend className="label">宛先</legend>
          {eventRecipients && (
            <label className="checkbox">
              <input type="radio" name="mode" checked={mode === 'event'} onChange={() => setMode('event')} />
              <span>
                「{eventRecipients.title}」の申込者（{eventRecipients.recipients.length} 人）
              </span>
            </label>
          )}
          <label className="checkbox">
            <input type="radio" name="mode" checked={mode === 'all'} onChange={() => setMode('all')} />
            <span>メンバー全員（{members.length} 人）</span>
          </label>
          {tags.length > 0 && (
            <label className="checkbox">
              <input type="radio" name="mode" checked={mode === 'tag'} onChange={() => setMode('tag')} />
              <span>タグで選ぶ</span>
            </label>
          )}
          {mode === 'tag' && (
            <div className="pick-list">
              <span className="help">選んだタグのどれかが付いている人に送ります。</span>
              {tags.map((t) => (
                <label key={t} className="checkbox">
                  <input type="checkbox" checked={selectedTags.has(t)} onChange={() => setSelectedTags((s) => toggled(s, t))} />
                  <span>
                    {t}
                    <span className="card-subtitle">（{members.filter((m) => tagsOf(m).includes(t)).length} 人）</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <label className="checkbox">
            <input type="radio" name="mode" checked={mode === 'select'} onChange={() => setMode('select')} />
            <span>メンバーから選ぶ</span>
          </label>
          {mode === 'select' && (
            <div className="pick-list">
              <div className="pick-actions">
                <button type="button" className="button-text" onClick={() => setSelected(new Set(members.map((m) => m.uid)))}>
                  すべて選ぶ
                </button>
                <button type="button" className="button-text" onClick={() => setSelected(new Set())}>
                  すべて外す
                </button>
              </div>
              {members.map((m) => (
                <label key={m.uid} className="checkbox">
                  <input type="checkbox" checked={selected.has(m.uid)} onChange={() => toggle(m.uid)} />
                  <span>
                    {m.realName}
                    <span className="card-subtitle">（{m.nickname}）</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <span className="help">宛先：{recipients.length} 人</span>
        </fieldset>

        <TextField label="件名" value={subject} onChange={setSubject} maxLength={LIMITS.mailSubject} required help="件名の前にグループ名が付きます。" />
        <TextField label="本文" value={body} onChange={setBody} maxLength={LIMITS.mailBody} required multiline rows={10} />

        <ul className="help notes">
          <li>送信は毎時 1 回です。届くまで最大 1 時間ほどかかります。</li>
          <li>1 人ずつ別々に送るので、ほかの人のメールアドレスは見えません。</li>
          <li>
            宛先は {LIMITS.mailRecipients} 人までです。Gmail で送れるのは 1 日に約 500 通なので、ほかのメールと合わせて超えないようにしてください。
          </li>
        </ul>

        {errors.length > 0 && (
          <ul className="error" role="alert">
            {errors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        {save.isError && (
          <p className="error" role="alert">
            保存できませんでした。通信状況を確認して、もう一度お試しください。
          </p>
        )}

        {confirming ? (
          <div className="confirm-info" role="group" aria-label="送信の確認">
            <p>{recipients.length} 人に送ります。次の毎時の送信で送られます。よろしいですか？</p>
            <div className="actions">
              <button type="button" className="button-primary" disabled={save.isPending} onClick={() => save.mutate()}>
                送信する
              </button>
              <button type="button" className="button-secondary" disabled={save.isPending} onClick={() => setConfirming(false)}>
                戻って直す
              </button>
            </div>
          </div>
        ) : (
          <div className="actions">
            <button type="submit" className="button-primary">
              確認する
            </button>
            <Link to="/admin/mails" className="button-secondary">
              やめる
            </Link>
          </div>
        )}
      </form>
    </main>
  );
}

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
