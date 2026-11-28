// 設定（管理者）。
// グループ名、説明、トップページに出す管理者の名前を変えられるのは、特権管理者だけ。
// 配色（テーマカラー）は、管理者なら誰でも変えられる
import { useId, useState, type CSSProperties, type FormEvent } from 'react';
import { useAdminMember } from '@/components/RequireAdmin';
import { LoadError, Loading } from '@/components/Status';
import { TextField } from '@/components/TextField';
import { db } from '@/lib/firebase';
import { updateAccentColor, updateGroup, type GroupProfile } from '@/lib/group';
import { LIMITS } from '@/lib/limits';
import { ACCENT_PRESETS, DEFAULT_ACCENT, MIN_CONTRAST, contrastWithBackground, isUsableAccent, normalizeHex } from '@/lib/theme';
import { useSession } from '@/session/SessionProvider';

export function SettingsPage() {
  const me = useAdminMember();
  const { state } = useSession();
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'error' || state.session.kind !== 'member') return <LoadError />;
  const { group } = state.session;
  return (
    <main className="main">
      <h1>設定</h1>
      {me.role === 'owner' ? <SettingsForm group={group} /> : <GroupSummary group={group} />}
      <AccentSettings group={group} />
    </main>
  );
}

/** 管理者（特権管理者でない）に見せる、グループの情報 */
function GroupSummary({ group }: { group: GroupProfile }) {
  return (
    <section className="card" aria-labelledby="settings-group">
      <h2 id="settings-group" className="card-title">
        グループの情報
      </h2>
      <dl className="summary">
        <dt>グループ名</dt>
        <dd>{group.name}</dd>
        <dt>管理者の名前</dt>
        <dd>{group.ownerName}</dd>
      </dl>
      <p className="help">グループ名と説明を変えられるのは、特権管理者だけです。</p>
    </section>
  );
}

/** 配色。用意した色から選ぶか、色を指定する。読みにくい色は保存できない */
function AccentSettings({ group }: { group: GroupProfile }) {
  const { refresh } = useSession();
  const current = group.accentColor ?? DEFAULT_ACCENT;
  const [color, setColor] = useState(current);
  const [custom, setCustom] = useState(current);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'done' | 'error'; text: string } | null>(null);
  const customId = useId();
  const usable = isUsableAccent(color);
  const ratio = contrastWithBackground(color);

  function pick(next: string) {
    setColor(next);
    setCustom(next);
    setMessage(null);
  }

  async function save(next: string | null) {
    setBusy(true);
    setMessage(null);
    try {
      await updateAccentColor(db, next === DEFAULT_ACCENT ? null : next);
      await refresh();
      if (next === null) pick(DEFAULT_ACCENT);
      setMessage({ kind: 'done', text: '配色を保存しました。' });
    } catch {
      setMessage({ kind: 'error', text: '保存できませんでした。通信状況を確認して、もう一度お試しください。' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" aria-labelledby="settings-accent">
      <h2 id="settings-accent" className="card-title">
        配色
      </h2>
      <p className="help">ボタン、リンク、選んでいるメニューの色です。メンバー全員の画面に反映します。</p>

      <div className="swatches" role="radiogroup" aria-label="用意した色">
        {ACCENT_PRESETS.map((p) => (
          <button
            key={p.color}
            type="button"
            role="radio"
            aria-checked={color === p.color}
            className="swatch"
            style={{ '--swatch': p.color } as CSSProperties}
            onClick={() => pick(p.color)}
          >
            <span className="swatch-chip" aria-hidden="true" />
            <span className="swatch-name">{p.name}</span>
          </button>
        ))}
      </div>

      <div className="field">
        <label className="label" htmlFor={customId}>
          色を指定する
        </label>
        <div className="color-input">
          <input
            type="color"
            value={normalizeHex(custom) ?? color}
            aria-label="色を選ぶ"
            onChange={(e) => pick(e.target.value)}
          />
          <input
            id={customId}
            className="input"
            type="text"
            value={custom}
            maxLength={7}
            spellCheck={false}
            placeholder="#0f6e8c"
            onChange={(e) => {
              setCustom(e.target.value);
              const hex = normalizeHex(e.target.value);
              if (hex) setColor(hex);
              setMessage(null);
            }}
          />
        </div>
        {!usable && (
          <p className="error" role="alert">
            この色は明るすぎて、白い文字やリンクが読みにくくなります（コントラスト比 {ratio.toFixed(1)}、{MIN_CONTRAST} 以上が必要）。もう少し濃い色を選んでください。
          </p>
        )}
      </div>

      <div className="accent-preview" style={{ '--accent': usable ? color : current } as CSSProperties} aria-label="見本">
        <span className="help">見本</span>
        <div className="accent-preview-row">
          <span className="button-primary">申し込む</span>
          <a href="#settings-accent" onClick={(e) => e.preventDefault()}>
            リンクの色
          </a>
          <span className="badge">受付中</span>
        </div>
      </div>

      {message && (
        <p className={message.kind === 'done' ? 'notice' : 'error'} role={message.kind === 'done' ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
      <div className="actions">
        <button type="button" className="button-primary" disabled={busy || !usable || color === current} onClick={() => void save(color)}>
          この色にする
        </button>
        {group.accentColor && (
          <button type="button" className="button-secondary" disabled={busy} onClick={() => void save(null)}>
            標準の色に戻す
          </button>
        )}
      </div>
    </section>
  );
}

function SettingsForm({ group }: { group: GroupProfile }) {
  const { refresh } = useSession();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [ownerName, setOwnerName] = useState(group.ownerName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'done' | 'error'; text: string } | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await updateGroup(db, { name: name.trim(), description: description.trim(), ownerName: ownerName.trim() });
      await refresh();
      setMessage({ kind: 'done', text: '保存しました。' });
    } catch {
      setMessage({ kind: 'error', text: '保存できませんでした。通信状況を確認して、もう一度お試しください。' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" aria-labelledby="settings-group" onSubmit={(e) => void handleSubmit(e)}>
        <h2 id="settings-group" className="card-title">
          グループの情報
        </h2>
        <TextField label="グループ名" value={name} onChange={setName} maxLength={LIMITS.groupName} required />
        <TextField
          label="グループの説明"
          value={description}
          onChange={setDescription}
          maxLength={LIMITS.groupDescription}
          multiline
          help="トップページに表示します。"
        />
        <TextField
          label="管理者の名前"
          value={ownerName}
          onChange={setOwnerName}
          maxLength={LIMITS.personName}
          required
          help="トップページに表示します。"
        />
        <p className="help">
          グループ名と説明は、SNS でサイトのリンクを共有したときのタイトルと説明（OGP）にも使います。OGP は次の Deploy のときに反映されます。すぐに反映したいときは、GitHub の Actions で Deploy を実行してください。
        </p>
        {message && (
          <p className={message.kind === 'done' ? 'notice' : 'error'} role={message.kind === 'done' ? 'status' : 'alert'}>
            {message.text}
          </p>
        )}
        <button type="submit" className="button-primary" disabled={busy}>
          保存する
        </button>
      </form>
  );
}
