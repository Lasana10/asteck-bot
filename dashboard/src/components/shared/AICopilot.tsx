import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, Bot, Sparkles, Camera, Cpu, Mic } from 'lucide-react';
import { afatAuthHeaders, getApiBaseUrl } from '../../supabaseClient';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface Props {
  userName: string;
  userRole: string;
  context?: string;
}

export function AICopilot({ userName, userRole, context }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [activeModel, setActiveModel] = useState<'gemini' | 'llama'>('gemini');
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const custom = event as CustomEvent<{ prompt?: string; intro?: string }>;
      setIsOpen(true);
      if (custom.detail?.prompt) {
        setInput(custom.detail.prompt);
      }
      if (custom.detail?.intro) {
        setMessages(prev => {
          if (prev.some((message) => message.content === custom.detail?.intro)) {
            return prev;
          }
          return [
            ...prev,
            { role: 'assistant', content: custom.detail.intro || '', timestamp: new Date() }
          ];
        });
      }
    };

    window.addEventListener('afat:open-copilot', handleOpen as EventListener);
    return () => window.removeEventListener('afat:open-copilot', handleOpen as EventListener);
  }, []);

  const systemPrompt = `You are AFAT Guidance, the invisible traffic intelligence for MobilityOS — a mobility platform in Cameroon.
Current user: ${userName} (Role: ${userRole}).
${context || ''}
You help with:
- Commuters: route suggestions, fare estimates, safety tips, wallet help
- Operators: earnings analysis, shift optimization, maintenance reminders, DNA score
- Admins: fleet overview, anomaly summaries, performance reports, revenue insights
Keep responses short (2-3 sentences max), friendly, and practical. Use XAF for currency.
Sound like a calm local guide who knows the streets — never mention AI, models, algorithms, or technology.
Reply in the same language the user writes in (French or English).
Use phrases like "heads-up", "usually at this hour", "from what we see" instead of technical terms.`;

  const callBackendAI = async (payload: Record<string, any>): Promise<string> => {
    const response = await fetch(`${getApiBaseUrl()}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...afatAuthHeaders() },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'AI backend request failed');
    }

    return data?.text || '';
  };

  const callLlamaStrategy = async (userText: string): Promise<string> => {
    const strategyPrompt = `You are the Strategic Reasoning Layer of AFAT Sentinel AI. 
Analyze the user's intent, current role (${userRole}), and context (${context || 'None'}).
Formulate a brief, hidden response strategy (1-2 sentences) about how the conversational AI should answer.
Focus on safety, Cameroon etiquette, and practical tips. Do NOT write the actual reply to the user.
User input: "${userText}"`;

    return callBackendAI({
      prompt: strategyPrompt,
      user_name: userName,
      user_role: userRole,
      context,
      task: 'predict',
      language: navigator.language?.startsWith('fr') ? 'fr' : 'en',
    });
  };

  const callGemini = async (userText: string, strategy: string = ''): Promise<string> => {
    return callBackendAI({
      prompt: userText,
      user_name: userName,
      user_role: userRole,
      context: `${context || ''}${strategy ? `\nHidden strategy: ${strategy}` : ''}`,
      task: 'summarize',
      language: navigator.language?.startsWith('fr') ? 'fr' : 'en',
    });
  };

  const callLlamaVision = async (base64Image: string): Promise<string> => {
    const response = await fetch(`${getApiBaseUrl()}/api/ai/vision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...afatAuthHeaders() },
      body: JSON.stringify({
        image: base64Image,
        prompt: systemPrompt + '\n\nAnalyze this traffic photo. Describe what you see, identify any incidents, hazards, or notable conditions. Be concise.'
      })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'Vision request failed');
    }

    return data?.text || 'Analyse photo indisponible.';
  };

  const handleSend = async () => {
    if (!input.trim() || isThinking) return;

    const userMessage: Message = { role: 'user', content: input.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsThinking(true);
    setActiveModel('gemini');

    try {
      // Step 1: Think (Llama 3.3 70B)
      const strategy = await callLlamaStrategy(input.trim());
      
      // Step 2: Speak (Gemini 2.5 Flash)
      const aiText = await callGemini(input.trim(), strategy);
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: aiText, 
        timestamp: new Date()
      }]);
    } catch {
      const fallback = getOfflineResponse(input.trim(), userRole);
      setMessages(prev => [...prev, { role: 'assistant', content: fallback, timestamp: new Date() }]);
    }

    setIsThinking(false);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsThinking(true);
    setActiveModel('llama');

    setMessages(prev => [...prev, { role: 'user', content: '📷 [Photo envoyée pour analyse]', timestamp: new Date() }]);

    try {
      const base64 = await fileToBase64(file);
      const analysis = await callLlamaVision(base64);
      setMessages(prev => [...prev, { role: 'assistant', content: analysis, timestamp: new Date() }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Analyse photo indisponible. Réessayez dans un instant.', timestamp: new Date() }]);
    }

    setIsThinking(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]); // Strip data:...;base64, prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const getOfflineResponse = (query: string, role: string): string => {
    const q = query.toLowerCase();
    if (q.includes('route') || q.includes('trajet')) return '🗺️ Routes populaires: Yaoundé-Douala (3,500 XAF), Mvan-Nsimeyong (200 XAF), Poste Centrale-Marché Central (150 XAF).';
    if (q.includes('prix') || q.includes('price') || q.includes('fare')) return '💰 Tarifs: 150-500 XAF en ville, 2,000-5,000 XAF interurbain.';
    if (q.includes('wallet') || q.includes('portefeuille') || q.includes('credit')) return '💳 Accédez à votre portefeuille dans l\'onglet Profil. Les membres Argent+ peuvent activer le micro-crédit.';
    if (q.includes('urgence') || q.includes('emergency') || q.includes('sos')) return '🆘 Utilisez le bouton SOS ou appelez le 117 (Police) / 112 (Urgences).';
    if (role === 'operator' && (q.includes('gain') || q.includes('earn') || q.includes('dna'))) return '📊 Votre Driver DNA est visible sur votre tableau de bord. Améliorez votre score en conduisant prudemment et en participant aux Tontines.';
    return `👋 Bonjour ${userName}! Comment puis-je vous aider aujourd'hui?`;
  };

  const quickPrompts = userRole === 'operator'
    ? ['Mon score DNA?', 'Combien j\'ai gagné?', 'Routes populaires']
    : userRole === 'admin'
      ? ['Résumé opérationnel', 'Incidents à surveiller', 'État paiements et conformité']
      : ['Trajet le moins cher?', 'Mon portefeuille', 'Signaler un problème'];

  const orchestrationLabel = isThinking
    ? activeModel === 'llama'
      ? 'Strategy layer thinking'
      : 'Guidance layer responding'
    : 'Orchestrator live';

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-24 right-4 z-[1500] flex items-center gap-3 rounded-full border border-white/10 bg-gradient-to-r from-blue-600 to-indigo-700 px-4 py-3 shadow-2xl shadow-blue-500/30 active:scale-95 transition-all ring-4 ring-white/10 hover:ring-blue-500/30"
        >
          <Sparkles className="w-6 h-6 text-white" />
          <div className="text-left">
            <p className="text-[10px] font-black uppercase tracking-widest text-white">AI Orchestrator</p>
            <p className="text-[9px] font-semibold text-blue-100/80">Guidance, strategy, vision</p>
          </div>
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-20 right-4 left-4 sm:left-auto sm:w-96 z-[2000] animate-in slide-in-from-bottom-4 duration-300">
          <div className="bg-slate-900 border border-white/10 rounded-[32px] shadow-2xl shadow-black/50 overflow-hidden flex flex-col max-h-[70vh]">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600/20 to-indigo-700/20 border-b border-white/5 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <Bot className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <h4 className="font-black text-sm">AFAT Guidance</h4>
                  <p className="text-[9px] text-blue-400 font-mono uppercase tracking-widest">
                    {orchestrationLabel}
                  </p>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-1">
                <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-widest ${activeModel === 'llama' && isThinking ? 'border-amber-400/30 bg-amber-500/10 text-amber-200' : 'border-white/10 bg-white/5 text-white/45'}`}>strategy</span>
                <span className={`rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-widest ${activeModel === 'gemini' && isThinking ? 'border-blue-400/30 bg-blue-500/10 text-blue-200' : 'border-white/10 bg-white/5 text-white/45'}`}>guidance</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-white/45">vision</span>
              </div>
              <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-white p-1 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 min-h-[200px] max-h-[45vh]">
              {messages.length === 0 && (
                <div className="text-center py-8">
                  <Sparkles className="w-10 h-10 text-blue-500/30 mx-auto mb-4" />
                  <p className="text-slate-500 text-sm mb-6">Bonjour {userName}! Comment puis-je vous aider?</p>
                  <div className="space-y-2">
                    {quickPrompts.map((prompt, i) => (
                      <button
                        key={i}
                        onClick={() => { setInput(prompt); }}
                        className="block w-full text-left bg-slate-800/50 hover:bg-slate-800 border border-white/5 px-4 py-3 rounded-2xl text-sm text-slate-300 transition-all"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-md'
                      : 'bg-slate-800 text-slate-200 rounded-bl-md border border-white/5'
                  }`}>
                    {msg.content}
                    {/* Intelligence stays invisible — no model badges */}
                  </div>
                </div>
              ))}

              {isThinking && (
                <div className="flex justify-start">
                  <div className="bg-slate-800 border border-white/5 px-4 py-3 rounded-2xl rounded-bl-md">
                    <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-white/5 p-3">
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isThinking}
                  className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-400 hover:text-amber-400 p-3 rounded-2xl transition-all"
                  title="Scan & Detect Intelligence (Llama Vision)"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setInput("Assistant, I want to report something via voice. Start audio scanning.");
                    handleSend();
                  }}
                  disabled={isThinking}
                  className="bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-400 hover:text-purple-400 p-3 rounded-2xl transition-all"
                  title="Voice Intelligence (AFAT Audio)"
                >
                  <Mic className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask AFAT Guidance..."
                  className="flex-1 bg-slate-800 border border-white/10 rounded-2xl px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/50 transition-colors"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isThinking}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white p-3 rounded-2xl transition-all active:scale-90"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
