export interface UserSignInEmail {
  to: string;
  displayName: string;
  code: string;
  expiresMinutes: number;
  requestId: string;
}

export interface UserEmailSender {
  readonly configured: boolean;
  sendSignInCode(input: UserSignInEmail): Promise<void>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char] ?? char));
}

export class DisabledUserEmailSender implements UserEmailSender {
  readonly configured = false;
  async sendSignInCode(): Promise<void> {
    throw new Error("EMAIL_AUTH_NOT_CONFIGURED");
  }
}

export class ResendUserEmailSender implements UserEmailSender {
  readonly configured: boolean;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly replyTo?: string
  ) {
    this.configured = Boolean(apiKey.trim() && from.trim());
  }

  async sendSignInCode(input: UserSignInEmail): Promise<void> {
    if (!this.configured) throw new Error("EMAIL_AUTH_NOT_CONFIGURED");
    const safeName = escapeHtml(input.displayName);
    const safeCode = escapeHtml(input.code);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `nimcarry-login-${input.requestId}`,
      },
      body: JSON.stringify({
        from: this.from,
        to: [input.to],
        subject: "Your NimCarry sign-in code",
        text: `Hi ${input.displayName},\n\nYour NimCarry sign-in code is ${input.code}. It expires in ${input.expiresMinutes} minutes.\n\nIf you did not request this code, you can ignore this email.\n\nNimCarry`,
        html: `<div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#26221e"><p>Hi ${safeName},</p><p>Your NimCarry sign-in code is:</p><p style="font-size:32px;font-weight:800;letter-spacing:8px">${safeCode}</p><p>It expires in ${input.expiresMinutes} minutes.</p><p style="color:#6f665e">If you did not request this code, you can ignore this email.</p><p>NimCarry</p></div>`,
        ...(this.replyTo ? { reply_to: this.replyTo } : {}),
      }),
    });
    if (!response.ok) {
      throw new Error(`EMAIL_DELIVERY_FAILED_${response.status}`);
    }
  }
}

export class MemoryUserEmailSender implements UserEmailSender {
  readonly sent: UserSignInEmail[] = [];
  constructor(public readonly configured = true) {}
  async sendSignInCode(input: UserSignInEmail): Promise<void> {
    if (!this.configured) throw new Error("EMAIL_AUTH_NOT_CONFIGURED");
    this.sent.push({ ...input });
  }
}

export function createUserEmailSender(env: NodeJS.ProcessEnv = process.env): UserEmailSender {
  const apiKey = env.RESEND_API_KEY?.trim() ?? "";
  const from = env.NIMCARRY_EMAIL_FROM?.trim() ?? "";
  if (!apiKey || !from) return new DisabledUserEmailSender();
  return new ResendUserEmailSender(apiKey, from, env.NIMCARRY_EMAIL_REPLY_TO?.trim() || undefined);
}
