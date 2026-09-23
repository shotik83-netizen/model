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
return{number,sum,toRub,fromRub,factorBridge,aggregateFactors};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=CalculationCore;

