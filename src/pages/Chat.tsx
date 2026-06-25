import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/db/supabase';
import { sendStreamRequest } from '@/lib/sse';
import {
  getConversations,
  createConversation,
  updateConversation,
  deleteConversation,
  getMessages,
  saveMessage,
  submitImageGeneration,
  queryImageGeneration,
  transcribeAudio,
  fetchTextToSpeech,
  submitKlingOmniVideo,
  queryKlingOmniVideo,
  submitKlingImage2Video,
  queryKlingImage2Video,
  fetchWebReader,
} from '@/services/api';
import type { Conversation, Message, ContentMessage } from '@/types/types';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Loader2,
  Send,
  Image as ImageIcon,
  Wand2,
  Plus,
  Trash2,
  Pencil,
  Menu,
  LogOut,
  MoreHorizontal,
  X,
  User,
  MessageSquare,
  ChevronDown,
  Mic,
  Volume2,
  Square,
  Globe,
  Sun,
  Moon,
  ThumbsUp,
  ThumbsDown,
  Copy,
  Download,
  Video,
  Clapperboard,
  Search,
  ExternalLink,
  Crown,
  Settings,
  Shield,
} from 'lucide-react';
import { useTheme } from 'next-themes';

const functionsBaseUrl = import.meta.env.VITE_FUNCTIONS_BASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const FREE_MSG_LIMIT = 50;
const FREE_IMG_LIMIT = 3;

interface DailyUsage {
  message_count: number;
  image_count: number;
}

