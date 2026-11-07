import {describe,test} from 'node:test';
import assert from 'node:assert/strict';
import {RECOVERY_DEFAULTS,compareCandidates,flagLevel,settingsCsv,readSettings,particleReferences,tissueConflict,canonical,type ImageRecord} from './core';
import {analyzeImageData} from '../particle-analysis';
import {particlesCsv} from '../export-results';
import type {ImageEntry} from '../study-types';
import {libraryHash,exportLibrary,importLibrary} from './library';
const hash='a'.repeat(64);
const candidate={id:1,area:400,width:24,height:24,feret:25.1234567890123};
const reference={...candidate,image:'sample.png',hash,fullPrecision:true,precision:{area:3,width:3,height:3,feret:3}};
const record:ImageRecord={id:'test',image:'sample.png',hash,width:100,height:100,batchId:null,batch:'Test',tissue:'Muscle',protocol:'',settings:{...RECOVERY_DEFAULTS},candidates:[candidate],accepted:1,rejected:0,runId:'run',timestamp:'2026-11-07T00:00:00Z',version:'2.5.8',libraryVersion:hash,source:'recorded'};
describe('reproducibility rules',()=>{
 test('recovery defaults match requested scale and filters',()=>{assert.deepEqual(RECOVERY_DEFAULTS,{umPerPx:8,threshold:100,minArea:400,maxArea:Infinity,minCircularity:0,maxCircularity:1,excludeEdges:true});});
 test('full precision detects tiny Feret differences',()=>{assert.equal(compareCandidates([candidate],[reference]).exact,true);const result=compareCandidates([{...candidate,feret:candidate.feret+1e-12}],[reference]);assert.equal(result.exact,false);assert.equal(result.differences[0]?.field,'feret');});
 test('reports every candidate measurement and missing candidates',()=>{const result=compareCandidates([{...candidate,area:401,width:25,height:25,feret:26}],[reference,{...reference,id:2}]);assert.equal(result.differences.length,5);assert.equal(result.countDifference,-1);});
 test('flag levels require both score and feature count',()=>{assert.equal(flagLevel(.7,5),'flagged');assert.equal(flagLevel(.85,7),'high-confidence');assert.equal(flagLevel(.85,6),'flagged');assert.equal(flagLevel(.7,4),'');assert.equal(flagLevel(.699999,7),'');});
 test('settings include zero particles and round trip unlimited area',()=>{const text=settingsCsv([{...record,candidates:[],accepted:0}]);const rows=readSettings(text);assert.equal(rows.length,1);assert.equal(rows[0]?.settings.maxArea,Infinity);assert.equal(rows[0]?.candidateCount,0);assert.equal(rows[0]?.hash,hash);});
 test('preserves original candidates when reviewed CSV was renumbered',()=>{const text='Image,Particle,Area (um^2),Width (um),Height (um),Feret (um),image_sha256,area_full_precision,width_full_precision,height_full_precision,feret_full_precision,original_candidate_measurements\n'+`sample.png,1,400,24,24,25.123,${hash},400,24,24,25.1234567890123,"${JSON.stringify([candidate,{...candidate,id:2}]).replaceAll('"','""')}"`;assert.equal(particleReferences(text).length,2);});
 test('filename tissue conflict warns without modifying tissue',()=>{assert.equal(tissueConflict('fish_Muscle.png','Liver'),'Muscle');assert.equal(tissueConflict('fish_Muscle.png','Muscle'),null);});
 test('canonical key order stable',()=>{assert.equal(canonical({b:2,a:1}),canonical({a:1,b:2}));});
 test('companion retains candidates after all displayed particles are deleted',()=>{const image:ImageEntry={id:'image',file:new File([],'sample.png'),name:'sample.png',tissue:'Muscle',status:'done',settings:RECOVERY_DEFAULTS,imageHash:hash,originalCandidates:[candidate],analysis:{width:100,height:100,particles:[],excludedEdge:0,excludedSize:0,excludedCircularity:0}};const refs=particleReferences(particlesCsv([],[image]));assert.equal(refs.length,1);assert.equal(refs[0]?.feret,candidate.feret);assert.equal(refs[0]?.hash,hash);});
 test('library ZIP validates content version and mutation version stays separate',async()=>{const library={version:2,records:[]};const versionId=await libraryHash(library,[],[]);assert.equal(await libraryHash({...library,version:3},[],[]),versionId);const imported=await importLibrary(exportLibrary({library,families:[],observations:[],originals:{},versionId}));assert.equal(imported.versionId,versionId);assert.equal(imported.library.version,2);});
 test('existing detector produces identical results at all 256 thresholds',()=>{const width=20,height=20;const data=new Uint8ClampedArray(width*height*4);for(let y=4;y<8;y++)for(let x=4;x<8;x++){const i=(y*width+x)*4;data[i]=200;data[i+1]=200;data[i+2]=200;data[i+3]=255;}const image={width,height,data,colorSpace:'srgb'} as ImageData;
 for(let threshold=0;threshold<=255;threshold++){const settings={...RECOVERY_DEFAULTS,threshold};const a=analyzeImageData(image,settings);const b=analyzeImageData(image,settings);assert.deepEqual(a,b);if(threshold===255)assert.equal(a.particles.length,0);}
 });
});
