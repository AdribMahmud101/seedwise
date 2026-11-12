import { getPlan, getReadyPlan, listPlans, savePlan } from './journey.js';
import { deriveChecklist } from './plan.js';
import { riskStatus } from './recovery-risk.js';
import { state, t, esc, agronomy, nasaBadge, toast } from './ui.js';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const crops = () => agronomy?.crops || [];
let view = 'month', cursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1), selectedDay = null, selectedTaskId = null;
let brief = null, activePlanId = null, host = null, dragKey = null, riskOn = false, touchX = null, riskRequest = 0, undoState = null, undoTimer = null;
const dateKey = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate()+days);
function riskMonth(){const signal=riskOn&&brief&&riskStatus(brief).signals.find(item=>item.id==='dry'||item.id==='rain');if(!signal?.month)return 0;const value=String(signal.month),iso=Number(value.slice(-2));return iso>=1&&iso<=12?iso:MONTHS.findIndex(month=>month.slice(0,3).toLowerCase()===value.slice(0,3).toLowerCase())+1}

export function calendarTasks(plan, year = cursor.getFullYear()) {
  if (!plan?.rotation?.seasons) return [];
  return plan.rotation.seasons.filter(s => s.crop !== 'fallow').map(season => {
    const date = season.sowDate ? new Date(year, Number(season.sowDate.slice(5,7))-1, Number(season.sowDate.slice(8,10))) : null;
    const planting = plan.planting?.[season.key] || {};
    const item = deriveChecklist(plan, null).find(task => task.id === `sow-${season.key}`);
    return item ? { id: item.id, date: date && dateKey(date), month: season.sowMonth, title: item[state.lang === 'bn' ? 'bn' : 'en'], season, planting, kind: 'sow' } : null;
  }).filter(Boolean);
}

export function deriveSeasonBands(plan, year, agronomyData = crops()) {
  return (plan?.rotation?.seasons || []).filter(season => season.crop !== 'fallow').flatMap(season => {
    const crop = agronomyData.find(item => item.id === season.crop || item.id === plan.planting?.[season.key]?.crop);
    const hasDuration = Array.isArray(crop?.durationDays) && crop.durationDays.length === 2;
    const years = season.sowDate ? [year] : [year - 1, year];
    return years.flatMap(sowYear => {
    const sow = season.sowDate ? new Date(sowYear, Number(season.sowDate.slice(5, 7))-1, Number(season.sowDate.slice(8, 10))) : new Date(sowYear, season.sowMonth - 1, 1);
    const sowEnd = season.sowDate ? sow : new Date(sowYear, season.sowMonth, 0);
    const start = dateKey(sow);
    const harvestStart = hasDuration ? addDays(sow, Number(crop.durationDays[0])) : new Date(sowYear + (season.harvestMonth < season.sowMonth ? 1 : 0), season.harvestMonth - 1, 1);
    const harvestEnd = hasDuration ? addDays(sowEnd, Number(crop.durationDays[1])) : new Date(sowYear + (season.harvestMonth < season.sowMonth ? 1 : 0), season.harvestMonth, 0);
    const end = dateKey(harvestEnd);
    const first = new Date(`${start}T00:00:00`), last = new Date(`${end}T00:00:00`);
    const days = [];
    for (let date = first; date <= last; date = addDays(date, 1)) {
      const key = dateKey(date);
      days.push({ date: key, season, crop, color: cropColor(plan, season), stage: date <= sowEnd ? 'sow' : date < harvestStart ? 'grow' : 'harvest', start, end, harvestStart: dateKey(harvestStart), harvestEnd: end });
    }
    return days.filter(day => Number(day.date.slice(0, 4)) === year);
    });
  });
}

function cropColor(plan, season) {
  const palette = { aman:'#6f9c55', boro:'#4386a8', rice:'#4386a8', mustard:'#d3a332', potato:'#a87545', mungbean:'#62a982' };
  const custom = plan.rotation?.customPlan?.planting?.find(item => item.crop?.toLowerCase() === season.crop?.toLowerCase());
  return plan.planting?.[season.key]?.color || custom?.color || palette[season.crop] || '#798c60';
}

