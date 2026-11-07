import { Timestamp } from 'firebase/firestore';
import { describe, expect, it } from 'vitest';
import {
  emptyEventForm,
  eventToForm,
  formToInput,
  fromLocalInput,
  toLocalInput,
  type EventFormValues,
} from '../../web/src/lib/eventForm';
import type { EventDoc } from '../../web/src/lib/events';

const valid: EventFormValues = {
  ...emptyEventForm,
  title: ' はじめてのプログラミング ',
  body: '持ち物：ノートパソコン',
  startAt: '2026-12-05T10:00',
  endAt: '2026-12-05T12:00',
  venue: '中部公民館',
  capacity: '10',
  published: true,
};

function errorsOf(values: EventFormValues, count = 0): string[] {
  const result = formToInput(values, count);
  return result.ok ? [] : result.errors;
}

describe('日時の変換', () => {
  it('datetime-local の値と Date を行き来できる', () => {
    const date = fromLocalInput('2026-12-05T09:05');
    expect(date).toEqual(new Date(2026, 11, 5, 9, 5));
    expect(toLocalInput(date!)).toBe('2026-12-05T09:05');
  });

  it('形が違う値や、ない日付は null になる', () => {
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('2026-12-05')).toBeNull();
    expect(fromLocalInput('2026-02-30T10:00')).toBeNull();
  });
});

describe('フォームの値を保存する値にする', () => {
  it('前後の空白を除き、定員を数にする', () => {
    const result = formToInput(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.title).toBe('はじめてのプログラミング');
    expect(result.input.capacity).toBe(10);
    expect(result.input.startAt).toEqual(new Date(2026, 11, 5, 10, 0));
    expect(result.input.published).toBe(true);
  });

  it('締切と定員が空なら、締切は null（開始日時）、定員は null（定員なし）になる', () => {
    const result = formToInput({ ...valid, deadlineAt: '', capacity: '' });
    expect(result.ok && result.input.deadlineAt).toBeNull();
    expect(result.ok && result.input.capacity).toBeNull();
  });

  it('必須の項目がないと、それぞれ伝える', () => {
    expect(errorsOf(emptyEventForm)).toEqual([
      'タイトルを入力してください。',
      '会場を入力してください。',
      '開始日時を入力してください。',
      '終了日時を入力してください。',
    ]);
  });

  it('終了が開始以前、締切が開始より後なら受け付けない', () => {
    expect(errorsOf({ ...valid, endAt: valid.startAt })).toEqual(['終了日時は、開始日時より後にしてください。']);
    expect(errorsOf({ ...valid, deadlineAt: '2026-12-05T10:01' })).toEqual(['締切は、開始日時より前にしてください。']);
    expect(errorsOf({ ...valid, deadlineAt: valid.startAt })).toEqual([]);
  });

  it('定員は 1〜10000 の整数だけ受け付ける', () => {
    for (const capacity of ['0', '10001', '1.5', '-1', 'abc']) {
      expect(errorsOf({ ...valid, capacity })).toHaveLength(1);
    }
    expect(errorsOf({ ...valid, capacity: '10000' })).toEqual([]);
  });

  it('編集のとき、定員を今の申込数より少なくできない', () => {
    expect(errorsOf({ ...valid, capacity: '5' }, 5)).toEqual([]);
    expect(errorsOf({ ...valid, capacity: '4' }, 5)).toEqual([
      'すでに 5 人が申し込んでいるため、定員を 5 人より少なくできません。',
    ]);
    expect(errorsOf({ ...valid, capacity: '' }, 5)).toEqual([]);
  });

  it('文字数の上限を超えると受け付けない', () => {
    expect(errorsOf({ ...valid, title: 'あ'.repeat(101) })).toHaveLength(1);
    expect(errorsOf({ ...valid, address: 'あ'.repeat(201) })).toHaveLength(1);
  });
});

describe('保存されたイベントを編集フォームの値にする', () => {
  const start = new Date(2026, 11, 5, 10, 0);
  const event: EventDoc = {
    id: 'ev',
    title: 'タイトル',
    body: '',
    startAt: Timestamp.fromDate(start),
    endAt: Timestamp.fromDate(new Date(2026, 11, 5, 12, 0)),
    deadlineAt: Timestamp.fromDate(start),
    venue: '会場',
    address: '',
    capacity: null,
    published: false,
    registrationCount: 0,
    createdAt: null,
    updatedAt: null,
  };

  it('締切が開始日時と同じなら空、定員なしなら空にする', () => {
    const form = eventToForm(event);
    expect(form.deadlineAt).toBe('');
    expect(form.capacity).toBe('');
    expect(form.startAt).toBe('2026-12-05T10:00');
  });

  it('締切が別なら、その日時を入れる', () => {
    const form = eventToForm({ ...event, deadlineAt: Timestamp.fromDate(new Date(2026, 11, 1, 23, 59)), capacity: 8 });
    expect(form.deadlineAt).toBe('2026-12-01T23:59');
    expect(form.capacity).toBe('8');
  });
});
