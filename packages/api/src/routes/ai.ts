import { okResponse, errorResponse, Errors, type Session } from "../lib";
import type { Env } from "../index";

export async function handleAi(
  request: Request,
  env: Env,
  user: Session,
  url: URL,
): Promise<Response> {
  const action = url.pathname.replace(/^\/ai\/?/, "").split("/")[0];

  if (action === "summarize" && request.method === "POST") {
    const body = await request.json<{ docId: string }>();
    if (!body.docId) return errorResponse(Errors.BAD_REQUEST);

    // Get doc and verify membership in one query
    const doc = await env.DB.prepare(
      `SELECT d.id, d.title, d.project_id, d.updated_at, d.ai_summary, d.ai_summary_version
       FROM docs d
       INNER JOIN project_members pm ON pm.project_id = d.project_id
       WHERE d.id = ? AND pm.user_id = ?`,
    ).bind(body.docId, user.userId).first<{
      id: string;
      title: string;
      project_id: string;
      updated_at: string;
      ai_summary: string | null;
      ai_summary_version: string | null;
    }>();
    if (!doc) return errorResponse(Errors.NOT_FOUND);

    // Verify AI is enabled for this project
    const project = await env.DB.prepare("SELECT ai_enabled FROM projects WHERE id = ?")
      .bind(doc.project_id).first<{ ai_enabled: number }>();
    if (!project?.ai_enabled) return errorResponse(Errors.FORBIDDEN);

    // Return cached summary if the doc hasn't changed since it was generated
    if (doc.ai_summary && doc.ai_summary_version === doc.updated_at) {
      return okResponse({ summary: doc.ai_summary });
    }

    // Fetch doc content from R2
    const obj = await env.ASSETS.get(`${doc.project_id}/${doc.id}`);
    const content = obj ? await obj.text() : "";

    if (!content.trim()) {
      return okResponse({ summary: "This document has no content to summarise." });
    }

    // Call OpenAI
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5.4-nano",
        messages: [
          {
            role: "system",
            content:
              "You are a documentation assistant. Summarise the following document in 1–3 short bullet points using markdown. Focus on the key purpose, main topics, and any important details. Keep the total response under 100 words.",
          },
          {
            role: "user",
            content: `Title: ${doc.title}\n\n${content.slice(0, 8000)}`,
          },
        ],
        max_completion_tokens: 200,
      }),
    });

    if (!openaiRes.ok) {
      const errBody = await openaiRes.text().catch(() => "(unreadable)");
      console.error(`OpenAI error ${openaiRes.status}: ${errBody}`);
      return errorResponse(Errors.INTERNAL);
    }

    const openaiData = await openaiRes.json<{ choices: { message: { content: string } }[] }>();
    const summary = openaiData.choices?.[0]?.message?.content?.trim() ?? "";

    // Cache the summary against the current doc version
    await env.DB.prepare(
      "UPDATE docs SET ai_summary = ?, ai_summary_version = ? WHERE id = ?",
    ).bind(summary, doc.updated_at, doc.id).run();

    return okResponse({ summary });
  }

  return errorResponse(Errors.NOT_FOUND);
}