export function validateSowDate(plan, seasonKey, value, agronomyData = crops()) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime()) || dateKey(date) !== value) throw new RangeError('Invalid sow date');
  const seasons = plan?.rotation?.seasons || [], index = seasons.findIndex(item => item.key === seasonKey), season = seasons[index];
  if (!season) throw new RangeError('Unknown season');
  const month = date.getMonth() + 1;
  const monthDistance = Math.min((month - season.sowMonth + 12) % 12, (season.sowMonth - month + 12) % 12);
  if (monthDistance > 1) throw new RangeError('Sow date is more than one month outside the planned sowing month');
  const crop = agronomyData.find(item => item.id === season.crop || item.id === plan.planting?.[seasonKey]?.crop);
  const maxDays = Number(crop?.durationDays?.[1]);
  const harvest = Number.isFinite(maxDays) ? addDays(date, maxDays) : new Date(date.getFullYear() + (season.harvestMonth < date.getMonth() + 1 ? 1 : 0), season.harvestMonth, 0);
  const next = seasons.slice(index + 1).find(item => item.crop !== 'fallow') || seasons.slice(0, index).find(item => item.crop !== 'fallow');
  if (next) {
    const nextYear = next.sowMonth <= date.getMonth()+1 ? date.getFullYear()+1 : date.getFullYear();
    const nextSow = next.sowDate ? new Date(`${nextYear}-${next.sowDate.slice(5, 10)}T00:00:00`) : new Date(nextYear, next.sowMonth - 1, 1);
    if (nextSow <= harvest) throw new RangeError(`Harvest window overlaps ${next.crop} sowing`);
  }
}

function harvestTasks(plan) {
  return (plan?.rotation?.seasons||[]).filter(season=>season.crop!=='fallow').map(season=>({id:`harvest-${season.key}`,month:season.harvestMonth,title:t(`Harvest ${season.crop}` ,`${season.cropBn} কাটুন`),kind:'harvest',season}));
}

export function toggleCalendarTask(plan, taskId, checked) {
  if (!deriveChecklist(plan, null).some(task => task.id === taskId)) throw new RangeError('Unknown checklist task');
  return { ...structuredClone(plan), checklist: { ...plan.checklist, [taskId]: !!checked } };
}

export function undatedChecklistTasks(plan) {
  return deriveChecklist(plan, null).filter(item => !item.id.startsWith('sow-'));
}

export function shiftSowDate(plan, seasonKey, value, agronomyData = crops()) {
  validateSowDate(plan, seasonKey, value, agronomyData);
  const date = new Date(`${value}T00:00:00`);
  const season = plan?.rotation?.seasons?.find(item => item.key === seasonKey);
  if (!season) throw new RangeError('Unknown season');
  const crop = agronomyData.find(item => item.id === season.crop || item.id === plan.planting?.[seasonKey]?.crop);
  const next = structuredClone(plan);
  const target = next.rotation.seasons.find(item => item.key === seasonKey);
  const duration=Math.max(1, Math.ceil((Number(crop?.durationDays?.[1]) || ((season.harvestMonth-season.sowMonth+12)%12+1)*30)/30));
  target.sowDate = value;
  target.sowMonth = date.getMonth()+1;
  const expectedHarvest = crop?.durationDays?.[1] ? addDays(date, Number(crop.durationDays[1])) : new Date(date.getFullYear(), date.getMonth()+duration, 0);
  target.harvestMonth = expectedHarvest.getMonth()+1;
  if (next.rotation.customPlan?.calendar) {
    const oldMonths=Array.from({length:duration},(_,i)=>(season.sowMonth+i-1)%12+1),newMonths=Array.from({length:duration},(_,i)=>(target.sowMonth+i-1)%12+1);
    next.rotation.customPlan.calendar = next.rotation.customPlan.calendar.map(row => {
      let names=row.crop.split(/\s*\+\s*/);
      if(oldMonths.includes(row.month))names=names.filter(name=>name.toLowerCase()!==season.crop.toLowerCase());
      if(newMonths.includes(row.month)&&!names.some(name=>name.toLowerCase()===season.crop.toLowerCase()))names.push(season.crop);
      if(oldMonths.includes(row.month)||newMonths.includes(row.month))return {...row,crop:names.join(' + ')||'Fallow'};
      return row;
    });
  }
  return next;
}

