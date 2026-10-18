/* Focused activation-v3 acceptance. All profiles and dates are synthetic, local only. */
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const fs = require('node:fs');
const output=path.resolve('output/activation-v3');fs.mkdirSync(output,{recursive:true});
(async()=>{
    const browser=await chromium.launch({headless:true,channel:'chrome'});
    const page=await browser.newPage({viewport:{width:390,height:844}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
    await page.route('https://st.max.ru/**',r=>r.abort());
    const shot=async name=>{await page.locator('#toast').evaluate(el=>el.style.visibility='hidden');await page.screenshot({path:path.join(output,name+'.png'),fullPage:!(await page.locator('dialog[open]').count())});await page.locator('#toast').evaluate(el=>el.style.visibility='');};
    const widthCheck=async label=>{
        for(const width of [320,360,390]) {
            await page.setViewportSize({width,height:844});
            assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' overflow '+width);
            const tooSmall=await page.locator('button:visible').evaluateAll(els=>els.filter(el=>!el.disabled).filter(el=>{const b=el.getBoundingClientRect();return b.width<43.9||b.height<43.9;}).map(el=>el.textContent));
            assert.deepEqual(tooSmall,[],label+' touch targets '+width);
        }
    };
    try {
        await page.goto('http://127.0.0.1:8010');await page.locator('[value=arrived]').check();
        await widthCheck('situation');await page.locator('#next').click();await page.locator('[value=leti]').check();
        await page.locator('[data-language=en]').click();await widthCheck('university EN');await shot('17-university-en');
        await page.locator('#next').click();await page.locator('[value=visa_free]').check();await widthCheck('entry EN');
        await page.locator('#next').click();await page.locator('[value=unknown]').check();await widthCheck('housing EN');
        assert.equal(await page.locator('[name=consent]').isChecked(),false);
        await page.locator('[name=consent]').check();await page.locator('[data-language=ru]').click();
        assert.equal(await page.locator('[name=consent]').isChecked(),true,'language must preserve explicit consent');
        await page.locator('#next').click();await page.locator('#context-profile').waitFor();await widthCheck('partial roadmap');
        assert.equal(await page.evaluate(()=>plan.tasks.some(t=>t.engine_status==='actionable')),false);
        await page.locator('#context-date').click();assert.equal(await page.locator('[name=residence_type]').inputValue(),'');
        assert.equal(await page.locator('[name=residence_type]').evaluate(el=>el.checkValidity()),false,'unknown residence must never silently become dorm');
        await page.locator('[data-back]').click();await page.locator('#context-profile').waitFor();
        await page.locator('[data-stage=before]').click();assert.equal(await page.locator('progress').count(),0);
        assert.ok((await page.locator('.empty').innerText()).includes('Нет текущих действий')||(await page.locator('.empty').innerText()).includes('нет текущих действий'));
        await shot('18-empty-stage');await widthCheck('empty');
        // Complete a synthetic profile through the real API; keep the full server task catalogue.
        await page.evaluate(async()=>{
            profile=await api('/me/profile','PATCH',{...profile,arrival_status:'arrived',visa_regime:'visa',residence_type:'dorm',
                entry_at:'2026-09-01',visa_expiry:'2026-12-01',registration_expiry:'2026-12-01',age_band:'adult',
                migration_basis:'study',study_status:'active',entry_purpose:'study',citizenship:'Test country',
                stay_over_90_days:true,fingerprinting_completed:false});
            await refreshSnapshot();navigate({name:'plan'});
        });
        assert.ok(await page.evaluate(()=>plan.tasks.length>5));
        const border=await page.evaluate(()=>RoadmapView.progress(plan.tasks,'before').tasks.find(t=>t.engine_status==='actionable'&&t.completion_basis!=='reported_fact').task_key);
        await page.locator('[data-stage=before]').click();await page.locator('[data-task]').filter({hasText:'Проверить документы'}).first().click();
        await widthCheck('task details RU');await page.locator('[data-status=completed]').first().click();await page.getByText('Статус сохранён',{exact:true}).waitFor();
        assert.equal(await page.locator('[data-status=completed]').first().getAttribute('aria-pressed'),'true');
        assert.equal(await page.evaluate(()=>RoadmapView.progress(plan.tasks,'before').done),true);
        const next=await page.evaluate(()=>RoadmapView.hero(plan.tasks)?.task_key);assert.ok(next&&next!==border);
        await page.locator('#detail-next').waitFor();await shot('19-task-completed');
        await page.reload();await page.locator('[data-status=completed]').first().waitFor();
        await page.locator('[data-back]').click();await page.getByRole('heading',{name:'До приезда',exact:true}).waitFor();
        await page.locator('[data-back]').click();await page.locator('#context-profile').waitFor();
        assert.ok(await page.locator('[data-stage=before]').evaluate(el=>el.classList.contains('done')));
        assert.equal(await page.locator('.hero-card [data-task]').getAttribute('data-task'),next);
        await shot('20-plan-completed-stage');
        await page.locator('[data-stage=before]').click();await page.locator('.completed-tasks summary').click();await page.locator('[data-task]').first().click();
        await page.locator('[data-status=not_started]').click();await page.getByText('Статус сохранён',{exact:true}).waitFor();
        assert.equal(await page.evaluate(()=>RoadmapView.progress(plan.tasks,'before').done),false);
        await page.locator('[data-back]').click();await page.locator('[data-back]').click();await page.locator('#context-profile').waitFor();
        assert.equal(await page.locator('.hero-card [data-task]').getAttribute('data-task'),border);
        // Language changes and reload preserve an unsaved typed event and its submission key.
        await page.locator('[data-nav=events]').click();assert.equal(await page.locator('[data-event]').count(),12);await widthCheck('all event types');
        await page.locator('[data-event=address_changed]').click();await page.locator('[name=occurred_at]').fill('2026-09-28');await page.locator('[name=residence_type]').selectOption('private');
        await page.locator('#event-text').fill('I moved');
        const key=await page.evaluate(()=>route.submissionKey);
        await page.locator('[data-language=en]').click();await page.locator('html[lang=en]').waitFor();assert.equal(await page.locator('[name=occurred_at]').inputValue(),'2026-09-28');
        assert.equal(await page.locator('[name=residence_type]').inputValue(),'private');assert.equal(await page.evaluate(()=>route.submissionKey),key);
        assert.equal(await page.locator('#event-text').inputValue(),'I moved');
        await page.reload();await page.locator('#event-form').waitFor();assert.equal(await page.locator('#event-text').inputValue(),'I moved');assert.equal(await page.locator('[name=occurred_at]').inputValue(),'2026-09-28');
        assert.equal(await page.locator('[name=residence_type]').inputValue(),'private');assert.equal(await page.evaluate(()=>route.submissionKey),key);
        await widthCheck('event EN');await shot('21-event-draft-en');
        await page.locator('[data-nav=plan]').click();await page.locator('#keep-editing').click();assert.equal(await page.locator('[name=residence_type]').inputValue(),'private');
        await page.locator('#event-form input[type=checkbox][required]').check();await page.locator('#event-form button[type=submit]').click();await page.locator('#result-plan').waitFor();
        await widthCheck('diff EN');await shot('22-diff-en');
        assert.equal(await page.evaluate(async key=>(await api('/me/events')).events.filter(e=>e.idempotency_key===key).length,key),1);
        await page.locator('#result-plan').click();await page.locator('#context-profile').waitFor();
        const recheck=await page.evaluate(()=>plan.tasks.find(t=>t.engine_status==='requires_recheck')?.task_key);assert.ok(recheck);
        await page.evaluate(key=>taskDetail(key),recheck);await page.locator('#detail-confirm-event').waitFor();
        assert.equal(await page.locator('[data-status]').count(),0);await widthCheck('recheck EN');await shot('25-recheck-en');
        await page.locator('[data-nav=plan]').click();await page.locator('#open-clarifications').click();await widthCheck('clarifications EN');
        await page.locator('.needs_review [data-resolve]').first().click();await page.locator('#review-done').waitFor();await widthCheck('review EN');
        // New episode remains distinct; prior actions are available read-only.
        const old=await page.evaluate(()=>plan.tasks.find(t=>t.engine_status==='superseded')?.task_key);assert.ok(old);
        await page.evaluate(key=>taskDetail(key),old);await page.locator('#detail-history').waitFor();
        assert.equal(await page.locator('[data-status]').count(),0);await widthCheck('read-only EN');await shot('23-read-only-en');
        await page.evaluate(async()=>{
            for(const t of plan.tasks.filter(t=>t.engine_status==='actionable'&&t.user_status!=='completed'&&t.completion_basis!=='reported_fact'))
                await api('/me/tasks/'+encodeURIComponent(t.task_key)+'/status','PATCH',{status:'completed'});
            await refreshSnapshot();navigate({name:'plan'});
        });
        assert.equal(await page.evaluate(()=>RoadmapView.hero(plan.tasks).engine_status),'requires_recheck');
        await shot('29-hero-recheck-en');await widthCheck('recheck Hero EN');
        await page.locator('[data-nav=profile]').click();await page.locator('[data-field=citizenship]').click();
        await page.locator('[name=citizenship]').fill('Test country amended');await page.locator('dialog [data-language=ru]').click();await page.locator('html[lang=ru]').waitFor();
        assert.equal(await page.locator('[name=citizenship]').inputValue(),'Test country amended');await widthCheck('sheet RU');await shot('24-profile-sheet');
        await page.reload();await page.locator('[name=citizenship]').waitFor();assert.equal(await page.locator('[name=citizenship]').inputValue(),'Test country amended');
        await page.locator('#field-form button[type=submit]').click();await page.locator('#field-editor').waitFor({state:'detached'});
        assert.equal(await page.evaluate(()=>profile.citizenship),'Test country amended');
        // GET errors and a bounded loading state have real retry navigation.
        await page.locator('[data-nav=plan]').click();
        await page.route('**/api/me/history*',r=>r.abort());await page.locator('[data-history]').click();
        await page.locator('#read-retry').waitFor();await widthCheck('read error');await shot('26-history-error');await page.unroute('**/api/me/history*');
        let releaseHistory;const pendingHistory=new Promise(resolve=>releaseHistory=resolve);
        await page.route('**/api/me/history*',async r=>{await pendingHistory;await r.continue();});
        await page.locator('#read-retry').click();await page.locator('.loading').waitFor();await shot('27-history-loading');
        releaseHistory();await page.locator('[data-history-filter]').first().waitFor();await page.unroute('**/api/me/history*');await widthCheck('history');
        // A short viewport models reduced space; physical keyboard remains a device check.
        await page.locator('[data-nav=profile]').click();await page.locator('[data-field=citizenship]').click();
        await page.setViewportSize({width:320,height:480});await page.locator('[name=citizenship]').focus();
        await page.locator('#field-form button[type=submit]').scrollIntoViewIfNeeded();
        assert.ok(await page.locator('#field-form button[type=submit]').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
        await shot('28-sheet-short-viewport');await page.locator('#field-close').click();await page.setViewportSize({width:390,height:844});
        // Deletion remains reachable and removes the actual server profile/session.
        const removedToken=await page.evaluate(()=>token);await page.locator('#delete-data').click();await page.locator('#confirm-delete').click();await page.locator('[name=arrival_status]').first().waitFor();
        const removed=await page.request.get('http://127.0.0.1:8010/api/me/profile',{headers:{Authorization:'Bearer '+removedToken}});assert.equal(removed.status(),401);
        assert.deepEqual(errors,[]);
        console.log('PASS: 4-question RU/EN, consent, full catalogue, late-entry complete/undo/next Hero, empty stage, origin+reload, event+sheet draft RU/EN/reload, stable idempotency key, all 12 events, recheck/read-only, loading/error/retry, short viewport, delete, 320/360/390px and 44px targets.');
    } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
