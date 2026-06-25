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

  let targetUrl: string;
  let returnFormat: string | undefined;
  let withImagesSummary: boolean | undefined;
  let withLinksSummary: boolean | undefined;
  let targetSelector: string | undefined;
  let removeSelector: string | undefined;
  let timeout: number | undefined;
  let noCache: boolean | undefined;

  try {
    const body = await req.json();
    targetUrl = body.url;
    if (!targetUrl) throw new Error("Missing url");
    returnFormat = body.returnFormat;
    withImagesSummary = body.withImagesSummary;
    withLinksSummary = body.withLinksSummary;
    targetSelector = body.targetSelector;
    removeSelector = body.removeSelector;
    timeout = body.timeout;
    noCache = body.noCache;
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

  const upstreamHeaders: Record<string, string> = {
    "X-Gateway-Authorization": `Bearer ${apiKey}`,
  };
  if (returnFormat) upstreamHeaders["X-Return-Format"] = returnFormat;
  if (withImagesSummary !== undefined) {
    upstreamHeaders["X-With-Images-Summary"] = String(withImagesSummary);
  }
  if (withLinksSummary !== undefined) {
    upstreamHeaders["X-With-Links-Summary"] = String(withLinksSummary);
  }
  if (targetSelector) upstreamHeaders["X-Target-Selector"] = targetSelector;
  if (removeSelector) upstreamHeaders["X-Remove-Selector"] = removeSelector;
  if (timeout !== undefined) upstreamHeaders["X-Timeout"] = String(timeout);
  if (noCache) upstreamHeaders["X-No-Cache"] = "true";

  const encodedUrl = encodeURIComponent(targetUrl);
  const upstream = await fetch(
    `https://api-ELbWqODdAgNY@36oqjsxjo775h3odjp3eev3y740deicu.lambda-url.us-west-2.on.aws/${encodedUrl}`,
    { method: "GET", headers: upstreamHeaders }
  );

  if (upstream.status === 401 || upstream.status === 403) {
    const errText = await upstream.text();
    return new Response(JSON.stringify({ error: errText || `Upstream error: ${upstream.status}` }), {
      status: upstream.status,
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  }

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

  const content = await upstream.text();
  return new Response(JSON.stringify({ content }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
});
