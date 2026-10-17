// 管理ページの申込者 CSV。Excel で開いて文字化けしないよう BOM 付き UTF-8 にする。
// 値は申込者が入力したものなので、数式として実行されないよう先頭の記号を無害化する（CSV インジェクション対策）。
import type { AnswerValue } from './answers';
import type { EventField } from './schema';
import { formatDateTimeNumeric } from './time';

export const CSV_BOM = '﻿';

/** 申込 1 件。Firestore の Timestamp は呼び出し側で Date にしておく */
export interface RegistrationRow {
  name: string;
  email: string;
  answers: Record<string, AnswerValue>;
  createdAt: Date | null;
  confirmationSentAt: Date | null;
  remindedAt: Date | null;
}

/** 表計算ソフトが数式とみなす先頭文字 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** 1 つの値をセルの文字列にする */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  // 数値はそのまま（負の数を ' 付きにしない）
  let s = typeof value === 'number' ? String(value) : value;
  if (typeof value === 'string' && FORMULA_PREFIX.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** 行の配列を CSV にする（BOM 付き、改行は CRLF） */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return CSV_BOM + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** 申込者一覧の CSV。列は お名前・メール・追加項目（fields 順）・申込日時・受付メール・リマインド */
export function registrationsCsv(fields: EventField[], registrations: RegistrationRow[]): string {
  const date = (d: Date | null) => (d ? formatDateTimeNumeric(d) : '');
  const header = [
    'お名前',
    'メールアドレス',
    ...fields.map((f) => f.label),
    '申込日時',
    '受付メール送信日時',
    'リマインド送信日時',
  ];
  const body = registrations.map((r) => [
    r.name,
    r.email,
    ...fields.map((f) => r.answers[f.id]),
    date(r.createdAt),
    date(r.confirmationSentAt),
    date(r.remindedAt),
  ]);
  return toCsv([header, ...body]);
}
