import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const base=process.env.TEST_URL||'http://127.0.0.1:4173/work-and-ai/';
const out=resolve('verification/local/description-browser');
await mkdir(out,{recursive:true});
const fixtures=JSON.parse(await readFile('data/evaluation/matching-v2-development.json','utf8'));
fixtures.cases.push(...JSON.parse(await readFile('data/evaluation/matching-v2-replacement-check.json','utf8')).cases);
const snapshot=JSON.parse(await readFile('public/data/occupations.json','utf8'));
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:1000}});
const report={base,date:new Date().toISOString(),status:'FAIL',checks:[],errors:[]};
page.on('pageerror',error=>report.errors.push(String(error)));
try{
 await page.goto(base);
 await page.getByRole('button',{name:/describe your work/i}).click();
 for(const id of ['U01','V02','H-M2-01','V06']){
  const fixture=fixtures.cases.find(f=>f.id===id);
  await page.getByRole('textbox',{name:'A few specific responsibilities, in English'}).fill(fixture.input);
  await page.getByRole('button',{name:'Search by meaning',exact:true}).click();
  await page.locator('.refine [role="status"]').filter({hasText:'Enhanced matching finished'}).waitFor({timeout:120000});
  assert.equal(await page.getByRole('alert').count(),0);
  const cards=page.locator('.candidate');
  const codes=await cards.locator('.code').allTextContents();
  assert.match(codes[0],new RegExp(fixture.expectedLead));
  for(const code of fixture.required||[])assert(codes.some(text=>text.includes(code)),`${id} missing ${code}`);
  if(fixture.allowed)for(const text of codes)assert(fixture.allowed.some(code=>text.includes(code)),`${id} unexpected ${text}`);
  for(const [code,roleCode] of Object.entries(fixture.expectedRoles||{})){
   const card=cards.filter({has:page.locator('.code',{hasText:code})});
   const role=snapshot.occupations.find(o=>o.code===code).roles.find(r=>r.code===roleCode);
   assert.equal(await card.locator('strong').innerText(),role.title);
   assert((await card.locator('.attribution').innerText()).includes(roleCode));
  }
  if(id==='U01'){
   await page.screenshot({path:resolve(out,'people-analytics.png'),fullPage:true});
   await cards.first().click();
   const occupation=snapshot.occupations.find(o=>o.code===fixture.expectedLead);
   const role=occupation.roles.find(r=>r.code===fixture.expectedRoles[occupation.code]);
   assert.equal(await page.locator('#occupation-heading').innerText(),occupation.title);
   assert.equal(await page.locator('.occupation > .description').innerText(),role.description);
   assert.equal(await page.locator('.metrics .stat').first().innerText(),occupation.exposure);
   await page.getByRole('button',{name:'Add to comparison',exact:true}).click();
  }
  report.checks.push({id,candidates:codes});
 }
 assert.equal(await page.locator('.comparison thead th').count(),2);
 assert.match(await page.locator('#occupation-heading').innerText(),/Data scientists/i);
 assert.deepEqual(report.errors,[]);
 report.status='PASS';
 console.log(JSON.stringify(report));
}finally{
 await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 await browser.close();
}
