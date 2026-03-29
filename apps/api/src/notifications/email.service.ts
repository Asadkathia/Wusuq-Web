import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>('SMTP_HOST');
    const port = config.get<number>('SMTP_PORT') ?? 587;
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    } else {
      this.logger.warn('SMTP not configured — email delivery disabled. Set SMTP_HOST, SMTP_USER, SMTP_PASS to enable.');
    }
  }

  async sendNotification(to: string, title: string, body?: string): Promise<void> {
    if (!this.transporter) return;

    const fromName = this.config.get<string>('SMTP_FROM_NAME') ?? 'Wusuq';
    const fromEmail = this.config.get<string>('SMTP_FROM_EMAIL') ?? this.config.get<string>('SMTP_USER') ?? 'noreply@wusuq.com';

    try {
      await this.transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to,
        subject: title,
        text: body ?? title,
        html: `<p>${body ?? title}</p>`,
      });
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${(err as Error).message}`);
    }
  }
}
