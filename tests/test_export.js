const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const code = fs.readFileSync('src/app.js', 'utf8');
const exportCode = code.slice(code.indexOf('function crc32('), code.indexOf('function downloadBlob('));
const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
const series = n => Array(12).fill(n);
const context = {
  Blob, TextEncoder, APP: 'test', MONTHS: months,
  COST_DEFS: [['direct','Тест','test']], SERIES: [['volume','Объём']], CURRENCIES:{USD:'Доллар',RUB:'Рубль'},
  clone: x => JSON.parse(JSON.stringify(x)), fxOf: () => 80,
  modelInputKey: v => JSON.stringify(v),
  sum: a => a.reduce((x,y) => x+y, 0),
  columnName: n => String.fromCharCode(65+n),
  calcModel: () => ({revenue:series(4),direct:series(1),indirect:series(0),costs:series(1),profit:series(3),inflow:series(2),operatingPayments:series(1),vatPay:series(0),ncf:series(1),cumulative:Array.from({length:12},(_,i)=>i+1),rows:{test:series(1)}})
};
vm.createContext(context);
vm.runInContext(exportCode + ';this.make=contractorWorkbookV2;', context);
const editCode=code.slice(code.indexOf('function applyWorkbookEdits('),code.indexOf('async function contractorFromUrl('));
vm.runInContext(editCode+';this.applyEdits=applyWorkbookEdits;',context);
const contractor = {id:'c1',name:'Проверка',contracts:[{number:'1',name:'Договор',versions:[{name:'2026',year:2026,currency:'USD',parameters:{test:{value:3,method:'fixed'}},drivers:{volume:series(2),physicalVolume:series(2),directPeople:series(1),indirectPeople:series(1),equipmentHours:series(260),payments:series(2),advances:series(0),factoring:series(0)}}]}]};
(async () => {
  const archive = Buffer.from(await context.make(contractor).arrayBuffer());
  assert(!contractor.contracts[0].versions[0].savedModel, 'Экспорт не изменяет рабочую версию');
  const readRows={sheets:[{name:'Параметры',rows:[['Договор','Версия','Валюта'],['1','2026','USD',80,'Тест','Прямые',5,'fixed','','Из файла',0,true,true,true,'USD']]},{name:'Модель',rows:[['Договор'],['1','2026',2026,'USD',80,'Источник: Объём',...series(7)]]} ]};
  context.applyEdits(contractor,readRows);
  assert.strictEqual(contractor.contracts[0].versions[0].parameters.test.value,5);
  assert.strictEqual(contractor.contracts[0].versions[0].drivers.volume[0],7);
  if(process.env.EXPORT_CHECK_PATH)fs.writeFileSync(process.env.EXPORT_CHECK_PATH,archive);
  const xml = archive.toString('utf8');
  for (const sheet of ['Свод','Параметры','Модель','Детальная модель','_DATA']) assert(xml.includes(`name="${sheet}"`));
  assert(xml.includes('&quot;savedModel&quot;'), 'Готовый результат сохранён в книге');
  for (const formula of ['G4+G5','G3-G6','G8-G9-G10','G11+0','G12+H11','SUM(G6:R6)',"&apos;Параметры&apos;!G2/1000000"]) assert(xml.includes(`<f>${formula}</f>`), formula);
  console.log('MODEL XLSX EXPORT: OK');
})().catch(e => { console.error(e); process.exitCode=1; });
