import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleVerifyEmailResend } from "./verify-email-resend";

vi.mock("../verification", () => ({
  createVerificationToken: vi.fn(),
}));
vi.mock("../email", () => ({
  sendVerificationEmail: vi.fn(),
}));

import { createVerificationToken } from "../verification";
import { sendVerificationEmail } from "../email";

function makeEnv(row: { id: string } | null) {
  const first = vi.fn().mockResolvedValue(row);
  const bind = vi.fn().mockReturnValue({ first });
  const prepare = vi.fn().mockReturnValue({ bind });
  return {
    env: { DB: { prepare }, APP_ORIGIN: "https://app.example.com" } as unknown as Parameters<typeof handleVerifyEmailResend>[1],
    prepare,
    bind,
    first,
  };
}

function req(body: unknown) {
  return new Request("http://localhost/verify-email/resend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createVerificationToken).mockResolvedValue("tok-123");
  vi.mocked(sendVerificationEmail).mockResolvedValue(undefined as never);
});

describe("handleVerifyEmailResend", () => {
  it("returns {sent:true} without querying when no email is given (no enumeration)", async () => {
    const { env, prepare } = makeEnv({ id: "user-1" });
    const res = await handleVerifyEmailResend(req({}), env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: { sent: boolean } };
    expect(json.data.sent).toBe(true);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("returns {sent:true} but sends nothing for an unknown/verified email", async () => {
    const { env } = makeEnv(null);
    const res = await handleVerifyEmailResend(req({ email: "ghost@example.com" }), env);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { sent: boolean } };
    expect(json.data.sent).toBe(true);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("mints a token and emails an unverified user (normalizing the address)", async () => {
    const { env, bind } = makeEnv({ id: "user-1" });
    const res = await handleVerifyEmailResend(req({ email: "  Test@Example.com " }), env);
    expect(res.status).toBe(200);
    expect(bind).toHaveBeenCalledWith("test@example.com");
    expect(createVerificationToken).toHaveBeenCalledWith(env, "user-1");
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      env,
      "test@example.com",
      "https://app.example.com/verify-email?token=tok-123",
    );
  });
});
