'use strict';
const $=s=>document.querySelector(s);
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let rows=null,companies=[],companyOrigin='none',companiesEdited=false,result=null,zipBlob=null,tab='managers',busy=false,worker=null,cancelled=false,rejectWorker=null;
function error(message){$('#error').textContent=message;$('#error').hidden=!message;}
function progress(message){$('#progress-text').textContent=message;}
function setBusy(value,message){busy=value;$('#progress').hidden=!value;document.querySelectorAll('.card input,.card select,.card button:not(#cancel),#download').forEach(el=>el.disabled=value);if(message)progress(message);if(!value)renderSettings();}
function invalidate(){result=null;zipBlob=null;$('#results').hidden=true;error('');}
function renderSettings(){
  $('#company-settings').innerHTML=companies.map((c,j)=>`<tr><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.group)}</td>${Schedule.TIMES.map((time,t)=>`<td><input type="checkbox" data-company="${j}" data-slot="${t}" ${c.slots.includes(t)?'checked':''} ${busy?'disabled':''} aria-label="${escapeHtml(c.name)} ${time}"></td>`).join('')}</tr>`).join('');
  const warnings=Schedule.timeWarnings(companies);
  $('#time-warnings').innerHTML=warnings.map(message=>`<p>${escapeHtml(message)}</p>`).join('');
  $('#time-warnings').hidden=!warnings.length;
  $('#schedule-save').hidden=!companies.length;
  $('#company-template').textContent=companies.length?'시간표 엑셀 저장 ↓':'시간표 양식 ↓';
}
function changeTime(input){
  if(busy)return;
  const j=Number(input.dataset.company),t=Number(input.dataset.slot),c=companies[j];
  if(!c)return;
  invalidate();c.slots=input.checked?[...new Set([...c.slots,t])].sort():c.slots.filter(x=>x!==t);companiesEdited=true;
  const selector=`input[data-company="${j}"][data-slot="${t}"]`;
  renderSettings();document.querySelector(selector)?.focus({preventScroll:true});
}
function saveTimetable(onlyCompanies){
  try{const current=companies.length?Schedule.validateCompanies(companies):[];ScheduleFiles.template(current,onlyCompanies);error('');}
  catch(e){error(e.message);}
}
async function chooseManager(file){if(!file||busy)return;invalidate();rows=null;$('#filename').textContent='선택한 파일 없음';setBusy(true,'명단을 읽는 중…');$('#cancel').hidden=true;
 try{const data=await ScheduleFiles.readManagerFile(file);rows=data.rows;$('#filename').textContent=file.name;if(data.companies&&companyOrigin!=='separate'&&!companiesEdited){companies=data.companies;companyOrigin='manager';$('#company-filename').textContent='명단 파일의 기업시간표';}}
 catch(e){error(e.message);}finally{$('#cancel').hidden=false;setBusy(false);}
}
$('#file').addEventListener('change',e=>chooseManager(e.target.files[0]));
$('#company-file').addEventListener('change',async e=>{const file=e.target.files[0];if(!file||busy)return;e.target.value='';invalidate();companies=[];companyOrigin='none';companiesEdited=false;$('#company-filename').textContent='선택한 시간표 없음';setBusy(true,'기업시간표를 읽는 중…');$('#cancel').hidden=true;
 try{companies=await ScheduleFiles.readCompanyFile(file);companyOrigin='separate';$('#company-filename').textContent=file.name;}catch(e){error(e.message);}finally{$('#cancel').hidden=false;setBusy(false);}
});
['dragover','dragenter'].forEach(type=>$('#dropzone').addEventListener(type,e=>{e.preventDefault();if(!busy)$('#dropzone').classList.add('drag');}));
['dragleave','drop'].forEach(type=>$('#dropzone').addEventListener(type,e=>{e.preventDefault();$('#dropzone').classList.remove('drag');}));
$('#dropzone').addEventListener('drop',e=>chooseManager(e.dataTransfer.files[0]));
$('#template').addEventListener('click',()=>saveTimetable(false));
$('#company-template').addEventListener('click',()=>saveTimetable(true));
$('#schedule-save').addEventListener('click',()=>saveTimetable(true));
$('#toggle-settings').addEventListener('click',()=>{const open=$('#settings').hidden;$('#settings').hidden=!open;$('#toggle-settings').textContent=open?'기업시간표 닫기 ▴':'기업시간표 확인·수정 ▾';$('#toggle-settings').setAttribute('aria-expanded',String(open));});
$('#company-settings').addEventListener('change',e=>{if(e.target.dataset.company!==undefined)changeTime(e.target);});
function runWorker(managers,settings){return new Promise((resolve,reject)=>{
  worker=new Worker('./worker.js?v=20260930-5');rejectWorker=reject;
  const timer=setTimeout(()=>{worker?.terminate();worker=null;reject(Error('계산 시간이 오래 걸립니다. 명단을 나누어 다시 시도해 주세요.'));},150000);
  const cleanup=()=>{clearTimeout(timer);worker?.terminate();worker=null;rejectWorker=null;};
  rejectWorker=e=>{cleanup();reject(e);};
  worker.onmessage=({data})=>{if(data.type==='progress')progress(data.message);else if(data.type==='result'){cleanup();resolve(data.result);}else if(data.type==='error'){cleanup();reject(Error(data.message));}};
  worker.onerror=()=>{cleanup();reject(Error('배정 프로그램을 실행하지 못했습니다. 최신 Chrome 또는 Edge에서 다시 열어 주세요.'));};
  worker.postMessage({managers,companies:settings});
});}
$('#cancel').addEventListener('click',()=>{cancelled=true;if(rejectWorker)rejectWorker(Error('작업을 취소했습니다.'));progress('취소하는 중…');});
$('#generate').addEventListener('click',async()=>{
 if(busy)return;error('');if(!rows)return error('신청 명단 엑셀을 선택해 주세요.');if(!companies.length)return error('기업시간표를 선택해 주세요.');
 let managers,settings;try{settings=Schedule.validateCompanies(companies);managers=Schedule.parseManagers(rows,settings);}catch(e){return error(e.message);}
 invalidate();cancelled=false;setBusy(true,'배정 준비 중…');
 try{const calculated=await runWorker(managers,settings);if(cancelled)throw Error('작업을 취소했습니다.');
   const blob=await ScheduleFiles.exportZip(calculated,progress,()=>cancelled);if(cancelled)throw Error('작업을 취소했습니다.');result=calculated;zipBlob=blob;
   $('#result-summary').textContent=`매니저 ${result.stats.managers}명 · 배정 ${result.stats.assigned}/${result.stats.requested}건 · 미배정 ${result.stats.requested-result.stats.assigned}건`;
   $('#solver-note').textContent=result.optimal?'':'일부 배정을 더 개선할 수 있습니다. 결과를 확인하거나 다시 생성해 주세요.';$('#solver-note').hidden=result.optimal;
   $('#results').hidden=false;$('#search').value='';renderMatchingRates(result);renderResults();$('#results').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){error(e.message);}finally{setBusy(false);}
});
$('#download').addEventListener('click',()=>{if(zipBlob)ScheduleFiles.downloadBlob(zipBlob,'배정결과.zip');});
$('.tabs').addEventListener('click',e=>{if(!e.target.dataset.tab)return;tab=e.target.dataset.tab;document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('selected',b.dataset.tab===tab));renderResults();});
$('#search').addEventListener('input',renderResults);
function renderMatchingRates(data){
  const card=m=>{
    const rate=m.total>0?100*m.assigned/m.total:null;
    const percentage=rate===null?'—':rate.toFixed(1)+'%';
    return `<article class="matching-card ${m.overall?'matching-overall':''}"><h3>${escapeHtml(m.name)}</h3><strong>${percentage}</strong><progress max="100" value="${rate===null?0:rate}" aria-label="${escapeHtml(m.name)} ${rate===null?m.empty:percentage}"></progress><p>${rate===null?m.empty:`배정 ${m.assigned.toLocaleString('ko-KR')} / ${m.denominator} ${m.total.toLocaleString('ko-KR')}${m.unit}`}</p></article>`;
  };
  const people=data.managers.filter(m=>m.wishes.length>0).map(m=>({...m,assigned:m.schedule.filter(c=>c!==null).length,total:m.wishes.length}));
  const least=people.reduce((best,m)=>!best||m.assigned*best.total<best.assigned*m.total?m:best,null);
  const tied=least?people.filter(m=>m.assigned*least.total===least.assigned*m.total):[];
  const minimum=`<article class="matching-card matching-overall matching-minimum"><h3>매니저 최소 할당률</h3><strong>${least?(100*least.assigned/least.total).toFixed(1)+'%':'—'} <span class="matching-count">· ${tied.length}명</span></strong>${least?`<ul class="matching-people" aria-label="최소 할당률 매니저 명단">${tied.map(m=>`<li>${escapeHtml(m.name)} · ${escapeHtml(m.organization)} <span>배정 ${m.assigned} / 신청 ${m.total}건</span></li>`).join('')}</ul>`:'<p>신청 없음</p>'}</article>`;
  const overall=card({name:'매니저 전체 할당률',assigned:data.stats.assigned,total:data.stats.requested,denominator:'신청',empty:'신청 없음',unit:'건',overall:true});
  const companyCards=data.companies.map(c=>card({name:c.name,assigned:c.sessions.reduce((n,s)=>n+s.managers.length,0),total:c.sessions.length*c.capacity,denominator:'정원',empty:'운영 시간 없음',unit:'명',overall:false})).join('');
  $('#matching-rates').innerHTML=`<div class="manager-rates">${overall}${minimum}</div><h3 class="company-rates-title">기업 할당률</h3><div class="company-rates">${companyCards}</div>`;
}
function renderResults(){if(!result)return;const q=$('#search').value.trim().toLowerCase(),matches=s=>s.toLowerCase().includes(q);let content='';
 if(tab==='companies')content=result.companies.filter(c=>matches(c.name+' '+c.sessions.flatMap(s=>s.managers.map(m=>m.name+' '+m.organization)).join(' '))).map(c=>`<article class="result-card"><h3>${escapeHtml(c.name)} <small>${escapeHtml(c.group)} · 희망 ${c.demand}명 · 배정 ${c.sessions.reduce((n,s)=>n+s.managers.length,0)}명</small></h3><div class="schedule-grid">${Schedule.TIMES.map((time,t)=>{const s=c.sessions.find(s=>s.slot===t);return `<div class="schedule-slot ${s?'':'empty'}"><span>${time}</span><strong>${s?s.managers.length+'명 참석':'미운영'}</strong>${s?s.managers.map(m=>`<p>${escapeHtml(m.name)} · ${escapeHtml(m.organization)}</p>`).join(''):''}</div>`;}).join('')}</div></article>`).join('');
 else content=result.managers.filter(m=>(tab!=='unassigned'||m.unassigned.length)&&matches(m.name+' '+m.organization+' '+m.wishes.join(' '))).map(m=>`<article class="result-card"><h3>${escapeHtml(m.name)} <small>${escapeHtml(m.organization)} · ${m.wishes.length-m.unassigned.length}/${m.wishes.length}개 배정</small></h3><div class="schedule-grid">${m.schedule.map((c,t)=>`<div class="schedule-slot ${c?'':'empty'}"><span>${Schedule.TIMES[t]}</span><strong>${escapeHtml(c||'휴식 · 배정 없음')}</strong></div>`).join('')}</div>${m.unassigned.length?`<p class="unassigned">미배정: ${m.unassigned.map(escapeHtml).join(', ')}</p>`:''}</article>`).join('');
 $('#result-body').innerHTML=content||`<div class="empty-state">${tab==='unassigned'&&!q?'모든 희망기업이 배정되었습니다.':'검색 결과가 없습니다.'}</div>`;
}
if(location.protocol==='file:'){error('웹사이트 주소로 접속해 주세요. 파일을 직접 열면 배정 기능을 실행할 수 없습니다.');$('#generate').disabled=true;}
else if(!window.Worker||!window.WebAssembly){error('최신 Chrome 또는 Edge에서 열어 주세요.');$('#generate').disabled=true;}
renderSettings();
