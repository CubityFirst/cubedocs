export async function verifyTurnstile(token: string, secret: string): Promise<boolean> {
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });

  const data = await res.json<{ success: boolean }>();
  return data.success;
}
