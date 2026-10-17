// config.yml とイベント Frontmatter のスキーマ。
// Astro（ビルド）と scripts/（Actions）の両方から使うため、Astro 固有の import をしないこと。
import { z } from 'zod';

z.config(z.locales.ja());

// ---------------------------------------------------------------------------
// 共通
// ---------------------------------------------------------------------------

/** イベント ID（＝ファイル名）。Firestore のドキュメント ID と URL に使う */
export const EVENT_ID_PATTERN = /^[A-Za-z0-9-]+$/;

/** 追加項目の上限（firebase/firestore.rules の validAnswerValues と合わせる） */
export const MAX_FIELDS = 20;
/** 申込の回答・名前の文字数の上限（firestore.rules と合わせる） */
export const MAX_ANSWER_LENGTH = 1000;
export const MAX_NAME_LENGTH = 100;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * YAML の日付は、書き方によって文字列にも Date にもなる（"2026-11-20" は Date になりやすい）。
 * Date になった場合は UTC の値をそのまま「JST の壁時計の値」として読み直す。
 */
function yamlDateToString(v: unknown): unknown {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().replace(/\.\d{3}Z$/, '').replace(/T00:00:00$/, '');
  }
  return v;
}

const dateString = z.preprocess(
  yamlDateToString,
  z.string().regex(DATE_PATTERN, '日付は YYYY-MM-DD の形式で書いてください（例: 2026-11-20）'),
);

const timeString = z
  .string()
  .regex(TIME_PATTERN, '時刻は "HH:MM" の形式で、引用符で囲んで書いてください（例: "13:00"）');

/** 2026-11-19T23:59（秒は任意） */
const dateTimeString = z.preprocess(
  yamlDateToString,
  z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:00)?$/,
      '日時は YYYY-MM-DDTHH:MM の形式で書いてください（例: 2026-11-19T23:59）',
    )
    .transform((s) => s.slice(0, 16)),
);

// ---------------------------------------------------------------------------
// config.yml
// ---------------------------------------------------------------------------

/** WCAG の相対輝度 */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 白（#FFFFFF）とのコントラスト比 */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

const accentColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'アクセントカラーは "#0F6E8C" のような 6 桁の 16 進数で書いてください')
  .refine((hex) => contrastWithWhite(hex) >= 4.5, {
    message: 'アクセントカラーが明るすぎます。白い文字が読めるよう、もっと濃い色にしてください（白とのコントラスト比 4.5 以上が必要）',
  });

export const configSchema = z.object({
  group: z.object({
    name: z.string().min(1),
    description: z.string().default(''),
    contact_email: z.email(),
  }),
  theme: z
    .object({
      accent: accentColor.default('#0F6E8C'),
      logo: z.string().optional(),
    })
    .prefault({}),
  site: z
    .object({
      base: z.string().default(''),
      custom_domain: z.string().default(''),
    })
    .prefault({}),
  timezone: z.literal('Asia/Tokyo').default('Asia/Tokyo'),
  admins: z.array(z.email()).min(1, '管理者のメールアドレスを 1 件以上書いてください'),
  firebase: z.object({
    apiKey: z.string().min(1),
    authDomain: z.string().min(1),
    projectId: z.string().min(1),
    appId: z.string().min(1),
  }),
  mail: z
    .object({
      from_name: z.string().optional(),
      smtp_host: z.string().default('smtp.gmail.com'),
      smtp_port: z.number().int().default(465),
      confirmation: z.boolean().default(true),
      reminder_hour: z.number().int().min(0).max(23).default(18),
    })
    .prefault({}),
  retention_days: z.number().int().min(1).default(30),
});

export type SiteConfig = z.infer<typeof configSchema>;

// ---------------------------------------------------------------------------
// イベント Frontmatter
// ---------------------------------------------------------------------------

const fieldSchema = z
  .object({
    id: z
      .string()
      .regex(/^[A-Za-z0-9_]+$/, '項目の id は英数字とアンダースコアだけで書いてください'),
    label: z.string().min(1),
    type: z.enum(['text', 'textarea', 'number', 'select']),
    options: z.array(z.coerce.string()).optional(),
    required: z.boolean().default(false),
  })
  .refine((f) => f.type !== 'select' || (f.options && f.options.length > 0), {
    message: 'type: select の項目には options を書いてください',
    path: ['options'],
  });

export type EventField = z.infer<typeof fieldSchema>;

export const eventSchema = z
  .object({
    title: z.string().min(1),
    date: dateString,
    start: timeString,
    end: timeString,
    venue: z.string().min(1),
    address: z.string().optional(),
    capacity: z.number().int().positive().nullable().default(null),
    deadline: dateTimeString.optional(),
    published: z.boolean().default(true),
    fields: z.array(fieldSchema).max(MAX_FIELDS, `追加項目（fields）は ${MAX_FIELDS} 件までです`).default([]),
    reminder_note: z.string().optional(),
  })
  .refine((e) => e.start < e.end, {
    message: '終了時刻（end）は開始時刻（start）より後にしてください',
    path: ['end'],
  })
  .refine((e) => new Set(e.fields.map((f) => f.id)).size === e.fields.length, {
    message: 'fields の id が重複しています',
    path: ['fields'],
  });

export type EventData = z.infer<typeof eventSchema>;

/** zod のエラーを、どのファイルの何が悪いか分かる文章にする */
export function formatSchemaError(source: string, error: z.ZodError): string {
  return `${source} に誤りがあります。\n${z.prettifyError(error)}`;
}
