'use strict';
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const DataAdapter=require(path.join(root,'src/data-adapter.js'));
const CalculationCore=require(path.join(root,'src/calculation-core.js'));
const cases=require(path.join(root,'tests/factor-analysis-cases.json'));

assert.deepEqual(DataAdapter.monthlySeries([1,'2',null]),[1,2,0,0,0,0,0,0,0,0,0,0]);
assert.deepEqual(DataAdapter.moneyContext({currency:'usd',fxRate:'91.5'}),{currency:'USD',fxRate:91.5});
assert.deepEqual(DataAdapter.moneyContext({currency:'RUB',fxRate:99}),{currency:'RUB',fxRate:1});
assert.equal(DataAdapter.stableKey(['KQ-2','Работа','м3']),DataAdapter.stableKey([' KQ-2 ','работа','м3']));
assert.equal(CalculationCore.toRub(10,91.5),915);
assert.equal(CalculationCore.fromRub(915,91.5),10);
assert.equal(CalculationCore.rateInContractCurrency(8000,'RUB','EUR',100),80,'contract rate converts RUB cost to EUR');
assert.equal(CalculationCore.rateInContractCurrency(80,'CNY','RUB',12),960,'contract rate converts foreign cost to RUB');
assert.throws(()=>CalculationCore.rateInContractCurrency(80,'USD','EUR',100),/нет курса/,'no unsupported cross currency conversion');

for(const test of cases){
 const result=CalculationCore.factorBridge(test);
 assert.equal(result.volume,test.expectedVolume,test.name+' volume');
 assert.equal(result.price,test.expectedPrice,test.name+' price');
 assert.ok(Math.abs(result.control)<1e-9,test.name+' control');
}

const aggregate=CalculationCore.aggregateFactors(cases.map(test=>CalculationCore.factorBridge(test)));
assert.ok(Math.abs(aggregate.control)<1e-9,'aggregate control');

const workComparison=CalculationCore.compareWorkItems([
 {stableKey:'earth',name:'Земляные работы',kq2:'KQ-01',unit:'м3',volumes:[5,5],rate:10},
 {stableKey:'removed',name:'Исключённая работа',unit:'шт',volumes:[2],rate:20}
],[
 {stableKey:'earth',name:'Земляные работы',kq2:'KQ-01',unit:'м3',volumes:[6,6],rate:12},
 {stableKey:'new',name:'Новая работа',unit:'шт',volumes:[3],rate:30}
],{baseFx:2,currentFx:2});
assert.equal(workComparison.rows.find(row=>row.key==='earth').volume,40,'work volume factor in RUB');
assert.equal(workComparison.rows.find(row=>row.key==='earth').price,48,'work price factor in RUB');
assert.equal(workComparison.rows.find(row=>row.key==='new').status,'new','new work status');
assert.equal(workComparison.rows.find(row=>row.key==='removed').status,'removed','removed work status');
assert.ok(Math.abs(workComparison.total.control)<1e-9,'work comparison control');
const ranked=CalculationCore.topWorkFactors(Array.from({length:12},(_,i)=>({key:`w${i}`,label:`Работа ${i}`,base:i*10,current:i*10+2,volume:1,price:1,variance:2,control:0})),10);
assert.equal(ranked.visible.length,10,'show only ten key works');
assert.equal(ranked.hiddenCount,2,'retain count of secondary works');
assert.equal(ranked.other.base,10,'aggregate secondary base without loss');
assert.equal(CalculationCore.aggregateFactors([...ranked.visible,ranked.other]).variance,ranked.total.variance,'retain full factor bridge');
assert.equal(CalculationCore.residualFactor({base:100,current:145,explained:30}),15,'residual factor');

