import { getPlan, getReadyPlan, listPlans, savePlan } from './journey.js';
import { deriveChecklist } from './plan.js';
import { riskStatus } from './recovery-risk.js';
import { state, t, esc, agronomy, nasaBadge, toast } from './ui.js';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const crops = () => agronomy?.crops || [];
let view = 'month', cursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1), selectedDay = null, selectedTaskId = null;
let brief = null, activePlanId = null, host = null, dragKey = null, riskOn = false, touchX = null, riskRequest = 0;
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

function harvestTasks(plan) {
  return (plan?.rotation?.seasons||[]).filter(season=>season.crop!=='fallow').map(season=>({id:`harvest-${season.key}`,month:season.harvestMonth,title:t(`Harvest ${season.crop}` ,`${season.cropBn} কাটুন`),kind:'harvest',season}));
}

export function toggleCalendarTask(plan, taskId, checked) {
  if (!deriveChecklist(plan, null).some(task => task.id === taskId)) throw new RangeError('Unknown checklist task');
  return { ...structuredClone(plan), checklist: { ...plan.checklist, [taskId]: !!checked } };
}

export function shiftSowDate(plan, seasonKey, value, agronomyData = crops()) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime()) || dateKey(date) !== value) throw new RangeError('Invalid sow date');
  const season = plan?.rotation?.seasons?.find(item => item.key === seasonKey);
  if (!season) throw new RangeError('Unknown season');
  const crop = agronomyData.find(item => item.id === season.crop || item.id === plan.planting?.[seasonKey]?.crop);
  const window = crop?.sowingWindow;
  if (window?.start && window?.end) {
    const point = `${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const edge = value => String(value).match(/(?:^|\D)(\d{1,2})-(\d{1,2})$/)?.slice(1).map(n=>n.padStart(2,'0')).join('-');
    const start=edge(window.start), end=edge(window.end);
    const inside = start && end && (start <= end ? point >= start && point <= end : point >= start || point <= end);
    if (!inside) throw new RangeError('Sow date is outside the agronomy window');
  }
  const next = structuredClone(plan);
  const target = next.rotation.seasons.find(item => item.key === seasonKey);
  const duration=((season.harvestMonth-season.sowMonth+12)%12)+1;
  target.sowDate = value;
  target.sowMonth = date.getMonth()+1;
  target.harvestMonth = (target.sowMonth+duration-2)%12+1;
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
function grid(plan) {
  const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1), offset = (start.getDay()+6)%7;
  const first = addDays(start, -offset), end = addDays(first, 41), tasks = eventsFor(plan, first, end);
  const today = dateKey(new Date());
  return `<div class="cal-grid" role="grid" aria-label="${esc(monthTitle(cursor))}">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d,i)=>`<div class="cal-weekday" role="columnheader">${t(d,['সোম','মঙ্গল','বুধ','বৃহ','শুক্র','শনি','রবি'][i])}</div>`).join('')}${Array.from({length:42},(_,i)=>{const d=addDays(first,i),key=dateKey(d),same=d.getMonth()===cursor.getMonth();return `<div class="cal-day ${same?'':'outside'} ${d.getMonth()+1===riskMonth()?'risk':''} ${key===today?'today':''} ${selectedDay===key?'selected':''}" role="gridcell" tabindex="0" aria-label="${esc(key)}" data-cal-day="${key}" ${dragKey?'data-cal-drop="true"':''}><span>${d.getDate()}</span>${tasks.filter(x=>x.date===key).map(taskMarkup).join('')}</div>`}).join('')}</div>`;
}
function ribbon(plan) {
  const seasons=plan.rotation?.seasons||[];
  return `<div class="cal-ribbon" aria-label="${t('Year rotation','বার্ষিক ফসলচক্র')}">${Array.from({length:12},(_,i)=>{const season=seasons.find(s=>{let m=s.sowMonth;for(let n=0;n<12;n++){if(m===i+1)return true;if(m===s.harvestMonth)break;m=m%12+1}return false});const phase=season?(season.sowMonth===i+1?'sow':season.harvestMonth===i+1?'harvest':'grow'):'';return `<span class="${i===new Date().getMonth()?'now':''} ${i+1===riskMonth()?'risk':''}" title="${esc(season?.crop||'')}">${t(MONTHS[i].slice(0,3),['জানু','ফেব্রু','মার্চ','এপ্রিল','মে','জুন','জুল','আগ','সেপ্টে','অক্টো','নভে','ডিসে'][i])}${season?`<i class="${phase} cal-crop-${['aman','boro','rice','mustard','potato','mungbean'].includes(season.crop)?season.crop:'other'}"></i>`:''}</span>`}).join('')}</div>`;
}
function drawer(plan) {
  if(!selectedDay&&!selectedTaskId)return '';
  const tasks=selectedTaskId?calendarTasks(plan,cursor.getFullYear()).filter(item=>item.id===selectedTaskId):eventsFor(plan,new Date(`${selectedDay}T00:00:00`),new Date(`${selectedDay}T23:59:59`));
  const task=tasks[0], season=task?.season;
  const crop=crops().find(item=>item.id===season?.crop||item.id===task?.planting.crop);
  const sources=(agronomy?.sources||[]).filter(source=>crop?.sourceIds?.includes(source.id));
  return `<aside class="cal-drawer" role="dialog" aria-label="${t('Day details','দিনের বিবরণ')}"><button class="cal-drawer-close" data-cal-close aria-label="${t('Close','বন্ধ করুন')}">×</button><h2>${esc(selectedDay||`${MONTHS[(task?.month||1)-1]} ${cursor.getFullYear()}`)}</h2>${task?`<p>${esc(task.title)}</p><p>${t('Row × plant spacing','সারি × গাছের দূরত্ব')}: ${esc(`${task.planting.rowSpacingCm} × ${task.planting.withinRowCm} cm`)}</p><label><input type="checkbox" data-cal-check="${esc(task.id)}" ${plan.checklist?.[task.id]?'checked':''}> ${t('Mark complete','সম্পন্ন')}</label><label>${t('Sow date','বপনের তারিখ')} <input type="date" required data-cal-date="${esc(season.key)}" value="${esc(season.sowDate||'')}"></label><p>${crop?.sowingWindow?t('Source: agronomy sowing window','তথ্যসূত্র: কৃষি নির্দেশিকার বপনের সময়'):t('No published sowing window is available; confirm date locally.','প্রকাশিত বপনের সময় নেই; স্থানীয়ভাবে তারিখ নিশ্চিত করুন।')}</p>${sources.length?`<p>${t('Agronomy sources','কৃষি তথ্যসূত্র')}: ${sources.map(source=>`<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.id)}</a>`).join(' · ')}</p>`:''}`:`<p>${t('No planned task on this day.','এই দিনে কোনো পরিকল্পিত কাজ নেই।')}</p>`}<button data-cal-ask>${t('Ask Planty','Planty-কে জিজ্ঞেস করুন')}</button></aside>`;
}
function render() {
  if(!host)return;
  const {entries,chosen,plan}=selectedPlan();
  if(!plan){host.innerHTML=`<section class="cal-empty"><h1>${t('Calendar','ক্যালেন্ডার')}</h1><p>${t('Planty can help you start a plan for your field.','আপনার জমির পরিকল্পনা শুরু করতে Planty সাহায্য করতে পারে।')}</p><a class="button primary" href="#field">${t('Start a plan','পরিকল্পনা শুরু করুন')}</a></section>`;return;}
  const start = view==='week' ? addDays(cursor,-((cursor.getDay()+6)%7)) : new Date(cursor.getFullYear(),cursor.getMonth(),1);
  const tasks=calendarTasks(plan,new Date().getFullYear()),weekStart=addDays(new Date(),-((new Date().getDay()+6)%7)),weekEnd=addDays(weekStart,6),pending=tasks.filter(x=>!plan.checklist?.[x.id]&&new Date(`${x.date}T00:00:00`)>=weekStart&&new Date(`${x.date}T00:00:00`)<=weekEnd);
  host.innerHTML=`<header class="page-head"><div><div class="eyebrow">${esc(plan.field?.name||'')}</div><h1>${t('Calendar','ক্যালেন্ডার')}</h1><p>${t('Plan tasks, season timing, and field risk.','পরিকল্পনার কাজ, মৌসুমের সময় ও জমির ঝুঁকি।')}</p></div><select data-cal-plan aria-label="${t('Choose plan','পরিকল্পনা বাছুন')}">${entries.map(entry=>`<option value="${esc(entry.id)}" ${entry.id===chosen?.id?'selected':''}>${esc(entry.name)} · ${t(entry.status==='ready'?'Ready':'Draft',entry.status==='ready'?'প্রস্তুত':'খসড়া')}</option>`).join('')}</select></header>${ribbon(plan)}<section class="cal-focus"><strong>${t('This week','এই সপ্তাহ')}</strong><span>${pending.length?t(`${pending.length} open sowing task${pending.length===1?'':'s'} in plan`,`পরিকল্পনায় ${pending.length}টি অসমাপ্ত বপনের কাজ`):t('No open sowing tasks','বপনের কোনো অসমাপ্ত কাজ নেই')}</span><button data-cal-ask>${t('Ask Planty about this week','এই সপ্তাহ নিয়ে Planty-কে জিজ্ঞেস করুন')}</button></section><div class="cal-toolbar"><button data-cal-nav="-1" aria-label="${t('Previous','আগে')}">‹</button><h2>${esc(monthTitle(cursor))}</h2><button data-cal-nav="1" aria-label="${t('Next','পরে')}">›</button><div class="cal-views">${['month','week','agenda'].map(v=>`<button data-cal-view="${v}" aria-pressed="${view===v}">${t(v[0].toUpperCase()+v.slice(1),{month:'মাস',week:'সপ্তাহ',agenda:'তালিকা'}[v])}</button>`).join('')}</div></div><label class="cal-risk-toggle"><input type="checkbox" data-cal-risk ${brief?'':'disabled'} ${riskOn?'checked':''}> ${t('Risk overlay','ঝুঁকির স্তর')}</label>${brief&&riskOn?`<p class="cal-risk cal-risk-${riskStatus(brief).level}">${esc(riskLine(brief))} ${nasaBadge(['power','prithvi'],brief.date?.slice(0,4)||'2024')}</p>`:''}<div class="cal-body">${view==='month'?grid(plan):view==='week'?week(plan,start):agenda(plan)}${view==='month'?undatedTasks(plan):''}${drawer(plan)}</div>`;
}
function riskLine(data){const r=riskStatus(data), signal=r.signals.find(x=>x.id==='dry'||x.id==='rain');return signal?.id==='dry'?t(`Soil ${Math.abs(signal.value)}% ${signal.value<0?'drier':'wetter'} than normal (${signal.month})`,`মাটি স্বাভাবিকের চেয়ে ${Math.abs(signal.value)}% ${signal.value<0?'শুষ্ক':'ভেজা'} (${signal.month})`):signal?.id==='rain'?t(`Rain outlook ${signal.mm} mm; normal ${signal.normal} mm`,`বৃষ্টির পূর্বাভাস ${signal.mm} মিমি; স্বাভাবিক ${signal.normal} মিমি`):t(`Field risk: ${r.level}`,`জমির ঝুঁকি: ${r.level}`)}
function week(plan,start){const end=addDays(start,6);return `<div class="cal-week">${Array.from({length:7},(_,i)=>{const d=addDays(start,i),key=dateKey(d);return `<section><h3>${t(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][i],['সোম','মঙ্গল','বুধ','বৃহ','শুক্র','শনি','রবি'][i])} ${d.getDate()}</h3>${eventsFor(plan,d,d).map(taskMarkup).join('')}</section>`}).join('')}</div>`}
function agenda(plan){const tasks=new Map(calendarTasks(plan,cursor.getFullYear()).map(task=>[task.id,task]));const checklist=deriveChecklist(plan,null).map(item=>{const task=tasks.get(item.id),date=task?.date||t(`${MONTHS[(task?.month||1)-1]} · date not set`,'তারিখ নেই');return `<li><time>${esc(date)}</time>${task?taskMarkup(task):`<span class="cal-task">${esc(t(item.en,item.bn))}</span>`}<label><input type="checkbox" data-cal-check="${esc(item.id)}" ${plan.checklist?.[item.id]?'checked':''}> ${t('Done','সম্পন্ন')}</label></li>`});const harvest=harvestTasks(plan).map(task=>`<li><time>${esc(t(MONTHS[task.month-1],['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'][task.month-1]))} · ${t('date not set','তারিখ নেই')}</time><span class="cal-task cal-harvest">${esc(task.title)}</span></li>`);return `<ol class="cal-agenda">${[...checklist,...harvest].join('')||`<li>${t('No planned tasks.','কোনো পরিকল্পিত কাজ নেই।')}</li>`}</ol>`}
function undatedTasks(plan){const items=calendarTasks(plan,cursor.getFullYear()).filter(task=>!task.date&&!plan.checklist?.[task.id]);const harvest=harvestTasks(plan).filter(task=>task.month===cursor.getMonth()+1);return items.length||harvest.length?`<section class="cal-undated"><h3>${t('Season tasks without a chosen day','দিন বাছাই করা হয়নি')}</h3>${[...items,...harvest].map(taskMarkup).join('')}</section>`:''}
function askPlanty(){const anchor=selectedDay?new Date(`${selectedDay}T00:00:00`):new Date(),start=addDays(anchor,-((anchor.getDay()+6)%7)),end=addDays(start,6),tasks=calendarTasks(selectedPlan().plan,start.getFullYear()).filter(task=>task.date&&new Date(`${task.date}T00:00:00`)>=start&&new Date(`${task.date}T00:00:00`)<=end);window.dispatchEvent(new CustomEvent('calendar:ask',{detail:{tasks,risk:brief?riskLine(brief):''}}))}
export function calendar(){return '<section class="calendar-page" id="calendar-page"></section>'}
function loadBrief(fieldId){brief=null;riskOn=false;const request=++riskRequest;render();fetch(`/api/daily-brief?field=${encodeURIComponent(fieldId||state.fieldId)}`).then(r=>r.ok?r.json():null).then(value=>{if(host&&request===riskRequest){brief=value;render()}}).catch(()=>{})}
export function mountCalendar(){host=document.querySelector('#calendar-page');if(!host)return;if(matchMedia('(max-width: 640px)').matches)view='agenda';const routeId=location.hash.match(/^#calendar\/([^/?]+)/)?.[1];if(routeId)activePlanId=decodeURIComponent(routeId);host.addEventListener('click',click);host.addEventListener('change',change);host.addEventListener('keydown',keyDown);host.addEventListener('dragstart',dragStart);host.addEventListener('dragover',dragOver);host.addEventListener('drop',drop);host.addEventListener('touchstart',touchStart,{passive:true});host.addEventListener('touchend',touchEnd,{passive:true});loadBrief(selectedPlan().plan?.field?.id)}
export function disposeCalendar(){riskRequest++;host?.removeEventListener('click',click);host?.removeEventListener('change',change);host?.removeEventListener('keydown',keyDown);host?.removeEventListener('dragstart',dragStart);host?.removeEventListener('dragover',dragOver);host?.removeEventListener('drop',drop);host?.removeEventListener('touchstart',touchStart);host?.removeEventListener('touchend',touchEnd);host=null;brief=null;}
function click(e){const el=e.target.closest('[data-cal-view],[data-cal-nav],[data-cal-day],[data-cal-task],[data-cal-close],[data-cal-ask]');if(!el)return;if(el.dataset.calView){view=el.dataset.calView;render()}else if(el.dataset.calNav){cursor=new Date(cursor.getFullYear(),cursor.getMonth()+Number(el.dataset.calNav),1);render()}else if(el.dataset.calClose){selectedDay=null;selectedTaskId=null;render()}else if(el.dataset.calAsk)askPlanty();else if(el.dataset.calTask){selectedTaskId=el.dataset.calTask;selectedDay=el.dataset.calDay||null;render()}else if(el.dataset.calDay){selectedTaskId=null;selectedDay=el.dataset.calDay;render()}}
function change(e){const el=e.target;if(el.matches('[data-cal-plan]')){activePlanId=el.value;loadBrief(selectedPlan().plan?.field?.id);return}if(el.matches('[data-cal-risk]')){riskOn=el.checked;render();return}if(el.matches('[data-cal-check]')){const {plan,chosen}=selectedPlan();savePlan(toggleCalendarTask(plan,el.dataset.calCheck,el.checked),{status:chosen.status});render();return}if(el.matches('[data-cal-date]')){const {plan,chosen}=selectedPlan();try{const shifted=shiftSowDate(plan,el.dataset.calDate,el.value);savePlan(shifted,{status:chosen.status,keepPrevious:true});const season=shifted.rotation.seasons.find(s=>s.key===el.dataset.calDate);if(!crops().find(item=>item.id===season?.crop||item.id===shifted.planting?.[season?.key]?.crop)?.sowingWindow)toast(t('Date saved. No published window was available for validation.','তারিখ সংরক্ষিত। যাচাইয়ের জন্য প্রকাশিত সময় পাওয়া যায়নি।'));window.dispatchEvent(new CustomEvent('calendar:shifted',{detail:{id:chosen.id}}));render()}catch(error){el.setCustomValidity(error instanceof RangeError?t('Date is outside the published sowing window.','তারিখ প্রকাশিত বপনের সময়ের বাইরে।'):t('Plan could not be saved.','পরিকল্পনা সংরক্ষণ করা যায়নি।'));el.reportValidity()}}}
function keyDown(e){if(e.target.matches('[data-cal-day]')&&['Enter',' '].includes(e.key)){e.preventDefault();selectedDay=e.target.dataset.calDay;render();return}if(e.target.matches('[data-cal-day]')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key],next=addDays(new Date(`${e.target.dataset.calDay}T00:00:00`),delta);selectedDay=dateKey(next);if(next.getMonth()!==cursor.getMonth())cursor=new Date(next.getFullYear(),next.getMonth(),1);render();requestAnimationFrame(()=>host?.querySelector(`[data-cal-day="${selectedDay}"]`)?.focus())}}
function touchStart(e){if(e.target.closest('button,input,select'))return;touchX=e.changedTouches[0].clientX}
function touchEnd(e){if(touchX===null)return;const delta=e.changedTouches[0].clientX-touchX;touchX=null;if(Math.abs(delta)>60){cursor=new Date(cursor.getFullYear(),cursor.getMonth()+(delta<0?1:-1),1);render()}}
function dragStart(e){const task=e.target.closest('[data-cal-task]');if(!task)return;dragKey=task.dataset.calTask;e.dataTransfer.setData('text/plain',dragKey)}
function dragOver(e){if(e.target.closest('.cal-day'))e.preventDefault()}
function drop(e){const day=e.target.closest('.cal-day');if(!day)return;e.preventDefault();const key=e.dataTransfer.getData('text/plain')||dragKey;if(!key)return;const {plan,chosen}=selectedPlan(),seasonKey=key.replace(/^sow-/,'');try{const shifted=shiftSowDate(plan,seasonKey,day.dataset.calDay);savePlan(shifted,{status:chosen.status,keepPrevious:true});const season=shifted.rotation.seasons.find(s=>s.key===seasonKey);if(!crops().find(item=>item.id===season?.crop||item.id===shifted.planting?.[season?.key]?.crop)?.sowingWindow)toast(t('Date saved. No published window was available for validation.','তারিখ সংরক্ষিত। যাচাইয়ের জন্য প্রকাশিত সময় পাওয়া যায়নি।'));dragKey=null;window.dispatchEvent(new CustomEvent('calendar:shifted',{detail:{id:chosen.id}}));render()}catch(error){dragKey=null;toast(error instanceof RangeError?t('Date is outside the published sowing window.','তারিখ প্রকাশিত বপনের সময়ের বাইরে।'):t('Plan could not be saved.','পরিকল্পনা সংরক্ষণ করা যায়নি।'));render()}}
