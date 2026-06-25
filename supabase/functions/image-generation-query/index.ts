import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

async function saveBase64ToStorage(markdownText: string): Promise<string> {
  const match = markdownText.match(/data:([^;]+);base64,([^)]+)/);
  if (!match) throw new Error("Could not parse Base64 image from response");

  const [, mimeType, base64Data] = match;
  const ext = mimeType.split("/")[1] ?? "jpg";
  const filePath = `uploads/${crypto.randomUUID()}.${ext}`;

  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const { error } = await supabase.storage
    .from("generated-images")
    .upload(filePath, bytes, { contentType: mimeType, upsert: false });

  if (error) throw error;

  const { data: urlData } = supabase.storage.from("generated-images").getPublicUrl(filePath);
  return urlData.publicUrl;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
  }

  let taskId: string;
  try {
    const body = await req.json();
    taskId = body.taskId;
    if (!taskId) throw new Error("Missing taskId");
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
    "https://app-cinpfjatarr5-api-GYX1lzGw0DQa.gateway.appmedo.com/image-generation/task",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ taskId }),
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

  const result = await upstream.json();

  if (result?.data?.status === "SUCCESS") {
    try {
      const markdownText = result.data.result.candidates[0].content.parts[0].text;
      const publicUrl = await saveBase64ToStorage(markdownText);
      result.data.imageUrl = publicUrl;
      result.data.result.candidates[0].content.parts[0].text = `![image](${publicUrl})`;
    } catch (storageErr) {
      console.error("Storage transfer failed:", storageErr);
    }
  }

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
});
