/* Local synthetic UI acceptance for checkbox rows, document disclosure and result diffs. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8016';assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const out=path.resolve(process.env.LAYOUT_OUTPUT||'output/forms-results');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'}),checks=[],errors=[];
 try {
  for(const tenant of ['sutd','leti'])for(const language of ['ru','en']) {
   let page=await browser.newPage({viewport:{width:390,height:844}});
   const prepare=async()=>{page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.route('https://st.max.ru/**',r=>r.abort());await page.goto(base);await page.locator('#start-plan').waitFor();await page.locator(`[data-language=${language}]`).click();await page.waitForFunction(language=>lang===language,language);};
   const shot=async name=>{
    const m=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,checkboxes:[...document.querySelectorAll('label.checkbox')].filter(e=>e.getClientRects().length).map(e=>{
     const box=e.querySelector('input').getBoundingClientRect(),row=e.getBoundingClientRect();
     const text=[...e.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
     const range=document.createRange();if(text)range.selectNodeContents(text);
     const line=text?range.getClientRects()[0]:null;
     return {height:row.height,box:box.height,topOffset:box.top-row.top,aligned:!line||Math.abs((box.top+box.height/2)-(line.top+line.height/2))<=3};
    })}));
    assert.equal(m.overflow,false,name);assert.ok(m.checkboxes.every(c=>c.height>=44&&c.box===22&&c.aligned),JSON.stringify(m));
    checks.push({name,...m});await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});fs.writeFileSync(path.join(out,name+'.txt'),await page.locator('body').innerText());
   };
   await prepare();await page.locator('#start-plan').click();await page.locator('[name=arrival_status][value=arrived]').check();await page.locator('[name=university_id]').selectOption(tenant);await page.locator('#next').click();
   await page.locator('[name=age_band]').selectOption('adult');await page.locator('[name=study_path]').selectOption('active');await page.locator('[name=migration_basis]').selectOption('study');await page.locator('#next').click();
   await page.locator('[name=visa_regime]').selectOption('visa_free');await page.locator('[name=entry_at]').fill('2026-10-05');
   await page.locator('[name=entry_purpose]').selectOption('other');assert.equal(await page.locator('#entry-purpose-note').isVisible(),true);
   await page.locator('[name=residence_type]').selectOption('dorm');
   for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});await shot(`${tenant}-${language}-${width}-date-purpose`);}
   await page.locator('.date-answer .checkbox').click();assert.equal(await page.locator('[name=entry_at]').isDisabled(),true);
   await page.reload();await page.locator('[name=entry_at_unknown]').waitFor();assert.equal(await page.locator('[name=entry_at_unknown]').isChecked(),true);assert.equal(await page.locator('#entry-purpose-note').isVisible(),true);
   await page.locator('.date-answer .checkbox').click();assert.equal(await page.locator('[name=entry_at]').inputValue(),'2026-10-05');
   await page.locator('[name=entry_purpose]').selectOption('study');assert.equal(await page.locator('#entry-purpose-note').isVisible(),false);
   await page.locator('[name=entry_purpose]').selectOption('other');await page.locator('#next').click();
   assert.equal(await page.locator('#office-documents').isVisible(),false);
   await page.locator('#toggle-office-documents').focus();await page.keyboard.press('Enter');
   assert.equal(await page.locator('#toggle-office-documents').getAttribute('aria-expanded'),'true');
   assert.ok(await page.locator('#office-documents li').count()>0);
   await page.reload();await page.locator('#office-documents').waitFor();
   assert.equal(await page.locator('#toggle-office-documents').getAttribute('aria-expanded'),'true');
   for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});await shot(`${tenant}-${language}-${width}-documents`);}
   await page.locator('#toggle-office-documents').focus();await page.keyboard.press('Space');assert.equal(await page.locator('#office-documents').isVisible(),false);
   await page.locator('[name=office_package]').selectOption('unknown');await page.locator('[name=registration]').selectOption('unknown');await page.locator('#next').click();await page.locator('[name=consent]').check();await page.locator('#next').click();await page.locator('[data-nav=plan]').waitFor();
   assert.equal(await page.evaluate(()=>effectiveProfile().entry_purpose),'other');assert.equal(await page.evaluate(()=>plan.tasks.every(t=>t.engine_status==='needs_review')),true);
   await page.evaluate(async()=>api('/me/profile','DELETE'));await page.close();
   // A separate ordinary student completes an action through the UI, with no date invented.
   page=await browser.newPage({viewport:{width:390,height:844}});await prepare();
   await page.evaluate(async({tenant,language})=>{
    await api('/me/onboarding','POST',{profile:{...profile,language,university_id:tenant,consent:true,reminders_enabled:false,arrival_status:'arrived',age_band:'adult',study_status:'active',migration_basis:'study',visa_regime:'visa_free',entry_at:'2026-10-05',arrival_at:'2026-10-05T12:00:00+03:00',entry_purpose:'study',residence_type:'dorm'},preparation:'unknown',office_package:'unknown',registration:'unknown',confirmed:true,idempotency_key:crypto.randomUUID()});
    await refreshSnapshot();lang=language;navigate({name:'task',key:plan.tasks.find(t=>t.process==='documents').task_key},true);
   },{tenant,language});
   await page.locator('[data-result=completed]').click();
   assert.match(await page.locator('.result-explanation').innerText(),language==='ru'?/истории/:/history/);
   assert.equal(await page.locator('[name=occurred_at]').getAttribute('required'),null);
   for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});await shot(`${tenant}-${language}-${width}-result-form`);}
   await page.locator('#result-form .checkbox').click();await page.locator('#result-form button[type=submit]').click();await page.locator('.revision-card').waitFor();
   assert.equal(await page.locator('.revision-card').count(),1);
   assert.equal(await page.locator('.revision-status').count(),1);
   assert.equal(await page.locator('.revision-field').count(),0,'No duplicate result row');
   assert.doesNotMatch(await page.locator('.revision-card').innerText(),/Без отдельного срока|No separate deadline/);
   assert.equal(await page.evaluate(async()=> (await api('/me/results')).results.find(r=>r.process==='documents').occurred_at),null);
   for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});await shot(`${tenant}-${language}-${width}-result-diff`);}
   await page.reload();await page.locator('.revision-card').waitFor();await page.locator('[data-diff-task]').click();await page.locator('.task-heading').waitFor();await page.locator('[data-back]').click();await page.locator('.revision-card').waitFor();
   await page.locator('#result-plan').click();await page.locator('[data-history]').click();await page.locator('.history-timeline').waitFor();
   assert.equal(await page.locator('[data-edit-result]').count(),1);
   await page.evaluate(async()=>api('/me/profile','DELETE'));await page.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));
  console.log(`PASS: ${checks.length} measured screens; both universities/RU/EN at 320/390/1280; checkbox alignment, unknown date/reload, keyboard document button, other-purpose review, actual undated result, diff navigation/history.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
