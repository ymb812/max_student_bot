/* Welcome acceptance. Real API with disposable synthetic students; MAX responses are mocked explicitly. */
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const path = require('node:path');
const fs = require('node:fs');
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:8010';
const output = path.resolve('output/welcome'); fs.mkdirSync(output,{recursive:true});
(async()=>{
    const browser=await chromium.launch({headless:true,channel:'chrome'});
    const tokens=new Set(), errors=[];
    const newPage=async()=>{
        const page=await browser.newPage({viewport:{width:390,height:844}});
        page.on('pageerror',e=>errors.push(e.message));
        page.on('response',async r=>{
            if(r.url()===base+'/api/auth/demo' && r.ok()) tokens.add((await r.json()).access_token);
        });
        await page.route('https://st.max.ru/**',r=>r.abort());
        // Detect even a transient welcome on a completed student's entry.
        await page.addInitScript(()=>{
            window.sawWelcome=false;
            new MutationObserver(records=>{
                for(const r of records) for(const el of r.addedNodes)
                    if(el.nodeType===1 && (el.matches?.('.is-welcome') || el.querySelector?.('.is-welcome'))) window.sawWelcome=true;
            }).observe(document,{childList:true,subtree:true});
        });
        return page;
    };
    const demo=async(page)=>{
        const r=await page.request.post(base+'/api/auth/demo');assert.equal(r.status(),200);
        const value=(await r.json()).access_token;tokens.add(value);return value;
    };
    const clean=async page=>{
        for(const value of tokens) {
            const r=await page.request.delete(base+'/api/me/profile',{headers:{Authorization:'Bearer '+value}});
            assert.ok([200,401].includes(r.status()),'synthetic profile cleanup');
        }
    };
    const page=await newPage();
    try {
        let patches=0,events=0,onboardings=0;
        page.on('request',r=>{if(r.url()===base+'/api/me/profile' && r.method()==='PATCH')patches++;if(r.url()===base+'/api/me/events' && r.method()==='POST')events++;if(r.url()===base+'/api/me/onboarding'&&r.method()==='POST')onboardings++;});
        await page.goto(base);await page.locator('#start-plan').waitFor();
        assert.equal(await page.locator('#onboard-form').count(),0);
        assert.equal(await page.locator('#start-plan svg').count(),0);
        assert.equal(await page.locator('.rp button,.rp a').count(),0,'preview is non-interactive');
        assert.equal(await page.locator('.rp-on').count(),1);
        assert.equal(await page.locator('.rp-on .rp-stage').innerText(),'После приезда\nТекущий этап в примере');
        const colors=await page.locator('.rp-row').evaluateAll(es=>es.map(el=>getComputedStyle(el).backgroundColor));
        assert.equal(colors[0],colors[2]);assert.notEqual(colors[0],colors[1]);
        assert.ok(!(await page.locator('.is-welcome').innerText()).includes('ё'));
        assert.equal(await page.evaluate(()=>onboardingDraft.started),false);
        const initial=await page.evaluate(()=>profile);
        for(const language of ['ru','en']) {
            await page.locator(`[data-language=${language}]`).click();
            for(const width of [320,360,390,430]) {
                await page.setViewportSize({width,height:844});
                assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${language} overflow at ${width}`);
                assert.deepEqual(await page.locator('button').evaluateAll(es=>es.filter(el=>{const b=el.getBoundingClientRect();return b.width<44||b.height<44;}).map(el=>el.id)),[]);
                await page.locator('#screen').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
                await page.screenshot({path:path.join(output,`welcome-${language}-${width}.png`),fullPage:true});
            }
        }
        // Short screens scroll to the CTA; reduced motion removes the entrance animation.
        await page.setViewportSize({width:320,height:480});
        await page.locator('#start-plan').scrollIntoViewIfNeeded();
        assert.ok(await page.locator('#start-plan').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight));
        await page.emulateMedia({reducedMotion:'reduce'});
        assert.equal(await page.locator('#screen').evaluate(el=>getComputedStyle(el).animationName),'none');
        await page.setViewportSize({width:390,height:844});
        await page.reload();await page.locator('#start-plan').waitFor();
        assert.equal(await page.locator('html').getAttribute('lang'),'en');
        assert.equal(patches,0);assert.equal(events,0);assert.deepEqual(await page.evaluate(()=>profile),initial);
        await page.locator('#start-plan').click();await page.locator('[value=arrived]').check();
        assert.equal(await page.evaluate(()=>document.activeElement.tagName),'INPUT');
        await page.locator('[data-back]').click();await page.locator('#start-plan').waitFor();
        await page.locator('[data-language=ru]').click();await page.locator('#start-plan').click();
        assert.equal(await page.locator('[value=arrived]').isChecked(),true);
        assert.equal(await page.evaluate(()=>document.activeElement.tagName),'H1');
        await page.goBack();await page.locator('#start-plan').waitFor();
        await page.goForward();await page.locator('[value=arrived]').waitFor();
        assert.equal(await page.locator('[value=arrived]').isChecked(),true);
        await page.locator('[name=university_id]').selectOption('leti');await page.locator('#next').click();
        await page.locator('[data-language=en]').click();await page.reload();await page.locator('[name=age_band]').waitFor();
        assert.equal(await page.evaluate(()=>onboardingDraft.university_id),'leti');
        assert.equal(await page.evaluate(()=>step),1);
        assert.equal(await page.locator('.is-welcome').count(),0);
        for(const name of ['age_band','study_status','migration_basis'])await page.locator('[name='+name+']').selectOption('unknown');
        await page.locator('#next').click();await page.locator('[name=visa_regime]').selectOption('visa_free');
        await page.locator('[name=entry_at_unknown]').check();
        await page.locator('[name=entry_purpose]').selectOption('unknown');await page.locator('[name=residence_type]').selectOption('unknown');
        await page.locator('#next').click();await page.locator('[name=office_package]').selectOption('unknown');await page.locator('[name=registration]').selectOption('unknown');
        await page.locator('#next').click();
        assert.equal(await page.locator('[name=consent]').isChecked(),false);
        assert.equal(await page.locator('#onboard-form').evaluate(f=>f.checkValidity()),false);
        await page.locator('[name=consent]').check();await page.locator('[data-language=ru]').click();
        assert.equal(await page.locator('[name=consent]').isChecked(),true);
        assert.equal(patches,0);assert.equal(events,0);
        await page.locator('#next').click();await page.locator('#context-profile').waitFor();
        assert.equal(patches,0);assert.equal(events,0);assert.equal(onboardings,1);
        assert.equal(await page.evaluate(()=>profile.entry_at),null);
        assert.equal(await page.evaluate(()=>sessionStorage.getItem(onboardingStorageKey())),null);
        await page.reload();await page.locator('#context-profile').waitFor();
        assert.equal(await page.evaluate(()=>window.sawWelcome),false);
        await page.goBack();await page.locator('#context-profile').waitFor();
        assert.equal(await page.locator('#onboard-form,#start-plan').count(),0);
        assert.ok((await page.url()).includes('screen=plan'));
        await page.goto(base+'/?screen=stage&stage=study');
        await page.locator('.progress-label').waitFor();
        assert.equal(await page.evaluate(()=>route.stage),'study');assert.equal(await page.evaluate(()=>window.sawWelcome),false);
        await page.locator('[data-back]').click();await page.locator('#context-profile').waitFor();

        // Legacy auto-created empty draft is not proof that onboarding started.
        const legacy=await newPage();await legacy.goto(base);await legacy.locator('#start-plan').waitFor();
        await legacy.evaluate(()=>{const draft={...onboardingDraft};delete draft.started;sessionStorage.setItem(onboardingStorageKey(),JSON.stringify(draft));});
        await legacy.reload();await legacy.locator('#start-plan').waitFor();
        await legacy.evaluate(()=>{const draft={...onboardingDraft,arrival_status:'planned',university_id:'sutd',step:1};delete draft.started;sessionStorage.setItem(onboardingStorageKey(),JSON.stringify(draft));});
        await legacy.reload();await legacy.locator('[name=age_band]').waitFor();
        assert.equal(await legacy.evaluate(()=>onboardingDraft.university_id),'sutd');
        await legacy.locator('[data-back]').click();await legacy.locator('[value=planned]').waitFor();
        assert.equal(await legacy.locator('[value=planned]').isChecked(),true);
        await legacy.locator('[data-back]').click();await legacy.locator('#start-plan').waitFor();
        // Even an unanswered first question resumes after an explicit CTA.
        const unanswered=await newPage();await unanswered.goto(base+'/?screen=stages');await unanswered.locator('#start-plan').click();
        await unanswered.reload();await unanswered.locator('#onboard-form').waitFor();
        assert.equal(await unanswered.locator('#onboard-form').evaluate(f=>f.checkValidity()),false);
        await unanswered.locator('[value=planned]').check();await unanswered.locator('[name=university_id]').selectOption('sutd');await unanswered.locator('#next').click();
        for(const name of ['age_band','study_status','migration_basis'])await unanswered.locator('[name='+name+']').selectOption('unknown');
        await unanswered.locator('#next').click();await unanswered.locator('[name=visa_regime]').selectOption('visa');
        await unanswered.locator('[name=preparation]').selectOption('unknown');await unanswered.locator('#next').click();
        await unanswered.locator('[name=consent]').check();await unanswered.locator('#next').click();
        await unanswered.getByRole('heading',{name:'Все этапы',exact:true}).waitFor();
        assert.equal(await unanswered.evaluate(()=>route.name),'stages','preserve target through onboarding');

        // Delayed/failed MAX auth must never create a browser demo identity or show welcome.
        const max=await newPage();const firstToken=await demo(max),secondToken=await demo(max);
        await max.addInitScript(()=>{window.WebApp={initData:new URLSearchParams({user:JSON.stringify({id:123456})}).toString(),BackButton:{show(){},hide(){},offClick(){},onClick(fn){window.maxBack=fn;}}};});
        let maxAttempts=0, demoAttempts=0,releaseAuth;
        const hold=new Promise(resolve=>releaseAuth=resolve);
        max.on('request',r=>{if(r.url()===base+'/api/auth/demo')demoAttempts++;});
        await max.route('**/api/auth/max',async r=>{
            maxAttempts++;
            if(maxAttempts===1) {await hold;await r.fulfill({status:401,json:{detail:'Synthetic failed verification'}});}
            else await r.fulfill({status:200,json:{access_token:maxAttempts===2?firstToken:secondToken}});
        });
        await max.goto(base);await max.getByRole('status').filter({hasText:'Проверяем вход'}).waitFor();
        assert.equal(await max.locator('#start-plan,#onboard-form').count(),0);
        await max.locator('[data-language=en]').click();releaseAuth();await max.locator('#retry-auth').waitFor();
        assert.equal(await max.locator('#retry-auth').innerText(),'Retry sign-in');assert.equal(demoAttempts,0);
        await max.locator('#retry-auth').click();await max.locator('#start-plan').click();
        await max.locator('[value=arrived]').check();await max.locator('[name=university_id]').selectOption('leti');await max.locator('#next').click();
        await max.reload();await max.locator('[name=age_band]').waitFor();
        assert.equal(await max.evaluate(()=>token),secondToken);
        assert.equal(await max.evaluate(()=>onboardingDraft.university_id),'leti','draft survives verified MAX token rotation');
        assert.equal(demoAttempts,0);
        await max.addInitScript(()=>window.WebApp.initData='');
        await max.reload();await max.locator('[name=age_band]').waitFor();
        assert.equal(await max.evaluate(()=>onboardingDraft.university_id),'leti','same valid bearer restores its MAX draft without launch data');
        await max.evaluate(()=>window.maxBack());await max.locator('[value=arrived]').waitFor();
        await max.evaluate(()=>window.maxBack());await max.locator('#start-plan').waitFor();
        assert.equal(await max.evaluate(()=>onboardingDraft.arrival_status),'arrived');

        // A completed MAX entry honors the task target without welcome.
        const target=await page.evaluate(()=>plan.tasks.find(t=>t.deep_link_id));assert.ok(target);
        const completedToken=await page.evaluate(()=>token);
        await max.addInitScript(({completedToken,target})=>{
            sessionStorage.setItem('student_token',completedToken);
            window.WebApp={initData:'user=%7B%22id%22%3A987654%7D',initDataUnsafe:{start_param:'task_'+target.deep_link_id}};
        },{completedToken,target});
        await max.unroute('**/api/auth/max');
        await max.route('**/api/auth/max',r=>r.fulfill({status:200,json:{access_token:completedToken}}));
        await max.goto(base);await max.locator('.task-detail').waitFor();
        assert.equal(await max.evaluate(()=>route.key),target.task_key);assert.equal(await max.evaluate(()=>window.sawWelcome),false);
        assert.deepEqual(errors,[]);
        console.log('PASS: welcome RU/EN 320/360/390/430px, short viewport/reduced motion, static preview, atomic adaptive onboarding/consent, Back/Forward/mocked MAX Back, draft reload/legacy/token rotation, completed plan/query/mocked MAX task entry without welcome, auth loading/error/retry without demo fallback.');
    } finally {await clean(page);await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
