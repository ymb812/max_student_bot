/* Run against scripts/preview_redesign.py. Uses synthetic users only. */
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const fs = require('node:fs');
const output = path.resolve('.local/ryadom-ui');
fs.mkdirSync(output,{recursive:true});
(async()=>{
    const browser=await chromium.launch({headless:true,channel:'chrome'});
    const page=await browser.newPage({viewport:{width:390,height:844}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://st.max.ru/**',r=>r.abort());
    const shot=async name=>page.screenshot({path:path.join(output,name+'.png'),fullPage:true});
    const title=async text=>{await page.getByRole('heading',{name:text,exact:true}).waitFor();};
    try {
        await page.goto('http://127.0.0.1:8010');
        await page.locator('#welcome-start').waitFor();await shot('01-start');
        await page.locator('#welcome-start').click();await page.locator('[data-lang=ru]').waitFor();await shot('02-language');
        await page.locator('#next').click();await page.locator('[data-university=sutd]').click();await shot('03-university');
        await page.setViewportSize({width:320,height:700});
        assert.ok(await page.locator('.choices').evaluate(el=>el.scrollWidth<=el.clientWidth),'university choices overflow at 320px');
        await page.setViewportSize({width:390,height:844});
        await page.locator('#next').click();await page.locator('[data-regime=visa]').click();await shot('04-entry-type');
        await page.locator('#next').click();await page.locator('[name=entry_at]').fill('2026-09-12');await page.locator('[name=residence_type]').selectOption('dorm');await page.locator('[name=visa_expiry]').fill('2026-12-04');
        assert.equal(await page.locator('[name=consent]').isChecked(),false);await shot('05-initial');
        await page.locator('[name=consent]').check();await page.locator('#next').click();await page.locator('#context-profile').waitFor();await shot('06-home');
        assert.equal(await page.locator('[data-stage=study]').count(),1);
        await page.locator('[data-stage=study]').click();await title('Во время учёбы');await shot('08-study');
        await page.locator('[data-back]').click();await page.locator('#all-stages').click();await title('Все этапы');await shot('07-stages');
        await page.locator('[data-stage=arrival]').click();await title('После приезда');await shot('08-arrival');
        await page.locator('[data-back]').click();await title('Все этапы');
        await page.locator('[data-nav=plan]').click();await page.locator('#open-clarifications').click();await title('Нужно уточнить');await shot('14-clarifications');
        const missing=await page.evaluate(()=>plan.tasks.find(t=>t.engine_status==='conditional'&&t.missing_fields.length>1)?.missing_fields);
        assert.ok(missing?.length>1,'expected a clarification with multiple questions');
        const target=await page.evaluate(()=>plan.tasks.find(t=>t.engine_status==='conditional'&&t.missing_fields.length>1).task_key);
        await page.locator('[data-resolve]').evaluateAll((els,key)=>els.find(el=>el.dataset.resolve===key)?.click(),target);
        await page.locator('#field-form').waitFor();
        assert.equal(await page.locator('#field-form .clarification-question').count(),missing.length);
        assert.equal(await page.locator('#field-form .question-position').first().innerText(),`Вопрос 1/${missing.length}`);
        assert.ok((await page.locator('.clarification-progress').innerText()).includes(`0 из ${missing.length}`));
        await shot('14-clarification-form');
        const fields=page.locator('#field-form select');
        for(let i=0;i<await fields.count();i++){const item=fields.nth(i),vals=await item.locator('option').evaluateAll(es=>es.map(e=>e.value));await item.selectOption(vals.find(v=>v&&v!=='unknown'));}
        assert.ok((await page.locator('.clarification-progress').innerText()).includes(`${missing.length} из ${missing.length}`));
        await page.locator('#field-close').click();await page.locator('#keep-editing').waitFor();await page.locator('#keep-editing').click();
        let profileSaves=0;const countProfileSave=request=>{if(request.url().endsWith('/api/me/profile')&&request.method()==='PATCH')profileSaves++;};
        page.on('request',countProfileSave);
        await page.locator('#field-form button[type=submit]').click();await page.locator('#field-editor').waitFor({state:'detached'});await title('Нужно уточнить');
        page.off('request',countProfileSave);assert.equal(profileSaves,1,'all clarification answers use one profile save');
        await page.locator('[data-nav=profile]').click();await title('Мои данные');await shot('13-profile');
        await page.locator('[data-demo-profile=sutd_visa]').click();await page.getByText('Демо-профиль выбран.',{exact:false}).waitFor();
        await page.locator('[data-nav=plan]').click();await page.locator('.hero-card [data-task]').waitFor();await shot('06-home-complete');
        await page.locator('.hero-card [data-task]').click();await page.locator('[data-status=in_progress]').click();await page.getByText('Статус сохранён',{exact:true}).waitFor();await shot('09-task');
        await page.reload();await page.locator('[data-status=in_progress]').waitFor();assert.equal(await page.locator('[data-status=in_progress]').getAttribute('aria-pressed'),'true');
        assert.equal(new URL(page.url()).searchParams.get('screen'),'task','restored task and URL must agree');
        await page.locator('[data-back]').click();await page.locator('#context-profile').waitFor();
        await page.locator('#open-clarifications').click();await page.locator('.needs_review [data-resolve]').first().click();await page.locator('#review-done').waitFor();await shot('16-review');
        await page.locator('#review-done').click();await title('Нужно уточнить');
        await page.locator('[data-nav=events]').click();await title('Сообщить событие');await shot('10-events');
        await page.locator('[data-event=address_changed]').click();await page.locator('#event-form').waitFor();await page.locator('[name=occurred_at]').fill('2026-09-28');await page.locator('[name=residence_type]').selectOption('private');await shot('11-event');
        await page.locator('#event-form input[type=checkbox][required]').check();await page.locator('#event-form button[type=submit]').click();await page.locator('#result-plan').waitFor();await shot('12-diff');
        assert.ok((await page.locator('body').innerText()).includes('Данные сохранены'));
        await page.reload();await page.locator('#result-plan').waitFor();
        await page.locator('#result-history').click();await title('История');await page.locator('[data-edit-event]').waitFor();await shot('15-history');
        await page.locator('[data-edit-event]').first().click();await page.locator('[name=residence_type]').selectOption('other');await page.locator('#event-form input[type=checkbox][required]').check();await page.locator('#event-form button[type=submit]').click();await page.locator('#result-plan').waitFor();assert.ok((await page.locator('body').innerText()).includes('Исправление учтено'));
        await page.locator('#result-history').click();await page.locator('[data-retract-event]').first().click();await page.locator('#confirm-retract').click();await page.locator('#result-plan').waitFor();assert.ok((await page.locator('body').innerText()).includes('Событие отменено'));
        await page.locator('#result-plan').click();await page.locator('#mobile-language').click();await page.getByRole('heading',{name:'Your roadmap',exact:true}).waitFor();await shot('06-home-en');
        for(const width of [320,360,390,768]) {await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);await shot('home-en-'+width);}
        // A real server roadmap must allow an urgent study task to lead the arrival home.
        await page.evaluate(async()=>{
            const expiry=new Date(today()+'T12:00:00Z');expiry.setUTCDate(expiry.getUTCDate()+30);
            profile=await api('/me/profile','PATCH',{...profile,visa_expiry:expiry.toISOString().slice(0,10),language:'ru'});
            lang='ru';await refreshSnapshot();renderPlan();
        });
        const selected=await page.locator('.hero-card [data-task]').getAttribute('data-task');
        assert.equal(await page.evaluate(key=>plan.tasks.find(t=>t.task_key===key).family,selected),'M07');
        assert.ok(await page.locator('[data-stage=arrival]').evaluate(el=>el.classList.contains('current')));
        await page.setViewportSize({width:390,height:844});await shot('06-urgent-visa-during-arrival');
        await page.locator('[data-stage=study]').click();assert.equal(await page.locator('[data-task]').evaluateAll((els,key)=>els.filter(el=>el.dataset.task===key).length,selected),1);
        await page.locator('[data-nav=events]').click();await page.locator('[data-event=address_changed]').click();
        await page.locator('[name=occurred_at]').fill('2026-09-28');await page.locator('[name=residence_type]').selectOption(await page.evaluate(()=>effectiveProfile().residence_type));await page.locator('#event-form input[type=checkbox][required]').check();
        await page.locator('#event-form button[type=submit]').click();await page.locator('.form-error').waitFor();
        await page.locator('[data-same-place]').check();
        let submissions=0;
        await page.route('**/api/me/events',async request=>{
            if(request.request().method()==='POST') {submissions++;await request.fetch();await request.abort('failed');}
            else await request.continue();
        });
        await page.locator('#event-form button[type=submit]').click();await page.locator('#result-plan').waitFor();assert.equal(submissions,1);
        await page.unroute('**/api/me/events');
        await page.goBack();await page.locator('#context-profile').waitFor();
        for(let count=0;count<2;count++) {
            await page.locator('[data-nav=events]').click();await page.locator('[data-event=fingerprinting_completed]').click();await page.locator('[name=occurred_at]').fill('2026-09-28');await page.locator('#event-form input[type=checkbox][required]').check();await page.locator('#event-form button[type=submit]').click();await page.locator('#result-plan').waitFor();
        }
        assert.ok((await page.locator('body').innerText()).includes('Событие сохранено, задачи не изменились.'));
        await page.reload();await page.locator('#result-plan').waitFor();assert.ok((await page.locator('body').innerText()).includes('Событие сохранено, задачи не изменились.'));
        const plannedPage=await browser.newPage({viewport:{width:390,height:844}});
        plannedPage.on('pageerror',e=>errors.push(e.message));await plannedPage.route('https://st.max.ru/**',r=>r.abort());
        await plannedPage.goto('http://127.0.0.1:8010');await plannedPage.locator('#welcome-start').click();
        await plannedPage.locator('#next').click();await plannedPage.locator('[data-university=sutd]').click();await plannedPage.locator('#next').click();
        await plannedPage.locator('[data-regime=visa]').click();await plannedPage.locator('#next').click();await plannedPage.locator('[data-arrival=planned]').click();
        await plannedPage.locator('[name=planned_entry]').fill(new Date(Date.now()+20*864e5).toISOString().slice(0,10));
        await plannedPage.locator('[name=consent]').check();await plannedPage.locator('#next').click();await plannedPage.locator('#open-clarifications').click();
        const preEntry=await plannedPage.evaluate(()=>plan.tasks.find(t=>t.family==='M01'&&t.engine_status==='conditional'));
        assert.ok(preEntry?.missing_fields.length>=3,'expected pre-entry clarification with several questions');
        await plannedPage.locator('[data-resolve]').evaluateAll((els,key)=>els.find(el=>el.dataset.resolve===key)?.click(),preEntry.task_key);
        await plannedPage.locator('#field-form').waitFor();
        assert.equal(await plannedPage.locator('.clarification-question').count(),preEntry.missing_fields.length);
        for(const select of await plannedPage.locator('#field-form select').all()){const vals=await select.locator('option').evaluateAll(es=>es.map(e=>e.value));await select.selectOption(vals.find(v=>v&&v!=='unknown'));}
        for(const input of await plannedPage.locator('#field-form input[type=date]').all())await input.fill(new Date(Date.now()+20*864e5).toISOString().slice(0,10));
        let plannedSaves=0;plannedPage.on('request',request=>{if(request.url().endsWith('/api/me/profile')&&request.method()==='PATCH')plannedSaves++;});
        await plannedPage.locator('#field-form button[type=submit]').click();await plannedPage.locator('#field-editor').waitFor({state:'detached'});await plannedPage.getByRole('heading',{name:'Нужно уточнить',exact:true}).waitFor();
        const preEntryAfter=await plannedPage.evaluate(()=>plan.tasks.find(t=>t.family==='M01'));
        assert.equal(plannedSaves,1);assert.notEqual(preEntryAfter?.engine_status,'conditional',JSON.stringify({before:preEntry.missing_fields,after:preEntryAfter?.missing_fields}));
        await plannedPage.close();
        assert.deepEqual(errors,[]);console.log('PASS: onboarding, stage navigation, clarification editor/dirty guard, profile, task status/reload, review, event/correction/retraction/diff/reload/history, RU/EN, 320–768px; no JS errors.');
        console.log('PASS: СПбГУПТД pre-entry clarification saves all questions in one PATCH and resolves conditional state.');
        console.log('PASS: real M07 hero during arrival, same task in study stage, same-type move confirmation, lost POST response recovered without duplicate, browser Back from result, persisted empty diff.');
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
