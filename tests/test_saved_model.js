const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync('src/app.js', 'utf8');
const start = code.indexOf('function modelInputKey(');
const end = code.indexOf('function makeTable(', start);
let calculations = 0;
const context = {
  clone: value => JSON.parse(JSON.stringify(value)),
  CalculationCore: {calculateModel: () => {calculations++; return {profit: [42]};}},
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
console.log('SAVED MODEL CACHE: OK');
