import nodemailer from 'nodemailer';
import type { WorkerConfig } from '../../shared-config/src/worker.js';

export type NotificationChannel = 'smtp' | 'telegram';
export interface NotificationMessage {
  deliveryId: string;
  recipient: string;
  subject: string;
  text: string;
}
export interface NotificationSender {
  readonly channel: NotificationChannel;
  send(message: NotificationMessage): Promise<void>;
}
export class NotificationError extends Error {
  readonly code = 'NOTIFICATION_UNAVAILABLE';
  constructor() {
    super('O canal de notificação está temporariamente indisponível.');
  }
}
export class SmtpNotificationSender implements NotificationSender {
  readonly channel = 'smtp';
  constructor(
    private readonly transport: {
      sendMail(input: {
        from: string;
        to: string;
        subject: string;
        text: string;
        messageId: string;
      }): Promise<unknown>;
    },
    private readonly from: string,
  ) {}
  async send(message: NotificationMessage): Promise<void> {
    try {
      const result = await this.transport.sendMail({
        from: this.from,
        to: message.recipient,
        subject: message.subject.replace(/[\r\n]/g, ' ').slice(0, 200),
        text: message.text,
        messageId: `<${message.deliveryId}@notifications.phasscode>`,
      });
      if (
        result &&
        typeof result === 'object' &&
        'accepted' in result &&
        Array.isArray(result.accepted) &&
        result.accepted.length === 0
      )
        throw new NotificationError();
    } catch {
      throw new NotificationError();
    }
  }
}
export class TelegramNotificationSender implements NotificationSender {
  readonly channel = 'telegram';
  constructor(
    private readonly token: string,
    private readonly chatId: string,
    private readonly timeoutMs: number,
    private readonly transport: typeof fetch = fetch,
    private readonly baseUrl = 'https://api.telegram.org',
  ) {}
  async send(message: NotificationMessage): Promise<void> {
    try {
      // Telegram receives only a staff summary: no visitor name, email, topic or credentials.
      const response = await this.transport(`${this.baseUrl}/bot${this.token}/sendMessage`, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: `${message.subject}\nReferência: ${message.deliveryId}`.slice(0, 1000),
        }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new NotificationError();
      }
      const body: unknown = await response.json();
      if (!body || typeof body !== 'object' || !('ok' in body) || body.ok !== true)
        throw new NotificationError();
    } catch {
      throw new NotificationError();
    }
  }
}
export class FakeNotificationSender implements NotificationSender {
  readonly simulated = true;
  readonly sent: string[] = [];
  constructor(readonly channel: NotificationChannel) {}
  async send(message: NotificationMessage): Promise<void> {
    this.sent.push(message.deliveryId);
  }
}
export function createNotificationSenders(config: WorkerConfig): NotificationSender[] {
  if (config.NOTIFICATION_MODE === 'fake' && config.NODE_ENV !== 'production')
    return [new FakeNotificationSender('smtp'), new FakeNotificationSender('telegram')];
  if (config.NOTIFICATION_MODE !== 'real') return [];
  const senders: NotificationSender[] = [];
  if (config.SMTP_HOST && config.SMTP_FROM) {
    const transport = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      requireTLS: !config.SMTP_SECURE,
      connectionTimeout: config.NOTIFICATION_HTTP_TIMEOUT_MS,
      greetingTimeout: config.NOTIFICATION_HTTP_TIMEOUT_MS,
      socketTimeout: config.NOTIFICATION_HTTP_TIMEOUT_MS,
      ...(config.SMTP_USER && config.SMTP_PASSWORD
        ? { auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD } }
        : {}),
    });
    senders.push(new SmtpNotificationSender(transport, config.SMTP_FROM));
  }
  if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID)
    senders.push(
      new TelegramNotificationSender(
        config.TELEGRAM_BOT_TOKEN,
        config.TELEGRAM_CHAT_ID,
        config.NOTIFICATION_HTTP_TIMEOUT_MS,
      ),
    );
  return senders;
}
