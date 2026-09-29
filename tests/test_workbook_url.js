const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('src/app.js','utf8');
const line=source.split('\n').find(s=>s.startsWith('async function readWorkbook('));
assert(line,'Workbook reader is present');
const context={TextDecoder,Uint8Array,unzip:async()=>{throw Error('ZIP_REACHED')},parseDelimited:(text,sep)=>[[text,sep]]};
vm.createContext(context);vm.runInContext(line+';this.read=readWorkbook;',context);
(async()=>{
 const zip=Uint8Array.from([0x50,0x4b,0x03,0x04]).buffer;
 await assert.rejects(context.read(zip,'download.aspx?id=contractor'),/ZIP_REACHED/);
 await assert.rejects(context.read(zip,'contractor.xlsx?download=1'),/ZIP_REACHED/);
 await assert.rejects(context.read(new TextEncoder().encode('<!doctype html><html>').buffer,'contractor.xlsx'),/страницу SharePoint/);
 const csv=await context.read(new TextEncoder().encode('a;b').buffer,'source.csv?download=1');
 assert.strictEqual(csv.sheets[0].rows[0][1],';');
 console.log('WORKBOOK URL FORMAT TESTS: OK');
})().catch(e=>{console.error(e);process.exitCode=1});
