/* Real local API, disposable synthetic students only. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8016';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const out=path.resolve(process.env.LAYOUT_OUTPUT||'output/visa-submission');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'}),checks=[],errors=[];
 try {
  for(const university of ['sutd','leti'])for(const language of ['ru','en']) {
   const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);
   page.on('pageerror',e=>errors.push(e.message));await page.route('https://st.max.ru/**',r=>r.abort());
   await page.goto(base);await page.locator('#start-plan').waitFor();
   try {
    const key=await page.evaluate(async({university,language})=>{
     await api('/me/onboarding','POST',{profile:{...profile,language,university_id:university,consent:true,reminders_enabled:false,arrival_status:'arrived',age_band:'adult',study_status:'active',migration_basis:'study',visa_regime:'visa',entry_purpose:'study',residence_type:'dorm',entry_at:'2026-10-01',arrival_at:'2026-10-01T10:00:00+03:00',visa_expiry:'2027-02-25'},preparation:'unknown',office_package:'completed',registration:'received',confirmed:true,idempotency_key:crypto.randomUUID()});
     await refreshSnapshot();lang=language;const key=plan.tasks.find(t=>t.process==='visa_renewal').task_key;navigate({name:'task',key},true);return key;
    },{university,language});
    await page.locator('[data-result=submitted]').click();
    await page.reload();await page.locator('#result-form').waitFor();
    assert.equal(await page.locator('input[type=date]').count(),0);
    assert.equal(await page.locator('.result-explanation').count(),0);
    for(const width of [320,390]){
     await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
     await page.screenshot({path:path.join(out,`${university}-${language}-${width}.png`),fullPage:true});
    }
    await page.locator('[name=confirmed]').check();await page.locator('#result-form button[type=submit]').click();await page.locator('#result-plan').click();
    await page.reload();await page.waitForFunction(()=>authState==='ready'&&profile.consent&&plan.tasks.length);
    assert.equal(await page.evaluate(key=>plan.tasks.find(t=>t.task_key===key).workflow_status,key),'waiting');
    const saved=await page.evaluate(async()=> (await api('/me/results')).results.find(r=>r.process==='visa_renewal'));
    assert.equal(saved.occurred_at,null);
    await page.locator('[data-history]').click();await page.locator(`[data-edit-result="${saved.id}"]`).waitFor();
    assert.doesNotMatch(await page.locator('.history-item').filter({has:page.locator(`[data-edit-result="${saved.id}"]`)}).innerText(),/Дата результата|Result date/);
    // Simulate an existing dated report, then correct it through the current UI.
    const legacy=await page.evaluate(async({key,id})=>{
     await api('/me/tasks/'+encodeURIComponent(key)+'/results','POST',{outcome:'submitted',occurred_at:'2026-10-18',confirmed:true,supersedes_report_id:id,idempotency_key:crypto.randomUUID()});
     await refreshSnapshot();navigate({name:'history'},true);
     return (await api('/me/results')).results.find(r=>r.supersedes_report_id===id);
    },{key,id:saved.id});
    assert.ok(legacy);
    await page.locator(`[data-edit-result="${legacy.id}"]`).click();await page.locator('#result-form').waitFor();
    assert.equal(await page.locator('[name=occurred_at]').count(),0);
    await page.locator('[name=confirmed]').check();await page.locator('#result-form button[type=submit]').click();await page.locator('#result-plan').click();
    const corrected=await page.evaluate(async id=>(await api('/me/results')).results.find(r=>r.supersedes_report_id===id),legacy.id);
    assert.equal(corrected.occurred_at,'2026-10-18');
    await page.locator('[data-history]').click();await page.locator(`[data-edit-result="${corrected.id}"]`).waitFor();
    const row=page.locator('.history-item').filter({has:page.locator(`[data-edit-result="${corrected.id}"]`)});
    assert.match(await row.innerText(),language==='ru'?/Дата результата: 18/:/Result date: 18/);
    await page.evaluate(key=>navigate({name:'task',key},true),key);await page.locator('[data-result=received]').click();
    assert.equal(await page.locator('[name=document_expiry]').count(),1);
    assert.equal(await page.locator('[name=occurred_at]').count(),0);
    checks.push({university,language,submissionWithoutDate:true,waitingAfterReload:true,legacyDateRetained:true,receiptDatesRetained:true});
   } finally {await page.evaluate(async()=>api('/me/profile','DELETE'));await page.close();}
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks,errors},null,2));
  console.log('PASS: 4 renewal flows, both universities/RU/EN; submission, reload, history, legacy correction, receipt fields; 8 mobile screenshots.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
