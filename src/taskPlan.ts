import { upgradeStudyCatalogue } from './studyCatalogue';
import { addDays, calendarKey, diffDays, snapSlot, weekStartKey, weekOfIndex, dayIndex, PLAN_ORIGIN } from './dateUtils';
import { dayPlanOf } from './schedule';
import type { DayEntry, PlannerData, Task } from './types';
import { buildStudyReference } from './studyReference';
import { StudyBudgetWarning } from './studyBudgetWarning';

export type StudyTask = {
  id: string;
  parentId: string;
  name: string;
  budget: number | null;
  target?: number;
  unit?: string;
  done?: boolean;
  archived?: boolean;
  /** Only explicit drag/resize gestures draw more time from the finite unassigned pool. */
  pooledBudget?: boolean;
  /** Explicit one-off additions; the original budget is retained for comparison. */
  extraBudget?: number;
  notBefore?: string;
  notAfter?: string;
  fixedHours?: number;
  fixedStart?: number;
  group?: string;
};
export type StudySession = { id: string; childId: string; date: string; entry: DayEntry; locked?: boolean; withdrawn?: boolean };
export type TaskPlan = {
  version: 1;
  methodRevision?: 1;
  children: StudyTask[];
  sessions: StudySession[];
  parentBudgets: Record<string, number>;
  archivedParents: string[];
  groupBudgets: Record<string, number>;
};

export function studyTotals(plan: TaskPlan, childId: string, today = calendarKey()) {
  const child = plan.children.find(c => c.id === childId)!;
  const sessions = plan.sessions.filter(s => s.childId === childId);
  const actual = sessions.reduce((n, s) => n + Math.max(0, s.entry.actualHours ?? 0), 0);
  const amount = sessions.reduce((n, s) => n + Math.max(0, s.entry.doneDelta ?? 0), 0);
  const remaining = child.done || child.archived ? 0 : Math.max(0, (child.budget ?? 0) + (child.extraBudget??0) - actual);
  const arranged = sessions.filter(s => !s.withdrawn && s.date >= today && s.entry.status !== 'done')
    .reduce((n, s) => n + Math.max(0, s.entry.end - s.entry.start - (s.entry.actualHours ?? 0)), 0);
  return { actual, amount, remaining, arranged, available: Math.max(0, remaining - arranged) };
}

export function setStudyBudget(plan: TaskPlan, id: string, budget: number): TaskPlan {
  if (!Number.isFinite(budget) || budget < 0) throw new Error('请输入有效的预算小时。');
  const child = plan.children.find(c => c.id === id);
  if (!child) throw new Error('子任务不存在。');
  const peers = plan.children.filter(c => child.group ? c.group === child.group : c.parentId === child.parentId);
  const cap = child.group ? plan.groupBudgets[child.group] : plan.parentBudgets[child.parentId];
  if (peers.reduce((n,c) => n + (c.id === id ? budget : c.budget ?? 0), 0) > cap + .001)
    throw new Error(`该组总预算为 ${cap}h；请先从其他子任务调出时间。`);
  return { ...plan, children: plan.children.map(c => c.id === id ? { ...c, budget } : c) };
}

export function studyAllocationAvailable(data:PlannerData,childId:string){
  const plan=data.taskPlan!,child=plan.children.find(c=>c.id===childId);
  if(!child||child.done||child.archived)return {own:0,pool:0,total:0};
  const own=studyTotals(plan,childId).available;
  let pool=child.budget==null||child.pooledBudget?parentStudyTotals(data,child.parentId).unassigned:0;
  if(child.group){const spent=plan.children.filter(c=>c.group===child.group).reduce((n,c)=>n+(c.archived?Math.min(c.budget??0,studyTotals(plan,c.id).actual):c.budget??0),0);pool=Math.min(pool,Math.max(0,plan.groupBudgets[child.group]-spent));}
  return {own,pool,total:own+pool};
}

export function studyUnassignedPool(data:PlannerData,childId:string){
  const plan=data.taskPlan!,child=plan.children.find(c=>c.id===childId)!;
  let pool=parentStudyTotals(data,child.parentId).unassigned;
  if(child.group){const assigned=plan.children.filter(c=>c.group===child.group).reduce((n,c)=>n+(c.archived?Math.min(c.budget??0,studyTotals(plan,c.id).actual):c.budget??0),0);pool=Math.min(pool,Math.max(0,plan.groupBudgets[child.group]-assigned));}
  return pool;
}

