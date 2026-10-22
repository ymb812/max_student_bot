/* Regression flows found in the 20 Oct review. Local synthetic server only. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8010';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use the isolated preview server; this test publishes model rules.');
const output=path.resolve('output/project-review');fs.mkdirSync(output,{recursive:true});
(async()=>{
    const browser=await chromium.launch({headless:true,channel:'chrome'}),errors=[],tokens=[],rulesToArchive=[];
    const page=await browser.newPage({viewport:{width:390,height:844}}),admin=await browser.newPage({viewport:{width:1280,height:900}});
    for(const p of [page,admin]){p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());await p.route('https://st.max.ru/**',r=>r.abort());}
    page.setDefaultTimeout(10000);admin.setDefaultTimeout(10000);
    const authHeaders=t=>({Authorization:'Bearer '+t});
    const profileFor=async(p,university='sutd')=>{
        const a=await p.request.post(base+'/api/auth/demo');assert.equal(a.status(),200);const t=(await a.json()).access_token;tokens.push(t);
        const initial=await (await p.request.get(base+'/api/me/profile',{headers:authHeaders(t)})).json();
        const r=await p.request.patch(base+'/api/me/profile',{headers:authHeaders(t),data:{...initial,university_id:university,consent:true,age_band:'adult',migration_basis:'study',study_status:'active',entry_purpose:'study',residence_type:'dorm',visa_regime:'visa',entry_at:'2026-09-01',visa_expiry:'2027-02-01',registration_expiry:'2027-02-01',citizenship:'Synthetic country'}});assert.equal(r.status(),200);return t;
    };
    const shot=async name=>{await page.locator('#toast').evaluate(e=>e.style.display='none');await page.screenshot({path:path.join(output,name+'.png'),fullPage:!await page.locator('dialog[open]').count()});};
    const submitEvent=async()=>{await page.locator('#event-form input[type=checkbox][required]').check();await page.locator('#event-form button[type=submit]').click();await page.locator('#result-plan').waitFor();};
    const openHistory=async()=>{await page.locator('[data-nav=events]').click();await page.locator('#event-history').click();await page.locator('[data-history-filter=all]').waitFor();};
    const adminRow=id=>admin.locator('tr').filter({hasText:id});
    const publish=async id=>{await adminRow(id).locator('[data-preview]').click();await admin.locator('#publish-consent').check();await admin.locator('#publish').click();await admin.locator('#modal').waitFor({state:'hidden'});await adminRow(id).locator('[data-archive]').waitFor();};
    try{
        const t=await profileFor(page);await page.addInitScript(t=>{if(!sessionStorage.getItem('student_token'))sessionStorage.setItem('student_token',t);},t);
        await page.goto(base);await page.locator('#context-profile').waitFor();
        // A transfer is an explicit event, not an edit that always returns 409.
        await page.locator('[data-nav=profile]').click();await page.locator('[data-field=university_id]').click();
        assert.equal(await page.locator('[name=university_id]').count(),0);await page.locator('#university-transfer').click();
        assert.equal(await page.locator('[name=type]').inputValue(),'enrolment_changed');
        await page.locator('[data-nav=plan]').click();
        // Initial profile revisions are not labelled as a newly saved event.
        await openHistory();await page.locator('[data-history-filter=all]').click();await page.locator('[data-revision]').first().click();await page.locator('#result-plan').waitFor();
        assert.equal(await page.locator('h1').innerText(),'Изменения маршрута');assert.match(await page.locator('.success-note').innerText(),/Уточнение данных/);
        // Optional facts survive corrections through the actual form.
        // Seed a legacy entry: the new form no longer asks for city arrival.
        await page.evaluate(async()=>{await api('/me/events','POST',{type:'entry_recorded',occurred_at:'2026-09-02',payload:{entry_purpose:'study',visa_regime:'visa',residence_type:'dorm',arrival_at:'2026-09-02T13:12:34+03:00'},confirmed:true,idempotency_key:crypto.randomUUID()});await refreshSnapshot();});
        await openHistory();await page.locator('[data-edit-event]').first().click();assert.equal(await page.locator('[name=arrival_at]').count(),0);await submitEvent();
        let events=await page.evaluate(async()=>(await api('/me/events')).events);const corrected=events.find(e=>e.supersedes_event_id);assert.equal(corrected.payload.arrival_at,'2026-09-02T13:12:34+03:00');
        await page.locator('[data-nav=events]').click();await page.locator('[data-event=registration_confirmed]').click();await page.locator('[name=occurred_at]').fill('2026-09-03');await page.locator('[name=registration_expiry]').fill('2027-02-01');await page.locator('[name=stay_expiry]').fill('2027-01-15');await submitEvent();
        await openHistory();await page.locator('[data-edit-event]').first().click();assert.equal(await page.locator('[name=stay_expiry]').inputValue(),'2027-01-15');await submitEvent();
        assert.equal(await page.evaluate(()=>plan.effective_profile.stay_expiry),'2027-01-15');
        // Edit and publish a compound model rule. Only the contact/documents change in v2.
        await admin.goto(base+'/admin');await admin.locator('[name=key]').fill('local-ui-sutd');await admin.locator('#login-form button').click();await admin.locator('#create').waitFor();
        const id='demo.review.'+Date.now();const spec={kind:'preparation_start',owner:'university',required_or_recommended:'recommended_by_university',anchor_field:'visa_expiry',offset:null,absolute_date:'2026-12-01',unit:'calendar',literal:{ru:'Модельная дата',en:'Model date'}};
        const draft={rule_id:id,family:'M07',semantic_action_key:id,title_i18n:{ru:'Демо: проверка комплекта',en:'Demo: documents check'},action_i18n:{ru:'Обратитесь в модельный офис',en:'Contact the model office'},documents_i18n:{ru:['Первый документ'],en:['First document']},contact:'Модельный кабинет 100',eligibility_predicate:{visa_regime:'visa'},trigger_types:['entry_recorded','reentry_recorded'],deadline_specs:[spec,{...spec,absolute_date:null,offset:-45,literal:{ru:'Второй модельный срок',en:'Second model deadline'}}],source_type:'demo_model',source_url:'https://example.org/review',source_title:'Модельный источник',checked_at:'2026-09-27',effective_from:'2026-09-27',evidence_note:'Демонстрационное изменение, не инструкция вуза'};
        await admin.evaluate(async d=>{await api('/admin/rules','POST',d);await load();},draft);rulesToArchive.push({id,version:1});
        await adminRow(id).locator('[data-edit]').click();await admin.locator('[name=contact]').fill('Модельный кабинет 101');await admin.locator('#rule-form button').click();await admin.locator('#modal').waitFor({state:'hidden'});
        let saved=await admin.evaluate(id=>rules.find(r=>r.rule_id===id),id);assert.deepEqual(saved.deadline_specs.map(d=>[d.absolute_date,d.offset]),[['2026-12-01',null],[null,-45]]);assert.deepEqual(saved.trigger_types,draft.trigger_types);
        await publish(id);
        await page.goto(base+'/?screen=plan');await page.locator('#context-profile').waitFor();
        await adminRow(id).locator('[data-edit]').click();await admin.locator('[name=contact]').fill('Модельный кабинет 202');await admin.locator('[name=documents_ru]').fill('Новый документ');await admin.locator('[name=documents_en]').fill('New document');await admin.locator('#rule-form button').click();await admin.locator('#modal').waitFor({state:'hidden'});rulesToArchive.push({id,version:2});
        await adminRow(id).filter({hasText:'v2'}).locator('[data-preview]').click();await admin.locator('#publish-consent').check();await admin.locator('#publish').click();await admin.locator('#modal').waitFor({state:'hidden'});
        await page.goto(base+'/?screen=plan');await page.locator('#context-profile').waitFor();await openHistory();await page.locator('[data-history-filter=tasks]').click();await page.locator('[data-revision]').first().click();await page.locator('#result-plan').waitFor();
        const text=await page.locator('#screen').innerText();for(const value of ['Модельный кабинет 101','Модельный кабинет 202','Первый документ','Новый документ','Опубликована версия правила вуза'])assert.ok(text.includes(value),value);
        await shot('publication-diff-ru');await page.locator('[data-language=en]').click();await page.locator('html[lang=en]').waitFor();assert.ok((await page.locator('#screen').innerText()).includes('New document'));await shot('publication-diff-en');
        // Second editor never sees the first university's model rule.
        await admin.locator('[data-logout]').first().click();await admin.locator('[name=key]').fill('local-ui-leti');await admin.locator('#login-form button').click();await admin.locator('#create').waitFor();assert.equal(await adminRow(id).count(),0);
        await admin.locator('#create').click();await admin.locator('[name=title_ru]').fill('Демо ЛЭТИ');await admin.locator('[name=title_en]').fill('LETI demo');await admin.locator('[name=action_ru]').fill('Обратитесь в офис');await admin.locator('[name=action_en]').fill('Contact office');await admin.locator('[name=contact]').fill('Модельный офис');const letiId=await admin.locator('[name=rule_id]').inputValue();await admin.locator('#rule-form button').click();await admin.locator('#modal').waitFor({state:'hidden'});await publish(letiId);await adminRow(letiId).locator('[data-archive]').click();await admin.locator('#archive-confirm').click();await admin.locator('#modal').waitFor({state:'hidden'});
        // MAX authentication is simulated; profile and event endpoints stay real.
        const max=await browser.newPage({viewport:{width:320,height:640}});max.on('pageerror',e=>errors.push(e.message));max.on('dialog',d=>d.accept());await max.route('https://st.max.ru/**',r=>r.abort());
        const first=await profileFor(max),second=await profileFor(max),other=await profileFor(max,'leti');let attempt=0;
        await max.addInitScript(()=>window.WebApp={initData:'user=%7B%22id%22%3A111222%7D'});
        await max.route('**/api/auth/max',r=>r.fulfill({json:{access_token:attempt++===0?first:second}}));
        await max.goto(base);await max.locator('#context-profile').waitFor();await max.locator('[data-nav=events]').click();await max.locator('[data-event=entry_recorded]').click();await max.locator('[name=occurred_at]').fill('2026-09-25');await max.locator('[name=residence_type]').selectOption('private');
        await max.evaluate(()=>{const legacy=draftControls().filter(el=>el.name!=='arrival_at').map(el=>({value:el.value,checked:el.checked}));const legacyKey='ryadom_form_'+token+'_'+[route.name,route.key,route.field,route.type,route.original?.id].join('|');sessionStorage.removeItem(formDraftKey());sessionStorage.setItem(legacyKey,JSON.stringify(legacy));const state={...history.state};delete state.scope;history.replaceState(state,'',location.href);});
        const key=await max.evaluate(()=>route.submissionKey);await max.reload();await max.locator('#event-form').waitFor();assert.equal(await max.locator('[name=occurred_at]').inputValue(),'2026-09-25');assert.equal(await max.locator('[name=residence_type]').inputValue(),'private');assert.equal(await max.evaluate(()=>route.submissionKey),key);
        await max.addInitScript(()=>window.WebApp={initData:'user=%7B%22id%22%3A333444%7D'});await max.unroute('**/api/auth/max');await max.route('**/api/auth/max',r=>r.fulfill({json:{access_token:other}}));await max.reload();await max.locator('#event-form').waitFor();assert.equal(await max.locator('[name=occurred_at]').inputValue(),'');assert.notEqual(await max.evaluate(()=>route.submissionKey),key);await max.close();
        // Expiry must offer a usable sign-in path, instead of leaving dead controls.
        await page.locator('[data-nav=profile]').click();await page.route('**/api/me/profile',r=>r.request().method()==='PATCH'?r.fulfill({status:401,json:{detail:'Session expired'}}):r.continue());await page.locator('#notification-toggle').click();await page.locator('#retry-auth').waitFor();assert.equal(await page.evaluate(()=>authState),'expired');assert.equal(await page.locator('#notification-toggle').count(),0);await shot('session-expired');await page.unroute('**/api/me/profile');
        assert.deepEqual(errors,[]);
        console.log('PASS: transfer UX; profile/publication history RU/EN with contact/documents diff; optional event facts retained on correction; compound rule edit/publish/version/archive; both editor tenants; MAX draft rotation/account isolation; expired session recovery.');
    }finally{
        const a=await admin.request.post(base+'/api/auth/editor',{data:{key:'local-ui-sutd'}});if(a.ok()){const h=authHeaders((await a.json()).access_token);for(const r of rulesToArchive)await admin.request.post(base+`/api/admin/rules/${r.id}/versions/${r.version}/archive`,{headers:h});}
        for(const t of tokens)await page.request.delete(base+'/api/me/profile',{headers:authHeaders(t)});
        await browser.close();
    }
})().catch(e=>{console.error(e);process.exitCode=1;});
