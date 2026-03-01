import React, { useState, useEffect, useRef } from 'react';
import { chatApi } from '../api';
import type { ChatMessage } from '../api';
import { chatWithGemini, FITNESS_COACH_PROMPT } from '../services/gemini';
import type { GeminiMessage } from '../services/gemini';

interface Props {
  onBack: () => void;
}

interface DisplayMessage {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  time: string;
}

const AIChat: React.FC<Props> = ({ onBack }) => {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const geminiHistoryRef = useRef<GeminiMessage[]>([]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Load chat history on mount & build Gemini context
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await chatApi.history(1, 50);
        const mapped: DisplayMessage[] = res.data.map(m => ({
          id: m.id,
          text: m.content,
          sender: m.role === 'user' ? 'user' : 'ai',
          time: formatTime(m.createdAt),
        }));
        setMessages(mapped);

        // Build Gemini history from persisted messages
        geminiHistoryRef.current = res.data.map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.content }],
        } as GeminiMessage));
      } catch (err) {
        console.error('Failed to load chat history:', err);
      } finally {
        setLoading(false);
      }
    };
    loadHistory();
  }, []);

  const handleSend = async () => {
    if (!inputValue.trim() || sending) return;

    const userMsg: DisplayMessage = {
      id: `user-${Date.now()}`,
      text: inputValue,
      sender: 'user',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, userMsg]);
    const content = inputValue;
    setInputValue("");
    setSending(true);

    try {
      // Call Gemini directly with conversation history
      const aiText = await chatWithGemini(content, FITNESS_COACH_PROMPT, geminiHistoryRef.current);

      // Update Gemini history
      geminiHistoryRef.current = [
        ...geminiHistoryRef.current,
        { role: 'user', parts: [{ text: content }] },
        { role: 'model', parts: [{ text: aiText }] },
      ];

      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const aiMsg: DisplayMessage = {
        id: `ai-${Date.now()}`,
        text: aiText,
        sender: 'ai',
        time: now,
      };
      setMessages(prev => [...prev, aiMsg]);

      // Persist to backend (fire-and-forget)
      chatApi.send(content).catch(() => {});
    } catch (err) {
      console.error('Chat send failed:', err);
      const errorMsg: DisplayMessage = {
        id: `err-${Date.now()}`,
        text: '抱歉，发送失败，请稍后重试。',
        sender: 'ai',
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-screen bg-bg-dark flex flex-col relative z-50">
      {/* Header */}
      <div className="px-4 py-4 flex items-center gap-3 border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-10">
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 active:scale-95 transition-transform">
          <span className="material-icons-round text-white">arrow_back</span>
        </button>
        <div className="flex items-center gap-3">
           <div className="relative">
             <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-[#7aab00] flex items-center justify-center shadow-[0_0_15px_rgba(184,255,0,0.3)]">
                <span className="material-icons-round text-black text-xl">smart_toy</span>
             </div>
             <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-black rounded-full"></div>
           </div>
           <div>
             <h1 className="text-base font-bold text-white">AI 运动专家</h1>
             <p className="text-[10px] text-primary flex items-center gap-1">
               <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></span>
               在线 · 随时响应
             </p>
           </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-[#050505]">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-[#B8FF00] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">开始和 AI 运动专家对话吧</div>
        ) : (
          messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
            <div className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'} max-w-[85%]`}>
               <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-lg ${
                 msg.sender === 'user'
                 ? 'bg-primary text-black rounded-tr-none'
                 : 'bg-[#1A1A1A] text-gray-200 rounded-tl-none border border-white/5'
               }`}>
                 {msg.text}
               </div>
               <span className="text-[10px] text-gray-600 mt-1 px-1">{msg.time}</span>
            </div>
          </div>
        )))}
        {sending && (
          <div className="flex justify-start animate-fade-in">
            <div className="p-4 rounded-2xl rounded-tl-none bg-[#1A1A1A] border border-white/5">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-[#0A0A0A] border-t border-white/10 pb-safe">
        <div className="flex gap-2 items-end">
           <button className="p-3 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/5">
              <span className="material-icons-round">add_circle_outline</span>
           </button>
           <div className="flex-1 bg-[#1A1A1A] rounded-2xl flex items-center px-4 py-2 border border-white/5 focus-within:border-primary/50 transition-colors">
              <input 
                type="text" 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="问问关于深蹲的技巧..."
                className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none min-h-[40px]"
              />
           </div>
           <button
             onClick={handleSend}
             disabled={!inputValue.trim() || sending}
             className={`p-3 rounded-full flex items-center justify-center transition-all ${
               inputValue.trim() && !sending
               ? 'bg-primary text-black hover:bg-primary-dark shadow-[0_0_15px_rgba(184,255,0,0.3)] transform active:scale-95'
               : 'bg-[#1A1A1A] text-gray-600'
             }`}
           >
              <span className="material-icons-round">send</span>
           </button>
        </div>
      </div>
    </div>
  );
};

export default AIChat;