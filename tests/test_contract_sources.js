const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const app = fs.readFileSync(require('node:path').join(__dirname, '../src/app.js'), 'utf8');
const start = app.indexOf('function workSourcePath(');
const end = app.indexOf('function sourceProfile(', start);
assert(start >= 0 && end > start);
const context = {};
vm.createContext(context);
vm.runInContext(app.slice(start, end) + '\nthis.sourcePath=workSourcePath;', context);

const c = {sourceMapping: {sources: {
  boq: {path: 'data/sources/boq.xlsx'},
  ksg: {path: 'data/sources/ksg.xlsx'},
  payments: {path: 'data/sources/payments.xlsx'}
}}};
const first = {id: 'd_pilot_4700134128', sourceProfiles: {}};
const second = {id: 'd_second', sourceProfiles: {
  boq: {path: 'data/contracts/second/estimate.xlsx'},
  ksg: {path: 'data/contracts/second/schedule.xlsx'},
  payments: {path: 'data/contracts/second/bank.xlsx'}
}};
const path = context.sourcePath;
assert.equal(path(c, first, {}, 'boq'), 'data/sources/boq.xlsx');
assert.equal(path(c, second, {}, 'boq'), 'data/contracts/second/estimate.xlsx');
assert.equal(path(c, second, {}, 'ksg'), 'data/contracts/second/schedule.xlsx');
assert.equal(path(c, second, {}, 'payments'), 'data/contracts/second/bank.xlsx');
assert.equal(path(c, second, {}, 'primary_documents'), '');
assert.equal(path(c, second, {sourceFiles: {boq: 'data/contracts/second/revised-estimate.xlsx'}}, 'boq'), 'data/contracts/second/revised-estimate.xlsx');
assert.equal(path(c, first, {}, 'boq'), 'data/sources/boq.xlsx');
console.log('CONTRACT SOURCE ISOLATION: OK');
