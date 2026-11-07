import Papa from 'papaparse';
import type { AnalysisSettings, Particle } from '../particle-analysis';

export const RECOVERY_DEFAULTS: AnalysisSettings = { umPerPx: 8, threshold: 100, minArea: 400, maxArea: Infinity, minCircularity: 0, maxCircularity: 1, excludeEdges: true };
export type Measurement = Pick<Particle, 'id' | 'area' | 'width' | 'height' | 'feret'>;
export interface ImageRecord {
 id: string; image: string; hash: string; width: number; height: number;
 batchId: string | null; batch: string; tissue: string; protocol: string;
 settings: AnalysisSettings; candidates: Measurement[]; accepted: number; rejected: number;
 runId: string; timestamp: string; version: string; libraryVersion: string;
 source: 'recorded' | 'recovered'; thresholds?: number[]; candidateCount?: number; owner?: string | null;
}
export interface Reference extends Measurement { image: string; hash: string; fullPrecision: boolean; precision: Record<'area'|'width'|'height'|'feret', number> }
export async function sha256(data: ArrayBuffer | Uint8Array): Promise<string> {
 const bytes = data instanceof Uint8Array ? new Uint8Array(data).buffer : data;
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function hashFile(file: Blob) { return sha256(await file.arrayBuffer()); }
export function canonical(value: unknown): string {
 if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
 if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 return JSON.stringify(value) ?? 'null';
}
export function csv(rows: Record<string, unknown>[]) { return Papa.unparse(rows); }
export function parseCsv(text: string): Record<string,string>[] {
 const result = Papa.parse<Record<string,string>>(text.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: 'greedy' });
 if (result.errors.length) throw new Error('Invalid CSV: '+result.errors[0]?.message);
 return result.data;
}
const normalized = (key: string) => key.toLowerCase().replace(/[\s_()µ²^]/g,'').replace(/μ/g,'u');
function cell(row: Record<string,string>, ...names: string[]) {
 for (const name of names) { const key=Object.keys(row).find(k => normalized(k)===normalized(name)); if(key) return row[key] ?? ''; }
 return '';
}
function number(value: string, name: string) { const n=Number(value); if (!value.trim() || !Number.isFinite(n)) throw new Error('Missing or invalid '+name); return n; }
export function particleReferences(text: string): Reference[] {
 const refs=parseCsv(text).map(row => {
  const full=['area','width','height','feret'].every(k=>cell(row,k+'_full_precision')!=='');
  const precision = {area:3,width:3,height:3,feret:3};
  const values={} as Record<'area'|'width'|'height'|'feret',number>;
  for(const key of ['area','width','height','feret'] as const){
   const raw=cell(row, ...(full?[key+'_full_precision']:[key+' (um'+(key==='area'?'^2':'')+')',key]));
   values[key]=number(raw,key); precision[key]=(raw.split('.')[1]??'').length;
  }
  const image=cell(row,'Image','image_name'); if(!image) throw new Error('Missing image name');
  return {image, hash:cell(row,'image_sha256','image_hash'),id:number(cell(row,'Particle','particle_id'),'Particle'),...values,fullPrecision:full,precision};
 });
 const originals=new Map<string,Reference[]>();
 for(const row of parseCsv(text)){
  const raw=cell(row,'original_candidate_measurements');if(!raw||raw==='[]')continue;
  const image=cell(row,'Image'),hash=cell(row,'image_sha256');
  const parsed=JSON.parse(raw) as Measurement[];
  if(!Array.isArray(parsed)||parsed.some(p=>!Number.isInteger(p.id)||[p.area,p.width,p.height,p.feret].some(v=>!Number.isFinite(v))))throw new Error('Invalid original candidate measurements');
  const key=image+'#'+hash;
  const next=parsed.map(p=>({...p,image,hash,fullPrecision:true,precision:{area:17,width:17,height:17,feret:17}}));
  if(originals.has(key)&&canonical(originals.get(key))!==canonical(next))throw new Error('Conflicting original candidate measurements');
  originals.set(key,next);
 }
 const effective=refs.filter(r=>!originals.has(r.image+'#'+r.hash)).concat([...originals.values()].flat());
 const keys=new Set<string>(); for(const r of effective){const key=r.image+'#'+r.hash+'#'+r.id;if(keys.has(key))throw new Error('Duplicate particle row: '+key);keys.add(key);}
 return effective;
}
export interface Difference { particle: number; field: string; expected: number | string; actual: number | string; difference: number | string }
export function compareCandidates(actual: Measurement[], expected: Reference[], legacy=false) {
 const differences: Difference[]=[];
 const seen=new Set<number>();
 for(const r of expected){seen.add(r.id);const p=actual.find(p=>p.id===r.id);if(!p){differences.push({particle:r.id,field:'candidate',expected:'present',actual:'missing',difference:''});continue;}
  for(const key of ['area','width','height','feret'] as const){
   const v=legacy&&!r.fullPrecision?Number(p[key].toFixed(r.precision[key])):p[key];
   if(v!==r[key])differences.push({particle:r.id,field:key,expected:r[key],actual:p[key],difference:p[key]-r[key]});
  }
 }
 for(const p of actual)if(!seen.has(p.id))differences.push({particle:p.id,field:'candidate',expected:'absent',actual:'extra',difference:''});
 return {exact:actual.length===expected.length&&differences.length===0,differences,countDifference:actual.length-expected.length};
}
export function flagLevel(score:number,features:number){return score>=.85&&features>=7?'high-confidence':score>=.7&&features>=5?'flagged':'';}
export function tissueConflict(name:string,tissue:string){
 const words=name.toLowerCase().match(/liver|intestin(?:e)?|mus(?:cle|le)/g)??[];
 const found=[...new Set(words.map(w=>w.startsWith('mus')?'Muscle':w.startsWith('intestin')?'Intestine':'Liver'))];
 return found.length===1&&found[0]?.toLowerCase()!==tissue.toLowerCase()?found[0]:null;
}
export function settingsCsv(records:ImageRecord[]){return csv(records.map(r=>({
 Image:r.image,image_sha256:r.hash,image_width_px:r.width,image_height_px:r.height,batch_name:r.batch,batch_id:r.batchId??'',Tissue:r.tissue,protocol:r.protocol,
 scale_um_per_px:r.settings.umPerPx,threshold:r.settings.threshold,min_area_um2:r.settings.minArea,max_area_um2:Number.isFinite(r.settings.maxArea)?r.settings.maxArea:'unlimited',
 min_circularity:r.settings.minCircularity,max_circularity:r.settings.maxCircularity,exclude_edges:r.settings.excludeEdges,
 candidates:r.candidateCount ?? r.candidates.length,accepted:r.accepted,rejected:r.rejected,analysis_run_id:r.runId,analysis_timestamp:r.timestamp,microfluor_version:r.version,blank_library_version_id:r.libraryVersion,settings_source:r.source
})));}
export function readSettings(text:string):ImageRecord[]{return parseCsv(text).map(r=>{
 const image=cell(r,'Image'),hash=cell(r,'image_sha256'); if(!image||!/^[a-f0-9]{64}$/.test(hash))throw new Error('Settings require image name and SHA-256 hash');
 const settings:AnalysisSettings={umPerPx:number(r['scale_um_per_px']??'','scale'),threshold:number(r['threshold']??'','threshold'),minArea:number(r['min_area_um2']??'','minimum area'),maxArea:r['max_area_um2']==='unlimited'?Infinity:number(r['max_area_um2']??'','maximum area'),minCircularity:number(r['min_circularity']??'','minimum circularity'),maxCircularity:number(r['max_circularity']??'','maximum circularity'),excludeEdges:r['exclude_edges']==='true'};
 if(settings.umPerPx<=0||settings.threshold<0||settings.threshold>255||!Number.isInteger(settings.threshold)||settings.minArea<0||settings.maxArea<settings.minArea||settings.minCircularity<0||settings.maxCircularity>1||settings.maxCircularity<settings.minCircularity||!['true','false'].includes(r['exclude_edges']??''))throw new Error('Invalid analysis settings');
 return {id:crypto.randomUUID(),image,hash,width:number(r['image_width_px']??'','width'),height:number(r['image_height_px']??'','height'),batchId:r['batch_id']||null,batch:r['batch_name']??'',tissue:r['Tissue']??'',protocol:r['protocol']??'',settings,candidates:[],accepted:number(r['accepted']??'','accepted'),rejected:number(r['rejected']??'','rejected'),runId:r['analysis_run_id']??'',timestamp:r['analysis_timestamp']??'',version:r['microfluor_version']??'',libraryVersion:r['blank_library_version_id']??'',source:r['settings_source']==='recovered'?'recovered':'recorded',candidateCount:number(r['candidates']??'','candidate count')};
});}
export function latestRecords(records:ImageRecord[]){const map=new Map<string,ImageRecord>();for(const r of records){const key=r.batchId+'#'+r.batch+'#'+r.image+'#'+r.hash;const prev=map.get(key);if(!prev||prev.timestamp<r.timestamp)map.set(key,r);}return [...map.values()];}
export function methodsSummary(records:ImageRecord[]){return [
 'MicroFluor methods summary', 'Versions: '+[...new Set(records.map(r=>r.version))].join(', '), 'Images: '+records.length,
 'Scale (µm/px): '+[...new Set(records.map(r=>r.settings.umPerPx))].join(', '),
 'Threshold range: '+(records.length?Math.min(...records.map(r=>r.settings.threshold))+'–'+Math.max(...records.map(r=>r.settings.threshold)):'none'),
 ...records.map(r=>`${r.image}: area ${r.settings.minArea}–${Number.isFinite(r.settings.maxArea)?r.settings.maxArea:'unlimited'} µm²; circularity ${r.settings.minCircularity}–${r.settings.maxCircularity}; exclude edges ${r.settings.excludeEdges}`),
 'Morphology: fibre AR ≤0.33 or ≥3; sphere circularity >0.90, or circularity >0.60 with AR 0.85–1.18 and min/max Feret ≥0.85; pellet circularity >0.60 otherwise; fragment circularity ≤0.60. Existing hole-filled morphology silhouette is unchanged.',
 'Blank flags: similarity ≥0.70 and ≥5 features; high-confidence ≥0.85 and ≥7 features. Contaminant retrieval remains ≥0.55 and advisory.',
 'Library versions: '+[...new Set(records.map(r=>r.libraryVersion))].join(', '), 'Detection and measurement algorithms unchanged from v2.5.7.'
].join('\n');}
