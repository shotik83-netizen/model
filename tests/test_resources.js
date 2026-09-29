const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('src/app.js','utf8');
const code=source.slice(source.indexOf('function buildResourceSeries('),source.indexOf('async function loadWorkSources('));
const context={norm:x=>String(x??'').toLowerCase().replace(/[\s\p{P}]/gu,''),sourceDate:x=>{const d=new Date(x);if(Number.isNaN(d.getTime()))throw Error('date');return d;},numberOrZero:x=>Number(x)||0,sum:a=>a.reduce((x,y)=>x+y,0),resolveFields:p=>({resolved:{contractor:{col:p.contractorColumn??2}},issues:[],headerRow:3}),colIndex:x=>x.toUpperCase().split('').reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1,Date};
vm.createContext(context);vm.runInContext(code+';this.read=buildResourceSeries;this.apply=applyResourceSeries;',context);
function book(kind){const rows=Array.from({length:8},()=>[]),offset=kind==='personnel'?9:10;rows[4][2]='Подрядчик-1';let labels=kind==='personnel'?['Основные рабочие','Косвенный персонал','Лесовики']:['Итого:'];labels.forEach((label,i)=>rows[5+i][offset]=label);for(let day=1;day<=31;day++){const col=12+day;rows[3][col]=`2026-01-${String(day).padStart(2,'0')}`;labels.forEach((_,i)=>rows[5+i][col]=i+1);}return{sheets:[{name:kind==='personnel'?'Персонал':'Техника',rows}]};}
const p=context.read(book('personnel'),{contractor:'Подрядчик-1'},2026,'personnel');assert.strictEqual(p.through,1);assert.strictEqual(p.values.directPeople[0],1);assert.strictEqual(p.values.indirectPeople[0],2);
const e=context.read(book('equipment'),{contractor:'Подрядчик-1'},2026,'equipment');assert.strictEqual(e.values.equipmentHours[0],260);
const zeroAtMonthEnd=book('personnel');zeroAtMonthEnd.sheets[0].rows[5][43]=0;assert.strictEqual(context.read(zeroAtMonthEnd,{contractor:'Подрядчик-1'},2026,'personnel').through,1);
const incomplete=book('personnel');incomplete.sheets[0].rows[5][43]=null;assert.strictEqual(context.read(incomplete,{contractor:'Подрядчик-1'},2026,'personnel').through,0);
const shifted=book('equipment');shifted.sheets[0].rows[4][2]=null;shifted.sheets[0].rows[4][5]='Подрядчик-1';shifted.sheets[0].rows[5][10]=null;shifted.sheets[0].rows[5][11]='Итого:';assert.strictEqual(context.read(shifted,{contractor:'Подрядчик-1'},2026,'equipment',{contractorColumn:5,summaryColumn:'L'}).values.equipmentHours[0],260);
assert.throws(()=>context.read(shifted,{contractor:'Подрядчик-1'},2026,'equipment',{contractorColumn:5,summaryColumn:'K'}),/итоговые строки/);
const existing={drivers:{equipmentHours:Array(12).fill(999)}};
const missing=context.apply(existing,{key:'equipment',series:e});
assert.strictEqual(existing.drivers.equipmentHours[0],260);
assert.strictEqual(existing.drivers.equipmentHours[8],0,'missing source month cannot retain a cached forecast');
assert.strictEqual(missing.length,11);
assert.throws(()=>context.read(book('personnel'),{contractor:'Другой'},2026,'personnel'),/Подрядчик/);
console.log('RESOURCE SOURCE TESTS: OK');
