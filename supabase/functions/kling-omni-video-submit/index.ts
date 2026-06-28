import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
  }

  let requestBody: Record<string, unknown>;
  try {
    requestBody = await req.json();
    if (!requestBody.multi_shot && !requestBody.prompt) {
      throw new Error("Missing prompt (required for single-shot mode)");
    }
    if (requestBody.multi_shot && !requestBody.multi_prompt) {
      throw new Error("Missing multi_prompt (required for multi-shot mode)");
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const apiKey = Deno.env.get("INTEGRATIONS_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server configuration error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  // Ensure model_name is always set — gateway requires it explicitly
  if (!requestBody.model_name) {
    requestBody = { model_name: "kling-v3-omni", ...requestBody };
  }

  const upstream = await fetch(
    "https://app-cinpfjatarr5-api-k93RvqRrRZba.gateway.appmedo.com/v1/videos/omni-video",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (upstream.status === 429 || upstream.status === 402) {
    const errText = await upstream.text();
    return new Response(errText, {
      status: upstream.status,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  if (!upstream.ok) {
    // Forward the actual upstream error body so the client can show a meaningful message
    const errText = await upstream.text();
    return new Response(
      JSON.stringify({ error: `Upstream error: ${upstream.status}`, detail: errText }),
      { status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  const data = await upstream.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
});
