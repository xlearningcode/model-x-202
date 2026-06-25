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

  let fileUrl: string;
  let language: string | undefined;
  let responseFormat: string | undefined;

  try {
    const body = await req.json();
    fileUrl = body.fileUrl;
    if (!fileUrl) throw new Error("Missing fileUrl");
    language = body.language;
    responseFormat = body.responseFormat ?? "json";
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
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

  const params: Record<string, string> = {
    file: fileUrl,
    response_format: responseFormat ?? "json",
  };
  if (language) params.language = language;

  const upstream = await fetch("https://app-cinpfjatarr5-api-DY8MNQoqOnMa.gateway.appmedo.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Gateway-Authorization": `Bearer ${apiKey}`,
    },
    body: new URLSearchParams(params).toString(),
  });

  if (upstream.status === 429 || upstream.status === 402) {
    const errText = await upstream.text();
    return new Response(errText, {
      status: upstream.status,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  if (!upstream.ok) {
    return new Response(
      JSON.stringify({ error: `Upstream error: ${upstream.status}` }),
      { status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  const fmt = params.response_format;
  if (fmt === "text" || fmt === "srt" || fmt === "vtt") {
    const text = await upstream.text();
    return new Response(JSON.stringify({ text }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

  const data = await upstream.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
});
