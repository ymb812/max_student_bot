/* Entry-only date form, real UI saves and legacy correction on disposable localhost profiles. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8029';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const out=path.resolve(process.env.LAYOUT_OUTPUT||'../audits/2026-10-22-entry-date-form/screenshots');fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[];
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});try{
 for(const university of ['sutd','leti'])for(const language of ['ru','en']){
  const page=await browser.newPage({viewport:{width:320,height:844}});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.route('https://st.max.ru/**',r=>r.abort());
  const submit=async()=>{await page.locator('#event-form input[type=checkbox][required]').check();await page.locator('#event-form button[type=submit]').click();await page.locator('#result-plan').click();};
  const reload=async()=>{await page.reload();await page.waitForFunction(()=>authState==='ready'&&profile.consent&&plan.tasks.length);};
  const history=async()=>{await page.locator('[data-nav=plan]').click();await page.locator('[data-history]').click();await page.locator('.history-timeline').waitFor();};
  try{
   await page.goto(base);await page.locator('#start-plan').waitFor();
   await page.evaluate(async({university,language})=>{await api('/me/onboarding','POST',{profile:{...profile,university_id:university,language,consent:true,reminders_enabled:false,arrival_status:'planned',age_band:'adult',study_status:'admitted',migration_basis:'study',visa_regime:'visa',residence_type:'dorm'},preparation:'visa_received',confirmed:true,idempotency_key:crypto.randomUUID()});await refreshSnapshot();lang=language;navigate({name:'plan'},true);},{university,language});
   for(const [type,date]of [['entry_recorded','2026-10-16'],['reentry_recorded','2026-10-22']]){
    await page.locator('[data-nav=events]').click();await page.locator(`[data-event=${type}]`).click();
    assert.equal(await page.locator('[name=arrival_at],input[type=datetime-local]').count(),0);
    assert.equal(await page.locator('#event-form input[type=date]').count(),1);
    assert.equal(await page.locator('[name=occurred_at]').locator('..').innerText(),language==='ru'?'Когда вы въехали в Россию?':'When did you enter Russia?');
    await page.locator('[name=occurred_at]').fill(date);await page.locator('[name=entry_purpose]').selectOption('study');
    // A previously saved named draft may still contain the removed field.
    await page.evaluate(()=>{const d=captureFormDraft();d.fields.push({key:'arrival_at',value:'2026-10-16T12:34',checked:false});sessionStorage.setItem(formDraftKey(),JSON.stringify(d));});
    await reload();assert.equal(await page.locator('[name=occurred_at]').inputValue(),date);assert.equal(await page.locator('[name=residence_type]').inputValue(),'dorm');assert.equal(await page.locator('[name=arrival_at]').count(),0);
    for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.locator('#event-form button[type=submit]').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${university}-${language}-${type}-${width}.png`)});}
    await page.setViewportSize({width:type==='entry_recorded'?320:390,height:844});await submit();await reload();
    assert.equal(await page.evaluate(()=>effectiveProfile().entry_at),date);assert.equal(await page.evaluate(()=>effectiveProfile().arrival_at),null);
    const saved=await page.evaluate(async type=>(await api('/me/events')).events.find(e=>e.type===type),type);assert.ok(!saved.payload.arrival_at);
    await history();assert.equal(await page.locator(`[data-edit-event="${saved.id}"]`).count(),1);
    await page.locator(`[data-edit-event="${saved.id}"]`).click();await page.locator('[name=occurred_at]').fill('2026-10-15');await page.locator('[data-back]').click();await page.locator('#discard-draft').click();await reload();assert.equal(await page.evaluate(()=>effectiveProfile().entry_at),date);
    checks.push({university,language,type,entry:date,arrival:null,draftRestored:true,cancelPreserved:true});
   }
   // Only setup uses API: emulate an old event that actually stored a city arrival.
   const legacy=await page.evaluate(async()=>{const r=await api('/me/events','POST',{type:'reentry_recorded',occurred_at:'2026-10-22',payload:{entry_purpose:'study',visa_regime:'visa',residence_type:'dorm',arrival_at:'2026-10-22T13:12:34+03:00'},confirmed:true,idempotency_key:crypto.randomUUID()});await refreshSnapshot();return r.event_id;});
   await history();await page.locator(`[data-edit-event="${legacy}"]`).click();assert.equal(await page.locator('[name=arrival_at]').count(),0);await page.locator('[name=entry_purpose]').selectOption('other');await submit();await reload();
   const corrected=await page.evaluate(async id=>(await api('/me/events')).events.find(e=>e.supersedes_event_id===id),legacy);assert.equal(corrected.payload.arrival_at,'2026-10-22T13:12:34+03:00');assert.equal(corrected.payload.entry_purpose,'other');
   checks.push({university,language,legacyArrivalPreserved:true});
  }finally{await page.evaluate(async()=>api('/me/profile','DELETE'));await page.close();}
 }
 assert.deepEqual(errors,[]);console.log(`PASS: ${checks.length} checkpoints, both universities/RU/EN, entry/reentry, 320/390, saves/reload/cancel, old draft and event compatibility.`);
}finally{await browser.close();fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks,errors},null,2));}})().catch(e=>{console.error(e);process.exitCode=1;});
