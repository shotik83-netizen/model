const CalculationCore=(()=>{
const number=value=>{const result=Number(value);return Number.isFinite(result)?result:0;};
const sum=values=>values.reduce((total,value)=>total+number(value),0);
const toRub=(amount,fxRate)=>{const rate=number(fxRate);return rate>0?number(amount)*rate:NaN;};
const fromRub=(amount,fxRate)=>{const rate=number(fxRate);return rate>0?number(amount)/rate:NaN;};
function factorBridge({q0=0,p0=null,q1=0,p1=null}={}){
 q0=number(q0);q1=number(q1);
 if(p0==null&&p1==null)return{status:'unmatched',base:0,current:0,volume:0,price:0,variance:0,control:NaN};
 let base,current,volume,price,status='matched';
 if(p0==null){p1=number(p1);base=0;current=q1*p1;volume=current;price=0;status='new';}
 else if(p1==null){p0=number(p0);base=q0*p0;current=0;volume=-base;price=0;status='removed';}
 else{p0=number(p0);p1=number(p1);base=q0*p0;current=q1*p1;volume=(q1-q0)*p0;price=q1*(p1-p0);}
 const variance=current-base,control=current-(base+volume+price);
 return{status,base,current,volume,price,variance,control};
}
function aggregateFactors(rows){
 return rows.reduce((total,row)=>{for(const key of ['base','current','volume','price','variance','control'])total[key]+=number(row[key]);return total;},{base:0,current:0,volume:0,price:0,variance:0,control:0});
}
function compareWorkItems(baseItems=[],currentItems=[],{baseFx=1,currentFx=1}={}){
 const group=items=>items.reduce((map,item,index)=>{
  const key=String(item.stableKey||item.workId||item.id||`row-${index}`),quantity=sum(Array.isArray(item.volumes)?item.volumes:[item.quantity??item.plannedQuantity]),rate=number(item.rate??item.actualRate??item.currentRate??item.contractRate);
  if(!map.has(key))map.set(key,{key,label:String(item.name||item.label||key),code:String(item.kq2||item.kqCode||''),unit:String(item.unit||''),quantity:0,weightedAmount:0,rateCount:0});
  const row=map.get(key);row.quantity+=quantity;row.weightedAmount+=quantity*rate;row.rateCount+=rate?1:0;
  return map;
 },new Map());
 const base=group(baseItems),current=group(currentItems),keys=new Set([...base.keys(),...current.keys()]);
 const rows=[...keys].map(key=>{
  const left=base.get(key),right=current.get(key),q0=left?.quantity||0,q1=right?.quantity||0;
  const rawP0=left?(q0?left.weightedAmount/q0:0):null,rawP1=right?(q1?right.weightedAmount/q1:0):null;
  const p0=rawP0==null?null:toRub(rawP0,baseFx),p1=rawP1==null?null:toRub(rawP1,currentFx),bridge=factorBridge({q0,p0,q1,p1});
  return{key,label:right?.label||left?.label||key,code:right?.code||left?.code||'',unit:right?.unit||left?.unit||'',q0,rawP0,q1,rawP1,p0,p1,...bridge};
 }).sort((a,b)=>(a.code||'').localeCompare(b.code||'')||a.label.localeCompare(b.label));
 return{rows,total:aggregateFactors(rows)};
}
return{number,sum,toRub,fromRub,factorBridge,aggregateFactors,compareWorkItems};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=CalculationCore;
