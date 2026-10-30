import { addDays, calendarKey, diffDays } from './dateUtils';
import type { PlannerData } from './types';

export type StudyReference={days:string[];hours:Record<string,Record<string,number>>;totals:Record<string,number>;unplaced:Record<string,number>;daily:Record<string,number>;overloaded:string[];outsideWindow:string[]};
type Edge={to:number;reverse:number;capacity:number;cost:number;original:number};

/** Reference only: balance remaining budgets inside windows, prefer 10h, allow at most 12h.
 * Explicit day plans are reserved, never rewritten. Minute capacities preserve 35/50-minute budgets. */
export function buildStudyReference(data:PlannerData,remaining:Record<string,number>,today=calendarKey()):StudyReference{
  const from=today<'2026-10-20'?'2026-10-20':today,to=addDays(data.examDate,-1);
  const days=Array.from({length:Math.max(0,diffDays(from,to)+1)},(_,i)=>addDays(from,i));
  const hours:StudyReference['hours']={},totals=Object.fromEntries(days.map(d=>[d,0])),unplaced:Record<string,number>={},daily:Record<string,number>={},outsideWindow:string[]=[];
  const parents=data.tasks.filter(t=>remaining[t.id]!=null),demand=Object.fromEntries(parents.map(t=>[t.id,Math.round(Math.max(0,remaining[t.id])*60)]));
  const placed=Object.fromEntries(parents.map(t=>[t.id,0]));
  const occupied=Object.fromEntries(days.map(d=>[d,0]));
  for(const parent of parents)hours[parent.id]={};
  function hold(id:string,date:string,minutes:number){
    if(!days.includes(date))return;
    const n=Math.min(Math.max(0,demand[id]-placed[id]),Math.max(0,minutes));
    placed[id]+=n;occupied[date]+=n;hours[id][date]=(hours[id][date]??0)+n/60;
    const parent=parents.find(p=>p.id===id)!;
    if(n&&(date<parent.startDate||date>parent.endDate))outsideWindow.push(`${parent.name} · ${date}`);
  }
  for(const date of days){
    for(const entry of Object.values(data.dayPlans[date]??{}))occupied[date]+=Math.round(Math.max(0,entry.end-entry.start,entry.actualHours??0)*60);
  }
  for(const session of data.taskPlan?.sessions??[]){
    if(!days.includes(session.date))continue;
    const actual=Math.max(0,session.entry.actualHours??0);
    occupied[session.date]+=Math.round(actual*60);
    if(session.withdrawn||session.entry.status==='done')continue;
    const child=data.taskPlan!.children.find(c=>c.id===session.childId);
    if(child&&!child.done&&!child.archived&&demand[child.parentId]!=null)hold(child.parentId,session.date,Math.round(Math.max(0,session.entry.end-session.entry.start-actual)*60));
  }
  const eligible=(parent:typeof parents[number])=>days.filter(d=>d>=parent.startDate&&d<=parent.endDate);
  for(const parent of parents){
    const dates=eligible(parent);daily[parent.id]=dates.length?(demand[parent.id]/60)/dates.length:0;
    const fixed=data.taskPlan?.children.find(c=>c.parentId===parent.id&&c.fixedHours&&!c.done&&!c.archived);
    if(!fixed||placed[parent.id]>=demand[parent.id])continue;
    const required=Math.round(fixed.fixedHours!*60);
    if(demand[parent.id]-placed[parent.id]<required)continue;
    const candidates=dates.filter(d=>(!fixed.notBefore||d>=fixed.notBefore)&&(!fixed.notAfter||d<=fixed.notAfter));
    const date=candidates.find(d=>occupied[d]+required<=720&&![...Object.values(data.dayPlans[d]??{}),...(data.dayMiscs[d]??[]),...(data.taskPlan?.sessions??[]).filter(s=>s.date===d&&!s.withdrawn).map(s=>s.entry)].some(e=>e.start<17&&e.end>14));
    if(date)hold(parent.id,date,required);
  }
  const source=0,parentOffset=1,dayOffset=parentOffset+parents.length,sink=dayOffset+days.length;
  const graph:Edge[][]=Array.from({length:sink+1},()=>[]);
  function edge(a:number,b:number,capacity:number,cost:number){
    const forward:Edge={to:b,reverse:graph[b].length,capacity,cost,original:capacity};
    graph[a].push(forward);graph[b].push({to:a,reverse:graph[a].length-1,capacity:0,cost:-cost,original:0});return forward;
  }
  const allocations:Array<{id:string;date:string;edge:Edge}>=[];
  parents.forEach((parent,i)=>{
    const left=demand[parent.id]-placed[parent.id];edge(source,parentOffset+i,left,0);
    if(data.taskPlan?.children.some(c=>c.parentId===parent.id&&c.fixedHours&&!c.done&&!c.archived))return;
    const dates=eligible(parent),ideal=Math.floor(left/Math.max(1,dates.length));
    for(const date of dates){const node=dayOffset+days.indexOf(date);allocations.push({id:parent.id,date,edge:edge(parentOffset+i,node,ideal,0)},{id:parent.id,date,edge:edge(parentOffset+i,node,left,1)});}
  });
  days.forEach((date,i)=>{const limit=Math.min(12,Math.max(0,data.plannedHours[date]??12));const base=Math.max(0,Math.min(10,limit)*60-occupied[date]),hard=Math.max(0,limit*60-occupied[date]);edge(dayOffset+i,sink,base,0);edge(dayOffset+i,sink,hard-base,1000);});
  while(true){
    const distance=Array(graph.length).fill(Infinity),previous=Array(graph.length).fill(-1),path=Array(graph.length).fill(-1),queued=Array(graph.length).fill(false),queue=[source];distance[source]=0;queued[source]=true;
    for(let head=0;head<queue.length;head++){const node=queue[head];queued[node]=false;graph[node].forEach((e,i)=>{if(e.capacity<=0||distance[e.to]<=distance[node]+e.cost)return;distance[e.to]=distance[node]+e.cost;previous[e.to]=node;path[e.to]=i;if(!queued[e.to]){queued[e.to]=true;queue.push(e.to);}});}
    if(previous[sink]===-1)break;
    let amount=Infinity;for(let n=sink;n!==source;n=previous[n])amount=Math.min(amount,graph[previous[n]][path[n]].capacity);
    for(let n=sink;n!==source;n=previous[n]){const e=graph[previous[n]][path[n]];e.capacity-=amount;graph[n][e.reverse].capacity+=amount;}
  }
  for(const a of allocations){const minutes=a.edge.original-a.edge.capacity;placed[a.id]+=minutes;hours[a.id][a.date]=(hours[a.id][a.date]??0)+minutes/60;}
  for(const p of parents)unplaced[p.id]=Math.max(0,demand[p.id]-placed[p.id])/60;
  for(const date of days)totals[date]=occupied[date]/60+allocations.filter(a=>a.date===date).reduce((n,a)=>n+(a.edge.original-a.edge.capacity)/60,0);
  return {days,hours,totals,unplaced,daily,overloaded:days.filter(d=>totals[d]>12+.001),outsideWindow};
}
