import { useState } from 'react';
import type { StudySession } from '../taskPlan';
import { Button } from './ui';

export function StudyRecordCorrection({session,onSave}:{session:StudySession;onSave:(id:string,hours:number)=>void}){
  const [value,setValue]=useState(String(Math.round((session.entry.actualHours??0)*60)));
  const [error,setError]=useState('');
  return <div className="row" style={{gap:6,flexWrap:'wrap'}}><span className="small">{session.date} · 原记录 {((session.entry.actualHours??0)*60).toFixed(0)} 分钟</span><input className="field" aria-label={`${session.date}实际用时分钟`} type="number" min={0} step={1} style={{width:100}} value={value} onChange={e=>setValue(e.target.value)}/><span className="small">分钟</span><Button small onClick={()=>{try{if(!value.trim()||!Number.isFinite(Number(value))||Number(value)<0)throw new Error('请输入非负分钟数。');onSave(session.id,Number(value)/60);setError('已更正');}catch(e){setError(e instanceof Error?e.message:String(e));}}}>保存实学并暂停计时</Button><span className="small" role="status">{error}</span></div>;
}
