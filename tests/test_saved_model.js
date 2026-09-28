const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync('src/app.js', 'utf8');
const start = code.indexOf('function lastKs2Month(');
const end = code.indexOf('function makeTable(', start);
let calculations = 0;
let lastInput;
const context = {
  clone: value => JSON.parse(JSON.stringify(value)),
  CalculationCore: {calculateModel: v => {calculations++;lastInput=v;if(v.id==='v0')return {profit:[42],cumulative:[100],advanceBalance:[20],guaranteeBalance:[12],receivable:[9]};if(v.id==='v2'){assert.strictEqual(v.openingCash,100);assert.strictEqual(v.openingAdvance,20);assert.strictEqual(v.openingGuarantee,12);assert.strictEqual(v.openingReceivable,9);}return {profit: [42],cumulative:[0],advanceBalance:[0],guaranteeBalance:[0],receivable:[0]};}},
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
const  schedule2026={id:'s26',year:2026,dataMode:'imported',revenueBasis:'ksg',drivers:{ks2Accepted:Array(12).fill(0)}};
const schedule2027={id:'s27',year:2027,dataMode:'imported',revenueBasis:'ksg',drivers:{ks2Accepted:Array(12).fill(0)}};
schedule2026.drivers.ks2Accepted[11]=10;
schedule2027.drivers.ks2Accepted[8]=5;
const scheduled={versions:[schedule2026,schedule2027]};
const keyBefore=context.modelInputKey(schedule2026,scheduled);
context.calcModel(schedule2026,new Set(),scheduled);
assert.strictEqual(lastInput.guaranteeReleaseMonth,0,'ГУ остаётся удержанным до последней приемки в следующем году');
context.calcModel(schedule2027,new Set(),scheduled);
assert.strictEqual(lastInput.guaranteeReleaseMonth,10,'выплата ГУ в октябре после сентябрьской КС-2');
schedule2027.drivers.ks2Accepted[8]=0;schedule2027.drivers.ks2Accepted[11]=5;
assert.notStrictEqual(context.modelInputKey(schedule2026,scheduled),keyBefore,'сдвиг последней КС-2 сбрасывает кеш предыдущего года');
context.calcModel(schedule2027,new Set(),scheduled);
assert.strictEqual(lastInput.guaranteeReleaseMonth,0,'после декабрьской КС-2 выплата переносится в следующий год');
console.log('SAVED MODEL CACHE: OK');
