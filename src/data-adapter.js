const DataAdapter=(()=>{
const CURRENCY_CODES=new Set(['RUB','USD','EUR','CNY','AED','KZT']);
const finiteNumber=(value,fallback=0)=>{const number=Number(value);return Number.isFinite(number)?number:fallback;};
const monthlySeries=value=>Array.from({length:12},(_,month)=>finiteNumber(Array.isArray(value)?value[month]:0));
const normalizedCode=value=>String(value??'').trim().toUpperCase().replace(/[.\s_]+/g,'-').replace(/-+/g,'-');
function moneyContext(value={},fallback={}){
 const requested=String(value.currency||fallback.currency||'RUB').toUpperCase();
 const currency=CURRENCY_CODES.has(requested)?requested:'RUB';
 const raw=value.fxRate??fallback.fxRate??fallback.fx;
 const fxRate=currency==='RUB'?1:(finiteNumber(raw)>0?finiteNumber(raw):0);
 return{currency,fxRate};
}
function stableKey(parts){
 const source=parts.map(value=>String(value??'').trim().toLowerCase().replace(/\s+/g,' ')).join('|');
 let hash=2166136261;
 for(let i=0;i<source.length;i++){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619);}
 return'auto-'+(hash>>>0).toString(16).padStart(8,'0');
}
function boqRecord(value={},index=0){
 const kqCode=normalizedCode(value.kqCode||value.code),name=String(value.name||kqCode||'Позиция BOQ').trim();
 return{sourceKind:'boq',sourceRow:finiteNumber(value.sourceRow,index+1),sourceKey:String(value.sourceKey||stableKey(['boq',value.itemCode||'',kqCode,name,value.unit||'',index])),itemCode:String(value.itemCode||''),name,unit:String(value.unit||'ед.'),kqCode,kqName:String(value.kqName||name),quantity:finiteNumber(value.quantity),laborHours:finiteNumber(value.laborHours),machineHours:finiteNumber(value.machineHours),cost:finiteNumber(value.cost)};
}
function aggregateKq2(records=[]){
 const groups=new Map();
 records.map(boqRecord).forEach(row=>{if(!row.kqCode)return;const current=groups.get(row.kqCode)||{code:row.kqCode,name:row.kqName,unit:row.unit,quantity:0,laborHours:0,machineHours:0,cost:0,sourceRows:0,sourceKeys:[]};current.quantity+=row.quantity;current.laborHours+=row.laborHours;current.machineHours+=row.machineHours;current.cost+=row.cost;current.sourceRows++;current.sourceKeys.push(row.sourceKey);groups.set(row.kqCode,current);});
 return[...groups.values()].map(row=>({...row,stableKey:stableKey(['kq2',row.code]),rate:row.quantity?row.cost/row.quantity:0})).sort((a,b)=>b.cost-a.cost);
}
function ksgRecord(value={},index=0){
 const volumes=monthlySeries(value.volumes),kqCode=normalizedCode(value.kqCode||value.kq2),name=String(value.name||'Работа КСГ').trim(),unit=String(value.unit||'ед.');
 return{sourceKind:'ksg',sourceRow:finiteNumber(value.sourceRow,index+1),sourceKey:String(value.sourceKey||stableKey(['ksg',value.workId||'',kqCode,name,unit,index])),workId:String(value.workId||''),name,unit,kq1:String(value.kq1||''),kq2:kqCode,stableKey:String(value.stableKey||value.workId||stableKey(['work',kqCode,name,unit])),plannedQuantity:finiteNumber(value.plannedQuantity),scheduleQuantity:volumes.reduce((total,item)=>total+item,0),volumes};
}
function linkKsgToKq2(records=[],estimate=[]){
 const rates=new Map(estimate.map(row=>[normalizedCode(row.code),row]));
 return records.map((value,index)=>{const row=ksgRecord(value,index),match=rates.get(row.kq2);return{...row,matchRule:match?'exact':'unmatched',matchConfidence:match?1:0,contractRate:match?.rate||0,currentRate:0,actualRate:0,rate:match?.rate||0};});
}
function workChainControl(estimate=[],items=[]){
 const scheduled=new Map();
 for(const item of items){const key=normalizedCode(item.kq2),quantity=finiteNumber(item.scheduleQuantity??monthlySeries(item.volumes).reduce((a,b)=>a+b,0)),current=scheduled.get(key)||{quantity:0,cost:0,rows:0};current.quantity+=quantity;current.cost+=quantity*finiteNumber(item.rate);current.rows++;scheduled.set(key,current);}
 const rows=estimate.map(row=>{const schedule=scheduled.get(normalizedCode(row.code))||{quantity:0,cost:0,rows:0};return{...row,scheduledQuantity:schedule.quantity,scheduledCost:schedule.cost,quantityVariance:schedule.quantity-finiteNumber(row.quantity),scheduleRows:schedule.rows};});
 return{rows,boqCost:rows.reduce((total,row)=>total+finiteNumber(row.cost),0),scheduledCost:rows.reduce((total,row)=>total+finiteNumber(row.scheduledCost),0),contractQuantity:rows.reduce((total,row)=>total+finiteNumber(row.quantity),0),scheduledQuantity:rows.reduce((total,row)=>total+finiteNumber(row.scheduledQuantity),0),matchedRows:items.filter(row=>row.matchRule==='exact').length,unmatchedRows:items.filter(row=>row.matchRule!=='exact').length};
}
return{CURRENCY_CODES,finiteNumber,monthlySeries,normalizedCode,moneyContext,stableKey,boqRecord,aggregateKq2,ksgRecord,linkKsgToKq2,workChainControl};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=DataAdapter;
