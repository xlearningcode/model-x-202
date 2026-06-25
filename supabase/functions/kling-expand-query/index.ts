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

async function streamImageToStorage(
  imageUrl: string,
  bucketName: string
): Promise<{ success: true; publicUrl: string } | { success: false; error: string }> {
  try {
    new URL(imageUrl);
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    const ext = contentType.split("/")[1]?.split(";")[0] ?? "jpg";
    const filePath = `uploads/${crypto.randomUUID()}.${ext}`;

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, response.body!, { contentType, cacheControl: "no-cache", upsert: false });

    if (error) throw error;

    const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(data.path);
    return { success: true, publicUrl: urlData.publicUrl };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
  }

  let task_id: string;
  try {
    const body = await req.json();
    task_id = body.task_id;
    if (!task_id) throw new Error("Missing task_id");
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
    `https://app-cinpfjatarr5-api-AalZkkAG5w7L.gateway.appmedo.com/v1/images/editing/expand/${task_id}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Gateway-Authorization": `Bearer ${apiKey}`,
      },
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

  const responseJson = await upstream.json();

  if (
    responseJson.code === 0 &&
    responseJson.data?.task_status === "succeed" &&
    Array.isArray(responseJson.data?.task_result?.images)
  ) {
    const transferredImages = await Promise.all(
      responseJson.data.task_result.images.map(
        async (img: { index: number; url: string }) => {
          const transfer = await streamImageToStorage(img.url, "generated-media");
          return {
            ...img,
            url: transfer.success ? transfer.publicUrl : img.url,
          };
        }
      )
    );
    responseJson.data.task_result.images = transferredImages;
  }

  return new Response(JSON.stringify(responseJson), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
});