const Chat: React.FC = () => {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [mode, setMode] = useState<'chat' | 'image' | 'video-text' | 'video-image' | 'search'>('chat');
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [messageSources, setMessageSources] = useState<Record<string, { uri: string; title: string }[]>>({});
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [likedMessages, setLikedMessages] = useState<Set<string>>(new Set());
  const [dislikedMessages, setDislikedMessages] = useState<Set<string>>(new Set());
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [uploadedImageMime, setUploadedImageMime] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [detectedLanguage, setDetectedLanguage] = useState<string>('Auto');
  // Usage limits
  const [userPlan, setUserPlan] = useState<'free' | 'monthly' | 'yearly'>('free');
  const [dailyUsage, setDailyUsage] = useState<DailyUsage>({ message_count: 0, image_count: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/');
      return;
    }
    loadConversations();
    loadPlanAndUsage();
  }, [user]);

  useEffect(() => {
    if (activeConversation) {
      loadMessages(activeConversation);
    } else {
      setMessages([]);
    }
  }, [activeConversation]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isStreaming]);

  const loadPlanAndUsage = async () => {
    if (!user) return;
    try {
      const [{ data: sub }, { data: usage, error: usageErr }] = await Promise.all([
        supabase.from('subscriptions').select('plan, status').eq('user_id', user.id).maybeSingle(),
        supabase.rpc('get_today_usage', { p_user_id: user.id }),
      ]);
      const plan = (sub?.plan ?? 'free') as 'free' | 'monthly' | 'yearly';
      setUserPlan(plan);
      if (!usageErr && usage) setDailyUsage({ message_count: usage.message_count ?? 0, image_count: usage.image_count ?? 0 });
    } catch {
      // silently keep defaults
    }
  };

  const isPro = userPlan === 'monthly' || userPlan === 'yearly';

  const incrementUsage = async (type: 'message' | 'image') => {
    if (!user || isPro) return;
    try {
      const { data } = await supabase.rpc('increment_usage', { p_user_id: user.id, p_type: type });
      if (data) setDailyUsage({ message_count: data.message_count, image_count: data.image_count });
    } catch {
      // non-blocking
    }
  };

  const checkMsgLimit = (): boolean => {
    if (isPro) return true;
    if (dailyUsage.message_count >= FREE_MSG_LIMIT) {
      toast.error(
        `Daily limit reached (${FREE_MSG_LIMIT} messages). Upgrade to Pro for unlimited access.`,
        { action: { label: 'Upgrade', onClick: () => navigate('/pricing') }, duration: 6000 }
      );
      return false;
    }
    return true;
  };

  const checkImgLimit = (): boolean => {
    if (isPro) return true;
    if (dailyUsage.image_count >= FREE_IMG_LIMIT) {
      toast.error(
        `Daily image limit reached (${FREE_IMG_LIMIT} images). Upgrade to Pro for unlimited generations.`,
        { action: { label: 'Upgrade', onClick: () => navigate('/pricing') }, duration: 6000 }
      );
      return false;
    }
    return true;
  };

  const loadConversations = async () => {
    try {
      setIsLoadingConversations(true);
      const data = await getConversations();
      setConversations(data);
      if (data.length > 0 && !activeConversation) {
        setActiveConversation(data[0].id);
      }
    } catch (err: any) {
      toast.error('Failed to load conversations');
    } finally {
      setIsLoadingConversations(false);
    }
  };

  const loadMessages = async (conversationId: string) => {
    try {
      const data = await getMessages(conversationId);
      setMessages(data);
    } catch (err: any) {
      toast.error('Failed to load messages');
    }
  };

  const handleNewChat = async () => {
    try {
      const conv = await createConversation();
      setConversations((prev) => [conv, ...prev]);
      setActiveConversation(conv.id);
      setMessages([]);
    } catch (err: any) {
      toast.error('Failed to create conversation');
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversation === id) {
        setActiveConversation(null);
        setMessages([]);
      }
    } catch (err: any) {
      toast.error('Failed to delete conversation');
    }
  };

  const handleRenameConversation = async (id: string) => {
    if (!editTitle.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await updateConversation(id, editTitle.trim());
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: editTitle.trim() } : c))
      );
      setEditingId(null);
    } catch (err: any) {
      toast.error('Failed to rename conversation');
    }
  };

  const detectLanguage = (text: string): string => {
    if (/[\u4e00-\u9fff]/.test(text)) return 'Chinese';
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'Japanese';
    if (/[\uac00-\ud7af]/.test(text)) return 'Korean';
    if (/[\u0600-\u06ff]/.test(text)) return 'Arabic';
    if (/[\u0400-\u04ff]/.test(text)) return 'Russian';
    if (/[\u0900-\u097f]/.test(text)) return 'Hindi';
    if (/[\u0980-\u09ff]/.test(text)) return 'Bengali';
    if (/[\u0e00-\u0e7f]/.test(text)) return 'Thai';

    // Banglish detection: common Bangla words romanised
    const banglishWords = [
      'tumi','tui','apni','ami','ame','amra','amar','tomar','apnar',
      'kamon','kemon','aso','acho','achen','achi','acchi','ache',
      'ki','kি','na','haa','haan','hna','nah','boro','choto','bhalo',
      'valo','valo achi','khub','onek','beshi','kom','kore','koro',
      'korte','korbo','korechi','korle','dao','dao na','dao to','den',
      'jao','jabo','gesi','gechi','giyechi','asha','ashbo','asho',
      'bolo','bolen','bolchi','bolte','bolbo','shunte','shuno',
      'dekho','dekha','dekhte','dekhbo','dekhechi','bhai','apu',
      'didi','mama','chacha','baba','maa','khawa','khaoa','khaowa',
      'pani','pani dao','bhat','roti','dim','mach','mangsho',
      'thako','thakbo','thakbo na','jani','jano','janen',
      'bujhte','bujhechi','bojha','hoye','hobe','hoyeche',
      'bhalo achi','kemon acho','kemon aso','tumi kemon',
      'ki koro','ki korcho','ki korben','ki bolcho',
      'amar nam','tomar nam','apnar nam',
    ];
    const lower = text.toLowerCase();
    const wordCount = banglishWords.filter((w) => lower.includes(w)).length;
    if (wordCount >= 1) return 'Bengali';

    if (/[\u00e0\u00e1\u1ea1\u1ea3\u00e3\u00e2\u1ea7\u1ea5\u1ead\u1ea9\u1eab\u0103\u1eb1\u1eaf\u1eb7\u1eb3\u1eb5\u00e8\u00e9\u1eb9\u1ebb\u1ebd\u00ea\u1ec1\u1ebf\u1ec7\u1ec3\u1ec5\u00ec\u00ed\u1ecb\u1ec9\u0129]/.test(text)) return 'Vietnamese';
    if (/[\u00e9\u00e8\u00ea\u00eb\u00e0\u00e2\u00e4\u00f9\u00fb\u00fc\u00f4\u00f6\u00e7\u00ef\u00ee]/.test(text) && /\b(je|tu|il|nous|vous|ils|le|la|les|et|ou|mais|donc|car|ni|or)\b/gi.test(text)) return 'French';
    if (/[\u00e1\u00e9\u00ed\u00f3\u00fa\u00f1\u00bf\u00a1]/.test(text) || /\b(el|la|los|las|un|una|y|o|pero|porque|que|como|cuando|donde|qui\u00e9n|qu\u00e9)\b/gi.test(text)) return 'Spanish';
    if (/[\u00e4\u00f6\u00fc\u00df]/.test(text) || /\b(der|die|das|ein|eine|und|oder|aber|weil|wenn|was|wer|wie|wo|wann)\b/gi.test(text)) return 'German';
    if (/\b(o|a|os|as|um|uma|e|ou|mas|porque|que|como|quando|onde|quem|qual)\b/gi.test(text)) return 'Portuguese';
    return 'English';
  };

  const buildHistory = useCallback(
    (currentMessages: Message[]): ContentMessage[] => {
      return currentMessages.map((m) => ({
        role: m.role,
        parts: [{ text: m.content }],
      }));
    },
    []
  );

  const generateTitle = (text: string): string => {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean.length <= 30) return clean || 'New Chat';
    return clean.slice(0, 27) + '...';
  };

  const [retryInfo, setRetryInfo] = useState<string | null>(null);

  const sendWithRetry = async (options: Parameters<typeof sendStreamRequest>[0], maxRetries = 3) => {
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        await sendStreamRequest(options);
        setRetryInfo(null);
        return;
      } catch (err: any) {
        const is429 = err?.message?.includes('429') || err?.response?.status === 429;
        if (is429 && attempt < maxRetries) {
          const delay = Math.pow(2, attempt + 1) * 1000; // 2s, 4s, 8s
          const msg = `Service is busy, retrying in ${delay / 1000}s... (${attempt + 1}/${maxRetries})`;
          setRetryInfo(msg);
          toast.info(msg, { id: 'rate-limit-retry' });
          await new Promise((r) => setTimeout(r, delay));
          attempt++;
        } else {
          setRetryInfo(null);
          if (is429) {
            throw new Error('Service temporarily unavailable. Please try again in a few minutes.');
          }
          throw err;
        }
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() && !uploadedImage) return;
    // Enforce daily message limit for free users
    if (!checkMsgLimit()) return;

    // Auto-create conversation if none is active
    let convId = activeConversation;
    let isNewConv = false;
    if (!convId) {
      try {
        const conv = await createConversation();
        convId = conv.id;
        isNewConv = true;
        setConversations((prev) => [conv, ...prev]);
        setActiveConversation(convId);
        setMessages([]);
      } catch {
        toast.error('Failed to create conversation');
        return;
      }
    }

    const userContent = input.trim();
    setInput('');

    try {
      // Detect language from user input
      const lang = detectLanguage(userContent);
      setDetectedLanguage(lang);

      // Save user message
      const parts: { text?: string; inlineData?: { mimeType: string; data: string } }[] = [];
      if (userContent) parts.push({ text: userContent });
      if (uploadedImage) {
        parts.push({
          inlineData: { mimeType: uploadedImageMime, data: uploadedImage },
        });
      }

      const userMessageContent = parts.map((p) => p.text || '[Image]').join(' ');
      await saveMessage(convId, 'user', userMessageContent, 'text');

      // Auto-rename new conversation based on first message
      if (isNewConv && userContent) {
        const title = generateTitle(userContent);
        await updateConversation(convId, title);
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, title } : c))
        );
      }

      const currentMessages = [...messages, {
        id: crypto.randomUUID(),
        conversation_id: convId,
        role: 'user' as const,
        content: userMessageContent,
        type: 'text' as const,
        created_at: new Date().toISOString(),
      }];
      setMessages(currentMessages);

      // Clear uploaded image
      setUploadedImage(null);
      setUploadedImageMime('');

      // Handle /img command in chat mode for inline image generation
      const imgCommandMatch = userContent.match(/^\/img\s+(.+)$/i);
      if (mode === 'chat' && imgCommandMatch) {
        const imgPrompt = imgCommandMatch[1];
        if (!checkImgLimit()) return;
        await handleImageGeneration(imgPrompt, convId);
        return;
      }

      // Handle /read command in chat mode for web page reading
      const readCommandMatch = userContent.match(/^\/read\s+(.+)$/i);
      if (mode === 'chat' && readCommandMatch) {
        const url = readCommandMatch[1].trim();
        await handleWebRead(url, convId);
        return;
      }

      if (mode === 'image') {
        if (!checkImgLimit()) return;
        await handleImageGeneration(userContent, convId);
        return;
      }

      if (mode === 'video-text') {
        await handleVideoTextGeneration(userContent, convId);
        return;
      }

      if (mode === 'video-image') {
        await handleVideoImageGeneration(userContent, convId);
        return;
      }

      if (mode === 'search') {
        await handleAiSearch(userContent, convId);
        return;
      }

      // Streaming chat
      setIsStreaming(true);
      const history = buildHistory(currentMessages);

      // Build system instruction for language
      const systemInstruction =
        lang === 'English' || lang === 'Auto'
          ? undefined
          : `You must always respond in ${lang}. If the user switches languages, adapt accordingly. Never respond in English unless the user writes in English.`;

      const contents: ContentMessage[] = [
        ...history,
        { role: 'user', parts },
      ];

      let responseText = '';
      abortRef.current = new AbortController();

      await sendWithRetry({
        functionUrl: `${functionsBaseUrl}/functions/v1/large-language-model`,
        requestBody: systemInstruction ? { contents, systemInstruction } : { contents },
        supabaseAnonKey,
        onData: (data) => {
          try {
            const parsed = JSON.parse(data);
            const chunk = parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            if (chunk) responseText += chunk;
          } catch { /* skip */ }
        },
        onComplete: async () => {
          setIsStreaming(false);
          if (responseText && convId) {
            await saveMessage(convId, 'model', responseText, 'text');
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                conversation_id: convId,
                role: 'model',
                content: responseText,
                type: 'text',
                created_at: new Date().toISOString(),
              },
            ]);
            await incrementUsage('message');
          }
        },
        onError: (err) => {
          setIsStreaming(false);
          toast.error(err.message || 'Stream error');
        },
        signal: abortRef.current.signal,
      });
    } catch (err: any) {
      setIsStreaming(false);
      toast.error(err.message || 'Failed to send message');
    }
  };

  const handleImageGeneration = async (prompt: string, convId?: string) => {
    if (!prompt) return;
    const targetConv = convId || activeConversation;
    if (!targetConv) {
      toast.error('No active conversation');
      return;
    }
    setIsGeneratingImage(true);
    try {
      const { taskId } = await submitImageGeneration([
        { text: prompt },
      ]);

      toast.info('Generating image...');

      const POLL_INTERVAL = 5000;
      const TIMEOUT = 10 * 60 * 1000;
      const deadline = Date.now() + TIMEOUT;

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        const result = await queryImageGeneration(taskId);

        if (result.status === 'SUCCESS') {
          const imageUrl = result.imageUrl || '';
          if (imageUrl) {
            await saveMessage(targetConv, 'model', imageUrl, 'image');
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                conversation_id: targetConv,
                role: 'model',
                content: imageUrl,
                type: 'image',
                created_at: new Date().toISOString(),
              },
            ]);
          }
          toast.success('Image generated!');
          await incrementUsage('image');
          break;
        }
        if (result.status === 'FAILED') {
          throw new Error(`Image generation failed: ${JSON.stringify(result.error)}`);
        }
        if (result.status === 'TIMEOUT') {
          throw new Error('Image generation timed out');
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Image generation failed');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  const handleVideoTextGeneration = async (prompt: string, convId?: string) => {
    if (!prompt) return;
    const targetConv = convId || activeConversation;
    if (!targetConv) {
      toast.error('No active conversation');
      return;
    }
    setIsGeneratingVideo(true);
    try {
      const { task_id } = await submitKlingOmniVideo({
        prompt,
        mode: 'pro',
        duration: '5',
        sound: 'on',
      });

      toast.info('Generating video...');

      const POLL_INTERVAL = 5000;
      const TIMEOUT = 10 * 60 * 1000;
      const deadline = Date.now() + TIMEOUT;

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        const result = await queryKlingOmniVideo(task_id);

        if (result.task_status === 'succeed') {
          const videoUrl = result.task_result?.videos?.[0]?.url || '';
          if (videoUrl) {
            await saveMessage(targetConv, 'model', videoUrl, 'video');
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                conversation_id: targetConv,
                role: 'model',
                content: videoUrl,
                type: 'video',
                created_at: new Date().toISOString(),
              },
            ]);
          }
          toast.success('Video generated!');
          break;
        }
        if (result.task_status === 'failed') {
          throw new Error(`Video generation failed: ${result.task_status_msg || 'unknown'}`);
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Video generation failed');
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleVideoImageGeneration = async (prompt: string, convId?: string) => {
    if (!prompt) return;
    const targetConv = convId || activeConversation;
    if (!targetConv) {
      toast.error('No active conversation');
      return;
    }
    if (!uploadedImage) {
      toast.error('Please upload an image first');
      return;
    }
    setIsGeneratingVideo(true);
    try {
      const { task_id } = await submitKlingImage2Video({
        image: uploadedImage,
        prompt,
        model_name: 'kling-v2-6',
        mode: 'pro',
        duration: '5',
        sound: 'on',
      });

      setUploadedImage(null);
      setUploadedImageMime('');
      toast.info('Generating video from image...');

      const POLL_INTERVAL = 5000;
      const TIMEOUT = 10 * 60 * 1000;
      const deadline = Date.now() + TIMEOUT;

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL));
        const result = await queryKlingImage2Video(task_id);

        if (result.task_status === 'succeed') {
          const videoUrl = result.task_result?.videos?.[0]?.url || '';
          if (videoUrl) {
            await saveMessage(targetConv, 'model', videoUrl, 'video');
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                conversation_id: targetConv,
                role: 'model',
                content: videoUrl,
                type: 'video',
                created_at: new Date().toISOString(),
              },
            ]);
          }
          toast.success('Video generated!');
          break;
        }
        if (result.task_status === 'failed') {
          throw new Error(`Video generation failed: ${result.task_status_msg || 'unknown'}`);
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Video generation failed');
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleAiSearch = async (query: string, convId?: string) => {
    const targetConv = convId || activeConversation;
    if (!targetConv) {
      toast.error('No active conversation');
      return;
    }
    setIsStreaming(true);
    try {
      const userMessage = await saveMessage(targetConv, 'user', query, 'text');
      setMessages((prev) => [...prev, userMessage]);

      const responseMessageId = crypto.randomUUID();
      const tempMessage: Message = {
        id: responseMessageId,
        conversation_id: targetConv,
        role: 'model',
        content: '',
        type: 'text',
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempMessage]);

      const systemInstruction =
        detectedLanguage === 'English' || detectedLanguage === 'Auto'
          ? undefined
          : `You must always respond in ${detectedLanguage}. If the user switches languages, adapt accordingly.`;

      const contents: ContentMessage[] = [
        { role: 'user', parts: [{ text: query }] },
      ];

      let responseText = '';
      const sources: { uri: string; title: string }[] = [];
      abortRef.current = new AbortController();

      await sendWithRetry({
        functionUrl: `${functionsBaseUrl}/functions/v1/ai-search`,
        requestBody: systemInstruction ? { contents, systemInstruction } : { contents },
        supabaseAnonKey,
        onData: (data) => {
          try {
            const parsed = JSON.parse(data);
            const candidate = parsed?.candidates?.[0];
            if (!candidate) return;
            const chunk = candidate?.content?.parts?.[0]?.text ?? '';
            if (chunk) {
              responseText += chunk;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === responseMessageId ? { ...m, content: responseText } : m
                )
              );
            }
            const meta = candidate?.groundingMetadata;
            if (meta?.groundingChunks) {
              const newSources = (meta.groundingChunks as Array<{ web: { uri: string; title: string } }>)
                .filter((c) => c?.web?.uri)
                .map((c) => ({ uri: c.web.uri, title: c.web.title ?? c.web.uri }));
              for (const s of newSources) {
                if (!sources.some((ex) => ex.uri === s.uri)) sources.push(s);
              }
              setMessageSources((prev) => ({ ...prev, [responseMessageId]: sources }));
            }
          } catch {
            // Incomplete JSON chunk
          }
        },
        onComplete: async () => {
          await saveMessage(targetConv, 'model', responseText, 'text');
          setIsStreaming(false);
        },
        onError: (err) => {
          setIsStreaming(false);
          toast.error(err.message || 'Search failed');
        },
        signal: abortRef.current.signal,
      });
    } catch (err: any) {
      setIsStreaming(false);
      toast.error(err.message || 'Search failed');
    }
  };

  const handleWebRead = async (url: string, convId?: string) => {
    const targetConv = convId || activeConversation;
    if (!targetConv) {
      toast.error('No active conversation');
      return;
    }
    setIsStreaming(true);
    try {
      const userMsg = await saveMessage(targetConv, 'user', `/read ${url}`, 'text');
      setMessages((prev) => [...prev, userMsg]);

      toast.info('Reading web page...');
      const pageContent = await fetchWebReader(url, { withLinksSummary: true });

      const summaryMessageId = crypto.randomUUID();
      const tempMessage: Message = {
        id: summaryMessageId,
        conversation_id: targetConv,
        role: 'model',
        content: '',
        type: 'text',
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, tempMessage]);

      const systemInstruction =
        detectedLanguage === 'English' || detectedLanguage === 'Auto'
          ? undefined
          : `You must always respond in ${detectedLanguage}. If the user switches languages, adapt accordingly.`;

      const contents: ContentMessage[] = [
        {
          role: 'user',
          parts: [
            {
              text: `Please read the following web page content and provide a concise summary. Then answer any follow-up questions the user may have about it.\n\nURL: ${url}\n\nContent:\n${pageContent.substring(0, 12000)}`,
            },
          ],
        },
      ];

      let responseText = '';
      abortRef.current = new AbortController();

      await sendWithRetry({
        functionUrl: `${functionsBaseUrl}/functions/v1/large-language-model`,
        requestBody: systemInstruction ? { contents, systemInstruction } : { contents },
        supabaseAnonKey,
        onData: (data) => {
          try {
            const parsed = JSON.parse(data);
            const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            if (text) {
              responseText += text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === summaryMessageId ? { ...m, content: responseText } : m
                )
              );
            }
          } catch {
            // incomplete chunk
          }
        },
        onComplete: async () => {
          await saveMessage(targetConv, 'model', responseText, 'text');
          setIsStreaming(false);
        },
        onError: (err) => {
          setIsStreaming(false);
          toast.error(err.message || 'Failed to summarize page');
        },
        signal: abortRef.current.signal,
      });
    } catch (err: any) {
      setIsStreaming(false);
      toast.error(err.message || 'Failed to read web page');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be smaller than 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setUploadedImage(base64);
      setUploadedImageMime(file.type);
      toast.success('Image uploaded. Type a message and send to analyze it.');
    };
    reader.readAsDataURL(file);
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (blob.size === 0) return;
        setIsTranscribing(true);
        try {
          const fileName = `voice-${crypto.randomUUID()}.webm`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('generated-media')
            .upload(fileName, blob, { contentType: 'audio/webm', cacheControl: 'no-cache' });
          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage.from('generated-media').getPublicUrl(uploadData!.path);
          const fileUrl = urlData.publicUrl;

          const result = await transcribeAudio(fileUrl);
          if (result.text) {
            setInput(result.text);
            toast.success('Transcription complete');
          }

          // cleanup uploaded audio
          await supabase.storage.from('generated-media').remove([uploadData!.path]);
        } catch (err: any) {
          toast.error(err.message || 'Transcription failed');
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
      setIsRecording(true);
    } catch (err: any) {
      toast.error(err.message || 'Could not access microphone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handlePlayTTS = async (msg: Message) => {
    if (!msg.content || msg.type !== 'text') return;
    if (playingMessageId === msg.id) {
      audioPlayerRef.current?.pause();
      audioPlayerRef.current = null;
      setPlayingMessageId(null);
      return;
    }

    try {
      setPlayingMessageId(msg.id);
      const { audioUrl } = await fetchTextToSpeech(msg.content, 'heart', 'mp3');
      const audio = new Audio(audioUrl);
      audioPlayerRef.current = audio;
      audio.onended = () => {
        setPlayingMessageId(null);
        audioPlayerRef.current = null;
      };
      audio.onerror = () => {
        setPlayingMessageId(null);
        audioPlayerRef.current = null;
        toast.error('Audio playback failed');
      };
      await audio.play();
    } catch (err: any) {
      setPlayingMessageId(null);
      toast.error(err.message || 'Text-to-speech failed');
    }
  };

  const activeTitle = conversations.find((c) => c.id === activeConversation)?.title || 'Chat';

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleDownload = async (url: string, filename: string) => {
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('Download started');
    } catch {
      toast.error('Download failed');
    }
  };

  const renderMessage = (msg: Message) => {
    const isUser = msg.role === 'user';
    const isLiked = likedMessages.has(msg.id);
    const isDisliked = dislikedMessages.has(msg.id);
    return (
      <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3 md:mb-4 px-1 md:px-0`}>
        <div
          className={`max-w-[85%] md:max-w-[75%] rounded-2xl px-3 py-2.5 md:px-4 md:py-3 shadow-sm ${
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-foreground border border-border/60'
          }`}
        >
          {msg.type === 'image' ? (
            <img
              src={msg.content}
              alt="Generated"
              className="max-w-full rounded-lg"
              loading="lazy"
            />
          ) : msg.type === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(msg.content) ? (
            <video
              src={msg.content}
              controls
              className="max-w-full rounded-lg"
              preload="metadata"
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-[10px] opacity-60">
              {new Date(msg.created_at).toLocaleTimeString()}
            </span>
            <div className="flex items-center gap-1">
              {!isUser && msg.type === 'text' && !/\.(mp4|webm|mov)(\?|$)/i.test(msg.content) && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 min-h-[28px] min-w-[28px] opacity-60 hover:opacity-100"
                    onClick={() => handleCopy(msg.content)}
                    title="Copy"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 min-h-[28px] min-w-[28px] opacity-60 hover:opacity-100 ${isLiked ? 'text-primary opacity-100' : ''}`}
                    onClick={() => {
                      setLikedMessages((prev) => new Set([...prev, msg.id]));
                      setDislikedMessages((prev) => {
                        const next = new Set(prev);
                        next.delete(msg.id);
                        return next;
                      });
                    }}
                    title="Like"
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 min-h-[28px] min-w-[28px] opacity-60 hover:opacity-100 ${isDisliked ? 'text-destructive opacity-100' : ''}`}
                    onClick={() => {
                      setDislikedMessages((prev) => new Set([...prev, msg.id]));
                      setLikedMessages((prev) => {
                        const next = new Set(prev);
                        next.delete(msg.id);
                        return next;
                      });
                    }}
                    title="Dislike"
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 min-h-[28px] min-w-[28px] opacity-60 hover:opacity-100"
                    onClick={() => handlePlayTTS(msg)}
                    title={playingMessageId === msg.id ? 'Stop audio' : 'Read aloud'}
                  >
                    {playingMessageId === msg.id ? (
                      <Square className="h-3.5 w-3.5 fill-current" />
                    ) : (
                      <Volume2 className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </>
              )}
              {!isUser && (msg.type === 'image' || msg.type === 'video' || /\.(mp4|webm|mov)(\?|$)/i.test(msg.content)) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 min-h-[28px] min-w-[28px] opacity-60 hover:opacity-100"
                  onClick={() => handleDownload(msg.content, `model-x-202-${msg.type}-${msg.id.slice(0, 8)}.${msg.type === 'image' ? 'jpg' : 'mp4'}`)}
                  title="Download"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          {!isUser && messageSources[msg.id] && messageSources[msg.id].length > 0 && (
            <div className="mt-2 pt-2 border-t border-border/40">
              <p className="text-[10px] font-medium opacity-70 mb-1">Sources</p>
              <div className="flex flex-wrap gap-1.5">
                {messageSources[msg.id].map((src, idx) => (
                  <a
                    key={idx}
                    href={src.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                    <span className="max-w-[200px] truncate">{src.title || src.uri}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center justify-between border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2 font-semibold">
          <SparklesIcon className="h-5 w-5" />
          Model-x-202
        </div>
      </div>
      <div className="p-3">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 border-sidebar-border bg-sidebar text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={handleNewChat}
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>
      <ScrollArea className="flex-1 px-3">
        <div className="space-y-1">
          {isLoadingConversations ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full bg-sidebar-accent" />
              <Skeleton className="h-10 w-full bg-sidebar-accent" />
              <Skeleton className="h-10 w-full bg-sidebar-accent" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="py-8 text-center text-sm text-sidebar-foreground/60">
              No conversations yet
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                className={`group flex items-center gap-2 rounded-lg px-3 py-3 md:py-2 text-sm cursor-pointer min-h-[44px] ${
                  activeConversation === conv.id
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50'
                }`}
                onClick={() => {
                  setActiveConversation(conv.id);
                }}
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                {editingId === conv.id ? (
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => handleRenameConversation(conv.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameConversation(conv.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    autoFocus
                    className="h-7 px-1 py-0 text-sm"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="flex-1 truncate">{conv.title}</span>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 min-h-[36px] min-w-[36px] opacity-100 md:opacity-0 md:group-hover:opacity-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(conv.id);
                        setEditTitle(conv.title);
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConversation(conv.id);
                      }}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))
          )}
        </div>
      </ScrollArea>
      <div className="border-t border-sidebar-border p-3">
        <div className="relative">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => setShowUserMenu(!showUserMenu)}
          >
            <User className="h-4 w-4" />
            <span className="flex-1 truncate text-left text-sm">{user?.email}</span>
            <ChevronDown className="h-3 w-3" />
          </Button>
          {showUserMenu && (
            <div className="absolute bottom-full left-0 mb-1 w-full rounded-md border border-sidebar-border bg-sidebar p-1 shadow-lg">
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                onClick={() => { navigate('/profile'); setShowUserMenu(false); }}
              >
                <Settings className="h-4 w-4" />
                Profile & Settings
              </Button>
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                onClick={() => { navigate('/pricing'); setShowUserMenu(false); }}
              >
                <Crown className="h-4 w-4" />
                Upgrade / Pricing
              </Button>
              {profile?.role === 'admin' && (
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  onClick={() => { navigate('/admin'); setShowUserMenu(false); }}
                >
                  <Shield className="h-4 w-4" />
                  Admin Panel
                </Button>
              )}
              <Button
                variant="ghost"
                className="w-full justify-start gap-2 text-destructive hover:bg-sidebar-accent hover:text-destructive"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border lg:flex">
        {sidebarContent}
      </aside>

      {/* Main Chat Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center gap-2 md:gap-3 border-b border-border px-3 py-2.5 md:px-4 md:py-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden h-10 w-10 min-h-[44px] min-w-[44px]">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-sidebar">
              {sidebarContent}
            </SheetContent>
          </Sheet>
          <h1 className="flex-1 truncate text-base font-semibold">{activeTitle}</h1>
          <div className="flex items-center gap-2">
            {(mode === 'chat' || mode === 'image' || mode === 'search') && (
              <div className="hidden items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground md:flex">
                <Globe className="h-3 w-3" />
                {detectedLanguage}
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 min-h-[44px] min-w-[44px]"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  {mode === 'chat' ? <MessageSquare className="h-4 w-4" /> : mode === 'image' ? <Wand2 className="h-4 w-4" /> : mode === 'search' ? <Search className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                  <span className="hidden sm:inline">{
                    mode === 'chat' ? 'Chat' :
                    mode === 'image' ? 'Image Gen' :
                    mode === 'search' ? 'AI Search' :
                    mode === 'video-text' ? 'Video (Text)' : 'Video (Image)'
                  }</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setMode('chat')}>
                  <MessageSquare className="mr-2 h-4 w-4" />
                  Chat
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMode('image')}>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Image Generation
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMode('video-text')}>
                  <Clapperboard className="mr-2 h-4 w-4" />
                  Video from Text
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMode('video-image')}>
                  <Video className="mr-2 h-4 w-4" />
                  Video from Image
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setMode('search')}>
                  <Search className="mr-2 h-4 w-4" />
                  AI Search
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 md:p-4">
          {messages.length === 0 && !isStreaming && (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground px-4 text-center">
              <SparklesIcon className="mb-3 md:mb-4 h-10 w-10 md:h-12 md:w-12 opacity-30" />
              <p className="text-base md:text-lg font-medium">
                {mode === 'chat'
                  ? 'Start a conversation with Model-x-202'
                  : mode === 'image'
                  ? 'Describe an image to generate'
                  : mode === 'video-text'
                  ? 'Describe a video to generate'
                  : mode === 'search'
                  ? 'Ask anything with real-time web search'
                  : 'Upload an image and describe motion'}
              </p>
              <p className="mt-1 text-xs md:text-sm opacity-70">
                {mode === 'chat'
                  ? 'Ask anything, upload an image, or type /img or /read'
                  : mode === 'image'
                  ? 'Type a detailed description and send'
                  : mode === 'video-text'
                  ? 'Type a scene description and send'
                  : mode === 'search'
                  ? 'Powered by Gemini 2.5 Flash + Google Search'
                  : 'Upload an image, describe motion, and send'}
              </p>
            </div>
          )}
          {messages.map(renderMessage)}
          {isStreaming && (
            <div className="flex justify-start mb-3 md:mb-4 px-1 md:px-0">
              <div className="max-w-[85%] md:max-w-[75%] rounded-2xl bg-muted px-3 py-2.5 md:px-4 md:py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {retryInfo ?? (mode === 'search' ? 'Searching...' : 'Thinking...')}
                </div>
              </div>
            </div>
          )}
          {isGeneratingImage && (
            <div className="flex justify-start mb-3 md:mb-4 px-1 md:px-0">
              <div className="max-w-[85%] md:max-w-[75%] rounded-2xl bg-muted px-3 py-2.5 md:px-4 md:py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating image...
                </div>
              </div>
            </div>
          )}
          {isGeneratingVideo && (
            <div className="flex justify-start mb-3 md:mb-4 px-1 md:px-0">
              <div className="max-w-[85%] md:max-w-[75%] rounded-2xl bg-muted px-3 py-2.5 md:px-4 md:py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating video...
                </div>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        {/* Input Area */}
        <div className="border-t border-border p-4">
          {/* Usage counter for free users */}
          {!isPro && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
              <span>
                <span className={dailyUsage.message_count >= FREE_MSG_LIMIT ? 'font-semibold text-destructive' : ''}>
                  Messages: {dailyUsage.message_count}/{FREE_MSG_LIMIT}
                </span>
                <span className="mx-2 opacity-40">·</span>
                <span className={dailyUsage.image_count >= FREE_IMG_LIMIT ? 'font-semibold text-destructive' : ''}>
                  Images: {dailyUsage.image_count}/{FREE_IMG_LIMIT}
                </span>
                <span className="ml-1 opacity-60">today</span>
              </span>
              <button
                type="button"
                onClick={() => navigate('/pricing')}
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                Upgrade
              </button>
            </div>
          )}
          {isPro && (
            <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
              <Crown className="h-3 w-3 text-primary" />
              <span>Unlimited usage</span>
            </div>
          )}
          {uploadedImage && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted p-2">
              <ImageIcon className="h-4 w-4" />
              <span className="flex-1 truncate text-sm">Image uploaded for analysis</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setUploadedImage(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-11 w-11 min-h-[44px] min-w-[44px]"
              onClick={() => fileInputRef.current?.click()}
              disabled={isStreaming || isGeneratingImage || isGeneratingVideo || isRecording || isTranscribing}
              title="Upload image"
            >
              <ImageIcon className="h-5 w-5" />
            </Button>
            <Button
              variant={isRecording ? 'destructive' : 'ghost'}
              size="icon"
              className="shrink-0 h-11 w-11 min-h-[44px] min-w-[44px]"
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isStreaming || isGeneratingImage || isGeneratingVideo || isTranscribing}
              title={isRecording ? 'Stop recording' : 'Voice input'}
            >
              {isRecording ? (
                <Square className="h-5 w-5 fill-current" />
              ) : isTranscribing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Mic className="h-5 w-5" />
              )}
            </Button>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={
                isRecording
                  ? 'Recording...'
                  : isTranscribing
                  ? 'Transcribing voice...'
                  : mode === 'chat'
                  ? 'Type a message... Use /img or /read'
                  : mode === 'image'
                  ? 'Describe the image you want to generate...'
                  : mode === 'video-text'
                  ? 'Describe the video scene you want...'
                  : mode === 'search'
                  ? 'Ask anything with live web search...'
                  : 'Describe motion for the uploaded image...'
              }
              className="min-h-[48px] max-h-[120px] flex-1 resize-none text-base"
              disabled={
                isStreaming || isGeneratingImage || isGeneratingVideo || isRecording || isTranscribing ||
                (!isPro && mode === 'image' && dailyUsage.image_count >= FREE_IMG_LIMIT) ||
                (!isPro && mode !== 'image' && dailyUsage.message_count >= FREE_MSG_LIMIT)
              }
            />
            <Button
              size="icon"
              className="shrink-0 h-11 w-11 min-h-[44px] min-w-[44px]"
              onClick={handleSend}
              disabled={
                (!input.trim() && !uploadedImage && mode !== 'video-image') ||
                isStreaming || isGeneratingImage || isGeneratingVideo || isRecording || isTranscribing ||
                (!isPro && mode === 'image' && dailyUsage.image_count >= FREE_IMG_LIMIT) ||
                (!isPro && mode !== 'image' && dailyUsage.message_count >= FREE_MSG_LIMIT)
              }
            >
              {isStreaming || isGeneratingImage || isGeneratingVideo || isTranscribing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

export default Chat;
