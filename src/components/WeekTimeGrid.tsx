import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { calendarKey, formatDuration, formatHour, formatMD, plannerVisibleDays, snapSlot, spanWeeks, weekdayShort, type Span } from '../dateUtils';
import { patchStudy, studyBudgetExcess, studyDayLearningHours, studySessionDisplayEntry, studyTimeDropReason, withdrawStudy, type StudySession } from '../taskPlan';
import { colorOf, tint } from '../theme';
import type { PlannerData } from '../types';
import { Button, Pill } from './ui';

const PX=60;
export type WeekTimePayload={child?:string;session?:string;offset?:number};
export type WeekTimeMarker={date?:string;hour?:number;duration?:number;valid?:boolean};

export function WeekTimeGrid({data,span,week,armed,activeId,marker,onWeek,onDay,onAdd,onDrag,onMutate}:{
  data:PlannerData;span:Span;week:number;armed:string|null;activeId?:string;marker:WeekTimeMarker|null;
  onWeek:(delta:number)=>void;onDay:(date:string,taskId?:string)=>void;onAdd:(id:string,date:string,start?:number)=>void;
  onDrag:(event:ReactPointerEvent,payload:WeekTimePayload)=>void;onMutate:(action:(current:PlannerData)=>PlannerData)=>void;
}){
  const [count,setCount]=useState<1|2>(1),[selected,setSelected]=useState<string|null>(null);
  const days=plannerVisibleDays(week,span,count),today=calendarKey(),plan=data.taskPlan!;
  const session=plan.sessions.find(s=>s.id===selected),child=plan.children.find(c=>c.id===session?.childId);
  const locked=!!session&&(session.locked||session.withdrawn||session.id===activeId||session.date<today);
  const track=`52px repeat(${days.length},minmax(110px,1fr))`;
  const parse=(value:string)=>{const [h,m]=value.split(':').map(Number);return h+m/60;};
  const time=(h:number)=>`${String(Math.floor(h)).padStart(2,'0')}:${String(Math.round(h%1*60)).padStart(2,'0')}`;
  return <div className="week-time-board">
    <div className="row" style={{justifyContent:'space-between',gap:8,flexWrap:'wrap'}}><Button disabled={week===0} onClick={()=>onWeek(-1)}>← 上一周</Button><strong>{formatMD(days[0])}—{formatMD(days.at(-1)!)} · 周六至周五</strong><Button disabled={week>=spanWeeks(span)-1} onClick={()=>onWeek(1)}>下一周 →</Button></div>
    <div className="row" style={{gap:8,margin:'10px 0',flexWrap:'wrap'}}><Pill active={count===1} onClick={()=>setCount(1)}>一周</Pill><Pill active={count===2} onClick={()=>setCount(2)}>两周</Pill><span className="small muted">整列可放入 · 上下移动改开始 · 上下边缘改起止 · 10 分钟一档</span></div>
    <div className="week-time-scroll card"><div style={{minWidth:52+110*days.length}}>
      <div className="week-time-head" style={{gridTemplateColumns:track}}><div className="small muted">时刻</div>{days.map(date=><div className={date===today?'week-time-today':''} data-study-date={date} key={date}><button className="study-open" onClick={()=>onDay(date)}><strong>周{weekdayShort(date)} {formatMD(date)}{date===today?' 今天':''}</strong></button><div className="small" style={{color:studyDayLearningHours(data,date)>12?'var(--danger)':'var(--text-2)'}}>学习占用 {studyDayLearningHours(data,date).toFixed(1)}h / 12h</div></div>)}</div>
      <div className="week-time-grid" style={{gridTemplateColumns:track}}>
        <div className="week-time-ruler">{Array.from({length:18},(_,i)=><span key={i} style={{top:i*PX}}>{i+7}:00</span>)}</div>
        {days.map(date=>{
          const sessions=plan.sessions.filter(s=>s.date===date),legacy=Object.entries(data.dayPlans[date]??{});
          const all=[...sessions.map(s=>({id:s.id,entry:studySessionDisplayEntry(s)})),...legacy.map(([id,entry])=>({id,entry})),...(data.dayMiscs[date]??[]).map(m=>({id:m.id,entry:m}))].sort((a,b)=>a.entry.start-b.entry.start);
          const lanes:number[]=[],positions:Record<string,number>={};for(const block of all){let lane=lanes.findIndex(end=>end<=block.entry.start+.001);if(lane<0)lane=lanes.length;lanes[lane]=block.entry.end;positions[block.id]=lane;}
          const width=100/Math.max(1,lanes.length);
          const box=(id:string,start:number,end:number)=>({top:(start-7)*PX,height:Math.max(8,(end-start)*PX),left:`calc(${positions[id]*width}% + 3px)`,width:`calc(${width}% - 6px)`});
          return <div key={date} className={`week-time-column ${date<today?'week-time-past':''}`} data-study-date={date} data-study-start="7" data-study-scale={PX}
            onClick={event=>{if(!armed||date<today||(event.target as HTMLElement).closest('.week-time-block,button,input'))return;const start=Math.min(23,Math.max(7,snapSlot(7+(event.clientY-event.currentTarget.getBoundingClientRect().top)/PX)));onAdd(armed,date,start);}}>
            {Array.from({length:17},(_,i)=><div className="week-time-hour" key={i} style={{top:i*PX,height:PX}}/>)}
            {sessions.map(s=>{const entry=studySessionDisplayEntry(s);return <WeekTimeBlock key={s.id} data={data} session={s} style={box(s.id,entry.start,entry.end)} active={s.id===activeId} onSelect={()=>setSelected(s.id)} onDrag={onDrag} onMutate={onMutate}/>;})}
            {legacy.map(([id,e])=><button className="week-time-block week-time-legacy" key={id} style={box(id,e.start,e.end)} onClick={()=>onDay(date,id)} title={`${data.tasks.find(t=>t.id===id)?.name} · 原安排保留`}>{data.tasks.find(t=>t.id===id)?.name}<br/>{formatHour(e.start)}–{formatHour(e.end)}</button>)}
            {(data.dayMiscs[date]??[]).map(m=><button className="week-time-block week-time-rest" key={m.id} style={box(m.id,m.start,m.end)} onClick={()=>onDay(date)} title={`${m.name}（用户添加）`}>{m.name}</button>)}
            {marker?.date===date&&marker.hour!=null?<div className={`week-time-marker ${marker.valid?'':'invalid'}`} style={{top:(marker.hour-7)*PX,height:(marker.duration??1)*PX}}>{formatHour(marker.hour)}–{formatHour(marker.hour+(marker.duration??1))}</div>:null}
          </div>;
        })}
      </div>
    </div></div>
    {session&&child?<div className="card week-time-inspector"><div className="row" style={{gap:8,flexWrap:'wrap'}}><strong>{child.name}</strong><span className="small">{session.date} · {formatDuration(session.entry.end-session.entry.start)} · 实学 {formatDuration(session.entry.actualHours??0)}</span><Button small onClick={()=>onDay(session.date,session.id)}>进入当天记录</Button><Button small disabled={locked} onClick={()=>onMutate(current=>withdrawStudy(current,session.id))}>撤回未执行部分</Button><Button small disabled={session.withdrawn||session.id===activeId} onClick={()=>onMutate(current=>({...current,taskPlan:{...current.taskPlan!,sessions:current.taskPlan!.sessions.map(s=>s.id===session.id?{...s,locked:!s.locked}:s)}}))}>{session.locked?'解锁':'锁定'}</Button></div><div className="row" style={{gap:10,marginTop:8}}><label className="small">开始 <input className="field" type="time" step="600" value={time(session.entry.start)} disabled={locked} onChange={e=>{const start=parse(e.target.value);onMutate(current=>patchStudy(current,session.id,{start,end:start+session.entry.end-session.entry.start}));}}/></label><label className="small">结束 <input className="field" type="text" aria-label="结束时间，可输入24:00" placeholder="HH:mm" key={`${session.id}-${session.entry.end}`} defaultValue={time(session.entry.end)} disabled={locked} onBlur={e=>{const end=parse(e.target.value);if(end!==session.entry.end)onMutate(current=>patchStudy(current,session.id,{end}));}}/></label></div></div>:null}
  </div>;
}

