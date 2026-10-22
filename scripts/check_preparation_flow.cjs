/* F01/F04: every result saved through the UI on disposable local API profiles. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8015';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const out=path.resolve(process.env.LAYOUT_OUTPUT||'output/preparation-flow');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'}),checks=[],errors=[];
 try {
  for(const tenant of ['sutd','leti'])for(const language of ['ru','en']) {
   const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);
   page.on('pageerror',e=>errors.push(e.message));await page.route('https://st.max.ru/**',r=>r.abort());
   await page.goto(base);await page.locator('#start-plan').waitFor();
   await page.evaluate(async({tenant,language})=>{
    await api('/me/onboarding','POST',{profile:{...profile,language,university_id:tenant,consent:true,reminders_enabled:false,arrival_status:'planned',age_band:'adult',study_status:'admitted',migration_basis:'study',visa_regime:'visa',residence_type:'dorm'},preparation:'not_started',confirmed:true,idempotency_key:crypto.randomUUID()});
    await refreshSnapshot();lang=profile.language;navigate({name:'plan'},true);
   },{tenant,language});
   const current=process=>page.evaluate(process=>plan.tasks.find(t=>t.process===process&&t.engine_status!=='superseded'),process);
   const open=async process=>{
    await page.locator('[data-nav=plan]').click();await page.locator('[data-stage=before]').click();
    const t=await current(process);await page.locator(`[data-task="${t.task_key}"]`).click();
   };
   let count=0;
   for(const [process,outcome,state] of [['invitation','requested','waiting'],['invitation','received','completed'],['initial_visa','submitted','waiting'],['initial_visa','received','completed'],['trip','completed','completed']]) {
    await open(process);await page.locator('[data-result='+outcome+']').click();
    if(process==='initial_visa'&&outcome==='submitted')assert.equal(await page.locator('[name=occurred_at]').count(),0);
    else assert.equal(await page.locator('[name=occurred_at]').inputValue(),'');
    if(process==='trip')for(const item of ['documents','arrival','housing'])await page.locator('[name=check_'+item+']').check();
    await page.locator('[name=confirmed]').check();await page.locator('#result-form button[type=submit]').click();
    await page.locator('#result-plan').click();count++;
    await page.reload();await page.waitForFunction(()=>authState==='ready'&&profile.consent&&!!plan.tasks.length);
    const t=await current(process);assert.equal(t.workflow_status,state);
    if(state==='completed') {
     const expectedNext={invitation:'initial_visa',initial_visa:'trip',trip:'entry_context'}[process];
     assert.equal(await page.evaluate(()=>plan.tasks.find(t=>t.task_key===plan.hero_task_key).process),expectedNext);
    }
    if(state==='waiting')assert.notEqual(t.user_status,'completed');
    const saved=await page.evaluate(async()=> (await api('/me/results')).results);assert.equal(saved.length,count);
    assert.ok(saved.every(r=>r.occurred_at===null),'Unknown result dates must stay unknown');
    assert.equal(await page.evaluate(()=>effectiveProfile().entry_at),null);
    await open(process);
    if(state==='waiting')assert.equal(await page.locator('[data-result='+outcome+']').count(),0,'Do not offer the same submission again');
    await page.locator('[data-nav=profile]').click();
    if(process==='invitation')assert.match(await page.locator('[data-field=preparation_state]').innerText(),outcome==='requested'?(language==='ru'?/Ждёте приглашение/:/Waiting for your invitation/):(language==='ru'?/Приглашение получено/:/Invitation received/));
    if(process==='initial_visa'&&outcome==='received')assert.match(await page.locator('[data-field=visa_expiry]').innerText(),language==='ru'?/Дата пока неизвестна/:/Date not known yet/);
    await page.locator('[data-nav=plan]').click();await page.locator('[data-history]').click();await page.locator('.history-timeline').waitFor();
    assert.equal(await page.locator('[data-edit-result]').count(),count);
    const latest=saved.find(r=>r.process===process&&r.outcome===outcome);
    const historyRow=page.locator('.history-item').filter({has:page.locator(`[data-edit-result="${latest.id}"]`)});
    assert.equal(await historyRow.count(),1);
    assert.ok((await historyRow.innerText()).includes(t.title_i18n[language]));
    if(process==='initial_visa'&&outcome==='submitted')assert.doesNotMatch(await historyRow.innerText(),/Дата результата|Result date/);
    else assert.match(await historyRow.innerText(),language==='ru'?/Дата результата: Неизвестна/:/Result date: Unknown/);
    const label=[tenant,language,process,outcome].join('-');checks.push({label,workflow_status:t.workflow_status,saved_results:count,unknown_dates_preserved:true});
    fs.writeFileSync(path.join(out,label+'.txt'),await page.locator('body').innerText());
   }
   // Preparation is complete, but the first entry remains a separate student report.
   await page.locator('[data-nav=plan]').click();
   assert.equal(await page.evaluate(()=>plan.tasks.find(t=>t.task_key===plan.hero_task_key).process),'entry_context');
   assert.equal((await page.evaluate(async()=>api('/me/events'))).events.length,0);
   await page.locator('[data-nav=events]').click();await page.locator('[data-event=entry_recorded]').click();
   const entryDate=await page.evaluate(()=>today());await page.locator('[name=occurred_at]').fill(entryDate);
   await page.locator('[name=entry_purpose]').selectOption('study');await page.locator('#event-form input[type=checkbox][required]').check();
   await page.locator('#event-form button[type=submit]').click();await page.locator('#result-plan').click();
   await page.reload();await page.waitForFunction(()=>authState==='ready'&&profile.consent&&!!plan.tasks.length);
   assert.equal(await page.evaluate(()=>effectiveProfile().entry_at),entryDate);
   assert.equal((await page.evaluate(async()=>api('/me/events'))).events.length,1);
   assert.equal((await current('documents')).presentation_stage,'arrival');
   assert.equal((await current('registration')).availability,'available');
   assert.equal((await page.evaluate(async()=>api('/me/results'))).results.length,5);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   await page.screenshot({path:path.join(out,`${tenant}-${language}-after-entry.png`)});
   checks.push({label:`${tenant}-${language}-entry`,entry_recorded:true,preparation_results_retained:5});
   await page.evaluate(async()=>api('/me/profile','DELETE'));await page.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));
  console.log(`PASS: ${checks.length} persisted checkpoints in 4 full preparation-to-entry browser chains; both universities/RU/EN; 20 result saves, 4 entry saves, reload, card/history/profile, unknown dates.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
