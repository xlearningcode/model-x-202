import ky, { type AfterResponseHook } from "ky";
import { createParser } from "eventsource-parser";

export interface SSEOptions {
  onData: (data: string) => void;
  onEvent?: (event: unknown) => void;
  onCompleted?: (error?: Error) => void;
  onAborted?: () => void;
}

export function createSSEHook(options: SSEOptions): AfterResponseHook {
  return async (request, _opts, response) => {
    if (!response.ok || !response.body) return;

    let done = false;
    const finish = (err?: Error) => {
      if (!done) { done = true; options.onCompleted?.(err); }
    };

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf8");
    const parser = createParser({
      onEvent: (event) => {
        if (!event.data) return;
        options.onEvent?.(event);
        for (const chunk of event.data.split("\n")) options.onData(chunk);
      },
    });

    const read = (): void => {
      reader.read().then(({ done: streamDone, value }) => {
        if (streamDone) { finish(); return; }
        parser.feed(decoder.decode(value, { stream: true }));
        read();
      }).catch((err) => {
        if (request.signal.aborted) { options.onAborted?.(); return; }
        finish(err as Error);
      });
    };
    read();
    return response;
  };
}

export interface StreamRequestOptions {
  functionUrl: string;
  requestBody: unknown;
  supabaseAnonKey: string;
  onData: (data: string) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
}

export async function sendStreamRequest(options: StreamRequestOptions): Promise<void> {
  const { functionUrl, requestBody, supabaseAnonKey, onData, onComplete, onError, signal } = options;

  const sseHook = createSSEHook({
    onData,
    onCompleted: (err) => (err ? onError(err) : onComplete()),
    onAborted: () => console.log("Stream aborted"),
  });

  try {
    const response = await ky.post(functionUrl, {
      json: requestBody,
      headers: {
        Authorization: `Bearer ${supabaseAnonKey}`,
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
      },
      signal,
      throwHttpErrors: false,
      hooks: { afterResponse: [sseHook] },
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const wait = retryAfter ? parseInt(retryAfter, 10) : 60;
      onError(new Error(`Rate limit reached. Please wait ${wait}s before sending another message.`));
      return;
    }
    if (response.status === 402) {
      onError(new Error('Insufficient balance on AI service. Please try again later.'));
      return;
    }
    if (!response.ok) {
      onError(new Error(`Request failed with status ${response.status}`));
      return;
    }
  } catch (err) {
    if (!signal?.aborted) onError(err as Error);
  }
}
