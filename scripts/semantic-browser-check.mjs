import {returningVisitor} from './returning-visitor.mjs';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {chromium,firefox,webkit} from 'playwright';
const base=process.env.TEST_URL||'http://127.0.0.1:4183/work-and-ai/';
const server=process.env.TEST_URL?null:spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4183','--strictPort'],{stdio:'pipe',windowsHide:true});
const out=process.env.OUTPUT_DIR||'verification/local/semantic-browser';await mkdir(out,{recursive:true});
const report={status:'FAIL',date:new Date().toISOString(),engines:[]};
const config=JSON.parse(await readFile('src/semantic/config.json','utf8'));
const baseline=JSON.parse(await readFile('data/evaluation/live-browser-baseline.json','utf8'));
assert.equal(config.revision,'751bff37182d3f1213fa05d7196b954e230abad9');
assert.equal(baseline.baseline,'0b165d93b8bf8626b8b0935b4018d5e7d0258f58');
const codesOf=async region=>(await region.locator('.code').allTextContents()).map(text=>text.match(/\d{2}-\d{4}/)[0]);
const expectedCodes=row=>row.codes.map(text=>text.match(/\d{2}-\d{4}/)[0]);
async function bounded(operation,label,ms=30000){
 let timer;try{return await Promise.race([operation,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out after '+ms+' ms')),ms);})]);}finally{clearTimeout(timer);}
}
try{
 for(let i=0;i<100;i++){try{if((await fetch(base,{signal:AbortSignal.timeout(2000)})).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 for(const [name,type]of Object.entries({chromium,firefox,webkit}).filter(([n])=>!process.env.TEST_ENGINES||process.env.TEST_ENGINES.split(',').includes(n))){
  const result={name,version:null,stage:'starting',checks:[],requests:[],errors:[]};report.engines.push(result);
  const releases=[];
  const checkpoint=stage=>{result.stage=stage;console.log(name+': '+stage);writeFileSync(out+'/report.json',JSON.stringify(report,null,2)+'\n');};
  const finishCancelledRoute=async(route,label)=>{try{await bounded(route.abort().catch(()=>{}),label,15000);}catch(error){result.routeFailure=String(error);checkpoint('FAILED: '+result.routeFailure);}};
  const close=async(target,label)=>{checkpoint(label+' cleanup');await bounded(target.close(),label+' cleanup',15000);checkpoint(label+' closed');};
  let browser;
  try{
   checkpoint('browser launch');browser=await type.launch({headless:true,timeout:30000});result.version=browser.version();
   checkpoint('cold download and cancellation');
   const context=await browser.newContext({viewport:{width:1280,height:960},acceptDownloads:true}),page=await context.newPage();
   page.on('request',r=>result.requests.push({url:r.url(),body:r.postData()}));page.on('pageerror',e=>result.errors.push(String(e)));
   await returningVisitor(page);await page.goto(base);await page.getByRole('combobox',{name:'Show top',exact:true}).selectOption(String(baseline.requestedLimit));const title=page.getByRole('searchbox',{name:'Job title',exact:true});
   await title.fill('registered nurse');await page.locator('button.candidate').first().click();await page.getByRole('button',{name:'Add to comparison',exact:true}).click();
   assert(!result.requests.some(r=>/\.onnx|\.wasm|vectors\.bin/.test(r.url)));
   await page.getByRole('button',{name:'Find by work description',exact:true}).click();
   const input=page.getByRole('textbox',{name:'A few specific responsibilities, in English'}),meaning=page.locator('[data-method="meaning"]'),fallback=page.locator('[data-method="wording"]');
   const run=()=>page.getByRole('button',{name:'Find matches',exact:true}).click();
   const finished=()=>page.locator('.refine > [role="status"]').filter({hasText:baseline.completedPhase}).waitFor({timeout:120000});
   await input.fill(baseline.rows[0].query);
   let sawWeight,releaseWeight;const seen=new Promise(r=>sawWeight=r),release=new Promise(r=>releaseWeight=r);releases.push(()=>releaseWeight());
   await page.route('**/model_quantized.onnx',async route=>{sawWeight();await release;await finishCancelledRoute(route,name+': cancelled model route');});
   await run();await Promise.race([seen,new Promise((_,reject)=>setTimeout(()=>reject(Error('Weight download did not start')),30000))]);
   assert(await fallback.isVisible());assert((await fallback.locator('button.candidate').count())>0);
   await page.getByRole('button',{name:'Cancel matching',exact:true}).click();releaseWeight();checkpoint('cancelled route cleanup');await bounded(page.unrouteAll({behavior:'wait'}),name+': cancelled route cleanup',20000);assert(!result.routeFailure,result.routeFailure);
   assert(await fallback.isVisible());assert.equal(await meaning.count(),0);assert.equal(await page.getByRole('alert').count(),0);
   await run();await finished();assert.deepEqual(await codesOf(meaning),expectedCodes(baseline.rows[0]));
   assert.equal(await fallback.isVisible(),false);await page.getByText('Wording-only suggestions',{exact:true}).click();assert(await fallback.isVisible());
   result.checks.push('real cold semantic model download, lexical fallback, cancel and successful retry; fallback disclosure');
   checkpoint('warm inference, confirmation and exports');
   await input.fill(baseline.rows[1].query);await run();await finished();assert.deepEqual(await codesOf(meaning),expectedCodes(baseline.rows[1]));
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
   await close(context,'primary context');
   // New cache context: a real missing weight must leave fallback and comparison usable.
   checkpoint('first-load HTTP503 and retry');
   const failureContext=await browser.newContext(),failure=await failureContext.newPage();
   await failure.route('**/model_quantized.onnx',r=>r.fulfill({status:503,body:'Unavailable'}));await returningVisitor(failure);await failure.goto(base);await failure.getByRole('button',{name:'Find by work description',exact:true}).click();
   await failure.getByRole('textbox',{name:'A few specific responsibilities, in English'}).fill('I dispense prescribed medicines and advise patients about their safe use.');await failure.getByRole('button',{name:'Find matches',exact:true}).click();await failure.getByRole('alert').waitFor({timeout:120000});assert(await failure.locator('[data-method="wording"]').isVisible());
   await bounded(failure.unrouteAll({behavior:'wait'}),name+': failure route cleanup');await failure.getByRole('button',{name:'Retry matching',exact:true}).click();await failure.locator('.refine > [role="status"]').filter({hasText:'Enhanced matching finished'}).waitFor({timeout:120000});assert.deepEqual(await codesOf(failure.locator('[data-method="meaning"]')),expectedCodes(baseline.rows[2]));await close(failureContext,'failure context');
   result.checks.push('actual first-load HTTP503 failure and successful semantic model retry');
   // Editing during a pending download invalidates the old hook request as well as its worker.
   checkpoint('edit during pending download');
   const editContext=await browser.newContext(),editing=await editContext.newPage();
   await returningVisitor(editing);await editing.goto(base);await editing.getByRole('searchbox',{name:'Job title',exact:true}).fill('registered nurse');await editing.locator('button.candidate').first().click();await editing.getByRole('button',{name:'Add to comparison',exact:true}).click();
   await editing.getByRole('button',{name:'Find by work description',exact:true}).click();const editInput=editing.getByRole('textbox',{name:'A few specific responsibilities, in English'});
   let sawEditWeight,releaseEditWeight;const editSeen=new Promise(r=>sawEditWeight=r),editRelease=new Promise(r=>releaseEditWeight=r);releases.push(()=>releaseEditWeight());
   await editing.route('**/model_quantized.onnx',async route=>{sawEditWeight();await editRelease;await finishCancelledRoute(route,name+': edited model route');});
   await editInput.fill(baseline.rows[0].query);await editing.getByRole('button',{name:'Find matches',exact:true}).click();await Promise.race([editSeen,new Promise((_,reject)=>setTimeout(()=>reject(Error('Edit test weight download did not start')),30000))]);
   await editing.getByRole('button',{name:'Take a tour',exact:true}).click();
   for(let step=0;step<4;step++)await editing.locator('#guided-tour').getByRole('button',{name:'Next',exact:true}).click();
   await editing.keyboard.press('Escape');
   assert.equal(await editInput.inputValue(),baseline.rows[0].query);
   assert.equal(await editing.getByRole('button',{name:'Cancel matching',exact:true}).count(),1);
   result.checks.push('tour navigation and Escape preserve an active real semantic download and its draft');
   await editInput.fill(baseline.rows[1].query);releaseEditWeight();checkpoint('edited route cleanup');await bounded(editing.unrouteAll({behavior:'wait'}),name+': edited route cleanup',20000);assert(!result.routeFailure,result.routeFailure);await editing.waitForTimeout(500);
   assert.equal(await editing.locator('[data-method="meaning"]').count(),0);assert.equal(await editing.locator('.refine > [role="status"]').innerText(),'');assert.equal(await editing.getByRole('alert').count(),0);assert.equal(await editing.locator('[data-method="wording"]').count(),0);
   assert.match(await editing.locator('#occupation-heading').innerText(),/Registered nurses/i);assert.equal(await editing.locator('.comparison thead th').count(),2);
   await editing.getByRole('button',{name:'Find matches',exact:true}).click();await editing.locator('.refine > [role="status"]').filter({hasText:baseline.completedPhase}).waitFor({timeout:120000});assert.deepEqual(await codesOf(editing.locator('[data-method="meaning"]')),expectedCodes(baseline.rows[1]));await close(editContext,'edit context');
   result.checks.push('editing during a pending real download clears old results/status, retains confirmation/comparison and permits a new query');
   checkpoint('worker faults, races and tokenizer boundaries');
   const diagnostics=await browser.newPage();await returningVisitor(diagnostics);await diagnostics.goto(base+'diagnostics.html');await diagnostics.getByRole('button',{name:'Run worker verification',exact:true}).click();
   await diagnostics.waitForFunction(()=>{try{const r=JSON.parse(document.querySelector('#verification-output').textContent);return Boolean(r.date);}catch{return false;}},{},{timeout:240000});
   result.worker=JSON.parse(await diagnostics.locator('#verification-output').textContent());assert(!result.worker.failure,result.worker.failure);assert.deepEqual(result.worker.race.sort(),['A cancelled','B cancelled','C resolved']);
   for(const f of result.worker.faults)assert.equal(f.result,f.fault==='cache'?'success':'rejected',f.fault);
   assert.deepEqual(result.worker.boundaries.map(b=>[b.label,b.result==='accepted']),[[`${config.maxTokens} tokens`,true],[`${config.maxTokens+1} tokens`,false],['Unicode long tail',false]]);assert.match(result.worker.long,new RegExp(`${config.maxTokens} tokens`));
   result.checks.push('real worker faults, latest-query wins, configured tokenizer and Unicode boundaries, cache-unavailable inference');
   checkpoint('worker revisit and cache behavior');
   await diagnostics.reload();await diagnostics.getByRole('button',{name:'Run worker verification',exact:true}).click();
   await diagnostics.waitForFunction(()=>{try{return Boolean(JSON.parse(document.querySelector('#verification-output').textContent).date);}catch{return false;}},{},{timeout:240000});
   result.revisit=JSON.parse(await diagnostics.locator('#verification-output').textContent());assert(!result.revisit.failure);
   result.modelCacheRetained=result.revisit.cacheBefore.some(c=>c.entries.some(u=>u.includes(config.revision)&&u.endsWith('.onnx')));
   if(!result.modelCacheRetained)assert(result.revisit.real.workerRequests.some(r=>r.url.includes(config.revision)&&r.url.endsWith('.onnx')),'Uncached revisit must reload the pinned same-origin weight');
   result.checks.push(result.modelCacheRetained?'revisit retains revision-keyed model cache':'revisit succeeds by reloading the pinned weight; persistent cache unavailable');
   console.log(name,result.checks.length,'check groups passed; cleanup remains');
  }catch(error){result.failedStage=result.stage;result.failure=String(error);checkpoint('FAILED at '+result.stage);throw error;}
  finally{
   for(const release of releases)release();
   try{if(browser)await close(browser,'browser');}
   catch(error){result.failure=String(error);checkpoint('FAILED during browser cleanup');throw error;}
  }
 }
 report.status='PASS';
 console.log(JSON.stringify({status:report.status,model:config.model,revision:config.revision,engines:report.engines.map(e=>({name:e.name,version:e.version,checks:e.checks,modelCacheRetained:e.modelCacheRetained}))},null,2));
}finally{server?.kill();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2)+'\n');}
