import { useRef,useState } from 'react';
import { Button } from './ui/button';
import { Download, Upload, Play, Square, Save } from 'lucide-react';
import { decodeToImageData } from '@/lib/particle-analysis';
import { RECOVERY_DEFAULTS,hashFile,particleReferences,readSettings,compareCandidates,csv,settingsCsv,latestRecords,methodsSummary,type ImageRecord,type Difference } from '@/lib/reproducibility/core';
import { runWorker } from '@/lib/reproducibility/worker-client';
import { downloadText } from '@/lib/export-results';
import { downloadBlob } from '@/lib/export-images';
import { snapshotLibrary,exportLibrary,importLibrary,retainOriginal,type LibrarySnapshot } from '@/lib/reproducibility/library';
import { accountIdentity,localRecords,syncRecords,saveRecord,saveLibraryAccount,accountLibraries,loadAccountLibrary } from '@/lib/reproducibility/account';
import { MICROFLUOR_VERSION } from '@/lib/app-version';
import type { useBlankLibrary } from '@/hooks/useBlankLibrary';
import type { useContaminationMemory } from '@/hooks/useContaminationMemory';

interface Report { image:string;hash:string;status:string;thresholds:number[];closest:number;referenceCount:number;actualCount:number;differences:Difference[];record?:ImageRecord;precision:string }
export function ReproducibilityPanel({blanks,memory}:{blanks:ReturnType<typeof useBlankLibrary>;memory:ReturnType<typeof useContaminationMemory>}){
 const [mode,setMode]=useState<'recover'|'reproduce'>('recover');const [files,setFiles]=useState<File[]>([]);
 const [particleCsv,setParticleCsv]=useState('');const [settingCsv,setSettingCsv]=useState('');
 const [settings,setSettings]=useState({...RECOVERY_DEFAULTS});const [library,setLibrary]=useState<LibrarySnapshot|null>(null);
 const [reports,setReports]=useState<Report[]>([]);const [busy,setBusy]=useState(false);const [progress,setProgress]=useState('');const [error,setError]=useState('');const [notice,setNotice]=useState('');
 const [versions,setVersions]=useState<Awaited<ReturnType<typeof accountLibraries>>>([]);
 const controller=useRef<AbortController|null>(null);
 async function action(fn:()=>Promise<void>){setError('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'Operation failed');}}
 async function run(){
  setBusy(true);setError('');setReports([]);setNotice('');const abort=new AbortController();controller.current=abort;
  try{
   if(!files.length)throw new Error('Load raw images');const refs=particleReferences(particleCsv);
   const stored=mode==='reproduce'?readSettings(settingCsv):[];
   if(mode==='reproduce'&&!library)throw new Error('Load the exported library ZIP');
   const identities=new Set<string>();const output:Report[]=[];
   for(let i=0;i<files.length;i++){
    const file=files[i];if(!file)continue;const hash=await hashFile(file);const identity=file.name+'#'+hash;
    if(identities.has(identity))throw new Error('Duplicate raw image: '+file.name);identities.add(identity);
    const named=refs.filter(r=>r.image===file.name);if(named.some(r=>r.hash&&r.hash!==hash))throw new Error('Particle CSV image hash mismatch: '+file.name);
    const imageRefs=named.filter(r=>!r.hash||r.hash===hash);
    const candidates=stored.filter(r=>r.image===file.name&&r.hash===hash);
    if(mode==='reproduce'&&candidates.length!==1)throw new Error('Settings missing or ambiguous for '+file.name);
    const selected=candidates[0];
    if(mode==='recover'&&!imageRefs.length)throw new Error('No candidate rows for '+file.name+'; legacy CSV cannot prove a zero-particle image');
    if(mode==='reproduce'&&imageRefs.some(r=>!r.hash||!r.fullPrecision))throw new Error('Full-precision columns and SHA-256 are required for reproduction: '+file.name);
    if(selected&&selected.libraryVersion!==library?.versionId)throw new Error('Library version mismatch for '+file.name);
    if(selected&&(selected.thresholds?.[0]??0)!==imageRefs.length)throw new Error('Companion CSV lacks the complete candidate set for '+file.name);
    const {imageData}=await decodeToImageData(file);if(selected&&(selected.width!==imageData.width||selected.height!==imageData.height))throw new Error('Image dimensions differ: '+file.name);
    const result=await runWorker(imageData,selected?.settings??settings,imageRefs,mode,n=>setProgress(`${i+1}/${files.length} · ${file.name} · ${n}/256`),abort.signal);
    const thresholds=result.thresholds??[];const closest=result.closest??selected?.settings.threshold??0;
    const differences=result.best?.differences??result.result?.differences??[];
    const actual=result.best?.candidates??result.analysis?.particles??[];
    const exact=mode==='recover'?thresholds.length>0:result.result?.exact===true;
    const record:ImageRecord={id:crypto.randomUUID(),image:file.name,hash,width:imageData.width,height:imageData.height,batchId:memory.activeBatch?.id??null,batch:memory.activeBatch?.name??'Recovered settings',tissue:selected?.tissue??memory.activeBatch?.tissue??'',protocol:memory.activeBatch?.protocol??'',settings:{...settings,threshold:thresholds[0]??closest},candidates:actual.map(p=>({id:p.id,area:p.area,width:p.width,height:p.height,feret:p.feret})),accepted:actual.length,rejected:0,runId:crypto.randomUUID(),timestamp:new Date().toISOString(),version:MICROFLUOR_VERSION,libraryVersion:library?.versionId??(await snapshotLibrary(blanks.library,memory.families,memory.observations)).versionId,source:'recovered',thresholds};
    output.push({image:file.name,hash,status:exact?'exact':'no exact match',thresholds,closest,referenceCount:imageRefs.length,actualCount:actual.length,differences,record:mode==='recover'&&exact?record:undefined,precision:imageRefs.every(r=>r.fullPrecision)?'full precision':'legacy CSV precision only'});
    setReports([...output]);
   }
   if(mode==='reproduce'){
    const loadedNames=new Set(files.map(f=>f.name));const missing=stored.filter(r=>!loadedNames.has(r.image));if(missing.length)throw new Error('Missing raw images: '+missing.map(r=>r.image).join(', '));
    const extra=refs.filter(r=>!files.some(f=>f.name===r.image));if(extra.length)throw new Error('Companion CSV contains unloaded images: '+[...new Set(extra.map(r=>r.image))].join(', '));
   }
   setProgress('Finished');
  }catch(e){setError(e instanceof Error?e.message:'Verification failed');}finally{setBusy(false);controller.current=null;}
 }
 const patch=(key:keyof typeof settings,value:number|boolean)=>setSettings(s=>({...s,[key]:value}));
 return <section className="flex flex-col gap-4 py-3">
  <h2 className="text-lg font-semibold">Reproducibility</h2>
  <div className="flex flex-wrap gap-2">{(['recover','reproduce'] as const).map(m=><Button key={m} variant={mode===m?'default':'secondary'} disabled={busy} onClick={()=>{setMode(m);setReports([]);}}>{m==='recover'?'Recover settings':'Reproduce analysis'}</Button>)}</div>
  <div className="grid gap-4 md:grid-cols-2">
   <label className="flex flex-col gap-1 text-sm">Raw images<input aria-label="Raw images" type="file" multiple accept="image/*,.tif,.tiff" disabled={busy} onChange={e=>setFiles(Array.from(e.target.files??[]))}/></label>
   <label className="flex flex-col gap-1 text-sm">Companion particle CSV<input aria-label="Companion particle CSV" type="file" accept=".csv" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void action(async()=>setParticleCsv(await f.text()));}}/></label>
   {mode==='reproduce'&&<label className="flex flex-col gap-1 text-sm">Settings per image CSV<input aria-label="Settings per image CSV" type="file" accept=".csv" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void action(async()=>setSettingCsv(await f.text()));}}/></label>}
   <label className="flex flex-col gap-1 text-sm">Exported library ZIP<input aria-label="Exported library ZIP" type="file" accept=".zip" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void action(async()=>{setLibrary(await importLibrary(f));setNotice('Library validated; working library unchanged');});}}/></label>
  </div>
  {mode==='recover'&&<div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
   {([['umPerPx','Scale (µm/px)'],['minArea','Minimum area (µm²)'],['maxArea','Maximum area (µm²)'],['minCircularity','Minimum circularity'],['maxCircularity','Maximum circularity']] as const).map(([key,label])=><label key={key} className="text-xs">{label}<input aria-label={label} className="field" type="number" step="any" placeholder="Unlimited" value={Number.isFinite(settings[key])?settings[key]:''} onChange={e=>patch(key,e.target.value===''&&key==='maxArea'?Infinity:Number(e.target.value))}/></label>)}
   <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={settings.excludeEdges} onChange={e=>patch('excludeEdges',e.target.checked)}/>Exclude border particles</label>
  </div>}
  <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={()=>void run()}><Play/>Run {mode==='recover'?'recovery':'reproduction'}</Button><Button variant="secondary" disabled={!busy} onClick={()=>controller.current?.abort()}><Square/>Cancel</Button>
   <Button variant="secondary" disabled={!reports.length} onClick={()=>downloadText(mode+'_report.csv',csv(reports.flatMap(r=>r.differences.length?r.differences.map(d=>({image:r.image,image_sha256:r.hash,status:r.status,matched_thresholds:r.thresholds.join(';'),closest_threshold:r.status==='exact'?'':r.closest,csv_candidates:r.referenceCount,matched_candidates:r.actualCount,precision:r.precision,...d})):[{image:r.image,image_sha256:r.hash,status:r.status,matched_thresholds:r.thresholds.join(';'),closest_threshold:r.status==='exact'?'':r.closest,csv_candidates:r.referenceCount,matched_candidates:r.actualCount,precision:r.precision}])))}><Download/>Export report CSV</Button>
  </div>
  {progress&&<p role="status" className="text-xs text-muted-foreground">{progress}</p>}
  {reports.length>0&&<div className="overflow-auto"><table className="w-full text-xs"><thead><tr>{['Image','Match','Thresholds','CSV / actual candidates','Precision','Recovered settings'].map(t=><th key={t} className="border-b border-border p-2 text-left">{t}</th>)}</tr></thead><tbody>{reports.map((r,index)=><tr key={r.image+r.hash} className="border-b border-border"><td className="p-2">{r.image}</td><td>{r.status}{r.differences.length>0&&<details><summary>{r.differences.length} differences</summary>{r.differences.map((d,i)=><p key={i}>#{d.particle} {d.field}: {d.expected} → {d.actual} (Δ {d.difference})</p>)}</details>}</td><td>{r.thresholds.join(', ')||'Closest: '+r.closest}</td><td>{r.referenceCount} / {r.actualCount}</td><td>{r.precision}</td><td>{r.record&&<div className="flex gap-2"><select aria-label={'Matched threshold '+r.image} className="field" value={r.record.settings.threshold} onChange={e=>setReports(prev=>prev.map((x,i)=>i===index&&x.record?{...x,record:{...x.record,settings:{...x.record.settings,threshold:Number(e.target.value)}}}:x))}>{r.thresholds.map(t=><option key={t}>{t}</option>)}</select><Button size="sm" onClick={()=>void action(async()=>{if(!r.record)return;const owner=await accountIdentity();await saveRecord(r.record,owner);if(owner)await syncRecords(owner);setNotice(owner?'Recovered settings saved to account':'Recovered settings saved locally; sign in for account saving');})}><Save/>Save</Button></div>}</td></tr>)}</tbody></table></div>}
  <div className="flex flex-wrap gap-2 border-t border-border pt-4">
   <Button variant="secondary" onClick={()=>void action(async()=>{const snapshot=await snapshotLibrary(blanks.library,memory.families,memory.observations);downloadBlob('MicroFluor-library-'+snapshot.versionId.slice(0,12)+'.zip',exportLibrary(snapshot));})}><Download/>Export library</Button>
   <Button variant="secondary" disabled={!library} onClick={()=>void action(async()=>{if(!library||!window.confirm('Add this library to the current library? Existing records will not be overwritten.'))return;for(const [hash,o] of Object.entries(library.originals))await retainOriginal(hash,new File([new Uint8Array(o.bytes)],o.name));const existing=new Set(blanks.library.records.map(r=>r.id));blanks.commit({...blanks.library,records:[...blanks.library.records,...library.library.records.filter(r=>!existing.has(r.id))]});memory.importArchive(library.families,library.observations);setNotice('Library added');})}><Upload/>Import library</Button>
   <Button variant="secondary" onClick={()=>void action(async()=>{const snapshot=await snapshotLibrary(blanks.library,memory.families,memory.observations);setNotice(await saveLibraryAccount(snapshot,await accountIdentity()));})}><Save/>Save library to account</Button>
   <Button variant="secondary" onClick={()=>void action(async()=>{const owner=await accountIdentity();if(!owner)throw new Error('Sign in to load account libraries');setVersions(await accountLibraries(owner));})}>Account library versions</Button>
   <Button variant="secondary" onClick={()=>void action(async()=>{const owner=await accountIdentity();const records=owner?await syncRecords(owner):await localRecords(null);downloadText('settings_all_batches.csv',settingsCsv(latestRecords(records)));setNotice(`${records.length} saved image runs`);})}><Download/>Settings for all saved batches</Button>
   <Button variant="secondary" onClick={()=>void action(async()=>{const owner=await accountIdentity();const records=latestRecords(owner?await syncRecords(owner):await localRecords(null)).filter(r=>r.batchId===(memory.activeBatch?.id??null));downloadText('methods_summary.txt',methodsSummary(records),'text/plain');})}><Download/>Export methods summary</Button>
  </div>
  {versions.length>0&&<label className="text-xs">Saved library<select className="field" defaultValue="" onChange={e=>void action(async()=>{setLibrary(await loadAccountLibrary(e.target.value));setNotice('Account library loaded for verification; working library unchanged');})}><option value="" disabled>Select version</option>{versions.map(v=><option key={v.content_hash} value={v.storage_path}>{v.created_at} · {v.content_hash.slice(0,16)}</option>)}</select></label>}
  {library&&<p className="break-all font-mono text-xs text-muted-foreground">Library SHA-256: {library.versionId}</p>}
  {notice&&<p role="status" className="text-xs text-primary">{notice}</p>}{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </section>;
}
