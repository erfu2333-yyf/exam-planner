import { useState } from 'react';
import { resizeSubjectBudget } from '../studyBudgetEditing';
import type { PlannerData } from '../types';
import { Button, Modal } from './ui';

export function SubjectBudgetEditor({data,subjectId,onClose,onSave}:{data:PlannerData;subjectId:string;onClose:()=>void;onSave:(apply:(data:PlannerData)=>PlannerData)=>void}){
  const parents=data.tasks.filter(t=>t.subjectId===subjectId&&data.taskPlan!.parentBudgets[t.id]!=null&&!data.taskPlan!.archivedParents.includes(t.id));
  const total=parents.reduce((n,p)=>n+data.taskPlan!.parentBudgets[p.id],0);
  const [hours,setHours]=useState(String(total));const [error,setError]=useState('');
  let preview:PlannerData|undefined;let reason='';
  try{if(hours.trim()==='')throw new Error('请填写总时间。');preview=resizeSubjectBudget(data,subjectId,Number(hours));}catch(e){reason=e instanceof Error?e.message:String(e);}
  return <Modal title={`${data.subjects.find(s=>s.id===subjectId)?.name} · 总时间安排`} onClose={onClose} width={650}><div className="stack">
    <label>科目总预算（小时）<input className="field" type="number" min={0} step={1} value={hours} onChange={e=>{setHours(e.target.value);setError('');}}/></label>
    <p className="small muted">按现有比例调整各模块和子任务的未用预算；已用时间、已排时段和固定模考保持原值。下面是保存后的分配预览，具体子任务还可单独编辑。</p>
    {parents.map(p=><div className="row" key={p.id} style={{justifyContent:'space-between'}}><span>{p.name}</span><span>{data.taskPlan!.parentBudgets[p.id]}h → {preview?.taskPlan!.parentBudgets[p.id].toFixed(2)??'—'}h</span></div>)}
    {reason||error?<div role="alert" style={{color:'var(--danger)'}}>{error||reason}</div>:null}
    <div className="row"><Button variant="primary" disabled={!preview} onClick={()=>{try{onSave(latest=>resizeSubjectBudget(latest,subjectId,Number(hours)));}catch(e){setError(e instanceof Error?e.message:String(e));}}}>保存总时间</Button><Button onClick={onClose}>取消</Button></div>
  </div></Modal>;
}