export function studyBudgetExcess(data:PlannerData,childId:string,additionalHours:number){
  const available=studyAllocationAvailable(data,childId).total;
  return additionalHours>Math.ceil(available*6-.00001)/6+.001?Math.max(0,additionalHours-available):0;
}

function checkStudyBudget(data:PlannerData,childId:string,additionalHours:number){
  const extra=studyBudgetExcess(data,childId,additionalHours);if(extra<=0)return;
  const child=data.taskPlan!.children.find(c=>c.id===childId)!;
  throw new StudyBudgetWarning(childId,extra,child.budget??0,child.extraBudget??0,studyUnassignedPool(data,childId));
}

export function applyStudyBudgetChoice(data:PlannerData,action:(current:PlannerData)=>PlannerData,choice:'pool'|'extra',approvedLimit?:number):PlannerData{
  try{return action(data);}catch(error){
    if(!(error instanceof StudyBudgetWarning))throw error;
    if(approvedLimit!=null&&error.extraHours>approvedLimit+.001)throw error;
    const child=data.taskPlan!.children.find(c=>c.id===error.childId)!;
    if(child.fixedHours)throw new Error('固定模考保持一次完整 3h。');
    if(choice==='pool'&&studyUnassignedPool(data,child.id)+.001<error.extraHours)throw new Error('未分配预算不足，请先调配其他子任务，或明确追加本次时间。');
    const approved={...data,taskPlan:{...data.taskPlan!,children:data.taskPlan!.children.map(c=>c.id===child.id?(choice==='pool'?{...c,budget:(c.budget??0)+error.extraHours}:{...c,extraBudget:(c.extraBudget??0)+error.extraHours}):c)}};
    return action(approved);
  }
}

function reserveStudyAllocation(data:PlannerData,childId:string,extra:number):PlannerData{
  const room=studyAllocationAvailable(data,childId),needed=Math.max(0,extra-room.own);
  if(needed<=.00001)return data;
  const amount=Math.min(room.pool,needed);
  if(amount<=0)return data;
  return {...data,taskPlan:{...data.taskPlan!,children:data.taskPlan!.children.map(c=>c.id===childId?{...c,budget:(c.budget??0)+amount,pooledBudget:true}:c)}};
}

export function studyDayLearningHours(data:PlannerData,date:string){
  const value=(entry:DayEntry)=>entry.status==='done'?Math.max(0,entry.actualHours??0):Math.max(0,entry.end-entry.start,entry.actualHours??0);
  return Object.values(data.dayPlans[date]??{}).reduce((n,e)=>n+value(e),0)+(data.taskPlan?.sessions??[]).filter(s=>s.date===date).reduce((n,s)=>n+(s.withdrawn?Math.max(0,s.entry.actualHours??0):value(s.entry)),0);
}

export function studySessionDisplayEntry(session:StudySession):DayEntry{
  if(!session.withdrawn)return session.entry;
  return {...session.entry,end:Math.min(24,session.entry.start+Math.max(1/6,session.entry.actualHours??0))};
}

export function studyOccupiedEntries(data:PlannerData,date:string,exceptId?:string){
  return [...Object.values(data.dayPlans[date]??{}),...(data.dayMiscs[date]??[]),...(data.taskPlan?.sessions??[]).filter(s=>s.id!==exceptId&&s.date===date&&(!s.withdrawn||(s.entry.actualHours??0)>0||(s.entry.doneDelta??0)>0)).map(studySessionDisplayEntry)];
}

export function studyTimeDropReason(data:PlannerData,childId:string,date:string,hours:number,start:number,movingId?:string){
  const reason=studyDropReason(data,childId,date,movingId);if(reason)return reason;
  const child=data.taskPlan!.children.find(c=>c.id===childId)!;
  const session=data.taskPlan!.sessions.find(s=>s.id===movingId);
  const at=child.fixedStart??start;
  if(!Number.isFinite(at)||at<7||at+hours>24+.001)return '此处容纳不下完整时段';
  if(studyOccupiedEntries(data,date,movingId).some(e=>at<e.end-.001&&at+hours>e.start+.001))return '这里已有任务或休息，请放到空白处';
  const previous=session&&session.date===date?Math.max(session.entry.end-session.entry.start,session.entry.actualHours??0):0;
  if(studyDayLearningHours(data,date)-previous+hours>12+.001)return '当天会超过 12h 红线';
  return null;
}

