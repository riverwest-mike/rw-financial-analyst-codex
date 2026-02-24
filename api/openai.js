export default async function handler(req, res) {
  // 1) A "ping" endpoint so the UI can show key status
  if (req.method === "GET" && req.query?.ping) {
    return res.status(200).json({ ok: Boolean(process.env.OPENAI_API_KEY) });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: { message: "OPENAI_API_KEY is missing in Vercel Environment Variables." }
    });
  }

  try {
    const { system, input } = req.body || {};
    if (!system || !input) {
      return res.status(400).json({
        error: { message: "Missing required fields: system, input" }
      });
    }

    // OpenAI Responses API expects content parts like:
    // - {type:"input_text", text:"..."}
    // - {type:"input_file", filename:"...", file_data:"data:application/pdf;base64,...."} :contentReference[oaicite:9]{index=9}
    //
    // We'll inject your system instructions as a "developer" message before the user/assistant history.
    const finalInput = [
      { role: "developer", content: [{ type: "input_text", text: system }] },
      ...input
    ];

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-5",
        input: finalInput,
        max_output_tokens: 4000
      })
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({
        error: data?.error || { message: "OpenAI API error", raw: data }
      });
    }

    // Responses API commonly exposes a convenience field output_text in docs/examples. :contentReference[oaicite:10]{index=10}
    const text = data.output_text || "";

    // To preserve conversation state across turns, we return an assistant message
    // that the browser can append back into state.history.
    // OpenAI docs show re-sending prior user+assistant turns to keep context. :contentReference[oaicite:11]{index=11}
    const assistant_message = {
      role: "assistant",
      content: [{ type: "input_text", text }]
    };

    return res.status(200).json({ text, assistant_message });

  } catch (err) {
    return res.status(500).json({
      error: { message: err.message || "Unknown server error" }
    });
  }
}
