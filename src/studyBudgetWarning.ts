export class StudyBudgetWarning extends Error{
  childId:string;extraHours:number;budget:number;approvedExtra:number;poolHours:number;
  constructor(childId:string,extraHours:number,budget:number,approvedExtra:number,poolHours:number){
    super(`本次安排超出已确认预算 ${Number(extraHours.toFixed(2))}h，需要明确调配或追加。`);
    this.name='StudyBudgetWarning';this.childId=childId;this.extraHours=extraHours;this.budget=budget;this.approvedExtra=approvedExtra;this.poolHours=poolHours;
  }
}
