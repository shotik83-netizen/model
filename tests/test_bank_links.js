'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/app.js'),'utf8');
const start=source.indexOf('function countLinkedBankPayments(');
const end=source.indexOf('async function loadWorkSources(',start);
assert(start>=0&&end>start);
const ctx=vm.createContext({});
vm.runInContext(source.slice(start,end)+'\n'+
 'function norm(x){return String(x??"").toLowerCase().replace(/[\\s\\p{P}]/gu,"");}\n'+
 'function numberOrZero(x){return Number(x)||0;}\nthis.count=countLinkedBankPayments;',ctx);
const row=(currency,contract,construction,amount)=>{
 const r=Array(13).fill('');r[3]='ООО Подрядчик';r[4]=contract;r[5]=currency;r[6]=amount;r[12]=`Оплата по договору ${construction}`;return r;
};
const book={sheets:[{rows:[[],row('USD','ERP-1','4700134128',120),row('USD','ERP-1','4700134128',120),row('RUB','ERP-1','4700134128',120),row('USD','ERP-2','4700134128',120),row('USD','ERP-1','другой',120)]}]};
const identity={contractor:'ООО Подрядчик',contractNumber:'ERP-1'};
assert.equal(ctx.count(book,identity,'4700134128','USD',[120]),1,'one document cannot confirm two identical payments');
assert.equal(ctx.count(book,identity,'4700134128','USD',[120,120]),2,'two documents match two distinct payments');
assert.equal(ctx.count(book,identity,'4700134128','RUB',[120]),1,'currency selects only matching payment');
assert.equal(ctx.count(book,{...identity,contractNumber:'ERP-2'},'4700134128','USD',[120]),1,'ERP alias is required');
assert.equal(ctx.count(book,identity,'wrong','USD',[120]),0,'construction contract is required');
console.log('BANK DOCUMENT LINK TESTS: OK');
