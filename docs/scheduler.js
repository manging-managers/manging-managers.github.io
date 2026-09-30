/* All scheduling data stays in the worker or the current browser tab. */
(function (root) {
'use strict';
const TIMES=['09:30–10:20','10:30–11:20','13:10–14:00','14:10–15:00','15:10–16:00'];
const normalize=s=>String(s??'').replace(/\s+/g,'').toLowerCase();
function validateCompanies(input) {
  if(!Array.isArray(input)||!input.length||input.length>100)throw Error('기업은 1~100개까지 등록할 수 있습니다.');
  const seen=new Set();
  return input.map(c=>{
    if(!c||typeof c!=='object'||Array.isArray(c))throw Error('기업시간표 형식을 확인해 주세요.');
    const name=String(c.name??'').trim(),slots=c.slots;
    if(!name||seen.has(normalize(name)))throw Error('기업명이 비어 있거나 중복되었습니다.');
    if(name.length>150)throw Error('기업명은 150자 이내로 입력해 주세요.');
    seen.add(normalize(name));
    if(!Array.isArray(slots)||!slots.length||slots.some(t=>!Number.isInteger(t)||t<0||t>4)||new Set(slots).size!==slots.length)throw Error(`${name}: 운영 시간을 선택해 주세요.`);
    const sorted=[...slots].sort();
    const inferred=sorted.every(t=>t<2)?'오전':sorted.every(t=>t>=2)?'오후':'올데이';
    const declared=String(c.group??'').trim();
    const group=['종일','allday'].includes(normalize(declared))?'올데이':declared||inferred;
    return {name,slots:sorted,capacity:10,group};
  });
}
function timeWarnings(companies){
  return companies.flatMap(c=>{
    const outside=c.slots.filter(t=>c.group==='오전'?t>=2:c.group==='오후'?t<2:false);
    if(!outside.length)return [];
    return [`${c.name} 기업은 ${c.group} 일정인데 ${outside.map(t=>`${t<2?'오전':'오후'} ${TIMES[t]}`).join(', ')}이 선택되어 있습니다. 선택한 시간으로 배정합니다.`];
  });
}
function parseManagers(rows,companies){
  const headers=(rows[0]||[]).map(normalize),cols=['이름','소속기관','희망기업'].map(h=>headers.indexOf(h));
  if(cols.some(c=>c<0))throw Error('첫 행에 이름, 소속기관, 희망기업 열이 필요합니다.');
  const lookup=new Map(companies.map(c=>[normalize(c.name),c.name]));const managers=[],errors=[];
  rows.slice(1).forEach((row,index)=>{
    if(!row.some(v=>String(v??'').trim()))return;
    const [name,organization,raw]=cols.map(c=>String(row[c]??'').trim());
    const values=raw.split(/[,，;；\n/|、]+/).map(s=>s.trim()).filter(Boolean);
    const unknown=values.filter(v=>!lookup.has(normalize(v)));
    const wishes=[...new Set(values.map(v=>lookup.get(normalize(v))).filter(Boolean))];
    if(!name||!organization)errors.push(`${index+2}행: 이름과 소속기관을 입력해 주세요.`);
    if(name.length>150||organization.length>150)errors.push(`${index+2}행: 이름과 소속기관은 각각 150자 이내로 입력해 주세요.`);
    if(unknown.length)errors.push(`${index+2}행: 기업시간표에 없는 기업 — ${unknown.join(', ')}`);
    if(!values.length||wishes.length>5)errors.push(`${index+2}행: 희망기업은 1~5개 입력해 주세요.`);
    managers.push({id:managers.length,name,organization,wishes});
  });
  if(errors.length)throw Error(errors.slice(0,30).join('\n'));
  if(!managers.length)throw Error('신청자가 없습니다. 엑셀에 신청 명단을 입력해 주세요.');
  if(managers.length>1000)throw Error('한 번에 최대 1,000명을 처리할 수 있습니다.');
  return managers;
}
function validateSchedules(schedules,managers,companies){
  const lookup=new Map(companies.map((c,j)=>[c.name,j])),counts=companies.map(()=>[0,0,0,0,0]);
  if(schedules.length!==managers.length)throw Error('배정 결과를 확인하지 못했습니다. 다시 시도해 주세요.');
  let total=0;
  schedules.forEach((plan,i)=>{
    const used=new Set();if(plan.length!==5)throw Error('일정 길이 오류');
    plan.forEach((name,t)=>{if(name===null)return;const j=lookup.get(name);
      if(j===undefined||!managers[i].wishes.includes(name)||used.has(name)||!companies[j].slots.includes(t))throw Error('잘못된 배정 결과입니다. 다시 시도해 주세요.');
      used.add(name);if(++counts[j][t]>10)throw Error('정원을 초과한 배정입니다.');total++;
    });
  });return total;
}
function balanceLocally(schedules,managers,companies,demand){
  const indices=new Map(companies.map((c,j)=>[c.name,j])),counts=companies.map(()=>[0,0,0,0,0]),cache=new Map();
  schedules=schedules.map(p=>[...p]);schedules.forEach(plan=>plan.forEach((name,t)=>{if(name!==null)counts[indices.get(name)][t]++;}));
  function cost(j){const total=counts[j].reduce((a,b)=>a+b,0),avg=total/companies[j].slots.length;return companies[j].slots.reduce((s,t)=>s+(counts[j][t]-avg)**2,0)-10*total/Math.max(1,demand[j]);}
  function plans(wishes,needed){const key=JSON.stringify([wishes,needed]);if(cache.has(key))return cache.get(key);const found=[],plan=Array(5).fill(null);
    function visit(i,left){if(!left){found.push([...plan]);return;}if(wishes.length-i<left)return;const name=wishes[i];
      for(const t of companies[indices.get(name)].slots)if(plan[t]===null){plan[t]=name;visit(i+1,left-1);plan[t]=null;}
      if(wishes.length-i>left)visit(i+1,left);
    }visit(0,needed);cache.set(key,found);return found;
  }
  for(let round=0;round<8;round++){let changed=false;
    managers.forEach((m,i)=>{const old=schedules[i],affected=m.wishes.map(n=>indices.get(n)),oldCost=affected.reduce((s,j)=>s+cost(j),0);
      old.forEach((n,t)=>{if(n!==null)counts[indices.get(n)][t]--;});let best=old,bestCost=oldCost;
      for(const plan of plans(m.wishes,old.filter(n=>n!==null).length)){
        if(plan.some((n,t)=>n!==null&&counts[indices.get(n)][t]>=10))continue;
        plan.forEach((n,t)=>{if(n!==null)counts[indices.get(n)][t]++;});const score=affected.reduce((s,j)=>s+cost(j),0);
        plan.forEach((n,t)=>{if(n!==null)counts[indices.get(n)][t]--;});if(score<bestCost-1e-7){best=plan;bestCost=score;}
      }best.forEach((n,t)=>{if(n!==null)counts[indices.get(n)][t]++;});schedules[i]=[...best];if(bestCost<oldCost-1e-7)changed=true;
    });if(!changed)break;
  }return schedules;
}
function solve(highs,managers,rawCompanies,progress=()=>{}){
  const companies=validateCompanies(rawCompanies),byName=new Map(companies.map((c,j)=>[c.name,j]));
  const demand=companies.map(c=>managers.filter(m=>m.wishes.includes(c.name)).length),vars=[],byMT=new Map(),byMC=new Map(),byCT=new Map(),byManager=new Map();
  function add(map,key,v){if(!map.has(key))map.set(key,[]);map.get(key).push(v);}
  managers.forEach((m,i)=>m.wishes.forEach(name=>{const j=byName.get(name);if(j===undefined)throw Error('기업시간표에 없는 희망기업이 있습니다.');companies[j].slots.forEach(t=>{const v=vars.length;vars.push({i,j,t});add(byManager,i,v);add(byMT,`${i}_${t}`,v);add(byMC,`${i}_${j}`,v);add(byCT,`${j}_${t}`,v);});}));
  if(!vars.length)throw Error('배정 가능한 시간이 없습니다.');
  const sum=vs=>vs.map(v=>`x${v}`).join(' + '),constraints=[];
  for(const vs of [...byMT.values(),...byMC.values()])constraints.push(`${sum(vs)} <= 1`);
  for(const vs of byCT.values())constraints.push(`${sum(vs)} <= 10`);
  const all=vars.map((_,v)=>v),binary='Binary\n '+all.map(v=>`x${v}`).join(' ')+'\nEnd';
  function lp(objective,extra=[]){return `Minimize\n obj: ${objective}\nSubject To\n`+[...constraints,...extra].map((c,r)=>` r${r}: ${c}`).join('\n')+'\n'+binary;}
  function run(text,limit,seed){const model=highs.createModel({format:'lp',data:text});try{
    model.options.set({output_flag:false,time_limit:limit,mip_rel_gap:0,random_seed:42});
    if(seed){const values=new Float64Array(model.getModel().numCols);for(const [name,value] of Object.entries(seed))values[model.getColByName(name)]=value;model.setSolution({colValue:values});}
    model.run();if(model.info.get('primal_solution_status')!==highs.constants.solutionStatus.feasible)return null;
    const values=model.getSolution().colValue;return {optimal:model.getModelStatus()===highs.constants.modelStatus.optimal,values:vars.map((_,v)=>values[model.getColByName(`x${v}`)])};
  }finally{model.dispose();}}
  const seed=Object.fromEntries(all.map(v=>[`x${v}`,0]));
  progress('희망기업을 배정하는 중…');
  const first=run(lp(all.map(v=>`- x${v}`).join(' ')),60,seed);
  if(!first)throw Error('시간 내에 일정을 만들지 못했습니다. 명단을 나눠 다시 시도해 주세요.');
  function schedule(values){const plans=managers.map(()=>Array(5).fill(null));values.forEach((value,v)=>{if(!Number.isFinite(value)||Math.abs(value-Math.round(value))>1e-5)throw Error('배정 계산 결과를 확인하지 못했습니다.');if(value>.5){const {i,j,t}=vars[v];if(plans[i][t]!==null)throw Error('중복 시간 배정 오류');plans[i][t]=companies[j].name;}});validateSchedules(plans,managers,companies);return plans;}
  let schedules=schedule(first.values),best=validateSchedules(schedules,managers,companies);
  // Preserve total attendance, then maximize the lowest individual fulfillment ratio.
  const minimumRate=plans=>Math.min(...plans.map((p,i)=>p.filter(n=>n!==null).length/managers[i].wishes.length));
  const originalMinimum=minimumRate(schedules),fairSeed={fair_rate:originalMinimum};
  vars.forEach(({i,j,t},v)=>{fairSeed[`x${v}`]=schedules[i][t]===companies[j].name?1:0;});
  const fairConstraints=[`${sum(all)} = ${best}`,`fair_rate >= ${originalMinimum}`];
  managers.forEach((m,i)=>fairConstraints.push(`${sum(byManager.get(i))} - ${m.wishes.length} fair_rate >= 0`));
  progress('매니저별 최소 할당률을 높이는 중…');
  let fair=null;
  try{fair=run(lp('- fair_rate',fairConstraints),10,fairSeed);}catch{ /* Retain the valid initial schedule if refinement fails. */ }
  if(fair){const candidate=schedule(fair.values);if(validateSchedules(candidate,managers,companies)===best&&minimumRate(candidate)>=originalMinimum)schedules=candidate;}
  const protectedMinimum=minimumRate(schedules);
  const minimumCounts=managers.map(m=>Math.ceil(protectedMinimum*m.wishes.length-1e-7));
  const respectsMinimum=plans=>plans.every((p,i)=>p.filter(n=>n!==null).length>=minimumCounts[i]);
  progress('타임별 인원을 조정하는 중…');
  schedules=balanceLocally(schedules,managers,companies,demand);
  const extra=[`${sum(all)} = ${best}`,...managers.map((m,i)=>`${sum(byManager.get(i))} >= ${minimumCounts[i]}`)];
  const secondarySeed={},objective=vars.map(({j},v)=>`- ${10/Math.max(1,demand[j])} x${v}`);
  vars.forEach(({i,j,t},v)=>{secondarySeed[`x${v}`]=schedules[i][t]===companies[j].name?1:0;});
  companies.forEach((c,j)=>{const vs=c.slots.flatMap(t=>byCT.get(`${j}_${t}`)||[]),k=c.slots.length,total=vs.reduce((a,v)=>a+secondarySeed[`x${v}`],0);
    if(!vs.length)return;
    c.slots.forEach(t=>{const d=`d${j}_${t}`;objective.push(`+ ${d}`);const coeff=vs.map(v=>[v,vars[v].t===t?k-1:-1]).filter(([,a])=>a!==0);
      const expr=sign=>coeff.map(([v,a])=>`${a*sign>=0?'+':'-'} ${Math.abs(a)} x${v}`).join(' ');
      extra.push(`${expr(1)} - ${k} ${d} <= 0`,`${expr(-1)} - ${k} ${d} <= 0`);
      const load=(byCT.get(`${j}_${t}`)||[]).reduce((a,v)=>a+secondarySeed[`x${v}`],0);secondarySeed[d]=Math.abs(load-total/k);
    });
  });
  let second=null;
  try{second=run(lp(objective.join(' '),extra),10,secondarySeed);}catch{ /* Keep the verified primary schedule if balance refinement fails. */ }
  if(second){const candidate=schedule(second.values);if(validateSchedules(candidate,managers,companies)===best&&respectsMinimum(candidate))schedules=candidate;}
  schedules=balanceLocally(schedules,managers,companies,demand);
  if(!respectsMinimum(schedules))throw Error('최소 할당률 확인에 실패했습니다.');
  if(validateSchedules(schedules,managers,companies)!==best)throw Error('배정 건수 확인에 실패했습니다.');
  const people=managers.map((m,i)=>({...m,schedule:schedules[i],unassigned:m.wishes.filter(n=>!schedules[i].includes(n))}));
  const companyResults=companies.map((c,j)=>({...c,demand:demand[j],sessions:c.slots.map(slot=>({slot,time:TIMES[slot],managers:people.filter(m=>m.schedule[slot]===c.name).map(({id,name,organization})=>({id,name,organization}))}))}));
  return {managers:people,companies:companyResults,stats:{managers:people.length,requested:managers.reduce((n,m)=>n+m.wishes.length,0),assigned:best,complete:people.filter(m=>!m.unassigned.length).length},optimal:first.optimal,balanced:!!second?.optimal};
}
root.Schedule={TIMES,normalize,validateCompanies,timeWarnings,parseManagers,validateSchedules,solve};
if(typeof module!=='undefined')module.exports=root.Schedule;
})(globalThis);
