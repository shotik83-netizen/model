const CalculationCore=(()=>{
const number=value=>{const result=Number(value);return Number.isFinite(result)?result:0;};
const sum=values=>values.reduce((total,value)=>total+number(value),0);
const toRub=(amount,fxRate)=>{const rate=number(fxRate);return rate>0?number(amount)*rate:NaN;};
const fromRub=(amount,fxRate)=>{const rate=number(fxRate);return rate>0?number(amount)/rate:NaN;};
function rateInContractCurrency(amount,rateCurrency,contractCurrency,fxRate){
 const value=Number(amount),source=String(rateCurrency||contractCurrency||'RUB').toUpperCase(),target=String(contractCurrency||'RUB').toUpperCase();
 if(!Number.isFinite(value))throw Error('Некорректная ставка затрат.');
 if(source===target)return value;
 const fx=Number(fxRate);
 if(!Number.isFinite(fx)||fx<=0)throw Error(`Для ставки ${source} → ${target} требуется положительный курс к RUB.`);
 if(source==='RUB'&&target!=='RUB')return value/fx;
 if(target==='RUB'&&source!=='RUB')return value*fx;
 throw Error(`Для ставки ${source} → ${target} нет курса между двумя иностранными валютами. Укажите ставку в валюте договора или в RUB.`);
}
function recognizeKsgSchedule(smr,mtr,weights=[.7,.18,.12]){
 if(!Array.isArray(smr)||!Array.isArray(mtr)||smr.length!==mtr.length||weights.length!==3||Math.abs(sum(weights)-1)>1e-12)throw Error('Некорректный график выполнения КСГ.');
 return smr.map((_,i)=>sum(weights.map((weight,lag)=>weight*(number(smr[i-lag])+number(mtr[i-lag])))));
}
function ksgAcceptanceSchedule(smr,mtr,weights=[.7,.18,.12],documentationDelay=[0,0,0],actLag=1){
 if(!Array.isArray(smr)||!Array.isArray(mtr)||smr.length!==mtr.length||weights.length!==3||documentationDelay.length!==3||!Number.isInteger(actLag)||actLag<0||actLag>12||Math.abs(sum(weights)-1)>1e-12||weights.some(x=>x<0||x>1)||documentationDelay.some(x=>x<0||x>1))throw Error('Некорректный регламент выполнения или КС-2.');
 const execution=recognizeKsgSchedule(smr,mtr,weights),accepted=Array(smr.length+actLag+4).fill(0);
 for(let i=0;i<smr.length;i++)for(let stage=0;stage<3;stage++){
  const amount=(number(smr[i])+number(mtr[i]))*weights[stage],at=i+stage+actLag,late=documentationDelay[stage];
  accepted[at]+=amount*(1-late);accepted[at+1]+=amount*late;
 }
 return{execution,accepted};
}
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
function aggregateContractor(entries=[]){
 const keys=['revenue','direct','indirect','costs','profit','inflow','operatingPayments','vatPay','ncf','cumulative'];
 const errors=[],seenIds=new Set(),seenNumbers=new Set();
 if(!entries.length)errors.push('Выберите хотя бы один договор.');
 const first=entries[0]?.version,year=first?.year,mixed=entries.some(item=>item.version?.currency!==first?.currency),currency=mixed?'RUB':first?.currency;
 for(const item of entries){
  const label=String(item.number||item.contractId||'Договор'),id=String(item.contractId||''),normalizedNumber=label.trim().toLocaleLowerCase('ru-RU'),v=item.version||{},r=item.result||{};
  if(!id||seenIds.has(id))errors.push(label+': повторяется или отсутствует идентификатор договора.');seenIds.add(id);
  if(!normalizedNumber||seenNumbers.has(normalizedNumber))errors.push(label+': повторяется или отсутствует номер договора.');seenNumbers.add(normalizedNumber);
  if(v.portfolioYearMissing||!Number.isInteger(v.year)||v.year!==year)errors.push(label+': год версии отличается или не задан.');
  if(!v.currency||mixed&&v.currency!=='RUB'&&!(number(v.fxRate)>0))errors.push(label+': для перевода в RUB нужен положительный договорный курс.');
  for(const key of keys)if(!Array.isArray(r[key])||r[key].length!==12||r[key].some(x=>typeof x!=='number'||!Number.isFinite(x)))errors.push(label+': отсутствует помесячный показатель '+key+'.');
 }
 if(errors.length)return{status:'blocked',errors,year:null,currency:null,totals:null,lines:[]};
 const convert=(amount,item)=>mixed&&item.version.currency!=='RUB'?toRub(amount,item.version.fxRate):amount;
 const totals=Object.fromEntries(keys.map(key=>[key,Array.from({length:12},(_,m)=>sum(entries.map(item=>convert(item.result[key][m],item))))]));
 let balance=0;totals.cumulative=totals.ncf.map(value=>balance+=value);
 if(Object.values(totals).some(values=>values.some(value=>!Number.isFinite(value))))return{status:'blocked',errors:['Сумма договоров выходит за допустимый числовой диапазон.'],year:null,currency:null,totals:null,lines:[]};
 const control=Array.from({length:12},(_,m)=>totals.cumulative[m]-sum(entries.map(item=>convert(item.result.cumulative[m],item))));
 if(control.some(value=>!Number.isFinite(value)))return{status:'blocked',errors:['Не удалось сверить накопленный поток по договорам.'],year:null,currency:null,totals:null,lines:[]};
 const mismatch=control.findIndex((value,m)=>Math.abs(value)>Math.max(1e-5,Math.abs(totals.cumulative[m])*1e-12));
 if(mismatch>=0)return{status:'blocked',errors:[`Месяц ${mismatch+1}: накопленный поток не совпадает с суммой выбранных договоров.`],year:null,currency:null,totals:null,lines:[]};
 const lines=entries.map(item=>({contractId:item.contractId,number:item.number,versionId:item.version.id,versionName:item.version.name,sourceCurrency:item.version.currency,contractRate:item.version.fxRate,revenue:sum(item.result.revenue.map(x=>convert(x,item))),costs:sum(item.result.costs.map(x=>convert(x,item))),profit:sum(item.result.profit.map(x=>convert(x,item))),ncf:sum(item.result.ncf.map(x=>convert(x,item)))}));
 const warnings=[];
 if(entries.some(item=>item.version.dataMode==='demo'))warnings.push('В свод включена версия с демонстрационными данными.');
 if(currency!=='RUB'&&entries.some(item=>!(Number(item.version.fxRate)>0)))warnings.push('Курс к RUB не указан: рублёвый эквивалент не рассчитывается.');
 const rubTotals=!mixed&&currency!=='RUB'&&entries.every(item=>number(item.version.fxRate)>0)?Object.fromEntries(keys.map(key=>[key,Array.from({length:12},(_,m)=>sum(entries.map(item=>toRub(item.result[key][m],item.version.fxRate))))])):null;
 return{status:'ready',errors:[],warnings,year,currency,totals,lines,control,rubTotals};
}
function calculateModel(v,costDefs){
 const d=v.drivers,params=v.parameters,percentageMethods=new Set(['rate','percentRevenue','percentPayroll','percentDirect','materials']),methodByKey=new Map(costDefs.map(x=>[x[2],x[3]])),p=k=>{const entry=params[k];if(!entry?.enabled)return 0;return percentageMethods.has(entry.method||methodByKey.get(k))?number(entry.value):rateInContractCurrency(entry.value,entry.rateCurrency,v.currency,v.fxRate);},rows={};costDefs.forEach(x=>rows[x[2]]=Array(12).fill(0));
 const workRevenue=Array.from({length:12},(_,m)=>sum((v.workItems||[]).map(x=>number(x.volumes?.[m])*number(x.rate))));
 const calculatedRevenue=d.physicalVolume.map((quantity,m)=>v.revenueBasis==='ksg'&&Array.isArray(d.ksgRevenue)?number(d.ksgRevenue[m]):v.workItems?.length?workRevenue[m]:quantity&&d.boqRate[m]?quantity*d.boqRate[m]:d.revenue[m]);
 const revenue=calculatedRevenue.map((x,m)=>x+d.otherRevenue[m]);
 const payrollAt=(k,people,m)=>!params[k].enabled?0:params[k].method==='manual'?(v.manualCosts[k]?.[m]??p(k)):people*p(k);
 const categories=(group,m)=>Array.isArray(v.personnelCategories?.[group])?v.personnelCategories[group].map(c=>({people:number(c.months?.[m]),wage:rateInContractCurrency(c.rate,c.currency||v.currency,v.currency,v.fxRate),insurance:number(c.insurance)})):null;
 const categoryPayroll=(group,m)=>sum((categories(group,m)||[]).map(c=>c.people*c.wage));
 const annualDirect=params.payroll.enabled?sum(d.directPeople.map((x,m)=>categories('direct',m)?categoryPayroll('direct',m):payrollAt('payroll',x,m))):0,annualIndirect=params.indirectPayroll.enabled?sum(d.indirectPeople.map((x,m)=>categories('indirect',m)?categoryPayroll('indirect',m):payrollAt('indirectPayroll',x,m))):0;
 for(let m=0;m<12;m++){
 const set=(k,amount)=>rows[k][m]=!params[k].enabled?0:params[k].method==='manual'?(v.manualCosts[k]?.[m]??p(k)):amount;
 const dp=d.directPeople[m],ip=d.indirectPeople[m],days=new Date(v.year,m+1,0).getDate(),tax=p('payrollTax')/100,itax=p('indirectTax')/100;
 const directCategories=categories('direct',m),indirectCategories=categories('indirect',m);
 const dw=set('payroll',directCategories?categoryPayroll('direct',m):dp*p('payroll')),iw=set('indirectPayroll',indirectCategories?categoryPayroll('indirect',m):ip*p('indirectPayroll'));
 set('payrollTax',dw/(1-tax)*tax);set('insurance',directCategories?sum(directCategories.map(c=>c.people*c.wage*c.insurance/100))/(1-tax):(dw+rows.payrollTax[m])*p('insurance')/100);set('vacation',v.vacationBasis==='source'?(dw+rows.payrollTax[m]+rows.insurance[m])*p('vacation')/100:(v.vacationBasis==='annual'?annualDirect:dw)*p('vacation')/100);
 set('subcontract',revenue[m]*p('subcontract')/100);set('equipment',d.equipmentHours[m]*p('equipment'));set('scaffoldLabor',(v.costSourceBasis?.scaffoldPeople?number(d.scaffoldPeople?.[m]):dp*.05)*260*p('scaffoldLabor'));if(v.costSourceBasis?.projectMaterialsForecast){if(!Array.isArray(d.ksgMaterialsRevenue)||!Number.isFinite(Number(v.costSourceBasis.materialMarkupPercent))||Number(v.costSourceBasis.materialMarkupPercent)<0)throw Error('Для прогноза материалов нужны МТР КСГ и наценка.');set('projectMaterials',d.ksgMaterialsRevenue[m]/(1+Number(v.costSourceBasis.materialMarkupPercent)/100));}else set('projectMaterials',d.materials[m]*p('projectMaterials')/100);set('consumables',(dw+rows.payrollTax[m]+rows.insurance[m]+(v.costSourceBasis?.sourceExcel2026?rows.vacation[m]:0))*p('consumables')/100);set('nrk',d.nrkVolume[m]*p('nrk'));
 set('indirectTax',iw/(1-itax)*itax);set('indirectInsurance',indirectCategories?sum(indirectCategories.map(c=>c.people*c.wage*c.insurance/100))/(1-itax):(iw+rows.indirectTax[m])*p('indirectInsurance')/100);set('indirectVacation',v.vacationBasis==='source'?(iw+rows.indirectTax[m]+rows.indirectInsurance[m])*p('indirectVacation')/100:(v.vacationBasis==='annual'?annualIndirect:iw)*p('indirectVacation')/100);
 const source=v.costSourceBasis?.sourceExcel2026,livingPeople=v.costSourceBasis?.livingPeople?number(d.laborIntensity?.[m])+number(d.passivePeople?.[m])-number(d.scaffoldPeople?.[m]):dp+ip,sourceDays=source?number(d.sourceDays?.[m]):days;
 if(source&&(!Number.isInteger(sourceDays)||sourceDays<=0))throw Error('Не задано количество дней исходной модели для месяца '+(m+1)+'.');
 set('food',livingPeople*sourceDays*p('food'));set('housing',livingPeople*sourceDays*p('housing'));set('bus',Math.ceil((source?number(d.laborIntensity?.[m])-number(d.scaffoldPeople?.[m]):dp)/45)*p('bus'));set('car',ip>0?6*p('car'):0);
 set('ppe',dp*p('ppe')/12*(source?1.74:1));set('tickets',source?(dp*.25+(ip-number(indirectCategories?.[4]?.people))/6)*p('tickets'):(dp*.25+ip*.16)*p('tickets'));
 set('permit',(source?number(directCategories?.[3]?.people):dp*.15)*p('permit'));set('medical',(source?number(d.passivePeople?.[m]):dp+ip)*p('medical'));set('vziz',(source?dp:(dp+ip)/12)*p('vziz'));
 set('office',p('office'));set('warehouse',p('warehouse'));set('internet',p('internet'));set('waste',p('waste'));set('safety',dw*p('safety')/100);set('accident',(source?dp:dp+ip)*p('accident')/12);
 for(const x of costDefs)if(x[3]==='manual')set(x[2],p(x[2]));
 const base=(source?['payroll','payrollTax','insurance','vacation','subcontract','equipment','nrk','otherDirect']:['payroll','payrollTax','insurance','vacation','subcontract','scaffoldLabor','consumables','nrk','otherDirect']).reduce((s,k)=>s+rows[k][m],0);set('otherIndirect',base*p('otherIndirect')/100);
 }
 const aggregate=(obj,g)=>Array.from({length:12},(_,m)=>sum(costDefs.filter(x=>!g||x[0]===g).map(x=>obj[x[2]][m])));
 const materialCostsByKind={};
 if(v.costSourceBasis?.projectMaterialsForecast&&!v.manualCosts?.projectMaterials&&v.parameters.projectMaterials?.enabled&&v.materialForecastByKq){
  const markup=1+number(v.costSourceBasis.materialMarkupPercent)/100;
  for(const [code,monthly] of Object.entries(v.materialForecastByKq)){
   if(!Array.isArray(monthly)||monthly.length!==12)throw Error('Некорректный месячный график МТР KQ-2: '+code);
   const kind=String(v.materialKinds?.[code]||'Вид не назначен').trim(),target=materialCostsByKind[kind]||(materialCostsByKind[kind]=Array(12).fill(0));
   for(let m=0;m<12;m++)target[m]+=number(monthly[m])/markup;
  }
  for(let m=0;m<12;m++)if(Math.abs(sum(Object.values(materialCostsByKind).map(x=>x[m]))-rows.projectMaterials[m])>Math.max(.01,Math.abs(rows.projectMaterials[m])*1e-10))throw Error('Материалы KQ-2 не совпадают со статьёй «Проектные материалы» за месяц '+(m+1)+'.');
 }
 const direct=aggregate(rows,'direct'),indirect=aggregate(rows,'indirect'),costs=aggregate(rows),profit=revenue.map((x,m)=>x-costs[m]),payments={},vat=v.vatRate/100,inputVat=Array(12).fill(0);let deferred=0;
 for(const x of costDefs){const k=x[2],param=params[k];payments[k]=Array(12).fill(0);if(v.manualPayments[k]){payments[k]=v.manualPayments[k].slice();}else if(param.enabled&&param.cash){for(let m=0;m<12;m++){const amount=rows[k][m]*(param.vat?1+vat:1),to=m+(param.lag||0);if(to>11){deferred+=amount;continue;}payments[k][to]+=amount;}}if(param.vat)payments[k].forEach((amount,m)=>inputVat[m]+=amount/(1+vat)*vat);}
 const operatingPayments=aggregate(payments),directPayments=aggregate(payments,'direct'),indirectPayments=aggregate(payments,'indirect');
 const documentedVat=(amount,series,m)=>v.paymentActualMonths?.[m]&&Array.isArray(d[series])&&Number.isFinite(Number(d[series][m]))?Number(d[series][m]):amount/(1+vat)*vat;
 const outputVat=d.payments.map((x,m)=>documentedVat(x,'paymentVat',m)),advanceVat=d.advances.map((x,m)=>documentedVat(x,'advanceVat',m)),offsetVat=d.advanceOffset.map(x=>-x/(1+vat)*vat),vatPay=outputVat.map((x,m)=>Math.max(0,x+advanceVat[m]+offsetVat[m]-inputVat[m]));
 // The source Excel cash-flow row 140 includes payments, factoring and advances;
 // signed advance offsets reduce receivables (row 86), not bank receipts.
 const sourceCash=v.cashFlowBasis==='source_model';
 const inflow=d.payments.map((x,m)=>x+d.advances[m]+d.factoring[m]-(sourceCash?0:d.advanceOffset[m])),ncf=inflow.map((x,m)=>x-operatingPayments[m]-vatPay[m]);let acc=0;const cumulative=ncf.map(x=>acc+=x);
 const retention=Array.from({length:12},(_,m)=>number(d.primaryGuaranteeHold?.[m])),receivable=Array.from({length:12},(_,m)=>number(d.primaryExecuted?.[m])-retention[m]-number(d.primaryDeductions?.[m])-number(d.payments[m])-number(d.factoring[m])-number(d.advanceOffset[m]));
 return{rows,materialCostsByKind,revenue,direct,indirect,costs,profit,payments,directPayments,indirectPayments,outputVat,advanceVat,offsetVat,inputVat,vatPay,operatingPayments,inflow,ncf,cumulative,deferred,retention,receivable};
}
return{number,sum,toRub,fromRub,rateInContractCurrency,recognizeKsgSchedule,ksgAcceptanceSchedule,factorBridge,aggregateFactors,topWorkFactors,compareWorkItems,residualFactor,aggregateContractor,calculateModel};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=CalculationCore;
