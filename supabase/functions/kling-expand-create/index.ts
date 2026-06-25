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

  let image: string;
  let up_expansion_ratio: number;
  let down_expansion_ratio: number;
  let left_expansion_ratio: number;
  let right_expansion_ratio: number;
  let restParams: Record<string, unknown>;

  try {
    const body = await req.json();
    image = body.image;
    up_expansion_ratio = body.up_expansion_ratio;
    down_expansion_ratio = body.down_expansion_ratio;
    left_expansion_ratio = body.left_expansion_ratio;
    right_expansion_ratio = body.right_expansion_ratio;

    if (!image) throw new Error("Missing image");
    if (up_expansion_ratio === undefined) throw new Error("Missing up_expansion_ratio");
    if (down_expansion_ratio === undefined) throw new Error("Missing down_expansion_ratio");
    if (left_expansion_ratio === undefined) throw new Error("Missing left_expansion_ratio");
    if (right_expansion_ratio === undefined) throw new Error("Missing right_expansion_ratio");

    const { image: _img, up_expansion_ratio: _u, down_expansion_ratio: _d,
            left_expansion_ratio: _l, right_expansion_ratio: _r, ...rest } = body;
    restParams = rest;
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

  const upstream = await fetch(
    "https://app-cinpfjatarr5-api-GYX1bbkRQj4a.gateway.appmedo.com/v1/images/editing/expand",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        image,
        up_expansion_ratio,
        down_expansion_ratio,
        left_expansion_ratio,
        right_expansion_ratio,
        ...restParams,
      }),
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
    return new Response(
      JSON.stringify({ error: `Upstream error: ${upstream.status}` }),
      { status: 502, headers: { "Content-Type": "application/json", ...CORS_HEADERS } }
    );
  }

  const data = await upstream.json();
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
});
