import { Injectable } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

export type PasswordPurpose = 'invite' | 'reset';

@Injectable()
export class MailService {
  private readonly transport: Transporter;
  private readonly from: string;
  private readonly webOrigin: string;

  constructor() {
    const port = Number(process.env.SMTP_PORT ?? '1025');
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('SMTP_PORT must be an integer between 1 and 65535');
    }
    const username = process.env.SMTP_USER;
    const password = process.env.SMTP_PASSWORD;
    if (Boolean(username) !== Boolean(password)) {
      throw new Error('SMTP_USER and SMTP_PASSWORD must be set together');
    }
    this.transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? '127.0.0.1',
      port,
      secure: process.env.SMTP_SECURE === 'true',
      auth: username && password ? { user: username, pass: password } : undefined,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 10_000,
    });
    this.from = process.env.MAIL_FROM ?? 'AquaGuard <no-reply@aquaguard.local>';
    const origin = new URL(process.env.WEB_APP_ORIGIN ?? 'http://localhost:5173');
    if (!['http:', 'https:'].includes(origin.protocol) || origin.pathname !== '/' || origin.search
      || origin.hash || origin.username || origin.password) {
      throw new Error('WEB_APP_ORIGIN must be a web origin without path or credentials');
    }
    this.webOrigin = origin.origin;
  }

  async sendPasswordLink(to: string, purpose: PasswordPurpose, token: string): Promise<void> {
    const link = new URL('/set-password', this.webOrigin);
    link.searchParams.set('token', token);
    const subject = purpose === 'invite' ? 'AquaGuard invitation' : 'AquaGuard password reset';
    const action = purpose === 'invite' ? 'Set your password' : 'Reset your password';
    const info = await this.transport.sendMail({
      from: this.from,
      to,
      subject,
      text: `${action}: ${link.toString()}\n\nThis link expires in ${purpose === 'invite' ? '72 hours' : '1 hour'}.`,
    });
    if (!info.accepted?.includes(to)) throw new Error('SMTP did not accept recipient');
  }
}
