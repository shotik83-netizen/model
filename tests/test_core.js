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
console.log('CALCULATION CORE TESTS: OK');

