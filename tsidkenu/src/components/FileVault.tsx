"use client"
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, File, HardDrive, Cloud, CheckCircle, RefreshCw, Trash2, FolderPlus } from 'lucide-react';

export default function FileVault() {
  const [uploading, setUploading] = useState(false);
  const [files, setFiles] = useState([
    { name: 'Assignation_Fond.docx', size: '2.4 MB', type: 'Word', status: 'Synced' },
    { name: 'Evidence_Index_01.pdf', size: '1.1 MB', type: 'PDF', status: 'Synced' },
    { name: 'Corporate_Audit_v2.xlsx', size: '4.8 MB', type: 'Excel', status: 'Synced' }
  ]);

  const handleUpload = () => {
    setUploading(true);
    setTimeout(() => {
      setFiles([{ name: 'New_Draft_Upload.docx', size: '1.2 MB', type: 'Word', status: 'Syncing' }, ...files]);
      setTimeout(() => {
        setFiles(prev => prev.map(f => f.name === 'New_Draft_Upload.docx' ? { ...f, status: 'Synced' } : f));
        setUploading(false);
      }, 3000);
    }, 1000);
  };

  return (
    <section className="p-8 max-w-7xl mx-auto space-y-12 bg-paper-white min-h-screen">
      <div className="flex justify-between items-end border-b border-slate-200 pb-8">
        <div className="space-y-2">
          <h1 className="text-3xl heading-serif text-heritage-green">Sovereign File Vault</h1>
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold">Local Entry • OneDrive Enterprise Sync</p>
        </div>
        <div className="flex gap-4">
          <button className="px-6 py-2 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-100 transition-all flex items-center gap-2">
            <FolderPlus className="w-4 h-4" /> New Folder
          </button>
          <button 
            onClick={handleUpload}
            disabled={uploading}
            className="btn-classic text-xs flex items-center gap-2 shadow-lg"
          >
            <Upload className="w-4 h-4" /> {uploading ? 'Processing...' : 'Upload & Sync'}
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-8">
        {/* Sync Status Sidebar */}
        <div className="space-y-6">
           <div className="p-8 bg-slate-900 rounded-[3rem] text-white space-y-6 shadow-xl">
              <div className="flex items-center gap-3">
                 <Cloud className="w-6 h-6 text-emerald-400" />
                 <h3 className="text-xs font-black uppercase tracking-widest">OneDrive Bridge</h3>
              </div>
              <div className="space-y-2">
                 <div className="flex justify-between text-[10px] font-bold uppercase opacity-60">
                    <span>Sync Status</span>
                    <span className="text-emerald-400">Connected</span>
                 </div>
                 <div className="w-full h-1 bg-white/10 rounded-full">
                    <div className="w-full h-full bg-emerald-400 rounded-full" />
                 </div>
              </div>
              <p className="text-[10px] opacity-60 leading-relaxed font-medium">
                 All documents uploaded here are encrypted and mirrored to your firm's Microsoft Graph account.
              </p>
           </div>

           <div className="p-8 bg-white border border-slate-200 rounded-[3rem] space-y-4 shadow-sm">
              <div className="flex items-center gap-3 text-heritage-green">
                 <HardDrive className="w-5 h-5" />
                 <h4 className="text-[10px] font-black uppercase tracking-widest">Local Replica</h4>
              </div>
              <p className="text-[10px] text-slate-500 font-medium">
                 A high-speed copy of every file is kept on the **Sovereign Node** for instant, offline access during court hearings.
              </p>
           </div>
        </div>

        {/* File Grid */}
        <div className="md:col-span-3 space-y-6">
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <AnimatePresence>
                {files.map((file, i) => (
                  <motion.div 
                    key={file.name}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className="card-heritage p-6 bg-white border border-slate-200 rounded-3xl group hover:border-heritage-green transition-all shadow-sm relative"
                  >
                    <div className="space-y-4">
                       <div className="flex justify-between items-start">
                          <div className="w-10 h-10 bg-heritage-green/5 rounded-xl flex items-center justify-center text-heritage-green">
                             <File className="w-5 h-5" />
                          </div>
                          <button className="p-2 text-slate-200 hover:text-red-500 transition-colors">
                             <Trash2 className="w-4 h-4" />
                          </button>
                       </div>
                       <div>
                          <h4 className="text-sm font-bold text-slate-700 truncate">{file.name}</h4>
                          <p className="text-[10px] text-slate-400 uppercase">{file.size} • {file.type}</p>
                       </div>
                       <div className="flex justify-between items-center pt-2">
                          <div className="flex items-center gap-2">
                             {file.status === 'Synced' ? (
                               <CheckCircle className="w-3 h-3 text-emerald-500" />
                             ) : (
                               <RefreshCw className="w-3 h-3 text-orange-400 animate-spin" />
                             )}
                             <span className={`text-[10px] font-bold uppercase ${file.status === 'Synced' ? 'text-emerald-600' : 'text-orange-600'}`}>
                                {file.status}
                             </span>
                          </div>
                       </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
           </div>
        </div>
      </div>
    </section>
  );
}
