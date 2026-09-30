'use strict';
importScripts('./vendor/highs.js','./scheduler.js?v=20260930-5');
self.onmessage=async({data})=>{
  try{
    self.postMessage({type:'progress',message:'배정 준비 중…'});
    const highs=await Module({locateFile:file=>new URL(`./vendor/${file}`,self.location.href).href,print:()=>{},printErr:()=>{}});
    const result=Schedule.solve(highs,data.managers,data.companies,message=>self.postMessage({type:'progress',message}));
    self.postMessage({type:'result',result});
  }catch(e){self.postMessage({type:'error',message:e.message||'배정 중 오류가 발생했습니다.'});}
};