export function studyDropReason(data:PlannerData,childId:string,date:string,movingId?:string):string|null{
  const child=data.taskPlan?.children.find(c=>c.id===childId),session=data.taskPlan?.sessions.find(s=>s.id===movingId);
  if(!child||child.archived||child.done)return '此任务已结束或移出清单';
  if(date<calendarKey())return '过去日期不能新排';
  if(date<'2026-10-20'||date>=data.examDate)return '超出可排程日期';
  if(child.notBefore&&date<child.notBefore)return `${child.notBefore} 起才可安排`;
  if(child.notAfter&&date>child.notAfter)return `仅可排到 ${child.notAfter}`;
  if(session?.locked)return '请先解锁';
  if(session&&session.date!==date&&((session.entry.actualHours??0)>0||(session.entry.doneDelta??0)>0))return '已有实学，先撤回未执行部分再安排';
  return null;
}

export function scheduleStudy(data: PlannerData, childId: string, date: string, hours: number, today = calendarKey(),preferredStart?:number): PlannerData {
  let plan = data.taskPlan!;
  const child = plan.children.find(c => c.id === childId);
  if (!child || child.done || child.archived) throw new Error('请选择尚未完成且未移出的子任务。');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date < '2026-10-20' || date >= data.examDate)
    throw new Error('只能从真实今天起安排到考试前一天。');
  if ((child.notBefore && date < child.notBefore) || (child.notAfter && date > child.notAfter))
    throw new Error(`此任务只能安排在 ${child.notBefore ?? today} 至 ${child.notAfter ?? addDays(data.examDate, -1)}。`);
  const duration = snapSlot(hours);
  if (!Number.isFinite(duration) || duration <= 0 || Math.abs(duration-hours) > .001)
    throw new Error('安排时长需为正数，按 10 分钟一档。');
  // 35 分钟预算仍保留精确值；日轴占位向上取整到 10 分钟。
  if(studyDayLearningHours(data,date)+duration>12+.001)throw new Error('当天学习安排会超过 12h 红线，请换一天或缩短本次时间。');
  if (child.fixedHours && (Math.abs(duration-child.fixedHours)>.001 || plan.sessions.some(s => s.childId===childId && !s.withdrawn)))
    throw new Error('全真模考必须完整安排一次 3h，不能拆分或重复。');
  const occupied = studyOccupiedEntries(data,date).sort((a,b)=>a.start-b.start);
  let start = child.fixedStart ?? preferredStart ?? 9;
  if(!Number.isFinite(start)||start<7||start+duration>24||Math.abs(start*6-Math.round(start*6))>.001)throw new Error('请选择 7:00–24:00 内、10 分钟对齐的完整时段。');
  if (child.fixedStart != null) {
    if (occupied.some(e=>e.start < start+duration && e.end > start)) throw new Error('14:00–17:00 已被占用，请先调整当天安排。');
  } else if(preferredStart!=null){if(occupied.some(e=>start<e.end-.001&&start+duration>e.start+.001))throw new Error('此时段已有安排或休息，请放到空白时段。');}
  else for (const e of occupied) { if (start < e.end && start+duration > e.start) start=Math.ceil(e.end*6-.00001)/6; }
  if (start+duration>24) throw new Error('当天排不下，请缩短本次时长或选择其他日期。');
  checkStudyBudget(data,childId,duration);
  data=reserveStudyAllocation(data,childId,duration);plan=data.taskPlan!;
  const session: StudySession = { id: `study-${crypto.randomUUID()}`, childId, date,
    locked: child.fixedHours ? true : undefined, entry: {start,end:start+duration,note:'',status:'pending'} };
  return { ...data, taskPlan: { ...plan, sessions: [...plan.sessions,session] } };
}

