/* Home layout and real-API navigation on disposable local profiles. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8012';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const output=path.resolve('output/home-compact');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage(),tokens=[],errors=[],checks=[];
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://st.max.ru/**',r=>r.abort());
 try {
  for(const tenant of ['sutd','leti']) {
   await page.goto(base);await page.locator('#start-plan').waitFor();tokens.push(await page.evaluate(()=>token));
   await page.evaluate(async tenant=>{await api('/me/onboarding','POST',{profile:{...profile,consent:true,reminders_enabled:false,university_id:tenant,arrival_status:'planned',age_band:'adult',study_status:'admitted',migration_basis:'study',visa_regime:'visa'},preparation:'requested',confirmed:true,idempotency_key:crypto.randomUUID()});await refreshSnapshot();navigate({name:'plan'},true);},tenant);
   for(const language of ['ru','en'])for(const width of [320,390,1280]) {
    await page.setViewportSize({width,height:844});await page.evaluate(language=>{lang=language;navigate({name:'plan'},true);},language);
    assert.equal(await page.locator('.hero-card h1').innerText(),language==='ru'?'Ждёте приглашение':'Waiting for your invitation');
    assert.equal(await page.locator('.hero-card .deadline-line').count(),0);
    assert.equal(await page.locator('.hero-card .primary svg').count(),0);
    assert.equal(await page.locator('.hero-card .primary').evaluate(e=>getComputedStyle(e).justifyContent),'center');
    assert.ok((await page.locator('.hero-card p').innerText()).includes(language==='ru'?(tenant==='sutd'?'e-mail':'ЛЭТИ'):(tenant==='sutd'?'email':'LETI')));
    assert.equal(await page.locator('#all-stages').count(),0);
    const metrics=await page.evaluate(()=>{
     const box=s=>document.querySelector(s).getBoundingClientRect();
     return {heroHeight:box('.hero-card').height,firstStageBottom:box('[data-stage]').bottom,navTop:box('.bottom-tabs').top,
      correctOrder:box('.data-summary').top>=box('.home-roadmap').bottom,
      overflow:document.documentElement.scrollWidth>innerWidth+1,
      small:[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length).filter(e=>{const r=e.getBoundingClientRect();return r.width<44||r.height<44;}).map(e=>e.textContent)};
    });
    assert.ok(metrics.heroHeight<280);assert.ok(metrics.correctOrder);assert.equal(metrics.overflow,false);assert.deepEqual(metrics.small,[]);
    if(width===390)assert.ok(metrics.firstStageBottom<metrics.navTop,'first stage is visible without scrolling');
    checks.push({tenant,language,width,...metrics});
    await page.screenshot({path:path.join(output,`${tenant}-${language}-${width}.png`)});
    await page.locator('.hero-card [data-task]').click();assert.ok(await page.locator('.task-context').isVisible());
    assert.ok(await page.locator('[data-result=received]').isVisible());
    await page.locator('[data-back]').click();assert.equal(await page.evaluate(()=>route.name),'plan');
    await page.locator('[data-stage=before]').click();await page.locator('[data-back]').click();
    await page.locator('#open-clarifications').click();await page.locator('[data-wait=planned_entry]').click();
    await page.locator('[data-back]').click();assert.equal(await page.locator('.data-count').innerText(),'1');
    await page.reload();await page.locator('.hero-card').waitFor();assert.equal(await page.locator('.data-count').innerText(),'1');
    // Reset only the test's deferred answer to exercise the next viewport independently.
    await page.evaluate(()=>{for(const k of Object.keys(sessionStorage))if(k.startsWith('ryadom_data_wait_'))sessionStorage.removeItem(k);});
   }
   await page.goto(base+'/?screen=stages');await page.locator('.home-roadmap').waitFor();assert.equal(await page.evaluate(()=>route.name),'plan');
   await page.evaluate(()=>sessionStorage.clear());
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({checks,errors,max:'NOT RUN'},null,2));
  console.log('PASS: '+checks.length+' RU/EN home layouts, both universities; task/stage/back, deferred data/reload, legacy stages URL.');
 }catch(e){await page.screenshot({path:path.join(output,'failure.png')});throw e;}
 finally{for(const token of tokens)assert.equal((await page.request.delete(base+'/api/me/profile',{headers:{Authorization:'Bearer '+token}})).status(),200);await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
