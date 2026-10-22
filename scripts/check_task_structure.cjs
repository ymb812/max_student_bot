/* Local real API, disposable profiles. No private snapshots or MAX requests. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8012';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const output=path.resolve(process.env.LAYOUT_OUTPUT||'output/task-structure');
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'}),tokens=[],errors=[],checks=[];
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.setDefaultTimeout(10000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://st.max.ru/**',r=>r.abort());
 const inspect=async label=>{
  const issues=await page.evaluate(()=>{
   const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
   const buttons=[...document.querySelectorAll('button')].filter(visible);
   return {overflow:document.documentElement.scrollWidth>innerWidth+1,
    small:buttons.filter(e=>{const r=e.getBoundingClientRect();return r.width<43.9||r.height<43.9;}).map(e=>e.textContent.trim())};
  });
  assert.equal(issues.overflow,false,label+' overflow');assert.deepEqual(issues.small,[],label+' touch targets');checks.push(label);
 };
 const shot=async name=>{
  await page.locator('#toast').evaluate(e=>e.style.display='none');
  // A fixed navigation bar otherwise obscures the middle of a full-page capture.
  const nav=page.locator('.bottom-tabs'),old=await nav.getAttribute('style');
  await nav.evaluate(e=>{e.style.position='static';e.style.transform='none';e.style.width='100%';});
  try{await page.screenshot({path:path.join(output,name+'.png'),fullPage:true});}finally{await nav.evaluate((e,old)=>{if(old===null)e.removeAttribute('style');else e.setAttribute('style',old);},old);}
 };
 const start=async(tenant,scenario)=>{
  await page.goto(base);await page.evaluate(()=>sessionStorage.clear());await page.reload();await page.locator('#start-plan').waitFor();
  tokens.push(await page.evaluate(()=>token));
  await page.evaluate(async({tenant,scenario})=>{
   const arrived=scenario!=='planned';
   const p={...profile,university_id:tenant,consent:true,reminders_enabled:false,arrival_status:arrived?'arrived':'planned',age_band:'adult',study_status:arrived?'active':'admitted',migration_basis:'study',visa_regime:'visa',entry_purpose:'study',residence_type:'dorm',entry_at:arrived?'2026-10-01':null,arrival_at:arrived?'2026-10-01T10:00:00+03:00':null};
   await api('/me/onboarding','POST',{profile:p,preparation:arrived?'unknown':'requested',office_package:arrived?(scenario==='partial'?'partial':'completed'):'unknown',registration:arrived?(scenario==='partial'?'submitted':'received'):'unknown',confirmed:true,idempotency_key:crypto.randomUUID()});
   await refreshSnapshot();navigate({name:'plan'},true);
  },{tenant,scenario});
 };
 const show=async(key,language='ru')=>{await page.evaluate(({key,language})=>{lang=language;navigate({name:'task',key},true);},{key,language});await page.locator('.task-heading').waitFor();};
 const getTask=async process=>page.evaluate(process=>plan.tasks.find(t=>t.process===process&&t.engine_status!=='superseded'),process);
 try{
  for(const tenant of ['sutd','leti']) {
   await start(tenant,'arrived');
   await page.locator('[data-stage=arrival]').click();
   assert.equal(await page.locator('details.completed-tasks').count(),0);
   assert.ok(await page.locator('.completed-tasks [data-task]').count()>0);
   assert.ok(await page.locator('.completed-tasks [data-task]').first().isVisible());
   const documents=await getTask('documents');
   await shot(tenant+'-stage-390');
   await page.locator('[data-task]').filter({hasText:documents.title_i18n.ru}).click();
   const order=await page.evaluate(()=>{
    const y=s=>document.querySelector(s).getBoundingClientRect().top;
    return y('.task-result')>y('.task-contact')&&y('.task-result')>y('.task-documents');
   });assert.ok(order,'results follow instructions, documents and contacts');
   assert.equal(await page.locator('.task-detail').innerText().then(s=>s.includes('Подача и получение')),false);
   await shot(tenant+'-documents-390');
   await page.locator('#detail-reference').scrollIntoViewIfNeeded();
   const taskScroll=await page.evaluate(()=>scrollY);
   await page.locator('#detail-reference').screenshot({path:path.join(output,tenant+'-reference-link-390.png')});
   await page.locator('#detail-reference').focus();await page.keyboard.press('Enter');
   await page.locator('.task-information').waitFor();await shot(tenant+'-information-390');
   await page.reload();await page.locator('.task-information').waitFor();
   assert.equal(await page.evaluate(()=>route.name),'task-info');
   await page.locator('[data-back]').click();assert.equal(await page.evaluate(()=>route.name),'task');
   assert.ok(Math.abs(await page.evaluate(()=>scrollY)-taskScroll)<2,'Back restores task scroll');
   await page.locator('[data-back]').click();assert.equal(await page.evaluate(()=>route.name),'stage');
   await page.reload();await page.locator('.stage-group').first().waitFor();assert.equal(await page.evaluate(()=>route.stage),'arrival');
   await page.locator('[data-task]').filter({hasText:documents.title_i18n.ru}).click();
   const before=await page.evaluate(async()=>JSON.stringify(await api('/me/results')));
   await page.locator('[data-result=question]').click();await page.locator('#cancel-result').click();
   assert.equal(await page.evaluate(async()=>JSON.stringify(await api('/me/results'))),before);
   await page.locator('[data-result=question]').click();await page.locator('[name=confirmed]').check();await page.locator('#result-form button[type=submit]').click();await page.locator('#result-plan').click();
   const question=await getTask('documents');assert.equal(question.engine_status,'needs_review');assert.notEqual(question.user_status,'completed');
   await show(question.task_key);assert.ok(await page.locator('.task-attention').isVisible());
   await shot(tenant+'-question-390');
   // Every current task retains full instruction, documents, contact and sources in both locales.
   const tasks=await page.evaluate(()=>plan.tasks.filter(t=>t.engine_status!=='superseded'));
   for(const language of ['ru','en'])for(const width of [320,390,1280]){
    await page.setViewportSize({width,height:844});
    for(const task of tasks){
     await show(task.task_key,language);
     const instruction=await page.locator('.task-instruction').innerText();
     assert.ok(instruction.length>0);
     assert.equal(await page.locator('.task-section details').count(),0);
     assert.equal(await page.locator('.task-documents>li').count(),task.availability==='past'?0:task.documents_i18n[language].length-(task.document_instruction_indices||[]).length);
     assert.ok(await page.locator('.task-detail details').count()<=1);
     assert.equal(await page.locator('#detail-profile').count(),task.availability!=='past'&&task.missing_fields.length?1:0);
     await inspect(`${tenant}/${language}/${width}/${task.process||task.family}`);
     if(task.process==='documents'&&language==='en'&&width!==390)await shot(tenant+'-documents-en-'+width);
     await page.locator('#detail-reference').click();
     if(instruction!==task.action_i18n[language])assert.equal(await page.locator('.reference-instruction').innerText(),task.action_i18n[language]);
     if(task.availability==='past')assert.equal(await page.locator('.task-documents>li').count(),task.documents_i18n[language].length-(task.document_instruction_indices||[]).length);
     assert.equal(await page.locator('.reference-source').count(),task.source_snapshot.length);
     assert.ok((await page.locator('.task-information').innerText()).includes(task.eligibility_reason[language]));
     await inspect(`${tenant}/${language}/${width}/${task.process||task.family}/information`);
     await page.locator('[data-back]').click();assert.equal(await page.evaluate(()=>route.key),task.task_key);
    }
    await page.evaluate(()=>navigate({name:'stage',stage:'arrival'},true));await inspect(`${tenant}/${language}/${width}/stage`);
    if(width===320)await shot(tenant+'-stage-'+language+'-320');
   }
   await page.setViewportSize({width:390,height:844});
   const renewal=await getTask('registration_renewal');
   assert.ok(renewal?.missing_fields.includes('registration_expiry'));
   {
    await show(renewal.task_key);await page.locator('#detail-profile').click();
    assert.equal(await page.locator('#field-form input').count(),1);
    await page.locator('[name=registration_expiry]').fill('2027-04-01');await page.locator('#field-form button[type=submit]').click();
    await page.waitForFunction(()=>plan.effective_profile.registration_expiry==='2027-04-01');
   }
   await start(tenant,'partial');
   const office=await getTask('office');
   await page.evaluate(async key=>{await api('/me/tasks/'+encodeURIComponent(key)+'/results','POST',{outcome:'partial',missing_documents:[0],confirmed:true,idempotency_key:crypto.randomUUID()});await refreshSnapshot();},office.task_key);
   await show(office.task_key);assert.equal(await page.locator('.task-remaining li').count(),1);await shot(tenant+'-partial-390');
   const registration=await getTask('registration');await show(registration.task_key);
   assert.equal(await page.locator('.task-state').innerText(),'Ожидаете регистрацию');
   assert.ok(await page.locator('.task-context').isVisible());await shot(tenant+'-waiting-390');
   await start(tenant,'planned');
   const visa=await getTask('initial_visa');assert.equal(visa.availability,'future');await show(visa.task_key);
   assert.ok(await page.locator('.task-context').isVisible());assert.equal(await page.locator('[data-external=true]').count(),2);
   await shot(tenant+'-future-390');
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({base,checks,errors,flows:['U02 origin and reload','U03 single expiry save','U04 cancellation','F12 question remains unresolved','F08 partial package','F09 waiting','F15 future'],max:'NOT RUN'},null,2));
  console.log('PASS: '+checks.length+' layout/content cases; both universities; navigation, cancellation, result, partial, waiting, future, expiry.');
 }catch(e){await shot('failure');throw e;}
 finally{for(const token of tokens){const r=await page.request.delete(base+'/api/me/profile',{headers:{Authorization:'Bearer '+token}});assert.equal(r.status(),200);}await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
