"use client"
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ⚖️, Upload, BarChart3, ShieldCheck, ChevronRight } from 'lucide-react';

export default function PrecedentAnalyzer() {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<null | any>(null);

  const [inputText, setInputText] = useState("");

  const handleAnalyze = async () => {
    if (!inputText.trim()) return;
    setAnalyzing(true);
    setResult(null);
    
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          context: inputText, 
          role: 'SUPREME_REASONER' 
        })
      });
      
      const data = await response.json();
      
      if (data.success && data.payload) {
        try {
          // Clean possible markdown formatting from Gemini/Qwen output before parsing
          const cleanJson = data.payload.replace(/```json/g, '').replace(/```/g, '');
          const parsed = JSON.parse(cleanJson);
          setResult(parsed);
        } catch (e) {
          console.error("Failed to parse JSON from AI engine:", e);
          setResult({ winProbability: 0, strategy: ["Analysis parsing failed. The intelligence engine output could not be parsed.", data.payload.substring(0,100)], citations: [] });
        }
      }
    } catch (error) {
      console.error("API error:", error);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <section className="p-8 max-w-5xl mx-auto space-y-12">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-teal-accent">Legal Analytics & Forecast</h1>
        <p className="text-slate-400">DeepSeek-powered outcome prediction for OHADA & CEMAC jurisdictions.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="glass p-8 rounded-2xl glow-hover transition-all space-y-6">
          <div className="p-4 bg-teal-glow rounded-xl flex items-center gap-3">
             <Upload className="text-teal-accent w-6 h-6" />
             <span className="text-teal-accent font-medium uppercase tracking-wider text-xs">Matter Intel Input</span>
          </div>
          
          <textarea 
            className="w-full bg-navy-800/50 border-none rounded-xl p-4 text-sm text-slate-200 h-40 focus:ring-1 focus:ring-teal-accent transition-all outline-none"
            placeholder="Paste case details or upload ruling PDF..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />

          <button 
            onClick={handleAnalyze}
            disabled={analyzing}
            className="w-full py-4 bg-teal-accent text-navy-900 font-bold rounded-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 group"
          >
            {analyzing ? "Synthesizing Strategy..." : <>Initialize Analysis <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>}
          </button>
        </div>

        {result && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="glass p-8 rounded-2xl border-l-4 border-teal-accent space-y-8"
          >
            <div className="flex justify-between items-end">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-[0.2em]">Forecast Outcome</span>
              <div className="text-right">
                <span className="text-5xl font-black text-teal-accent">{result.winProbability}%</span>
                <p className="text-[10px] text-slate-500 mt-1 uppercase">Probability of favorable ruling</p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wide">
                <BarChart3 className="w-4 h-4 text-teal-accent" />
                Strategic Directives
              </h3>
              <ul className="space-y-3">
                {result.strategy.map((s: string, i: number) => (
                  <li key={i} className="text-xs text-slate-300 leading-relaxed flex gap-2">
                    <span className="text-teal-accent">•</span> {s}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-700/30">
              <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wide">
                <ShieldCheck className="w-4 h-4 text-teal-accent" />
                Authored Precedents
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.citations.map((c: string, i: number) => (
                  <span key={i} className="text-[10px] bg-navy-800 text-slate-400 px-3 py-1.5 rounded-full border border-slate-700/50">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
}
