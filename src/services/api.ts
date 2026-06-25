import { supabase } from '@/db/supabase';
import type { Conversation, Message } from '@/types/types';

const functionsBaseUrl = import.meta.env.VITE_FUNCTIONS_BASE_URL;

export async function getConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createConversation(title = 'New Chat'): Promise<Conversation> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  // Ensure profile exists (new DB may not have run the trigger for existing users)
  await supabase.from('profiles').upsert(
    { id: user.id, email: user.email, username: user.email?.split('@')[0] },
    { onConflict: 'id', ignoreDuplicates: true }
  );
  const { data, error } = await supabase
    .from('conversations')
    .insert({ title, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateConversation(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .update({ title })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function saveMessage(
  conversationId: string,
  role: 'user' | 'model',
  content: string,
  type: 'text' | 'image' | 'video' = 'text'
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, role, content, type })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function submitImageGeneration(contents: unknown[]) {
  const res = await fetch(`${functionsBaseUrl}/functions/v1/image-generation-submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents }),
  });
  if (res.status === 429) {
    const err = await res.json();
    throw new Error(`Quota exceeded: ${err.message ?? res.statusText}`);
  }
  if (res.status === 402) {
    const err = await res.json();
    throw new Error(`Insufficient balance: ${err.message ?? res.statusText}`);
  }
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const json = await res.json();
  if (json.status !== 0) throw new Error(json.message || 'Image generation failed');
  return json.data;
}

export async function queryImageGeneration(taskId: string) {
  const res = await fetch(`${functionsBaseUrl}/functions/v1/image-generation-query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId }),
  });
  if (res.status === 429) {
    const err = await res.json();
    throw new Error(`Quota exceeded: ${err.message ?? res.statusText}`);
  }
  if (res.status === 402) {
    const err = await res.json();
    throw new Error(`Insufficient balance: ${err.message ?? res.statusText}`);
  }
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const json = await res.json();
  return json.data;
}

export async function transcribeAudio(fileUrl: string, language?: string) {
  const res = await fetch(`${functionsBaseUrl}/functions/v1/speech-to-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileUrl, language, responseFormat: 'json' }),
  });
  if (res.status === 429) {
    const err = await res.json();
    throw new Error(`Quota exhausted: ${err.message ?? res.statusText}`);
  }
  if (res.status === 402) {
    const err = await res.json();
    throw new Error(`Insufficient balance: ${err.message ?? res.statusText}`);
  }
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return await res.json() as { text: string };
}

export async function fetchTextToSpeech(input: string, voice = 'heart', responseFormat = 'mp3') {
  const res = await fetch(`${functionsBaseUrl}/functions/v1/text-to-speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, voice, response_format: responseFormat }),
  });
  if (res.status === 429) {
    const err = await res.json();
    throw new Error(`Quota exhausted: ${err.message ?? res.statusText}`);
  }
  if (res.status === 402) {
    const err = await res.json();
    throw new Error(`Insufficient balance: ${err.message ?? res.statusText}`);
  }
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return await res.json() as { audioUrl: string; path: string };
}

// Kling Image Expansion
export async function submitKlingExpand(params: Record<string, unknown>) {
  const res = await fetch(`${functionsBaseUrl}/functions/v1/kling-expand-create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message || 'Expansion failed');
  return json.data;
}

export async function queryKlingExpand(taskId: string) {
  const res = await fetch(`${functionsBaseUrl}/functions/v1/kling-expand-query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId }),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message || 'Query failed');
  return json.data;
}

// Kling Image-to-Video
export async function submitKlingImage2Video(params: Record<string, unknown>) {
  const res = await fetch(`${functionsBaseUrl}/functions/v1/kling-submit-image2video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message || 'Video submission failed');
  return json.data;
}

export async function queryKlingImage2Video(taskId: string) {
  const res = await fetch(`${functionsBaseUrl}/functions/v1/kling-query-image2video`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId }),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message || 'Video query failed');
  return json.data;
}

// Kling Omni Video
export async function queryKlingOmniVideo(taskId: string) {
  const res = await fetch(`${functionsBaseUrl}/functions/v1/kling-omni-video-query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_id: taskId }),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message || 'Omni video query failed');
  return json.data;
}

export async function submitKlingOmniVideo(params: Record<string, unknown>) {
  const res = await fetch(`${functionsBaseUrl}/functions/v1/kling-omni-video-submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message || 'Omni video submission failed');
  return json.data;
}

// Web Reader
export async function fetchWebReader(url: string, options?: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${functionsBaseUrl}/functions/v1/web-reader`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, ...options }),
  });
  if (res.status === 429) {
    const err = await res.json();
    throw new Error(`Quota exhausted: ${err.message ?? res.statusText}`);
  }
  if (res.status === 402) {
    const err = await res.json();
    throw new Error(`Insufficient balance: ${err.message ?? res.statusText}`);
  }
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  const json = await res.json();
  if (!json.content) throw new Error('Response content is empty');
  return json.content;
}
