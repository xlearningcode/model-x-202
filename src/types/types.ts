export type UserRole = 'user' | 'admin';

export interface Profile {
  id: string;
  email: string | null;
  role: UserRole;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  language_preference: string | null;
  theme_preference: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'model';
  content: string;
  type: 'text' | 'image' | 'video';
  created_at: string;
}

export interface ContentPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface ContentMessage {
  role: 'user' | 'model';
  parts: ContentPart[];
}
