import type { Env } from "./index";

export async function sendVerificationEmail(
  env: Env,
  toEmail: string,
  verifyUrl: string,
): Promise<boolean> {
  try {
    await env.EMAIL.send({
      to: toEmail,
      from: "noreply@docs.cubityfir.st",
      subject: "Verify your Annex email address",
      text: [
        "Welcome to Annex!",
        "",
        "Did you create an account? If so, click the link below to verify your email address:",
        "",
        verifyUrl,
        "",
        "This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.",
      ].join("\n"),
      html: `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:480px;margin:40px auto;color:#111">
  <h2 style="margin-bottom:8px">Verify your email address</h2>
  <p>Welcome to Annex!</p>
  <p>Did you create an account? If so, click the button below to verify your email address.</p>
  <p style="margin:32px 0">
    <a href="${verifyUrl}"
       style="background:#000;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
      Verify email address
    </a>
  </p>
  <p style="color:#666;font-size:14px">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
  <p style="color:#999;font-size:12px">If the button doesn't work, copy and paste this link into your browser:<br>${verifyUrl}</p>
</body>
</html>`,
    });
    return true;
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    console.error("sendVerificationEmail failed", { code, err });
    return false;
  }
}
