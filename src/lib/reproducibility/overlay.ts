import { decodeToImageData } from '../particle-analysis';
import type { ImageEntry } from '../study-types';
import { downloadBlob,safeFileStem } from '../export-images';
// v2.5.8 overlay palette, frozen so on-screen theme changes never alter exported overlays.
const LEGACY:Record<string,string>={'--destructive':'oklch(0.63 0.2 22)','--accent':'oklch(0.78 0.14 200)','--primary':'oklch(0.86 0.24 145)','--background':'oklch(0.16 0.012 240)','--foreground':'oklch(0.95 0.008 230)','--rejected':'oklch(0.62 0.02 240)'};
const legacyColor=(n:string)=>({trim:()=>LEGACY[n]??'#fff'});
export async function exportSegmentationOverlays(entries:ImageEntry[]){
 const theme=getComputedStyle(document.documentElement);
 for(const e of entries){if(!e.analysis)continue;const {imageData}=await decodeToImageData(e.file);const canvas=document.createElement('canvas');canvas.width=imageData.width;canvas.height=imageData.height+48;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Image export unavailable');ctx.putImageData(imageData,0,0);
  ctx.font='20px Arial';ctx.lineWidth=2;
  for(const p of e.analysis.particles){const color=legacyColor(p.rejected?'--destructive':e.blankMatches?.[p.id]?'--accent':'--primary').trim();ctx.strokeStyle=color;ctx.fillStyle=color;const o=p.outline;if(o.length>=4){ctx.beginPath();ctx.moveTo(o[0]??0,o[1]??0);for(let i=2;i<o.length;i+=2)ctx.lineTo(o[i]??0,o[i+1]??0);ctx.closePath();ctx.stroke();}ctx.strokeStyle=legacyColor('--background').trim();ctx.lineWidth=4;ctx.strokeText(String(p.id),p.cxPx,p.cyPx);ctx.fillText(String(p.id),p.cxPx,p.cyPx);ctx.lineWidth=2;}
  ctx.fillStyle=legacyColor('--background').trim();ctx.fillRect(0,imageData.height,canvas.width,48);ctx.font='18px Arial';
  const legend=[['Accepted','--primary'],['Rejected','--destructive'],['Blank-matched','--accent']];
  let x=10;for(const item of legend){const label=item[0]??'';ctx.fillStyle=legacyColor(item[1]??'--foreground').trim();ctx.fillRect(x,imageData.height+17,12,12);ctx.fillStyle=legacyColor('--foreground').trim();ctx.fillText(label,x+18,imageData.height+30);x+=ctx.measureText(label).width+44;}
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));if(blob)downloadBlob(safeFileStem(e.name)+'_segmentation.png',blob);
 }
}
