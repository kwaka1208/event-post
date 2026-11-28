// イベントの作成（/admin/events/new）と編集（/admin/events/:id）。編集では、申込がなければ削除もできる。
// 公開して保存するときに選べば、メンバー全員へのお知らせのメールも作る（lib/announce.ts）
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useAdminMember } from '@/components/RequireAdmin';
import { Loading, LoadError } from '@/components/Status';
import { TextField } from '@/components/TextField';
import { announcementMail, announcementRecipients, eventPageUrl } from '@/lib/announce';
import { isPermissionDenied } from '@/lib/errors';
import { emptyEventForm, eventToForm, formToInput, type EventFormValues } from '@/lib/eventForm';
import { createEvent, deleteEvent, getEvent, updateEvent, type EventDoc, type EventInput } from '@/lib/events';
import { db } from '@/lib/firebase';
import { LIMITS } from '@/lib/limits';
import { createMail, recipientOf } from '@/lib/mails';
import { listMembers } from '@/lib/membership';
import { adminEventsKey } from './adminEventsKey';
import { mailsKey } from './adminKeys';
import { Registrants } from './Registrants';

export function EventNewPage() {
  return <EventForm event={null} />;
}

export function EventEditPage() {
  const { id = '' } = useParams();
  const event = useQuery({ queryKey: [...adminEventsKey, id], queryFn: () => getEvent(db, id) });

  if (event.isPending) return <Loading />;
  if (event.isError) return <LoadError />;
  if (!event.data) {
    return (
      <main className="main">
        <section className="card">
          <h1 className="card-title">イベントが見つかりません</h1>
          <p>削除された可能性があります。</p>
          <Link to="/admin/events" className="button-secondary">
            イベント管理へ戻る
          </Link>
        </section>
      </main>
    );
  }
  // 読み直したときにフォームを作り直すよう、更新日時を key にする
  return <EventForm key={event.data.updatedAt?.toMillis() ?? 0} event={event.data} />;
}

