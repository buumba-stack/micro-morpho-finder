import { getAuthClient } from '@/hooks/useAuth';
import { getReviewerSession } from '../reviewer-session';
import { getLocal,putLocal } from './local-store';
import type { ImageRecord } from './core';
import { exportLibrary,importLibrary,type LibrarySnapshot } from './library';
import type { Json } from '@/integrations/supabase/types';
let saving=Promise.resolve();
export async function accountIdentity(){if(getReviewerSession())return null;const client=await getAuthClient();if(!client)return null;const {data}=await client.auth.getSession();return data.session?.user.id??null;}
function key(owner:string|null){return 'records:'+(owner??'local');}
export async function localRecords(owner:string|null){return await getLocal<ImageRecord[]>(key(owner))??[];}
export async function saveRecord(record:ImageRecord,owner:string|null){
 const next={...record,owner};
 saving=saving.catch(()=>{}).then(async()=>{const records=await localRecords(owner);await putLocal(key(owner),[...records.filter(r=>r.id!==next.id),next]);});await saving;
}
function serialize(r:ImageRecord){return {...r,settings:{...r.settings,maxArea:Number.isFinite(r.settings.maxArea)?r.settings.maxArea:null}};}
export function restoreRecord(value:any):ImageRecord{return {...value,settings:{...value.settings,maxArea:value.settings.maxArea===null?Infinity:value.settings.maxArea}};}
let syncing:Promise<unknown>=Promise.resolve();
export function syncRecords(owner:string):Promise<ImageRecord[]>{
 const next=syncing.catch(()=>{}).then(()=>syncRecordsNow(owner));syncing=next;return next;
}
async function syncRecordsNow(owner:string):Promise<ImageRecord[]>{
 const client=await getAuthClient();if(!client||await accountIdentity()!==owner)throw new Error('Sign in to save settings to your account');
 const records=await localRecords(owner);
 for(const r of records){const {error}=await client.from('image_analysis_records').upsert({id:r.id,user_id:owner,batch_id:r.batchId,image_name:r.image,image_sha256:r.hash,run_id:r.runId,recorded_at:r.timestamp,payload:serialize(r) as unknown as Json},{onConflict:'id'});if(error)throw new Error('Settings save failed: '+error.message);}
 const all:ImageRecord[]=[];for(let offset=0;;offset+=500){const {data,error}=await client.from('image_analysis_records').select('payload').eq('user_id',owner).order('recorded_at').range(offset,offset+499);if(error)throw new Error(error.message);all.push(...(data??[]).map(row=>restoreRecord(row.payload)));if((data??[]).length<500)break;}
 let merged:ImageRecord[]=all;
 saving=saving.catch(()=>{}).then(async()=>{
  const pending=await localRecords(owner);const byId=new Map(all.map(r=>[r.id,r]));
  for(const record of pending)byId.set(record.id,record);
  merged=[...byId.values()];await putLocal(key(owner),merged);
 });await saving;return merged;
}
export async function saveLibraryAccount(snapshot:LibrarySnapshot,owner:string|null){
 await putLocal('library:'+snapshot.versionId,snapshot);
 if(!owner)return 'Saved locally';
 const client=await getAuthClient();if(!client||await accountIdentity()!==owner)throw new Error('Sign in to save your library');
 const {data:existing,error:lookup}=await client.from('analysis_library_versions').select('id').eq('user_id',owner).eq('content_hash',snapshot.versionId).maybeSingle();if(lookup)throw new Error(lookup.message);if(existing)return 'Saved to account';
 const path=owner+'/'+snapshot.versionId+'.zip';
 const {error:upload}=await client.storage.from('analysis-libraries').upload(path,exportLibrary(snapshot),{contentType:'application/zip',upsert:false});if(upload&&!upload.message.toLowerCase().includes('already exists'))throw new Error(upload.message);
 const {error}=await client.from('analysis_library_versions').insert({user_id:owner,content_hash:snapshot.versionId,storage_path:path});if(error)throw new Error(error.message);return 'Saved to account';
}
export async function accountLibraries(owner:string){const client=await getAuthClient();if(!client)return [];const {data,error}=await client.from('analysis_library_versions').select('content_hash,storage_path,created_at').eq('user_id',owner).order('created_at',{ascending:false});if(error)throw new Error(error.message);return data??[];}
export async function loadAccountLibrary(path:string){const client=await getAuthClient();if(!client)throw new Error('Account unavailable');const {data,error}=await client.storage.from('analysis-libraries').download(path);if(error||!data)throw new Error(error?.message??'Library unavailable');return importLibrary(data);}
