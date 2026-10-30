import type { PlannerData } from './types';
import { calendarKey } from './dateUtils';

export type ActualModule={id:string;subjectId:string;name:string;daily:Record<string,number>;details:Record<string,string[]>};

/** Only persisted actual hours count, including archived children and legacy records. */
export function actualStudyModules(data:PlannerData,today=calendarKey()):ActualModule[]{
  const modules=new Map<string,ActualModule>();
  function add(id:string,subjectId:string,name:string,date:string,hours:number,detail:string){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>today||!Number.isFinite(hours)||hours<=0)return;
    const row=modules.get(id)??{id,subjectId,name,daily:{},details:{}};
    row.daily[date]=(row.daily[date]??0)+hours;
    row.details[date]=[...(row.details[date]??[]),`${detail} ${Number(hours.toFixed(2))}h`];
    modules.set(id,row);
  }
  for(const session of data.taskPlan?.sessions??[]){
    const child=data.taskPlan!.children.find(c=>c.id===session.childId);
    const parent=data.tasks.find(t=>t.id===child?.parentId);
    if(child&&parent)add(parent.id,parent.subjectId,parent.name,session.date,session.entry.actualHours??0,child.name);
  }
  for(const [date,plan] of Object.entries(data.dayPlans))for(const [taskId,entry] of Object.entries(plan)){
    const task=data.tasks.find(t=>t.id===taskId);
    if(task)add(`legacy-${taskId}`,task.subjectId,`${task.name}（原记录）`,date,entry.actualHours??0,entry.note||task.name);
  }
  return [...modules.values()];
}
