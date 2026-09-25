const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/app.js'),'utf8');
const match=source.match(/const COST_DEFS=(\[[\s\S]*?\]);\s*const PERCENT_RATE_METHODS=/);
if(!match)throw Error('Cost definitions missing');
const defs=vm.runInNewContext(match[1]);
const core=require('../src/calculation-core.js');
const entries=JSON.parse(fs.readFileSync(0,'utf8')).map(row=>({...row,result:core.calculateModel(row.version,defs)}));
const aggregate=core.aggregateContractor(entries);
if(aggregate.status!=='ready')throw Error(aggregate.errors.join('; '));
process.stdout.write(JSON.stringify({status:aggregate.status,year:aggregate.year,currency:aggregate.currency,
 lines:aggregate.lines,totals:aggregate.totals,control:aggregate.control,warnings:aggregate.warnings,
 individual:entries.map(row=>({number:row.number,revenue:row.result.revenue,costs:row.result.costs,ncf:row.result.ncf,accepted:row.result.accepted,receipts:row.result.receipts,receivable:row.result.receivable,offsets:row.result.offsets,retention:row.result.retention,factoring:row.result.factoring,deductions:row.result.deductions}))}));
