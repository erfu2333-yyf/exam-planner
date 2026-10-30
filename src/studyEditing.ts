import { calendarKey } from './dateUtils';
import { studyTotals, type StudyTask } from './taskPlan';
import type { PlannerData } from './types';

export type StudyChildEdit={id:string;name:string;budget:number|null;target?:number;unit?:string;done?:boolean};
export type StudyTaskEdit={parentId:string;name:string;children:StudyChildEdit[]};

/** Apply list edits to the latest data; session IDs and actual records never get regenerated. */
export function editStudyTasks(data:PlannerData,edit:StudyTaskEdit,activeSessionId?:string):PlannerData{
  const plan=data.taskPlan!;
  if(plan.parentBudgets[edit.parentId]==null)throw new Error('二级任务不存在。');
  if(!edit.name.trim())throw new Error('二级任务名称不能为空。');
  const ids=new Set<string>();const revised:StudyTask[]=[];
  for(const input of edit.children){
    if(!input.id||ids.has(input.id))throw new Error('子任务身份重复，请重新添加。');ids.add(input.id);
    const original=plan.children.find(c=>c.id===input.id);
    if(original&&original.parentId!==edit.parentId)throw new Error('不能覆盖其他二级任务的子任务。');
    if(!input.name.trim())throw new Error('子任务名称不能为空。');
    if(input.budget!=null&&(!Number.isFinite(input.budget)||input.budget<0))throw new Error('预算必须为非负时间；待定可留空。');
    if(input.target!=null&&(!Number.isFinite(input.target)||input.target<=0))throw new Error('总数量必须大于零。');
    if(input.target!=null&&!input.unit?.trim())throw new Error('有数量的任务请填写单位。');
    if(original?.fixedHours&&(input.budget!==original.fixedHours||input.target!==original.target))throw new Error('全真模考保持一次完整 3h。');
    if(original){
      const totals=studyTotals(plan,original.id);
      if(input.target!=null&&input.target<totals.amount)throw new Error(`${input.name}总数量不能小于已记录的完成量。`);
      if(totals.amount>0&&(input.target==null||input.unit?.trim()!==original.unit))throw new Error(`${input.name}已有数量记录，修改计量方式前请先更正原记录。`);
      const retainedExtra=original.budget===input.budget?(original.extraBudget??0):0;
      if(!input.done&&totals.arranged>0&&(input.budget==null||totals.arranged>Math.max(0,input.budget+retainedExtra-totals.actual)+.001))throw new Error(`${input.name}的新预算不足以容纳已有安排，请先在周历撤回或缩短。`);
    }
    revised.push({...original,id:input.id,parentId:edit.parentId,name:input.name.trim(),budget:input.budget,target:input.target,unit:input.unit?.trim()||undefined,done:Boolean(input.done),archived:false,pooledBudget:original?.budget===input.budget?original?.pooledBudget:false,extraBudget:original?.budget===input.budget?original?.extraBudget:0});
  }
  const removed=plan.children.filter(c=>c.parentId===edit.parentId&&!ids.has(c.id)).map(c=>({...c,archived:true}));
  const retired=new Set([...removed.map(c=>c.id),...revised.filter(c=>c.done).map(c=>c.id)]);
  for(const session of plan.sessions){
    if(!retired.has(session.childId)||session.withdrawn)continue;
    if(session.id===activeSessionId)throw new Error('请先暂停该子任务计时，再移出或结束任务。');
    if(session.date>=calendarKey()&&session.locked)throw new Error('该任务仍有锁定的未来安排，请先解锁再移出或结束。');
  }
  const assigned=(c:StudyTask)=>c.archived?Math.min(c.budget??0,studyTotals(plan,c.id).actual):c.budget??0;
  const combined=[...revised,...removed];
  if(combined.reduce((n,c)=>n+assigned(c),0)>plan.parentBudgets[edit.parentId]+.001)throw new Error('子任务预算总和超过二级任务总预算，请先调出时间再分配。');
  for(const group of new Set(combined.map(c=>c.group).filter((g):g is string=>!!g))){
    if(combined.filter(c=>c.group===group).reduce((n,c)=>n+assigned(c),0)>plan.groupBudgets[group]+.001)throw new Error(`${group}读手册与刷题合计不能超过 ${plan.groupBudgets[group]}h。`);
  }
  const sessions=plan.sessions.flatMap(s=>!retired.has(s.childId)?[s]:(s.entry.actualHours??0)>0||(s.entry.doneDelta??0)>0?[{...s,withdrawn:true}]:[]);
  return {...data,tasks:data.tasks.map(t=>t.id===edit.parentId?{...t,name:edit.name.trim()}:t),taskPlan:{...plan,children:[...plan.children.filter(c=>c.parentId!==edit.parentId),...combined],sessions}};
}
