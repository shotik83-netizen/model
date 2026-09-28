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
const bankStart=source.indexOf('function buildBankActuals('),bankEnd=source.indexOf('function buildFactoringActuals(',bankStart);
const bankCtx=vm.createContext({
 rowWithHeaders:()=>({row:0,cols:{date:1,contractor:3,contract:4,currency:5,gross:6,net:7,purpose:12,type:14,project:16}}),
 sourceProfile:()=>({}),norm:x=>String(x??'').toLowerCase().replace(/[\s\p{P}]/gu,''),
 sourceDate:x=>x instanceof Date?x:new Date(x),numeric:x=>Number(x)
});
vm.runInContext(source.slice(bankStart,bankEnd)+';this.buildBankActuals=buildBankActuals;',bankCtx);
const bankRow=(party,type,contract='ERP-1',purpose='Оплата по договору 4700134128')=>{
 const x=Array(17).fill('');x[1]=new Date('2026-03-03T00:00:00Z');x[3]=party;x[4]=contract;x[5]='USD';x[6]=120;x[7]=100;x[12]=purpose;x[14]=type;x[16]='Проект';return x;
};
const olderAdvance=bankRow('Другой подрядчик','Аванс');olderAdvance[1]=new Date('2025-12-03T00:00:00Z');
const reversal=bankRow('Другой подрядчик','Аванс');reversal[6]=-24;reversal[7]=-20;
const bank={sheets:[{name:'Платежи',rows:[[],bankRow('Другой подрядчик','Аванс'),reversal,bankRow('Другой подрядчик','Оплата по факту'),bankRow('ООО Подрядчик','Оплата по факту'),bankRow('Другой подрядчик','Аванс','Другой ERP'),olderAdvance]}]};
const actual=bankCtx.buildBankActuals(bank,{contractor:'ООО Подрядчик',contractNumber:'ERP-1',project:'Проект'},'4700134128',2026,'USD');
assert.equal(actual.advances[2],80,'advance and its signed reversal are included when contract, project and purpose match');
assert.equal(actual.payments[2],100,'ordinary payment still requires the named counterparty');
assert.deepEqual([...actual.advanceCounterparties],['Другой подрядчик'],'counterparty difference is disclosed');
const opening=bankCtx.buildBankActuals(bank,{contractor:'ООО Подрядчик',contractNumber:'ERP-1',project:'Проект'},'4700134128',2026,'USD',{beforeYear:2026});
assert.equal(opening.advances[11],100,'advance from the preceding year is available for opening balance');
console.log('BANK DOCUMENT LINK TESTS: OK');
