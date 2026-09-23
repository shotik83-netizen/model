const DataAdapter=(()=>{
const CURRENCY_CODES=new Set(['RUB','USD','EUR','CNY','AED','KZT']);
const finiteNumber=(value,fallback=0)=>{const number=Number(value);return Number.isFinite(number)?number:fallback;};
const monthlySeries=value=>Array.from({length:12},(_,month)=>finiteNumber(Array.isArray(value)?value[month]:0));
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
return{CURRENCY_CODES,finiteNumber,monthlySeries,moneyContext,stableKey};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=DataAdapter;

