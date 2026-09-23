const CalculationCore=(()=>{
const number=value=>{const result=Number(value);return Number.isFinite(result)?result:0;};
const sum=values=>values.reduce((total,value)=>total+number(value),0);
const toRub=(amount,fxRate)=>{const rate=number(fxRate);return rate>0?number(amount)*rate:NaN;};
const fromRub=(amount,fxRate)=>{const rate=number(fxRate);return rate>0?number(amount)/rate:NaN;};
function factorBridge({q0=0,p0=null,q1=0,p1=null}={}){
 q0=number(q0);q1=number(q1);
 if(p0==null&&p1==null)return{status:'unmatched',base:0,current:0,volume:0,price:0,variance:0,control:NaN};
 let base,current,volume,price,status='matched';
 if(p0==null){p1=number(p1);base=0;current=q1*p1;volume=current;price=0;status='new';}
 else if(p1==null){p0=number(p0);base=q0*p0;current=0;volume=-base;price=0;status='removed';}
 else{p0=number(p0);p1=number(p1);base=q0*p0;current=q1*p1;volume=(q1-q0)*p0;price=q1*(p1-p0);}
 const variance=current-base,control=current-(base+volume+price);
 return{status,base,current,volume,price,variance,control};
}
function aggregateFactors(rows){
 return rows.reduce((total,row)=>{for(const key of ['base','current','volume','price','variance','control'])total[key]+=number(row[key]);return total;},{base:0,current:0,volume:0,price:0,variance:0,control:0});
}
function topWorkFactors(rows,limit=10){
 const sorted=[...rows].sort((a,b)=>Math.max(Math.abs(b.base),Math.abs(b.current))-Math.max(Math.abs(a.base),Math.abs(a.current))||String(a.key).localeCompare(String(b.key)));
 const visible=sorted.slice(0,limit),remainder=sorted.slice(limit),other=remainder.length?{key:'other-works',label:`Прочие работы (${remainder.length})`,status:'group',...aggregateFactors(remainder)}:null;
 return{visible,other,hiddenCount:remainder.length,total:aggregateFactors(rows)};
}
function compareWorkItems(baseItems=[],currentItems=[],{baseFx=1,currentFx=1}={}){
 const group=items=>items.reduce((map,item,index)=>{
  const key=String(item.stableKey||item.workId||item.id||`row-${index}`),quantity=sum(Array.isArray(item.volumes)?item.volumes:[item.quantity??item.plannedQuantity]),rate=number(item.rate??item.actualRate??item.currentRate??item.contractRate);
  if(!map.has(key))map.set(key,{key,label:String(item.name||item.label||key),code:String(item.kq2||item.kqCode||''),unit:String(item.unit||''),quantity:0,weightedAmount:0,rateCount:0});
  const row=map.get(key);row.quantity+=quantity;row.weightedAmount+=quantity*rate;row.rateCount+=rate?1:0;
  return map;
 },new Map());
 const base=group(baseItems),current=group(currentItems),keys=new Set([...base.keys(),...current.keys()]);
 const rows=[...keys].map(key=>{
  const left=base.get(key),right=current.get(key),q0=left?.quantity||0,q1=right?.quantity||0;
  const rawP0=left?(q0?left.weightedAmount/q0:0):null,rawP1=right?(q1?right.weightedAmount/q1:0):null;
  const p0=rawP0==null?null:toRub(rawP0,baseFx),p1=rawP1==null?null:toRub(rawP1,currentFx),bridge=factorBridge({q0,p0,q1,p1});
  return{key,label:right?.label||left?.label||key,code:right?.code||left?.code||'',unit:right?.unit||left?.unit||'',q0,rawP0,q1,rawP1,p0,p1,...bridge};
 }).sort((a,b)=>(a.code||'').localeCompare(b.code||'')||a.label.localeCompare(b.label));
 return{rows,total:aggregateFactors(rows)};
}
function residualFactor({base=0,current=0,explained=0}={}){return number(current)-number(base)-number(explained);}
function calculateModel(v,costDefs){
 const d=v.drivers,params=v.parameters,p=k=>params[k]?.enabled?number(params[k].value):0,rows={};costDefs.forEach(x=>rows[x[2]]=Array(12).fill(0));
 const workRevenue=Array.from({length:12},(_,m)=>sum((v.workItems||[]).map(x=>number(x.volumes?.[m])*number(x.rate))));
 const calculatedRevenue=d.physicalVolume.map((quantity,m)=>v.workItems?.length?workRevenue[m]:quantity&&d.boqRate[m]?quantity*d.boqRate[m]:d.revenue[m]);
 const revenue=calculatedRevenue.map((x,m)=>x+d.otherRevenue[m]);
 const payrollAt=(k,people,m)=>!params[k].enabled?0:params[k].method==='manual'?(v.manualCosts[k]?.[m]??p(k)):people*p(k);
 const annualDirect=sum(d.directPeople.map((x,m)=>payrollAt('payroll',x,m))),annualIndirect=sum(d.indirectPeople.map((x,m)=>payrollAt('indirectPayroll',x,m)));
 for(let m=0;m<12;m++){
 const set=(k,amount)=>rows[k][m]=!params[k].enabled?0:params[k].method==='manual'?(v.manualCosts[k]?.[m]??p(k)):amount;
 const dp=d.directPeople[m],ip=d.indirectPeople[m],days=new Date(v.year,m+1,0).getDate(),tax=p('payrollTax')/100,itax=p('indirectTax')/100;
 const dw=set('payroll',dp*p('payroll')),iw=set('indirectPayroll',ip*p('indirectPayroll'));
 set('payrollTax',dw/(1-tax)*tax);set('insurance',(dw+rows.payrollTax[m])*p('insurance')/100);set('vacation',(v.vacationBasis==='annual'?annualDirect:dw)*p('vacation')/100);
 set('subcontract',revenue[m]*p('subcontract')/100);set('equipment',d.equipmentHours[m]*p('equipment'));set('scaffoldLabor',dp*.05*260*p('scaffoldLabor'));set('projectMaterials',d.materials[m]*p('projectMaterials')/100);set('consumables',(dw+rows.payrollTax[m]+rows.insurance[m])*p('consumables')/100);set('nrk',d.nrkVolume[m]*p('nrk'));
 set('indirectTax',iw/(1-itax)*itax);set('indirectInsurance',(iw+rows.indirectTax[m])*p('indirectInsurance')/100);set('indirectVacation',(v.vacationBasis==='annual'?annualIndirect:iw)*p('indirectVacation')/100);
 set('food',(dp+ip)*days*p('food'));set('housing',(dp+ip)*days*p('housing'));set('bus',Math.ceil(dp/45)*p('bus'));set('car',ip>0?6*p('car'):0);set('ppe',dp*p('ppe')/12);set('tickets',(dp*.25+ip*.16)*p('tickets'));set('permit',dp*.15*p('permit'));set('medical',(dp+ip)*p('medical'));set('vziz',(dp+ip)*p('vziz')/12);set('office',p('office'));set('warehouse',p('warehouse'));set('internet',p('internet'));set('waste',p('waste'));set('safety',dw*p('safety')/100);set('accident',(dp+ip)*p('accident')/12);
 for(const x of costDefs)if(x[3]==='manual')set(x[2],p(x[2]));
 const base=['payroll','payrollTax','insurance','vacation','subcontract','scaffoldLabor','consumables','nrk','otherDirect'].reduce((s,k)=>s+rows[k][m],0);set('otherIndirect',base*p('otherIndirect')/100);
 }
 const aggregate=(obj,g)=>Array.from({length:12},(_,m)=>sum(costDefs.filter(x=>!g||x[0]===g).map(x=>obj[x[2]][m])));
 const direct=aggregate(rows,'direct'),indirect=aggregate(rows,'indirect'),costs=aggregate(rows),profit=revenue.map((x,m)=>x-costs[m]),payments={},vat=v.vatRate/100,inputVat=Array(12).fill(0);let deferred=0;
 for(const x of costDefs){const k=x[2],param=params[k];payments[k]=Array(12).fill(0);if(v.manualPayments[k]){payments[k]=v.manualPayments[k].slice();}else if(param.enabled&&param.cash){for(let m=0;m<12;m++){const amount=rows[k][m]*(param.vat?1+vat:1),to=m+(param.lag||0);if(to>11){deferred+=amount;continue;}payments[k][to]+=amount;}}if(param.vat)payments[k].forEach((amount,m)=>inputVat[m]+=amount/(1+vat)*vat);}
 const operatingPayments=aggregate(payments),directPayments=aggregate(payments,'direct'),indirectPayments=aggregate(payments,'indirect');
 const outputVat=d.payments.map(x=>x/(1+vat)*vat),advanceVat=d.advances.map(x=>x/(1+vat)*vat),offsetVat=d.advanceOffset.map(x=>-x/(1+vat)*vat),vatPay=outputVat.map((x,m)=>Math.max(0,x+advanceVat[m]+offsetVat[m]-inputVat[m]));
 const inflow=d.payments.map((x,m)=>x+d.advances[m]+d.factoring[m]-d.advanceOffset[m]),ncf=inflow.map((x,m)=>x-operatingPayments[m]-vatPay[m]);let acc=0;const cumulative=ncf.map(x=>acc+=x);
 return{rows,revenue,direct,indirect,costs,profit,payments,directPayments,indirectPayments,outputVat,advanceVat,offsetVat,inputVat,vatPay,operatingPayments,inflow,ncf,cumulative,deferred};
}
return{number,sum,toRub,fromRub,factorBridge,aggregateFactors,topWorkFactors,compareWorkItems,residualFactor,calculateModel};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=CalculationCore;
