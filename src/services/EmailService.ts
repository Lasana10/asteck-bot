import net from 'net';
import tls from 'tls';

type EmailPayload = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

type EmailResult = {
  success: boolean;
  error?: string;
};

function parsePort(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function base64(input: string) {
  return Buffer.from(input, 'utf8').toString('base64');
}

function smtpEscape(value: string) {
  return value.replace(/\r?\n/g, ' ');
}

export class EmailService {
  private static host = process.env.EMAIL_SMTP_SERVER || '';
  private static port = parsePort(process.env.EMAIL_SMTP_PORT, 587);
  private static user = process.env.EMAIL_SENDER_ADDRESS || '';
  private static password = process.env.EMAIL_APP_PASSWORD || '';
  private static from = process.env.EMAIL_FROM_NAME
    ? `"${smtpEscape(process.env.EMAIL_FROM_NAME)}" <${process.env.EMAIL_SENDER_ADDRESS}>`
    : process.env.EMAIL_SENDER_ADDRESS || '';

  static isConfigured() {
    return Boolean(this.host && this.port && this.user && this.password && this.from);
  }

  private static async readResponse(socket: net.Socket | tls.TLSSocket, allowMore = true): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = '';
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error('SMTP timeout'));
      }, 10000);

      const cleanup = () => {
        clearTimeout(timeout);
        socket.off('data', onData);
        socket.off('error', onError);
      };

      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };

      const onData = (chunk: Buffer) => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split(/\r?\n/).filter(Boolean);
        if (!lines.length) return;
        const lastLine = lines[lines.length - 1];
        if (/^\d{3} /.test(lastLine) || (!allowMore && /^\d{3}[- ]/.test(lastLine))) {
          cleanup();
          resolve(buffer);
        }
      };

      socket.on('data', onData);
      socket.on('error', onError);
    });
  }

  private static async sendCommand(socket: net.Socket | tls.TLSSocket, command: string, expectedCodes: number[]) {
    socket.write(`${command}\r\n`);
    const response = await this.readResponse(socket);
    const code = Number(response.slice(0, 3));
    if (!expectedCodes.includes(code)) {
      throw new Error(`SMTP command failed (${command}): ${response.trim()}`);
    }
    return response;
  }

  private static async upgradeToTls(socket: net.Socket): Promise<tls.TLSSocket> {
    return new Promise((resolve, reject) => {
      const secureSocket = tls.connect(
        {
          socket,
          servername: this.host,
        },
        () => resolve(secureSocket)
      );
      secureSocket.once('error', reject);
    });
  }

  static async sendMail(payload: EmailPayload): Promise<EmailResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Email SMTP credentials are not configured.' };
    }

    let socket: net.Socket | tls.TLSSocket | null = null;

    try {
      socket = await new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
        const onError = (error: Error) => reject(error);
        if (this.port === 465) {
          const secureSocket = tls.connect(
            { host: this.host, port: this.port, servername: this.host },
            () => resolve(secureSocket)
          );
          secureSocket.once('error', onError);
        } else {
          const plainSocket = net.createConnection({ host: this.host, port: this.port }, () => resolve(plainSocket));
          plainSocket.once('error', onError);
        }
      });

      const greeting = await this.readResponse(socket);
      if (!greeting.startsWith('220')) {
        throw new Error(`SMTP greeting failed: ${greeting.trim()}`);
      }

      await this.sendCommand(socket, 'EHLO afat.local', [250]);

      if (this.port !== 465) {
        await this.sendCommand(socket, 'STARTTLS', [220]);
        socket = await this.upgradeToTls(socket as net.Socket);
        await this.sendCommand(socket, 'EHLO afat.local', [250]);
      }

      await this.sendCommand(socket, 'AUTH LOGIN', [334]);
      await this.sendCommand(socket, base64(this.user), [334]);
      await this.sendCommand(socket, base64(this.password), [235]);
      await this.sendCommand(socket, `MAIL FROM:<${this.user}>`, [250]);
      await this.sendCommand(socket, `RCPT TO:<${payload.to}>`, [250, 251]);
      await this.sendCommand(socket, 'DATA', [354]);

      const boundary = `afat-${Date.now()}`;
      const htmlPart = payload.html
        ? [
            `--${boundary}`,
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: 7bit',
            '',
            payload.html,
          ].join('\r\n')
        : '';

      const message = [
        `From: ${this.from}`,
        `To: <${payload.to}>`,
        `Subject: ${smtpEscape(payload.subject)}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 7bit',
        '',
        payload.text,
        payload.html ? htmlPart : '',
        `--${boundary}--`,
        '',
        '.',
      ]
        .filter(Boolean)
        .join('\r\n');

      socket.write(message);
      const completion = await this.readResponse(socket);
      if (!completion.startsWith('250')) {
        throw new Error(`SMTP body rejected: ${completion.trim()}`);
      }

      await this.sendCommand(socket, 'QUIT', [221]);
      socket.end();
      return { success: true };
    } catch (error: any) {
      if (socket && !socket.destroyed) socket.destroy();
      return { success: false, error: error?.message || 'Email send failed.' };
    }
  }
}
