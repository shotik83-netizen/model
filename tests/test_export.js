const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const code = fs.readFileSync('src/app.js', 'utf8');
const exportCode = code.slice(code.indexOf('function crc32('), code.indexOf('function downloadBlob('));
const months = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];
const series = n => Array(12).fill(n);
const context = {
  Blob, TextEncoder, APP: 'test', MONTHS: months,
  COST_DEFS: [['direct','Тест','test']], SERIES: [['volume','Объём']], SOURCE_KEYS:[['boq','BOQ']], CURRENCIES:{USD:'Доллар',RUB:'Рубль'},
  clone: x => JSON.parse(JSON.stringify(x)), fxOf: () => 80,
  modelInputKey: v => JSON.stringify(v),
  sum: a => a.reduce((x,y) => x+y, 0), factThrough:v=>Number(v.actualThroughMonth)||0,
  columnName: n => String.fromCharCode(65+n),
  calcModel: () => ({revenue:series(4),direct:series(1),indirect:series(0),costs:series(1),profit:series(3),inflow:series(2),operatingPayments:series(1),vatPay:series(0),ncf:series(1),cumulative:Array.from({length:12},(_,i)=>i+1),rows:{test:series(1)}})
};
vm.createContext(context);
vm.runInContext(exportCode + ';this.make=contractorWorkbookV2;', context);
vm.runInContext(fs.readFileSync('src/calculation-core.js','utf8')+';this.CalculationCore=CalculationCore;',context);
const editCode=code.slice(code.indexOf('function applyWorkbookEdits('),code.indexOf('async function contractorFromUrl('));
const validateCode=code.slice(code.indexOf('function validateContractorFile('),code.indexOf('function validateConfig('));
vm.runInContext(validateCode+editCode+';this.applyEdits=applyWorkbookEdits;this.readVersion=modelVersionFromBook;this.mergeVersion=applyModelVersion;this.loadLinked=loadLinkedModels;',context);
const contractor = {id:'c1',name:'Проверка',contracts:[{id:'d1',number:'1',name:'Договор',versions:[{id:'v1',name:'2026',year:2026,currency:'USD',fxRate:80,parameters:{test:{value:3,method:'fixed'}},drivers:{volume:series(2),physicalVolume:series(2),directPeople:series(1),indirectPeople:series(1),equipmentHours:series(260),payments:series(2),advances:series(0),factoring:series(0)}}]}]};
(async () => {
  const archive = Buffer.from(await context.make(contractor).arrayBuffer());
  assert(!contractor.contracts[0].versions[0].savedModel, 'Экспорт не изменяет рабочую версию');
  const readRows={sheets:[{name:'Параметры',rows:[['Договор','Версия','Валюта'],['1','2026','USD',80,'Тест','Прямые',5,'fixed','','Из файла',0,true,true,true,'USD']]},{name:'Модель',rows:[['Договор'],['1','2026',2026,'USD',80,'Источник: Объём',...series(7)]]} ]};
  context.applyEdits(contractor,readRows);
  assert.strictEqual(contractor.contracts[0].versions[0].parameters.test.value,5);
  assert.strictEqual(contractor.contracts[0].versions[0].drivers.volume[0],7);
  if(process.env.EXPORT_CHECK_PATH)fs.writeFileSync(process.env.EXPORT_CHECK_PATH,archive);
  const xml = archive.toString('utf8');
  for (const sheet of ['Свод','Детальная модель','Факторный анализ','Оценка KQ-2','Параметры','_RATES','_SOURCE','_DATA']) assert(xml.includes(`name="${sheet}"`));
  for (const label of ['ФИНАНСОВАЯ МОДЕЛЬ','Финансовый результат','Состояние','Сохранённая модель']) assert(xml.includes(label),label);
  assert(xml.includes('state="hidden"'), 'Служебный лист остаётся скрытым');
  assert(xml.includes('FF16324F'), 'Палитра Excel соответствует интерфейсу');
  assert(xml.indexOf('<sheetFormatPr')<xml.indexOf('<cols>'), 'Порядок элементов листа соответствует структуре XLSX');
  const selected=Buffer.from(await context.make(contractor,'v1').arrayBuffer()).toString('utf8');
  assert(selected.includes('&quot;selectedModel&quot;'), 'Файл связан с выбранной версией');
  assert(selected.includes('name="_SOURCE"')&&selected.includes('name="Детальная модель"'), 'Видимая модель отделена от исходных рядов');
  assert(selected.includes('CF накопительно')&&selected.includes('Финансовый результат'), 'Видимые денежные показатели сохранены');
  assert(xml.includes('&quot;savedModel&quot;'), 'Готовый результат сохранён в книге');
  const saved=JSON.parse(JSON.stringify(contractor));saved.contracts[0].versions[0].savedModel={inputKey:'fixture',result:{revenue:series(1)}};
  const book={sheets:[{name:'_DATA',rows:[['Служебные данные'],[JSON.stringify({application:'test',fileType:'contractor',schemaVersion:2,selectedModel:{versionId:'v1'},contractor:saved})]]}]};
  const imported=context.readVersion(book,'c1','1');assert.strictEqual(imported.version.id,'v1');
  const other=JSON.parse(JSON.stringify(contractor));other.contracts[0].versions.push({...other.contracts[0].versions[0],id:'v2',name:'Вторая'});
  context.mergeVersion(other,imported,'https://example.test/models/v1.xlsx');
  assert.strictEqual(other.contracts[0].versions.length,2);
  assert.strictEqual(other.contracts[0].versions[0].modelFileUrl,'https://example.test/models/v1.xlsx');
  assert.strictEqual(other.contracts[0].versions[1].id,'v2');
  assert.throws(()=>context.readVersion(book,'c1','другой договор'),/другому договору/);
  context.location={origin:'https://app.example'};context.safeURL=url=>new URL(url);context.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});context.readWorkbook=async()=>book;context.modelInputKey=()=> 'fixture';
  const linked=JSON.parse(JSON.stringify(other));linked.contracts[0].versions[0].savedModel=null;
  await context.loadLinked(linked);
  assert(linked.contracts[0].versions[0].savedModel?.result,'При наличии ссылки загружается сохранённый расчёт');
  assert.strictEqual(linked.contracts[0].versions[1].id,'v2','Другие версии остаются на месте');
  const base={id:'old',currency:'USD',fxRate:80,drivers:{otherRevenue:series(0),directPeople:series(1),indirectPeople:series(1),equipmentHours:series(260)},workItems:[{stableKey:'work',name:'Работа',unit:'м',volumes:series(1),rate:2}]},current={...base,id:'new',factorBaseVersionId:'old',workItems:[{stableKey:'work',name:'Работа',unit:'м',volumes:series(2),rate:3}]};
  const bridge=vm.runInContext('factorExportRows',context)({versions:[base,current],number:'1'},current);
  assert(bridge.some(row=>row[0]==='Ключевые работы · денежная оценка и причины'));
  const workRow=bridge.find(row=>row[0]==='Работа');assert(workRow&&Math.abs(workRow[3]-workRow[4]-workRow[5])<1e-9);
  for (const formula of ['G4+G5','G3-G6','G8-G9-G10','G11+0','G12+H11','SUM(G6:R6)',"&apos;_RATES&apos;!G2/1000000"]) assert(xml.includes(`<f>${formula}</f>`), formula);
  console.log('MODEL XLSX EXPORT: OK');
})().catch(e => { console.error(e); process.exitCode=1; });
