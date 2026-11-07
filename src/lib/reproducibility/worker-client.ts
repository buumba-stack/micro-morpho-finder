import type { AnalysisSettings, ImageAnalysis } from '../particle-analysis';
import type { Reference, Difference, Measurement } from './core';
export interface WorkerResult { thresholds?:number[];closest?:number;best?:{candidates:Measurement[];differences:Difference[];countDifference:number};analysis?:ImageAnalysis;result?:{exact:boolean;differences:Difference[];countDifference:number} }
export function runWorker(image:ImageData,settings:AnalysisSettings,references:Reference[],mode:'recover'|'reproduce',progress:(n:number)=>void,signal:AbortSignal):Promise<WorkerResult>{
 return new Promise((resolve,reject)=>{
  const worker=new Worker(new URL('./analysis.worker.ts',import.meta.url),{type:'module'});
  const finish=()=>{worker.terminate();signal.removeEventListener('abort',abort);};
  const abort=()=>{finish();reject(new Error('Cancelled'));};signal.addEventListener('abort',abort,{once:true});
  worker.onerror=e=>{finish();reject(new Error(e.message));};
  worker.onmessage=e=>{if(e.data.progress)progress(e.data.progress);if(e.data.error){finish();reject(new Error(e.data.error));}if(e.data.done){finish();resolve(e.data);}};
  worker.postMessage({pixels:image.data,width:image.width,height:image.height,settings,references,mode});
 });
}
