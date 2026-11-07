// イベントの入力フォームの値（文字列）と、保存する値（EventInput）の変換・検証。
// 画面から切り離して、単体テスト（tests/unit/eventForm.test.ts）で確かめる。
// 日時は <input type="datetime-local"> の形（YYYY-MM-DDTHH:mm、ブラウザの時刻）で扱う。
import type { EventDoc, EventInput } from './events';
import { LIMITS } from './limits';

export interface EventFormValues {
  title: string;
  body: string;
  startAt: string;
  endAt: string;
  /** 空なら開始日時を締切にする */
  deadlineAt: string;
  venue: string;
  address: string;
  /** 空なら定員なし */
  capacity: string;
  published: boolean;
}

export const emptyEventForm: EventFormValues = {
  title: '',
  body: '',
  startAt: '',
  endAt: '',
  deadlineAt: '',
  venue: '',
  address: '',
  capacity: '',
  published: false,
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Date を datetime-local の値にする */
export function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** datetime-local の値を Date にする。形が違えば null */
export function fromLocalInput(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const date = new Date(y, mo - 1, d, h, mi);
  // 2 月 30 日などは、別の日に繰り上がるので受け付けない
  if (date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/** 保存されたイベントを、編集フォームの値にする。締切が開始日時と同じなら、締切は空にする */
export function eventToForm(event: EventDoc): EventFormValues {
  const start = event.startAt.toDate();
  const deadline = event.deadlineAt.toDate();
  return {
    title: event.title,
    body: event.body,
    startAt: toLocalInput(start),
    endAt: toLocalInput(event.endAt.toDate()),
    deadlineAt: deadline.getTime() === start.getTime() ? '' : toLocalInput(deadline),
    venue: event.venue,
    address: event.address,
    capacity: event.capacity === null ? '' : String(event.capacity),
    published: event.published,
  };
}

export type EventFormResult = { ok: true; input: EventInput } | { ok: false; errors: string[] };

/**
 * フォームの値を確かめて、保存する値にする。ルール（firebase/firestore.rules）と同じ条件を、先に画面で伝えるため。
 * registrationCount は編集のときの今の申込数（定員をそれより少なくできない）
 */
export function formToInput(values: EventFormValues, registrationCount = 0): EventFormResult {
  const errors: string[] = [];
  const title = values.title.trim();
  const body = values.body.trim();
  const venue = values.venue.trim();
  const address = values.address.trim();

  if (!title) errors.push('タイトルを入力してください。');
  if (!venue) errors.push('会場を入力してください。');
  if (title.length > LIMITS.eventTitle) errors.push(`タイトルは ${LIMITS.eventTitle} 文字以内にしてください。`);
  if (body.length > LIMITS.eventBody) errors.push(`本文は ${LIMITS.eventBody} 文字以内にしてください。`);
  if (venue.length > LIMITS.eventVenue) errors.push(`会場は ${LIMITS.eventVenue} 文字以内にしてください。`);
  if (address.length > LIMITS.eventAddress) errors.push(`住所は ${LIMITS.eventAddress} 文字以内にしてください。`);

  const startAt = fromLocalInput(values.startAt);
  const endAt = fromLocalInput(values.endAt);
  const deadlineAt = values.deadlineAt ? fromLocalInput(values.deadlineAt) : null;
  if (!startAt) errors.push('開始日時を入力してください。');
  if (!endAt) errors.push('終了日時を入力してください。');
  if (values.deadlineAt && !deadlineAt) errors.push('締切の日時が正しくありません。');
  if (startAt && endAt && endAt <= startAt) errors.push('終了日時は、開始日時より後にしてください。');
  if (startAt && deadlineAt && deadlineAt > startAt) errors.push('締切は、開始日時より前にしてください。');

  let capacity: number | null = null;
  const capacityText = values.capacity.trim();
  if (capacityText) {
    capacity = /^\d+$/.test(capacityText) ? Number(capacityText) : NaN;
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > LIMITS.eventCapacity) {
      errors.push(`定員は 1〜${LIMITS.eventCapacity} の整数にしてください。定員なしにするときは空にします。`);
    } else if (capacity < registrationCount) {
      errors.push(`すでに ${registrationCount} 人が申し込んでいるため、定員を ${registrationCount} 人より少なくできません。`);
    }
  }

  if (errors.length > 0 || !startAt || !endAt) return { ok: false, errors };
  return {
    ok: true,
    input: { title, body, startAt, endAt, deadlineAt, venue, address, capacity, published: values.published },
  };
}