function WeekTimeBlock({data,session:s,style,active,onSelect,onDrag,onMutate}:{data:PlannerData;session:StudySession;style:React.CSSProperties;active:boolean;onSelect:()=>void;onDrag:(event:ReactPointerEvent,payload:WeekTimePayload)=>void;onMutate:(action:(data:PlannerData)=>PlannerData)=>void}){
  const child=data.taskPlan!.children.find(c=>c.id===s.childId)!,parent=data.tasks.find(t=>t.id===child.parentId)!;
  const entry=studySessionDisplayEntry(s),[preview,setPreview]=useState<{start:number;end:number}|null>(null),cleanupRef=useRef<(()=>void)|null>(null),skipClick=useRef(false);
  useEffect(()=>()=>cleanupRef.current?.(),[]);
  const shown=preview??entry,readonly=s.locked||s.withdrawn||active||s.date<calendarKey();
  function resize(event:ReactPointerEvent,edge:'start'|'end'){
    if(readonly)return;event.preventDefault();event.stopPropagation();cleanupRef.current?.();
    const source=event.currentTarget,pointerId=event.pointerId,y=event.clientY;
    let next={start:entry.start,end:entry.end};
    const max=12;
    const move=(e:PointerEvent)=>{if(e.pointerId!==pointerId)return;e.preventDefault();const delta=snapSlot((e.clientY-y)/PX);next=edge==='start'?{start:Math.max(7,entry.end-max,Math.min(entry.end-1/6,snapSlot(entry.start+delta))),end:entry.end}:{start:entry.start,end:Math.min(24,entry.start+max,Math.max(entry.start+1/6,snapSlot(entry.end+delta)))};setPreview({...next});};
    const cleanup=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',cleanup);window.removeEventListener('blur',cleanup);window.removeEventListener('keydown',key);if(source.hasPointerCapture(pointerId))source.releasePointerCapture(pointerId);cleanupRef.current=null;setPreview(null);skipClick.current=true;window.setTimeout(()=>{skipClick.current=false;},100);};
    const up=(e:PointerEvent)=>{if(e.pointerId!==pointerId)return;cleanup();if(Math.abs(next.start-entry.start)>.001||Math.abs(next.end-entry.end)>.001)onMutate(current=>patchStudy(current,s.id,next));};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape')cleanup();};
    try{source.setPointerCapture(pointerId);}catch{/* Window listeners are a fallback. */}
    cleanupRef.current=cleanup;window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',up);window.addEventListener('pointercancel',cleanup);window.addEventListener('blur',cleanup);window.addEventListener('keydown',key);
  }
  const excess=preview?studyBudgetExcess(data,child.id,Math.max(0,shown.end-shown.start-(entry.end-entry.start))):0;
  const reason=preview?studyTimeDropReason(data,child.id,s.date,shown.end-shown.start,shown.start,s.id):null;
  return <div className={`week-time-block week-time-study ${(shown.end-shown.start)*PX<30?'week-time-tiny':''} ${reason?'week-time-invalid':excess>0?'week-time-over-budget':''}`} style={{...style,top:(shown.start-7)*PX,height:Math.max(8,(shown.end-shown.start)*PX),background:tint(parent.colorId,.25),borderLeft:`3px solid ${colorOf(parent.colorId)}`,cursor:readonly?"default":"grab"}}
    onPointerDown={e=>{if(!readonly&&!(e.target as HTMLElement).closest('.week-time-resize'))onDrag(e,{session:s.id,offset:(e.clientY-e.currentTarget.getBoundingClientRect().top)/PX});}}
    onClick={e=>{e.stopPropagation();if(!skipClick.current)onSelect();}} title={`${parent.name} / ${child.name} · ${formatHour(shown.start)}–${formatHour(shown.end)}${reason?` · ${reason}`:excess>0?` · 超预算 ${formatDuration(excess)}，松手后确认`:''}`}>
    {!readonly&&(shown.end-shown.start)*PX>=30?<div className="week-time-resize top" onPointerDown={e=>resize(e,'start')} role="separator" aria-label="拖动上边缘修改开始时间"/>:null}
    <div className="week-time-block-name">{child.name}{s.withdrawn?' · 实学记录':s.locked?' · 锁定':active?' · 计时中':''}</div>
    {(shown.end-shown.start)*PX>=42?<div className="small">{formatHour(shown.start)}–{formatHour(shown.end)}</div>:null}
    {(shown.end-shown.start)*PX>=65?<div className="small muted">{parent.name}</div>:null}
    {!readonly?<div className="week-time-resize bottom" onPointerDown={e=>resize(e,'end')} role="separator" aria-label="拖动下边缘修改结束时间"/>:null}
  </div>;
}
