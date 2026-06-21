
import React, { useState, useRef, useEffect } from 'react';
import { getGeminiResponse } from '../services/geminiService';
import { ChatMessage } from '../types';
import { Send, User, Bot, Sparkles } from 'lucide-react';

const CultivationChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: '道友请了。在下韩立，这大庚剑阵乃是庚金至宝，威力无穷，非同小可。你想了解些什么？' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);

    const history = messages.map(m => ({
      role: m.role,
      parts: [{ text: m.text }]
    }));

    const response = await getGeminiResponse(userMsg, history);
    setMessages(prev => [...prev, { role: 'model', text: response }]);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-full glass-panel rounded-xl overflow-hidden border border-emerald-500/30">
      <div className="p-4 border-b border-emerald-500/20 bg-emerald-950/20 flex items-center gap-2">
        <Sparkles className="text-emerald-400 w-5 h-5" />
        <h2 className="font-bold text-emerald-100">青元剑诀 · 传音符 (Azure Essence Transmission)</h2>
      </div>
      
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-lg flex gap-3 ${
              msg.role === 'user' 
                ? 'bg-emerald-600/20 border border-emerald-500/30 text-emerald-50' 
                : 'bg-slate-800/60 border border-slate-700 text-slate-200'
            }`}>
              <div className="flex-shrink-0 mt-1">
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} className="text-emerald-400" />}
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-slate-800/60 p-3 rounded-lg flex items-center gap-2 text-slate-400 italic text-xs">
              <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-emerald-500"></div>
              韩立正在沉思... (Han Li is contemplating...)
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-slate-900/40 border-t border-emerald-500/20">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="请教韩道友..."
            className="w-full bg-slate-950 border border-emerald-500/30 rounded-full py-2 pl-4 pr-12 text-sm focus:outline-none focus:border-emerald-400 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-emerald-400 hover:text-emerald-300 disabled:opacity-50 transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default CultivationChat;
