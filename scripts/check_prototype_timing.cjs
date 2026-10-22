/* Opt-in prototype calculation on isolated localhost, synthetic profiles only. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8016';assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const out=path.resolve(process.env.LAYOUT_OUTPUT||'output/prototype-timing');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'}),checks=[],errors=[];
 try{
  for(const university of ['sutd','leti'])for(const language of ['ru','en'])for(const scenario of ['known','repeat','unknown']){
   const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);
   page.on('pageerror',e=>errors.push(e.message));await page.route('https://st.max.ru/**',r=>r.abort());
   await page.goto(base);await page.locator('#start-plan').waitFor();
   try{
    await page.evaluate(async({university,language,scenario})=>{
     await api('/me/onboarding','POST',{profile:{...profile,university_id:university,language,consent:true,reminders_enabled:false,arrival_status:'arrived',age_band:'adult',study_status:'active',citizenship:'Synthetic country',stay_over_90_days:true,fingerprinting_completed:false,migration_basis:'study',visa_regime:'visa',entry_purpose:'study',residence_type:'dorm',entry_at:scenario==='unknown'?null:'2026-10-05',arrival_at:scenario==='unknown'?null:'2026-10-05T10:00:00+03:00',visa_expiry:scenario==='unknown'?null:'2027-02-25',registration_expiry:scenario==='unknown'?null:'2027-03-13',last_medical_completed_at:scenario==='repeat'?'2025-10-05':null},preparation:'unknown',office_package:'unknown',registration:'unknown',confirmed:true,idempotency_key:crypto.randomUUID()});
     await refreshSnapshot();lang=language;navigate({name:'plan'},true);
    },{university,language,scenario});
    assert.equal(await page.evaluate(()=>config.prototype_timing),true);assert.equal(await page.locator('.prototype-label').count(),0);
    const tasks=await page.evaluate(()=>plan.tasks);
    if(scenario==='unknown'){
     assert.ok(tasks.filter(t=>t.family==='M07').every(t=>t.dates.every(d=>!d.computed_at)));
     assert.equal(await page.evaluate(()=>effectiveProfile().entry_at),null);
     await page.reload();await page.waitForFunction(()=>authState==='ready'&&plan.tasks.length);checks.push(`${university}/${language}/unknown`);continue;
    }
    const families=scenario==='repeat'?['M10']:['M03','M04','M05','M06','M07','M08'];
    for(const family of families){
     const task=tasks.find(t=>t.family===family&&t.engine_status!=='superseded');assert.ok(task);
     assert.equal(task.engine_status,'actionable');assert.ok(task.dates[0].computed_at);
     if(['M05','M10'].includes(family))assert.equal(task.dates[0].computed_at,'2026-11-04');
     for(const width of [320,390,1280]){
      await page.setViewportSize({width,height:844});await page.evaluate(key=>navigate({name:'task',key},true),task.task_key);
      const text=await page.locator('.task-detail').innerText();
      assert.doesNotMatch(text,/В исследовании|не проверены для вас|Применимость к вашей ситуации нужно проверить|Research indicates|Your exemptions|Applicability needs checking|календарь рабочих дней|working-day calendar/);
      assert.equal(await page.locator('.task-date-value').first().innerText(),await page.evaluate(value=>formatDate(value),task.dates[0].computed_at));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
      if(task.expected_result_i18n){
       assert.match(await page.locator('.task-expected p').innerText(),/[.!?…]$/);
       const order=await page.evaluate(()=>{
        const expected=document.querySelector('.task-expected');
        const before=selector=>Array.from(document.querySelectorAll(selector)).every(e=>!!(e.compareDocumentPosition(expected)&Node.DOCUMENT_POSITION_FOLLOWING));
        const after=selector=>Array.from(document.querySelectorAll(selector)).every(e=>!!(expected.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_FOLLOWING));
        const documents=Array.from(document.querySelectorAll('.task-section')).filter(e=>['Что подготовить','What to prepare'].includes(e.querySelector('h2')?.textContent));
        return before('.task-instruction, .task-contact, .task-remaining')&&documents.every(e=>!!(e.compareDocumentPosition(expected)&Node.DOCUMENT_POSITION_FOLLOWING))&&after('.task-help, .task-result');
       });
       assert.equal(order,true,`${family}: instructions/contact before outcome; help/results after`);
      }
      if(['M03','M05','M10'].includes(family)){
       const nav=page.locator('.bottom-tabs');
       await nav.evaluate(e=>{e.style.position='static';e.style.transform='none';});
       try{await page.screenshot({path:path.join(out,`${university}-${language}-${scenario}-${family}-${width}.png`),fullPage:true});}
       finally{await nav.evaluate(e=>e.removeAttribute('style'));}
      }
      checks.push(`${university}/${language}/${scenario}/${family}/${width}`);
     }
    }
    if(scenario==='known'){
     const medical=tasks.find(t=>t.family==='M05');await page.evaluate(key=>navigate({name:'task',key},true),medical.task_key);
     await page.locator('[data-medical-completed]').click();await page.locator('#event-form [name=occurred_at]').fill('2026-10-18');
     await page.locator('#event-form input[type=checkbox][required]').check();await page.locator('#event-form button[type=submit]').click();await page.locator('#result-plan').click();
     await page.reload();await page.waitForFunction(()=>authState==='ready'&&plan.tasks.length);
     const next=await page.evaluate(()=>plan.tasks.find(t=>t.family==='M10'&&t.engine_status!=='superseded'));
     assert.equal(next.dates[0].computed_at,'2027-11-17');
     assert.equal(await page.evaluate(()=>effectiveProfile().last_medical_completed_at),'2026-10-18');
     const finger=tasks.find(t=>t.family==='M06');await page.evaluate(key=>navigate({name:'task',key},true),finger.task_key);
     await page.locator('[data-fingerprinting-completed]').click();await page.locator('#event-form [name=occurred_at]').fill('2026-10-18');
     await page.locator('#event-form input[type=checkbox][required]').check();await page.locator('#event-form button[type=submit]').click();await page.locator('#result-plan').click();
     await page.reload();await page.waitForFunction(()=>authState==='ready'&&plan.tasks.length);
     assert.equal(await page.evaluate(()=>effectiveProfile().fingerprinting_completed),true);
     await page.evaluate(key=>navigate({name:'task',key},true),next.task_key);
     await page.locator('#detail-reference').click();await page.locator('.task-information').waitFor();
     assert.match(await page.locator('.task-information').innerText(),language==='ru'?/демонстрационной модели/:/demonstration timing model/);
    }
   }finally{await page.evaluate(async()=>api('/me/profile','DELETE'));await page.close();}
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks,errors},null,2));
  console.log(`PASS: ${checks.length} checks, both universities/RU/EN, 320/390/1280; concrete dates, repeat examination, unknown anchors, completion/reload.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
