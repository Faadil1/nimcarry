export interface LoginCodeEmail {
  to: string;
  code: string;
  expiresAt: number;
}

export interface UserEmailSender {
  readonly available: boolean;
  sendLoginCode(input: LoginCodeEmail): Promise<void>;
}

export class DisabledUserEmailSender implements UserEmailSender {
  readonly available = false;
  async sendLoginCode(): Promise<void> {
    throw new Error("EMAIL_DELIVERY_NOT_CONFIGURED");
  }
}

export class ResendUserEmailSender implements UserEmailSender {
  readonly available: boolean;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    this.available = Boolean(apiKey.trim() && from.trim());
  }

  async sendLoginCode(input: LoginCodeEmail): Promise<void> {
    if (!this.available) throw new Error("EMAIL_DELIVERY_NOT_CONFIGURED");
    const minutes = Math.max(1, Math.ceil((input.expiresAt - Date.now()) / 60_000));
    const subject = "Your NimCarry sign-in code";
    const text = [
      "Your NimCarry sign-in code:",
      "",
      input.code,
      "",
      `This code expires in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      "If you did not request this code, you can ignore this email.",
    ].join("\n");
    const html = `<!doctype html>
<html>
  <body style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5efe4;color:#173f36;padding:28px">
    <div style="max-width:520px;margin:auto;background:#fffaf0;border:1px solid #d8cbbb;border-radius:20px;padding:28px">
      <div style="font-size:12px;text-transform:uppercase;letter-spacing:.14em;font-weight:700">NimCarry · Returning user</div>
      <h1 style="font-size:28px;margin:14px 0 8px">Your sign-in code</h1>
      <p style="line-height:1.55">Use this code to restore your existing NimCarry profile.</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:.2em;background:#efe5d6;border-radius:14px;padding:16px 18px;text-align:center;margin:20px 0">${input.code}</div>
      <p style="font-size:14px;line-height:1.55">This code expires in ${minutes} minute${minutes === 1 ? "" : "s"}. If you did not request it, you can ignore this email.</p>
    </div>
  </body>
</html>`;

    const response = await this.fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [input.to],
        subject,
        text,
        html,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`EMAIL_DELIVERY_FAILED:${response.status}:${detail.slice(0, 240)}`);
    }
  }
}

export function createUserEmailSender(env: NodeJS.ProcessEnv = process.env): UserEmailSender {
  const apiKey = env.RESEND_API_KEY?.trim() ?? "";
  const from = env.NIMCARRY_EMAIL_FROM?.trim() ?? "";
  if (!apiKey || !from) return new DisabledUserEmailSender();
  return new ResendUserEmailSender(apiKey, from);
}
