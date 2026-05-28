import React, { useState, useRef } from 'react';
import { Mic, Square, Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { apiBaseUrl, supabase } from '../../supabaseClient';

export function VoiceReporter({ profile, onClose }: { profile: any, onClose?: () => void }) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = processAudio;

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
    } catch (err: any) {
      setError("Please allow microphone access to report hazards.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
      setIsProcessing(true);
    }
  };

  const processAudio = async () => {
    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const formData = new FormData();
      formData.append('audio', audioBlob, 'report.webm');
      formData.append('reporter_id', profile.id);

      const response = await fetch(`${apiBaseUrl}/api/intelligence/voice-report`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (!response.ok) throw new Error(data.error || 'Failed to process audio.');

      // Helper to get real GPS
      const getRealLocation = (): Promise<{lat: number, lng: number}> => {
        return new Promise((resolve) => {
          if (!navigator.geolocation) {
            // Fallback to Yaoundé center if no GPS
            resolve({ lat: 3.848, lng: 11.502 });
            return;
          }
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve({ lat: 3.848, lng: 11.502 }), // Fallback on error/deny
            { enableHighAccuracy: true, timeout: 5000 }
          );
        });
      };

      const coords = await getRealLocation();
      const lat = coords.lat;
      const lng = coords.lng;
      
      const incidentPayload = {
        reporter_id: profile.id,
        reporter_username: profile.username || 'Voice Agent',
        type: data.classification?.type || 'other',
        description: data.transcription,
        severity: data.classification?.severity || 3,
        latitude: lat,
        longitude: lng,
        location: `POINT(${lng} ${lat})`
      };

      await supabase.from('incidents').insert([incidentPayload]);
      
      setResult(incidentPayload);
    } catch (err: any) {
      setError(err.message || 'Error processing brain scan.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 z-[3000]">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-[32px] p-8 shadow-2xl relative flex flex-col items-center">
        {onClose && (
           <button onClick={onClose} className="absolute top-6 right-6 text-slate-500 hover:text-white transition-colors">
              <X className="w-6 h-6" />
           </button>
        )}

        {/* State 1: Ready / Recording */}
        {!isProcessing && !result && (
           <>
             <div className="text-center mb-8 mt-4">
                <h3 className="text-2xl font-bold mb-2">Voice AFAT Report</h3>
                <p className="text-sm text-slate-500 max-w-xs">Speak naturally in French, English, or Pidgin. AFAT AI will extract the hazard.</p>
             </div>

             <button
               onMouseDown={startRecording}
               onTouchStart={startRecording}
               onMouseUp={stopRecording}
               onTouchEnd={stopRecording}
               className={`w-32 h-32 rounded-full flex items-center justify-center transition-all ${
                 isRecording 
                   ? 'bg-red-500/20 text-red-500 border border-red-500 shadow-[0_0_60px_rgba(239,68,68,0.4)] scale-110' 
                   : 'bg-blue-600 hover:bg-blue-500 text-white shadow-xl shadow-blue-500/20 active:scale-95'
               }`}
             >
                {isRecording ? <Square className="w-12 h-12 animate-pulse" /> : <Mic className="w-12 h-12" />}
             </button>
             
             <p className={`mt-8 text-sm font-mono tracking-widest uppercase transition-opacity ${isRecording ? 'text-red-400 animate-pulse' : 'text-slate-500'}`}>
                {isRecording ? 'Recording... Release to Transmit' : 'Hold to Speak'}
             </p>
           </>
        )}

        {/* State 2: Processing */}
        {isProcessing && (
           <div className="flex flex-col items-center justify-center py-12">
              <div className="relative w-24 h-24 flex items-center justify-center mb-6">
                 <div className="absolute inset-0 border-4 border-t-blue-500 border-r-emerald-500 border-b-amber-500 border-l-purple-500 rounded-full animate-spin"></div>
                 <Mic className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-xl font-bold italic tracking-tight">AFAT LISTENING...</p>
              <p className="text-slate-500 text-sm font-mono uppercase tracking-widest mt-2">AFAT Intelligence Active</p>
           </div>
        )}

        {/* State 3: Result */}
        {result && (
           <div className="flex flex-col items-center w-full">
              <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mb-6 border border-emerald-500/20 self-center">
                 <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <h3 className="text-xl font-bold mb-6 text-center">Threat Logged (Verified Intel)</h3>
              
              <div className="bg-slate-950/50 w-full p-4 rounded-2xl border border-slate-800 space-y-3 mb-8">
                 <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Transcribed:</span>
                    <span className="font-medium text-right max-w-[200px] truncate">"{result.description}"</span>
                 </div>
                 <div className="h-px w-full bg-slate-800"></div>
                 <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Classification:</span>
                    <span className="font-bold uppercase text-amber-500">{result.type.replace('_', ' ')}</span>
                 </div>
                 <div className="h-px w-full bg-slate-800"></div>
                 <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500">Severity:</span>
                    <span className="font-bold">Level {result.severity}/5</span>
                 </div>
              </div>

              <button 
                onClick={() => { setResult(null); onClose?.(); }}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-xl transition-all"
              >
                 Return to Radar
              </button>
           </div>
        )}

        {error && !isProcessing && !result && (
           <div className="mt-6 flex items-start gap-2 text-red-400 bg-red-500/10 p-4 rounded-xl text-sm border border-red-500/20 w-full">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p>{error}</p>
           </div>
        )}
      </div>
    </div>
  );
}
