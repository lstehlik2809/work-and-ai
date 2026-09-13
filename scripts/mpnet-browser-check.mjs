import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {chromium,firefox,webkit} from 'playwright';
const base=process.env.TEST_URL||'http://127.0.0.1:4183/work-and-ai/';
const server=process.env.TEST_URL?null:spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4183','--strictPort'],{stdio:'pipe',windowsHide:true});
const out='verification/local/mpnet-browser';await mkdir(out,{recursive:true});
const report={status:'FAIL',date:new Date().toISOString(),engines:[]};
const config=JSON.parse(await readFile('src/semantic/config.json','utf8'));
try{
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 for(const [name,type]of Object.entries({chromium,firefox,webkit}).filter(([n])=>!process.env.TEST_ENGINES||process.env.TEST_ENGINES.split(',').includes(n))){
  const browser=await type.launch({headless:true});
  const result={name,version:browser.version(),checks:[],requests:[],errors:[]};report.engines.push(result);
  try{
   const context=await browser.newContext({viewport:{width:1280,height:960},acceptDownloads:true}),page=await context.newPage();
   page.on('request',r=>result.requests.push({url:r.url(),body:r.postData()}));page.on('pageerror',e=>result.errors.push(String(e)));
   await page.goto(base);const title=page.getByRole('searchbox',{name:'Job title',exact:true});
   await title.fill('registered nurse');await page.locator('button.candidate').first().click();await page.getByRole('button',{name:'Add to comparison',exact:true}).click();
   assert(!result.requests.some(r=>/\.onnx|\.wasm|vectors\.bin/.test(r.url)));
   await page.getByRole('button',{name:'Find by work description',exact:true}).click();
   const input=page.getByRole('textbox',{name:'A few specific responsibilities, in English'}),meaning=page.locator('[data-method="meaning"]'),fallback=page.locator('[data-method="wording"]');
   const run=()=>page.getByRole('button',{name:'Find matches',exact:true}).click();
   const finished=()=>page.locator('.refine > [role="status"]').filter({hasText:'Enhanced matching finished'}).waitFor({timeout:120000});
   await input.fill('I install and repair electrical wiring and circuit breakers in buildings. WAI_PRIVATE_BROWSER_91');
   let sawWeight,releaseWeight;const seen=new Promise(r=>sawWeight=r),release=new Promise(r=>releaseWeight=r);
   await page.route('**/model_quantized.onnx',async route=>{sawWeight();await release;await route.continue().catch(()=>{});});
   await run();await Promise.race([seen,new Promise((_,reject)=>setTimeout(()=>reject(Error('Weight download did not start')),30000))]);
   assert(await fallback.isVisible());assert((await fallback.locator('button.candidate').count())>0);
   await page.getByRole('button',{name:'Cancel matching',exact:true}).click();releaseWeight();await page.unrouteAll({behavior:'wait'});
   assert(await fallback.isVisible());assert.equal(await meaning.count(),0);assert.equal(await page.getByRole('alert').count(),0);
   await run();await finished();assert.match(await meaning.locator('.code').first().innerText(),/47-2111/);
   assert.equal(await fallback.isVisible(),false);await page.getByText('Wording-only suggestions',{exact:true}).click();assert(await fallback.isVisible());
   result.checks.push('real cold MPNet download, lexical fallback, cancel and successful retry; fallback disclosure');
   await input.fill('I dispense prescribed medicines and advise patients about their safe use. WAI_PRIVATE_BROWSER_91');await run();await finished();assert.match(await meaning.locator('.code').first().innerText(),/29-1051/);
   const codes=await meaning.locator('.code').allTextContents(),limit=page.getByRole('combobox',{name:'Show top',exact:true});
   await limit.selectOption('1');assert.deepEqual(await meaning.locator('.code').allTextContents(),codes.slice(0,1));await limit.selectOption('10');
   assert.deepEqual((await meaning.locator('.code').allTextContents()).slice(0,codes.length),codes);assert.equal(await page.locator('.comparison thead th').count(),2);assert.match(await page.locator('#occupation-heading').innerText(),/Registered nurses/i);
   await page.getByRole('button',{name:'None of these matches',exact:true}).click();assert.equal(await meaning.count(),0);assert(await page.locator('.refine .notice').evaluate(e=>e===document.activeElement));assert((await input.inputValue()).includes('WAI_PRIVATE_BROWSER_91'));
   await page.getByRole('button',{name:'Search wording only',exact:true}).click();assert(await fallback.isVisible());
   for(const width of[320,390]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${out}/${name}-${width}.png`,fullPage:true});}
   result.checks.push('warm inference, stable result prefixes, manual confirmation/comparison, rejection focus, wording-only path and 320/390 layouts');
   const downloadWait=page.waitForEvent('download');await page.getByRole('button',{name:'Download comparison brief',exact:true}).first().click();const brief=await readFile(await(await downloadWait).path(),'utf8');assert(!brief.includes('WAI_PRIVATE_BROWSER_91'));assert(!page.url().includes('WAI_PRIVATE_BROWSER_91'));
   assert(!result.requests.some(r=>(r.url+(r.body||'')).includes('WAI_PRIVATE_BROWSER_91')));assert(result.requests.every(r=>new URL(r.url).origin===new URL(base).origin));assert.equal(result.errors.length,0);
   assert(result.requests.some(r=>r.url.includes(config.revision)&&r.url.endsWith('model_quantized.onnx')));
   await context.close();
   // New cache context: a real missing weight must leave fallback and comparison usable.
   const failureContext=await browser.newContext(),failure=await failureContext.newPage();
   await failure.route('**/model_quantized.onnx',r=>r.fulfill({status:503,body:'Unavailable'}));await failure.goto(base);await failure.getByRole('button',{name:'Find by work description',exact:true}).click();
   await failure.getByRole('textbox',{name:'A few specific responsibilities, in English'}).fill('I dispense prescribed medicines and advise patients about their safe use.');await failure.getByRole('button',{name:'Find matches',exact:true}).click();await failure.getByRole('alert').waitFor({timeout:120000});assert(await failure.locator('[data-method="wording"]').isVisible());
   await failure.unrouteAll();await failure.getByRole('button',{name:'Retry matching',exact:true}).click();await failure.locator('.refine > [role="status"]').filter({hasText:'Enhanced matching finished'}).waitFor({timeout:120000});assert.match(await failure.locator('[data-method="meaning"] .code').first().innerText(),/29-1051/);await failureContext.close();
   result.checks.push('actual first-load HTTP503 failure and successful MPNet retry');
   const diagnostics=await browser.newPage();await diagnostics.goto(base+'diagnostics.html');await diagnostics.getByRole('button',{name:'Run worker verification',exact:true}).click();
   await diagnostics.waitForFunction(()=>{try{const r=JSON.parse(document.querySelector('#verification-output').textContent);return Boolean(r.date);}catch{return false;}},{},{timeout:240000});
   result.worker=JSON.parse(await diagnostics.locator('#verification-output').textContent());assert(!result.worker.failure,result.worker.failure);assert.deepEqual(result.worker.race.sort(),['A cancelled','B cancelled','C resolved']);
   for(const f of result.worker.faults)assert.equal(f.result,f.fault==='cache'?'success':'rejected',f.fault);
   assert.deepEqual(result.worker.boundaries.map(b=>[b.label,b.result==='accepted']),[['384 tokens',true],['385 tokens',false],['Unicode long tail',false]]);assert.match(result.worker.long,/384 tokens/);
   result.checks.push('real worker faults, latest-query wins, 384/385 and Unicode boundaries, cache-unavailable inference');
   await diagnostics.reload();await diagnostics.getByRole('button',{name:'Run worker verification',exact:true}).click();
   await diagnostics.waitForFunction(()=>{try{return Boolean(JSON.parse(document.querySelector('#verification-output').textContent).date);}catch{return false;}},{},{timeout:240000});
   result.revisit=JSON.parse(await diagnostics.locator('#verification-output').textContent());assert(!result.revisit.failure);
   result.modelCacheRetained=result.revisit.cacheBefore.some(c=>c.entries.some(u=>u.includes(config.revision)&&u.endsWith('.onnx')));
   if(!result.modelCacheRetained)assert(result.revisit.real.workerRequests.some(r=>r.url.includes(config.revision)&&r.url.endsWith('.onnx')),'Uncached revisit must reload the pinned same-origin weight');
   result.checks.push(result.modelCacheRetained?'revisit retains revision-keyed model cache':'revisit succeeds by reloading the pinned weight; persistent cache unavailable');
   console.log(name,result.checks.length,'checks passed');
  }finally{await browser.close();}
 }
 report.status='PASS';
}finally{server?.kill();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');}
