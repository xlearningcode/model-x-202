import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  let input: string;
  let voice: string;
  let responseFormat: string;
  try {
    const body = await req.json();
    input = body.input;
    voice = body.voice ?? "heart";
    responseFormat = body.response_format ?? "mp3";
    if (!input) throw new Error("Missing input");
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

  const upstream = await fetch("https://app-cinpfjatarr5-api-GYX1lzGw01Xa.gateway.appmedo.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Gateway-Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input, voice, response_format: responseFormat }),
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const ext = responseFormat ?? "mp3";
  const filePath = `uploads/${crypto.randomUUID()}.${ext}`;

  const { data, error } = await supabase.storage
    .from("generated-media")
    .upload(filePath, upstream.body!, {
      contentType,
      cacheControl: "no-cache",
      duplex: "half",
    } as RequestInit & { cacheControl: string; upsert?: boolean });

  if (error) {
    return new Response(
      JSON.stringify({ error: `Storage upload failed: ${error.message}` }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  const { data: urlData } = supabase.storage.from("generated-media").getPublicUrl(filePath);

  return new Response(
    JSON.stringify({ audioUrl: urlData.publicUrl, path: data.path }),
    { status: 200, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
  );
});
