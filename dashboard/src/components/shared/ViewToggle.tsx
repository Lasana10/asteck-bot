import React from 'react';
import { Map, LayoutGrid } from 'lucide-react';

interface Props {
  mode: 'map' | 'grid';
  onToggle: (mode: 'map' | 'grid') => void;
}

export function ViewToggle({ mode, onToggle }: Props) {
  return (
    <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[2000] bg-slate-900/60 backdrop-blur-2xl border border-white/10 p-1 rounded-2xl shadow-2xl flex items-center gap-1">
      <button
        onClick={() => onToggle('map')}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
          mode === 'map' 
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
        }`}
      >
        <Map className="w-4 h-4" />
        <span className="text-xs font-bold uppercase tracking-wider">Immersif</span>
      </button>
      <button
        onClick={() => onToggle('grid')}
        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all ${
          mode === 'grid' 
            ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' 
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
        }`}
      >
        <LayoutGrid className="w-4 h-4" />
        <span className="text-xs font-bold uppercase tracking-wider">Terminal</span>
      </button>
    </div>
  );
}
