import React, { useState } from 'react';
import { Camera, Shield, FileText, UploadCloud, ChevronRight, X, Compass, AlertTriangle, Zap, CheckCircle, Users, Phone } from 'lucide-react';
import { registerCompany, registerDriver, registerPassenger } from '../../supabaseClient';

interface Props {
  isVisible: boolean;
  onClose: () => void;
  onRegisterCustom: (data: any) => void;
}

type RegistrationTrack = 'select' | 'commuter' | 'gov_link' | 'citizen_reg' | 'company';

const SERVICE_CATEGORIES = [
  { id: 'moto', label: 'Moto / Bike' },
  { id: 'taxi', label: 'Taxi' },
  { id: 'delivery', label: 'Delivery' },
  { id: 'minibus', label: 'Minibus' },
  { id: 'bus', label: 'Bus / Coach' },
  { id: 'agency', label: 'Agency Fleet' },
];

const COMPANY_TYPES = [
  'Transport agency',
  'Taxi union',
  'Bike network',
  'Delivery company',
  'Corporate mobility',
  'Public / municipal partner',
];

const SERVICE_PLAYBOOK: Record<string, {
  title: string;
  focus: string;
  docs: string[];
  zoneLabel: string;
  affiliationLabel: string;
  capacityHint: string;
}> = {
  moto: {
    title: 'Bike rider onboarding',
    focus: 'Fast urban movement with stronger rider safety and identity checks.',
    docs: ['National ID', 'Bike ownership', 'Helmet compliance'],
    zoneLabel: 'Pickup zone / corridor',
    affiliationLabel: 'Bike network / stand',
    capacityHint: 'Usually 1'
  },
  taxi: {
    title: 'Taxi operator onboarding',
    focus: 'Passenger trust, route coverage, and plate-level verification.',
    docs: ['National ID', 'Driver license', 'Insurance', 'Vehicle registration'],
    zoneLabel: 'Operating district / route',
    affiliationLabel: 'Taxi union / agency',
    capacityHint: 'Usually 4'
  },
  delivery: {
    title: 'Delivery node onboarding',
    focus: 'Dispatch readiness, cargo reliability, and route discipline.',
    docs: ['National ID', 'Driver license', 'Insurance', 'Vehicle proof'],
    zoneLabel: 'Delivery corridor / coverage zone',
    affiliationLabel: 'Delivery company / network',
    capacityHint: 'Driver + cargo mode'
  },
  minibus: {
    title: 'Minibus onboarding',
    focus: 'Shared-route operations with fleet and route compliance visibility.',
    docs: ['National ID', 'Commercial license', 'Insurance', 'Vehicle registration'],
    zoneLabel: 'Terminal / route corridor',
    affiliationLabel: 'Union / route owner',
    capacityHint: 'Usually 12-18'
  },
  bus: {
    title: 'Bus / coach onboarding',
    focus: 'Intercity or scheduled service with heavier compliance packaging.',
    docs: ['National ID', 'Commercial license', 'Fleet insurance', 'Route permit'],
    zoneLabel: 'Primary corridor / destination network',
    affiliationLabel: 'Transport company / authority',
    capacityHint: 'Usually 25+'
  },
  agency: {
    title: 'Agency fleet onboarding',
    focus: 'Multi-vehicle launch, coordinator control, and operator standardization.',
    docs: ['Business registration', 'Fleet insurance', 'Operating permit', 'Coordinator ID'],
    zoneLabel: 'Coverage area',
    affiliationLabel: 'Agency / operator group',
    capacityHint: 'Fleet-defined'
  }
};

