import { describe, expect, it } from 'vitest';
import { buildRegistration } from '../../app/src/lib/answers';
import { MAX_ANSWER_LENGTH, MAX_NAME_LENGTH, type EventField } from '../../app/src/lib/schema';

const fields: EventField[] = [
  { id: 'grade', label: '学年', type: 'select', options: ['小1', '小2', '小3'], required: true },
  { id: 'age', label: '年齢', type: 'number', required: false },
  { id: 'note', label: '連絡事項', type: 'textarea', required: false },
];

describe('buildRegistration', () => {
  it('入力を name と answers にする。前後の空白は取り除き、number は数値にする', () => {
    const result = buildRegistration(fields, {
      name: '  山田 花子 ',
      values: { grade: '小3', age: ' 9 ', note: ' よろしく ' },
    });
    expect(result).toEqual({ ok: true, name: '山田 花子', answers: { grade: '小3', age: 9, note: 'よろしく' } });
  });

  it('未入力の任意項目は answers にキーごと入れない', () => {
    const result = buildRegistration(fields, { name: '山田', values: { grade: '小1', age: '', note: '   ' } });
    expect(result).toEqual({ ok: true, name: '山田', answers: { grade: '小1' } });
  });

  it('fields にない値は answers に入れない', () => {
    const result = buildRegistration(fields, { name: '山田', values: { grade: '小1', hack: 'x' } });
    expect(result).toEqual({ ok: true, name: '山田', answers: { grade: '小1' } });
  });

  it('名前が空・長すぎるとエラー', () => {
    expect(buildRegistration([], { name: ' ', values: {} })).toEqual({
      ok: false,
      errors: { name: 'お名前を入力してください' },
    });
    expect(buildRegistration([], { name: 'あ'.repeat(MAX_NAME_LENGTH), values: {} }).ok).toBe(true);
    expect(buildRegistration([], { name: 'あ'.repeat(MAX_NAME_LENGTH + 1), values: {} }).ok).toBe(false);
  });

  it('必須項目が未入力ならエラー。select は「選んでください」', () => {
    const result = buildRegistration(
      [...fields, { id: 'school', label: '学校名', type: 'text', required: true }],
      { name: '山田', values: {} },
    );
    expect(result).toEqual({
      ok: false,
      errors: { grade: '学年を選んでください', school: '学校名を入力してください' },
    });
  });

  it('select の選択肢にない値はエラー', () => {
    const result = buildRegistration(fields, { name: '山田', values: { grade: '高1' } });
    expect(result.ok).toBe(false);
  });

  it('number に数字でない値はエラー', () => {
    const result = buildRegistration(fields, { name: '山田', values: { grade: '小1', age: '九' } });
    expect(result).toEqual({ ok: false, errors: { age: '年齢は数字で入力してください' } });
  });

  it('回答の文字数の上限', () => {
    const ok = buildRegistration(fields, { name: '山田', values: { grade: '小1', note: 'あ'.repeat(MAX_ANSWER_LENGTH) } });
    const ng = buildRegistration(fields, {
      name: '山田',
      values: { grade: '小1', note: 'あ'.repeat(MAX_ANSWER_LENGTH + 1) },
    });
    expect(ok.ok).toBe(true);
    expect(ng.ok).toBe(false);
  });
});
