// SMTP でメールを送る（nodemailer）。設定は環境変数から読む（Actions では Secrets と Variables で渡す）。
//   SMTP_USER / SMTP_PASSWORD  必須。差出人のアドレスは SMTP_USER
//   SMTP_HOST / SMTP_PORT      省略時は smtp.gmail.com / 465
//   REPLY_TO                   省略可。返信先
// 差出人の表示名はグループ名にする。
import { createTransport } from 'nodemailer';
import type { Mail } from './messages';
import type { Recipient, SendMail } from './notify';

export interface SmtpSettings {
  user: string;
  password: string;
  host: string;
  port: number;
  replyTo?: string;
}

export function smtpSettings(env = process.env): SmtpSettings {
  const user = env.SMTP_USER;
  const password = env.SMTP_PASSWORD;
  if (!user || !password) throw new Error('環境変数 SMTP_USER と SMTP_PASSWORD を設定してください');
  const port = Number(env.SMTP_PORT || 465);
  if (!Number.isInteger(port) || port <= 0) throw new Error('環境変数 SMTP_PORT はポート番号で指定してください');
  return { user, password, host: env.SMTP_HOST || 'smtp.gmail.com', port, replyTo: env.REPLY_TO || undefined };
}

export function createSender(settings: SmtpSettings, fromName: string): { send: SendMail; close: () => void } {
  const transport = createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.port === 465, // 465 は最初から TLS、587 などは STARTTLS
    auth: { user: settings.user, pass: settings.password },
  });
  const from = { name: fromName, address: settings.user };

  const send = async (to: Recipient, mail: Mail) => {
    await transport.sendMail({
      from,
      to: { name: to.name, address: to.email },
      replyTo: settings.replyTo,
      subject: mail.subject,
      text: mail.text,
    });
  };
  return { send, close: () => transport.close() };
}
