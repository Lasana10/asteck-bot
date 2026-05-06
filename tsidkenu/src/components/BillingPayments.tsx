"use client"
import React from 'react';
import { motion } from 'framer-motion';
import { CreditCard, Wallet, Receipt, ArrowUpRight, ArrowDownLeft, ShieldCheck, Download } from 'lucide-react';
import { PaymentService } from '@/lib/payment-service/pawapay';

export default function BillingPayments() {
  const [financials, setFinancials] = React.useState<any>(null);

  React.useEffect(() => {
    PaymentService.getMatterFinancials("CM-2024-089").then(setFinancials);
  }, []);

  const transactions = [
    { date: "2024-05-02", desc: "Provision sur Honoraires", amount: "500,000 XAF", type: "Credit", method: "MTN MoMo" },
    { date: "2024-05-04", desc: "Frais de Greffe - TGI Douala", amount: "-50,000 XAF", type: "Debit", method: "Internal" },
    { date: "2024-05-05", desc: "Signification d'Acte", amount: "-25,000 XAF", type: "Debit", method: "Huissier" }
  ];

  return (
    <section className="p-8 max-w-7xl mx-auto space-y-12 bg-paper-white min-h-screen">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div className="space-y-2">
          <h1 className="text-3xl heading-serif text-heritage-green">Billing & Provisions</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Financial Engine • PawaPay Integrated</p>
        </div>
        <div className="flex gap-4">
          <button className="btn-classic text-xs">Generate Statement</button>
          <button className="px-4 py-2 border border-heritage-green text-heritage-green rounded font-bold text-xs hover:bg-heritage-green/5 transition-all">New Invoice</button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Main Financial Balance */}
        <div className="md:col-span-2 space-y-8">
          <div className="grid grid-cols-2 gap-6">
            <div className="card-heritage p-8 rounded-lg bg-heritage-green text-white shadow-xl">
               <div className="flex justify-between items-start mb-4">
                 <Wallet className="w-6 h-6 opacity-50" />
                 <span className="text-[10px] font-bold uppercase tracking-widest opacity-70">Escrow Balance</span>
               </div>
               <h2 className="text-4xl font-black mb-2">{financials?.balance.toLocaleString()} XAF</h2>
               <p className="text-xs opacity-60">Ready for procedural disbursements</p>
            </div>
            <div className="card-heritage p-8 rounded-lg bg-white border-slate-200">
               <div className="flex justify-between items-start mb-4">
                 <Receipt className="w-6 h-6 text-heritage-green" />
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Provisions</span>
               </div>
               <h2 className="text-4xl font-black text-heritage-green">{financials?.provisionReceived.toLocaleString()} XAF</h2>
               <p className="text-xs text-slate-400 font-medium">Secured via MTN / Orange Money</p>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
              <Receipt className="w-4 h-4" />
              Transaction Ledger
            </h3>
            <div className="space-y-4">
              {transactions.map((tx, i) => (
                <div key={i} className="card-heritage p-6 rounded-lg bg-white flex justify-between items-center group">
                  <div className="flex gap-4 items-center">
                    <div className={`w-10 h-10 rounded flex items-center justify-center ${tx.type === 'Credit' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                      {tx.type === 'Credit' ? <ArrowDownLeft className="w-5 h-5" /> : <ArrowUpRight className="w-5 h-5" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-heritage-green">{tx.desc}</h4>
                      <p className="text-[10px] text-slate-400 uppercase">{tx.date} • {tx.method}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-black ${tx.type === 'Credit' ? 'text-emerald-600' : 'text-slate-700'}`}>{tx.amount}</p>
                    <button className="text-[10px] text-slate-400 hover:text-heritage-green font-bold flex items-center gap-1 mt-1 uppercase">
                      <Download className="w-3 h-3" /> Proof
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Payment Actions */}
        <div className="space-y-8">
          <div className="glass p-6 rounded-lg space-y-6 border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-widest text-heritage-green">Request Provision</h3>
            <p className="text-[10px] text-slate-400 leading-relaxed italic">
              Send an instant payment prompt to the client via PawaPay (MTN / Orange Money).
            </p>
            <div className="space-y-4">
              <input type="text" placeholder="Amount (XAF)" className="w-full bg-paper-white border border-slate-200 rounded p-3 text-xs outline-none focus:ring-1 focus:ring-heritage-green" />
              <input type="text" placeholder="Client Phone Number" className="w-full bg-paper-white border border-slate-200 rounded p-3 text-xs outline-none focus:ring-1 focus:ring-heritage-green" />
              <div className="grid grid-cols-2 gap-4">
                <button className="py-2 bg-yellow-400 text-yellow-900 rounded font-black text-[10px] uppercase tracking-widest">MTN MOMO</button>
                <button className="py-2 bg-orange-500 text-white rounded font-black text-[10px] uppercase tracking-widest">ORANGE MONEY</button>
              </div>
            </div>
          </div>

          <div className="p-6 bg-slate-900 text-white rounded-lg space-y-4 shadow-xl">
             <div className="flex items-center gap-2">
               <ShieldCheck className="w-5 h-5 text-emerald-400" />
               <h4 className="text-sm font-bold heading-serif">Escrow Assurance</h4>
             </div>
             <p className="text-[10px] opacity-70 leading-relaxed">
               All provisions are stored in a secured firm account. Automatic VAT and fee calculation applied per OHADA bar standards.
             </p>
          </div>
        </div>
      </div>
    </section>
  );
}
