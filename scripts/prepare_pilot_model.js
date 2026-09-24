// Derive the pilot's BOQ/KSG data with exactly the same functions as the app.
// Inputs are read-only extracts made by extract_pilot_sources.py.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');
const extraction = source.slice(source.indexOf('function norm('), source.indexOf('function crc32('));
if (!extraction.startsWith('function norm(') || !extraction.includes('function buildKsgRevenue('))
  throw Error('Source importer not found');
const inputs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const payload = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const reference=JSON.parse(fs.readFileSync(process.argv[5], 'utf8'));
const contractor = payload.contractor;
contractor.executionSchedule={stages:[70,18,12],documentationDelay:[10,10,10],ks2Lag:1};
const defaults = contractor.contracts.find(d => d.id === 'd1').versions.at(-1);
const pilot = {
  id:'d_pilot_4700134128', number:'4700134128',
  name:'Договор по BOQ № 4700134128 · пилот 2026', year:2026,
  vatRate:22, vacationBasis:'annual', sourceIdentityConfirmed:true,
  sourceIdentityEvidence:'BOQ!U2: к договору строительного подряда № 4700134128',
  sourceIdentities:{
    boq:{contractNumber:'4700134128'},
    primary_documents:{contractor:'Подрядчик-1--2',contractNumber:'НКНХ.10321',project:'ПЭ'},
    payments:{contractor:'ООО "Подрядчик-1--2"',alternateContractors:['Подрядчик-1--2, ООО'],contractNumber:'120001358474',project:'мПЭ'},
    personnel:{contractor:'Подрядчик-1'},equipment:{contractor:'Подрядчик-1'}
  },
  parameters:JSON.parse(JSON.stringify(defaults.parameters)), sources:{}, versions:[]
};
const ctx = {DataAdapter:require('../src/data-adapter.js'),CalculationCore:require('../src/calculation-core.js'),
  contractor:()=>contractor,sum:a=>a.reduce((s,x)=>s+(Number(x)||0),0),
  columnName:n=>{let s='';for(n++;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;},
  console,TextDecoder,Date,Array,Number,String,Math};
vm.createContext(ctx);
vm.runInContext(extraction+'\nthis.pilotFns={buildKqEstimate,buildKsgItems,buildKsgRevenue,buildPrimaryActuals,buildBankActuals,buildFactoringActuals,countLinkedBankPayments};',ctx);
const boqIdentity = inputs.boq.sheets[0].rows.slice(0,8).flat().some(v => String(v||'').includes('4700134128'));
if(!boqIdentity)throw Error('BOQ contract 4700134128 is not evidenced');
const built=ctx.pilotFns.buildKqEstimate(inputs.boq);
const allItems=ctx.pilotFns.buildKsgItems(inputs.ksg,built.estimate,2026);
const items=allItems.filter(row=>row.matchRule==='exact');
const control=ctx.DataAdapter.workChainControl(built.estimate,items);
const result=ctx.pilotFns.buildKsgRevenue(inputs.ksg,2026,built.estimate,items);
if(!control.rows.length||!control.matchedRows||!result.execution.some(x=>x>0))throw Error('Missing verified BOQ/KSG calculation');
const version=JSON.parse(JSON.stringify(defaults));
version.id='v_pilot_2026';version.name='Пилот 2026 · BOQ/КСГ';version.year=2026;
version.currency='USD';version.fxRate=80;
version.parameters=JSON.parse(JSON.stringify(defaults.parameters));
version.drivers=Object.fromEntries(Object.entries(version.drivers).map(([k])=>[k,Array(12).fill(0)]));
const refRow=n=>reference.rows[String(n)];
version.drivers.directPeople=refRow(24);
version.drivers.indirectPeople=refRow(30);
version.drivers.scaffoldPeople=refRow(37);
version.drivers.laborIntensity=refRow(23);
version.drivers.passivePeople=refRow(29);
version.drivers.equipmentHours=refRow(39).map(x=>x*260);
version.drivers.nrkVolume=refRow(15);
version.personnelCategories={direct:reference.direct.map(c=>({sourceRow:c.row,rate:c.rate,currency:'USD',insurance:c.insurance*100,months:refRow(c.row)})),indirect:reference.indirect.map(c=>({sourceRow:c.row,rate:c.rate,currency:'USD',insurance:c.insurance*100,months:refRow(c.row)}))};
version.costSourceBasis={scaffoldPeople:true,livingPeople:true,projectMaterialsForecast:true,materialMarkupPercent:10,sourceExcel2026:true};
version.drivers.sourceDays=refRow(4);version.vacationBasis='source';
version.parameters.vacation.value=100*31/28/12;version.parameters.indirectVacation.value=100*31/28/12;
version.drivers.ksgRevenue=result.execution;version.drivers.ksgMaterialsRevenue=result.materialsRevenue;version.materialForecastByKq=result.materialsByKq;
version.drivers.ks2Accepted=result.ks2;
// The original model's row 83 filters signed primary documents by contractor
// and project, not by the ERP contract number (Детальная модель!U83).
version.drivers.primaryExecuted=Array(12).fill(0);
version.drivers.primaryDeductions=Array(12).fill(0);
version.primaryMonthsWithDocuments=Array(12).fill(false);
let primaryRows=0;
for(const row of inputs.primary_documents.sheets[0].rows.slice(1)){
 const source=pilot.sourceIdentities.primary_documents;
 if(String(row[1]??'').trim()!==source.contractor||String(row[5]??'').trim()!==source.contractNumber||String(row[6]??'').trim()!==source.project)continue;
 if(String(row[7]??'').trim().toUpperCase()!=='USD')throw Error('Primary currency differs from BOQ revenue');
 const match=/^(\d{4})-(\d{2})-\d{2}$/.exec(String(row[19]??''));
 if(!match||+match[1]!==2026)continue;
 const m=+match[2]-1,amount=Number(row[14]);
 if(!Number.isFinite(amount))throw Error('Primary document has missing amount');
 version.drivers.primaryExecuted[m]+=amount;
 for(const col of [34,35,37])version.drivers.primaryDeductions[m]+=Number(row[col])||0;
 version.primaryMonthsWithDocuments[m]=true;primaryRows++;
}
if(Math.abs(version.drivers.primaryExecuted[0]-1421531.78)>0.01)
 throw Error('Primary January 2026 differs from source model Детальная модель!U83');
const paymentRows=inputs.payments.sheets[0].rows.slice(1).filter(row=>
  String(row[2]??'').trim()==='316668' && String(row[4]??'').trim()==='120001358474' &&
  String(row[5]??'').toUpperCase()==='USD' && String(row[12]??'').includes(pilot.number));
const primaryPaymentMatches=inputs.primary_documents.sheets[0].rows.slice(1)
  .filter(row=>row[1]===pilot.sourceIdentities.primary_documents.contractor&&
    row[5]===pilot.sourceIdentities.primary_documents.contractNumber&&row[6]==='ПЭ')
  .filter(row=>Number(row[45])>0&&paymentRows.some(payment=>Math.abs(Number(payment[6])-Number(row[45]))<0.01)).length;
if(primaryPaymentMatches<3)throw Error('Primary and bank contract aliases are not linked by payment amounts');
const currentPrimary=ctx.pilotFns.buildPrimaryActuals(inputs.primary_documents,
 pilot.sourceIdentities.primary_documents,2026,'USD');
const verifiedBankMatches=ctx.pilotFns.countLinkedBankPayments(inputs.payments,
 pilot.sourceIdentities.payments,pilot.number,'USD',currentPrimary.paidGross);
if(verifiedBankMatches<3||verifiedBankMatches>primaryPaymentMatches)
 throw Error('Bank links do not match document amounts and currencies');
const badCurrency=ctx.pilotFns.countLinkedBankPayments(inputs.payments,
 pilot.sourceIdentities.payments,pilot.number,'RUB',currentPrimary.paidGross);
if(badCurrency!==0)throw Error('Bank importer accepted mismatching currency');
if(currentPrimary.count!==primaryRows||currentPrimary.actual.some((x,m)=>Math.abs(x-version.drivers.primaryExecuted[m])>.01))
 throw Error('Application primary import differs from audited contract filter');
let wrongContractRejected=false;
try{ctx.pilotFns.buildPrimaryActuals(inputs.primary_documents,
 {...pilot.sourceIdentities.primary_documents,contractNumber:'НКНХ.11980'},2026,'USD');}
catch{wrongContractRejected=true;}
if(!wrongContractRejected)throw Error('Primary importer accepted a different contract');
const primaryCacheDifferences=refRow(83).flatMap((cached,m)=>
  Math.abs(cached*1e6-version.drivers.primaryExecuted[m])>0.01?[m+1]:[]);
const resourceCacheDifferences=Array.from({length:12},(_,m)=>m+1).filter(month=>
  [['personnel',325,24],['personnel',326,30],['personnel',327,37],['equipment',227,39]]
    .some(([file,row,referenceRow])=>
      Math.abs(inputs.resourceMonths[file][String(row)][month-1].average-refRow(referenceRow)[month-1])>1e-6));
const bank=ctx.pilotFns.buildBankActuals(inputs.payments,pilot.sourceIdentities.payments,pilot.number,2026,'USD');
const factoring=ctx.pilotFns.buildFactoringActuals(inputs.factoring,pilot.sourceIdentities.primary_documents,pilot.sourceIdentities.payments.project,2026,'USD');
version.drivers.primaryExecuted=currentPrimary.actual;
version.drivers.primaryDeductions=currentPrimary.deductions;
version.drivers.primaryAdvanceOffset=currentPrimary.advanceOffset;
version.drivers.primaryGuaranteeHold=currentPrimary.guaranteeHold;
version.drivers.payments=bank.payments;
version.drivers.advances=bank.advances;
version.drivers.paymentVat=bank.paymentVat;
version.drivers.advanceVat=bank.advanceVat;
version.drivers.factoring=factoring.amounts;
version.drivers.advanceOffset=currentPrimary.advanceOffset;
version.paymentActualMonths=bank.months.map((present,m)=>present||factoring.months[m]);
version.cashFlowBasis='source_model';
if(Math.abs(bank.payments[0]-1509602.26)>.01||Math.abs(bank.payments[1]-757302.57)>.01||
   Math.abs(factoring.amounts[2]-855793.46)>.01||bank.advances.some(x=>x!==0))
 throw Error('Actual bank / factoring does not match source model 2026');
const paymentCount=bank.count;
version.drivers.physicalVolume=Array.from({length:12},(_,m)=>
  items.reduce((s,row)=>s+(Number(row.volumes?.[m])||0),0));
version.revenueBasis='ksg';version.workItems=items;version.kqEstimate=control.rows;
version.dataMode='source_partial';version.actualThroughMonth=0;version.primaryIdentityConfirmed=true;
version.manualCosts={};version.manualPayments={};
version.workSourceMeta={boqFile:'data/sources/boq.xlsx',ksgFile:'data/sources/ksg.xlsx',
  paymentFile:'data/sources/payments.xlsx',paymentRows:paymentCount,bankRows:bank.count,factoringRows:factoring.count,receiptSource:'Платежи H + Факторинг R, без НДС; зачёты Первичка AD',
  paymentIdentityEvidence:'Контрагент 316668, ERP 120001358474, назначение платежа содержит 4700134128, валюта USD',
  primaryFile:'data/sources/primary_documents.xlsx',primaryRows,
  primarySourceContract:pilot.sourceIdentities.primary_documents.contractNumber,
  bankSourceContract:pilot.sourceIdentities.payments.contractNumber,
  primaryPaymentMatches:verifiedBankMatches,
  primaryIdentityEvidence:`Первичка: НКНХ.10321, Подрядчик-1--2, ПЭ, USD; ${primaryPaymentMatches} документных сумм совпали с платежами ERP 120001358474, назначение которых содержит 4700134128`,
  primaryCacheDifferences,resourceCacheDifferences,resourceSource:reference.source,
  resourceForecastPolicy:'Август–декабрь: прогнозные значения исходной модели, подтверждено пользователем; не считать фактом',
  currency:'USD',boqRows:built.records.length,kq2Rows:control.rows.length,
  ksgRows:items.length,matchedRows:control.matchedRows,
  unmatchedRows:0,ignoredRows:allItems.length-items.length,boqCost:control.boqCost,
  scheduledCost:control.scheduledCost,contractQuantity:control.contractQuantity,
  scheduledQuantity:control.scheduledQuantity,
  sourceContractNumber:'4700134128',loadedAt:new Date().toISOString(),
  warnings:['Договорный номер первички НКНХ.10321 связан с 4700134128 через платёжный ERP 120001358474; отбор факта ограничен этим номером договора',
    `Кэш исходной книги по первичке расходится с документами в месяцах ${primaryCacheDifferences.join(', ')}`,
    `Ресурсные файлы расходятся с прогнозом исходной модели в месяцах ${resourceCacheDifferences.join(', ')}`],
  blockers:['План поступлений после даты банковского реестра отсутствует; августовский кэш Excel не совпадает с предоставленным реестром факторинга',
    'Закрытый расход по статьям затрат не подтверждён первичными документами']};
pilot.versions.push(version);
contractor.contracts.unshift(pilot);
contractor.portfolio={...(contractor.portfolio||{}),excluded:['d1','d2']};
contractor.sourceMapping=contractor.sourceMapping||{sources:{}};
const names={boq:'boq',ksg:'ksg',personnel:'personnel',equipment:'equipment',
  payments:'payments',primary_documents:'primary_documents',factoring:'factoring'};
for(const [key,name] of Object.entries(names))
  (contractor.sourceMapping.sources[key]||(contractor.sourceMapping.sources[key]={})).path=`data/sources/${name}.xlsx`;
contractor.pipeRateRule={parentCode:'KQ-33-01',parts:[{code:'KQ-33-01',share:50},{code:'KQ-33-11',share:20},{code:'KQ-33-12',share:30}]};
for(const old of contractor.contracts.filter(x=>x.id!==pilot.id))for(const v of old.versions){
  v.drivers=Object.fromEntries(Object.entries(v.drivers).map(([k])=>[k,Array(12).fill(0)]));
  v.workItems=[];v.dataMode='unconfigured';v.revenueBasis='manual';
  v.actualThroughMonth=0;v.primaryIdentityConfirmed=false;
  v.workSourceMeta={blockers:['Договорные номера не сопоставлены исходным документам']};
}
fs.writeFileSync(process.argv[4],JSON.stringify(payload));
process.stdout.write(JSON.stringify({contract:pilot.number,rows:control.rows.length,
  matched:control.matchedRows,unmatched:control.unmatchedRows,
  annualRevenue:result.execution.reduce((a,b)=>a+b,0),ks2Ready:!!result.ks2})+'\n');
