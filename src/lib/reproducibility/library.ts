import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { z } from 'zod';
import type { BlankLibraryState } from '../blank-library';
import type { ContaminantFamily,ContaminantObservation } from '../contamination-memory';
import { canonical,sha256 } from './core';
import { getLocal,putLocal } from './local-store';
export interface LibrarySnapshot { library:BlankLibraryState;families:ContaminantFamily[];observations:ContaminantObservation[];versionId:string; originals:Record<string,{name:string;bytes:Uint8Array}> }
const noSync=(value:any):any=>Array.isArray(value)?value.map(noSync):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([k])=>!['synced','user_id','version'].includes(k)).map(([k,v])=>[k,noSync(v)])):value;
export async function libraryHash(library:BlankLibraryState,families:ContaminantFamily[],observations:ContaminantObservation[]){
 const sorted=(rows:any[])=>rows.map(noSync).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 return sha256(strToU8(canonical({records:sorted(library.records).map(r=>({...r,candidates:sorted(r.candidates)})),families:sorted(families),observations:sorted(observations)})));
}
export async function retainOriginal(hash:string,file:File){await putLocal('original:'+hash,{name:file.name,bytes:new Uint8Array(await file.arrayBuffer())});}
export async function snapshotLibrary(library:BlankLibraryState,families:ContaminantFamily[],observations:ContaminantObservation[]):Promise<LibrarySnapshot>{
 const originals:LibrarySnapshot['originals']={};for(const r of library.records){const original=await getLocal<{name:string;bytes:Uint8Array}>('original:'+r.fileHash);if(original)originals[r.fileHash]=original;}
 const snapshot={library:structuredClone(library),families:structuredClone(families),observations:structuredClone(observations),versionId:await libraryHash(library,families,observations),originals};
 await putLocal('library:'+snapshot.versionId,snapshot);return snapshot;
}
function dataBytes(url:string){const match=/^data:image\/(png|jpeg|webp);base64,(.*)$/.exec(url);if(!match)throw new Error('Invalid artefact image');return Uint8Array.from(atob(match[2] ?? ''),c=>c.charCodeAt(0));}
function dataUrl(bytes:Uint8Array){let text='';for(let i=0;i<bytes.length;i++)text+=String.fromCharCode(bytes[i] ?? 0);return 'data:image/png;base64,'+btoa(text);}
export function exportLibrary(snapshot:LibrarySnapshot){
 const files:Record<string,Uint8Array>={};const library=structuredClone(snapshot.library);
 library.records.forEach((r,ri)=>r.candidates.forEach((c,ci)=>{for(const key of ['crop','contextCrop'] as const){if(!c[key])continue;const path=`images/${ri}-${ci}-${key}.png`;files[path]=dataBytes(c[key]);c[key]=path;}}));
 const originals:Record<string,{name:string;path:string}>={};
 for(const [hash,original] of Object.entries(snapshot.originals)){const path='originals/'+hash;files[path]=original.bytes;originals[hash]={name:original.name,path};}
 files['library.json']=strToU8(JSON.stringify({format:'microfluor-library/1',versionId:snapshot.versionId,library,families:snapshot.families,observations:snapshot.observations,originals,missingOriginals:library.records.filter(r=>!originals[r.fileHash]).map(r=>r.fileName)}));
 return new Blob([new Uint8Array(zipSync(files))],{type:'application/zip'});
}
const features=z.object({logArea:z.number(),elongation:z.number(),circularity:z.number(),solidity:z.number(),meanIntensity:z.number(),contrast:z.number(),hue:z.number(),saturation:z.number(),intensitySd:z.number()});
const candidate=z.object({id:z.string(),particleId:z.number(),annotation:z.enum(['confirmed_procedural_artifact','possible_artifact','environmental_contaminant','unresolved']),features,crop:z.string(),contextCrop:z.string(),area:z.number(),perimeter:z.number(),feret:z.number(),minFeret:z.number(),aspectRatio:z.number(),circularity:z.number(),touchesBorder:z.boolean(),note:z.string()});
const record=z.object({id:z.string(),fileName:z.string(),fileHash:z.string().regex(/^[a-f0-9]{64}$/),width:z.number(),height:z.number(),addedAt:z.string(),metadata:z.object({referenceId:z.string(),solution:z.string(),protocol:z.string(),batch:z.string(),acquisitionDate:z.string(),microscope:z.string(),objective:z.string(),camera:z.string(),umPerPx:z.number(),threshold:z.number(),notes:z.string()}),candidates:z.array(candidate)});
const family=z.object({id:z.string(),name:z.string(),contaminant_type:z.enum(['procedural_blank_contaminant','laboratory_or_environmental_contaminant','sample_processing_artifact','imaging_artifact','other_contaminant']),scope:z.enum(['batch','tissue_protocol','protocol','permanent']),batch_id:z.string().nullable(),tissue:z.string().nullable(),protocol:z.string().nullable(),status:z.enum(['new','characterising','established']),notes:z.string().nullable(),created_at:z.string(),updated_at:z.string(),synced:z.boolean().default(false)});
const observation=z.object({id:z.string(),family_id:z.string(),batch_id:z.string().nullable(),source_type:z.enum(['procedural_blank','sample_image']),particle_id:z.string().nullable(),source_image_id:z.string().nullable(),source_image_name:z.string().nullable(),tissue:z.string().nullable(),protocol:z.string().nullable(),particle_features:features.passthrough(),manually_confirmed:z.boolean(),notes:z.string().nullable(),import_fingerprint:z.string().nullable(),created_at:z.string(),synced:z.boolean().default(false)});
export async function importLibrary(file:Blob):Promise<LibrarySnapshot>{
 if(file.size>50*1024*1024)throw new Error('Library ZIP exceeds 50 MB');
 let size=0;const files=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:entry=>{size+=entry.originalSize;if(size>200*1024*1024||entry.name.includes('..')||entry.name.startsWith('/'))throw new Error('Unsafe or oversized library ZIP');return true;}});
 const manifest=files['library.json'];if(!manifest)throw new Error('Missing library.json');
 const raw=z.object({format:z.literal('microfluor-library/1'),versionId:z.string().regex(/^[a-f0-9]{64}$/),library:z.object({version:z.number(),records:z.array(record)}),families:z.array(family),observations:z.array(observation),originals:z.record(z.object({name:z.string(),path:z.string()}))}).parse(JSON.parse(strFromU8(manifest)));
 const ids=new Set<string>();for(const r of raw.library.records){if(ids.has(r.id))throw new Error('Duplicate library record');ids.add(r.id);for(const c of r.candidates){for(const key of ['crop','contextCrop'] as const){if(!c[key])continue;const bytes=files[c[key]];if(!bytes)throw new Error('Missing artefact image: '+c[key]);c[key]=dataUrl(bytes);}}}
 const originals:LibrarySnapshot['originals']={};for(const [hash,info]of Object.entries(raw.originals)){const bytes=files[info.path];if(!bytes||await sha256(bytes)!==hash)throw new Error('Original image hash mismatch');originals[hash]={name:info.name,bytes};}
 const version=await libraryHash(raw.library,raw.families,raw.observations as ContaminantObservation[]);if(version!==raw.versionId)throw new Error('Library content hash mismatch');
 return {library:raw.library,families:raw.families,observations:raw.observations as ContaminantObservation[],versionId:version,originals};
}
