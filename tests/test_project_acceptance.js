'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/app.js'),'utf8');
const start=source.indexOf('function reconcileProjectAcceptance(');
const end=source.indexOf('function longitudinalTable(',start);
assert(start>=0&&end>start);
const context=vm.createContext({
 sum:values=>values.reduce((total,value)=>total+Number(value||0),0),
 factThrough:v=>v.actualThroughMonth||0
});
vm.runInContext(source.slice(start,end)+';this.reconcile=reconcileProjectAcceptance;',context);
const series=()=>Array(12).fill(0);
const historical={id:'pilot_source_2025',year:2025,revenueBasis:'ksg',actualThroughMonth:12,drivers:{ksgRevenue:series(),ks2Accepted:series(),primaryExecuted:series()}};
const current={id:'pilot',year:2026,revenueBasis:'ksg',actualThroughMonth:6,workSourceMeta:{blockers:[]},drivers:{ksgRevenue:series(),ks2Accepted:series(),primaryExecuted:series()}};
const future={id:'pilot_ksg_2027',year:2027,revenueBasis:'ksg',actualThroughMonth:0,drivers:{ksgRevenue:series(),ks2Accepted:series(),primaryExecuted:series()}};
historical.drivers.ksgRevenue[10]=10;historical.drivers.primaryExecuted[11]=8;
current.drivers.ksgRevenue[4]=30;current.drivers.ksgRevenue[8]=20;
current.drivers.primaryExecuted[5]=20;current.drivers.ks2Accepted[8]=15;
future.drivers.ksgRevenue[0]=40;future.drivers.ks2Accepted[1]=28;
const scope={versions:[historical,current,future]};
const fact=[historical.drivers.primaryExecuted[11],current.drivers.primaryExecuted[5]];
context.reconcile(scope,current);
const check=current.workSourceMeta.acceptanceReconciliation;
assert.equal(check.execution,100);
assert.equal(check.documented,28);
assert.equal(check.originalForecast,43);
assert.equal(check.unaccepted,29);
assert.equal(check.allocated,29);
assert.deepEqual([historical.drivers.primaryExecuted[11],current.drivers.primaryExecuted[5]],fact,'signed KS-2 documents are immutable');
assert.equal(current.drivers.ks2Accepted[8],15+29*15/43,'remaining acceptance follows the forecast KS-2 in 2026');
assert.equal(future.drivers.ks2Accepted[1],28+29*28/43,'remaining acceptance follows the forecast KS-2 in 2027');
assert.equal(future.drivers.ks2Accepted[0],0,'execution month does not receive a premature KS-2');
assert.ok(Math.abs(check.documented+current.drivers.ks2Accepted[8]+future.drivers.ks2Accepted[1]-check.execution)<1e-9);

const noForecast={id:'closed',year:2026,revenueBasis:'ksg',actualThroughMonth:12,workSourceMeta:{blockers:[]},drivers:{ksgRevenue:series(),ks2Accepted:series(),primaryExecuted:series()}};
noForecast.drivers.ksgRevenue[0]=10;noForecast.drivers.primaryExecuted[1]=8;
context.reconcile({versions:[noForecast]},noForecast);
assert.equal(noForecast.workSourceMeta.acceptanceReconciliation.allocated,0);
assert.match(noForecast.workSourceMeta.blockers.join(' '),/нет прогнозных месяцев/);
console.log('PROJECT ACCEPTANCE RECONCILIATION: OK');
