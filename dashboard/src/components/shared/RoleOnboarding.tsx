import React, { useEffect, useState } from 'react';
import { ShieldAlert, Zap, Navigation2, CheckCircle, X, ChevronRight } from 'lucide-react';

interface Props {
  role: 'commuter' | 'operator' | 'admin' | 'planner';
  isVisible: boolean;
  onClose: () => void;
  profile?: { subscription_tier?: string; vehicle_type?: string };
}

export function RoleOnboarding({ role, isVisible, onClose, profile }: Props) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (isVisible) setStep(0);
  }, [isVisible, role]);

  if (!isVisible) return null;

  const baseCommuter = [
    { title: "AFAT Intel Grid", desc: "Welcome to the future of urban mobility. Use the Map to find rides or report road hazards.", icon: ShieldAlert },
    { title: "Trust Points", desc: "Earn PTS by reporting incidents accurately. High trust users get priority bookings.", icon: Zap },
    { title: "One-Tap Booking", desc: "Scan a vehicle's QR or use the search to secure your seat instantly.", icon: Navigation2 }
  ];

  if (profile?.subscription_tier === 'guardian') {
    baseCommuter[0].title = "Sentinel Guardian Activated";
    baseCommuter[0].desc = "Thank you for subscribing to Guardian tier. You now have priority intelligence and direct reporting lines.";
  }

  const baseOperator = [
    { title: "Operator Terminal", desc: "Manage your route, accept bookings, and track your daily earnings in real-time.", icon: ShieldAlert },
    { title: "Verification", desc: "Ensure all passengers have valid tickets by scanning their QR code on boarding.", icon: CheckCircle },
    { title: "History", desc: "Your completed rides are logged automatically for transparent tontine reporting.", icon: Zap }
  ];

  if (profile?.vehicle_type === 'moto') {
    baseOperator[0].title = "Bendskin Terminal";
  } else if (profile?.vehicle_type === 'taxi') {
    baseOperator[0].title = "Taxi Ville Terminal";
  } else if (profile?.vehicle_type === 'minibus' || profile?.vehicle_type === 'bus') {
    baseOperator[0].title = "Transport Rapide Terminal";
  }

  const content = {
    commuter: baseCommuter,
    operator: baseOperator,
    admin: [
       { title: "Administrator control", desc: "Review people, access, operator approvals and platform health from the AFAT control center.", icon: ShieldAlert },
       { title: "Audited actions", desc: "High-impact access and operational changes remain attributable and can be suspended or reviewed.", icon: Zap }
    ],
    planner: [
       { title: "Operations planning", desc: "Coordinate dispatch, route conditions and mobility intelligence without receiving administrator powers.", icon: ShieldAlert },
       { title: "Live network picture", desc: "Use verified operational signals to plan interventions across Yaoundé and Douala.", icon: Navigation2 }
    ]
  };

  const steps = content[role] || content.commuter;
  const currentStep = steps[step];

  return (
    <div className="fixed inset-0 z-[5000] bg-slate-950/90 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-500">
      <div className="bg-slate-900 border border-white/10 rounded-[48px] p-10 max-w-sm w-full shadow-2xl relative overflow-hidden ring-1 ring-white/5">
        <button onClick={onClose} className="absolute top-8 right-8 text-slate-500 hover:text-white"><X className="w-6 h-6" /></button>
        
        <div className="flex flex-col items-center text-center">
          <div className="w-24 h-24 bg-white/10 rounded-[40px] flex items-center justify-center text-white mb-8 border border-white/20 shadow-xl shadow-white/10">
            <currentStep.icon className="w-12 h-12" />
          </div>
          
          <h2 className="text-2xl font-black mb-4 tracking-tight leading-tight uppercase italic">{currentStep.title}</h2>
          <p className="text-slate-400 text-sm font-bold opacity-80 mb-12">{currentStep.desc}</p>
          
          <div className="flex gap-2 mb-10">
             {steps.map((_, i) => (
               <div key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-8 bg-white' : 'w-2 bg-slate-800'}`}></div>
             ))}
          </div>

          <button
            onClick={() => step < steps.length - 1 ? setStep(step + 1) : onClose()}
            className="w-full bg-white hover:bg-slate-100 text-slate-950 py-5 rounded-[24px] font-black flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl shadow-white/10"
          >
            {step < steps.length - 1
              ? 'CONTINUE'
              : role === 'admin'
                ? 'OPEN ADMIN CONTROL'
                : role === 'planner'
                  ? 'OPEN PLANNER WORKSPACE'
                  : role === 'operator'
                    ? 'OPEN OPERATOR TERMINAL'
                    : 'OPEN PASSENGER WORKSPACE'}
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
