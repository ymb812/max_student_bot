/* Isolated localhost only: real onboarding UI, including legacy browser drafts. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8016';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const out=path.resolve(process.env.LAYOUT_OUTPUT||'output/study-onboarding');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'}),checks=[],errors=[];
 try {
  let index=0;
  for(const tenant of ['sutd','leti'])for(const language of ['ru','en'])for(const arrival of ['planned','arrived']) {
   const status=['admitted','active','leave','unknown'][index++%4],width=arrival==='arrived'?320:390;
   const page=await browser.newPage({viewport:{width,height:844}});page.setDefaultTimeout(10000);
   page.on('pageerror',e=>errors.push(e.message));await page.route('https://st.max.ru/**',r=>r.abort());
   let submitted;
   page.on('request',r=>{if(r.url().endsWith('/api/me/onboarding')&&r.method()==='POST')submitted=r.postDataJSON();});
   await page.goto(base);await page.locator('#start-plan').waitFor();await page.locator(`[data-language=${language}]`).click();
   await page.waitForFunction(language=>lang===language,language);await page.locator('#start-plan').click();
   await page.locator(`[name=arrival_status][value=${arrival}]`).check();await page.locator('[name=university_id]').selectOption(tenant);await page.locator('#next').click();
   assert.deepEqual(await page.locator('[name=study_path] option').evaluateAll(es=>es.map(e=>e.value)),['','admitted','active','other']);
   assert.equal(await page.locator('[name=study_status]').count(),0);
   await page.locator('[name=age_band]').selectOption('adult');await page.locator('[name=migration_basis]').selectOption('study');
   await page.screenshot({path:path.join(out,`${tenant}-${language}-${arrival}-main.png`)});
   await page.locator('[name=study_path]').selectOption('other');
   assert.deepEqual(await page.locator('[name=study_status] option').evaluateAll(es=>es.map(e=>e.value)),['','leave','transferred','expelled','graduated','working','unknown']);
   await page.locator('#next').click();assert.equal(await page.evaluate(()=>step),1);
   for(const exception of ['leave','transferred','expelled','graduated','working','unknown']) {
    await page.locator('[name=study_status]').selectOption(exception);
    assert.equal(await page.evaluate(()=>onboardingDraft.study_status),exception);
   }
   await page.locator('[name=study_status]').selectOption('leave');await page.reload();await page.locator('[name=study_status]').waitFor();
   assert.equal(await page.locator('[name=study_status]').inputValue(),'leave');
   // Previous clients had study_status without the presentation-only study_path.
   await page.evaluate(()=>{delete onboardingDraft.study_path;persistOnboardingDraft();});await page.reload();await page.locator('[name=study_status]').waitFor();
   assert.equal(await page.locator('[name=study_path]').inputValue(),'other');assert.equal(await page.locator('[name=study_status]').inputValue(),'leave');
   await page.screenshot({path:path.join(out,`${tenant}-${language}-${arrival}-other.png`)});
   await page.locator('[name=study_path]').selectOption('active');assert.equal(await page.locator('[name=study_status]').count(),0);
   assert.equal(await page.evaluate(()=>onboardingDraft.study_status),'active');
   await page.locator('[name=study_path]').selectOption('other');assert.equal(await page.locator('[name=study_status]').inputValue(),'');
   await page.locator('#next').click();assert.equal(await page.evaluate(()=>step),1);
   if(['active','admitted'].includes(status))await page.locator('[name=study_path]').selectOption(status);
   else await page.locator('[name=study_status]').selectOption(status);
   await page.locator('#next').click();await page.locator('[data-back]').click();
   assert.equal(await page.locator('[name=study_path]').inputValue(),['active','admitted'].includes(status)?status:'other');
   await page.locator('#next').click();await page.locator('[name=visa_regime]').selectOption('visa_free');
   if(arrival==='arrived') {
    await page.locator('[name=entry_at_unknown]').check();await page.locator('[name=entry_purpose]').selectOption('study');
   } else if(tenant==='sutd')await page.locator('[name=study_form]').selectOption('full_time');
   await page.locator('[name=residence_type]').selectOption('dorm');await page.locator('#next').click();
   if(arrival==='arrived') {
    await page.locator('[name=office_package]').selectOption('unknown');await page.locator('[name=registration]').selectOption('unknown');await page.locator('#next').click();
   }
   await page.locator('.onboarding-summary').waitFor();
   assert.ok((await page.locator('.onboarding-summary').innerText()).includes(await page.evaluate(status=>fieldChoices('study_status').find(([v])=>v===status)[1],status)));
   await page.locator('[name=consent]').check();await page.locator('#next').click();await page.locator('[data-nav=profile]').waitFor();
   assert.equal(submitted.profile.study_status,status);assert.equal('study_path' in submitted.profile,false);
   await page.reload();await page.waitForFunction(()=>authState==='ready'&&profile.consent&&plan.tasks.length>0);
   assert.equal(await page.evaluate(()=>profile.study_status),status);
   if(status==='leave')assert.equal(await page.evaluate(()=>plan.tasks.every(t=>t.engine_status==='needs_review')),true);
   if(status==='unknown')assert.equal(await page.evaluate(()=>plan.tasks.some(t=>t.missing_fields.includes('study_status'))),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   checks.push({tenant,language,arrival,status,width,saved:true,legacy_draft:true,reload:true});
   await page.evaluate(async()=>api('/me/profile','DELETE'));await page.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));
  console.log(`PASS: ${checks.length} full UI onboarding flows; both universities/languages/arrival states; explicit exception, legacy draft, back/reload, exact API status and existing review behavior.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
