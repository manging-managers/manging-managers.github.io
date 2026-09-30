(function(root){
'use strict';
const HEADERS=['기업명','구분','09:30','10:30','13:10','14:10','15:10'];
const rowsOf=sheet=>XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true,blankrows:true});
const yes=v=>['1','true','o','○','✓','예','y','확인필요','필요'].includes(Schedule.normalize(v));
const fileLimit=10*1024*1024;
function downloadBlob(blob,filename){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function saveWorkbook(wb,filename){const bytes=XLSX.write(wb,{bookType:'xlsx',type:'array'});downloadBlob(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),filename);}
function companyRows(companies){return [HEADERS,...companies.map(c=>[c.name,c.group||'',...Schedule.TIMES.map((_,t)=>c.slots.includes(t)?'O':'')])];}
function exampleCompanies(){return [{name:'기업01',group:'올데이',slots:[0,1,2,3,4]},{name:'기업02',group:'오전',slots:[0,1]},{name:'기업03',group:'오후',slots:[2,3,4]}];}
function companySheet(companies){const sheet=XLSX.utils.aoa_to_sheet(companyRows(companies));sheet['!cols']=[{wch:26},{wch:10},...Array(5).fill({wch:10})];return sheet;}
function template(companies,onlyCompanies=false){const wb=XLSX.utils.book_new();if(!onlyCompanies){const sheet=XLSX.utils.aoa_to_sheet([['순번','이름','소속기관','희망기업']]);sheet['!cols']=[{wch:8},{wch:20},{wch:25},{wch:85}];XLSX.utils.book_append_sheet(wb,sheet,'신청명단');}
  XLSX.utils.book_append_sheet(wb,companySheet(companies.length?companies:exampleCompanies()),'기업시간표');saveWorkbook(wb,onlyCompanies?'기업시간표.xlsx':'managers_and_companies.xlsx');
}
function parseCompanyRows(rows){const header=(rows[0]||[]).map(Schedule.normalize),nameCol=header.indexOf('기업명'),groupCol=header.indexOf('구분');
 if(nameCol<0)throw Error('기업시간표의 첫 행에 기업명 열이 필요합니다.');
 const timeCols=['09:30','10:30','13:10','14:10','15:10'].map(t=>header.indexOf(t));
 const companies=rows.slice(1).filter(r=>r.some(v=>String(v??'').trim())).map((row,i)=>{
   const name=String(row[nameCol]??'').trim(),group=String(row[groupCol]??'').trim();let slots=[];
   if(timeCols.some(c=>c>=0))slots=timeCols.flatMap((col,t)=>col>=0&&yes(row[col])?[t]:[]);
   else slots=group==='오전'?[0,1]:group==='오후'?[2,3,4]:['올데이','종일','All day'].includes(group)?[0,1,2,3,4]:[];
   if(!slots.length)throw Error(`기업시간표 ${i+2}행: 운영 시간에 O를 표시해 주세요.`);
   return {name,slots,group};
 });return Schedule.validateCompanies(companies);
}
async function readWorkbook(file){if(!/\.xlsx$/i.test(file.name))throw Error('.xlsx 엑셀 파일을 선택해 주세요.');if(file.size>fileLimit)throw Error('엑셀 파일은 최대 10MB까지 선택할 수 있습니다.');
 const data=await file.arrayBuffer();
 try{
  const zip=await JSZip.loadAsync(data);const size=Object.values(zip.files).reduce((sum,f)=>sum+(f._data?.uncompressedSize||0),0);if(size>100*1024*1024)throw Error('엑셀 데이터가 너무 큽니다. 명단을 나누어 주세요.');
  return XLSX.read(data,{type:'array',cellFormula:false,sheetRows:1002});
 }catch(e){if(e.message.includes('너무 큽니다'))throw e;throw Error('엑셀을 읽지 못했습니다. .xlsx 형식으로 저장한 뒤 다시 선택해 주세요.');}
}
async function readManagerFile(file){const workbook=await readWorkbook(file);const companyName=workbook.SheetNames.find(n=>Schedule.normalize(n)==='기업시간표');const managerName=workbook.SheetNames.find(n=>Schedule.normalize(n)==='신청명단')||workbook.SheetNames.find(n=>n!==companyName);
 if(!managerName)throw Error('신청 명단 시트가 없습니다.');return {rows:rowsOf(workbook.Sheets[managerName]),companies:companyName?parseCompanyRows(rowsOf(workbook.Sheets[companyName])):null};
}
async function readCompanyFile(file){if(file.size>fileLimit)throw Error('파일은 최대 10MB까지 선택할 수 있습니다.');if(/\.json$/i.test(file.name)){let data;try{data=JSON.parse(await file.text());}catch{throw Error('기업시간표 파일을 읽지 못했습니다.');}return Schedule.validateCompanies(data);}
 const wb=await readWorkbook(file),name=wb.SheetNames.find(n=>Schedule.normalize(n)==='기업시간표')||wb.SheetNames[0];return parseCompanyRows(rowsOf(wb.Sheets[name]));
}
const FONT='"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
function canvasBlob(canvas){return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('이미지를 저장하지 못했습니다.')),'image/png'));}
async function renderImage(title,subtitle,sections){const canvas=document.createElement('canvas');canvas.width=1120;const ctx=canvas.getContext('2d');if(!ctx)throw Error('이 브라우저에서 이미지 생성을 지원하지 않습니다.');
 function wrap(text,size,width){ctx.font=`${size}px ${FONT}`;const lines=[''];for(const c of String(text)){if(ctx.measureText(lines[lines.length-1]+c).width>width)lines.push(c);else lines[lines.length-1]+=c;}return lines;}
 const titleLines=wrap(title,42,1016),subLines=wrap(subtitle,23,1016);const header=120+titleLines.length*54+subLines.length*34;
 const blocks=sections.map(([label,lines])=>[label,lines.flatMap(line=>wrap(line,26,1000))]);
 canvas.height=header+blocks.reduce((n,[,lines])=>n+95+Math.max(1,lines.length)*39,0)+36;
 if(canvas.height>30000)throw Error('이미지가 너무 깁니다. 이름과 기관명을 줄여 주세요.');
 ctx.fillStyle='#f3f6fa';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#122b43';ctx.fillRect(0,0,1120,header-22);ctx.textBaseline='top';
 function text(value,x,y,size,color){ctx.font=`${size}px ${FONT}`;ctx.fillStyle=color;ctx.fillText(value,x,y);}
 text('기업 설명회 일정',52,30,20,'#80d4bf');let y=76;for(const line of titleLines){text(line,52,y,42,'white');y+=54;}for(const line of subLines){text(line,52,y+6,23,'#c7d8e6');y+=34;}
 y=header;for(const [label,lines] of blocks){const height=75+Math.max(1,lines.length)*39;ctx.fillStyle='white';ctx.beginPath();ctx.roundRect(36,y,1048,height,15);ctx.fill();text(label,58,y+16,21,'#07896e');(lines.length?lines:['—']).forEach((line,k)=>text(line,58,y+55+k*39,26,'#183149'));y+=height+20;}
 const blob=await canvasBlob(canvas);canvas.width=1;canvas.height=1;return blob;
}
function safeFilename(name){let value=String(name).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').trim();if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value))value='_'+value;let result='';for(const c of value){if(new TextEncoder().encode(result+c).length>210)break;result+=c;}return result||'schedule';}
function uniqueFilename(stem,used){stem=safeFilename(stem);let value=stem,i=2;while(used.has(value.toLowerCase()))value=`${stem}_${i++}`;used.add(value.toLowerCase());return value+'.png';}
function resultWorkbook(result){const wb=XLSX.utils.book_new();const managers=[['이름','소속기관',...Schedule.TIMES,'미배정 희망기업'],...result.managers.map(m=>[m.name,m.organization,...m.schedule,m.unassigned.join(', ')])];const company=[['기업','타임','이름','소속기관']];for(const c of result.companies)for(const s of c.sessions)for(const m of s.managers)company.push([c.name,s.time,m.name,m.organization]);XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(managers),'매니저별 일정');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(company),'기업별 참석자');return XLSX.write(wb,{bookType:'xlsx',type:'array'});}
async function exportZip(result,progress,isCancelled=()=>false){const zip=new JSZip(),managerNames=new Set(),companyNames=new Set();let done=0;const total=result.managers.length+result.companies.length;
 function check(){if(isCancelled())throw Error('작업을 취소했습니다.');}
 for(const m of result.managers){check();const sections=m.schedule.map((c,t)=>[Schedule.TIMES[t],[c||'배정 없음 · 휴식']]);if(m.unassigned.length)sections.push(['미배정 희망기업',m.unassigned]);const blob=await renderImage(m.name,m.organization+' | 개인 참석 일정',sections);zip.file('manager_schedule/'+uniqueFilename(m.name+'_'+m.organization,managerNames),await blob.arrayBuffer());progress(`이미지 만드는 중… ${++done}/${total}`);await new Promise(r=>setTimeout(r,0));}
 for(const c of result.companies){check();const sections=c.sessions.map(s=>[`${s.time} · ${s.managers.length}명`,s.managers.length?s.managers.map(m=>m.name+' | '+m.organization):['참석자 없음']]);const blob=await renderImage(c.name,c.group+' | 타임별 참석자 명단',sections);zip.file('company_schedule/'+uniqueFilename(c.name,companyNames),await blob.arrayBuffer());progress(`이미지 만드는 중… ${++done}/${total}`);await new Promise(r=>setTimeout(r,0));}
 check();zip.file('배정결과.xlsx',resultWorkbook(result));progress('다운로드 파일을 준비하는 중…');const blob=await zip.generateAsync({type:'blob',compression:'STORE'},()=>check());check();return blob;
}
root.ScheduleFiles={readManagerFile,readCompanyFile,template,exportZip,downloadBlob,companyRows};
})(globalThis);
