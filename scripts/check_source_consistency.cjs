/* Real local API, synthetic profiles. Keyboard access and source copy across views. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8015';
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));
const out=path.resolve(process.env.LAYOUT_OUTPUT||'output/source-consistency');fs.mkdirSync(out,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'}),checks=[],errors=[];
 try {
  for(const tenant of ['sutd','leti']) {
   const page=await browser.newPage({viewport:{width:320,height:844}});
   page.on('pageerror',e=>errors.push(e.message));await page.route('https://st.max.ru/**',r=>r.abort());
   const tabTo=async selector=>{
    for(let i=0;i<80;i++) {
     await page.keyboard.press('Tab');
     if(await page.evaluate(selector=>document.activeElement.matches(selector),selector))return;
    }
    throw Error('Keyboard could not reach '+selector);
   };
   await page.goto(base);await page.locator('#start-plan').waitFor();
   await page.evaluate(async tenant=>{
    await api('/me/onboarding','POST',{profile:{...profile,university_id:tenant,consent:true,reminders_enabled:false,arrival_status:'planned',age_band:'adult',study_status:'admitted',migration_basis:'study',visa_regime:'visa'},preparation:'not_started',confirmed:true,idempotency_key:crypto.randomUUID()});
    await refreshSnapshot();navigate({name:'plan'},true);
   },tenant);
   for(const language of ['ru','en']) {
    await page.locator('[data-language='+language+']').click();await page.waitForFunction(language=>lang===language&&profile.language===language,language);
    for(const width of [320,390,1280]) {
    await page.setViewportSize({width,height:844});
    await page.evaluate(()=>navigate({name:'task',key:plan.tasks.find(t=>t.process==='invitation').task_key},true));
    await tabTo('#detail-reference');
    assert.notEqual(await page.locator('#detail-reference').evaluate(e=>getComputedStyle(e).outlineStyle),'none');
    await page.keyboard.press('Enter');await page.locator('.task-information').waitFor();
    const expected=await page.locator('.reference-source').allInnerTexts();
    await tabTo('.reference-title');
    assert.equal(await page.locator('.reference-title:focus').count(),1);
    for(const view of ['task-info','review']) {
     if(view==='review')await page.evaluate(()=>navigate({name:'review',key:plan.tasks.find(t=>t.process==='invitation').task_key},true));
     const texts=await page.locator('.reference-source').allInnerTexts();assert.deepEqual(texts,expected);
     const combined=texts.join('\n');
     if(tenant==='leti') {
      assert.match(combined,language==='ru'?/Не проверено/:/Not verified/);
      assert.match(combined,language==='ru'?/не удалось проверить/:/could not be checked/);
      assert.doesNotMatch(combined,/Раздел на странице проверяли|Page section checked/);
     } else assert.match(combined,language==='ru'?/Раздел на странице проверяли/:/Page section checked/);
     if(language==='en') {
      assert.doesNotMatch(combined,/Проверено|Содержание источника проверяли/);
      if(tenant==='sutd')assert.match(combined,/Page section title: «До въезда. Оформление приглашения»/);
     }
     const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(overflow,false);
     const clippedButtons=await page.locator('.workflow-actions button').evaluateAll(buttons=>buttons.filter(b=>{
      const range=document.createRange();range.selectNodeContents(b);const text=range.getBoundingClientRect(),box=b.getBoundingClientRect();
      return text.left<box.left||text.right>box.right||text.top<box.top||text.bottom>box.bottom;
     }).map(b=>b.textContent));
     assert.deepEqual(clippedButtons,[],`${tenant}-${language}-${view}: result label clipped`);
     const label=[tenant,language,width,view].join('-');checks.push({label,overflow,clippedButtons,keyboardSourceAccess:true});
     await page.screenshot({path:path.join(out,label+'.png'),fullPage:true});fs.writeFileSync(path.join(out,label+'.txt'),await page.locator('body').innerText());
    }
    await page.reload();await page.locator('#review-done').waitFor();assert.deepEqual(await page.locator('.reference-source').allInnerTexts(),expected);
    await tabTo('#review-done');await page.keyboard.press('Enter');
    await page.waitForFunction(()=>route.name!=='review');
    }
   }
   await page.evaluate(async()=>api('/me/profile','DELETE'));await page.close();
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'checks.json'),JSON.stringify(checks,null,2));
  console.log(`PASS: ${checks.length} source screens; both universities/languages at 320/390/1280px; result labels fit, keyboard source access, visible focus, review return and reload.`);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