export function patchStudy(data: PlannerData, id: string, patch: Partial<DayEntry>): PlannerData {
  let plan=data.taskPlan!; const session=plan.sessions.find(s=>s.id===id);
  if (!session) return data;
  const child=plan.children.find(c=>c.id===session.childId)!;
  if (session.locked && (patch.start!=null || patch.end!=null)) throw new Error('此安排已锁定，请先解锁。');
  const entry={...session.entry,...patch};
  if (![entry.start,entry.end,entry.actualHours??0,entry.doneDelta??0].every(Number.isFinite) || entry.start<7 || entry.end>24 || entry.end<=entry.start || (entry.actualHours??0)<0 || (entry.doneDelta??0)<0)
    throw new Error('时段、实学和完成量必须有效，时段在 7:00–24:00 内。');
  const geometry=patch.start!=null || patch.end!=null;
  if(geometry&&session.withdrawn)throw new Error('此项已保留为历史记录，不能拖动；仍可更正实学和完成数量。');
  if (geometry && (Math.abs(entry.start*6-Math.round(entry.start*6))>.001 || Math.abs(entry.end*6-Math.round(entry.end*6))>.001)) throw new Error('时段需按 10 分钟调整。');
  if (child.fixedHours && geometry && (entry.start!==child.fixedStart || Math.abs(entry.end-entry.start-child.fixedHours)>.001)) throw new Error('模考保持完整 14:00–17:00。');
  if (geometry) {
    const extra=(entry.end-entry.start)-(session.entry.end-session.entry.start);
    if(extra>0&&studyDayLearningHours(data,session.date)+extra>12+.001)throw new Error('当天学习安排会超过 12h 红线，请缩短时间或移到其他日期。');
    const obstacles=studyOccupiedEntries(data,session.date,id);
    if(obstacles.some(e=>entry.start<e.end&&entry.end>e.start))throw new Error('与已有安排或休息重叠，请选择空闲时段。');
    checkStudyBudget(data,child.id,Math.max(0,extra));
    data=reserveStudyAllocation(data,child.id,Math.max(0,extra));plan=data.taskPlan!;
  }
  if (child.target && studyTotals(plan,child.id).amount-(session.entry.doneDelta??0)+(entry.doneDelta??0)>child.target) throw new Error('累计完成量不能超过任务总量。');
  return {...data,taskPlan:{...plan,sessions:plan.sessions.map(s=>s.id===id?{...s,entry}:s)}};
}

export function withdrawStudy(data: PlannerData, id: string): PlannerData {
  const plan=data.taskPlan!;const s=plan.sessions.find(s=>s.id===id);
  if (!s) return data;
  if (s.locked) throw new Error('请先解锁再撤回。');
  return {...data,taskPlan:{...plan,sessions:plan.sessions.flatMap(x=>x.id!==id?[x]:(x.entry.actualHours??0)>0 || (x.entry.doneDelta??0)>0 ? [{...x,withdrawn:true}] : [])}};
}

export function rolloverStudy(data: PlannerData, today: string, activeId?: string): PlannerData {
  const plan=data.taskPlan;if(!plan)return data;
  let changed=false;
  const sessions=plan.sessions.flatMap(s=>{
    if(s.date>=today||s.withdrawn||s.id===activeId)return [s];
    changed=true;
    return (s.entry.actualHours??0)>0 || (s.entry.doneDelta??0)>0 ? [{...s,withdrawn:true}] : [];
  });
  return changed?{...data,taskPlan:{...plan,sessions}}:data;
}

/** Adapter: keep the original day view and its timer; session IDs are stable record keys. */
export function studyDayData(data: PlannerData, date: string): PlannerData {
  if(!data.taskPlan)return data;
  const sessions=data.taskPlan.sessions.filter(s=>s.date===date);
  const plan={...data.dayPlans[date]};
  const tasks=data.tasks.filter(t=>plan[t.id]).map(t=>({...t,startDate:date,endDate:date,weekdays:undefined,dailyHours:0}));
  for(const s of sessions){
    const child=data.taskPlan.children.find(c=>c.id===s.childId);const parent=data.tasks.find(t=>t.id===child?.parentId);
    if(!child||!parent)continue;
    plan[s.id]=studySessionDisplayEntry(s);
    tasks.push({...parent,id:s.id,name:child.name,startDate:date,endDate:date,dailyHours:0,weekdays:undefined,unit:child.unit,targetAmount:child.target,doneAmount:undefined,breakdown:undefined});
  }
  return {...data,tasks,dayPlans:{...data.dayPlans,[date]:plan}};
}

export function studyOverviewData(data: PlannerData): PlannerData {
  if(!data.taskPlan)return data;
  const tasks=data.tasks.filter(t=>!data.taskPlan!.archivedParents.includes(t.id));
  const remaining=Object.fromEntries(tasks.filter(t=>data.taskPlan!.parentBudgets[t.id]!=null).map(t=>[t.id,parentStudyTotals(data,t.id).remaining]));
  const studyReference=buildStudyReference(data,remaining);
  return {...data,studyReference,tasks:tasks.map(t=>studyReference.daily[t.id]!=null?{...t,dailyHours:studyReference.daily[t.id]}:t)};
}

