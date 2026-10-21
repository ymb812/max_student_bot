/* Real local API, synthetic accounts, no MAX traffic. See docs/ADAPTIVE_ROUTE_2026_10_21.md. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8011';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const output=path.resolve('output/adaptive-route');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[],tokens=new Set(),checks=[];
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://st.max.ru/**',r=>r.abort());
 const shot=async name=>{await page.locator('#toast').evaluate(e=>e.style.display='none');await page.screenshot({path:path.join(output,name+'.png'),fullPage:!(await page.locator('dialog[open]').count())});};
 const track=async()=>tokens.add(await page.evaluate(()=>token));
 const next=async()=>page.locator('#next').click();
 const report=async outcome=>{await page.locator('[data-result='+outcome+']').first().click();await page.locator('#result-form [name=confirmed]').check();await page.locator('#result-form button[type=submit]').click();await page.locator('#result-plan').click();await page.locator('#context-profile').waitFor();};
 const hero=async()=>page.locator('.hero-card [data-task]').click();
 const fresh=async()=>{await page.goto(base);await page.evaluate(()=>sessionStorage.clear());await page.reload();await page.locator('#start-plan').waitFor();await track();};
 const initial=async(arrived,tenant='sutd')=>{
   await page.locator('#start-plan').click();await page.locator(`[name=arrival_status][value=${arrived?'arrived':'planned'}]`).check();await page.locator('[name=university_id]').selectOption(tenant);await next();
   await page.locator('[name=age_band]').selectOption('adult');await page.locator('[name=study_status]').selectOption(arrived?'active':'admitted');await page.locator('[name=migration_basis]').selectOption('study');await next();
   await page.locator('[name=visa_regime]').selectOption('visa');
 };
 const finish=async()=>{await page.locator('[name=consent]').check();await next();await page.locator('#context-profile').waitFor();};
 try {
   await fresh();await initial(false);
   await page.locator('[name=preparation]').selectOption('not_started');
   await page.locator('[data-language=en]').click();assert.equal(await page.locator('[name=preparation]').inputValue(),'not_started');
   await page.reload();await page.locator('[name=preparation]').waitFor();assert.equal(await page.locator('[name=preparation]').inputValue(),'not_started');
   await page.locator('[data-language=ru]').click();await next();
   assert.equal(await page.locator('[name=consent]').isChecked(),false);await page.locator('[name=consent]').check();
   // Drop a successful response. Retry must use the same persisted request key.
   let dropped=false;await page.route('**/api/me/onboarding',async r=>{if(!dropped){dropped=true;await r.fetch();await r.abort();}else await r.continue();});
   await next();await page.locator('.form-error').waitFor();await next();await page.locator('#context-profile').waitFor();await page.unroute('**/api/me/onboarding');
   checks.push('D01 onboarding lost response retry; RU/EN/reload draft; consent');
   assert.equal(await page.evaluate(()=>plan.tasks.find(t=>t.task_key===plan.hero_task_key).process),'invitation');
   await shot('01-plan');await page.locator('[data-stage=before]').click();await shot('02-stage');
   const beforeKey=await page.evaluate(()=>plan.tasks.find(t=>t.process==='invitation').task_key);
   await page.locator('[data-task]').filter({hasText:'Получить приглашение'}).click();await shot('03-action');
   const factsBeforeCancel=await page.evaluate(async()=>JSON.stringify({reports:await api('/me/results'),history:await api('/me/history')}));
   await page.locator('[data-result=requested]').click();await page.locator('[name=occurred_at]').fill('2026-10-20');
   await page.locator('#cancel-result').click();await page.locator('#discard-draft').click();await page.locator('.task-detail').waitFor();
   assert.equal(await page.evaluate(async()=>JSON.stringify({reports:await api('/me/results'),history:await api('/me/history')})),factsBeforeCancel);
   await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>document.activeElement.matches('button,a,input,select')));
   checks.push('U04 cancel dirty result form leaves reports/history unchanged; keyboard focus reachable');
   await page.locator('[data-back]').click();assert.equal(await page.evaluate(()=>route.name),'stage');
   await page.reload();await page.locator('.screen-title').waitFor();assert.equal(await page.evaluate(()=>route.stage),'before');await page.locator('[data-back]').click();
   await hero();await report('requested');assert.equal(await page.evaluate(()=>plan.tasks.find(t=>t.process==='invitation').workflow_status),'waiting');
   await hero();await report('received');await hero();await report('submitted');await hero();await report('received');
   await hero();await page.locator('[data-result=completed]').click();
   for(const k of ['documents','arrival','housing'])await page.locator('[name=check_'+k+']').check();
   await page.locator('[name=confirmed]').check();await page.locator('#result-form button[type=submit]').click();await page.locator('#result-plan').click();
   assert.equal(await page.evaluate(()=>plan.effective_profile.entry_at),null);await hero();await page.locator('#record-entry').click();
   await page.locator('[name=occurred_at]').fill('2026-10-20');await page.locator('[name=entry_purpose]').selectOption('study');await page.locator('[name=residence_type]').selectOption('dorm');
   await page.locator('#event-form input[type=checkbox][required]').check();await page.locator('#event-form button[type=submit]').click();await page.locator('#result-plan').click();
   checks.push('F01/F04 complete preparation -> explicit entry; U02 origin/reload');
   await page.locator('[data-stage=arrival]').click();await page.locator('[data-task]').filter({hasText:'Передать весь комплект'}).click();
   await page.locator('[data-result=partial]').click();await page.locator('[name=missing_0]').check();await page.locator('[name=confirmed]').check();await page.locator('#result-form button[type=submit]').click();await page.locator('#result-plan').click();
   assert.equal(await page.evaluate(()=>plan.tasks.find(t=>t.process==='office'&&t.engine_status!=='superseded').workflow_status),'partial');
   await page.locator('[data-stage=arrival]').click();await page.locator('[data-task]').filter({hasText:'Получить регистрацию'}).click();await report('submitted');
   await page.locator('[data-stage=arrival]').click();await page.locator('[data-task]').filter({hasText:'Получить регистрацию'}).click();await report('received');
   assert.equal(await page.evaluate(()=>plan.effective_profile.registration_expiry),null);
   await page.locator('[data-stage=study]').click();await page.locator('[data-task]').filter({hasText:'Подготовить продление учёта'}).click();await page.locator('#detail-profile').click();
   assert.equal(await page.locator('#field-form input').count(),1);await shot('04-clarification');
   await page.locator('[name=registration_expiry]').fill('2027-04-01');await page.locator('#field-form button[type=submit]').click();
   await page.waitForFunction(()=>plan.effective_profile.registration_expiry==='2027-04-01');
   assert.equal(await page.evaluate(()=>plan.effective_profile.registration_expiry),'2027-04-01');
   checks.push('F08/F09/F10 partial office, independent registration submission/receipt, single expiry clarification');
   await page.locator('[data-nav=plan]').click();await page.locator('[data-history]').click();await page.locator('[data-history-filter=all]').waitFor();
   assert.ok(await page.locator('[data-retract-result]').count());await shot('05-history');
   checks.push('D04 history/results persist after reload');
   // Both locales and narrow/desktop geometries across new surfaces.
   for(const language of ['ru','en'])for(const width of [320,390,1280]) {
     await page.setViewportSize({width,height:844});await page.locator('[data-nav=plan]').click();await page.locator('[data-language='+language+']').click();
     for(const stage of [null,'before','arrival','study']) {
       if(stage){await page.locator('[data-stage='+stage+']').click();} 
       assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),language+' '+width+' '+stage);
       if(stage)await page.locator('[data-back]').click();
     }
     checks.push('U05 '+language+' '+width+' plan/stages no overflow');
   }
   await fresh();await initial(true,'leti');
   await page.locator('[name=entry_at_unknown]').check();await page.locator('[name=entry_purpose]').selectOption('study');await page.locator('[name=residence_type]').selectOption('dorm');await next();
   await page.locator('[name=office_package]').selectOption('completed');await page.locator('[name=registration]').selectOption('received');
   await page.locator('[name=registration_expiry_unknown]').check();await page.locator('[name=visa_expiry_unknown]').check();await next();await finish();
   assert.equal(await page.evaluate(()=>plan.tasks.find(t=>t.task_key===plan.hero_task_key).process),'entry_context');await shot('06-late-entry');
   await hero();await page.locator('#record-entry').click();assert.equal(await page.locator('#field-form input').count(),1);
   await page.locator('[name=entry_at]').fill('2026-10-20');await page.locator('#field-form button[type=submit]').click();
   await page.waitForFunction(()=>plan.effective_profile.entry_at==='2026-10-20');
   assert.equal(await page.evaluate(()=>plan.tasks.find(t=>t.process==='office'&&t.engine_status!=='superseded').user_status),'completed');
   assert.equal(await page.evaluate(()=>plan.tasks.find(t=>t.process==='registration'&&t.engine_status!=='superseded').user_status),'completed');
   checks.push('F06/F07 late LETI entry, unknown date, existing results survive clarification');
   assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify({checks,errors,max:'NOT RUN: real MAX'},null,2));
   console.log('PASS',checks.join('\n'));
 } catch(error) {await page.screenshot({path:path.join(output,'failure.png'),fullPage:true});console.error('Browser URL:',page.url());console.error(await page.locator('body').innerText());throw error;}
 finally {for(const t of tokens)if(t)await page.request.delete(base+'/api/me/profile',{headers:{Authorization:'Bearer '+t}});await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
