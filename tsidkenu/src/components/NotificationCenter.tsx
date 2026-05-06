"use client"
import React from 'react';
import { motion } from 'framer-motion';
import { Bell, MessageSquare, Mail, Smartphone, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function NotificationCenter() {
  const alerts = [
    { id: 1, type: 'SMS', title: 'Deadline Reminder', message: 'Assig. Société Maritime X expires in 48h.', time: '10 mins ago', status: 'Sent' },
    { id: 2, type: 'WHATSAPP', title: 'Urgent Case Update', message: 'New ruling uploaded by Advocate General.', time: '1 hour ago', status: 'Delivered' },
    { id: 3, type: 'EMAIL', title: 'Client Correspondence', message: 'Bolloré signed the Procuration Spéciale.', time: '3 hours ago', status: 'Read' }
  ];

  return (
    <section className="p-8 max-w-7xl mx-auto space-y-12 bg-paper-white min-h-screen">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div className="space-y-2">
          <h1 className="text-3xl heading-serif text-heritage-green">Alerts & Notifications</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Multi-Channel Communication • TSIDKENU Sentinel</p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Communication Log</h3>
          <div className="space-y-4">
            {alerts.map((alert) => (
              <div key={alert.id} className="card-heritage p-6 rounded-lg bg-white border border-slate-200 flex justify-between items-center group">
                <div className="flex gap-4">
                  <div className="w-10 h-10 bg-slate-50 rounded flex items-center justify-center">
                    {alert.type === 'SMS' && <Smartphone className="w-5 h-5 text-heritage-green" />}
                    {alert.type === 'WHATSAPP' && <MessageSquare className="w-5 h-5 text-emerald-500" />}
                    {alert.type === 'EMAIL' && <Mail className="w-5 h-5 text-blue-500" />}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-heritage-green">{alert.title}</h4>
                    <p className="text-xs text-slate-600">{alert.message}</p>
                    <p className="text-[10px] text-slate-400 uppercase mt-1">{alert.time} • {alert.type} Gateway</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
                    {alert.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-8">
          <div className="glass p-6 rounded-lg space-y-6 border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-widest text-heritage-green">Configure Channels</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-paper-white rounded border border-slate-100">
                <div className="flex items-center gap-3">
                  <Smartphone className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-bold">SMS Reminders</span>
                </div>
                <div className="w-8 h-4 bg-heritage-green rounded-full relative"><div className="absolute right-1 top-1 w-2 h-2 bg-white rounded-full" /></div>
              </div>
              <div className="flex justify-between items-center p-3 bg-paper-white rounded border border-slate-100">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-bold">WhatsApp Alerts</span>
                </div>
                <div className="w-8 h-4 bg-heritage-green rounded-full relative"><div className="absolute right-1 top-1 w-2 h-2 bg-white rounded-full" /></div>
              </div>
            </div>
          </div>

          <div className="p-6 bg-red-900 text-white rounded-lg space-y-4 shadow-xl">
             <div className="flex items-center gap-2">
               <ShieldAlert className="w-5 h-5 text-orange-400" />
               <h4 className="text-sm font-bold heading-serif">Procedure Guard</h4>
             </div>
             <p className="text-[10px] opacity-70 leading-relaxed">
               The system will automatically trigger emergency alerts if a court deadline is within 24 hours and no documentation has been contextualized.
             </p>
          </div>
        </div>
      </div>
    </section>
  );
}
