// SMTP でメールを送る（nodemailer）。ユーザー名とパスワードは Secrets（SMTP_USER / SMTP_PASSWORD）で渡す。
// 差出人は SMTP_USER のアドレスで、表示名は config.yml の mail.from_name（省略時はグループ名）。
import { createTransport } from 'nodemailer';
import type { SiteConfig } from '../../app/src/lib/schema';
import type { Mail } from './mail';
import type { Recipient, SendMail } from './notify';

export interface SmtpCredentials {
  user: string;
  password: string;
}

export function smtpCredentials(env = process.env): SmtpCredentials {
  const user = env.SMTP_USER;
  const password = env.SMTP_PASSWORD;
  if (!user || !password) throw new Error('環境変数 SMTP_USER と SMTP_PASSWORD を設定してください');
  return { user, password };
}

export function createSender(config: SiteConfig, credentials: SmtpCredentials): { send: SendMail; close: () => void } {
  const transport = createTransport({
    host: config.mail.smtp_host,
    port: config.mail.smtp_port,
    secure: config.mail.smtp_port === 465, // 465 は最初から TLS、587 などは STARTTLS
    auth: { user: credentials.user, pass: credentials.password },
  });
  const from = { name: config.mail.from_name ?? config.group.name, address: credentials.user };

  const send = async (to: Recipient, mail: Mail) => {
    await transport.sendMail({
      from,
      to: { name: to.name, address: to.email },
      replyTo: config.group.contact_email,
      subject: mail.subject,
      text: mail.text,
    });
  };
  return { send, close: () => transport.close() };
}
