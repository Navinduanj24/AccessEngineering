import { useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock3, FilePlus2, Plus, Save, Search, Trash2, Truck as TruckIcon } from 'lucide-react';
import type { Customer, Delivery, DeliveryStatus, OpsSettings, Project, Role, Truck } from '../data';
import './ops-modules.css';

type Props = {
  deliveries: Delivery[];
  drafts: Delivery[];
  projects: Project[];
  customers: Customer[];
  trucks: Truck[];
  settings: OpsSettings;
  role: Role;
  onSaveDraft: (record: Delivery, draftId?: string) => boolean;
  onSaveDelivery: (record: Delivery, draftId?: string) => boolean;
  onDeleteDraft: (draftId: string) => void;
  onRecordEvent: (recordId: string, field: 'loadingStart'|'loadingComplete'|'actualDeparture'|'siteArrival'|'unloadingStart'|'unloadingComplete'|'actualDelivery') => void;
  onOpenDelivery: (recordId: string) => void;
  onAddProject: (project: Project) => boolean;
  onGoToRegister: () => void;
};
type View = 'new'|'active'|'records'|'drafts'|'recent';
type Step = 0|1|2;

const statuses: DeliveryStatus[] = ['Scheduled','Loading','Ready','Departed','In Transit','At Site','Waiting','Unloading','Completed','Delayed','Cancelled'];
const stages: {key:'loadingStart'|'loadingComplete'|'actualDeparture'|'siteArrival'|'unloadingStart'|'unloadingComplete'|'actualDelivery'; label:string; event:string}[] = [
  {key:'loadingStart',label:'Loading started',event:'Start loading'},
  {key:'loadingComplete',label:'Loading completed',event:'Finish loading'},
  {key:'actualDeparture',label:'Truck departed',event:'Record departure'},
  {key:'siteArrival',label:'Arrived at site',event:'Record site arrival'},
  {key:'actualDelivery',label:'Delivery arrival confirmed',event:'Confirm delivery arrival'},
  {key:'unloadingStart',label:'Unloading started',event:'Start unloading'},
  {key:'unloadingComplete',label:'Unloading completed',event:'Finish unloading'},
];
const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
};
const blankRecord = (projects: Project[], trucks: Truck[], role: Role): Delivery => ({
  id:'', orderId:`ORD-${String(Date.now()).slice(-5)}`, date:localDate(), projectId:projects[0]?.id||'', customerId:projects[0]?.customerId||'',
  truckId:trucks.find(t=>t.status==='Available')?.id||trucks[0]?.id||'', concreteGrade:'Grade 25', quantity:6,
  estimatedDeparture:'', actualDeparture:'', estimatedDelivery:'', actualDelivery:'', loadingStart:'', loadingComplete:'',
  siteArrival:'', unloadingStart:'', unloadingComplete:'', status:'Scheduled', delayStage:'', delayCategory:'', delayReason:'', remarks:'',
  createdBy:role, createdAt:'', updatedAt:'',
});
const minutes = (start:string,end:string) => start&&end ? Math.round((new Date(end).getTime()-new Date(start).getTime())/60000) : null;
const fmtTime = (value:string) => value ? new Date(value).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
const fmtDuration = (value:number|null) => value===null ? 'Not recorded' : value<0 ? 'Timestamp order issue' : `${value} min`;
function deriveStatus(record:Delivery):DeliveryStatus {
  if(record.status==='Cancelled') return 'Cancelled';
  if(record.unloadingComplete) return 'Completed';
  if(record.unloadingStart) return 'Unloading';
  if(record.siteArrival||record.actualDelivery) return 'At Site';
  if(record.actualDeparture) return 'In Transit';
  if(record.loadingComplete) return 'Ready';
  if(record.loadingStart) return 'Loading';
  if(record.estimatedDelivery&&new Date(record.estimatedDelivery).getTime()<Date.now()) return 'Delayed';
  return record.status==='Delayed'?'Scheduled':record.status;
}

