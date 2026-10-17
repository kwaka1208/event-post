// 申込フォームの入力を検証し、Firestore に書く形（name と answers）にする。
// ルール（firebase/firestore.rules の validRegistration）で弾かれる前に、同じ条件でエラーを出すためのもの。
import { MAX_ANSWER_LENGTH, MAX_NAME_LENGTH, type EventField } from './schema';

export type AnswerValue = string | number;

export interface FormInput {
  name: string;
  /** 追加項目の入力値（フォームの値なので文字列） */
  values: Record<string, string>;
}

export type FormResult =
  | { ok: true; name: string; answers: Record<string, AnswerValue> }
  /** キーは 'name' または項目の id */
  | { ok: false; errors: Record<string, string> };

/**
 * 入力を検証する。
 * - 前後の空白は取り除く
 * - 未入力の任意項目は answers にキーごと入れない
 * - number の項目は数値に変換する
 * - answers には fields にある id だけを入れる
 */
export function buildRegistration(fields: EventField[], input: FormInput): FormResult {
  const errors: Record<string, string> = {};

  const name = input.name.trim();
  if (name === '') errors.name = 'お名前を入力してください';
  else if (name.length > MAX_NAME_LENGTH) errors.name = `お名前は ${MAX_NAME_LENGTH} 文字以内で入力してください`;

  const answers: Record<string, AnswerValue> = {};
  for (const field of fields) {
    const raw = (input.values[field.id] ?? '').trim();
    if (raw === '') {
      if (field.required) {
        errors[field.id] = field.type === 'select' ? `${field.label}を選んでください` : `${field.label}を入力してください`;
      }
      continue;
    }

    if (field.type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        errors[field.id] = `${field.label}は数字で入力してください`;
        continue;
      }
      answers[field.id] = n;
      continue;
    }

    if (field.type === 'select' && !field.options?.includes(raw)) {
      errors[field.id] = `${field.label}を選び直してください`;
      continue;
    }
    if (raw.length > MAX_ANSWER_LENGTH) {
      errors[field.id] = `${field.label}は ${MAX_ANSWER_LENGTH} 文字以内で入力してください`;
      continue;
    }
    answers[field.id] = raw;
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, name, answers };
}
