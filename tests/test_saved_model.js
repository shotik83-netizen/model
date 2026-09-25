const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync('src/app.js', 'utf8');
const start = code.indexOf('function modelInputKey(');
const end = code.indexOf('function makeTable(', start);
let calculations = 0;
const context = {
  clone: value => JSON.parse(JSON.stringify(value)),
  CalculationCore: {calculateModel: () => {calculations++; return {profit: [42],cumulative:[0]};}},
  COST_DEFS: [],
  contract: () => ({versions: []}),
  version: () => undefined,
  fxOf: () => 1,
};
vm.createContext(context);
vm.runInContext(code.slice(start, end) + ';this.modelInputKey=modelInputKey;this.calcModel=calcModel;', context);

const version = {id:'v1',dataMode:'imported',year:2026,parameters:{payroll:{value:100}},drivers:{revenue:[1]}};
version.savedModel = {inputKey:context.modelInputKey(version),result:{profit:[17]}};
assert.strictEqual(context.calcModel(version).profit[0],17);
assert.strictEqual(calculations,0,'Готовая модель не пересчитывается');
version.parameters.payroll.value=200;
assert.strictEqual(context.calcModel(version).profit[0],42);
assert.strictEqual(calculations,1,'После изменения входных данных расчёт обновляется');
const prior = {id:'v0',dataMode:'imported',year:2025,drivers:{revenue:[1]}};
const linked = {id:'v2',dataMode:'imported',year:2026,priorVersionId:'v0',drivers:{revenue:[2]}};
const scope = {versions:[prior,linked]};
const linkedKey = context.modelInputKey(linked,scope);
linked.savedModel = {inputKey:linkedKey,result:{profit:[23]}};
assert.strictEqual(context.calcModel(linked,new Set(),scope).profit[0],23);
prior.drivers.revenue[0]=3;
assert.notStrictEqual(context.modelInputKey(linked,scope),linkedKey,'Изменение предшествующего года сбрасывает кеш следующего');
assert.strictEqual(context.calcModel(linked,new Set(),scope).profit[0],42);
console.log('SAVED MODEL CACHE: OK');