const COMPANY_PLAYBOOK: Record<string, { packageName: string; focus: string; docs: string[] }> = {
  'Transport agency': {
    packageName: 'Fleet Launch',
    focus: 'Vehicle, route, coordinator, and permit readiness.',
    docs: ['Business registration', 'Operating permit', 'Fleet insurance']
  },
  'Taxi union': {
    packageName: 'Union Activation',
    focus: 'Taxi member rollout, route governance, and payment readiness.',
    docs: ['Union authorization', 'Member roster', 'Insurance proof']
  },
  'Bike network': {
    packageName: 'Bike Safety Pack',
    focus: 'Helmet safety, rider verification, and zone-based dispatch.',
    docs: ['Network registration', 'Rider compliance plan', 'Safety policy']
  },
  'Delivery company': {
    packageName: 'Delivery Ops Pack',
    focus: 'Dispatch, service levels, and rider or van compliance.',
    docs: ['Business registration', 'Fleet proof', 'Service coverage plan']
  },
  'Corporate mobility': {
    packageName: 'Enterprise Mobility',
    focus: 'Client movement, booking control, and assigned fleet visibility.',
    docs: ['Business registration', 'Service agreement', 'Fleet or partner proof']
  },
  'Public / municipal partner': {
    packageName: 'Public Operations',
    focus: 'Authority coordination, controlled routes, and service governance.',
    docs: ['Mandate letter', 'Operating framework', 'Insurance or public cover']
  }
};

