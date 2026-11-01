import { addDays, calendarKey, diffDays } from '../dateUtils';
import { parentStudyTotals, studyTotals } from '../taskPlan';
import type { PlannerData } from '../types';
import { Button } from './ui';

export function StudyProgress({data,onEditBudget}:{data:PlannerData;onEditBudget?:(subjectId:string)=>void}){
  const plan=data.taskPlan!;const today=calendarKey();const last=addDays(data.examDate,-1);
  const days=Math.max(0,diffDays(today<'2026-10-20'?'2026-10-20':today,last)+1);
  const rows=data.subjects.map(subject=>{
    const parents=data.tasks.filter(t=>t.subjectId===subject.id&&plan.parentBudgets[t.id]!=null);
    let budget=0,extra=0,actual=0,remaining=0,unassigned=0,pending=0;
    for(const parent of parents){const t=parentStudyTotals(data,parent.id);budget+=t.budget;extra+=t.extraBudget;actual+=t.actual;remaining+=t.remaining;unassigned+=t.unassigned;for(const child of plan.children.filter(c=>c.parentId===parent.id&&!c.archived)){const childTotals=studyTotals(plan,child.id);if(!child.done&&child.budget!=null&&childTotals.remaining===0)pending++;}}

    return {subject,budget,extra,actual,remaining,unassigned,pending};
  });
  const extra=rows.reduce((n,r)=>n+r.extra,0);
  const budget=rows.reduce((n,r)=>n+r.budget,0),remaining=rows.reduce((n,r)=>n+r.remaining,0),actual=rows.reduce((n,r)=>n+r.actual,0);
  const legacy=Object.values(data.dayPlans).reduce((n,p)=>n+Object.values(p).reduce((s,e)=>s+(e.actualHours??0),0),0);
  return <section className="card study-progress">
    <div className="row" style={{justifyContent:'space-between',alignItems:'baseline'}}><h3>任务进度与剩余容量</h3><span className="small muted">截至 {today} · 学习截止 {last} · 休息不计入实学</span></div>
    <div className="study-metrics"><div>任务总预算<strong>{budget.toFixed(0)}h{extra>0?` + 追加 ${extra.toFixed(2)}h`:null}</strong></div><div>已关联实学<strong>{actual.toFixed(1)}h</strong></div><div>剩余需求<strong>{remaining.toFixed(1)}h</strong></div><div>剩余理论容量<strong>{days*10}h / {days}天</strong></div><div>接下来日均需<strong style={{color:remaining>days*10?'var(--danger)':undefined}}>{days?(remaining/days).toFixed(2):remaining>0?'已到期':'0'}h</strong></div></div>
    <div className="study-subjects">{rows.filter(r=>r.budget>0).map(r=><div key={r.subject.id}><strong>{r.subject.name}</strong>{onEditBudget?<Button small onClick={()=>onEditBudget(r.subject.id)}>调整总时间</Button>:null}<div className="small">实学 {r.actual.toFixed(1)} / 原预算 {r.budget}h{r.extra>0?`＋追加${r.extra.toFixed(2)}h`:null} · 剩余 {r.remaining.toFixed(1)}h</div><div className="study-track"><div style={{width:`${Math.min(100,r.actual/r.budget*100)}%`,background:'var(--accent)',height:'100%'}}/></div>{r.unassigned>0?<div className="small muted">其中 {r.unassigned.toFixed(1)}h 尚待分配到子任务</div>:null}{r.pending>0?<div className="small" style={{color:'var(--danger)'}}>{r.pending} 项预算用尽，需确认完成或保留待补</div>:null}</div>)}</div>
    {legacy>0?<p className="small muted">另有原任务实学 {legacy.toFixed(2)}h 尚未关联到新子任务，已保留；当前剩余需求尚未扣除这些记录，请在周历逐条关联，避免重复安排。</p>:null}
    <p className="small muted">每天 10h 为理论参照；时间投入与内容完成分开显示。预算用尽不会自动增加未来需求。</p>
  </section>;
}
