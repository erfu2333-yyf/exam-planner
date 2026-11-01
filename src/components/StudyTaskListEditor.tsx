import { StudyRecordCorrection } from './StudyRecordCorrection';
import { useState } from 'react';
import { editStudyTasks } from '../studyEditing';
import { studyTotals, type StudyTask } from '../taskPlan';
import type { PlannerData } from '../types';
import { Button, Modal } from './ui';

type Draft={id:string;name:string;hours:string;minutes:string;target:string;unit:string;done:boolean};
function draftOf(c:StudyTask):Draft{
  const minutes=c.budget==null?null:Math.round(c.budget*60);
  return {id:c.id,name:c.name,hours:minutes==null?'':String(Math.floor(minutes/60)),minutes:minutes==null?'':String(minutes%60),target:c.target==null?'':String(c.target),unit:c.unit??'',done:!!c.done};
}

export function StudyTaskEditor({data,parentId,activeId,onSave,onClose,onCorrectRecord}:{data:PlannerData;parentId:string;activeId?:string;onCorrectRecord?:(id:string,hours:number)=>void;onSave:(apply:(latest:PlannerData)=>PlannerData)=>void;onClose:()=>void}){
  const parent=data.tasks.find(t=>t.id===parentId)!;
  const plan=data.taskPlan!;
  const children=plan.children.filter(c=>c.parentId===parentId);
  const [name,setName]=useState(parent.name);
  const [total,setTotal]=useState(String(plan.parentBudgets[parentId]));
  const [draft,setDraft]=useState<Draft[]>(()=>children.filter(c=>!c.archived).map(draftOf));
  const [error,setError]=useState('');
  const missing=children.filter(c=>!draft.some(d=>d.id===c.id));
  function change(id:string,patch:Partial<Draft>){setDraft(old=>old.map(d=>d.id===id?{...d,...patch}:d));setError('');}
  function add(){setDraft(old=>[...old,{id:`child-${crypto.randomUUID()}`,name:'',hours:'',minutes:'',target:'',unit:'',done:false}]);setError('');}
  function move(index:number,delta:number){setDraft(old=>{const next=[...old];[next[index],next[index+delta]]=[next[index+delta],next[index]];return next;});}
  function budget(d:Draft){
    if(d.hours===''&&d.minutes==='')return null;
    const h=Number(d.hours||0),m=Number(d.minutes||0);
    if(!Number.isInteger(h)||!Number.isInteger(m)||h<0||m<0||m>=60)throw new Error('时间请填写非负整数小时与 0–59 分钟。');
    return h+m/60;
  }
  function save(){
    try{
      const edit={parentId,name,budget:total.trim()?Number(total):NaN,children:draft.map(d=>({id:d.id,name:d.name,budget:budget(d),target:d.target===''?undefined:Number(d.target),unit:d.unit,done:d.done}))};
      editStudyTasks(data,edit,activeId);
      onSave(latest=>editStudyTasks(latest,edit,activeId));
    }catch(e){setError(e instanceof Error?e.message:String(e));}
  }
  let assigned=0;
  try{assigned=draft.reduce((n,d)=>n+(budget(d)??0),0)+missing.reduce((n,c)=>n+Math.min(c.budget??0,studyTotals(plan,c.id).actual),0);}catch{/* Invalid fields are reported when saving. */}
  return <Modal title="编辑子任务名录与时间" onClose={onClose} width={740}><div className="stack">
    <label>二级任务名称<input className="field" style={{width:'100%'}} value={name} onChange={e=>setName(e.target.value)}/></label>
    <label>模块总预算（小时）<input className="field" type="number" min={0} value={total} onChange={e=>setTotal(e.target.value)}/></label>
    <div className="row" style={{justifyContent:'space-between',flexWrap:'wrap'}}><span className="small">总预算 {plan.parentBudgets[parentId]}h · 已分配 {assigned.toFixed(2)}h · 可分配 {Math.max(0,plan.parentBudgets[parentId]-assigned).toFixed(2)}h</span><Button small onClick={add}>＋ 新增子任务</Button></div>
    <p className="small muted">修改后同步到任务边栏、周历和当天记录。调整预算不自动拉伸已排色块；单次时长在周历拉伸或当天编辑。</p>
    {draft.map((d,i)=>{const source=children.find(c=>c.id===d.id);const totals=source?studyTotals(plan,d.id):null;return <section key={d.id} className="study-child-editor">
      <div className="row" style={{gap:6,flexWrap:'wrap'}}><input aria-label={`第${i+1}个子任务名称`} className="field" value={d.name} placeholder="具体要做什么" style={{flex:1,minWidth:180}} onChange={e=>change(d.id,{name:e.target.value})}/><Button small disabled={i===0} onClick={()=>move(i,-1)}>上移</Button><Button small disabled={i===draft.length-1} onClick={()=>move(i,1)}>下移</Button><Button small onClick={()=>{setDraft(old=>old.filter(x=>x.id!==d.id));setError('');}}>{totals&&totals.actual>0?'移出，保留记录':'移出'}</Button></div>
      <div className="row" style={{gap:10,flexWrap:'wrap',marginTop:10}}><label className="small">预算 <input aria-label={`${d.name||'新任务'}预算小时`} className="field" type="number" min={0} step={1} style={{width:65}} value={d.hours} placeholder="待定" onChange={e=>change(d.id,{hours:e.target.value})}/>小时<input aria-label={`${d.name||'新任务'}预算分钟`} className="field" type="number" min={0} max={59} step={1} style={{width:65}} value={d.minutes} placeholder="0" onChange={e=>change(d.id,{minutes:e.target.value})}/>分钟</label>
      <label className="small">总数量 <input aria-label={`${d.name||'新任务'}总数量`} className="field" type="number" min={0} style={{width:75}} value={d.target} placeholder="可留空" onChange={e=>change(d.id,{target:e.target.value})}/></label><label className="small">单位 <input aria-label={`${d.name||'新任务'}单位`} className="field" style={{width:65}} value={d.unit} placeholder="篇/道" onChange={e=>change(d.id,{unit:e.target.value})}/></label></div>
      <div className="row" style={{justifyContent:'space-between',flexWrap:'wrap',marginTop:8}}><span className="small muted">{totals?`实学 ${totals.actual.toFixed(2)}h · 尚待执行 ${totals.arranged.toFixed(2)}h${source?.target?` · 完成 ${totals.amount}/${source.target}${source.unit}`:''}`:'新任务尚无安排或记录'}</span><label className="small"><input type="checkbox" checked={d.done} onChange={e=>change(d.id,{done:e.target.checked})}/> 本轮已完成</label></div>
      {(source?.extraBudget??0)>0?<div className="small muted">此前已确认追加 {source!.extraBudget!.toFixed(2)}h；上面的时间框保留原预算，修改原预算会重新核对已有安排。</div>:null}
      {source&&onCorrectRecord?<details><summary className="small">更正实际用时（按原日期记录）</summary><p className="small muted">保存更正会暂停对应计时器，防止忘记暂停产生的错误时长再次写回。</p>{plan.sessions.filter(s=>s.childId===source.id).map(s=><StudyRecordCorrection key={s.id} session={s} onSave={onCorrectRecord}/>)}</details>:null}
      {source?.group?<div className="small muted">{source.group}读手册＋刷题合计不超过 {plan.groupBudgets[source.group]}h</div>:null}
    </section>;})}
    {missing.length?<details><summary className="small">移出清单的任务（{missing.length}）</summary><p className="small muted">保存后撤回未执行安排，保留历史实学；未用预算回到本二级任务。锁定安排需先解锁。</p>{missing.map(c=><div className="row" key={c.id} style={{justifyContent:'space-between',margin:'6px 0'}}><span>{c.name}</span><Button small onClick={()=>setDraft(old=>[...old,draftOf(c)])}>恢复到清单</Button></div>)}</details>:null}
    {error?<div className="small" role="alert" style={{color:'var(--danger)'}}>{error}</div>:null}
    <div className="row"><Button variant="primary" onClick={save}>保存名录与时间</Button><Button onClick={onClose}>取消</Button></div>
  </div></Modal>;
}
