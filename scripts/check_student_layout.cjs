/* Responsive layout review with disposable synthetic data and the real API. */
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8010';
const output=path.resolve(process.env.LAYOUT_OUTPUT||'output/layout-review');fs.mkdirSync(output,{recursive:true});
const sizes=[{width:320,height:640},{width:390,height:844},{width:430,height:932},{width:768,height:1024},{width:1280,height:720},{width:1920,height:1320},{width:2560,height:1350}];
(async()=>{
    const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:sizes[1]});
    let studentToken;const errors=[],findings=[],screens=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://st.max.ru/**',r=>r.abort());
    const inspect=async name=>{
        for(const size of sizes){
            await page.setViewportSize(size);await page.evaluate(()=>scrollTo(0,0));
            await page.locator('#screen').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
            const metrics=await page.evaluate(()=>{
                const frame=document.querySelector('.ryadom-shell'),r=frame.getBoundingClientRect();
                const rect=el=>{const b=el.getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};
                const small=[...document.querySelectorAll('button')].filter(el=>el.getClientRects().length&&!el.disabled).filter(el=>{const b=el.getBoundingClientRect();return b.width<43.9||b.height<43.9;}).map(el=>el.id||el.textContent.trim());
                return {frame:rect(frame),radius:getComputedStyle(frame).borderRadius,bodyHeight:document.body.getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth,small,
                    nav:document.querySelector('.bottom-tabs')?rect(document.querySelector('.bottom-tabs')):null,
                    dialog:document.querySelector('dialog[open]')?rect(document.querySelector('dialog[open]')):null};
            });
            const label=`${name}-${size.width}`;
            if(metrics.overflow)findings.push(label+': horizontal overflow');
            if(metrics.bodyHeight<size.height)findings.push(label+': page background ends before viewport');
            if(metrics.small.length)findings.push(label+': small controls: '+metrics.small.join(', '));
            if(size.width>=600 && metrics.radius==='0px')findings.push(label+': desktop frame missing');
            if(metrics.dialog){const r=metrics.dialog;if(r.left<0||r.right>size.width+1||r.top<0||r.bottom>size.height+1)findings.push(label+': dialog clipped');}
            if(metrics.nav){const n=metrics.nav,r=metrics.frame;if(n.left<r.left-1||n.right>r.right+1||n.bottom>Math.min(r.bottom,size.height)+1)findings.push(label+': navigation detached from frame');}
            screens.push({name,...size,...metrics});
            if(size.width===390||size.width===1920||(size.width===320&&name.endsWith('-en'))){
                await page.locator('#toast').evaluate(el=>el.style.visibility='hidden');
                await page.screenshot({path:path.join(output,label+'.png'),fullPage:!metrics.dialog});
            }
        }
    };
    const view=async(next,name)=>{
        for(const language of ['ru','en']){
            await page.evaluate(({next,language})=>{lang=language;dirty=false;navigate(next,true);},{next,language});
            if(next.name==='history')await page.locator('[data-history-filter]').first().waitFor();
            if(next.name==='result')await page.locator('#result-plan').waitFor();
            await inspect(name+'-'+language);
        }
    };
    try{
        await page.goto(base);await page.locator('#start-plan').waitFor();studentToken=await page.evaluate(()=>token);
        for(const language of ['ru','en']){await page.locator(`[data-language=${language}]`).click();await inspect('welcome-'+language);}
        const welcomeFrame=screens.find(s=>s.name==='welcome-ru'&&s.width===1920).frame;
        await page.locator('#start-plan').click();
        for(let i=0;i<5;i++){
            for(const language of ['ru','en']){await page.locator(`[data-language=${language}]`).click();await inspect('question-'+(i+1)+'-'+language);}
            if(i===0){await page.locator('[name=arrival_status][value=arrived]').check();await page.locator('[name=university_id]').selectOption('sutd');}
            if(i===1){for(const name of ['age_band','study_status','migration_basis'])await page.locator('[name='+name+']').selectOption('unknown');}
            if(i===2){await page.locator('[name=visa_regime]').selectOption('visa');await page.locator('[name=entry_at_unknown]').check();await page.locator('[name=entry_purpose]').selectOption('unknown');await page.locator('[name=residence_type]').selectOption('dorm');}
            if(i===3){await page.locator('[name=office_package]').selectOption('unknown');await page.locator('[name=registration]').selectOption('unknown');await page.locator('[name=visa_expiry_unknown]').check();}
            if(i===4)await page.locator('[name=consent]').check();
            await page.locator('#next').click();
        }
        await page.locator('#context-profile').waitFor();
        const conditional=await page.evaluate(()=>plan.tasks.find(t=>t.engine_status==='conditional'&&t.missing_fields?.length&&t.missing_fields.every(k=>editableFields().includes(k)))?.task_key);
        assert.ok(conditional,'partial profile must offer a real clarification');
        await view({name:'clarifications'},'partial-clarifications');await view({name:'clarify',key:conditional},'clarification-sheet');
        await page.evaluate(async()=>{
            profile=await api('/me/profile','PATCH',{...profile,entry_at:'2026-10-01',visa_expiry:'2027-02-01',registration_expiry:'2027-02-01',age_band:'adult',migration_basis:'study',study_status:'active',entry_purpose:'study',citizenship:'Test country',stay_over_90_days:true,fingerprinting_completed:false,reminders_enabled:false});
            await refreshSnapshot();
        });
        const keys=await page.evaluate(async()=>({task:RoadmapView.hero(plan.tasks)?.task_key,review:plan.tasks.find(t=>t.engine_status==='needs_review')?.task_key,revision:(await api('/me/history')).revisions[0]?.id}));
        const eventTypes=await page.evaluate(()=>Object.keys(eventNames));
        assert.ok(keys.task&&keys.review&&keys.revision);
        for(const [next,name] of [
            [{name:'plan'},'plan'],[{name:'stages'},'stages'],
            ...['before','arrival','study'].map(stage=>[{name:'stage',stage},'stage-'+stage]),
            [{name:'task',key:keys.task},'task'],[{name:'workflow',key:keys.task,outcome:'submitted'},'workflow-result'],[{name:'clarifications'},'clarifications'],
            [{name:'review',key:keys.review},'review'],[{name:'events'},'events'],
            ...eventTypes.map(type=>[{name:'event',type},'event-'+type]),
            [{name:'result',revision:keys.revision},'result'],[{name:'history'},'history'],
            [{name:'profile'},'profile'],[{name:'edit',field:'citizenship'},'profile-sheet']
        ])await view(next,name);
        // A short stage keeps tabs inside the card; long content keeps them reachable on scroll.
        await page.setViewportSize(sizes[5]);await page.evaluate(()=>navigate({name:'stage',stage:'before'},true));
        assert.ok(await page.locator('.bottom-tabs').evaluate(el=>el.getBoundingClientRect().bottom<=document.querySelector('.ryadom-shell').getBoundingClientRect().bottom+1));
        await page.evaluate(()=>navigate({name:'plan'},true));
        await page.locator('.hero-card .primary').hover();
        await page.locator('.hero-card .primary').evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
        const contrast=await page.locator('.hero-card .primary').evaluate(el=>{
            const s=getComputedStyle(el),luma=color=>{const c=color.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return .2126*c[0]+.7152*c[1]+.0722*c[2];};
            const a=luma(s.color),b=luma(s.backgroundColor);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        });assert.ok(contrast>=4.5,'Hero hover text contrast: '+contrast);
        await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
        assert.ok(await page.locator('.bottom-tabs').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1;}));
        assert.deepEqual(errors,[]);assert.deepEqual(findings,[]);
        fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({base,screens,heroHoverContrast:contrast,errors,findings},null,2));
        console.log(`PASS: ${screens.length} RU/EN layout checks across ${sizes.map(s=>s.width).join('/')}px; all 12 event forms, consistent welcome/questions frame, full-height background, touch targets, dialogs, attached desktop tabs, scroll and Hero hover contrast ${contrast.toFixed(2)}:1.`);
    }finally{if(studentToken){const r=await page.request.delete(base+'/api/me/profile',{headers:{Authorization:'Bearer '+studentToken}});assert.equal(r.status(),200);}await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
