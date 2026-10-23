/* A01-A03: real API state and UI reports on an isolated local preview only. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8043';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const out=path.resolve(process.env.LAYOUT_OUTPUT||'output/medical-clarification');fs.mkdirSync(out,{recursive:true});
const checks=[],failures=[],errors=[],cleanup=[];
const save=()=>fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({base,checks,failures,errors,cleanup},null,2));
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const university of ['sutd','leti'])for(const language of ['ru','en'])for(const scenario of ['conditional','review','standard']){
 const tag=`${university}-${language}-${scenario}`,context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push({tag,error:e.message}));await page.route('https://st.max.ru/**',r=>r.abort());
 const open=async t=>{await page.locator('[data-nav=plan]').click();await page.locator(`[data-stage=${t.presentation_stage}]`).click();await page.locator(`[data-task="${t.task_key}"]`).click();};
 const checkTitle=text=>assert.match(text,language==='ru'?/^Уточнить необходимость/:/^Check whether/);
 try{
  await page.goto(base);await page.locator('#start-plan').waitFor();
  await page.evaluate(async({university,language,scenario})=>{
   await api('/me/onboarding','POST',{profile:{...profile,university_id:university,language,consent:true,reminders_enabled:false,arrival_status:'arrived',entry_at:'2026-10-01',entry_purpose:'study',visa_regime:'visa',age_band:scenario==='review'?'minor':'adult',study_status:'active',migration_basis:'study',residence_type:'dorm',citizenship:'Synthetic medical check',stay_over_90_days:scenario==='conditional'?null:true,fingerprinting_completed:false},preparation:'unknown',confirmed:true,idempotency_key:crypto.randomUUID()});
   await refreshSnapshot();lang=language;navigate({name:'plan'},true);
  },{university,language,scenario});
  const prototype=await page.evaluate(()=>config.prototype_timing);
  for(const family of ['M05','M06','M10']){
   if(family==='M10')await page.evaluate(async()=>{await api('/me/profile?fields=last_medical_completed_at','PATCH',{last_medical_completed_at:'2025-10-01'});await refreshSnapshot();});
   let task=await page.evaluate(f=>plan.tasks.find(t=>t.family===f&&t.engine_status!=='superseded'),family);assert.ok(task);
   const uncertain=['conditional','needs_review'].includes(task.engine_status);
   if(scenario!=='standard')assert.equal(task.engine_status,scenario==='review'?'needs_review':'conditional');
   if(scenario==='standard'&&prototype)assert.equal(task.engine_status,'actionable');
   await open(task);
   if(uncertain){
    checkTitle(await page.locator('.task-heading h1').innerText());
    const expected=await page.locator('.task-expected').innerText();assert.match(expected,language==='ru'?/Ответ отдела/:/An answer from the office/);assert.doesNotMatch(expected,/Медосмотр пройден|фотографирование пройдены|examination completed|photography completed/);
    assert.doesNotMatch(await page.locator('.task-timing,.task-no-date').innerText(),/Выполнить до|Complete by/);
    assert.ok(task.dates.every(d=>!d.computed_at));
   }else{
    assert.equal(await page.locator('.task-heading h1').innerText(),task.title_i18n[language]);
    assert.ok((await page.locator('.task-expected').innerText()).includes(task.expected_result_i18n[language]));
   }
   for(const width of [320,390,1280]){
    await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1||document.querySelector('#screen').scrollWidth>document.querySelector('#screen').clientWidth+1),false,`${tag}/${family}/${width}`);
   }
   await page.setViewportSize({width:390,height:844});
   fs.writeFileSync(path.join(out,`${tag}-${family}-card.txt`),await page.locator('#screen').innerText());
   if(university==='sutd'&&family==='M06')await page.screenshot({path:path.join(out,`${tag}-card.png`),fullPage:true});
   await page.locator('#detail-reference').click();const reference=await page.locator('#screen').innerText();
   assert.doesNotMatch(reference,/В прототипе срок рассчитан/);
   if(prototype)assert.match(reference,language==='ru'?/используется демонстрационная модель/:/uses a demonstration timing model/);
   else assert.doesNotMatch(reference,/демонстрационная модель сроков|demonstration timing model/);
   if(uncertain){
    checkTitle(await page.locator('.task-information-subtitle').innerText());
    const section=await page.locator('.reference-instruction').locator('..').innerText();
    assert.match(section,language==='ru'?/Общий порядок процедуры[\s\S]*на случай, если необходимость процедуры для вас подтвердится/:/General procedure[\s\S]*only if the procedure is confirmed/);
    assert.equal(await page.locator('.reference-instruction').innerText(),task.action_i18n[language]);
   }
   fs.writeFileSync(path.join(out,`${tag}-${family}-reference.txt`),reference);
   if(university==='sutd'&&family==='M06')await page.screenshot({path:path.join(out,`${tag}-reference.png`),fullPage:true});
   await open(task);
   if(task.engine_status==='needs_review'&&await page.locator('#detail-profile').count()){
    await page.locator('#detail-profile').click();checkTitle(await page.locator('#screen h1').innerText());await open(task);
   }
   if(family==='M06'&&uncertain){
    for(const outcome of ['question_sent','clarified']){
     await page.locator(`[data-result=${outcome}]`).click();await page.locator('[name=confirmed]').check();await page.locator('#result-form button[type=submit]').click();await page.locator('#result-plan').click();
     await page.reload();await page.waitForFunction(()=>authState==='ready'&&plan.tasks.length);
     task=await page.evaluate(()=>plan.tasks.find(t=>t.family==='M06'&&t.engine_status!=='superseded'));assert.equal(task.reported_outcome,outcome);assert.notEqual(task.user_status,'completed');assert.ok(task.dates.every(d=>!d.computed_at));await open(task);checkTitle(await page.locator('.task-heading h1').innerText());
     assert.match(await page.locator('.task-instruction').innerText(),outcome==='question_sent'?(language==='ru'?/отправку вопроса/:/sending a question/):(language==='ru'?/получение ответа/:/receiving an answer/));
     await page.locator('[data-nav=plan]').click();await page.locator('[data-history]').click();await page.locator('.history-timeline').waitFor();assert.match(await page.locator('#screen').innerText(),outcome==='question_sent'?(language==='ru'?/Вопрос отправлен/:/Question sent/):(language==='ru'?/Ответ получен/:/Answer received/));await open(task);
    }
   }
   checks.push({tag,family,prototype,engine_status:task.engine_status});save();
  }
 }catch(e){failures.push({tag,error:e.stack});await page.screenshot({path:path.join(out,`${tag}-failure.png`),fullPage:true}).catch(()=>{});}
 finally{try{await page.evaluate(()=>api('/me/profile','DELETE'));cleanup.push(tag);}catch(e){failures.push({tag,cleanup:e.message});}await context.close();save();}
}}finally{await browser.close();save();}
console.log(JSON.stringify({checks:checks.length,failures,errors,deletedProfiles:cleanup.length}));process.exitCode=failures.length||errors.length?1:0;
})();
