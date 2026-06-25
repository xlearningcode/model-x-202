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

async function streamVideoToStorage(
  videoUrl: string,
  bucketName: string
): Promise<{ success: true; publicUrl: string } | { success: false; error: string }> {
  try {
    new URL(videoUrl);
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

    const contentType = response.headers.get("content-type") ?? "video/mp4";
    const ext = contentType.split("/")[1]?.split(";")[0] ?? "mp4";
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

  let taskId: string;
  try {
    const body = await req.json();
    taskId = body.task_id ?? body.external_task_id;
    if (!taskId) throw new Error("Missing task_id or external_task_id");
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
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
    `https://app-cinpfjatarr5-api-rLobzpqX85m9.gateway.appmedo.com/v1/videos/image2video/${taskId}`,
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

  const responseData = await upstream.json();

  if (
    responseData.code === 0 &&
    responseData.data?.task_status === "succeed" &&
    responseData.data?.task_result?.videos?.length > 0
  ) {
    const videos = responseData.data.task_result.videos as {
      id: string;
      url: string;
      duration: string;
    }[];

    const transferredVideos = await Promise.all(
      videos.map(async (video) => {
        const transfer = await streamVideoToStorage(video.url, "generated-media");
        return {
          ...video,
          url: transfer.success ? transfer.publicUrl : video.url,
          ...(transfer.success ? {} : { _transfer_error: transfer.error }),
        };
      })
    );

    responseData.data.task_result.videos = transferredVideos;
  }

  return new Response(JSON.stringify(responseData), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
});