export function DataInputModule(props:Props) {
  const {deliveries,drafts,projects,customers,trucks,settings,role,onSaveDraft,onSaveDelivery,onDeleteDraft,onRecordEvent,onOpenDelivery,onAddProject,onGoToRegister} = props;
  const writable = role !== 'Viewer';
  const mayAddProject = role === 'Administrator' || role === 'Operations Manager';
  const [view,setView] = useState<View>('new');
  const [step,setStep] = useState<Step>(0);
  const [quickEntry,setQuickEntry] = useState(false);
  const [form,setForm] = useState<Delivery>(()=>blankRecord(projects,trucks,role));
  const [editingId,setEditingId] = useState('');
  const [draftId,setDraftId] = useState('');
  const [errors,setErrors] = useState<string[]>([]);
  const [message,setMessage] = useState('');
  const [query,setQuery] = useState('');
  const [statusFilter,setStatusFilter] = useState('All statuses');
  const [projectModal,setProjectModal] = useState(false);
  const [projectForm,setProjectForm] = useState({name:'',customerId:customers[0]?.id||'',location:''});

  const customerName = (id:string) => customers.find(c=>c.id===id)?.name||'Unassigned customer';
  const projectName = (id:string) => projects.find(p=>p.id===id)?.name||'Unassigned project';
  const truckName = (id:string) => trucks.find(t=>t.id===id)?.mixerNumber||id||'No mixer';
  const setField = <K extends keyof Delivery>(key:K,value:Delivery[K]) => setForm(old=>({...old,[key]:value}));
  const beginNew = () => {
    setForm(blankRecord(projects,trucks,role)); setEditingId(''); setDraftId(''); setStep(0); setQuickEntry(false); setErrors([]); setMessage(''); setView('new');
  };
  const openForEdit = (record:Delivery,isDraft=false) => {
    setForm({...record}); setEditingId(isDraft?'':record.id); setDraftId(isDraft?record.id:''); setStep(0); setErrors([]); setMessage(''); setView('new');
  };
  const setProject = (projectId:string) => {
    const project=projects.find(p=>p.id===projectId);
    setForm(old=>({...old,projectId,customerId:project?.customerId||old.customerId}));
  };
  const validate = (forDelivery=true) => {
    const issues:string[]=[];
    if (forDelivery&&!form.orderId.trim()) issues.push('Enter an order ID so dispatch can trace this delivery.');
    if (forDelivery&&!form.projectId) issues.push('Choose a project.');
    if (forDelivery&&!form.customerId) issues.push('Choose a customer.');
    if (forDelivery&&!form.truckId) issues.push('Assign a mixer truck.');
    if (forDelivery&&!form.concreteGrade.trim()) issues.push('Enter the concrete grade.');
    if (forDelivery&&(!Number.isFinite(Number(form.quantity)) || Number(form.quantity)<=0)) issues.push('Quantity must be greater than zero.');
    const duplicate=form.orderId.trim()&&(deliveries.find(d=>d.orderId.trim().toLowerCase()===form.orderId.trim().toLowerCase()&&d.id!==form.id)
      ||drafts.find(d=>d.orderId.trim().toLowerCase()===form.orderId.trim().toLowerCase()&&d.id!==draftId&&d.id!==form.id));
    if (duplicate) issues.push(`Order ID ${form.orderId} is already used by delivery ${duplicate.id}.`);
    const chronological=[['Loading started',form.loadingStart],['Loading completed',form.loadingComplete],['Actual departure',form.actualDeparture],['Site arrival',form.siteArrival],['Delivery arrival confirmed',form.actualDelivery],['Unloading started',form.unloadingStart],['Unloading completed',form.unloadingComplete]] as [string,string][];
    let prior:{label:string;time:number}|undefined;
    for (const [label,value] of chronological) {
      if (!value) continue;
      const time=new Date(value).getTime();
      if (!Number.isFinite(time)) issues.push(`${label} is not a valid date and time.`);
      else if (prior&&time<prior.time) issues.push(`${label} must be at or after ${prior.label.toLowerCase()}.`);
      else prior={label,time};
    }
    for (const [label,value] of [['Estimated departure',form.estimatedDeparture],['Estimated delivery',form.estimatedDelivery]] as [string,string][]) {
      if (value&&!Number.isFinite(new Date(value).getTime())) issues.push(`${label} is not a valid date and time.`);
    }
    if (form.estimatedDeparture&&form.estimatedDelivery&&new Date(form.estimatedDelivery)<new Date(form.estimatedDeparture)) issues.push('Estimated delivery must be after estimated departure.');
    return issues;
  };
  const submitRecord = (asDraft:boolean) => {
    if (!writable) return;
    const validation=validate(!asDraft);
    if (validation.length) { setErrors(validation); setStep(0); return; }
    const id=form.id||draftId||editingId||(asDraft?`DRF-${Date.now()}`:`DEL-${Date.now()}`);
    const record:Delivery={...form,id,status:deriveStatus(form),createdAt:form.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),createdBy:form.createdBy||role};
    const ok=asDraft?onSaveDraft(record,draftId||undefined):onSaveDelivery(record,draftId||undefined);
    if (!ok) { setErrors(['This record could not be saved. Check the order ID and record details, then try again.']); return; }
    setErrors([]); setMessage(asDraft?'Draft saved for later.':editingId?'Delivery changes saved.':'Delivery added to the register.');
    if (!asDraft) { setView('recent'); setDraftId(''); setEditingId(''); }
    else { setDraftId(id); setForm(record); }
  };
  const activeDeliveries=useMemo(()=>deliveries.filter(d=>!['Completed','Cancelled'].includes(deriveStatus(d))).filter(d=>statusFilter==='All statuses'||deriveStatus(d)===statusFilter).filter(d=>!query||[d.orderId,projectName(d.projectId),customerName(d.customerId),truckName(d.truckId)].join(' ').toLowerCase().includes(query.toLowerCase())),[deliveries,query,statusFilter,projects,customers,trucks]);
  const recordRows=useMemo(()=>deliveries.filter(d=>!query||[d.orderId,projectName(d.projectId),customerName(d.customerId),truckName(d.truckId)].join(' ').toLowerCase().includes(query.toLowerCase())),[deliveries,query,projects,customers,trucks]);
  const recentRows=[...deliveries].sort((a,b)=>(b.updatedAt||b.createdAt).localeCompare(a.updatedAt||a.createdAt)).slice(0,12);
  const inferredDelay=useMemo(()=>{
    const load=minutes(form.estimatedDeparture,form.actualDeparture);
    const site=minutes(form.siteArrival,form.unloadingStart);
    const transit=minutes(form.estimatedDeparture,form.siteArrival);
    if (load!==null&&load>0) return {name:'Plant dispatch / loading',detail:`Departure was ${load} min after the planned departure.`};
    if (site!==null&&site>settings.slightMax) return {name:'Site waiting',detail:`Truck waited ${site} min before unloading started.`};
    if (transit!==null&&form.estimatedDelivery&&minutes(form.estimatedDelivery,form.actualDelivery)!==null&&Number(minutes(form.estimatedDelivery,form.actualDelivery))>0) return {name:'Transit',detail:`Arrival variance is ${minutes(form.estimatedDelivery,form.actualDelivery)} min.`};
    return {name:'Not enough event data',detail:'Record more milestones to suggest a delay stage.'};
  },[form,settings.slightMax]);
  const variance=minutes(form.estimatedDelivery,form.actualDelivery);
  const stageDurations:[string,number|null][]=[
    ['Plant loading',minutes(form.loadingStart,form.loadingComplete)],
    ['Transit to site',minutes(form.actualDeparture,form.siteArrival)],
    ['Site waiting',minutes(form.siteArrival,form.unloadingStart)],
    ['Unloading',minutes(form.unloadingStart,form.unloadingComplete)],
  ];
  const navItems:[View,string,number][]=[['new','New delivery',0],['active','Active deliveries',activeDeliveries.length],['records','Delivery records',deliveries.length],['drafts','Drafts',drafts.length],['recent','Recently added',recentRows.length]];
  const projectSubmit=(event:FormEvent) => {
    event.preventDefault();
    if (!mayAddProject||!projectForm.name.trim()||!projectForm.customerId) return;
    const newProject:Project={id:`PRJ-${Date.now()}`,name:projectForm.name.trim(),customerId:projectForm.customerId,location:projectForm.location.trim(),status:'Active'};
    if (onAddProject(newProject)) { setProjectModal(false);setProjectForm({name:'',customerId:customers[0]?.id||'',location:''});setProject(newProject.id);setMessage('Project created and selected.'); }
    else setErrors(['Project could not be created. A project with this name may already exist.']);
  };
  const deliveryTable=(rows:Delivery[],draft=false) => <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Order / date</th><th>Project</th><th>Truck</th><th>Grade · qty</th><th>Schedule / delivery</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map(d=>{const recordStatus=deriveStatus(d);return <tr key={d.id} data-testid={`row-delivery-${d.id}`}><td><button className="ops-link" data-testid={`button-open-${d.id}`} onClick={()=>draft?openForEdit(d,true):onOpenDelivery(d.id)}>{d.orderId||'Untitled draft'}</button><div className="ops-kicker">{d.date||'Date not set'}</div></td><td>{projectName(d.projectId)}<div className="ops-kicker">{customerName(d.customerId)}</div></td><td className="ops-mono">{truckName(d.truckId)}</td><td>{d.concreteGrade}<div className="ops-kicker">{d.quantity} m³</div></td><td className="ops-mono">{fmtTime(d.actualDelivery||d.estimatedDelivery||d.estimatedDeparture)}</td><td><span className={`ops-status ${recordStatus==='Delayed'?'warn':recordStatus==='Cancelled'?'neutral':''}`} data-testid={`status-${d.id}`}>{recordStatus}</span></td><td><div className="ops-inline">{draft?<><button className="ops-button small" disabled={!writable} data-testid={`button-resume-draft-${d.id}`} onClick={()=>openForEdit(d,true)}>Resume</button><button className="ops-button small danger" disabled={!writable} data-testid={`button-delete-draft-${d.id}`} onClick={()=>{if(window.confirm(`Delete draft ${d.orderId||'without an order ID'}?`)){onDeleteDraft(d.id);setMessage('Draft deleted.');}}}><Trash2 size={13}/>Delete</button></>:<button className="ops-button small" data-testid={`button-edit-${d.id}`} onClick={()=>openForEdit(d)}>Edit</button>}</div></td></tr>;})}</tbody></table>{!rows.length&&<div className="ops-empty"><strong>{draft?'No saved drafts':'No matching delivery records'}</strong>{draft?'Save an in-progress order as a draft and return to it here.':'Try another search or create a new delivery.'}</div>}</div>;
  const renderWizard=()=>{
    const wizardSteps=['Order details','Schedule & milestones','Review & save'];
    return <div className="ops-panel">
      <div className="ops-panel-head"><div><h2 className="ops-panel-title">{editingId?'Edit delivery record':draftId?'Resume delivery draft':'Create delivery record'}</h2><div className="ops-panel-note">Capture what dispatch knows now; timestamps remain in the local plant time shown by your browser.</div></div><div className="ops-inline">{!editingId&&<label className="ops-checkline"><input type="checkbox" checked={quickEntry} onChange={e=>setQuickEntry(e.target.checked)} data-testid="toggle-quick-entry"/>Quick entry</label>}{editingId&&<button className="ops-button small" data-testid="button-open-register" onClick={onGoToRegister}><TruckIcon size={14}/>Register</button>}</div></div>
      <div className="ops-panel-body">
        {!quickEntry&&<div className="ops-stepper" aria-label="Delivery entry steps">{wizardSteps.map((label,index)=><div key={label} className={`ops-step ${step===index?'current':''} ${step>index?'done':''}`}><span className="ops-step-num">{step>index?'✓':index+1}</span><span>{label}</span></div>)}</div>}
        {errors.length>0&&<div className="ops-error" role="alert" data-testid="validation-errors"><strong>Please correct these details:</strong><ul style={{margin:'6px 0 0',paddingLeft:19}}>{errors.map((error,index)=><li key={`${index}-${error}`}>{error}</li>)}</ul></div>}
        {message&&<div className="ops-success" role="status" data-testid="save-message">{message}</div>}
        {(quickEntry||step===0)&&<div className="ops-form-grid">
          <div className="ops-section-label">Dispatch identity</div>
          <div className="ops-field"><label htmlFor="data-order">Order ID</label><input className="ops-input" id="data-order" data-testid="input-order-id" value={form.orderId} onChange={e=>setField('orderId',e.target.value)} placeholder="e.g. ORD-10542" disabled={!writable}/></div>
          <div className="ops-field"><label htmlFor="data-date">Delivery date</label><input className="ops-input" type="date" id="data-date" data-testid="input-delivery-date" value={form.date} onChange={e=>setField('date',e.target.value)} disabled={!writable}/></div>
          <div className="ops-field"><label htmlFor="data-project">Project</label><div className="ops-inline"><select className="ops-select" id="data-project" data-testid="select-project" value={form.projectId} onChange={e=>setProject(e.target.value)} disabled={!writable}><option value="">Choose project</option>{projects.map(project=><option key={project.id} value={project.id}>{project.name}</option>)}</select>{mayAddProject&&<button className="ops-button small" type="button" data-testid="button-add-project" onClick={()=>setProjectModal(true)}><Plus size={13}/>New</button>}</div></div>
          <div className="ops-field"><label htmlFor="data-customer">Customer</label><select className="ops-select" id="data-customer" data-testid="select-customer" value={form.customerId} onChange={e=>setField('customerId',e.target.value)} disabled={!writable}><option value="">Choose customer</option>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div>
          <div className="ops-field"><label htmlFor="data-truck">Mixer truck</label><select className="ops-select" id="data-truck" data-testid="select-truck" value={form.truckId} onChange={e=>setField('truckId',e.target.value)} disabled={!writable}><option value="">Choose mixer</option>{trucks.map(truck=><option key={truck.id} value={truck.id}>{truck.mixerNumber} · {truck.registrationNumber} · {truck.status}</option>)}</select></div>
          <div className="ops-field"><label htmlFor="data-grade">Concrete grade</label><select className="ops-select" id="data-grade" data-testid="select-grade" value={form.concreteGrade} onChange={e=>setField('concreteGrade',e.target.value)} disabled={!writable}>{[...new Set([form.concreteGrade,...settings.concreteGrades])].filter(Boolean).map(grade=><option key={grade}>{grade}</option>)}</select></div>
          <div className="ops-field"><label htmlFor="data-quantity">Quantity (m³)</label><input className="ops-input" id="data-quantity" data-testid="input-quantity" type="number" min="0.1" step="0.1" value={form.quantity} onChange={e=>setField('quantity',Number(e.target.value))} disabled={!writable}/></div>
          {quickEntry&&<><div className="ops-field"><label htmlFor="data-status">Current status</label><select className="ops-select" id="data-status" data-testid="select-status" value={form.status} onChange={e=>setField('status',e.target.value as DeliveryStatus)} disabled={!writable}>{statuses.map(status=><option key={status}>{status}</option>)}</select></div><div className="ops-field ops-span-2"><label htmlFor="data-remarks">Dispatch notes</label><textarea className="ops-textarea" id="data-remarks" data-testid="input-remarks" value={form.remarks} onChange={e=>setField('remarks',e.target.value)} disabled={!writable}/></div></>}
        </div>}
        {(quickEntry||step===1)&&<div className="ops-form-grid" style={{marginTop:quickEntry?20:0}}>
          <div className="ops-section-label">Planned times and operational milestones</div>
          {([['estimatedDeparture','Planned departure'],['estimatedDelivery','Estimated arrival'],['loadingStart','Loading started'],['loadingComplete','Loading completed'],['actualDeparture','Actual departure'],['siteArrival','Site arrival'],['unloadingStart','Unloading started'],['unloadingComplete','Unloading completed'],['actualDelivery','Delivery confirmed']] as [keyof Delivery,string][]).map(([key,label])=><div className="ops-field" key={key}><label htmlFor={`data-${key}`}>{label}</label><input className="ops-input" id={`data-${key}`} data-testid={`input-${key}`} type="datetime-local" value={String(form[key]||'').slice(0,16)} onChange={e=>setField(key,e.target.value as never)} disabled={!writable}/></div>)}
          <div className="ops-field"><label htmlFor="data-delay-stage">Confirmed delay stage</label><select className="ops-select" id="data-delay-stage" data-testid="select-delay-stage" value={form.delayStage} onChange={e=>setField('delayStage',e.target.value)} disabled={!writable}><option value="">Not confirmed</option><option value="Plant">Plant / dispatch</option><option value="Transit">Transit</option><option value="Site">Site waiting</option></select></div>
          <div className="ops-field"><label htmlFor="data-category">Confirmed delay category</label><select className="ops-select" id="data-category" data-testid="select-delay-category" value={form.delayCategory} onChange={e=>setField('delayCategory',e.target.value)} disabled={!writable}><option value="">Not confirmed</option>{[...new Set(settings.reasons.map(reason=>reason.category))].map(category=><option key={category}>{category}</option>)}</select></div>
          <div className="ops-field"><label htmlFor="data-reason">Confirmed delay reason</label><select className="ops-select" id="data-reason" data-testid="select-delay-reason" value={form.delayReason} onChange={e=>setField('delayReason',e.target.value)} disabled={!writable}><option value="">Not confirmed</option>{settings.reasons.filter(reason=>reason.active).map(reason=><option key={reason.id} value={reason.name}>{reason.name} · {reason.stage}</option>)}</select></div>
          <div className="ops-field ops-span-2"><label htmlFor="data-notes">Operational notes</label><textarea className="ops-textarea" id="data-notes" data-testid="input-operational-notes" value={form.remarks} onChange={e=>setField('remarks',e.target.value)} disabled={!writable} placeholder="Factual dispatch notes, site constraints, or handover detail"/></div>
        </div>}
        {(quickEntry||step===2)&&<div style={{marginTop:quickEntry?20:0}}>
          <div className="ops-section-label" style={{marginTop:0}}>Review this record</div>
          <div className="ops-summary-grid">
            {[
              ['Order',form.orderId||'Order ID missing'],['Project',projectName(form.projectId)],['Customer',customerName(form.customerId)],
              ['Mixer / volume',`${truckName(form.truckId)} · ${form.quantity||0} m³`],['Dispatch status',deriveStatus(form)],['Schedule variance',variance===null?'Awaiting actual delivery':`${variance>0?'+':''}${variance} min`],
            ].map(([label,value])=><div className="ops-summary" key={label}><div className="ops-summary-label">{label}</div><div className="ops-summary-value" data-testid={`review-${label.toLowerCase().replaceAll(/[^a-z]+/g,'-')}`}>{value}</div></div>)}
          </div>
          <div className="ops-split" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginTop:13}}>
            <div className="ops-panel" style={{boxShadow:'none'}}><div className="ops-panel-body"><div className="ops-label">Calculated stage durations</div>{stageDurations.map(([label,duration])=><div className="ops-preview-stat" key={label}><span>{label}</span><strong className="ops-mono">{fmtDuration(duration)}</strong></div>)}</div></div>
            <div className="ops-panel" style={{boxShadow:'none'}}><div className="ops-panel-body"><div className="ops-label">Delay stage assessment</div><div style={{marginTop:11}}><span className="ops-status warn">Suggested · {inferredDelay.name}</span><p className="ops-muted" style={{lineHeight:1.5}}>{inferredDelay.detail}</p></div><div style={{marginTop:12}}><span className={`ops-status ${form.delayStage?'':'neutral'}`}>Confirmed · {form.delayStage||'Not confirmed'}</span><p className="ops-muted" style={{lineHeight:1.5}}>{form.delayCategory||form.delayReason||'No operator-confirmed cause has been recorded.'}</p></div></div></div>
          </div>
          <div className="ops-notice" style={{marginTop:12}}>Suggested stage is calculated from entered timestamps; it is not a confirmed cause. Keep the original ISO local date-time values unchanged when reviewing.</div>
        </div>}
        <div className="ops-actions"><div className="ops-muted">{role==='Viewer'?'Viewer access is read-only.':editingId?'Editing an existing register record.':'Unsaved changes remain here until saved.'}</div><div className="ops-actions-right">
          {view!=='new'&&<button className="ops-button" data-testid="button-cancel-entry" onClick={()=>setView('records')}>Close</button>}
          {!quickEntry&&step>0&&<button className="ops-button" disabled={!writable} data-testid="button-previous-step" onClick={()=>{setStep((step-1) as Step);setErrors([]);}}><ArrowLeft size={14}/>Previous</button>}
          {!quickEntry&&step<2&&<button className="ops-button primary" disabled={!writable} data-testid="button-next-step" onClick={()=>{const issues=validate();if(step===0&&issues.length){setErrors(issues);return;}setErrors([]);setStep((step+1) as Step);}}>{step===1?'Review':'Continue'}<ArrowRight size={14}/></button>}
          {writable&&<><button className="ops-button" data-testid="button-save-draft" onClick={()=>submitRecord(true)}><Save size={14}/>Save draft</button><button className="ops-button primary" data-testid="button-save-delivery" onClick={()=>quickEntry||step===2?submitRecord(false):(setErrors([]),setStep((step+1) as Step))}><Check size={14}/>{editingId?'Save changes':'Save delivery'}</button></>}
        </div></div>
      </div>
    </div>;
  };
  return <main className="ops-module" data-testid="data-input-module"><div className="ops-shell">
    <header className="ops-head"><div><div className="ops-eyebrow">Dispatch desk · {settings.plantName}</div><h1 className="ops-title">Delivery data input</h1><div className="ops-subtitle">A traceable dispatch record starts with a clean order and accurate event times. Events are operator-entered; no location tracking is used.</div></div><div className="ops-head-meta"><span className="ops-status">{role}</span><span className="ops-kicker">{deliveries.length} records · {drafts.length} drafts</span></div></header>
    <nav className="ops-tabs" aria-label="Delivery data views">{navItems.map(([key,label,count])=><button key={key} className={`ops-tab ${view===key?'active':''}`} data-testid={`tab-${key}`} onClick={()=>key==='new'?beginNew():setView(key)}>{label}<span className="ops-count">{count}</span></button>)}</nav>
    {view==='new'&&renderWizard()}
    {view==='active'&&<section className="ops-panel"><div className="ops-panel-head"><div><h2 className="ops-panel-title">Active dispatch board</h2><div className="ops-panel-note">Update each milestone as it is confirmed by plant or site staff. Timestamps use the device's current local time.</div></div><div className="ops-inline"><div className="ops-field"><label className="ops-kicker" htmlFor="active-status">Status</label><select className="ops-select" id="active-status" data-testid="filter-active-status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option>All statuses</option>{statuses.map(s=><option key={s}>{s}</option>)}</select></div><button className="ops-button small" data-testid="button-new-from-active" onClick={beginNew} disabled={!writable}><Plus size={13}/>New delivery</button></div></div>
      <div className="ops-table-wrap"><table className="ops-table"><thead><tr><th>Order / project</th><th>Truck</th><th>Current status</th><th>Elapsed stages / ETA variance</th><th>Record next event</th></tr></thead><tbody>{activeDeliveries.map(d=>{const firstMissing=stages.findIndex(stage=>!d[stage.key]);const status=deriveStatus(d);const delay=minutes(d.estimatedDelivery,d.actualDelivery||new Date().toISOString());return <tr key={d.id} data-testid={`active-delivery-${d.id}`}><td><button className="ops-link" data-testid={`open-active-${d.id}`} onClick={()=>onOpenDelivery(d.id)}>{d.orderId}</button><div className="ops-kicker">{projectName(d.projectId)} · {customerName(d.customerId)}</div></td><td className="ops-mono">{truckName(d.truckId)}</td><td><span className={`ops-status ${status==='Delayed'?'warn':''}`}>{status}</span></td><td><span className="ops-mono">{minutes(d.loadingStart,d.loadingComplete)===null?'Load —':`${minutes(d.loadingStart,d.loadingComplete)}m load`}</span><div className="ops-kicker">ETA {fmtTime(d.estimatedDelivery)} · {delay===null?'variance —':`${delay>0?'+':''}${delay} min`}</div></td><td><div className="ops-inline">{stages.map((stage,index)=>{const done=!!d[stage.key];const eligible=index===firstMissing;return <button key={stage.key} className={`ops-button small ${eligible?'primary':''}`} title={`${stage.label}${done?` recorded ${fmtTime(d[stage.key])}`:''}`} disabled={!writable||done||!eligible} data-testid={`event-${stage.key}-${d.id}`} onClick={()=>{if(writable&&eligible){onRecordEvent(d.id,stage.key);setMessage(`${stage.label} recorded for ${d.orderId}.`);}}}>{done?<Check size={12}/>:<Clock3 size={12}/>}<span>{stage.label}</span></button>;})}</div></td></tr>;})}</tbody></table>{!activeDeliveries.length&&<div className="ops-empty"><strong>Dispatch board is clear</strong>No active records match the current filter.</div>}</div>
    </section>}
    {view==='records'&&<section className="ops-panel"><div className="ops-panel-head"><div><h2 className="ops-panel-title">Delivery records</h2><div className="ops-panel-note">Search and edit saved records without losing the timestamp trail.</div></div><div className="ops-inline"><label className="ops-inline" htmlFor="records-search"><Search size={14}/><input className="ops-input" id="records-search" data-testid="input-record-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search order, project, mixer"/></label><button className="ops-button primary" disabled={!writable} data-testid="button-new-record" onClick={beginNew}><FilePlus2 size={14}/>New delivery</button></div></div>{deliveryTable(recordRows)}</section>}
    {view==='drafts'&&<section className="ops-panel"><div className="ops-panel-head"><div><h2 className="ops-panel-title">Saved drafts</h2><div className="ops-panel-note">Drafts are parent-managed records; resume editing or remove a draft from the list.</div></div><button className="ops-button primary" disabled={!writable} data-testid="button-new-draft" onClick={beginNew}><Plus size={14}/>Start draft</button></div>{deliveryTable(drafts,true)}</section>}
    {view==='recent'&&<section className="ops-panel"><div className="ops-panel-head"><div><h2 className="ops-panel-title">Recently added</h2><div className="ops-panel-note">Latest records by last updated timestamp.</div></div><button className="ops-button primary" disabled={!writable} data-testid="button-add-another" onClick={beginNew}><Plus size={14}/>Add another delivery</button></div>{deliveryTable(recentRows)}</section>}
    {projectModal&&<div className="ops-modal-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target)setProjectModal(false);}}><section className="ops-modal" role="dialog" aria-modal="true" aria-labelledby="new-project-heading"><div className="ops-modal-head"><div><div className="ops-eyebrow">Project register</div><h2 id="new-project-heading" className="ops-panel-title" style={{marginTop:5}}>Add a project</h2></div><button className="ops-button small" data-testid="button-close-project-modal" onClick={()=>setProjectModal(false)}>Close</button></div><form className="ops-modal-body" onSubmit={projectSubmit}><div className="ops-form-grid"><div className="ops-field ops-span-2"><label htmlFor="project-name">Project name</label><input className="ops-input" id="project-name" data-testid="input-project-name" value={projectForm.name} onChange={e=>setProjectForm({...projectForm,name:e.target.value})} required/></div><div className="ops-field ops-span-2"><label htmlFor="project-customer">Customer</label><select className="ops-select" id="project-customer" data-testid="select-project-customer" value={projectForm.customerId} onChange={e=>setProjectForm({...projectForm,customerId:e.target.value})}>{customers.map(customer=><option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></div><div className="ops-field ops-span-2"><label htmlFor="project-location">Site / location</label><input className="ops-input" id="project-location" data-testid="input-project-location" value={projectForm.location} onChange={e=>setProjectForm({...projectForm,location:e.target.value})}/></div></div><div className="ops-actions"><span className="ops-role-note">Available to Administrator and Operations Manager.</span><button className="ops-button primary" data-testid="button-save-project" type="submit"><Check size={14}/>Create project</button></div></form></section></div>}
    {message&&view!=='new'&&<div className="ops-success" role="status" data-testid="action-message" style={{marginTop:12}}>{message}</div>}
    {errors.length>0&&view!=='new'&&<div className="ops-error" role="alert" style={{marginTop:12}}>{errors.join(' ')}</div>}
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',marginTop:15}}><span className="ops-kicker">Event durations and schedule variance are calculated from saved timestamps · {settings.location}</span><button className="ops-button ghost small" data-testid="button-go-register" onClick={onGoToRegister}>Open full register <ArrowRight size={13}/></button></div>
  </div></main>;
}