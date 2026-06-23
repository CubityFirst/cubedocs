import { describe, it, expect, vi } from "vitest";
import { handleAi } from "./ai";

function req(body: unknown) {
  return new Request("http://localhost/ai/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeEnv(getBooleanValue?: ReturnType<typeof vi.fn>) {
  const prepare = vi.fn();
  return {
    env: {
      DB: { prepare },
      FLAGS: getBooleanValue ? { getBooleanValue } : undefined,
    } as unknown as Parameters<typeof handleAi>[1],
    prepare,
  };
}

const user = { userId: "user-1", email: "a@example.com" } as unknown as Parameters<typeof handleAi>[2];

describe("handleAi ai-summaries killswitch", () => {
  it("refuses summarize with 503 when the ai-summaries flag is off, before any DB work", async () => {
    const getBooleanValue = vi.fn().mockResolvedValue(false);
    const { env, prepare } = makeEnv(getBooleanValue);

    const res = await handleAi(req({ docId: "doc-1" }), env, user, new URL("http://localhost/ai/summarize"));

    expect(res.status).toBe(503);
    const body = await res.json<{ ok: boolean; error: string }>();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("ai_disabled");
    expect(getBooleanValue).toHaveBeenCalledWith("ai-summaries", true);
    // Killswitch short-circuits before fetching the doc / calling OpenAI.
    expect(prepare).not.toHaveBeenCalled();
  });
});
