/* Synthetic late-entry profiles on an isolated localhost preview. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8016';
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const out=path.resolve(process.env.LAYOUT_OUTPUT||'output/late-entry');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'}),checks=[],errors=[];
 try{
  for(const university of ['sutd','leti'])for(const language of ['ru','en']){
   const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);
   page.on('pageerror',e=>errors.push(e.message));await page.route('https://st.max.ru/**',r=>r.abort());
   await page.goto(base);await page.locator('#start-plan').waitFor();
   try{
    await page.evaluate(async({university,language})=>{
     await api('/me/onboarding','POST',{profile:{...profile,language,university_id:university,consent:true,reminders_enabled:false,arrival_status:'arrived',age_band:'adult',study_status:'active',migration_basis:'study',visa_regime:'visa',entry_purpose:'study',residence_type:'dorm',entry_at:'2026-10-05',arrival_at:'2026-10-05T10:00:00+03:00',visa_expiry:'2027-02-25',registration_expiry:'2027-03-13'},preparation:'unknown',office_package:'completed',registration:'received',confirmed:true,idempotency_key:crypto.randomUUID()});
     await refreshSnapshot();const documents=plan.tasks.find(t=>t.process==='documents');
     await api('/me/tasks/'+encodeURIComponent(documents.task_key)+'/results','POST',{outcome:'completed',confirmed:true,idempotency_key:crypto.randomUUID()});
     await refreshSnapshot();lang=language;navigate({name:'plan'},true);
    },{university,language});
    const before=await page.evaluate(async()=>JSON.stringify(await api('/me/results')));
    const past=await page.evaluate(()=>plan.tasks.filter(t=>t.presentation_stage==='before'&&t.availability==='past'));
    assert.equal(past.length,3);assert.ok(past.every(t=>t.user_status!=='completed'));
    assert.equal(await page.evaluate(()=>RoadmapView.currentStage(plan.tasks,effectiveProfile())),'study');
    assert.ok(await page.evaluate(()=>RoadmapView.progress(plan.tasks,'arrival').pending>0));
    const capture=async name=>{
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
     await page.screenshot({path:path.join(out,`${university}-${language}-${name}.png`),fullPage:true});checks.push(`${university}/${language}/${name}`);
    };
    for(const width of [320,390,1280]){
     await page.setViewportSize({width,height:844});await page.evaluate(()=>navigate({name:'plan'},true));
     await page.locator('[data-stage=before].passed').waitFor();
     assert.match(await page.locator('[data-stage=before]').innerText(),language==='ru'?/Вы уже приехали/:/already arrived/);
     assert.equal(await page.locator('[data-stage=arrival].done').count(),0);
     await capture('home-'+width);
     await page.locator('[data-stage=before]').click();assert.doesNotMatch(await page.locator('.stage-summary').innerText(),/нет действий|No tasks/);
     assert.doesNotMatch(await page.locator('.task-stack').innerText(),/Сначала укажите|First add|Нет отметки|No completion reported/);await capture('before-'+width);
    }
    await page.setViewportSize({width:390,height:844});
    for(const task of past){
     await page.evaluate(key=>navigate({name:'task',key},true),task.task_key);
     assert.equal(await page.locator('details, .task-timing, .task-no-date, .task-attention, .task-expected, [data-result]').count(),0);
     assert.equal(await page.locator('.task-context').count(),0);
     await capture(task.process);
     await page.reload();await page.locator('.task-heading').waitFor();
     await page.locator('#detail-reference').click();await page.locator('.task-information').waitFor();
     assert.equal(await page.locator('.reference-instruction').innerText(),task.action_i18n[language]);
     assert.equal(await page.locator('.task-documents>li').count(),task.documents_i18n[language].length-(task.document_instruction_indices||[]).length);
     assert.equal(await page.locator('.reference-source').count(),task.source_snapshot.length);
     if(task.contact)assert.ok(await page.locator('.task-contact').isVisible());
     await page.locator('[data-back]').click();assert.equal(await page.evaluate(()=>route.key),task.task_key);
    }
    await page.evaluate(()=>navigate({name:'plan'},true));await page.reload();await page.locator('[data-stage=before].passed').waitFor();
    assert.equal(await page.evaluate(async()=>JSON.stringify(await api('/me/results'))),before,'Browsing must not fabricate reports');
   }finally{await page.evaluate(async()=>api('/me/profile','DELETE'));await page.close();}
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify({checks,errors},null,2));
  console.log(`PASS: ${checks.length} layouts; both universities/RU/EN; past phase, unresolved arrival, past cards, references, reload; no fabricated results.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
