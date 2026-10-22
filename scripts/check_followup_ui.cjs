/* Synthetic localhost profiles only. Error-recovery responses are explicitly modeled. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8015';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const output=path.resolve(process.env.LAYOUT_OUTPUT||'output/followup');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 const page=await browser.newPage({viewport:{width:390,height:844}}),checks=[],errors=[];
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://st.max.ru/**',r=>r.abort());
 const inspect=async label=>{
  const m=await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,small:[...document.querySelectorAll('button,input,select,textarea,summary')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden'&&e.type!=='checkbox').filter(e=>{const r=e.getBoundingClientRect();return r.height<43.9||r.width<43.9;}).map(e=>e.textContent.trim().slice(0,90))}));
  assert.equal(m.overflow,false,label);assert.deepEqual(m.small,[],label);checks.push({label,...m});
 };
 const shot=async label=>{await inspect(label);await page.screenshot({path:path.join(output,label+'.png')});fs.writeFileSync(path.join(output,label+'.txt'),await page.locator('body').innerText());};
 const route=async next=>{await page.evaluate(next=>navigate(next,true),next);};
 const setLanguage=async language=>{await page.locator('[data-language='+language+']').click();await page.waitForFunction(language=>lang===language&&profile.language===language,language);};
 const start=async tenant=>{
  await page.goto(base);await page.evaluate(()=>sessionStorage.clear());await page.reload();await page.locator('#start-plan').waitFor();
  await page.evaluate(async tenant=>{await api('/me/onboarding','POST',{profile:{...profile,university_id:tenant,consent:true,reminders_enabled:false,arrival_status:'arrived',age_band:'adult',study_status:'active',migration_basis:'study',visa_regime:'visa',entry_purpose:'study',residence_type:'dorm',entry_at:'2026-10-10',arrival_at:'2026-10-10T12:00:00+03:00',visa_expiry:'2027-01-20'},preparation:'unknown',office_package:'partial',registration:'submitted',confirmed:true,idempotency_key:crypto.randomUUID()});await refreshSnapshot();navigate({name:'plan'},true);},tenant);
 };
 try{
 for(const tenant of ['sutd','leti']){
  await start(tenant);
  for(const language of ['ru','en']){
   await setLanguage(language);
   for(const width of [320,390,1280]){
    await page.setViewportSize({width,height:844});await page.locator('[data-nav=events]').click();
    assert.equal(await page.locator('[data-event]').count(),12);
    assert.equal(await page.locator('#event-parser-form').isVisible(),false);
    await shot(`${tenant}-${language}-${width}-events`);
    await page.locator('[data-event=address_changed]').click();
    assert.equal(await page.locator('#parse-event').count(),0);
    assert.equal(await page.locator('[data-same-place-row]').isVisible(),true);
    await page.locator('[name=residence_type]').selectOption('private');
    assert.equal(await page.locator('[data-same-place-row]').isVisible(),false);
    await page.locator('[name=occurred_at]').fill('2026-10-18');
    await page.locator('[data-nav=events]').click();await page.locator('#keep-editing').click();
    assert.equal(await page.locator('[name=occurred_at]').inputValue(),'2026-10-18');
    await page.reload();await page.locator('#event-form').waitFor();
    assert.equal(await page.locator('[name=residence_type]').inputValue(),'private');
    assert.equal(await page.locator('[data-same-place-row]').isVisible(),false);
    await shot(`${tenant}-${language}-${width}-move-draft`);
    await page.locator('[data-nav=profile]').click();await page.locator('#discard-draft').click();
    await page.locator('[data-field=study_status]').click();await page.locator('#field-event').click();
    assert.equal(await page.locator('[name=status]').inputValue(),'');
    await page.locator('[data-nav=profile]').click();await page.locator('[data-field=migration_basis]').click();await page.locator('#field-event').click();
    assert.equal(await page.evaluate(()=>route.type),'status_changed');
    await page.locator('[data-nav=plan]').click();
   }
  }
  await page.setViewportSize({width:390,height:844});await setLanguage('ru');
  await page.locator('[data-nav=events]').click();await page.locator('details summary').click();
  await page.locator('#event-text').fill('Я переехал');
  await page.reload();await page.waitForFunction(()=>authState==='ready');
  await page.locator('#event-text').waitFor();
  assert.equal(await page.locator('#event-text').inputValue(),'Я переехал');
  await page.locator('#parse-event').click();await page.locator('#event-form').waitFor();
  assert.equal(await page.evaluate(()=>route.type),'address_changed');
  // A generated suggestion does not save a fact until the student confirms.
  assert.equal(await page.evaluate(async()=> (await api('/me/events')).events.filter(e=>e.type==='address_changed').length),0);
  await page.locator('[name=occurred_at]').fill('2026-10-18');await page.locator('[name=residence_type]').selectOption('private');
  await page.locator('#event-form input[type=checkbox][required]').check();await page.locator('#event-form button[type=submit]').click();await page.locator('#result-history').click();
  assert.ok((await page.locator('.history-timeline').innerText()).includes('Переезд'));
  await shot(tenant+'-move-history');
  // Model two recoverable server errors at the transport boundary; no fake result is persisted.
  for(const [code,destination] of [['result_unavailable','plan'],['result_already_recorded','history']]){
   for(const language of ['ru','en']){
    await setLanguage(language);
    const key=await page.evaluate(()=>plan.tasks.find(t=>t.process==='documents'&&t.engine_status!=='superseded').task_key);
    await route({name:'task',key});await page.locator('[data-result=question]').click();await page.locator('[name=confirmed]').check();
    const url='**/api/me/tasks/**/results';await page.route(url,r=>r.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error_code:code,detail:'MODELED_SERVER_ERROR'})}));
    await page.locator('#result-form button[type=submit]').click();await page.locator('.form-error button').waitFor();
    assert.ok(!(await page.locator('.form-error').innerText()).includes('MODELED_SERVER_ERROR'));
    await shot(`${tenant}-${language}-${code}`);await page.unroute(url);
    await page.locator('.form-error button').click();await page.locator('#keep-editing').click();
    assert.equal(await page.locator('[name=confirmed]').isChecked(),true);
    await page.locator('.form-error button').click();await page.locator('#discard-draft').click();
    await page.waitForFunction(name=>route.name===name,destination);
   }
  }
  await page.evaluate(async()=>{const get=()=>plan.tasks.find(t=>t.process==='visa_renewal'&&t.engine_status!=='superseded');await api('/me/tasks/'+get().task_key+'/results','POST',{outcome:'submitted',confirmed:true,idempotency_key:crypto.randomUUID()});await refreshSnapshot();await api('/me/tasks/'+get().task_key+'/results','POST',{outcome:'received',occurred_at:'2026-10-19',document_expiry:'2027-10-20',confirmed:true,idempotency_key:crypto.randomUUID()});await refreshSnapshot();navigate({name:'history'},true);});
  await page.locator('.history-timeline').waitFor();const historyText=await page.locator('.history-timeline').innerText();assert.match(historyText,/2027/);
  for(const language of ['ru','en']){await setLanguage(language);await page.locator('.history-timeline').waitFor();await shot(`${tenant}-${language}-cycles`);}
  // Erase only this script's own synthetic profile.
  await page.evaluate(async()=>api('/me/profile','DELETE'));
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify(checks,null,2));
 console.log(`PASS: ${checks.length} measured screens; both universities/languages; parser, dirty guards, reload, profile routing, modeled errors, real saved move and document cycles.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
