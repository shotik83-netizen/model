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

const boqRecords=[
 {kqCode:'KQ.01',kqName:'Земляные работы',quantity:10,laborHours:20,machineHours:3,cost:1000},
 {kqCode:'KQ-01',kqName:'Земляные работы',quantity:5,laborHours:8,machineHours:2,cost:600},
 {kqCode:'KQ 02',kqName:'Монтаж',quantity:4,laborHours:12,machineHours:1,cost:800}
];
const kq2=DataAdapter.aggregateKq2(boqRecords);
assert.equal(kq2.length,2,'KQ-2 groups');
assert.equal(kq2.reduce((total,row)=>total+row.cost,0),2400,'BOQ cost conservation');
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
console.log('CALCULATION CORE TESTS: OK');