export function parentStudyTotals(data:PlannerData,parentId:string){
  const plan=data.taskPlan!;
  const children=plan.children.filter(c=>c.parentId===parentId);
  const budget=plan.parentBudgets[parentId];
  const unassigned=Math.max(0,budget-children.reduce((n,c)=>n+(c.archived?Math.min(c.budget??0,studyTotals(plan,c.id).actual):c.budget??0),0));
  return children.reduce((n,c)=>{const t=studyTotals(plan,c.id);return {budget,actual:n.actual+t.actual,remaining:n.remaining+t.remaining,available:n.available+t.available,extraBudget:n.extraBudget+(c.extraBudget??0),unassigned};},{budget,actual:0,remaining:unassigned,available:unassigned,extraBudget:0,unassigned});
}

/** Populate the existing task × date grid from explicit allocations, without implicit daily fill. */
export function studyWeekData(data:PlannerData,days:string[]):PlannerData{
  const plan=data.taskPlan!;
  const dayHours={...data.dayHours};const dayPlans={...data.dayPlans};
  const tasks=data.tasks.flatMap(task=>{
    if(plan.parentBudgets[task.id]!=null){
      const children=new Set(plan.children.filter(c=>c.parentId===task.id).map(c=>c.id));
      const sessions=plan.sessions.filter(s=>children.has(s.childId)&&days.includes(s.date));
      if(!sessions.length)return [];
      for(const date of days){const daily=sessions.filter(s=>s.date===date),entries=daily.map(s=>s.entry);
        dayHours[`${task.id}|${date}`]=daily.filter(s=>!s.withdrawn).reduce((n,s)=>n+s.entry.end-s.entry.start,0);
        if(entries.length)dayPlans[date]={...dayPlans[date],[task.id]:{start:Math.min(...entries.map(e=>e.start)),end:Math.max(...entries.map(e=>e.end)),actualHours:entries.reduce((n,e)=>n+(e.actualHours??0),0),note:'',status:entries.every(e=>e.status==='done')?'done':'pending'}};
      }
      const dates=sessions.map(s=>s.date);
      return [{...task,dailyHours:0,weekdays:undefined,startDate:dates.sort()[0],endDate:dates.at(-1)!}];
    }
    const dates=days.filter(date=>!!data.dayPlans[date]?.[task.id]);
    if(!dates.length)return [];
    for(const date of days){const e=data.dayPlans[date]?.[task.id];dayHours[`${task.id}|${date}`]=e?e.end-e.start:0;}
    return [{...task,dailyHours:0,weekdays:undefined,startDate:dates[0],endDate:dates.at(-1)!}];
  });
  return {...data,subjects:data.subjects.filter(s=>tasks.some(t=>t.subjectId===s.id)),tasks,dayHours,dayPlans};
}

export function studyWeekBySubjectData(data:PlannerData,days:string[]):PlannerData{
  const source=studyWeekData(data,days),dayHours:Record<string,number>={},dayPlans:PlannerData['dayPlans']={};
  const tasks:Task[]=source.subjects.map(subject=>{
    const mine=source.tasks.filter(t=>t.subjectId===subject.id),id=`study-subject:${subject.id}`;
    for(const date of days){
      dayHours[`${id}|${date}`]=mine.reduce((n,t)=>n+(source.dayHours[`${t.id}|${date}`]??0),0);
      const actual=mine.reduce((n,t)=>n+(source.dayPlans[date]?.[t.id]?.actualHours??0),0);
      if(actual>0)dayPlans[date]={...dayPlans[date],[id]:{start:9,end:10,actualHours:actual,note:'',status:'pending'}};
    }
    return {id,subjectId:subject.id,name:subject.name,colorId:subject.colorId,startDate:mine.map(t=>t.startDate).sort()[0],endDate:mine.map(t=>t.endDate).sort().at(-1)!,dailyHours:0,method:'同科目共用一行，任务名称保留在色块中。',skipBreakdown:true};
  });
  return {...source,tasks,dayHours,dayPlans};
}

/** Weekly resizing changes the allocation, not other tasks' start times. */
export function resizeStudyAllocation(data:PlannerData,id:string,hours:number):PlannerData{
  let plan=data.taskPlan!;const session=plan.sessions.find(s=>s.id===id);
  if(!session)return data;
  if(session.locked||session.withdrawn||session.date<calendarKey())throw new Error('先解锁；历史记录和已撤回安排不能拉伸。');
  const child=plan.children.find(c=>c.id===session.childId)!;
  const next=snapSlot(hours);
  if(!Number.isFinite(next)||next<1/6||session.entry.start+next>24)throw new Error('时长需按 10 分钟调整，并落在 24:00 以前。');
  if(child.fixedHours&&Math.abs(next-child.fixedHours)>.001)throw new Error('全真模考保持一次完整 3 小时。');
  const old=session.entry.end-session.entry.start;
  if(next>old&&studyDayLearningHours(data,session.date)+next-old>12+.001)throw new Error('当天学习安排会超过 12h 红线，请缩短时间或移到其他日期。');
  checkStudyBudget(data,child.id,Math.max(0,next-old));
  data=reserveStudyAllocation(data,child.id,Math.max(0,next-old));plan=data.taskPlan!;
  return {...data,taskPlan:{...plan,sessions:plan.sessions.map(s=>s.id===id?{...s,entry:{...s.entry,end:s.entry.start+next}}:s)}};
}

