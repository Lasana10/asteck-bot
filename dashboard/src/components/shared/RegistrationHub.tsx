import React, { useEffect, useState } from 'react';
import { Building2, Shield, FileText, UploadCloud, ChevronRight, X, Compass, Zap, CheckCircle, Users } from 'lucide-react';
import { registerCompany, registerDriver, registerPassenger, registerPublicPartner } from '../../supabaseClient';

interface Props {
  isVisible: boolean;
  onClose: () => void;
  onRegisterCustom: (data: any) => void | Promise<void>;
  initialTrack?: RegistrationTrack;
  prefillPhone?: string;
  hasAuthenticatedSession?: boolean;
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

function explainRegistrationError(message?: string) {
  const raw = message || 'Registration failed.';
  const lower = raw.toLowerCase();

  if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('load failed')) {
    return 'AFAT cannot reach the mobility service right now. Please retry shortly.';
  }

  if (lower.includes('duplicate') || lower.includes('already') || lower.includes('unique')) {
    return 'This identity already exists. Sign in with the same email, or ask AFAT support to recover the profile.';
  }

  if (lower.includes('auth_required_for_onboarding') || lower.includes('sign in before registration')) {
    return 'Sign in with email or Google first, then reopen registration. AFAT needs the account session to attach commuter, operator, and company intake safely.';
  }

  if (lower.includes('row-level security') || lower.includes('permission') || lower.includes('unauthorized')) {
    return 'AFAT could not complete this protected action. Sign in again or contact support.';
  }

  return raw;
}

function getCompletionCopy(track: RegistrationTrack) {
  if (track === 'commuter') {
    return {
      title: 'Commuter Profile Active',
      body: 'Your passenger access is ready for booking, guardian safety, reports, and route-truth missions.'
    };
  }

  if (track === 'company') {
    return {
      title: 'Fleet Workspace Created',
      body: 'Your company intake and owner membership are saved. Fleet verification continues here; AFAT Planner and Admin authority remain separate.'
    };
  }

  if (track === 'gov_link') {
    return {
      title: 'Public Partner Workspace Created',
      body: 'The institution and representative membership are saved for mandate review. This does not grant AFAT Planner or Admin authority.'
    };
  }

  return {
    title: 'Operator Intake Saved',
    body: 'Your driver/operator profile is registered. Vehicle verification, compliance status, and service readiness continue inside AFAT.'
  };
}

export function getCompletionCopyForStatus(track: RegistrationTrack, intakeStatus?: string | null, applicationStatus?: string | null) {
  if (track === 'commuter' && intakeStatus === 'phone_first_partial') {
    return {
      title: 'Commuter Intake Saved',
      body: 'AFAT created a phone-first commuter profile. Name, city, and safety preferences can be completed later without blocking access.'
    };
  }

  if (track === 'citizen_reg' && String(applicationStatus || '').toUpperCase() === 'APPROVED') {
    return {
      title: 'Operator Access Active',
      body: 'This account was already approved by AFAT. The operator terminal is available now; no new approval was created by this registration update.'
    };
  }

  if (track === 'citizen_reg' && intakeStatus === 'verification_ready') {
    return {
      title: 'Operator Review Started',
      body: 'AFAT received the operator file and opened review. Dispatch, live bookings, and marketplace activation begin after approval from operations.'
    };
  }

  if (track === 'citizen_reg' && intakeStatus && intakeStatus !== 'verification_ready') {
    return {
      title: 'Operator Intake Saved',
      body: 'AFAT accepted this operator as a partial intake. Missing documents, compliance follow-up, and approval still need to be completed before live service activation.'
    };
  }

  if (track === 'company' && intakeStatus === 'partial_intake') {
    return {
      title: 'Fleet Intake Saved',
      body: 'AFAT opened the fleet workspace, but coordinator or company details still need follow-up before organisation approval.'
    };
  }

  if (track === 'company' && intakeStatus === 'verification_ready') {
    return {
      title: 'Fleet Review Opened',
      body: 'AFAT received the company file. Fleet operations remain organisation-scoped; AFAT Planner and Admin authority require separate staff invitations.'
    };
  }

  if (track === 'gov_link' && intakeStatus === 'under_review') {
    return {
      title: 'Public Partner Review Opened',
      body: 'AFAT received the institution, mandate and representative details. The workspace is limited to aggregated public-mobility coordination while verification continues.'
    };
  }

  if (track === 'gov_link' && intakeStatus === 'partial_intake') {
    return {
      title: 'Public Partner Intake Saved',
      body: 'The institution workspace exists, but registration, jurisdiction or mandate evidence still requires completion.'
    };
  }

  return getCompletionCopy(track);
}

