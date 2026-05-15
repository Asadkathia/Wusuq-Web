import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: this.config.get('SMTP_USER'),
        pass: this.config.get('SMTP_PASS'),
      },
    });
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.config.get('SMTP_HOST')) {
      this.logger.warn(
        `Email skipped (SMTP not configured): ${subject} -> ${to}`,
      );
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.config.get('SMTP_FROM', '"Wusuq" <no-reply@wusuq.com>'),
        to,
        subject,
        html,
      });
    } catch (err) {
      this.logger.error(`Email failed to ${to}: ${(err as Error).message}`);
    }
  }
}