export function createStudyPlan(data: PlannerData, today=calendarKey()): PlannerData {
  if(data.taskPlan)return data;
  const children:StudyTask[]=[],parents:Task[]=[],parentBudgets:Record<string,number>={},groupBudgets:Record<string,number>={};
  const add=(subjectId:string,key:string,name:string,budget:number,items:Array<[string,number|null,Partial<StudyTask>?]>,start='2026-10-20',end='2026-12-18')=>{
    const id=`plan-${key}`;const subject=data.subjects.find(s=>s.id===subjectId);
    parents.push({id,subjectId,name,startDate:start,endDate:end,dailyHours:budget/Math.max(1,diffDays(start,end)+1),method:'按总预算推进，具体日期在当前周安排。',colorId:subject?.colorId??'blue',order:parents.length,skipBreakdown:true});parentBudgets[id]=budget;
    items.forEach(([name,budget,extra],i)=>children.push({id:`${id}-${i}`,parentId:id,name,budget,...extra}));
  };
  add('en','vocab','真题语境高频词',15,[['真题语境高频词',15]]);
  add('en','wordlist','清单与熟词僻义靶向速刷',12,[['清单靶向速刷',null],['熟词僻义靶向速刷',null]]);
  add('en','reading','阅读 Part A',35,[['做题圈词',15],['精读消词',20]]);
  add('en','writing','大小作文',20,[['大作文',null],['小作文',null]]);
  add('en','newtype','新题型',8,[['新题型',8]]);
  add('en','translation','翻译',5,[['翻译',5]]);
  add('en','cloze','完型',2,[['完型',2]]);
  add('en','mock','考前全真模考',3,[['全真模考（完整一次）',3,{notBefore:'2026-12-16',notAfter:'2026-12-18',fixedStart:14,fixedHours:3,target:1,unit:'次'}]],'2026-12-16');
  const frame:Array<[string,number|null,Partial<StudyTask>?]>=[];
  for(const [name,hours] of [['史纲',7],['毛中特与习思想',8],['思修',3],['易混帽子题',2]] as const){groupBudgets[name]=hours;for(const method of ['读手册','刷题'])frame.push([`${name} · ${method}`,null,{group:name,notBefore:'2026-10-27'}]);}
  add('pol','frame','阶段一框架速通',20,frame,'2026-10-27');
  add('pol','xiao8','阶段二肖八',12,Array.from({length:8},(_,i)=>[`第 ${i+1} 套选择题`,1.5,{notBefore:'2026-11-06',target:1,unit:'套'}]),'2026-11-06');
  add('pol','news','阶段三时政',5,[['国内时政',3,{notBefore:'2026-11-14'}],['国际时政',2,{notBefore:'2026-11-14'}]],'2026-11-14');
  const xiao4:Array<[string,number|null,Partial<StudyTask>?]>=[];
  for(let i=1;i<=4;i++)xiao4.push([`第 ${i} 套选择题`,1.5,{target:1,unit:'套',notBefore:'2026-11-17'}]);
  for(let i=1;i<=4;i++)for(let q=1;q<=5;q++)xiao4.push([`第 ${i} 套分析题 ${q}`,i<=2?50/60:35/60,{target:1,unit:'道',notBefore:'2026-11-17'}]);
  xiao4.push(['第1、2套滚动复述',3+40/60,{notBefore:'2026-11-17'}],['第3、4套主干巩固',2+10/60,{notBefore:'2026-11-17'}],['四套横向串背',4,{notBefore:'2026-11-17'}]);
  add('pol','xiao4','阶段四肖四',30,xiao4,'2026-11-17');
  add('pol','final','阶段五考前',8,[['错题二刷',4],['大题骨架默写',3],['答题格式',1]].map(([n,h])=>[String(n),Number(h),{notBefore:'2026-12-17',notAfter:'2026-12-18'}]),'2026-12-17');
  add('intro','intro-core','概论 · 精细背诵',60,['第3章 · 理论体系与分析取向','第5章 · 社会政策基本要素','第6章 · 政策制定','第7章 · 政策评估','第8章 · 价值分析','第10章 · 政治与社会分析'].map(name=>[name,null]));
  add('intro','intro-focus','概论 · 重点复习与框架梳理',40,['第1章 · 基本范畴','第2章 · 历史发展','第4章 · 需要与社会问题','第7章 · 实施管理与政策变动','第9章 · 经济分析','第11章 · 全球化背景（理解与浏览）'].map(name=>[name,null]));
  add('topic','topic-core','专题 · 五个主要专题',55,['人口生育','贫困与反贫困','劳动就业','养老','健康卫生'].map(n=>[n,10]));
  children.push({id:'plan-topic-core-notes',parentId:'plan-topic-core',name:'整理本组笔记',budget:5});
  add('topic','topic-secondary','专题 · 三个次要专题',20,['性别','城乡','越轨'].map(name=>[name,null]));
  children.push({id:'plan-topic-secondary-notes',parentId:'plan-topic-secondary',name:'整理本组笔记',budget:5});
  add('topic','topic-theory','专题 · 理论与案例',25,[['专题对应理论与案例',20],['整理本组笔记',5]]);
  add('method','method-core','研究方法 · 重点内容',35,['第3章 · 社会研究的方法论问题','第4章 · 社会研究的过程','第5章 · 社会研究的设计','第6章 · 测量','第7章 · 抽样','第12章 · 实验法','第16章 · 变量分析的逻辑和策略'].map(name=>[name,null]));
  add('method','method-specific','研究方法 · 专题方法',30,['第8章 · 问卷法','第9章 · 访问法','第10章 · 量表与测验法','第11章 · 观察法','第13章 · 文献法'].map(name=>[name,null]));
  add('method','method-framework','研究方法 · 框架理解',10,['第1章 · 绪论：科学与社会研究','第2章 · 社会研究发展史','第14章 · 资料整理','第15章 · 资料的统计分析（与统计衔接）','第17章 · 多元分析概论（与统计衔接）','第18章 · 路径分析（与统计衔接）','第19章 · 因素分析（与统计衔接）','第20章 · 社会网络分析','第21章 · 数理分析简介（与统计衔接）','第22章 · 撰写研究报告','第23章 · 社会学研究的评估'].map(name=>[name,null]));
  add('stat','stat-calculation','社会统计 · 计算大题（暂定）',30,[['计算大题',30]]);
  add('stat','stat-choice','社会统计 · 选择辨析（暂定）',12,[['选择辨析',12]]);
  add('stat','stat-terms','社会统计 · 名词解释背诵（暂定）',8,[['名词解释背诵',8]]);
  const dayPlans={...data.dayPlans};
  const weekStart=weekStartKey(weekOfIndex(dayIndex(today,PLAN_ORIGIN)),PLAN_ORIGIN);
  for(let i=0;i<7;i++){const date=addDays(weekStart,i);if(date>=today&&date<data.examDate)dayPlans[date]=dayPlanOf(data,date);}
  for(const [key,hours] of Object.entries(data.dayHours)){
    const separator=key.indexOf('|'),date=key.slice(separator+1),id=key.slice(0,separator);
    if(date>=today&&hours>0&&!dayPlans[date]?.[id]){const entry=dayPlanOf(data,date)[id];if(entry)dayPlans[date]={...dayPlans[date],[id]:entry};}
  }
  return upgradeStudyCatalogue({...data,tasks:[...data.tasks,...parents],dayPlans,taskPlan:{version:1,children,sessions:[],parentBudgets,groupBudgets,archivedParents:data.tasks.map(t=>t.id)}});
}

