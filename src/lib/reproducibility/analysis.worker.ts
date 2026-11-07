import { analyzeImageData } from '../particle-analysis';
import { compareCandidates, type Reference } from './core';
self.onmessage=(event)=>{
 const {pixels,width,height,settings,references,mode}=event.data;
 const image={data:new Uint8ClampedArray(pixels),width,height,colorSpace:'srgb'} as ImageData;
 try {
  if(mode==='recover'){
   const thresholds:number[]=[];let closest=0;let bestRank:[number,number,number]=[Infinity,Infinity,Infinity];let best:any=null;
   for(let t=0;t<=255;t++){
    const analysis=analyzeImageData(image,{...settings,threshold:t});
    const result=compareCandidates(analysis.particles,references as Reference[],true);
    const rank:[number,number,number]=[Math.abs(result.countDifference),result.differences.length,result.differences.reduce((s,d)=>s+(typeof d.difference==='number'?Math.abs(d.difference):0),0)];
    if(rank[0]<bestRank[0]||(rank[0]===bestRank[0]&&(rank[1]<bestRank[1]||(rank[1]===bestRank[1]&&rank[2]<bestRank[2])))){bestRank=rank;closest=t;best={...result,candidates:analysis.particles};}
    if(result.exact)thresholds.push(t);
    self.postMessage({progress:t+1});
   }
   self.postMessage({done:true,thresholds,closest,best});
  }else{const analysis=analyzeImageData(image,settings);self.postMessage({done:true,analysis,result:compareCandidates(analysis.particles,references,false)});}
 }catch(error){self.postMessage({error:error instanceof Error?error.message:'Analysis failed'});}
};