export function RegistrationHub({ isVisible, onClose, onRegisterCustom }: Props) {
  const [track, setTrack] = useState<RegistrationTrack>('select');
  const [govId, setGovId] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [isScanningQR, setIsScanningQR] = useState(false);

  // Citizen Track State
  const [vehicleType, setVehicleType] = useState('taxi');
  const [driverName, setDriverName] = useState('');
  const [phone, setPhone] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [commuterCity, setCommuterCity] = useState('');
  const [commuterZone, setCommuterZone] = useState('');
  const [driverNationalId, setDriverNationalId] = useState('');
  const [driverLicenseNumber, setDriverLicenseNumber] = useState('');
  const [driverCapacity, setDriverCapacity] = useState('');
  const [baseCity, setBaseCity] = useState('');
  const [operatingZone, setOperatingZone] = useState('');
  const [affiliationName, setAffiliationName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [fleetSize, setFleetSize] = useState('');
  const [companyType, setCompanyType] = useState(COMPANY_TYPES[0]);
  const [serviceCoverage, setServiceCoverage] = useState('');
  const [companyNotes, setCompanyNotes] = useState('');
  const [errorText, setErrorText] = useState('');

  if (!isVisible) return null;

  const serviceProfile = SERVICE_PLAYBOOK[vehicleType] || SERVICE_PLAYBOOK.taxi;
  const companyProfile = COMPANY_PLAYBOOK[companyType] || COMPANY_PLAYBOOK['Transport agency'];

  const handleGovLinkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText('');
    setLoading(true);

    registerDriver({
      full_name: driverName || `Strategic Operator ${govId.split('-').pop() || 'AFAT'}`,
      phone,
      national_id: govId,
      license_number: driverLicenseNumber || `SEC-${govId.split('-').pop() || Date.now().toString(36).toUpperCase()}`,
      vehicle_type: vehicleType || 'taxi',
      vehicle_plate: plateNumber,
      vehicle_capacity: driverCapacity ? Number(driverCapacity) : 4,
      base_city: baseCity || null,
      operating_zone: operatingZone || null,
      affiliation_name: affiliationName || null,
    }).then(({ data, error }) => {
      setLoading(false);

      if (error) {
        setErrorText(error.message);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        onRegisterCustom({ 
          id: data?.driver?.id,
          role: 'operator', 
          vehicleType: vehicleType || 'custom_security',
          ids_number: data?.driver?.contractor_code || govId,
          cni_number: govId.split('-').pop(),
          plate_number: data?.driver?.vehicle?.plate_number || plateNumber,
          full_name: driverName || `Strategic Operator ${govId.split('-').pop() || 'AFAT'}`
        });
        onClose();
      }, 1500);
    });
  };

  const simulateQRScan = () => {
    setIsScanningQR(true);
    setTimeout(() => {
      setIsScanningQR(false);
      setGovId('CMR-MOTO-QR981');
      setPlateNumber('CE 882 MX');
    }, 2500);
  };

  const handleCitizenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText('');
    setLoading(true);

    registerDriver({
      full_name: driverName,
      phone,
      national_id: driverNationalId || govId || `AFAT-${Date.now().toString(36).toUpperCase()}`,
      license_number: driverLicenseNumber || `LIC-${Date.now().toString(36).toUpperCase()}`,
      vehicle_type: vehicleType,
      vehicle_plate: plateNumber || null,
      vehicle_capacity: driverCapacity ? Number(driverCapacity) : vehicleType === 'moto' ? 1 : vehicleType === 'bus' ? 30 : vehicleType === 'minibus' ? 14 : 4,
      base_city: baseCity || null,
      operating_zone: operatingZone || null,
      affiliation_name: affiliationName || null,
    }).then(({ data, error }) => {
      setLoading(false);

      if (error) {
        setErrorText(error.message);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        onRegisterCustom({
          id: data?.driver?.id,
          role: 'operator',
          vehicleType,
          ids_number: data?.driver?.contractor_code,
          plate_number: data?.driver?.vehicle?.plate_number || plateNumber
        });
        onClose();
      }, 1500);
    });
  };

  const handleCommuterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText('');
    setLoading(true);

    const { data, error } = await registerPassenger({
      full_name: driverName,
      phone,
      emergency_contact: emergencyContact || null,
      preferred_city: commuterCity || null,
      preferred_zone: commuterZone || null,
    });

    setLoading(false);

    if (error) {
      setErrorText(error.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      onRegisterCustom({
        id: data?.user?.id,
        role: 'commuter',
        full_name: data?.user?.full_name || driverName,
      });
      onClose();
    }, 1500);
  };

  const handleCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText('');
    setLoading(true);

    const { data, error } = await registerCompany({
      company_name: companyName,
      phone,
      contact_person: contactPerson || null,
      fleet_size: fleetSize ? Number(fleetSize) : null,
      company_type: companyType,
      service_coverage: serviceCoverage || null,
      notes: [companyType, serviceCoverage, companyNotes].filter(Boolean).join(' | '),
    });

    setLoading(false);

    if (error) {
      setErrorText(error.message);
      return;
    }

    setSuccess(true);
    setTimeout(() => {
      onRegisterCustom({
        id: data?.profile?.id,
        role: 'planner',
        full_name: data?.profile?.full_name || contactPerson || companyName,
        company_name: data?.company?.company_name || companyName,
      });
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[6000] bg-slate-950/90 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-white/5 rounded-[40px] w-full max-w-md shadow-2xl relative overflow-hidden ring-1 ring-white/10 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 pb-4 border-b border-white/5 flex items-center justify-between sticky top-0 bg-slate-900/80 backdrop-blur z-10">
          <div>
            <h2 className="text-xl font-black uppercase italic tracking-tighter text-white">AFAT Sentinel Hub</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
              {track === 'select' ? 'Identity Gateway' :
               track === 'gov_link' ? 'Strategic Clearance' :
               track === 'commuter' ? 'Commuter Access' :
               track === 'company' ? 'Fleet Enrollment' :
               'Node Registration'}
            </p>
          </div>
          <button onClick={onClose} className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto no-scrollbar flex-1">
          {success ? (
            <div className="flex flex-col items-center justify-center py-10 animate-in zoom-in duration-500">
              <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20 mb-6 shadow-[0_0_40px_rgba(34,197,94,0.2)]">
                <CheckCircle className="w-12 h-12 text-green-500" />
              </div>
              <h3 className="text-2xl font-black text-white uppercase italic tracking-tight mb-2">Identity Verified</h3>
              <p className="text-sm text-slate-400 text-center font-bold">Welcome to the AFAT Mobility Grid. Your vehicle blueprint is active.</p>
            </div>
          ) : track === 'select' ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-400 mb-6 font-medium leading-relaxed">
                Select your registration stream to join the intelligence network. High-security profiles and standard operators follow different clearance paths.
              </p>

              <button 
                onClick={() => setTrack('commuter')}
                className="w-full bg-emerald-950/30 border border-emerald-500/30 rounded-3xl p-6 text-left hover:bg-emerald-900/40 hover:border-emerald-400/50 transition-all group"
              >
                <Users className="w-8 h-8 text-emerald-400 mb-4" />
                <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1">Track 0: Commuter</h3>
                <p className="text-xs text-emerald-100/60 font-medium">Fast passenger access for booking, guardian safety, tickets, and live trip intelligence.</p>
              </button>

              <button 
                onClick={() => setTrack('gov_link')}
                className="w-full bg-blue-950/30 border border-blue-500/30 rounded-3xl p-6 text-left hover:bg-blue-900/40 hover:border-blue-400/50 transition-all group relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent translate-x-[-100%] group-hover:translate-x-[0%] transition-transform duration-500"></div>
                <Shield className="w-8 h-8 text-blue-400 mb-4" />
                <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1">Track A: Government Link</h3>
                <p className="text-xs text-blue-200/60 font-medium">For pre-cleared state vehicles, accredited transport unions, and security fleet operators.</p>
              </button>

              <button 
                onClick={() => setTrack('citizen_reg')}
                className="w-full bg-white/5 border border-white/10 rounded-3xl p-6 text-left hover:bg-white/10 hover:border-white/20 transition-all group"
              >
                <Compass className="w-8 h-8 text-slate-300 mb-4" />
                <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1">Track B: Independent Node</h3>
                <p className="text-xs text-slate-400 font-medium">Standard registration for new Taxis, Motos, and independent Minibus operators.</p>
              </button>

              <button 
                onClick={() => setTrack('company')}
                className="w-full bg-amber-950/30 border border-amber-500/30 rounded-3xl p-6 text-left hover:bg-amber-900/40 hover:border-amber-400/50 transition-all group"
              >
                <FileText className="w-8 h-8 text-amber-400 mb-4" />
                <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1">Track C: Company / Fleet</h3>
                <p className="text-xs text-amber-100/60 font-medium">For agencies, unions, and fleet coordinators preparing multi-vehicle onboarding and route operations.</p>
              </button>
            </div>
          ) : track === 'commuter' ? (
            <form onSubmit={handleCommuterSubmit} className="space-y-5 animate-in slide-in-from-right-4 duration-300">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Full Name</label>
                <input required type="text" value={driverName} onChange={e=>setDriverName(e.target.value)} placeholder="Marie Atangana" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-medium" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Phone Number</label>
                <div className="flex bg-slate-950 border border-white/10 rounded-2xl overflow-hidden">
                  <span className="flex items-center px-4 text-slate-400 font-mono border-r border-white/10">+237</span>
                  <input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="6XX XXX XXX" className="w-full bg-transparent px-5 py-4 text-white placeholder-slate-600 focus:outline-none font-mono" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Emergency Contact</label>
                <input type="tel" value={emergencyContact} onChange={e=>setEmergencyContact(e.target.value)} placeholder="Optional guardian line" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Home City</label>
                  <input type="text" value={commuterCity} onChange={e=>setCommuterCity(e.target.value)} placeholder="Yaounde" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-medium" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Usual Zone</label>
                  <input type="text" value={commuterZone} onChange={e=>setCommuterZone(e.target.value)} placeholder="Bastos / Akwa" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-medium" />
                </div>
              </div>

              {errorText && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{errorText}</div>}

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setTrack('select')} className="w-14 h-14 shrink-0 rounded-2xl border border-white/10 flex items-center justify-center text-slate-400 hover:bg-white/5 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
                <button disabled={loading || !driverName || !phone} type="submit" className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/50 text-slate-950 rounded-2xl font-black uppercase text-sm flex items-center justify-center gap-2 transition-all">
                  {loading ? <Zap className="w-5 h-5 animate-pulse text-slate-950" /> : 'Create Commuter Access'}
                </button>
              </div>
            </form>
          ) : track === 'gov_link' ? (
            <form onSubmit={handleGovLinkSubmit} className="space-y-5 animate-in slide-in-from-right-4 duration-300">
              <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-2xl flex gap-4 mb-6">
                <Shield className="w-6 h-6 text-blue-400 shrink-0" />
                <p className="text-xs text-blue-100/80 leading-relaxed font-medium">
                  This portal connects directly to the Strategic Identity Database. Scan your physical jacket QR or enter your credentials to port your secure vehicle blueprint to the AFAT grid.
                </p>
              </div>

              <div className="rounded-3xl border border-blue-500/20 bg-blue-950/20 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-300/70">Service Package</p>
                    <h3 className="mt-2 text-base font-black uppercase tracking-tight text-white">{serviceProfile.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-blue-100/70">{serviceProfile.focus}</p>
                  </div>
                  <div className="rounded-2xl border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-200">
                    Cleared lane
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2">
                  {serviceProfile.docs.slice(0, 3).map((doc) => (
                    <div key={doc} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-[11px] font-bold text-white/75">
                      {doc}
                    </div>
                  ))}
                </div>
              </div>

              {isScanningQR ? (
                <div className="bg-slate-950 border border-blue-500/30 rounded-2xl p-8 flex flex-col items-center justify-center relative overflow-hidden h-48">
                  <div className="absolute inset-0 bg-blue-500/10 animate-pulse"></div>
                  <div className="w-full h-1 bg-blue-400 absolute top-0 left-0 animate-[routeDraw_2s_ease-in-out_infinite] blur-sm"></div>
                  <Camera className="w-12 h-12 text-blue-400 mb-4 animate-bounce" />
                  <p className="text-sm font-black text-white uppercase tracking-widest relative z-10">Scanning Jacket QR...</p>
                  <p className="text-[10px] text-blue-300 font-mono mt-2 relative z-10 animate-pulse">Align QR code within frame</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <button 
                    type="button" 
                    onClick={simulateQRScan}
                    className="w-full bg-blue-600/20 border border-blue-500/50 hover:bg-blue-600/30 text-blue-300 rounded-2xl p-4 flex items-center justify-center gap-3 transition-colors group"
                  >
                    <div className="p-2 bg-blue-500/20 rounded-lg group-hover:bg-blue-500/40 transition-colors">
                      <Camera className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="text-left flex-1">
                      <p className="text-sm font-black uppercase tracking-wider">Scan Physical QR</p>
                      <p className="text-[10px] uppercase font-mono tracking-widest opacity-70">Jacket or Official Badge</p>
                    </div>
                  </button>

                  <div className="flex items-center gap-4 py-2">
                    <div className="h-px flex-1 bg-white/10"></div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">OR MANUAL ENTRY</span>
                    <div className="h-px flex-1 bg-white/10"></div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Operator Name</label>
                    <input type="text" value={driverName} onChange={e=>setDriverName(e.target.value)} placeholder="Cleared operator name" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 font-medium" />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Gov Identity Number (CNI / QR ID)</label>
                    <input required type="text" value={govId} onChange={e=>setGovId(e.target.value)} placeholder="e.g., CM-2026-X891" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono" />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">License / Accreditation Number</label>
                    <input type="text" value={driverLicenseNumber} onChange={e=>setDriverLicenseNumber(e.target.value)} placeholder="Official license or clearance code" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono" />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Secured Plate Number</label>
                    <input required type="text" value={plateNumber} onChange={e=>setPlateNumber(e.target.value)} placeholder="CE 123 AB" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono text-lg uppercase" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Service Type</label>
                      <select value={vehicleType} onChange={e => setVehicleType(e.target.value)} className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-blue-500">
                        {SERVICE_CATEGORIES.filter((item) => item.id !== 'agency').map((item) => (
                          <option key={item.id} value={item.id}>{item.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Capacity</label>
                      <input type="number" min="1" value={driverCapacity} onChange={e=>setDriverCapacity(e.target.value)} placeholder="4" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 font-mono" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Operator Phone</label>
                    <div className="flex bg-slate-950 border border-white/10 rounded-2xl overflow-hidden">
                      <span className="flex items-center px-4 text-slate-400 font-mono border-r border-white/10">+237</span>
                      <input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="6XX XXX XXX" className="w-full bg-transparent px-5 py-4 text-white placeholder-slate-600 focus:outline-none font-mono" />
                    </div>
                  </div>
                </div>
              )}

              {errorText && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{errorText}</div>}

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setTrack('select')} className="w-14 h-14 shrink-0 rounded-2xl border border-white/10 flex items-center justify-center text-slate-400 hover:bg-white/5 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
                <button disabled={loading || !govId || !plateNumber || isScanningQR} type="submit" className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white rounded-2xl font-black uppercase text-sm flex items-center justify-center gap-2 transition-all">
                  {loading ? <Zap className="w-5 h-5 animate-pulse" /> : 'Execute Clearance'}
                </button>
              </div>
            </form>
          ) : track === 'citizen_reg' ? (
            <form onSubmit={handleCitizenSubmit} className="space-y-5 animate-in slide-in-from-right-4 duration-300">
               <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Full Name</label>
                <input required type="text" value={driverName} onChange={e=>setDriverName(e.target.value)} placeholder="Jean Dupont" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-slate-500 font-medium" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Phone Number</label>
                <div className="flex bg-slate-950 border border-white/10 rounded-2xl overflow-hidden">
                  <span className="flex items-center px-4 text-slate-400 font-mono border-r border-white/10">+237</span>
                  <input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="6XX XXX XXX" className="w-full bg-transparent px-5 py-4 text-white placeholder-slate-600 focus:outline-none font-mono" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">National ID</label>
                  <input type="text" value={driverNationalId} onChange={e=>setDriverNationalId(e.target.value)} placeholder="CNI / national ID" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-slate-500 font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">License Number</label>
                  <input type="text" value={driverLicenseNumber} onChange={e=>setDriverLicenseNumber(e.target.value)} placeholder="Permit / license" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-slate-500 font-mono" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Plate Number</label>
                <input type="text" value={plateNumber} onChange={e=>setPlateNumber(e.target.value)} placeholder="CE 123 AB" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-slate-500 font-mono uppercase" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Vehicle Chassis Type</label>
                <div className="grid grid-cols-2 gap-3">
                  {['moto', 'taxi', 'delivery', 'minibus', 'bus'].map(vt => (
                    <button key={vt} type="button" onClick={() => setVehicleType(vt)} className={`p-4 rounded-2xl border transition-all flex flex-col items-center gap-2 ${vehicleType === vt ? 'bg-white text-slate-900 border-white' : 'bg-slate-950 border-white/10 text-slate-400 hover:bg-slate-900'}`}>
                      <span className="text-2xl">{vt === 'moto' ? '🏍️' : vt === 'taxi' ? '🚕' : vt === 'delivery' ? '📦' : vt === 'minibus' ? '🚐' : '🚌'}</span>
                      <span className="text-xs font-black uppercase tracking-wider">{vt}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/35">Onboarding Package</p>
                    <h3 className="mt-2 text-base font-black uppercase tracking-tight text-white">{serviceProfile.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-white/60">{serviceProfile.focus}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-300">
                    Core intake
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2">
                  {serviceProfile.docs.map((doc) => (
                    <div key={doc} className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3 text-[11px] font-bold text-white/75">
                      {doc}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Vehicle Capacity</label>
                  <input type="number" min="1" value={driverCapacity} onChange={e=>setDriverCapacity(e.target.value)} placeholder={serviceProfile.capacityHint} className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-slate-500 font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Base City</label>
                  <input type="text" value={baseCity} onChange={e=>setBaseCity(e.target.value)} placeholder="Douala / Yaounde" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-slate-500 font-medium" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">{serviceProfile.zoneLabel}</label>
                <input type="text" value={operatingZone} onChange={e=>setOperatingZone(e.target.value)} placeholder="Mokolo, Bonamoussadi, union, agency, delivery corridor" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-slate-500 font-medium" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">{serviceProfile.affiliationLabel}</label>
                <input type="text" value={affiliationName} onChange={e=>setAffiliationName(e.target.value)} placeholder="Optional company, union, delivery network" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-slate-500 font-medium" />
              </div>

              <div className="p-5 border border-dashed border-white/20 rounded-2xl bg-white/5 flex flex-col items-center justify-center gap-2 text-center mt-2 cursor-pointer hover:bg-white/10 transition-colors">
                <UploadCloud className="w-8 h-8 text-slate-400 mb-1" />
                <p className="text-sm font-bold text-white uppercase tracking-tight">Upload Documents</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Permit • Insurance • Vehicle Photo • National ID</p>
              </div>

              {errorText && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{errorText}</div>}

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setTrack('select')} className="w-14 h-14 shrink-0 rounded-2xl border border-white/10 flex items-center justify-center text-slate-400 hover:bg-white/5 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
                <button disabled={loading || !driverName} type="submit" className="flex-1 bg-white hover:bg-slate-200 disabled:bg-white/50 text-slate-950 rounded-2xl font-black uppercase text-sm flex items-center justify-center gap-2 transition-all">
                  {loading ? <Zap className="w-5 h-5 animate-pulse text-slate-900" /> : 'Submit for Verification'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleCompanySubmit} className="space-y-5 animate-in slide-in-from-right-4 duration-300">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Company or Union Name</label>
                <input required type="text" value={companyName} onChange={e=>setCompanyName(e.target.value)} placeholder="AFAT Express Union" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 font-medium" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Coordinator Name</label>
                <input required type="text" value={contactPerson} onChange={e=>setContactPerson(e.target.value)} placeholder="Operations lead" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 font-medium" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Contact Phone</label>
                <div className="flex bg-slate-950 border border-white/10 rounded-2xl overflow-hidden">
                  <span className="flex items-center px-4 text-slate-400 font-mono border-r border-white/10">+237</span>
                  <input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="6XX XXX XXX" className="w-full bg-transparent px-5 py-4 text-white placeholder-slate-600 focus:outline-none font-mono" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Estimated Fleet Size</label>
                <input type="number" min="1" value={fleetSize} onChange={e=>setFleetSize(e.target.value)} placeholder="12" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 font-mono" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Organization Type</label>
                <select value={companyType} onChange={e=>setCompanyType(e.target.value)} className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white focus:outline-none focus:border-amber-500">
                  {COMPANY_TYPES.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div className="rounded-3xl border border-amber-500/20 bg-amber-950/20 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-200/60">Activation Package</p>
                    <h3 className="mt-2 text-base font-black uppercase tracking-tight text-white">{companyProfile.packageName}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-amber-100/70">{companyProfile.focus}</p>
                  </div>
                  <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-amber-200">
                    Fleet ops
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-2">
                  {companyProfile.docs.map((doc) => (
                    <div key={doc} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-[11px] font-bold text-white/75">
                      {doc}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Service Coverage</label>
                <input type="text" value={serviceCoverage} onChange={e=>setServiceCoverage(e.target.value)} placeholder="Taxi, bike, delivery, school, airport, city-to-city" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 font-medium" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Operational Notes</label>
                <textarea value={companyNotes} onChange={e=>setCompanyNotes(e.target.value)} rows={3} placeholder="Cities, compliance needs, fleet mix, dispatch expectations" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 font-medium resize-none" />
              </div>

              {errorText && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{errorText}</div>}

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setTrack('select')} className="w-14 h-14 shrink-0 rounded-2xl border border-white/10 flex items-center justify-center text-slate-400 hover:bg-white/5 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
                <button disabled={loading || !companyName || !contactPerson || !phone} type="submit" className="flex-1 bg-amber-400 hover:bg-amber-300 disabled:bg-amber-400/50 text-slate-950 rounded-2xl font-black uppercase text-sm flex items-center justify-center gap-2 transition-all">
                  {loading ? <Zap className="w-5 h-5 animate-pulse text-slate-950" /> : 'Enroll Fleet'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
