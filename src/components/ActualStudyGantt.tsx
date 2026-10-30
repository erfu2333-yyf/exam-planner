import { useState } from 'react';
import { addDays, calendarKey, dayIndex, diffDays, formatMD, PLAN_ORIGIN, weekOfIndex, weekStartKey, weekdayShort } from '../dateUtils';
import { actualStudyModules } from '../studyActual';
import { colorOf, tint } from '../theme';
import type { PlannerData } from '../types';
import { Button, Pill } from './ui';

export function ActualStudyGantt({data,onDay}:{data:PlannerData;onDay:(date:string)=>void}){
  const today=calendarKey();
  const [mode,setMode]=useState<'week'|'all'>('week');
  const [week,setWeek]=useState(()=>weekStartKey(weekOfIndex(dayIndex(today,PLAN_ORIGIN)),PLAN_ORIGIN));
  const modules=actualStudyModules(data,today);
  if(!modules.length)return null;
  const recordedDates=modules.flatMap(m=>Object.keys(m.daily)).sort();
  const earliest=recordedDates[0];
  const recordedWeeks=[...new Set(recordedDates.map(d=>weekStartKey(weekOfIndex(dayIndex(d,PLAN_ORIGIN)),PLAN_ORIGIN)))].sort();
  const activeWeek=recordedWeeks.includes(week)?week:recordedWeeks.at(-1)!;
  const weekIndex=recordedWeeks.indexOf(activeWeek);
  const from=mode==='week'?activeWeek:(earliest<'2026-10-20'?earliest:'2026-10-20');
  const to=mode==='week'?addDays(activeWeek,6):today;
  const days=Array.from({length:Math.max(1,diffDays(from,to)+1)},(_,i)=>addDays(from,i));
  const visible=modules.filter(m=>days.some(d=>(m.daily[d]??0)>0));
  const groups=data.subjects.map(s=>({subject:s,rows:visible.filter(m=>m.subjectId===s.id)})).filter(g=>g.rows.length);
  const total=(date:string)=>visible.reduce((n,m)=>n+(m.daily[date]??0),0);
  const sum=days.reduce((n,d)=>n+total(d),0);
  const scale=Math.max(12,...days.map(total));
  const weekRanges:Array<{start:number;count:number;label:string}>=[];
  days.forEach((d,i)=>{const start=weekStartKey(weekOfIndex(dayIndex(d,PLAN_ORIGIN)),PLAN_ORIGIN);const last=weekRanges.at(-1);if(last?.label===start)last.count++;else weekRanges.push({start:i,count:1,label:start});});
  const template=`180px 66px repeat(${days.length}, minmax(${mode==='week'?82:34}px, 1fr))`;
  const fmt=(n:number)=>Number(n.toFixed(2)).toString();
  return <section className="card actual-study-gantt" id="actual-study-gantt">
    <div className="row" style={{justifyContent:'space-between',flexWrap:'wrap',gap:10}}><div><h3>实际复习记录甘特图</h3><span className="small muted">{formatMD(from)}—{formatMD(to)} · 实学 {fmt(sum)}h · 单位：小时</span></div><div className="row" style={{gap:6}}><Pill active={mode==='week'} onClick={()=>setMode('week')}>按周复盘</Pill><Pill active={mode==='all'} onClick={()=>setMode('all')}>整体累计</Pill></div></div>
    {mode==='week'?<div className="row" style={{justifyContent:'space-between',margin:'12px 0'}}><Button small disabled={weekIndex===0} onClick={()=>setWeek(recordedWeeks[weekIndex-1])}>← 上一周</Button><span className="small">周六至周五</span><Button small disabled={weekIndex===recordedWeeks.length-1} onClick={()=>setWeek(recordedWeeks[weekIndex+1])}>下一周 →</Button></div>:null}
    <div className="actual-gantt-scroll"><div style={{minWidth:246+days.length*(mode==='week'?82:34)}}>
      <div className="actual-gantt-grid actual-gantt-head" style={{gridTemplateColumns:template}}><div className="actual-module-label">科目 / 二级任务</div><div className="actual-row-total">合计 h</div>{weekRanges.map(w=><div key={w.label} className="small actual-week-label" style={{gridColumn:`${w.start+3} / span ${w.count}`}}>{formatMD(w.label)} 起</div>)}</div>
      <div className="actual-gantt-grid actual-gantt-head" style={{gridTemplateColumns:template}}><div className="actual-module-label small muted">点击有记录的日期查看当天</div><div className="actual-row-total"/>{days.map(d=><div className={`actual-date ${d===today?'actual-today':''}`} key={d}><div className="small">{formatMD(d)}</div><div className="small muted">周{weekdayShort(d)}</div></div>)}</div>
      {groups.map(({subject,rows})=><div key={subject.id}>
        <div className="actual-gantt-grid actual-subject" style={{gridTemplateColumns:template,background:tint(subject.colorId,.08)}}><strong className="actual-module-label" style={{color:colorOf(subject.colorId)}}>{subject.name}</strong><strong className="actual-row-total small">{fmt(rows.reduce((n,r)=>n+days.reduce((v,d)=>v+(r.daily[d]??0),0),0))}</strong>{days.map(d=><span key={d} className="actual-date small">{rows.reduce((n,r)=>n+(r.daily[d]??0),0)>0?fmt(rows.reduce((n,r)=>n+(r.daily[d]??0),0)):'—'}</span>)}</div>
        {rows.map(row=><div className="actual-gantt-grid" key={row.id} style={{gridTemplateColumns:template}}><div className="actual-module-label small">{row.name}</div><div className="actual-row-total small">{fmt(days.reduce((n,d)=>n+(row.daily[d]??0),0))}</div>{days.map(d=>{const h=row.daily[d]??0;return <div className="actual-hours-cell" key={d}>{h>0?<button onClick={()=>onDay(d)} className="actual-hours-button" aria-label={`${d} ${subject.name} ${row.name} 实学 ${fmt(h)} 小时`} title={`${d} · ${row.details[d].join('；')}`}><span className="actual-hours-bar" style={{width:`${Math.max(3,h/scale*100)}%`,background:colorOf(subject.colorId)}}/><span className="actual-hours-value">{fmt(h)}</span></button>:<span className="small muted">—</span>}</div>;})}</div>)}
      </div>)}
      <div className="actual-gantt-grid actual-total" style={{gridTemplateColumns:template}}><strong className="actual-module-label">每日实学合计</strong><strong className="actual-row-total small">{fmt(sum)}</strong>{days.map(d=><span key={d} className="actual-date small">{total(d)>0?fmt(total(d)):'—'}</span>)}</div>
    </div></div>
    <p className="small muted">每格一天，色条长度以 {fmt(scale)}h 为满格参照。仅计时或补记的实学进入此图；休息、已排时长和完成勾选不折算为实学。按日期汇总，不推断当天真实起止时刻。</p>
  </section>;
}
