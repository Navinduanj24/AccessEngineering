export type Role = 'Administrator' | 'Operations Manager' | 'Plant Operator' | 'Viewer';
export type DeliveryStatus = 'Scheduled' | 'Loading' | 'Ready' | 'Departed' | 'In Transit' | 'At Site' | 'Unloading' | 'Completed' | 'Delayed' | 'Cancelled';
export type Delivery = {
  id:string; orderId:string; date:string; projectId:string; customerId:string; truckId:string; concreteGrade:string; quantity:number;
  estimatedDeparture:string; actualDeparture:string; estimatedDelivery:string; actualDelivery:string; loadingStart:string; loadingComplete:string;
  siteArrival:string; unloadingStart:string; unloadingComplete:string; status:DeliveryStatus; delayCategory:string; delayReason:string;
  remarks:string; createdBy:string; createdAt:string; updatedAt:string;
};
export type Project={id:string;name:string;customerId:string;location:string;status:string};
export type Customer={id:string;name:string;contact:string;location:string};
export type Truck={id:string;registrationNumber:string;mixerNumber:string;capacity:number;status:string};
export type DelayReason={id:string;name:string;category:string;stage:string;active:boolean};
export type AuditLog={id:string;userId:string;action:string;entity:string;entityId:string;previousValue:string;newValue:string;timestamp:string};
export type OpsSettings={plantName:string;location:string;onTimeTarget:number;slightMax:number;delayedMax:number;severeMin:number;mediumRiskMinutes:number;criticalRiskMinutes:number;reasons:DelayReason[]};
export type Store={deliveries:Delivery[];projects:Project[];customers:Customer[];trucks:Truck[];audit:AuditLog[];settings:OpsSettings;role:Role;};
const KEY='concrete-ops-v1';
const customers:Customer[]=[
 {id:'CUS-01',name:'Sierra Civil Engineering',contact:'+94 11 276 4800',location:'Peliyagoda'},
 {id:'CUS-02',name:'Ceylon Urban Works',contact:'+94 11 294 6612',location:'Colombo 07'},
 {id:'CUS-03',name:'Meridian Infrastructure',contact:'+94 11 287 1034',location:'Wattala'},
 {id:'CUS-04',name:'Northline Construction',contact:'+94 11 291 5370',location:'Kelaniya'},
 {id:'CUS-05',name:'Harbourpoint Developments',contact:'+94 11 258 9011',location:'Colombo Port City'},
 {id:'CUS-06',name:'Lanka Roads Consortium',contact:'+94 11 282 1740',location:'Ja-Ela'}
];
const projects:Project[]=[
 {id:'PRJ-01',name:'Kelani River Bridge',customerId:'CUS-01',location:'Kelaniya',status:'Active'},
 {id:'PRJ-02',name:'Union Place Residences',customerId:'CUS-02',location:'Colombo 02',status:'Active'},
 {id:'PRJ-03',name:'Wattala Logistics Hub',customerId:'CUS-03',location:'Wattala',status:'Active'},
 {id:'PRJ-04',name:'New Kelani Highway',customerId:'CUS-06',location:'Peliyagoda',status:'Active'},
 {id:'PRJ-05',name:'Harbour Tower East',customerId:'CUS-05',location:'Colombo Port City',status:'Active'},
 {id:'PRJ-06',name:'Kiribathgoda Exchange',customerId:'CUS-04',location:'Kiribathgoda',status:'Active'},
 {id:'PRJ-07',name:'Orion Medical Centre',customerId:'CUS-02',location:'Colombo 05',status:'Active'}
];
const trucks:Truck[]=Array.from({length:12},(_,i)=>({id:`TRK-${String(i+1).padStart(2,'0')}`,registrationNumber:`WP ${String.fromCharCode(AB(i))} ${String(8140+i*37).padStart(4,'0')}`,mixerNumber:`MIX-${String(i+1).padStart(2,'0')}`,capacity:i%4===0?7:6,status:i===10?'Maintenance':'Available'}));
function AB(i:number){return 75+i%7;}
const reasons:DelayReason[]=[
 {id:'DR-01',name:'Peak-hour traffic',category:'Traffic',stage:'Transit',active:true},
 {id:'DR-02',name:'Batching queue',category:'Plant Loading / Batching',stage:'Plant',active:true},
 {id:'DR-03',name:'Mixer availability',category:'Truck Availability',stage:'Plant',active:true},
 {id:'DR-04',name:'Site pump not ready',category:'Site Waiting',stage:'Site',active:true},
 {id:'DR-05',name:'Restricted site access',category:'Route / Access Issue',stage:'Transit',active:true},
 {id:'DR-06',name:'Heavy rain',category:'Weather',stage:'Transit',active:true},
 {id:'DR-07',name:'Customer placement hold',category:'Customer / Site Delay',stage:'Site',active:true},
 {id:'DR-08',name:'Mechanical inspection',category:'Mechanical Issue',stage:'Transit',active:true},
 {id:'DR-09',name:'Dispatch paperwork',category:'Documentation / Dispatch',stage:'Plant',active:true},
 {id:'DR-10',name:'Other operational hold',category:'Other',stage:'Plant',active:true}
];
const dateTime=(date:string,mins:number)=>`${date}T${String(Math.floor(mins/60)%24).padStart(2,'0')}:${String(mins%60).padStart(2,'0')}:00`;
function makeDelivery(i:number,now:Date):Delivery{
 const daysAgo=i<6?0:(i*7)%48;
 const d=new Date(now); d.setDate(d.getDate()-daysAgo); d.setHours(0,0,0,0);
 const date=d.toISOString().slice(0,10);
 const project=projects[(i*5+Math.floor(i/6))%projects.length];
 const truck=trucks[(i*7+Math.floor(i/3))%trucks.length];
 const hour=(i%9===0?7:i%5===0?15:8+(i*3)%8);
 const schedule=hour*60+((i*13)%4)*15;
 const trafficPeak=hour>=7&&hour<=9;
 const reasonIdx=i%17===0?1:i%13===0?3:i%11===0?7:i%8===0?0:i%6===0?4:i%5===0?5: (trafficPeak?0:(i%10));
 const reason=reasons[reasonIdx];
  const outcome=i%30;
  let delay=outcome<25?0:outcome<28?4+(i%9):outcome===28?16+(i%15):37+(i%20);
  if(delay>0&&(reason.category==='Site Waiting'||reason.category==='Customer / Site Delay')) delay+=8;
  if(delay>0&&reason.category==='Traffic'&&trafficPeak)delay+=7;
  if(delay>0&&reason.category==='Plant Loading / Batching'&&i%3===0)delay+=9;
 delay=Math.min(delay,74);
 const isCurrent=daysAgo===0&&i%4!==0;
 const status:DeliveryStatus=isCurrent?(['Loading','In Transit','At Site','Unloading'][i%4] as DeliveryStatus):'Completed';
 const actualDepart=schedule+(reason.stage==='Plant'?Math.min(delay,18):i%5);
 const estArr=actualDepart+38+(i%16);
 const actualArr=estArr+delay;
 const loadStart=schedule-20;
 const loadEnd=loadStart+14+(i%13);
 const siteWait=reason.stage==='Site'?12+i%26:4+i%11;
 const unloadStart=actualArr+siteWait;
 const unloadEnd=unloadStart+18+(i%16);
 const active=(v:number)=>isCurrent&&((i%4===0)?true:(i%4===1?v>actualDepart:(i%4===2?v>actualArr:true)));
 return {
  id:`DEL-${String(3000+i).padStart(5,'0')}`,orderId:`ORD-${String(1041+i).padStart(5,'0')}`,date,projectId:project.id,customerId:project.customerId,truckId:truck.id,
  concreteGrade:['Grade 25','Grade 30','Grade 20','Grade 40'][i%4],quantity:[4.5,5,6,7][i%4],
  estimatedDeparture:dateTime(date,schedule),actualDeparture:active(actualDepart)?'':dateTime(date,actualDepart),
  estimatedDelivery:dateTime(date,estArr),actualDelivery:isCurrent?'':dateTime(date,actualArr),
  loadingStart:dateTime(date,loadStart),loadingComplete:active(loadEnd)?'':dateTime(date,loadEnd),
  siteArrival:isCurrent&&i%4<2?'':dateTime(date,actualArr),unloadingStart:isCurrent&&i%4<3?'':dateTime(date,unloadStart),unloadingComplete:isCurrent?'':dateTime(date,unloadEnd),
  status,delayCategory:delay?'Operational':'',delayReason:delay?reason.name:'',remarks:delay?`${reason.category} recorded by dispatch.`:'',createdBy:'N. Perera',createdAt:dateTime(date,Math.max(360,schedule-35)),updatedAt:dateTime(date,Math.max(360,schedule-20))
 };
}
const defaultSettings:OpsSettings={plantName:'Peliyagoda Ready-Mix Plant',location:'Peliyagoda, Sri Lanka',onTimeTarget:90,slightMax:15,delayedMax:30,severeMin:31,mediumRiskMinutes:20,criticalRiskMinutes:30,reasons};
export function seedStore():Store{
 const now=new Date();
 const deliveries=Array.from({length:210},(_,i)=>makeDelivery(i,now));
 return {deliveries,projects,customers,trucks,audit:[{id:'AUD-001',userId:'N. Perera',action:'Loaded demo dataset',entity:'System',entityId:'DEMO',previousValue:'',newValue:'210 demo delivery records',timestamp:new Date().toISOString()}],settings:defaultSettings,role:'Operations Manager'};
}
export function loadStore():Store{
  try{
   const raw=localStorage.getItem(KEY);
   if(raw){
    const parsed=JSON.parse(raw) as Store;
    if(Array.isArray(parsed.deliveries)&&parsed.settings){
     const untouchedDemo=parsed.deliveries.length===210&&parsed.audit?.length===1&&parsed.audit[0].action==='Loaded demo dataset'&&parsed.deliveries.every((d,i)=>d.id===`DEL-${String(3000+i).padStart(5,'0')}`);
     const completed=parsed.deliveries.filter(d=>d.actualDelivery);
     const onTimeRate=completed.length?completed.filter(d=>(new Date(d.actualDelivery).getTime()-new Date(d.estimatedDelivery).getTime())<=0).length/completed.length:1;
     if(untouchedDemo&&onTimeRate<0.6){
      const refreshed={...parsed,deliveries:seedStore().deliveries};
      saveStore(refreshed);
      return refreshed;
     }
     return parsed;
    }
   }
  }catch{}
 const seeded=seedStore();saveStore(seeded);return seeded;
}
export function saveStore(store:Store){localStorage.setItem(KEY,JSON.stringify(store));}
export function logAudit(store:Store,action:string,entity:string,entityId:string,previousValue='',newValue=''):Store{
 const entry:AuditLog={id:`AUD-${Date.now()}`,userId:store.role,action,entity,entityId,previousValue,newValue,timestamp:new Date().toISOString()};
 return {...store,audit:[entry,...store.audit]};
}
export function resetStore(){const store=seedStore();saveStore(store);return store;}
export function exportCsv(deliveries:Delivery[]){
 const fields=Object.keys(deliveries[0]||{}) as (keyof Delivery)[];
 const esc=(v:unknown)=>`"${String(v??'').replaceAll('"','""')}"`;
 return [fields.join(','),...deliveries.map(d=>fields.map(k=>esc(d[k])).join(','))].join('\r\n');
}
export function downloadCsv(name:string,rows:Delivery[]){
 const blob=new Blob([exportCsv(rows)],{type:'text/csv;charset=utf-8;'});
 const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);
}