export function RegistrationHub({ isVisible, onClose, onRegisterCustom, initialTrack = 'select', prefillPhone = '', hasAuthenticatedSession = false }: Props) {
  const [track, setTrack] = useState<RegistrationTrack>('select');
  const [govId, setGovId] = useState('');
  const [plateNumber, setPlateNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

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
  const [completionState, setCompletionState] = useState<{ title: string; body: string } | null>(null);
  const [completionAction, setCompletionAction] = useState('Continue to workspace');

  useEffect(() => {
    if (!isVisible) return;
    setTrack(initialTrack);
    setSuccess(false);
    setErrorText('');
    setCompletionState(null);
    setCompletionAction('Continue to workspace');
    if (prefillPhone) {
      setPhone(prefillPhone.replace(/^\+?237/, '').trim());
    }
  }, [initialTrack, isVisible, prefillPhone]);

  useEffect(() => {
    if (!isVisible) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isVisible, loading, onClose]);

  const openTrack = (nextTrack: RegistrationTrack) => {
    setDriverName('');
    setGovId('');
    setPlateNumber('');
    setEmergencyContact('');
    setCommuterCity('');
    setCommuterZone('');
    setDriverNationalId('');
    setDriverLicenseNumber('');
    setDriverCapacity('');
    setBaseCity('');
    setOperatingZone('');
    setAffiliationName('');
    setCompanyName('');
    setContactPerson('');
    setFleetSize('');
    setServiceCoverage('');
    setCompanyNotes('');
    setErrorText('');
    setTrack(nextTrack);
  };

  if (!isVisible) return null;

  const serviceProfile = SERVICE_PLAYBOOK[vehicleType] || SERVICE_PLAYBOOK.taxi;
  const companyProfile = COMPANY_PLAYBOOK[companyType] || COMPANY_PLAYBOOK['Transport agency'];
  const completionCopy = completionState || getCompletionCopy(track);
  const requestedRole = track === 'commuter'
    ? 'commuter'
    : track === 'citizen_reg'
      ? 'operator'
      : track === 'company'
        ? 'commuter'
        : track === 'gov_link'
          ? 'commuter'
          : 'commuter';

  const returnToSecureAccess = () => {
    localStorage.setItem('afat_access_intent_role', requestedRole);
    onClose();
    window.setTimeout(() => {
      document.getElementById('afat-secure-access')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 50);
  };

  const handleGovLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorText('');
    setLoading(true);
    const { data, error } = await registerPublicPartner({
      entity_name: companyName,
      partner_type: 'government',
      registration_number: govId || null,
      official_domain: affiliationName || null,
      jurisdiction: baseCity || null,
      mandate_scope: companyNotes || null,
      service_coverage: serviceCoverage || null,
      representative_name: contactPerson || driverName || null,
      phone,
    });
    if (error) {
      setLoading(false);
      setErrorText(explainRegistrationError(error.message));
      return;
    }
    setCompletionState(getCompletionCopyForStatus('gov_link', data?.partner?.onboarding_context?.intake_status));
    setCompletionAction('Open public partner workspace');
    await onRegisterCustom({
      id: data?.profile?.id,
      role: data?.profile?.role || 'commuter',
      full_name: data?.profile?.full_name || contactPerson,
      government_name: data?.partner?.name || companyName,
      public_partner_status: data?.partner?.status,
      phone,
    });
    setLoading(false);
    setSuccess(true);
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
    }).then(async ({ data, error }) => {
      if (error) {
        setLoading(false);
        setErrorText(explainRegistrationError(error.message));
        return;
      }

      const applicationStatus = String(data?.driver?.operator_application_status || data?.driver?.onboarding_context?.application_status || '').toUpperCase();
      const isApprovedOperator = applicationStatus === 'APPROVED';
      setCompletionState(getCompletionCopyForStatus('citizen_reg', data?.driver?.onboarding_context?.intake_status, applicationStatus));
      setCompletionAction(isApprovedOperator ? 'Open operator terminal' : 'View operator review status');
      await onRegisterCustom({
          id: data?.driver?.id,
          role: isApprovedOperator ? 'operator' : 'commuter',
          requested_role: 'operator',
          vehicleType,
          full_name: data?.driver?.full_name || driverName || `AFAT operator ${phone.slice(-4)}`,
          phone,
          ids_number: data?.driver?.contractor_code,
          plate_number: data?.driver?.vehicle?.plate_number || plateNumber,
          operator_application_status: data?.driver?.operator_application_status || data?.driver?.onboarding_context?.application_status,
          is_active: isApprovedOperator
        });
      setLoading(false);
      setSuccess(true);
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

    if (error) {
      setLoading(false);
      setErrorText(explainRegistrationError(error.message));
      return;
    }

    setCompletionState(getCompletionCopyForStatus('commuter', data?.user?.onboarding_context?.intake_status));
    setCompletionAction('Open passenger workspace');
    await onRegisterCustom({
          id: data?.user?.id,
          role: 'commuter',
          full_name: data?.user?.full_name || driverName,
          phone,
        });
    setLoading(false);
    setSuccess(true);
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

    if (error) {
      setLoading(false);
      setErrorText(explainRegistrationError(error.message));
      return;
    }

    setCompletionState(getCompletionCopyForStatus('company', data?.company?.onboarding_context?.intake_status));
    setCompletionAction('Open organisation workspace');
    await onRegisterCustom({
          id: data?.profile?.id,
          role: data?.profile?.role || 'commuter',
          full_name: data?.profile?.full_name || contactPerson || companyName,
          company_name: data?.company?.company_name || companyName,
          company_application_status: data?.profile?.company_application_status || data?.company?.onboarding_context?.intake_status,
          phone,
        });
    setLoading(false);
    setSuccess(true);
  };

  return (
    <div
      className="fixed inset-0 z-[6000] flex items-end justify-center bg-slate-950/95 p-0 backdrop-blur-md animate-in fade-in duration-200 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="afat-registration-title"
        className="relative flex h-[100dvh] w-full max-w-md flex-col overflow-hidden border border-white/10 bg-slate-900 shadow-2xl ring-1 ring-white/10 sm:h-auto sm:max-h-[90dvh] sm:rounded-[32px]"
      >
        
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-slate-900 px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))] sm:p-6 sm:pb-4">
          <div>
            <h2 id="afat-registration-title" className="text-xl font-black uppercase italic tracking-tighter text-white">AFAT Sentinel Hub</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
              {track === 'select' ? 'Identity Gateway' :
               track === 'gov_link' ? 'Strategic Clearance' :
               track === 'commuter' ? 'Commuter Access' :
               track === 'company' ? 'Fleet Enrollment' :
               'Node Registration'}
            </p>
          </div>
          <button type="button" aria-label="Close registration" onClick={onClose} disabled={loading} className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-6">
          {success ? (
            <div className="flex flex-col items-center justify-center py-8 animate-in zoom-in duration-500">
              <div className="w-24 h-24 bg-green-500/10 rounded-full flex items-center justify-center border border-green-500/20 mb-6 shadow-[0_0_40px_rgba(34,197,94,0.2)]">
                <CheckCircle className="w-12 h-12 text-green-500" />
              </div>
              <h3 className="text-2xl font-black text-white uppercase italic tracking-tight mb-2">{completionCopy.title}</h3>
              <p className="text-sm text-slate-400 text-center font-bold">{completionCopy.body}</p>
              <div className="mt-7 w-full space-y-2 rounded-3xl border border-white/10 bg-slate-950/60 p-4 text-left">
                <div className="flex items-center gap-3 text-xs font-bold text-emerald-100"><CheckCircle className="h-4 w-4 text-emerald-400" /> Secure identity attached</div>
                <div className="flex items-center gap-3 text-xs font-bold text-emerald-100"><CheckCircle className="h-4 w-4 text-emerald-400" /> Registration saved</div>
                <div className="flex items-center gap-3 text-xs font-bold text-amber-100"><Shield className="h-4 w-4 text-amber-300" /> Role access follows the status shown above</div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 min-h-14 w-full rounded-2xl bg-white px-5 text-xs font-black uppercase tracking-widest text-slate-950 transition hover:bg-slate-100"
              >
                {completionAction}
              </button>
              <p className="mt-3 text-center text-[10px] font-semibold leading-relaxed text-white/40">AFAT will not silently promote an account. Operator, Planner and Admin authority appears only after its own approval.</p>
            </div>
          ) : track !== 'select' && !hasAuthenticatedSession ? (
            <div className="flex min-h-[28rem] flex-col justify-center animate-in slide-in-from-right-4 duration-300">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-blue-400/25 bg-blue-500/10">
                <Shield className="h-8 w-8 text-blue-300" />
              </div>
              <p className="mt-7 text-[10px] font-black uppercase tracking-[0.24em] text-blue-300/70">Secure identity required</p>
              <h3 className="mt-2 text-2xl font-black uppercase italic tracking-tight text-white">Sign in before registration</h3>
              <p className="mt-4 text-sm font-medium leading-relaxed text-white/60">
                AFAT attaches every commuter, operator, fleet, and staff intake to a verified AFAT identity. Continue with email or Google, then this registration lane will reopen for your profile.
              </p>
              <div className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-xs font-semibold leading-relaxed text-emerald-100/75">
                Your phone remains a contact and safety detail. Phone sign-in will appear only when it is ready for reliable use.
              </div>
              <div className="mt-8 flex gap-3">
                <button type="button" onClick={() => setTrack('select')} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-slate-300 transition hover:bg-white/5 hover:text-white" aria-label="Choose another registration lane">
                  <X className="h-5 w-5" />
                </button>
                <button type="button" onClick={returnToSecureAccess} className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-500 px-5 text-sm font-black uppercase tracking-wide text-white transition hover:bg-blue-400">
                  Continue to secure access
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          ) : track === 'select' ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-400 mb-6 font-medium leading-relaxed">
                Choose the identity or entity you are registering. Each path receives only the workspace and authority it needs.
              </p>

              <button 
                onClick={() => openTrack('commuter')}
                className="w-full bg-emerald-950/30 border border-emerald-500/30 rounded-3xl p-6 text-left hover:bg-emerald-900/40 hover:border-emerald-400/50 transition-all group"
              >
                <Users className="w-8 h-8 text-emerald-400 mb-4" />
                <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1">Track 0: Commuter</h3>
                <p className="text-xs text-emerald-100/60 font-medium">Fast passenger access for booking, guardian safety, tickets, and live trip intelligence.</p>
              </button>

              <button 
                onClick={() => openTrack('gov_link')}
                className="w-full bg-blue-950/30 border border-blue-500/30 rounded-3xl p-6 text-left hover:bg-blue-900/40 hover:border-blue-400/50 transition-all group relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-transparent translate-x-[-100%] group-hover:translate-x-[0%] transition-transform duration-500"></div>
                <Shield className="w-8 h-8 text-blue-400 mb-4" />
                <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1">Track A: Government / Public Partner</h3>
                <p className="text-xs text-blue-200/60 font-medium">For ministries, councils and public agencies coordinating privacy-safe mobility services under a verified mandate.</p>
              </button>

              <button 
                onClick={() => openTrack('citizen_reg')}
                className="w-full bg-white/5 border border-white/10 rounded-3xl p-6 text-left hover:bg-white/10 hover:border-white/20 transition-all group"
              >
                <Compass className="w-8 h-8 text-slate-300 mb-4" />
                <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1">Track B: Independent Node</h3>
                <p className="text-xs text-slate-400 font-medium">Standard registration for new Taxis, Motos, and independent Minibus operators.</p>
              </button>

              <button 
                onClick={() => openTrack('company')}
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
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Full Name (Optional)</label>
                <input type="text" value={driverName} onChange={e=>setDriverName(e.target.value)} placeholder="Marie Atangana" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-medium" />
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

              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-xs font-medium leading-relaxed text-emerald-100/80">
                Your verified AFAT identity owns this commuter profile. The phone number is stored as a contact and can be updated later.
              </div>

              {errorText && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{errorText}</div>}

              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setTrack('select')} className="w-14 h-14 shrink-0 rounded-2xl border border-white/10 flex items-center justify-center text-slate-400 hover:bg-white/5 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
                <button disabled={loading || !phone} type="submit" className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/50 text-slate-950 rounded-2xl font-black uppercase text-sm flex items-center justify-center gap-2 transition-all">
                  {loading ? <Zap className="w-5 h-5 animate-pulse text-slate-950" /> : 'Create Commuter Access'}
                </button>
              </div>
            </form>
          ) : track === 'gov_link' ? (
            <form onSubmit={handleGovLinkSubmit} className="space-y-5 animate-in slide-in-from-right-4 duration-300">
              <div className="flex gap-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4">
                <Building2 className="h-6 w-6 shrink-0 text-cyan-300" />
                <p className="text-xs font-medium leading-relaxed text-cyan-50/80">
                  Register a ministry, council, transport authority or public agency. This creates a mandate-scoped partner workspace—not Operator, Planner or Admin access.
                </p>
              </div>
              <div>
                <label className="mb-2 block pl-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Institution / Authority Name</label>
                <input required value={companyName} onChange={e=>setCompanyName(e.target.value)} placeholder="Freetown City Council" className="w-full rounded-2xl border border-white/10 bg-slate-950 px-5 py-4 font-medium text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-2 block pl-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Registration Number</label>
                  <input value={govId} onChange={e=>setGovId(e.target.value)} placeholder="Official registry ID" className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-4 font-mono text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-2 block pl-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Jurisdiction</label>
                  <input value={baseCity} onChange={e=>setBaseCity(e.target.value)} placeholder="City / Region" className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-4 text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="mb-2 block pl-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Official Representative</label>
                <input value={contactPerson} onChange={e=>setContactPerson(e.target.value)} placeholder="Appointed mobility representative" className="w-full rounded-2xl border border-white/10 bg-slate-950 px-5 py-4 text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-2 block pl-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Official Email Domain</label>
                <input value={affiliationName} onChange={e=>setAffiliationName(e.target.value)} placeholder="council.gov" className="w-full rounded-2xl border border-white/10 bg-slate-950 px-5 py-4 text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-2 block pl-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Mandate Scope</label>
                <textarea value={companyNotes} onChange={e=>setCompanyNotes(e.target.value)} placeholder="Public transport coordination, corridor planning, traffic response..." rows={3} className="w-full resize-none rounded-2xl border border-white/10 bg-slate-950 px-5 py-4 text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-2 block pl-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Service Coverage</label>
                <input value={serviceCoverage} onChange={e=>setServiceCoverage(e.target.value)} placeholder="Wards, corridors or region" className="w-full rounded-2xl border border-white/10 bg-slate-950 px-5 py-4 text-white placeholder-slate-600 focus:border-cyan-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-2 block pl-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Contact Phone</label>
                <div className="flex overflow-hidden rounded-2xl border border-white/10 bg-slate-950"><span className="flex items-center border-r border-white/10 px-4 font-mono text-slate-400">+237</span><input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="6XX XXX XXX" className="w-full bg-transparent px-5 py-4 font-mono text-white placeholder-slate-600 focus:outline-none" /></div>
              </div>
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-xs font-medium leading-relaxed text-emerald-100/80">
                Partner users receive aggregated, privacy-safe mobility data only. Citizen PII, operator financials and AFAT administration remain excluded.
              </div>
              {errorText && <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{errorText}</div>}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setTrack('select')} className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-slate-400 hover:bg-white/5 hover:text-white"><X className="h-5 w-5" /></button>
                <button disabled={loading || !phone || !companyName} type="submit" className="flex-1 rounded-2xl bg-cyan-400 text-sm font-black uppercase text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50">{loading ? <Zap className="mx-auto h-5 w-5 animate-pulse" /> : 'Create Public Partner Workspace'}</button>
              </div>
            </form>
          ) : track === 'citizen_reg' ? (
            <form onSubmit={handleCitizenSubmit} className="space-y-5 animate-in slide-in-from-right-4 duration-300">
               <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Full Name</label>
                <input type="text" value={driverName} onChange={e=>setDriverName(e.target.value)} placeholder="Jean Dupont" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-slate-500 font-medium" />
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
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">National ID (Optional)</label>
                  <input type="text" value={driverNationalId} onChange={e=>setDriverNationalId(e.target.value)} placeholder="CNI / national ID" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-slate-500 font-mono" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">License Number (Optional)</label>
                  <input type="text" value={driverLicenseNumber} onChange={e=>setDriverLicenseNumber(e.target.value)} placeholder="Permit / license" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-slate-500 font-mono" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Plate Number (Optional)</label>
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

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs font-medium leading-relaxed text-white/70">
                AFAT can save this operator as a partial intake even if full name, national ID, license, plate, or route details are not complete yet. Phone remains the required anchor.
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
                <button disabled={loading || !phone} type="submit" className="flex-1 bg-white hover:bg-slate-200 disabled:bg-white/50 text-slate-950 rounded-2xl font-black uppercase text-sm flex items-center justify-center gap-2 transition-all">
                  {loading ? <Zap className="w-5 h-5 animate-pulse text-slate-900" /> : 'Submit for Verification'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleCompanySubmit} className="space-y-5 animate-in slide-in-from-right-4 duration-300">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Company or Union Name (Optional)</label>
                <input type="text" value={companyName} onChange={e=>setCompanyName(e.target.value)} placeholder="AFAT Express Union" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 font-medium" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Coordinator Name (Optional)</label>
                <input type="text" value={contactPerson} onChange={e=>setContactPerson(e.target.value)} placeholder="Operations lead" className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 font-medium" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2 pl-2">Contact Phone</label>
                <div className="flex bg-slate-950 border border-white/10 rounded-2xl overflow-hidden">
                  <span className="flex items-center px-4 text-slate-400 font-mono border-r border-white/10">+237</span>
                  <input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="6XX XXX XXX" className="w-full bg-transparent px-5 py-4 text-white placeholder-slate-600 focus:outline-none font-mono" />
                </div>
              </div>

              <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs font-medium leading-relaxed text-amber-100/80">
                A phone line is enough to open a fleet intake. AFAT can follow up later for coordinator identity, permits, and fleet packaging.
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
                <button disabled={loading || !phone} type="submit" className="flex-1 bg-amber-400 hover:bg-amber-300 disabled:bg-amber-400/50 text-slate-950 rounded-2xl font-black uppercase text-sm flex items-center justify-center gap-2 transition-all">
                  {loading ? <Zap className="w-5 h-5 animate-pulse text-slate-950" /> : 'Open Fleet Intake'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