const boqRecords=[
 {kqCode:'KQ.01',kqName:'Земляные работы',quantity:10,laborHours:20,machineHours:3,cost:1000,materialsCost:70},
 {kqCode:'KQ-01',kqName:'Земляные работы',quantity:5,laborHours:8,machineHours:2,cost:600,materialsCost:30},
 {kqCode:'KQ 02',kqName:'Монтаж',quantity:4,laborHours:12,machineHours:1,cost:800}
];
const kq2=DataAdapter.aggregateKq2(boqRecords);
assert.equal(kq2.length,2,'KQ-2 groups');
assert.equal(kq2.reduce((total,row)=>total+row.cost,0),2400,'BOQ cost conservation');
assert.equal(kq2.find(row=>row.code==='KQ-01').materialsCost,100,'materials remain separate and aggregate by KQ-2');
assert.equal(kq2.find(row=>row.code==='KQ-02').materialsCost,null,'missing materials data stays unavailable');
assert.equal(DataAdapter.aggregateKq2([{kqCode:'KQ-03',cost:4,materialsCost:0}])[0].materialsCost,0,'explicit zero is distinct from missing materials');
const materialKinds=DataAdapter.setMaterialKind({},'KQ.01','Металлоконструкции');
assert.equal(JSON.parse(JSON.stringify(materialKinds))['KQ-01'],'Металлоконструкции','material kind persists in version JSON');
assert.deepEqual(DataAdapter.setMaterialKind(materialKinds,'KQ-01',''),{},'clearing assignment removes kind');
assert.equal(DataAdapter.normalizeMaterialKinds({'KQ-02':' Кабель ',bad:{name:'object'}})['KQ-02'],'Кабель','normalize imported kinds');
assert.throws(()=>DataAdapter.setMaterialKind({},'KQ-01','x'.repeat(81)),/Некорректный/,'reject overlong material label');
assert.equal(kq2.reduce((total,row)=>total+row.quantity,0),19,'BOQ quantity conservation');
const workItems=DataAdapter.linkKsgToKq2([
 {workId:'w1',kqCode:'KQ-01',name:'Земляные работы',unit:'м3',plannedQuantity:15,volumes:[5,5,5]},
 {workId:'w2',kqCode:'KQ-02',name:'Монтаж',unit:'шт',plannedQuantity:4,volumes:[1,1,1,1]},
 {workId:'w3',kqCode:'KQ-99',name:'Новая работа',unit:'шт',plannedQuantity:2,volumes:[2]}
],kq2);
assert.equal(workItems[0].scheduleQuantity,15,'KSG monthly conservation');
assert.equal(workItems.filter(row=>row.matchRule==='exact').length,2,'matched KSG rows');
const chain=DataAdapter.workChainControl(kq2,workItems);
assert.equal(chain.boqCost,2400,'chain BOQ cost');
assert.equal(chain.matchedRows,2,'chain matches');
assert.equal(chain.unmatchedRows,1,'chain unmatched');
assert.equal(chain.rows.find(row=>row.code==='KQ-01').quantityVariance,0,'KQ-01 volume control');
const portfolioResult=(revenue,cost)=>({revenue:Array(12).fill(revenue),direct:Array(12).fill(cost),indirect:Array(12).fill(0),costs:Array(12).fill(cost),profit:Array(12).fill(revenue-cost),inflow:Array(12).fill(revenue),operatingPayments:Array(12).fill(cost),vatPay:Array(12).fill(0),ncf:Array(12).fill(revenue-cost),cumulative:Array.from({length:12},(_,m)=>(m+1)*(revenue-cost))});
const portfolioEntries=[{contractId:'d1',number:'A1',version:{id:'v1',name:'Базовая',year:2026,currency:'USD',fxRate:0},result:portfolioResult(100,40)},{contractId:'d2',number:'A2',version:{id:'v2',name:'Текущая',year:2026,currency:'USD',fxRate:0},result:portfolioResult(30,10)}];
const portfolio=CalculationCore.aggregateContractor(portfolioEntries);
assert.equal(portfolio.status,'ready','same currency contracts can be aggregated in contract currency');
assert.equal(portfolio.currency,'USD','aggregation retains source currency');
assert.equal(portfolio.totals.revenue[0],130,'revenue is sum of selected contracts');
assert.equal(portfolio.totals.cumulative[11],960,'cash accumulation is recomputed from combined NCF');
assert.ok(portfolio.control.every(x=>x===0),'monthly portfolio cash reconciles to contract results');
assert.ok(portfolio.warnings.some(x=>x.includes('Курс')),'missing FX warns without inventing RUB total');
assert.equal(CalculationCore.aggregateContractor([{...portfolioEntries[1],version:{...portfolioEntries[1].version,currency:'RUB'}} ,portfolioEntries[0]]).status,'blocked','mixed currencies cannot be summed');
const mixedFx=CalculationCore.aggregateContractor([
 {...portfolioEntries[0],version:{...portfolioEntries[0].version,fxRate:80}},
 {...portfolioEntries[1],version:{...portfolioEntries[1].version,currency:'RUB',fxRate:1}}
]);
assert.equal(mixedFx.status,'ready','mixed currency contracts convert when contractual FX is supplied');
assert.equal(mixedFx.currency,'RUB');
assert.equal(mixedFx.totals.revenue[0],8030,'each contract is converted before summation');
assert.equal(mixedFx.control[11],0,'converted cumulative cash reconciles');
const differingContractRates=CalculationCore.aggregateContractor([
 {...portfolioEntries[0],version:{...portfolioEntries[0].version,fxRate:80}},
 {...portfolioEntries[1],version:{...portfolioEntries[1].version,fxRate:90}}
]);
assert.equal(differingContractRates.totals.revenue[0],130);
assert.equal(differingContractRates.rubTotals.revenue[0],10700,'RUB equivalent applies each contract rate');
assert.equal(CalculationCore.aggregateContractor([{...portfolioEntries[1],version:{...portfolioEntries[1].version,year:2027}},portfolioEntries[0]]).status,'blocked','different years cannot be summed');
assert.equal(CalculationCore.aggregateContractor([{...portfolioEntries[1],version:{...portfolioEntries[1].version,portfolioYearMissing:true}},portfolioEntries[0]]).status,'blocked','inferred default year cannot be silently merged');
assert.equal(CalculationCore.aggregateContractor([{...portfolioEntries[1],number:'A1'},portfolioEntries[0]]).status,'blocked','duplicate contract numbers cannot be summed');
assert.equal(CalculationCore.aggregateContractor([]).status,'blocked','empty portfolio does not produce zero total');
const giantResult=portfolioResult(0,0);for(const key of ['revenue','profit','inflow','ncf'])giantResult[key][0]=1e308;giantResult.cumulative.fill(1e308);
assert.equal(CalculationCore.aggregateContractor(portfolioEntries.map(item=>({...item,result:giantResult}))).status,'blocked','arithmetic overflow cannot appear as a portfolio total');
const inconsistent=portfolioResult(30,10);inconsistent.cumulative[5]+=10;
assert.match(CalculationCore.aggregateContractor([portfolioEntries[0],{...portfolioEntries[1],result:inconsistent}]).errors[0],/Месяц 6/,'monthly cash mismatch blocks portfolio');
console.log('CALCULATION CORE TESTS: OK');
