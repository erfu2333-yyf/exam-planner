import { studyTotals } from './taskPlan';
import type { PlannerData } from './types';

/** Allocate whole minutes above protected actual/arranged floors. */
function distribute(total:number, floors:number[], weights:number[]) {
  const spare=total-floors.reduce((a,b)=>a+b,0);
  if(spare<0)throw new Error('新总预算小于已有实学与尚待执行安排，请先更正实学或撤回未执行安排。');
  const sum=weights.reduce((a,b)=>a+b,0);
  const shares=weights.map(w=>spare*(sum?w/sum:1/weights.length));
  const result=shares.map((v,i)=>floors[i]+Math.floor(v));
  let left=total-result.reduce((a,b)=>a+b,0);
  for(const i of shares.map((v,i)=>({i,r:v-Math.floor(v)})).sort((a,b)=>b.r-a.r).map(x=>x.i)){
    if(left--<=0)break;result[i]++;
  }
  return result;
}

export function resizeSubjectBudget(data:PlannerData,subjectId:string,hours:number):PlannerData {
  if(!Number.isFinite(hours)||hours<0)throw new Error('科目总时间必须为非负小时数。');
  const plan=data.taskPlan!;
  const parents=data.tasks.filter(t=>t.subjectId===subjectId&&plan.parentBudgets[t.id]!=null&&!plan.archivedParents.includes(t.id));
  if(!parents.length)throw new Error('此科目还没有预算任务。');
  const groups=parents.map(parent=>{
    const children=plan.children.filter(c=>c.parentId===parent.id);
    const floors=children.map(c=>{
      if(c.fixedHours)return Math.round(c.fixedHours*60);
      const t=studyTotals(plan,c.id);
      return Math.ceil(Math.max(0,t.actual+t.arranged-(c.extraBudget??0))*60-.00001);
    });
    const weights=children.map((c,i)=>c.fixedHours||c.archived||c.done?0:Math.max(0,(c.budget??0)*60-floors[i]));
    const pool=Math.max(0,plan.parentBudgets[parent.id]*60-children.reduce((n,c)=>n+(c.budget??0)*60,0));
    return {parent,children,floors,weights,pool,min:floors.reduce((n,v)=>n+v,0)};
  });
  const budgets=distribute(Math.round(hours*60),groups.map(g=>g.min),groups.map(g=>Math.max(0,plan.parentBudgets[g.parent.id]*60-g.min)));
  let children=[...plan.children];const parentBudgets={...plan.parentBudgets},groupBudgets={...plan.groupBudgets};
  groups.forEach((g,i)=>{
    const allocated=distribute(budgets[i],[...g.floors,0],[...g.weights,g.pool || (g.weights.every(w=>w===0)?1:0)]);
    parentBudgets[g.parent.id]=budgets[i]/60;
    children=children.map(c=>{const index=g.children.findIndex(x=>x.id===c.id);return index<0?c:{...c,budget:c.budget==null&&allocated[index]===0?null:allocated[index]/60};});
    for(const group of new Set(g.children.map(c=>c.group).filter((v):v is string=>!!v))){
      const assigned=children.filter(c=>c.group===group).reduce((n,c)=>n+(c.budget??0),0);
      groupBudgets[group]=Math.max(assigned,(plan.groupBudgets[group]??0)*(parentBudgets[g.parent.id]/(plan.parentBudgets[g.parent.id]||1)));
    }
  });
  return {...data,taskPlan:{...plan,children,parentBudgets,groupBudgets}};
}
