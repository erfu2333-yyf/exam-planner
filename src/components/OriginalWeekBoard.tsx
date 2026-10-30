import { beginStudyPointerDrag } from '../studyPointer';
import { useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { calendarKey, formatDuration, formatHour, snapSlot, type Span } from '../dateUtils';
import { moveStudy, scheduleStudy, studyTotals, withdrawStudy, studyAllocationAvailable, studyTimeDropReason, studyBudgetExcess } from '../taskPlan';
import { colorOf, tint } from '../theme';
import type { PlannerData, Subject, Task } from '../types';
import { Button } from './ui';
import { WeekTimeGrid, type WeekTimePayload } from './WeekTimeGrid';
type Props={data:PlannerData;span:Span;week:number;parentId:string|null;activeId?:string;onParent:(id:string)=>void;onWeek:(delta:number)=>void;onDay:(date:string,taskId?:string)=>void;onMutate:(action:(data:PlannerData)=>PlannerData)=>void;onEditTask:(task:Task)=>void;onManageSubject:(subject:Subject)=>void;};
type Payload=WeekTimePayload;
const dragType='application/x-exam-study';
export function OriginalWeekBoard({data,span,week,parentId,activeId,onParent,onWeek,onDay,onMutate,onEditTask}:Props){
 const plan=data.taskPlan!;
 const [armed,setArmed]=useState<string|null>(null),[open,setOpen]=useState<Set<string>>(()=>new Set(parentId?[parentId]:['plan-method-core'])),[expanded,setExpanded]=useState(true);
 const suppressClick=useRef(false),dragCleanup=useRef<(()=>void)|null>(null);
 const [ghost,setGhost]=useState<{x:number;y:number;label:string;date?:string;hour?:number;duration?:number;reason?:string;valid?:boolean}|null>(null);
 useEffect(()=>()=>dragCleanup.current?.(),[]);
 useEffect(()=>{if(parentId)setOpen(current=>new Set([...current,parentId]));},[parentId]);
 function placement(payload:Payload,date:string,hour?:number){
  const session=plan.sessions.find(s=>s.id===payload.session),child=plan.children.find(c=>c.id===(payload.child??session?.childId))!;
  const duration=session?session.entry.end-session.entry.start:child.fixedHours??(studyAllocationAvailable(data,child.id).total>0?Math.min(1,Math.ceil(studyAllocationAvailable(data,child.id).total*6-.00001)/6):1);
  const start=child.fixedStart??Math.max(7,Math.min(24-duration,snapSlot((hour??9)-(payload.offset??0))));
  const added=session?0:duration;return {child,duration,start,reason:studyTimeDropReason(data,child.id,date,duration,start,payload.session),extra:studyBudgetExcess(data,child.id,added)};
 }
 function pointerDrag(event:ReactPointerEvent,payload:Payload){
  if(event.button!==0)return;
  const child=plan.children.find(c=>c.id===(payload.child??plan.sessions.find(s=>s.id===payload.session)?.childId));if(!child)return;
  dragCleanup.current?.();
  dragCleanup.current=beginStudyPointerDrag(event,{
   onHover:(x,y,target)=>{const p=target.date?placement(payload,target.date,target.hour):null;setGhost(old=>old&&old.x===x&&old.y===y&&old.date===target.date&&old.hour===p?.start&&old.reason===(p?.reason??undefined)?old:{x,y,label:child.name,date:target.date,hour:p?.start,duration:p?.duration,reason:p?.reason??(p&&p.extra>0?`超预算 ${formatDuration(p.extra)}，放下后确认`:undefined),valid:!!target.date&&!p?.reason});},
   onEnd:dragged=>{setGhost(null);dragCleanup.current=null;if(dragged){suppressClick.current=true;window.setTimeout(()=>{suppressClick.current=false;},100);}},
   onDrop:target=>{if(target.returned&&payload.session)onMutate(current=>withdrawStudy(current,payload.session!));else if(target.date){const p=placement(payload,target.date,target.hour);if(payload.session)onMutate(current=>moveStudy(current,payload.session!,target.date!,p.start));else add(child.id,target.date,p.start);}}
  });
 }
 function add(childId:string,date:string,start?:number){
  onMutate(current=>{const child=current.taskPlan!.children.find(c=>c.id===childId)!;const available=studyAllocationAvailable(current,childId).total;const duration=child.fixedHours??(available>0?Math.min(1,Math.ceil(available*6-.00001)/6):1);return scheduleStudy(current,childId,date,duration,calendarKey(),start);});setArmed(null);
 }
 function readPayload(event:DragEvent):Payload|null{try{return JSON.parse(event.dataTransfer.getData(dragType)) as Payload;}catch{return null;}}
  return <div onClickCapture={e=>{if(suppressClick.current){e.preventDefault();e.stopPropagation();suppressClick.current=false;}}} className={`original-week-workbench ${expanded?'':'sidebar-collapsed'}`}>
    <aside data-study-return="true" className="original-task-tree card" onDragOver={e=>{if(e.dataTransfer.types.includes(dragType))e.preventDefault();}} onDrop={e=>{e.preventDefault();const p=readPayload(e);if(p?.session)onMutate(current=>withdrawStudy(current,p.session!));}}>
      <div className="row" style={{justifyContent:'space-between'}}><strong>{expanded?'待安排任务':'任务'}</strong><Button small onClick={()=>setExpanded(v=>!v)}>{expanded?'收起':'展开'}</Button></div>
      {expanded?<><p className="small muted">展开任务，拖到右侧任意日期列的空白时刻。默认 1h；也可先点任务，再点列内时刻。所有科目共用当天时间轴。</p>
      {data.subjects.map(subject=>{const parents=data.tasks.filter(t=>t.subjectId===subject.id&&plan.parentBudgets[t.id]!=null);return parents.length?<details key={subject.id} open className="original-subject-tree"><summary style={{color:colorOf(subject.colorId)}}>{subject.name}</summary>{parents.map(parent=>{
        const children=plan.children.filter(c=>c.parentId===parent.id&&!c.archived);
        return <details key={parent.id} open={open.has(parent.id)} className={`original-parent-tree ${parentId===parent.id?'original-parent-selected':''}`}><summary onClick={e=>{e.preventDefault();onParent(parent.id);setArmed(null);setOpen(current=>{const next=new Set(current);if(next.has(parent.id))next.delete(parent.id);else next.add(parent.id);return next;});}}>{parent.name}<span className="small muted">{plan.parentBudgets[parent.id]}h</span></summary>
          <Button small onClick={()=>onEditTask(parent)}>编辑子任务与时间</Button>
          {children.map(child=>{const t=studyTotals(plan,child.id),room=studyAllocationAvailable(data,child.id);const canDrag=!child.done&&!child.archived&&(!child.fixedHours||room.total>0);
          return <div className={`original-tree-leaf ${armed===child.id?'original-leaf-selected':''}`} key={child.id} draggable={false}
            onPointerDown={e=>{if(canDrag)pointerDrag(e,{child:child.id});}}
            onDragStart={e=>{if(!canDrag){e.preventDefault();return;}e.dataTransfer.setData(dragType,JSON.stringify({child:child.id}));e.dataTransfer.effectAllowed='copyMove';setArmed(child.id);}}
            style={{background:tint(parent.colorId,.10)}}>
            <button className="study-open" aria-disabled={!canDrag} onClick={()=>{if(!canDrag){onEditTask(parent);return;}setArmed(armed===child.id?null:child.id);onParent(parent.id);}}>{child.name}</button>
            <div className="small muted">{child.done?'已确认完成':child.budget==null?`未单独划时 · 组内可分配 ${formatDuration(room.pool)}`:`剩余 ${formatDuration(t.remaining)} · 可排 ${formatDuration(t.available)}`}</div>
            {room.pool>0?<div className="small muted">主动拖入时从组内划出本次时间</div>:null}
            {!canDrag&&!child.done?<div className="small muted">时间已排完或预算用尽，点击调整</div>:null}
            {(child.extraBudget??0)>0?<div className="small muted">原预算 {formatDuration(child.budget??0)} · 已确认追加 {formatDuration(child.extraBudget!)}</div>:null}
            {t.available<=0&&!child.done?<div className="small muted">再安排时需确认追加或调配预算</div>:null}
            {child.target?<div className="small muted">完成 {t.amount}/{child.target}{child.unit}</div>:null}
            {child.notBefore?<div className="small muted">{child.notBefore.slice(5)} 起{child.fixedHours?' · 一次 14:00–17:00':''}</div>:null}
            {child.budget!=null&&t.remaining===0&&!child.done?<div className="small" style={{color:'var(--danger)'}}>预算用尽 · 待确认或待补</div>:null}
          </div>;})}
        </details>;
      })}</details>:null;})}
      <p className="small muted">把未来未执行的色块拖回这里，回到待安排。已有实学记录保留原日。</p></>:null}
    </aside>
    {ghost?<div className="study-pointer-ghost" data-valid={ghost.valid===false?"false":"true"} style={{left:Math.max(8,Math.min(ghost.x+12,window.innerWidth-210)),top:Math.max(8,ghost.y-30)}}>{ghost.label}<div className="small">{ghost.reason??(ghost.date?`${ghost.date} ${formatHour(ghost.hour??9)}–${formatHour((ghost.hour??9)+(ghost.duration??1))}`:'拖到日期列或回到待安排')}</div></div>:null}
    <div className="original-week-content"><WeekTimeGrid data={data} span={span} week={week} armed={armed} activeId={activeId} marker={ghost} onWeek={onWeek} onDay={onDay} onAdd={add} onDrag={pointerDrag} onMutate={onMutate}/></div>
  </div>;
}
