/* Local preview only; fresh synthetic profiles, removed after the run. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8016';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const output=path.resolve(process.env.LAYOUT_OUTPUT||'output/task-copy');
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'}),tokens=[],errors=[],checks=[];
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://st.max.ru/**',r=>r.abort());
 try {
  for(const university of ['sutd','leti'])for(const known of [true,false]) {
   await page.goto(base);await page.evaluate(()=>sessionStorage.clear());await page.reload();await page.locator('#start-plan').waitFor();
   tokens.push(await page.evaluate(()=>token));
   const task=await page.evaluate(async({university,known})=>{
    await api('/me/onboarding','POST',{profile:{...profile,university_id:university,consent:true,reminders_enabled:false,arrival_status:'arrived',age_band:'adult',study_status:'active',migration_basis:'study',visa_regime:'visa',entry_purpose:'study',residence_type:'dorm',entry_at:'2026-10-01',arrival_at:'2026-10-01T10:00:00+03:00',visa_expiry:known?'2027-02-25':null},preparation:'unknown',office_package:'completed',registration:'received',confirmed:true,idempotency_key:crypto.randomUUID()});
    await refreshSnapshot();return plan.tasks.find(t=>t.process==='visa_renewal');
   },{university,known});
   assert.ok(task,'visa renewal exists');
   for(const language of ['ru','en'])for(const width of [320,390,1280]) {
    const label=`${university}-${language}-${width}-${known?'known':'unknown'}`;
    await page.setViewportSize({width,height:844});
    await page.evaluate(({key,language})=>{lang=language;sessionStorage.setItem('ryadom_entry_language',language);navigate({name:'task',key},true);},{key:task.task_key,language});
    await page.locator('.task-heading').waitFor();
    const text=await page.locator('.task-detail').innerText();
    assert.doesNotMatch(text,/Дата из ваших данных|Даты и время указаны|Результат сохраняется с ваших слов|Документы в приложение загружать|Date you provided|Dates and times use Moscow|Results are self-reported|You do not need to upload/);
    const timing=await page.locator('.task-timing').innerText();
    assert.ok(timing.includes(language==='ru'?'Виза действует до':'Visa valid until'));
    if(university==='sutd')assert.match(timing,language==='ru'?/Рекомендуемый срок обращения/:/Recommended time/);
    else {assert.ok(timing.includes(task.dates.find(d=>d.kind==='university_submission_deadline').literal[language]));assert.match(timing,language==='ru'?/обязателен ли/:/mandatory/);if(known)assert.match(timing,language==='ru'?/календарь рабочих дней/:/working-day calendar/);}
    if(!known)assert.match(timing,language==='ru'?/Дата окончания не указана/:/Expiry date is unknown/);
    assert.equal(await page.locator('.task-date-value').count(),known?(university==='sutd'?2:1):0);
    const expected=task.expected_result_i18n[language].trim();
    assert.equal(await page.locator('.task-expected').innerText(),(language==='ru'?'Результат этого шага':'Expected outcome')+'\n\n'+expected+(/[.!?…]$/.test(expected)?'':'.'));
    assert.equal(await page.locator('.task-instruction').innerText(),task.action_i18n[language]);
    const layout=await page.evaluate(()=>{
     const expected=document.querySelector('.task-expected'),instruction=document.querySelector('.task-instruction').closest('section');
     const style=e=>{const s=getComputedStyle(e);return [s.fontSize,s.fontWeight,s.marginTop,s.marginBottom];};
     return {overflow:document.documentElement.scrollWidth>innerWidth+1,border:getComputedStyle(expected).borderLeftWidth,padding:getComputedStyle(expected).paddingLeft,expected:style(expected.querySelector('h2')),instruction:style(instruction.querySelector('h2'))};
    });
    assert.equal(layout.overflow,false,label);assert.equal(layout.border,'0px');assert.equal(layout.padding,'0px');assert.deepEqual(layout.expected,layout.instruction);
    const nav=page.locator('.bottom-tabs');await nav.evaluate(e=>{e.style.position='static';e.style.transform='none';});
    await page.screenshot({path:path.join(output,label+'.png'),fullPage:true});await nav.evaluate(e=>e.removeAttribute('style'));
    fs.writeFileSync(path.join(output,label+'.txt'),text);checks.push(label);
   }
   await page.reload();await page.locator('.task-heading').waitFor();assert.equal(await page.evaluate(()=>route.key),task.task_key);
   await page.locator('#detail-reference').click();await page.locator('.task-information').waitFor();assert.equal(await page.locator('.reference-source').count(),task.source_snapshot.length);
   await page.locator('[data-back]').click();assert.equal(await page.evaluate(()=>route.key),task.task_key);
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({base,checks,errors},null,2));
  console.log(`PASS: ${checks.length} task copy/layout cases, both universities/languages; known/unknown expiry; reload and sources.`);
 } finally {for(const token of tokens){const r=await page.request.delete(base+'/api/me/profile',{headers:{Authorization:'Bearer '+token}});assert.equal(r.status(),200);}await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
