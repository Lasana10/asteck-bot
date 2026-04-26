import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Share2, X } from 'lucide-react';

interface QRCodeGeneratorProps {
  operatorId: string;
  vehiclePlate: string;
  onClose: () => void;
}

export const QRCodeGenerator: React.FC<QRCodeGeneratorProps> = ({ operatorId, vehiclePlate, onClose }) => {
  const [amount, setAmount] = useState<string>('');
  
  // The URL encoded in the QR code. 
  // It points to the PWA's payment page with the operator ID and optional preset amount.
  const paymentUrl = `${window.location.origin}/pay?operator=${operatorId}${amount ? `&amount=${amount}` : ''}`;

  const downloadQR = () => {
    const svg = document.getElementById('operator-qr');
    if (!svg) return;
    
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = img.width + 40;
      canvas.height = img.height + 100;
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 20, 20);
        ctx.fillStyle = 'black';
        ctx.font = 'bold 20px Inter';
        ctx.textAlign = 'center';
        ctx.fillText(`Taxi: ${vehiclePlate}`, canvas.width / 2, img.height + 50);
        ctx.font = '14px Inter';
        ctx.fillText('Scannez pour payer avec AFAT', canvas.width / 2, img.height + 80);
      }
      
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `AFAT_QR_${vehiclePlate}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="bg-blue-600 p-6 text-white flex justify-between items-center">
          <div>
            <h3 className="text-xl font-bold">Votre Code de Paiement</h3>
            <p className="text-blue-100 text-sm">Affichez ce code pour vos clients</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <div className="p-8 flex flex-col items-center">
          <div className="bg-gray-50 p-6 rounded-2xl border-4 border-dashed border-gray-200 mb-6">
            <QRCodeSVG 
              id="operator-qr"
              value={paymentUrl} 
              size={200}
              level="H"
              includeMargin={false}
              className="rounded-lg"
            />
          </div>
          
          <div className="text-center mb-8">
            <p className="text-gray-900 font-bold text-lg mb-1">{vehiclePlate}</p>
            <p className="text-gray-500 text-sm">ID: {operatorId.substring(0, 8)}...</p>
          </div>
          
          <div className="w-full space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 px-1">
                Montant Prédéfini (Facultatif)
              </label>
              <div className="relative">
                <input 
                  type="number" 
                  placeholder="Ex: 500"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full bg-gray-100 border-none rounded-xl py-3 pl-4 pr-12 focus:ring-2 focus:ring-blue-500 font-medium"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">F</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={downloadQR}
                className="flex items-center justify-center gap-2 bg-gray-900 text-white rounded-xl py-3 font-semibold hover:bg-gray-800 transition-colors"
              >
                <Download size={18} />
                Télécharger
              </button>
              <button 
                className="flex items-center justify-center gap-2 bg-blue-100 text-blue-700 rounded-xl py-3 font-semibold hover:bg-blue-200 transition-colors"
              >
                <Share2 size={18} />
                Partager
              </button>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-50 p-4 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400 italic">
            Les clients peuvent scanner ce code avec l'application AFAT pour vous payer instantanément.
          </p>
        </div>
      </div>
    </div>
  );
};
