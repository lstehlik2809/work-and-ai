import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext();
const page=await context.newPage();
const report={date:new Date().toISOString(),base:'https://lstehlik2809.github.io/work-and-ai/',browser:browser.version(),fault:'cache',timeoutMs:120000,checks:[]};
await mkdir('verification/local/pages',{recursive:true});
try{
 await page.goto(report.base+'diagnostics.html');
 await page.getByRole('combobox',{name:'App failure scenario'}).selectOption('cache');
 const title=page.getByRole('searchbox',{name:'Job title'});
 await page.waitForFunction(()=>!document.querySelector('#job-title').disabled);
 await title.fill('pharmacist');await page.getByRole('button',{name:'Find occupation',exact:false}).click();await page.getByRole('button',{name:/^Pharmacists BLS/}).click();await page.getByRole('button',{name:'Add to comparison',exact:true}).click();
 report.checks.push('Ordinary search and confirmation work before meaning search with cache unavailable');
 await page.getByRole('button',{name:'Can’t find your title? Describe your work'}).click();
 await page.getByRole('textbox',{name:'A few specific responsibilities, in English'}).fill('I design roads and bridges.');
 const started=Date.now();await page.getByRole('button',{name:'Search by meaning',exact:true}).click();
 await page.locator('.refine [role=status],.refine [role=alert]').filter({hasText:/Enhanced matching finished|could not|timed out/}).first().waitFor({timeout:125000});
 report.elapsedMs=Date.now()-started;report.statusText=await page.locator('.refine [role=status],.refine [role=alert]').allTextContents();
 assert.equal(await page.getByRole('alert').count(),0);assert(report.statusText.some(x=>x.includes('Enhanced matching finished')));
 report.checks.push('Real app finishes enhanced matching with CacheStorage unavailable using production timeout');
 assert.equal(await page.locator('.comparison thead th').count(),2);
 await title.fill('registered nurse');await page.getByRole('button',{name:'Find occupation',exact:false}).click();await page.getByRole('button',{name:/^Registered Nurses BLS/}).waitFor();
 report.checks.push('Ordinary search and existing comparison remain usable afterwards');report.status='PASS';
}catch(e){report.status='FAIL';report.failure=String(e);process.exitCode=1;}
finally{await writeFile('verification/local/pages/cache-unavailable-app.json',JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify(report));}
