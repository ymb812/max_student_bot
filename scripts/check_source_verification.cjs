/* Local synthetic profile: missing evidence must remain visibly unverified. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.UI_BASE_URL||'http://127.0.0.1:8015',out=path.resolve(process.env.LAYOUT_OUTPUT||'output/source-verification');
assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname));fs.mkdirSync(out,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:320,height:844}});await page.route('https://st.max.ru/**',r=>r.abort());
try{await page.goto(base);await page.locator('#start-plan').waitFor();await page.evaluate(async()=>{await api('/me/onboarding','POST',{profile:{...profile,university_id:'leti',consent:true,reminders_enabled:false,arrival_status:'planned',age_band:'adult',study_status:'admitted',migration_basis:'study',visa_regime:'visa'},preparation:'not_started',confirmed:true,idempotency_key:crypto.randomUUID()});await refreshSnapshot();navigate({name:'plan'},true);});
for(const language of ['ru','en']){
 await page.locator('[data-language='+language+']').click();await page.waitForFunction(language=>lang===language&&profile.language===language,language);
 await page.evaluate(()=>{const task=plan.tasks.find(t=>t.process==='invitation');navigate({name:'task-info',key:task.task_key},true);});
 const source=page.locator('.reference-source').filter({has:page.locator('a[href$="/do-priezda"]')});assert.equal(await source.count(),1);
 const text=await source.innerText();assert.match(text,language==='ru'?/не удалось проверить/:/could not be checked/);assert.match(text,language==='ru'?/Не проверено/:/Not verified/);assert.doesNotMatch(text,/Раздел на странице проверяли|Page section checked/);
 assert.equal(await page.evaluate(()=>plan.tasks.find(t=>t.process==='invitation').norm_confidence),'C');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 await source.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,'leti-invitation-source-'+language+'.png')});fs.writeFileSync(path.join(out,'leti-invitation-source-'+language+'.txt'),await page.locator('.task-information').innerText());
}
await page.evaluate(async()=>api('/me/profile','DELETE'));console.log('PASS: 2 RU/EN source screens; unavailable invitation evidence is disclosed and confidence remains conditional.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
