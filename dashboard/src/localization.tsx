import React, { createContext, useContext, useMemo, useState } from 'react';

export type AfatLocale = 'en' | 'fr';

const dictionaries: Record<AfatLocale, Record<string,string>> = {
  en: {
    'nav.home':'Home','nav.trips':'Trips','nav.safety':'Safety','nav.account':'Account','nav.atlas':'Atlas',
    'atlas.title':'Living Atlas','atlas.subtitle':'Help AFAT learn how the city really moves.',
    'atlas.contribute':'Contribute movement','atlas.missions':'Nearby missions','atlas.reputation':'Contributor trust',
    'atlas.city':'City learning','atlas.predictions':'What AFAT needs to verify next',
    'atlas.private':'Private contribution','atlas.review':'Trusted review','atlas.public':'Public mapping',
  },
  fr: {
    'nav.home':'Accueil','nav.trips':'Trajets','nav.safety':'Sécurité','nav.account':'Compte','nav.atlas':'Atlas',
    'atlas.title':'Atlas vivant','atlas.subtitle':'Aidez AFAT à apprendre comment la ville se déplace réellement.',
    'atlas.contribute':'Contribuer un déplacement','atlas.missions':'Missions à proximité','atlas.reputation':'Confiance contributeur',
    'atlas.city':'Apprentissage de la ville','atlas.predictions':'Ce qu’AFAT doit vérifier ensuite',
    'atlas.private':'Contribution privée','atlas.review':'Révision de confiance','atlas.public':'Cartographie publique',
  },
};

type LocaleContextValue={ locale:AfatLocale; setLocale:(v:AfatLocale)=>void; t:(key:string,fallback?:string)=>string };
const LocaleContext=createContext<LocaleContextValue>({locale:'en',setLocale:()=>{},t:(k,f)=>f||k});

export function AfatLocaleProvider({children}:{children:React.ReactNode}) {
  const [locale,setLocaleState]=useState<AfatLocale>(()=>localStorage.getItem('afat_locale')==='fr'?'fr':'en');
  const setLocale=(value:AfatLocale)=>{ localStorage.setItem('afat_locale',value); setLocaleState(value); };
  const value=useMemo(()=>({locale,setLocale,t:(key:string,fallback?:string)=>dictionaries[locale][key]||dictionaries.en[key]||fallback||key}),[locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useAfatLocale(){ return useContext(LocaleContext); }

export function LanguageSwitcher(){
  const {locale,setLocale}=useAfatLocale();
  return <div className="flex rounded-lg border border-white/10 bg-black/20 p-1">
    {(['en','fr'] as AfatLocale[]).map(code=><button key={code} type="button" onClick={()=>setLocale(code)} className={`rounded-md px-2 py-1 text-[9px] font-black uppercase ${locale===code?'bg-white/10 text-white':'text-white/35'}`}>{code}</button>)}
  </div>;
}
