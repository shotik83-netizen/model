'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/app.js'),'utf8');
const start=source.indexOf('function renderComparison(){'),end=source.indexOf('function changeParameter(e){',start);
assert(start>=0&&end>start);
const core=require('../src/calculation-core.js');
const series=(n=0)=>Array(12).fill(n),result=(revenue,cost)=>({revenue:series(revenue),costs:series(cost),direct:series(cost/2),indirect:series(cost/2),profit:series(revenue-cost),cumulative:series((revenue-cost)*12),rows:{payroll:series(100),equipment:series(50),indirectPayroll:series(80)}});
const base={id:'base',name:'База',year:2026,currency:'USD',fxRate:80,drivers:{directPeople:series(2),indirectPeople:series(1),equipmentHours:series(10)},workItems:[{stableKey:'work',name:'Монтаж',unit:'м',kq2:'KQ-01',rate:10,volumes:series(2)}]};
const current={...base,id:'current',name:'Текущая',year:2027,drivers:{directPeople:series(3),indirectPeople:series(2),equipmentHours:series(12)},workItems:[{stableKey:'work',name:'Монтаж',unit:'м',kq2:'KQ-01',rate:12,volumes:series(3)}]};
const elements={compareVersion:{value:'base',innerHTML:''},factorCurrentVersion:{textContent:''},factorTable:{innerHTML:''}};
const context={CalculationCore:core,COST_DEFS:[['direct','Заработная плата','payroll'],['direct','Строительная техника','equipment'],['indirect','Заработная плата','indirectPayroll']],state:{unit:1000000,precision:0,results:result(20,10)},$:id=>elements[id],version:()=>current,contract:()=>({versions:[base,current]}),calcModel:()=>result(15,8),fxOf:v=>v.fxRate,rub:(n,v)=>n*v.fxRate,sum:arr=>arr.reduce((a,b)=>a+Number(b||0),0),esc:s=>String(s).replaceAll('&','&amp;'),unitName:()=> 'млн RUB'};
const display=(n,scale=1)=>{const value=Number((n/scale).toFixed(context.state.precision));return value===0?'—':value.toLocaleString('ru-RU',{minimumFractionDigits:context.state.precision,maximumFractionDigits:context.state.precision});};
context.fmtRaw=n=>display(n,context.state.unit);context.fmtWhole=n=>display(n);
vm.createContext(context);vm.runInContext(source.slice(start,end)+';this.renderComparison=renderComparison;',context);
for(const precision of [0,1,2]){
context.state.precision=precision;context.renderComparison();
const html=elements.factorTable.innerHTML;
assert.match(html,/Текущая модель<\/th><th>Модель сравниваемая<\/th><th>Отклонение/);
assert.match(html,/Текущая · 2027/);
assert.match(html,/База · 2026/);
assert.match(html,/Ключевые физические объёмы/);
assert.match(html,/Прямой труд, расчётные чел.-ч/);
assert.match(html,/Средняя ставка прямого ФОТ/);
assert.match(html,/Прочие доходы/);
assert.match(html,/Корректировка выполнения к оценке BOQ\/КСГ/);
assert.match(html,/Корректировка к детализации прямых расходов/);
assert.match(html,/<th>Фактор объёма<\/th><th>Фактор цены<\/th>/);
assert.doesNotMatch(html,/class="factor-reason"/);
for(const row of html.matchAll(/<tr class="factor-(?:line|total|group) level-\d+"[^>]*>(.*?)<\/tr>/g)){
 const cells=[...row[1].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(x=>x[1].replace(/<[^>]*>/g,''));
 assert.equal(cells.length,6);
 if(cells[4]==='—'&&cells[5]==='—')continue;
 const parse=x=>x==='—'?0:Number(x.replace(/\s/g,'').replace(',','.'));
 assert.ok(Math.abs(parse(cells[3])-parse(cells[4])-parse(cells[5]))<1e-6,cells.join(' | '));
}
assert.match(html,/Косвенные/);
assert.match(html,/Финансовый результат/);
assert.match(html,/data-factor-group="physical"/);
assert.match(html,/data-factor-parent="physical" hidden/);
assert.match(html,/data-factor-group="income-work"/);
assert.match(html,/data-factor-parent="income-work" hidden/);
assert.match(html,/data-factor-group="direct"/);
assert.match(html,/data-factor-parent="direct" hidden/);
assert.match(html,/data-factor-group="indirect"/);
assert.match(html,/data-factor-parent="indirect" hidden/);
}
console.log('FACTOR BRIDGE VIEW: OK');
