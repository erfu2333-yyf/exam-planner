export type StudyDropTarget={date?:string;returned:boolean;hour?:number};
type PointerSource={button:number;clientX:number;clientY:number;pointerId:number;currentTarget:Element};
type Callbacks={onHover:(x:number,y:number,target:StudyDropTarget)=>void;onDrop:(target:StudyDropTarget)=>void;onEnd:(dragged:boolean)=>void};
type PointerEnvironment={events:Pick<Window,'addEventListener'|'removeEventListener'>;hitTest:(x:number,y:number)=>Element|null;requestFrame?:(callback:FrameRequestCallback)=>number;cancelFrame?:(id:number)=>void;scroll?:(x:number,y:number)=>void};

function scrollAtPoint(x:number,y:number){
  const element=document.elementFromPoint(x,y);
  const pane=element?.closest<HTMLElement>('.week-time-scroll,.week-h-scroll,.original-task-tree');
  if(pane){const r=pane.getBoundingClientRect(),edge=42;
    const dx=pane.scrollWidth>pane.clientWidth?(x>r.right-edge?16:x<r.left+edge?-16:0):0;
    const dy=pane.scrollHeight>pane.clientHeight?(y>r.bottom-edge?12:y<r.top+edge?-12:0):0;
    if(dx||dy)pane.scrollBy(dx,dy);
  }
  if(y>window.innerHeight-42)window.scrollBy(0,12);else if(y<42)window.scrollBy(0,-12);
}

/** Pointer capture keeps dragging inside the preview, without a native drag-and-drop session. */
export function beginStudyPointerDrag(source:PointerSource,callbacks:Callbacks,environment:PointerEnvironment={events:window,hitTest:(x,y)=>document.elementFromPoint(x,y),requestFrame:cb=>window.requestAnimationFrame(cb),cancelFrame:id=>window.cancelAnimationFrame(id),scroll:scrollAtPoint}){
  const {clientX:x,clientY:y,pointerId,currentTarget}=source;
  if(source.button!==0)return ()=>{};
  let dragged=false,ended=false,frame:number|undefined,lastX=x,lastY=y;
  const targetAt=(px:number,py:number):StudyDropTarget=>{
    const element=environment.hitTest(px,py)?.closest<HTMLElement>('[data-study-date],[data-study-return]');
    const scale=Number(element?.dataset.studyScale),start=Number(element?.dataset.studyStart);
    const hour=element&&scale>0&&Number.isFinite(start)?Math.max(7,Math.min(24-1/6,Math.round((start+(py-element.getBoundingClientRect().top)/scale)*6)/6)):undefined;
    return {date:element?.dataset.studyDate,returned:element?.dataset.studyReturn==='true',hour};
  };
  function cleanup(){
    if(ended)return;ended=true;
    if(frame!=null)environment.cancelFrame?.(frame);
    environment.events.removeEventListener('pointermove',move as EventListener);
    environment.events.removeEventListener('pointerup',up as EventListener);
    environment.events.removeEventListener('pointercancel',cancel as EventListener);
    environment.events.removeEventListener('blur',cleanup);
    environment.events.removeEventListener('keydown',key as EventListener);
    currentTarget.removeEventListener?.('lostpointercapture',cleanup);
    if(currentTarget.hasPointerCapture?.(pointerId))currentTarget.releasePointerCapture(pointerId);
    callbacks.onEnd(dragged);
  }
  function move(event:PointerEvent){
    if(event.pointerId!==pointerId)return;
    if(!dragged&&Math.hypot(event.clientX-x,event.clientY-y)<5)return;
    if(!dragged){dragged=true;try{currentTarget.setPointerCapture?.(pointerId);}catch{/* Window listeners provide fallback capture. */}if(environment.requestFrame)frame=environment.requestFrame(tick);}
    lastX=event.clientX;lastY=event.clientY;event.preventDefault();callbacks.onHover(lastX,lastY,targetAt(lastX,lastY));
  }
  function tick(){if(ended)return;environment.scroll?.(lastX,lastY);callbacks.onHover(lastX,lastY,targetAt(lastX,lastY));if(environment.requestFrame)frame=environment.requestFrame(tick);}
  function up(event:PointerEvent){
    if(event.pointerId!==pointerId)return;
    const target=targetAt(event.clientX,event.clientY);cleanup();if(dragged)callbacks.onDrop(target);
  }
  function cancel(event:PointerEvent){if(event.pointerId===pointerId)cleanup();}
  function key(event:KeyboardEvent){if(event.key==='Escape'){event.preventDefault();cleanup();}}
  environment.events.addEventListener('pointermove',move as EventListener,{passive:false});
  environment.events.addEventListener('pointerup',up as EventListener);
  environment.events.addEventListener('pointercancel',cancel as EventListener);
  environment.events.addEventListener('blur',cleanup);
  environment.events.addEventListener('keydown',key as EventListener);
  currentTarget.addEventListener?.('lostpointercapture',cleanup);
  return cleanup;
}