function EventForm({ event }: { event: EventDoc | null }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const me = useAdminMember();
  const [values, setValues] = useState<EventFormValues>(event ? eventToForm(event) : emptyEventForm);
  const [errors, setErrors] = useState<string[]>([]);
  // 保存したら、メンバー全員にお知らせのメールを作る（公開するときだけ選べる。うっかり送らないよう、最初は外しておく）
  const [announce, setAnnounce] = useState(false);
  const registrationCount = event?.registrationCount ?? 0;

  const set = <K extends keyof EventFormValues>(key: K) => (value: EventFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const save = useMutation({
    mutationFn: async (input: EventInput) => {
      let id = event?.id;
      if (id) await updateEvent(db, id, input);
      else id = await createEvent(db, input);
      if (announce && input.published) {
        try {
          const members = await listMembers(db);
          const mail = announcementMail(input, eventPageUrl(location.origin, import.meta.env.BASE_URL, id));
          await createMail(db, me, { ...mail, recipients: announcementRecipients(members.map(recipientOf)) });
        } catch {
          return { announceFailed: true };
        }
      }
      return { announceFailed: false };
    },
    // お知らせのメールだけ作れなかったときも、イベントは保存できているので一覧に戻り、そこで知らせる
    // （この画面に残ると、新しいイベントをもう一度保存して二重に作ってしまうため）
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: adminEventsKey });
      await queryClient.invalidateQueries({ queryKey: mailsKey });
      navigate('/admin/events', { state: result.announceFailed ? { announceFailed: true } : null });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const result = formToInput(values, registrationCount);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    save.mutate(result.input);
  }

  const saveError = save.isError
    ? isPermissionDenied(save.error)
      ? '保存できませんでした。ほかの管理者が編集したか、申込が増えて定員を下回った可能性があります。再読み込みしてから、もう一度お試しください。'
      : '保存できませんでした。通信状況を確認して、もう一度お試しください。'
    : null;

  return (
    <main className="main">
      {event && <Registrants eventId={event.id} />}
      <form className="card" onSubmit={handleSubmit} noValidate>
        <h1 className="card-title">{event ? 'イベントを編集' : '新しいイベント'}</h1>
        {event && (
          <p className="help">
            申込：{registrationCount} 人。定員は、申込数より少なくできません。
          </p>
        )}

        <TextField label="タイトル" value={values.title} onChange={set('title')} maxLength={LIMITS.eventTitle} required />
        <DateTimeField label="開始日時" value={values.startAt} onChange={set('startAt')} required />
        <DateTimeField label="終了日時" value={values.endAt} onChange={set('endAt')} required />
        <DateTimeField
          label="申込の締切"
          value={values.deadlineAt}
          onChange={set('deadlineAt')}
          help="空にすると、開始日時が締切になります。"
        />
        <TextField label="会場" value={values.venue} onChange={set('venue')} maxLength={LIMITS.eventVenue} required />
        <TextField
          label="住所"
          value={values.address}
          onChange={set('address')}
          maxLength={LIMITS.eventAddress}
          help="地図を開くときなどに使います。"
        />
        <CapacityField value={values.capacity} onChange={set('capacity')} />
        <TextField
          label="本文"
          value={values.body}
          onChange={set('body')}
          maxLength={LIMITS.eventBody}
          multiline
          rows={10}
          help="Markdown で書けます（見出しは ##、箇条書きは - など）。"
        />
        <label className="checkbox">
          <input type="checkbox" checked={values.published} onChange={(e) => set('published')(e.target.checked)} />
          <span>公開する（チェックを外すと下書きになり、管理者だけが見られます）</span>
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={announce && values.published}
            disabled={!values.published}
            onChange={(e) => setAnnounce(e.target.checked)}
          />
          <span>
            保存したら、メンバー全員にこのイベントをメールで知らせる（日時・会場・ページの URL を、次の毎時の送信で送ります。送る前なら「メール」の画面から取りやめられます）
          </span>
        </label>

        {errors.length > 0 && (
          <ul className="error" role="alert">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
        {saveError && (
          <p className="error" role="alert">
            {saveError}
          </p>
        )}

        <div className="actions">
          <button type="submit" className="button-primary" disabled={save.isPending}>
            {event ? '保存する' : '作成する'}
          </button>
          <Link to="/admin/events" className="button-secondary">
            やめる
          </Link>
        </div>
      </form>

      {event && <DeleteSection event={event} />}
    </main>
  );
}

function DateTimeField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  help?: string;
}) {
  const id = useId();
  const helpId = props.help ? `${id}-help` : undefined;
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {props.label}
        {props.required && <span className="tag">必須</span>}
      </label>
      <input
        id={id}
        className="input"
        type="datetime-local"
        value={props.value}
        required={props.required}
        aria-describedby={helpId}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.help && (
        <span className="help" id={helpId}>
          {props.help}
        </span>
      )}
    </div>
  );
}

function CapacityField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        定員
      </label>
      <input
        id={id}
        className="input input-short"
        type="text"
        inputMode="numeric"
        value={value}
        aria-describedby={`${id}-help`}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="help" id={`${id}-help`}>
        人数を入れます。空にすると定員なしになります。
      </span>
    </div>
  );
}

function DeleteSection({ event }: { event: EventDoc }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => deleteEvent(db, event.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminEventsKey });
      navigate('/admin/events');
    },
  });

  if (event.registrationCount > 0) {
    return (
      <section className="card">
        <h2 className="card-title">イベントの削除</h2>
        <p>申込があるイベントは削除できません。参加者に見せたくないときは、「公開する」のチェックを外して下書きにしてください。</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2 className="card-title">イベントの削除</h2>
      {remove.isError && (
        <p className="error" role="alert">
          削除できませんでした。申込が入った可能性があります。再読み込みしてください。
        </p>
      )}
      {confirming ? (
        <div className="confirm" role="group" aria-label="削除の確認">
          <p>「{event.title}」を削除します。元には戻せません。よろしいですか？</p>
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
        <button type="button" className="button-secondary is-destructive" onClick={() => setConfirming(true)}>
          このイベントを削除する
        </button>
      )}
    </section>
  );
}
