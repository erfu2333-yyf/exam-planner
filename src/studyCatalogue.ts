import type { PlannerData, Task } from './types';
import type { StudyTask } from './taskPlan';

const high:Array<[string,string,number]>=[['4','第四章 社会研究的过程',5],['5','第五章 社会研究的设计',9],['6','第六章 测量',12],['7','第七章 抽样',10],['10','第十章 实地研究',7],['12','第十二章 实验研究',8]];
const low:Array<[string,string,number]>=[['2','第二章 社会研究手段的发展与方法论演进',3],['3','第三章 社会研究的方法论问题',5],['8','第八章 问卷法',4],['13','第十三章 文献研究',2],['16','第十六章 统计分析与变量关系检验',2],['combined','第十一章、第九章、第一章',3],['training','综合模考与方案设计训练',3]];

/** Idempotent catalogue upgrade. Never change a session's date, duration, ID or recorded hours. */
export function upgradeStudyCatalogue(data:PlannerData):PlannerData{
  const plan=data.taskPlan;
  const subject=data.subjects.find(s=>/^(社会)?研究方法$/.test(s.name.replace(/\s/g,'')))??data.subjects.find(s=>s.id==='method');
  if(!plan||plan.methodRevision===2||!subject)return data;
  const targetParents=new Set(['plan-method-high','plan-method-low']);
  const oldParents=new Set(['plan-method-core','plan-method-specific','plan-method-framework',...targetParents,...data.tasks.filter(t=>t.subjectId===subject.id&&(plan.parentBudgets[t.id]!=null||!plan.archivedParents.includes(t.id))).map(t=>t.id)]);
  const oldChildren=plan.children.filter(c=>oldParents.has(c.parentId));
  const replacement:StudyTask[]=[];
  for(const [level,items] of [['high',high],['low',low]] as const){
    for(const [key,name,budget] of items)replacement.push({id:`method-v2-${key}`,parentId:`plan-method-${level}`,name,budget});
  }
  const map=new Map<string,string>();
  for(const c of oldChildren){
    if(replacement.some(n=>n.id===c.id)){map.set(c.id,c.id);continue;}
    const number=c.name.match(/^第([\d一二三四五六七八九十]+)章/)?.[1];
    const chinese:Record<string,string>={'一':'1','二':'2','三':'3','四':'4','五':'5','六':'6','七':'7','八':'8','九':'9','十':'10','十一':'11','十二':'12','十三':'13','十六':'16'};
    const chapter=number?(chinese[number]??number):undefined;
    const key=chapter&&['1','9','11'].includes(chapter)?'combined':chapter;
    if(key&&replacement.some(n=>n.id===`method-v2-${key}`))map.set(c.id,`method-v2-${key}`);
  }
  const sessions=plan.sessions.map(s=>map.has(s.childId)?{...s,childId:map.get(s.childId)!}:s);
  const retained=oldChildren.filter(c=>!map.has(c.id)).map(c=>({...c,budget:0,extraBudget:0,archived:!sessions.some(s=>s.childId===c.id)}));
  const template=data.tasks.find(t=>oldParents.has(t.id));
  const colorId=subject.colorId;
  const parents:Task[]=[['high','高优先级',51],['low','低优先级与综合训练',22]].map(([key,name,hours],i)=>({id:`plan-method-${key}`,subjectId:subject.id,name:`研究方法 · ${name}`,startDate:template?.startDate??'2026-10-20',endDate:template?.endDate??'2026-12-18',dailyHours:Number(hours)/50,method:'按章节时间预算推进；具体安排由周历决定。',colorId,order:(template?.order??0)+i,skipBreakdown:true}));
  const parentBudgets:Record<string,number>={...plan.parentBudgets};
  for(const id of oldParents){
    delete parentBudgets[id];
    if(retained.some(c=>c.parentId===id&&!c.archived))parentBudgets[id]=0;
  }
  parentBudgets['plan-method-high']=51;parentBudgets['plan-method-low']=22;
  const archivedParents=[...new Set([...plan.archivedParents,...oldParents])].filter(id=>!targetParents.has(id));
  return {...data,tasks:[...data.tasks.filter(t=>!targetParents.has(t.id)),...parents],taskPlan:{...plan,methodRevision:2,parentBudgets,archivedParents,children:[...plan.children.filter(c=>!oldParents.has(c.parentId)),...replacement,...retained],sessions}};
}
