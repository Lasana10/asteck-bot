type Evidence={id:string;kind:'place'|'road';name:string;confidence:number;evidence_status:string};

/** Only grounded, public, independently reviewed Atlas knowledge may enter AI-CORE. */
export function reviewedAtlasEvidence(result:unknown):Evidence[]{
  const r=result && typeof result==='object'?result as Record<string,unknown>:{};
  const rows:Array<{kind:'place'|'road';row:any}>=[
    ...(Array.isArray(r.nodes)?r.nodes.map(row=>({kind:'place' as const,row})):[]),
    ...(Array.isArray(r.edges)?r.edges.map(row=>({kind:'road' as const,row})):[]),
  ];
  return rows.filter(({row})=>{
    if(!row||typeof row.id!=='string'||row.id.length===0||row.id.length>128)return false;
    if(!['verified','corroborated'].includes(String(row.evidence_status||'').toLowerCase()))return false;
    // Unrated or out-of-range records must not be passed to a model as reviewed facts.
    return typeof row.confidence==='number'&&Number.isFinite(row.confidence)&&row.confidence>=0&&row.confidence<=100;
  }).slice(0,20).map(({kind,row})=>({
    id:row.id,
    kind,
    name:String(row.canonical_name||row.name|| (kind==='road'?'Unnamed road':'Unnamed place')).replace(/[\u0000-\u001f]/g,' ').slice(0,120),
    confidence:row.confidence,
    evidence_status:String(row.evidence_status).toLowerCase(),
  }));
}

