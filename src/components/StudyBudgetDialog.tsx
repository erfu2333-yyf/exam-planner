import type { StudyBudgetWarning } from '../studyBudgetWarning';
import type { PlannerData } from '../types';
import { formatDuration } from '../dateUtils';
import { Button, Modal } from './ui';

export function StudyBudgetDialog({data,warning,onChoose,onClose}:{data:PlannerData;warning:StudyBudgetWarning;onChoose:(choice:'pool'|'extra')=>void;onClose:()=>void}){
  const child=data.taskPlan!.children.find(c=>c.id===warning.childId)!;
  return <Modal title="这次安排将超过任务预算" onClose={onClose} width={560}><div className="stack">
    <strong>{child.name}</strong>
    <p>原预算 {formatDuration(warning.budget)}{warning.approvedExtra>0?`，之前已确认追加 ${formatDuration(warning.approvedExtra)}`:''}。这次还需要 <strong>{formatDuration(warning.extraHours)}</strong>。</p>
    <p className="small muted">尚未保存本次超额操作。你可以撤销这次调整、从本组未分配时间调入，或明确追加本次所需时间。</p>
    <div className="row" style={{gap:8,flexWrap:'wrap'}}><Button onClick={onClose}>撤销本次调整</Button><Button disabled={warning.poolHours+.001<warning.extraHours} onClick={()=>onChoose('pool')}>从未分配预算调入</Button><Button variant="primary" onClick={()=>onChoose('extra')}>确认追加 {formatDuration(warning.extraHours)}</Button></div>
    <p className="small muted">组内可调入 {formatDuration(warning.poolHours)}。调入不增加总需求；追加会增加剩余需求，并回算总体日均。不会缩减其他任务，也不会自动反复追加。每天 12h、休息避让和锁定约束继续生效。</p>
  </div></Modal>;
}