export function moveStudy(data:PlannerData,id:string,date:string,start?:number):PlannerData{
  const s=data.taskPlan!.sessions.find(s=>s.id===id);
  if(!s)return data;if(s.locked)throw new Error('锁定安排不能移动。');
  if(s.withdrawn)throw new Error('此项已作为记录保留，不能移动。');
  if(s.date===date)return start==null?data:patchStudy(data,id,{start,end:start+s.entry.end-s.entry.start});
  if((s.entry.actualHours??0)>0 || (s.entry.doneDelta??0)>0)throw new Error('已发生的记录保留原日，请撤回未执行部分后重新安排。');
  const without=withdrawStudy(data,id);
  const next=scheduleStudy(without,s.childId,date,s.entry.end-s.entry.start,calendarKey(),start);
  return {...next,taskPlan:{...next.taskPlan!,sessions:next.taskPlan!.sessions.map((x,i)=>i===next.taskPlan!.sessions.length-1?{...x,id:s.id,entry:{...x.entry,note:s.entry.note}}:x)}};
}

export function completeStudy(data:PlannerData,id:string,done:boolean):PlannerData{
  const plan=data.taskPlan!;return {...data,taskPlan:{...plan,children:plan.children.map(c=>c.id===id?{...c,done}:c),sessions:done?plan.sessions.flatMap(s=>s.childId!==id?[s]:(s.entry.actualHours??0)>0 || (s.entry.doneDelta??0)>0?[{...s,withdrawn:true}]:[]):plan.sessions}};
}

