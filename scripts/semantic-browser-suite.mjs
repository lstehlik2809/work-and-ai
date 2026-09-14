import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {runBrowserProcess} from './browser-process.mjs';

const engines=(process.env.TEST_ENGINES||'chromium,firefox,webkit').split(',');
if(!engines.length||engines.some(name=>!['chromium','firefox','webkit'].includes(name))||new Set(engines).size!==engines.length)throw Error('Specify distinct supported browser engines.');
const out=process.env.OUTPUT_DIR||'verification/local/semantic-browser';
await mkdir(out,{recursive:true});
const report={status:'FAIL',date:new Date().toISOString(),engines:[]};
let currentEngine;
try{
 for(const name of engines){
  currentEngine=name;
  console.log(`${name}: starting isolated browser verification`);
  await runBrowserProcess(['scripts/semantic-browser-check.mjs'],{label:name,timeoutMs:360000,env:{...process.env,TEST_ENGINES:name,OUTPUT_DIR:`${out}/${name}`}});
  const result=JSON.parse(await readFile(`${out}/${name}/report.json`,'utf8'));
  if(result.status!=='PASS'||result.engines.length!==1||result.engines[0].name!==name)throw Error(`${name}: missing successful browser report`);
  report.engines.push(result.engines[0]);
 }
 report.status='PASS';
}catch(error){
 report.error=String(error);
 try{
  const last=JSON.parse(await readFile(`${out}/${currentEngine}/report.json`,'utf8')).engines[0];
  last.failure ||= report.error;report.engines.push(last);
  console.error(`${currentEngine}: FAILED; last recorded stage: ${last.stage}`);
 }catch{}
 throw error;
}
finally{await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');}
