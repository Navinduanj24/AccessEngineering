import { useMemo, useState } from 'react';
import { BarChart3, CalendarDays, Check, Clock3, FileText, RefreshCw, SlidersHorizontal } from 'lucide-react';
import type { Customer, Delivery, OpsSettings, Project, ReportConfig, ReportFilters, ReportHistory, ReportSection, ReportType, Role, Truck } from '../data';
import './ops-modules.css';

type Props = {
  deliveries: Delivery[];
  projects: Project[];
  customers: Customer[];
  trucks: Truck[];
  settings: OpsSettings;
  reportHistory: ReportHistory[];
  role: Role;
  onGenerate: (config:ReportConfig) => boolean;
  onRegenerate: (report:ReportHistory) => void;
};
type ReportView = 'generate'|'templates'|'history';
type DatePreset = 'today'|'yesterday'|'last7'|'last30'|'last90'|'thisMonth'|'lastMonth'|'custom';
const reportTypes:ReportType[]=['Daily Operations Report','Weekly Performance Report','Monthly Management Report','Custom Report'];
const sectionLabels:Record<ReportSection,string>={
  executiveSummary:'Executive summary',kpiSummary:'KPI summary',deliveryPerformance:'Delivery performance',
  dailyTrend:'Daily trend',delayAnalysis:'Delay analysis',delayStageAnalysis:'Delay stage analysis',
  projectPerformance:'Project performance',fleetPerformance:'Fleet performance',timeOfDayAnalysis:'Time-of-day analysis',
  exceptions:'Exceptions & late deliveries',deliveryAppendix:'Delivery appendix',operationalObservations:'Operational observations',
};
const allSections=Object.keys(sectionLabels) as ReportSection[];
const templates:{name:string;type:ReportType;description:string}[]=[
  {name:'Dispatch closeout',type:'Daily Operations Report',description:'Shift-ready delivery count, milestones, exceptions and daily notes.'},
  {name:'Weekly service review',type:'Weekly Performance Report',description:'Week-over-week delivery performance, causes and project comparison.'},
  {name:'Management monthly',type:'Monthly Management Report',description:'A concise management view of operational KPIs, fleet and trends.'},
  {name:'Focused investigation',type:'Custom Report',description:'Choose the range, filters and evidence sections for a focused review.'},
];
const baseFilters=():ReportFilters=>({projectId:'',customerId:'',truckId:'',concreteGrade:'',deliveryStatus:'',delayStage:'',delayCategory:'',delayReason:''});
const pad=(n:number)=>String(n).padStart(2,'0');
const dateKey=(date:Date)=>`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
function rangeFor(preset:DatePreset) {
  const today=new Date(); today.setHours(0,0,0,0);
  if(preset==='yesterday'){const yesterday=new Date(today);yesterday.setDate(yesterday.getDate()-1);const key=dateKey(yesterday);return [key,key];}
  if(preset==='thisMonth'){const first=new Date(today.getFullYear(),today.getMonth(),1);return [dateKey(first),dateKey(today)];}
  if(preset==='lastMonth'){const first=new Date(today.getFullYear(),today.getMonth()-1,1);const last=new Date(today.getFullYear(),today.getMonth(),0);return [dateKey(first),dateKey(last)];}
  const days=preset==='last7'?6:preset==='last30'?29:preset==='last90'?89:0;
  const start=new Date(today);start.setDate(today.getDate()-days);
  return [dateKey(start),dateKey(today)];
}
function defaultSections(type:ReportType):ReportSection[] {
  if(type==='Daily Operations Report') return ['executiveSummary','kpiSummary','deliveryPerformance','exceptions','deliveryAppendix','operationalObservations'];
  if(type==='Weekly Performance Report') return ['executiveSummary','kpiSummary','dailyTrend','delayAnalysis','delayStageAnalysis','projectPerformance','exceptions'];
  if(type==='Monthly Management Report') return ['executiveSummary','kpiSummary','deliveryPerformance','dailyTrend','delayAnalysis','delayStageAnalysis','projectPerformance','fleetPerformance','timeOfDayAnalysis','exceptions','operationalObservations'];
  return ['executiveSummary','deliveryPerformance','delayAnalysis','projectPerformance','exceptions'];
}
const presets:{key:DatePreset;label:string}[]=[
  {key:'today',label:'Today'},{key:'yesterday',label:'Yesterday'},{key:'last7',label:'Last 7 days'},
  {key:'last30',label:'Last 30 days'},{key:'last90',label:'Last 90 days'},
  {key:'thisMonth',label:'This month'},{key:'lastMonth',label:'Last month'},{key:'custom',label:'Custom range'},
];
const typeDatePreset=(type:ReportType):DatePreset=>type==='Daily Operations Report'?'today':type==='Weekly Performance Report'?'last7':type==='Monthly Management Report'?'thisMonth':'last30';
function isDelayStage(d:Delivery,stage:string,siteThreshold:number) {
  const diff=(a:string,b:string)=>a&&b?(new Date(b).getTime()-new Date(a).getTime())/60000:null;
  const departure=diff(d.estimatedDeparture,d.actualDeparture);
  const wait=diff(d.siteArrival,d.unloadingStart);
  if(stage==='Plant') return departure!==null&&departure>0;
  if(stage==='Site') return wait!==null&&wait>siteThreshold;
  if(stage==='Transit') return !!d.actualDelivery&&!!d.estimatedDelivery&&new Date(d.actualDelivery)>new Date(d.estimatedDelivery);
  return !stage;
}
const dateLabel=(start:string,end:string)=>start&&end?start===end?new Date(`${start}T12:00:00`).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):`${new Date(`${start}T12:00:00`).toLocaleDateString(undefined,{day:'numeric',month:'short'})} – ${new Date(`${end}T12:00:00`).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}`:'Choose a date range';

export function ReportBuilderModule({deliveries,projects,customers,trucks,settings,reportHistory,role,onGenerate,onRegenerate}:Props) {
  const viewer=role==='Viewer';
  const canGenerate=role!=='Viewer';
  const [view,setView]=useState<ReportView>(viewer?'history':'generate');
  const [type,setType]=useState<ReportType>(role==='Plant Operator'?'Daily Operations Report':'Daily Operations Report');
  const [preset,setPreset]=useState<DatePreset>('today');
  const [startDate,setStartDate]=useState(()=>rangeFor('today')[0]);
  const [endDate,setEndDate]=useState(()=>rangeFor('today')[1]);
  const [filters,setFilters]=useState<ReportFilters>(baseFilters);
  const [sections,setSections]=useState<ReportSection[]>(()=>defaultSections('Daily Operations Report'));
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [historySearch,setHistorySearch]=useState('');

  const sectionSet=(nextType:ReportType) => setSections(defaultSections(nextType));
  const updateType=(nextType:ReportType) => {
    if(role==='Plant Operator'&&nextType!=='Daily Operations Report') return;
    setType(nextType);setPreset(typeDatePreset(nextType));
    const [start,end]=rangeFor(typeDatePreset(nextType));setStartDate(start);setEndDate(end);sectionSet(nextType);setMessage('');setError('');
  };
  const setPresetRange=(next:DatePreset) => {
    setPreset(next);
    if(next!=='custom'){const [start,end]=rangeFor(next);setStartDate(start);setEndDate(end);}
  };
  const matched=useMemo(()=>deliveries.filter(d=>{
    if(startDate&&d.date<startDate)return false;
    if(endDate&&d.date>endDate)return false;
    if(filters.projectId&&d.projectId!==filters.projectId)return false;
    if(filters.customerId&&d.customerId!==filters.customerId)return false;
    if(filters.truckId&&d.truckId!==filters.truckId)return false;
    if(filters.concreteGrade&&d.concreteGrade!==filters.concreteGrade)return false;
    if(filters.deliveryStatus&&d.status!==filters.deliveryStatus)return false;
    if(filters.delayStage&&!isDelayStage(d,filters.delayStage,settings.slightMax))return false;
    if(filters.delayCategory&&d.delayCategory!==filters.delayCategory)return false;
    if(filters.delayReason&&d.delayReason!==filters.delayReason)return false;
    return true;
  }),[deliveries,startDate,endDate,filters,settings.slightMax]);
  const activeFilters=useMemo(()=>{
    const values:[string,string][]=[
      ['Project',projects.find(x=>x.id===filters.projectId)?.name||''],
      ['Customer',customers.find(x=>x.id===filters.customerId)?.name||''],
      ['Mixer',trucks.find(x=>x.id===filters.truckId)?.mixerNumber||''],
      ['Grade',filters.concreteGrade],['Status',filters.deliveryStatus],['Delay stage',filters.delayStage],
      ['Delay category',filters.delayCategory],['Delay reason',filters.delayReason],
    ];
    return values.filter(([,value])=>Boolean(value));
  },[filters,projects,customers,trucks]);
  const estimatedPages=Math.max(1,Math.ceil((2+sections.length*0.72+(sections.includes('deliveryAppendix')?matched.length/24:0))/1));
  const filteredHistory=useMemo(()=>[...reportHistory].sort((a,b)=>b.generatedAt.localeCompare(a.generatedAt)).filter(report=>!historySearch||[report.name,report.type,report.generatedBy].join(' ').toLowerCase().includes(historySearch.toLowerCase())),[reportHistory,historySearch]);
  const setFilter=<K extends keyof ReportFilters>(key:K,value:ReportFilters[K])=>setFilters(old=>({...old,[key]:value}));
  const toggleSection=(section:ReportSection)=>setSections(old=>old.includes(section)?old.filter(item=>item!==section):[...old,section]);
  const useTemplate=(item:typeof templates[number])=>{
    if(role==='Plant Operator'&&item.type!=='Daily Operations Report')return;
    setType(item.type);const nextPreset=typeDatePreset(item.type);setPreset(nextPreset);const [start,end]=rangeFor(nextPreset);setStartDate(start);setEndDate(end);
    setFilters(baseFilters());setSections(defaultSections(item.type));setView('generate');setMessage(`${item.name} loaded. Review its range and filters before generating.`);setError('');
  };
  const generate=()=>{
    if(!canGenerate)return;
    if(role==='Plant Operator'&&type!=='Daily Operations Report'){setError('Plant Operator access is limited to Daily Operations Reports.');return;}
    if(!startDate||!endDate){setError('Choose a start and end date for this report.');return;}
    if(startDate>endDate){setError('The start date must be on or before the end date.');return;}
    if(!sections.length){setError('Select at least one report section.');return;}
    const config:ReportConfig={type,startDate,endDate,filters,sections};
    if(onGenerate(config)){setMessage('Report request accepted. It will appear under Generated Reports when ready.');setError('');}
    else setError('The report could not be generated. Review the selection and try again.');
  };
  const filterControl=(key:keyof ReportFilters,label:string,options:{value:string;label:string}[],testId:string)=><div className="ops-field" key={key}><label htmlFor={testId}>{label}</label><select className="ops-select" id={testId} data-testid={testId} value={filters[key]} onChange={event=>setFilter(key,event.target.value)}><option value="">All {label.toLowerCase()}s</option>{options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
  const displayFilter=(key:keyof ReportFilters,report:ReportHistory) => {
    const value=report.filters?.[key]||'';
    if(!value)return '';
    if(key==='projectId')return projects.find(x=>x.id===value)?.name||value;
    if(key==='customerId')return customers.find(x=>x.id===value)?.name||value;
    if(key==='truckId')return trucks.find(x=>x.id===value)?.mixerNumber||value;
    return value;
  };
  const navigation: [ReportView,string][]=[['generate','Generate Report'],['templates','Report Templates'],['history','Generated Reports']];
  return <main className="ops-module" data-testid="report-builder-module"><div className="ops-shell">
    <header className="ops-head"><div><div className="ops-eyebrow">Management reporting · {settings.plantName}</div><h1 className="ops-title">Report builder</h1><div className="ops-subtitle">Build a decision-ready view from dispatch records, with its date range, filters and evidence sections visible before generation.</div></div><div className="ops-head-meta"><span className="ops-status">{role}</span><span className="ops-kicker">{reportHistory.length} generated reports</span></div></header>
    <nav className="ops-tabs" aria-label="Report builder views">{navigation.filter(([key])=>!viewer||key==='history').map(([key,label])=><button key={key} className={`ops-tab ${view===key?'active':''}`} data-testid={`report-tab-${key}`} onClick={()=>setView(key)}>{label}{key==='history'&&<span className="ops-count">{reportHistory.length}</span>}</button>)}</nav>
    {view==='generate'&&<div className="ops-report-layout">
      <div style={{display:'grid',gap:14}}>
        <section className="ops-panel"><div className="ops-panel-head"><div><h2 className="ops-panel-title">Report shape</h2><div className="ops-panel-note">Type determines date defaults and a useful starting set of sections.</div></div><BarChart3 size={18} color="#176c68"/></div><div className="ops-panel-body"><div className="ops-field"><label htmlFor="report-type">Report type</label><select className="ops-select" id="report-type" data-testid="select-report-type" value={type} disabled={role==='Plant Operator'} onChange={event=>updateType(event.target.value as ReportType)}>{reportTypes.map(item=><option key={item} value={item} disabled={role==='Plant Operator'&&item!=='Daily Operations Report'}>{item}</option>)}</select>{role==='Plant Operator'&&<span className="ops-role-note">Plant Operator reports are limited to daily operations.</span>}</div>
          <div className="ops-section-label" style={{marginTop:17}}>Reporting dates</div><div className="ops-date-presets" role="group" aria-label="Date range presets">{presets.map(item=><button key={item.key} type="button" className={`ops-chip ${preset===item.key?'active':''}`} data-testid={`preset-${item.key}`} onClick={()=>setPresetRange(item.key)}>{item.label}</button>)}</div>
          {preset==='custom'&&<div className="ops-form-grid" style={{marginTop:13}}><div className="ops-field"><label htmlFor="report-start">From</label><input className="ops-input" id="report-start" data-testid="input-report-start" type="date" value={startDate} onChange={event=>setStartDate(event.target.value)}/></div><div className="ops-field"><label htmlFor="report-end">Through</label><input className="ops-input" id="report-end" data-testid="input-report-end" type="date" value={endDate} onChange={event=>setEndDate(event.target.value)}/></div></div>}
          {preset!=='custom'&&<div className="ops-muted" style={{marginTop:11}}><CalendarDays size={13} style={{verticalAlign:'-2px',marginRight:5}}/>{dateLabel(startDate,endDate)}</div>}
        </div></section>
        <section className="ops-panel"><div className="ops-panel-head"><div><h2 className="ops-panel-title">Record filters</h2><div className="ops-panel-note">Leave fields blank to include every matching value.</div></div><SlidersHorizontal size={17} color="#176c68"/></div><div className="ops-panel-body"><div className="ops-filter-grid">
          {filterControl('projectId','Project',projects.map(x=>({value:x.id,label:x.name})),'filter-project')}
          {filterControl('customerId','Customer',customers.map(x=>({value:x.id,label:x.name})),'filter-customer')}
          {filterControl('truckId','Mixer',trucks.map(x=>({value:x.id,label:`${x.mixerNumber} · ${x.registrationNumber}`})),'filter-truck')}
          {filterControl('concreteGrade','Concrete grade',[...new Set([...settings.concreteGrades,...deliveries.map(d=>d.concreteGrade)])].filter(Boolean).map(value=>({value,label:value})),'filter-grade')}
          {filterControl('deliveryStatus','Delivery status',[...new Set(deliveries.map(d=>d.status))].sort().map(value=>({value,label:value})),'filter-status')}
          {filterControl('delayStage','Delay stage',[{value:'Plant',label:'Plant / dispatch'},{value:'Transit',label:'Transit'},{value:'Site',label:'Site waiting'}],'filter-delay-stage')}
          {filterControl('delayCategory','Delay category',[...new Set(deliveries.map(d=>d.delayCategory).filter(Boolean))].sort().map(value=>({value,label:value})),'filter-delay-category')}
          {filterControl('delayReason','Delay reason',[...new Set([...settings.reasons.map(reason=>reason.name),...deliveries.map(d=>d.delayReason)].filter(Boolean))].sort().map(value=>({value,label:value})),'filter-delay-reason')}
        </div><div style={{display:'flex',justifyContent:'flex-end',marginTop:11}}><button className="ops-button ghost small" data-testid="button-clear-filters" onClick={()=>setFilters(baseFilters())}>Clear all filters</button></div></div></section>
        <section className="ops-panel"><div className="ops-panel-head"><div><h2 className="ops-panel-title">Report sections</h2><div className="ops-panel-note">Choose evidence to include. Defaults adjust by report type.</div></div><span className="ops-status">{sections.length} selected</span></div><div className="ops-panel-body"><div className="ops-check-grid">{allSections.map(section=><label className="ops-check" key={section}><input type="checkbox" data-testid={`section-${section}`} checked={sections.includes(section)} onChange={()=>toggleSection(section)}/><span>{sectionLabels[section]}</span></label>)}</div></div></section>
      </div>
      <aside className="ops-panel ops-preview" data-testid="report-preview"><div className="ops-preview-hero"><div className="ops-eyebrow">Live preview</div><strong>{type}</strong><span className="ops-muted">{dateLabel(startDate,endDate)}</span></div><div className="ops-panel-body">
        <div className="ops-preview-stat"><span>Matching records</span><strong className="ops-mono" data-testid="preview-record-count">{matched.length.toLocaleString()}</strong></div>
        <div className="ops-preview-stat"><span>Estimated pages</span><strong className="ops-mono" data-testid="preview-page-count">{estimatedPages}</strong></div>
        <div style={{marginTop:13}}><div className="ops-label">Active filters</div>{activeFilters.length?<div className="ops-section-list">{activeFilters.map(([label,value])=><div className="ops-section-item" key={label}><strong>{label}:</strong> {value}</div>)}</div>:<div className="ops-kicker" style={{marginTop:7}}>No additional filters</div>}</div>
        <div style={{marginTop:16}}><div className="ops-label">Included sections</div>{sections.length?<div className="ops-section-list">{allSections.filter(section=>sections.includes(section)).map(section=><div className="ops-section-item" key={section} data-testid={`preview-section-${section}`}>{sectionLabels[section]}</div>)}</div>:<div className="ops-kicker" style={{marginTop:7}}>Select at least one section</div>}</div>
        <div className="ops-notice" style={{marginTop:14}}>Preview count is calculated from current delivery records. PDF rendering is handled by the reporting service.</div>
        {error&&<div className="ops-error" role="alert" data-testid="report-error" style={{marginTop:12}}>{error}</div>}
        {message&&<div className="ops-success" role="status" data-testid="report-message" style={{marginTop:12}}>{message}</div>}
        <button className="ops-button primary" style={{width:'100%',marginTop:13}} disabled={!canGenerate||role==='Plant Operator'&&type!=='Daily Operations Report'} data-testid="button-generate-report" onClick={generate}><FileText size={15}/>Generate Report</button>
      </div></aside>
    </div>}
    {view==='templates'&&<section className="ops-panel"><div className="ops-panel-head"><div><h2 className="ops-panel-title">Report templates</h2><div className="ops-panel-note">Select a starting point; all dates, sections and filters remain editable before generating.</div></div><FileText size={18} color="#176c68"/></div><div className="ops-panel-body"><div className="ops-card-grid">{templates.map((item,index)=>{const disabled=role==='Plant Operator'&&item.type!=='Daily Operations Report';return <button type="button" className={`ops-template ${type===item.type?'selected':''}`} key={item.name} disabled={disabled} data-testid={`template-${index+1}`} onClick={()=>useTemplate(item)}><div className="ops-eyebrow">{item.type}</div><h3>{item.name}</h3><p>{item.description}</p><div className="ops-inline" style={{marginTop:12}}><span className="ops-kicker">Default sections: {defaultSections(item.type).length}</span><span className="ops-link">Use template →</span></div></button>;})}</div>{role==='Plant Operator'&&<div className="ops-notice" style={{marginTop:14}}>Only the daily operations template is available to Plant Operator accounts.</div>}</div></section>}
    {view==='history'&&<section className="ops-panel"><div className="ops-panel-head"><div><h2 className="ops-panel-title">Generated reports</h2><div className="ops-panel-note">Review saved report metadata and repeat a configuration when your role permits.</div></div><div className="ops-field"><label htmlFor="report-history-search" className="ops-kicker">Search history</label><input className="ops-input" id="report-history-search" data-testid="input-history-search" placeholder="Name, report type, author" value={historySearch} onChange={event=>setHistorySearch(event.target.value)}/></div></div>
      <div>{filteredHistory.map(report=>{const canRegenerate=!viewer&&(role!=='Plant Operator'||report.type==='Daily Operations Report');const reportFilters=(Object.keys(baseFilters()) as (keyof ReportFilters)[]).map(key=>displayFilter(key,report)).filter(Boolean);return <article className="ops-report-row" key={report.id} data-testid={`history-report-${report.id}`}><div><strong data-testid={`history-name-${report.id}`}>{report.name||report.type}</strong><div className="ops-kicker">{report.type}</div></div><div><div className="ops-mono">{dateLabel(report.startDate,report.endDate)}</div><div className="ops-kicker">{report.recordCount} matched records</div></div><div><div className="ops-kicker">Generated {report.generatedAt?new Date(report.generatedAt).toLocaleString(): 'date unavailable'}</div><div className="ops-kicker">By {report.generatedBy||'Unknown'} · {report.sections.length} sections</div></div><div className="ops-inline">{canRegenerate&&<button className="ops-button small" data-testid={`button-regenerate-${report.id}`} onClick={()=>{onRegenerate(report);setMessage(`${report.name||report.type} regeneration requested from saved metadata.`);}}><RefreshCw size={13}/>Regenerate</button>}</div><div className="ops-muted" style={{gridColumn:'1/-1',fontSize:11}}><strong>Filters:</strong> {reportFilters.length?reportFilters.join(' · '):'None'} <span style={{marginLeft:10}}><strong>Sections:</strong> {report.sections.map(sectionLabelsFor).join(' · ')}</span></div></article>;})}
        {!filteredHistory.length&&<div className="ops-empty"><strong>{reportHistory.length?'No reports match your search':'No reports generated yet'}</strong>{reportHistory.length?'Try a different search term.':'Generated reports will appear here with their source filters and date range.'}</div>}
      </div>
      {message&&<div className="ops-success" role="status" data-testid="history-message" style={{margin:14}}>{message}</div>}
      {viewer&&<div className="ops-notice" style={{margin:14}}>Viewer access allows inspection of generated report metadata only.</div>}
      {role==='Plant Operator'&&<div className="ops-notice" style={{margin:14}}>Plant Operator can regenerate daily reports only.</div>}
    </section>}
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginTop:15}}><span className="ops-kicker"><Clock3 size={12} style={{verticalAlign:'-2px',marginRight:4}}/>Report metadata is retained by the parent application · {settings.location}</span><span className="ops-kicker">{role==='Viewer'?'Read-only role':canGenerate?'Report generation enabled':'Report generation restricted'}</span></div>
  </div></main>;
}

function sectionLabelsFor(section:ReportSection) {
  return sectionLabels[section]||section;
}