export function bindLegacyStudy(data:PlannerData,date:string,id:string,childId:string):PlannerData{
  const entry=data.dayPlans[date]?.[id];const child=data.taskPlan!.children.find(c=>c.id===childId);
  if(!entry||!child)throw new Error('原安排或子任务不存在。');
  if(date>=calendarKey()&&!(entry.actualHours??0)){
    // Use the same date/budget validation, without creating a duplicate record.
    scheduleStudy({...data,dayPlans:{...data.dayPlans,[date]:Object.fromEntries(Object.entries(data.dayPlans[date]).filter(([key])=>key!==id))}},childId,date,entry.end-entry.start);
  }
  const oldTask=data.tasks.find(t=>t.id===id),parent=data.tasks.find(t=>t.id===child.parentId);
  if(oldTask?.subjectId!==parent?.subjectId)throw new Error('只能关联同科目的子任务。');
  const dayPlans={...data.dayPlans,[date]:Object.fromEntries(Object.entries(data.dayPlans[date]).filter(([key])=>key!==id))};
  return {...data,dayPlans,taskPlan:{...data.taskPlan!,sessions:[...data.taskPlan!.sessions,{id:`study-${crypto.randomUUID()}`,childId,date,entry:{...entry},withdrawn:date<calendarKey()?true:undefined}]}};
}

export function regenerateStudyDay(data:PlannerData,date:string,activeId?:string):PlannerData{
  const plan=data.taskPlan!;
  const fixed=[...Object.values(data.dayPlans[date]??{}),...(data.dayMiscs[date]??[]),...plan.sessions.filter(s=>s.date===date&&((s.withdrawn&&((s.entry.actualHours??0)>0||(s.entry.doneDelta??0)>0))||(!s.withdrawn&&(s.id===activeId||s.locked||(s.entry.actualHours??0)>0||s.entry.status==='done')))).map(studySessionDisplayEntry)].sort((a,b)=>a.start-b.start);
  let cursor=9;
  const sessions=plan.sessions.map(s=>{
    if(s.date!==date||s.withdrawn||s.id===activeId||s.locked||(s.entry.actualHours??0)>0||s.entry.status==='done')return s;
    const hours=s.entry.end-s.entry.start;
    for(const e of fixed)if(cursor<e.end&&cursor+hours>e.start)cursor=Math.ceil(e.end*6-.00001)/6;
    if(cursor+hours>24)throw new Error('当天排不下全部任务；本次未改动，请减少安排。');
    const entry={...s.entry,start:cursor,end:cursor+hours};cursor+=hours;return {...s,entry};
  });
  return {...data,taskPlan:{...plan,sessions}};
}

export function studyDayOverlaps(data:PlannerData,date:string){
  const blocks=[...Object.entries(data.dayPlans[date]??{}).map(([id,entry])=>({id,name:data.tasks.find(t=>t.id===id)?.name??'原安排',entry})),...(data.dayMiscs[date]??[]).map(m=>({id:m.id,name:m.name,entry:m})),...(data.taskPlan?.sessions??[]).filter(s=>s.date===date&&(!s.withdrawn||(s.entry.actualHours??0)>0||(s.entry.doneDelta??0)>0)).map(s=>({id:s.id,name:data.taskPlan!.children.find(c=>c.id===s.childId)?.name??'学习安排',entry:studySessionDisplayEntry(s)}))];
  const overlaps:string[]=[];
  blocks.forEach((a,i)=>blocks.slice(i+1).forEach(b=>{if(a.entry.start<b.entry.end-.001&&a.entry.end>b.entry.start+.001)overlaps.push(`${a.name} / ${b.name}`);}));
  return overlaps;
}