const monthTitle = date => `${t(MONTHS[date.getMonth()], ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'][date.getMonth()])} ${date.getFullYear()}`;
function selectedPlan() {
  const entries = listPlans();
  const active = getPlan(), ready = getReadyPlan();
  const chosen = entries.find(entry => entry.id === activePlanId) || entries.find(entry => entry.id === active?.id) ||
    (!active && entries.find(entry => entry.id === ready?.id)) || entries.find(entry => entry.id === ready?.id) || (active ? null : entries[0]);
  const current = chosen || (active ? { id: active.id, name: active.field?.name || t('Active plan','চলমান পরিকল্পনা'), status: 'draft', plan: active } : ready);
  const options = active && !entries.some(entry => entry.id === active.id) ? [{ id:active.id,name:active.field?.name||t('Active plan','চলমান পরিকল্পনা'),status:'draft',plan:active },...entries] : entries;
  activePlanId = current?.id || null;
  return { entries: options, chosen: current, plan: current?.plan || null };
}
function eventsFor(plan, start, end) {
  return calendarTasks(plan, start.getFullYear()).filter(task => {
    const d = new Date(`${task.date}T00:00:00`); return d >= start && d <= end;
  });
}
function taskMarkup(task) {
  return task.kind === 'harvest' ? `<span class="cal-task cal-harvest">${esc(task.title)}</span>` : `<button class="cal-task cal-${task.kind}" draggable="true" data-cal-task="${esc(task.id)}" data-cal-day="${task.date||''}">${esc(task.title)}</button>`;
}
function bandMarkup(band) {
  const name = band.crop?.label || band.season.crop;
  const day = new Date(`${band.date}T00:00:00`).getDay(), firstVisible = day === 1 || band.date.slice(-2) === '01';
  return `<button class="cal-band cal-band-${band.stage}" draggable="true" data-cal-task="sow-${esc(band.season.key)}" data-cal-day="${band.date}" data-cal-band="${band.stage}" style="--crop:${esc(band.color)}" title="${esc(`${name} · ${band.stage}`)}">${firstVisible?`<span>${esc(name)}</span>`:''}</button>`;
}
function grid(plan) {
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1), offset = (start.getDay()+6)%7;
  const first = addDays(start, -offset), end = addDays(first, 41), tasks = eventsFor(plan, first, end), bands = deriveSeasonBands(plan, cursor.getFullYear());
  const today = dateKey(new Date()), riskClass = `risk-${brief?riskStatus(brief).level:'watch'}`;
  return `<div class="cal-grid" role="grid" aria-label="${esc(monthTitle(cursor))}">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d,i)=>`<div class="cal-weekday" role="columnheader">${t(d,['সোম','মঙ্গল','বুধ','বৃহ','শুক্র','শনি','রবি'][i])}</div>`).join('')}${Array.from({length:42},(_,i)=>{const d=addDays(first,i),key=dateKey(d),same=d.getMonth()===cursor.getMonth(),weekStart=i%7===0;const sow=weekStart?calendarTasks(plan,cursor.getFullYear()).find(task=>!task.date&&task.month===d.getMonth()+1):null,harvest=weekStart?harvestTasks(plan).find(task=>task.month===d.getMonth()+1):null;return `<div class="cal-day ${same?'':'outside'} ${d.getMonth()+1===riskMonth()?`risk ${riskClass}`:''} ${key===today?'today':''} ${selectedDay===key?'selected':''}" role="gridcell" tabindex="0" aria-label="${esc(key)}" data-cal-day="${key}" ${dragKey?'data-cal-drop="true"':''}><span>${d.getDate()}</span>${sow&&same?`<button class="cal-window-task" draggable="true" data-cal-task="${esc(sow.id)}" data-cal-window="true">${t(`Sow in ${MONTHS[d.getMonth()]}`,`${['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'][d.getMonth()]}-এ বুনুন`)}</button>`:''}${harvest&&same?`<span class="cal-window-task cal-harvest">${esc(harvest.title)}</span>`:''}${bands.filter(band=>band.date===key).map(bandMarkup).join('')}${tasks.filter(x=>x.date===key).map(taskMarkup).join('')}</div>`}).join('')}</div>`;
}
function ribbon(plan) {
  const seasons=plan.rotation?.seasons||[];
  return `<div class="cal-ribbon" aria-label="${t('Year rotation','বার্ষিক ফসলচক্র')}">${Array.from({length:12},(_,i)=>{const season=seasons.find(s=>{let m=s.sowMonth;for(let n=0;n<12;n++){if(m===i+1)return true;if(m===s.harvestMonth)break;m=m%12+1}return false});const phase=season?(season.sowMonth===i+1?'sow':season.harvestMonth===i+1?'harvest':'grow'):'';const label=plan.planting?.[season?.key]?.crop||season?.crop, color=season?cropColor(plan,season):'#798c60';return `<button class="${i===new Date().getMonth()?'now':''} ${i+1===riskMonth()?`risk ${brief?`risk-${riskStatus(brief).level}`:''}`:''}" data-cal-month="${i}" title="${esc(label||'')}" style="--crop:${esc(color)}">${t(MONTHS[i].slice(0,3),['জানু','ফেব্রু','মার্চ','এপ্রিল','মে','জুন','জুল','আগ','সেপ্টে','অক্টো','নভে','ডিসে'][i])}${season?`<i class="${phase}"></i><small>${esc(label)}</small>`:''}</button>`}).join('')}</div><div class="cal-legend">${seasons.map(s=>`<span><i style="--crop:${esc(cropColor(plan,s))}"></i>${esc(plan.planting?.[s.key]?.crop||s.crop)}</span>`).join('')}<span>▼ ${t('Sowing','বপন')}</span><span>✂ ${t('Harvest','কাটা')}</span></div>`;
}
function drawer(plan) {
  if(!selectedDay&&!selectedTaskId)return '';
  const tasks=selectedTaskId?calendarTasks(plan,cursor.getFullYear()).filter(item=>item.id===selectedTaskId):eventsFor(plan,new Date(`${selectedDay}T00:00:00`),new Date(`${selectedDay}T23:59:59`));
  const task=tasks[0], season=task?.season;
  const crop=crops().find(item=>item.id===season?.crop||item.id===task?.planting.crop);
  const sources=(agronomy?.sources||[]).filter(source=>crop?.sourceIds?.includes(source.id));
  const band=season?deriveSeasonBands(plan,Number(selectedDay?.slice(0,4)||cursor.getFullYear())).find(item=>item.date===(selectedDay||item.start)&&item.season.key===season.key):null;
  const dayNumber=band&&season?Math.max(1,Math.floor((new Date(`${selectedDay||band.date}T00:00:00`)-new Date(`${band.start}T00:00:00`))/86400000)+1):null;
  const kcStage={sow:'initial',grow:'mid',harvest:'end'}[band?.stage],kc=kcStage&&crop?.kc?.[kcStage], kcText=Array.isArray(kc)?kc.join('–'):kc;
  const durations=crop?.durationDays;
  return `<aside class="cal-drawer" role="dialog" aria-label="${t('Day details','দিনের বিবরণ')}"><button class="cal-drawer-close" data-cal-close aria-label="${t('Close','বন্ধ করুন')}">×</button><h2>${esc(selectedDay||`${MONTHS[(task?.month||1)-1]} ${cursor.getFullYear()}`)}</h2>${task?`<h3>${esc(crop?.label||season.crop)}</h3><p>${t('Stage','পর্যায়')}: ${t({'sow':'Sowing window','grow':'Growing','harvest':'Harvest window'}[band?.stage]||'Sowing window',{'sow':'বপনের সময়','grow':'বাড়ছে','harvest':'ফসল তোলার সময়'}[band?.stage]||'বপনের সময়')}${dayNumber?` · ${t(`Day ${dayNumber} of season`,`মৌসুমের ${dayNumber}তম দিন`)}`:''}</p>${durations?`<p>${t('Expected harvest','সম্ভাব্য ফসল তোলা')}: ${durations[0]}–${durations[1]} ${t('days after sowing','বপনের পর দিন')}${band?` (${band.harvestStart}–${band.harvestEnd})`:''}</p>`:''}<p>${t('Row × plant spacing','সারি × গাছের দূরত্ব')}: ${esc(`${task.planting.rowSpacingCm||crop?.spacingCm?.[0]} × ${task.planting.withinRowCm||crop?.spacingCm?.[1]} cm`)}</p>${kcText?`<p>${t('Crop water coefficient (Kc)','ফসলের পানির সহগ (Kc)')}: ${esc(String(kcText))} · ${esc(kcStage)}</p>`:''}<label><input type="checkbox" data-cal-check="${esc(task.id)}" ${plan.checklist?.[task.id]?'checked':''}> ${t('Mark complete','সম্পন্ন')}</label><label>${t('Pick a day','দিন বাছুন')} <input type="date" data-cal-date="${esc(season.key)}" value="${esc(season.sowDate||'')}"></label>${sources.length?`<p>${t('Agronomy sources','কৃষি তথ্যসূত্র')}: ${sources.map(source=>`<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.name||source.publisher||source.id)}</a>`).join(' · ')}</p>`:''}`:`<p>${t('No planned task on this day.','এই দিনে কোনো পরিকল্পিত কাজ নেই।')}</p>`}<button data-cal-ask>${t('Ask Planty about this','Planty-কে এ বিষয়ে জিজ্ঞেস করুন')}</button></aside>`;
}
function render() {
  if(!host)return;
  const {entries,chosen,plan}=selectedPlan();
  if(!plan){host.innerHTML=`<section class="cal-empty"><h1>${t('Calendar','ক্যালেন্ডার')}</h1><p>${t('Planty can help you start a plan for your field.','আপনার জমির পরিকল্পনা শুরু করতে Planty সাহায্য করতে পারে।')}</p><a class="button primary" href="#field">${t('Start a plan','পরিকল্পনা শুরু করুন')}</a></section>`;return;}
  const start = view==='week' ? addDays(cursor,-((cursor.getDay()+6)%7)) : new Date(cursor.getFullYear(),cursor.getMonth(),1);
  const tasks=calendarTasks(plan,new Date().getFullYear()),weekStart=addDays(new Date(),-((new Date().getDay()+6)%7)),weekEnd=addDays(weekStart,6),dated=tasks.filter(x=>x.date&&new Date(`${x.date}T00:00:00`)>=weekStart&&new Date(`${x.date}T00:00:00`)<=weekEnd),undated=undatedChecklistTasks(plan),weekTasks=[...dated.map(task=>({id:task.id,title:task.title,date:task.date})),...undated.map(item=>({id:item.id,title:t(item.en,item.bn)}))],done=weekTasks.filter(item=>plan.checklist?.[item.id]).length,progress=weekTasks.length?Math.round(done/weekTasks.length*100):100;
  host.innerHTML=`<header class="page-head"><div><div class="eyebrow">${esc(plan.field?.name||'')}</div><h1>${t('Calendar','ক্যালেন্ডার')}</h1><p>${t('Plan tasks, season timing, and field risk.','পরিকল্পনার কাজ, মৌসুমের সময় ও জমির ঝুঁকি।')}</p></div><select data-cal-plan aria-label="${t('Choose plan','পরিকল্পনা বাছুন')}">${entries.map(entry=>`<option value="${esc(entry.id)}" ${entry.id===chosen?.id?'selected':''}>${esc(entry.name)} · ${t(entry.status==='ready'?'Ready':'Draft',entry.status==='ready'?'প্রস্তুত':'খসড়া')}</option>`).join('')}</select></header>${ribbon(plan)}<section class="cal-focus"><div class="cal-progress" style="--progress:${progress}%"><span>${progress}%</span></div><div><strong>${t('This week','এই সপ্তাহ')}</strong>${weekTasks.length?weekTasks.map(item=>`<label class="cal-week-task ${item.date&&item.date<dateKey(new Date())?'overdue':''}"><input type="checkbox" data-cal-check="${esc(item.id)}" ${plan.checklist?.[item.id]?'checked':''}>${esc(item.title)}</label>`).join(''):`<span>${t('No tasks due this week','এই সপ্তাহে কোনো কাজ নেই')}</span>`}</div><button data-cal-ask>${t('Ask Planty about this week','এই সপ্তাহ নিয়ে Planty-কে জিজ্ঞেস করুন')}</button></section>${undoState?`<button class="cal-undo" data-cal-undo>${t('Undo date change','তারিখ পরিবর্তন ফিরিয়ে নিন')}</button>`:''}<div class="cal-toolbar"><button data-cal-nav="-1" aria-label="${t('Previous','আগে')}">‹</button><h2>${esc(monthTitle(cursor))}</h2><button data-cal-nav="1" aria-label="${t('Next','পরে')}">›</button><div class="cal-views">${['month','week','agenda'].map(v=>`<button data-cal-view="${v}" aria-pressed="${view===v}">${t(v[0].toUpperCase()+v.slice(1),{month:'মাস',week:'সপ্তাহ',agenda:'তালিকা'}[v])}</button>`).join('')}</div></div><label class="cal-risk-toggle"><input type="checkbox" data-cal-risk ${brief?'':'disabled'} ${riskOn?'checked':''}> ${t('Risk overlay','ঝুঁকির স্তর')}</label>${brief&&riskOn?`<p class="cal-risk cal-risk-${riskStatus(brief).level}">${esc(riskLine(brief))} ${nasaBadge(['power','prithvi'],brief.date?.slice(0,4)||'2024')}</p>`:''}<div class="cal-body">${view==='month'?grid(plan):view==='week'?week(plan,start):agenda(plan)}${drawer(plan)}</div>`;
}
function riskLine(data){const r=riskStatus(data), signal=r.signals.find(x=>x.id==='dry'||x.id==='rain');return signal?.id==='dry'?t(`Soil ${Math.abs(signal.value)}% ${signal.value<0?'drier':'wetter'} than normal (${signal.month})`,`মাটি স্বাভাবিকের চেয়ে ${Math.abs(signal.value)}% ${signal.value<0?'শুষ্ক':'ভেজা'} (${signal.month})`):signal?.id==='rain'?t(`Rain outlook ${signal.mm} mm; normal ${signal.normal} mm`,`বৃষ্টির পূর্বাভাস ${signal.mm} মিমি; স্বাভাবিক ${signal.normal} মিমি`):t(`Field risk: ${r.level}`,`জমির ঝুঁকি: ${r.level}`)}
function week(plan,start){const bands=deriveSeasonBands(plan,start.getFullYear());return `<div class="cal-week">${Array.from({length:7},(_,i)=>{const d=addDays(start,i),key=dateKey(d);return `<section><h3>${t(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i],['সোম','মঙ্গল','বুধ','বৃহ','শুক্র','শনি','রবি'][i])} ${d.getDate()}</h3>${bands.filter(band=>band.date===key).map(bandMarkup).join('')}${eventsFor(plan,d,d).map(taskMarkup).join('')}</section>`}).join('')}</div>`}
function agenda(plan){const tasks=new Map(calendarTasks(plan,cursor.getFullYear()).map(task=>[task.id,task])),bands=deriveSeasonBands(plan,cursor.getFullYear());const seasons=(plan.rotation.seasons||[]).filter(season=>season.crop!=='fallow').map(season=>{const first=bands.find(band=>band.season.key===season.key),task=tasks.get(`sow-${season.key}`);return `<li class="cal-timeline"><time>${t(`Sow in ${MONTHS[season.sowMonth-1]}`,`${['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'][season.sowMonth-1]}-এ বপন`)}</time><div><b>${esc(plan.planting?.[season.key]?.crop||season.crop)}</b><div class="cal-timeline-band" style="--crop:${first?.crop?.color||'#6f9c55'}"></div><small>${t('Growing','বাড়ছে')} · ${t('Harvest','কাটা')} ${MONTHS[season.harvestMonth-1]}</small></div>${task?`<label><input type="checkbox" data-cal-check="${esc(task.id)}" ${plan.checklist?.[task.id]?'checked':''}> ${t('Done','সম্পন্ন')}</label>`:''}</li>`});const checklist=deriveChecklist(plan,null).filter(item=>!item.id.startsWith('sow-')).map(item=>`<li><time>${t('This week','এই সপ্তাহ')}</time><span>${esc(t(item.en,item.bn))}</span><label><input type="checkbox" data-cal-check="${esc(item.id)}" ${plan.checklist?.[item.id]?'checked':''}> ${t('Done','সম্পন্ন')}</label></li>`);return `<ol class="cal-agenda">${[...seasons,...checklist].join('')||`<li>${t('Your season timeline will appear here when a plan is saved.','পরিকল্পনা সংরক্ষণ হলে মৌসুমের সময়রেখা দেখা যাবে।')}</li>`}</ol>`}
function askPlanty(){const anchor=selectedDay?new Date(`${selectedDay}T00:00:00`):new Date(),start=addDays(anchor,-((anchor.getDay()+6)%7)),end=addDays(start,6),plan=selectedPlan().plan,tasks=[...calendarTasks(plan,start.getFullYear()).filter(task=>task.date&&new Date(`${task.date}T00:00:00`)>=start&&new Date(`${task.date}T00:00:00`)<=end),...undatedChecklistTasks(plan).map(item=>({id:item.id,title:t(item.en,item.bn),kind:'checklist'}))];window.dispatchEvent(new CustomEvent('calendar:ask',{detail:{tasks,risk:brief?riskLine(brief):''}}))}
export function calendar(){return '<section class="calendar-page" id="calendar-page"></section>'}
function loadBrief(fieldId){brief=null;riskOn=false;const request=++riskRequest;render();fetch(`/api/daily-brief?field=${encodeURIComponent(fieldId||state.fieldId)}`).then(r=>r.ok?r.json():null).then(value=>{if(host&&request===riskRequest){brief=value;render()}}).catch(()=>{})}
export function mountCalendar(){host=document.querySelector('#calendar-page');if(!host)return;if(matchMedia('(max-width: 640px)').matches)view='agenda';const routeId=location.hash.match(/^#calendar\/([^/?]+)/)?.[1];if(routeId)activePlanId=decodeURIComponent(routeId);host.addEventListener('click',click);host.addEventListener('change',change);host.addEventListener('keydown',keyDown);host.addEventListener('dragstart',dragStart);host.addEventListener('dragover',dragOver);host.addEventListener('drop',drop);host.addEventListener('touchstart',touchStart,{passive:true});host.addEventListener('touchend',touchEnd,{passive:true});loadBrief(selectedPlan().plan?.field?.id)}
export function disposeCalendar(){riskRequest++;clearTimeout(undoTimer);undoState=null;host?.removeEventListener('click',click);host?.removeEventListener('change',change);host?.removeEventListener('keydown',keyDown);host?.removeEventListener('dragstart',dragStart);host?.removeEventListener('dragover',dragOver);host?.removeEventListener('drop',drop);host?.removeEventListener('touchstart',touchStart);host?.removeEventListener('touchend',touchEnd);host=null;brief=null;}
function click(e){const el=e.target.closest('[data-cal-view],[data-cal-nav],[data-cal-month],[data-cal-day],[data-cal-task],[data-cal-close],[data-cal-ask],[data-cal-undo]');if(!el)return;if(el.dataset.calView){view=el.dataset.calView;render()}else if(el.dataset.calNav){cursor=new Date(cursor.getFullYear(),cursor.getMonth()+Number(el.dataset.calNav),1);render()}else if(el.dataset.calMonth!==undefined){cursor=new Date(cursor.getFullYear(),Number(el.dataset.calMonth),1);selectedDay=null;render()}else if(el.dataset.calUndo!==undefined){if(undoState){savePlan(undoState.plan,{status:undoState.status});undoState=null;clearTimeout(undoTimer);window.dispatchEvent(new CustomEvent('calendar:shifted',{detail:{id:activePlanId}}));render()}}else if(el.dataset.calClose){selectedDay=null;selectedTaskId=null;render()}else if(el.dataset.calAsk)askPlanty();else if(el.dataset.calTask){selectedTaskId=el.dataset.calTask;selectedDay=el.dataset.calDay||null;render()}else if(el.dataset.calDay){selectedTaskId=null;selectedDay=el.dataset.calDay;render()}}
function saveShift(plan,chosen,shifted){undoState={plan:structuredClone(plan),status:chosen.status};clearTimeout(undoTimer);undoTimer=setTimeout(()=>{undoState=null;render()},10000);savePlan(shifted,{status:chosen.status,keepPrevious:true});window.dispatchEvent(new CustomEvent('calendar:shifted',{detail:{id:chosen.id}}));render()}
function dateError(error){return error.message.startsWith('Harvest window overlaps')?t(`${error.message}.`,`ফসল তোলার সময় ${error.message.slice(25)} বপনের সঙ্গে মিলে যাচ্ছে।`):error.message==='Sow date is more than one month outside the planned sowing month'?t('Choose a day within one month of the planned sowing month.','পরিকল্পিত বপন মাসের এক মাসের মধ্যে দিন বাছুন।'):error.message==='Invalid sow date'?t('Choose a valid day.','সঠিক দিন বাছুন।'):t('Plan could not be saved.','পরিকল্পনা সংরক্ষণ করা যায়নি।')}
function change(e){const el=e.target;if(el.matches('[data-cal-plan]')){undoState=null;clearTimeout(undoTimer);activePlanId=el.value;loadBrief(selectedPlan().plan?.field?.id);return}if(el.matches('[data-cal-risk]')){riskOn=el.checked;render();return}if(el.matches('[data-cal-check]')){const {plan,chosen}=selectedPlan();savePlan(toggleCalendarTask(plan,el.dataset.calCheck,el.checked),{status:chosen.status});render();return}if(el.matches('[data-cal-date]')){const {plan,chosen}=selectedPlan();try{saveShift(plan,chosen,shiftSowDate(plan,el.dataset.calDate,el.value))}catch(error){el.setCustomValidity(dateError(error));el.reportValidity()}}}
function keyDown(e){if(e.target.matches('[data-cal-day]')&&['Enter',' '].includes(e.key)){e.preventDefault();selectedDay=e.target.dataset.calDay;render();return}if(e.target.matches('[data-cal-day]')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key],next=addDays(new Date(`${e.target.dataset.calDay}T00:00:00`),delta);selectedDay=dateKey(next);if(next.getMonth()!==cursor.getMonth())cursor=new Date(next.getFullYear(),next.getMonth(),1);render();requestAnimationFrame(()=>host?.querySelector(`[data-cal-day="${selectedDay}"]`)?.focus())}}
function touchStart(e){if(e.target.closest('button,input,select'))return;touchX=e.changedTouches[0].clientX}
function touchEnd(e){if(touchX===null)return;const delta=e.changedTouches[0].clientX-touchX;touchX=null;if(Math.abs(delta)>60){cursor=new Date(cursor.getFullYear(),cursor.getMonth()+(delta<0?1:-1),1);render()}}
function dragStart(e){const task=e.target.closest('[data-cal-task]');if(!task)return;dragKey=task.dataset.calTask;e.dataTransfer.setData('text/plain',dragKey)}
function dragOver(e){if(e.target.closest('.cal-day'))e.preventDefault()}
function drop(e){const day=e.target.closest('.cal-day');if(!day)return;e.preventDefault();const key=e.dataTransfer.getData('text/plain')||dragKey;if(!key)return;const {plan,chosen}=selectedPlan(),seasonKey=key.replace(/^sow-/,'');try{saveShift(plan,chosen,shiftSowDate(plan,seasonKey,day.dataset.calDay))}catch(error){toast(dateError(error))}finally{dragKey=null;render()}}
