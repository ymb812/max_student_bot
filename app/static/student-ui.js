/* Screen state, navigation and rendering. Rule decisions remain on the server. */
let route = {name: 'plan'}, dirty = false, historyFilter = 'all';
let routeStack = [], rootScroll = {}, painting = 0;
const requestedScreen = new URLSearchParams(location.search);
const requestedNavigation = history.state;
const entrySessionScope = onboardingScope || token;
function ownsNavigation(state) {
    return state?.scope===sessionScope() || (state?.ryadom && !state.scope && entrySessionScope && entrySessionScope===sessionScope());
}
const stageNames = {before: ['До приезда', 'Before arrival'], arrival: ['После приезда', 'After arrival'], study: ['Во время учёбы', 'During your studies']};
Object.assign(iconPaths, {
    back: '<path d="m14 5-7 7 7 7"/>',
    university: '<path d="m3 8 9-5 9 5H3ZM5 10v9m5-9v9m4-9v9m5-9v9M3 21h18"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18M8 15h1m6 0h1m-8 3h1"/>',
    plane: '<path d="m21 3-6 18-4-8-8-4 18-6ZM11 13l5-5"/>',
    study: '<path d="m2 9 10-6 10 6-10 6L2 9Zm4 3v6l6 3 6-3v-6m4-3v9"/>',
    passport: '<rect x="4" y="2" width="16" height="20" rx="3"/><circle cx="12" cy="10" r="4"/><path d="M8 18h8M8 10h8m-4-4v8"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    medical: '<path d="M5 3v5a5 5 0 0 0 10 0V3M3 3h4m6 0h4M10 13v3a5 5 0 0 0 10 0v-3"/><circle cx="20" cy="10" r="2"/>',
    fingerprint: '<path d="M4 13V9a8 8 0 0 1 16 0v5M7 16V9a5 5 0 0 1 10 0v8M10 20V9a2 2 0 0 1 4 0v11M4 17v2"/>',
    history: '<path d="M3 10a9 9 0 1 1 1 7M3 4v6h6m3-4v6l4 2"/>',
    warning: '<circle cx="12" cy="12" r="10"/><path d="M12 6v7m0 4h.01"/>'
});
const stageIcon = id => ({before: 'plane', arrival: 'address', study: 'study'})[id];
const familyIcon = t => ({M01: 'plane', M02: 'passport', M03: 'university', M04: 'address', M05: 'medical', M06: 'fingerprint', M07: 'passport', M08: 'calendar', M10: 'medical'})[t.family] || 'info';
const effectiveProfile = () => plan.effective_profile || profile;
const universityName = () => effectiveProfile().university_id === 'sutd' ? 'СПбГУПТД' : effectiveProfile().university_id === 'leti' ? tr('ЛЭТИ', 'LETI') : tr('Вуз не указан', 'University not set');
const residenceName = v => ({dorm: tr('Общежитие', 'Dormitory'), private: tr('Частный адрес', 'Private accommodation'), other: tr('Другое', 'Other')})[v] || tr('Тип жилья не указан', 'Residence not set');
const visaName = v => ({visa: tr('Визовый въезд', 'Visa entry'), visa_free: tr('Безвизовый въезд', 'Visa-free entry')})[v] || tr('Режим въезда не указан', 'Entry regime not set');
const empty = text => `<div class="empty">${esc(text)}</div>`;
const note = text => `<div class="info-note">${icon('info', 21)}<span>${esc(text)}</span></div>`;
const heading = title => `<h1 class="screen-title">${esc(title)}</h1>`;
function lockedStatusReason(t) {
    if(t.engine_status==='superseded')return tr('Это прежнее действие. Его статус сохранён в истории; актуальные действия находятся в плане.','This is a previous task. Its status remains in history; current tasks are in your roadmap.');
    if(t.engine_status==='requires_recheck')return tr('Ранее отмечено вами. После изменения обстоятельств нужно проверить снова и сообщить новое подтверждение.','Previously reported by you. Check again after the change and record a new confirmation.');
    if(['conditional','needs_review'].includes(t.engine_status))return tr('Применимость не подтверждена. Уточните данные или обратитесь в офис; просмотр не подтверждает выполнение.','Applicability is unverified. Add information or consult the office; viewing this task does not complete it.');
    return tr('Статус установлен по записанному событию. Исправьте или отмените его в истории, чтобы изменить факт.','The status comes from a recorded event. Correct or retract it in History to change the fact.');
}
function languageControls() {
    return `<div class="language-switch" role="group" aria-label="${tr('Язык приложения','App language')}">${['ru','en'].map(l=>`<button type="button" data-language="${l}" aria-pressed="${lang===l}" aria-label="${l==='ru'?'Русский':'English'}" class="${lang===l?'selected':''}">${l.toUpperCase()}</button>`).join('')}</div>`;
}
function shell(inner, authOnly=false) {
    document.documentElement.lang = lang;
    const consented = profile.consent && !authOnly;
    const eventResult = route.name==='result' && (route.reason in eventNames || ['event_corrected','event_retracted'].includes(route.reason));
    const section = ['events', 'event'].includes(route.name) || eventResult ? 'events' : ['profile', 'edit'].includes(route.name) ? 'profile' : 'plan';
    const nested = !['plan', 'profile', 'events'].includes(route.name);
    const back = !authOnly && (consented ? nested : entryScreen === 'questions');
    const nav = `<nav class="bottom-tabs" aria-label="${tr('Основная навигация', 'Main navigation')}">${[['plan','address','План','Plan'],['events','event','Событие','Event'],['profile','profile','Мои данные','My information']].map(([id, glyph, ru, en]) => `<button data-nav="${id}" class="${section===id?'active':''}" ${section===id?'aria-current="page"':''}><span class="nav-icon">${icon(glyph,21)}</span><span>${tr(ru,en)}</span></button>`).join('')}</nav>`;
    return `<div class="ryadom-shell ${!consented?'is-onboarding':''} ${!consented && entryScreen==='welcome'?'is-welcome':''}"><header class="app-header">${back?`<button class="back-button" data-back aria-label="${tr('Назад','Back')}">${icon('back',20)}<span>${tr('Назад','Back')}</span></button>`:`<span class="app-brand"><img src="/static/ryadom-logo.svg" width="29" height="29" alt=""><span class="brand-name">${tr('Рядом','Ryadom')}</span></span>`}${languageControls()}</header><main class="screen" id="screen">${inner}</main>${consented?nav:''}</div>`;
}
function wireLanguageControls() {
    document.querySelectorAll('[data-language]').forEach(b=>b.onclick=guard(()=>switchLanguage(b.dataset.language)));
}
function wireShell() {
    document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => navigate({name:b.dataset.nav}));
    document.querySelector('[data-back]')?.addEventListener('click', goBack);
    wireLanguageControls();
    const backButton = window.WebApp?.BackButton;
    if (backButton) {
        backButton.offClick?.(goBack);
        if(authState==='expired'){backButton.hide?.();return;}
        if ((profile.consent && !['plan','events','profile'].includes(route.name)) || (!profile.consent && entryScreen==='questions')) {backButton.show?.();backButton.onClick?.(goBack);}
        else backButton.hide?.();
    }
}
// Drafts are scoped to the authenticated browser session, never used as server facts.
function sessionScope() { return onboardingScope || token; }
function formDraftKey() { return 'ryadom_form_' + sessionScope() + '_' + [route.name,route.key,route.field,route.type,route.original?.id].join('|')+(route.name==='workflow'?'|'+route.outcome+'|'+(route.report?.id||''):''); }
function migrateFormDrafts(previousToken) {
    if (!onboardingScope || !previousToken || previousToken===onboardingScope) return;
    const oldPrefix='ryadom_form_'+previousToken+'_', newPrefix='ryadom_form_'+onboardingScope+'_';
    for(const key of Object.keys(sessionStorage)) if(key.startsWith(oldPrefix)) {
        const nextKey=newPrefix+key.slice(oldPrefix.length);
        if(sessionStorage.getItem(nextKey)===null)sessionStorage.setItem(nextKey,sessionStorage.getItem(key));
        sessionStorage.removeItem(key);
    }
}
function draftControls() {
    const form = root.querySelector('#event-form,#field-form,#result-form');
    return form ? [...form.querySelectorAll('input,select,textarea'),...root.querySelectorAll('#event-text')] : [];
}
function draftControlKey(el) {
    return el.name || el.id || (el.hasAttribute('data-same-place')?'same-place':'confirmation');
}
function captureFormDraft() {
    const controls=draftControls();
    return controls.length ? {version:2,fields:controls.map(el=>({key:draftControlKey(el),value:el.value,checked:el.checked}))} : null;
}
function restoreFormDraft(draft) {
    const form = root.querySelector('#event-form,#field-form,#result-form');
    if (!form || !draft) return;
    let controls=draftControls(), fields;
    if(Array.isArray(draft)) {
        // Older drafts were positional. The review added two optional event fields;
        // don't shift a saved residence or consent into a newly inserted date input.
        if(draft.length!==controls.length)controls=controls.filter(el=>!['arrival_at','stay_expiry'].includes(el.name));
        fields=draft.map((value,i)=>({...value,key:controls[i]&&draftControlKey(controls[i])}));
    } else if(draft.version===2 && Array.isArray(draft.fields)) fields=draft.fields;
    else return;
    const values=new Map(fields.map(value=>[value.key,value]));
    controls.forEach(el=>{const value=values.get(draftControlKey(el));if(value){el.value=value.value;if('checked' in el)el.checked=value.checked;}});
    form.dispatchEvent(new Event('input',{bubbles:true}));
}
function clearFormDraft() { sessionStorage.removeItem(formDraftKey()); }
function clearSessionDrafts() {
    for(const key of Object.keys(sessionStorage))if(key.startsWith('ryadom_form_'+sessionScope()+'_')||key.startsWith('ryadom_form_'+token+'_')||key===onboardingStorageKey()||key==='ryadom_onboarding_scope_'+token||(onboardingScope&&key.startsWith('ryadom_onboarding_scope_')&&sessionStorage.getItem(key)===onboardingScope))sessionStorage.removeItem(key);
}
function restoreStoredFormDraft() {
    let saved;try {saved=JSON.parse(sessionStorage.getItem(formDraftKey()));}catch {return;}
    if(saved)restoreFormDraft(saved);
}
function confirmLeave(action) {
    if (!dirty) { action(); return; }
    showModal(`<h2>${tr('Не сохранять изменения?','Discard changes?')}</h2><p>${tr('Черновик ещё не записан.','Your draft has not been saved.')}</p><div class="actions"><button class="primary" id="keep-editing">${tr('Продолжить редактирование','Keep editing')}</button><button class="secondary" id="discard-draft">${tr('Не сохранять','Discard')}</button></div>`);
    document.querySelector('#keep-editing').onclick = () => modal.close();
    document.querySelector('#discard-draft').onclick = () => { clearFormDraft(); dirty = false; modal.close(); action(); };
}
function writeLocation(replace=false) {
    const url = new URL(location.href);
    url.searchParams.set('screen', route.name);
    for (const key of ['stage','key','revision','eventId','reason']) {
        url.searchParams.delete(key);
        if (route[key]) url.searchParams.set(key, route[key]);
    }
    const state = {ryadom:true, scope:sessionScope(), route, stack:routeStack};
    history[replace?'replaceState':'pushState'](state, '', url);
}
function navigate(next, replace=false) {
    if(authState==='expired')return;
    confirmLeave(() => {
        const roots = ['plan','events','profile'];
        if (roots.includes(route.name)) rootScroll[route.name] = scrollY;
        if (roots.includes(next.name)) routeStack = [];
        else if (!replace) routeStack.push({...route, scroll:scrollY});
        route = next; dirty = false; writeLocation(replace); paintRoute();
        window.scrollTo(0, roots.includes(next.name) ? rootScroll[next.name] || 0 : 0);
    });
}
function goBack() {
    if(authState==='expired')return;
    if(!profile.consent) {if(authState==='ready' && entryScreen==='questions')history.back();return;}
    confirmLeave(() => {
        const next = route.name === 'result' ? {name:'plan'} : routeStack.pop() || {name:'plan'};
        route = next; dirty = false; writeLocation(true); paintRoute(); window.scrollTo(0,next.scroll||0);
    });
}
window.addEventListener('popstate', e => {
    if(authState!=='ready')return;
    if(!profile.consent) {
        if (!onboardingDraft) return;
        if(e.state?.entry==='questions') {step=Math.max(0,Math.min(onboardingBlocks().length-1,e.state.onboardingStep||0));persistOnboardingDraft();renderOnboarding();}
        else renderWelcome();
        focusEntryHeading();return;
    }
    // Consented students never return to welcome/questions through old history entries.
    if(e.state?.entry || e.state?.onboardingStep!==undefined) {route={name:'plan'};routeStack=[];writeLocation(true);paintRoute();return;}
    const owned = ownsNavigation(e.state);
    const next = route.name==='result' || !owned ? {name:'plan'} : e.state?.route || {name:'plan'}, stack = route.name==='result' || !owned ? [] : e.state?.stack || [];
    if (dirty) { writeLocation(false); confirmLeave(() => {route=next; routeStack=stack; writeLocation(true); paintRoute();}); }
    else {route=next; routeStack=stack; paintRoute(); window.scrollTo(0,next.scroll||0);}
});
window.addEventListener('beforeunload', e => {if (dirty) {e.preventDefault(); e.returnValue='';}});
root.addEventListener('input', markDraftDirty);
root.addEventListener('change', markDraftDirty);
function markDraftDirty(e) {if(e.target.closest('#event-form,#profile-form,#field-form,#result-form')||e.target.matches('#event-text')) {dirty=true;sessionStorage.setItem(formDraftKey(),JSON.stringify(captureFormDraft()));window.WebApp?.enableClosingConfirmation?.();}}
async function refreshSnapshot() {
    const [nextProfile,nextPlan] = await Promise.all([api('/me/profile'),api('/me/roadmap')]);
    profile=nextProfile; plan=nextPlan;
}
function renderPlan() { navigate({name:'plan'},true); }
function renderProfile() { navigate({name:'profile'}); }
function taskDetail(key) { navigate({name:'task',key}); }
function eventForm(type, original=null, candidateId=null) { navigate({name:'event',type,original,candidateId},route.name==='event'); }
function showDetail(html) { root.innerHTML=shell(`<article class="task-detail">${html}</article>`); wireShell(); }
function paintRoute() {
    painting++;
    if(authState==='expired'){renderAuthStatus();return;}
    if(!dirty)window.WebApp?.disableClosingConfirmation?.();
    if (!profile.consent) {renderEntry(); return;}
    switch(route.name) {
        case 'plan': homeView(); break;
        case 'stages': stagesView(); break;
        case 'stage': stageView(); break;
        case 'task':
            if (!route.snapshot && !plan.tasks.some(t=>t.task_key===route.key)) {route={name:'plan'};homeView();toast(tr('Задача недоступна. Открыт текущий план.','Task unavailable. Showing the current plan.'));}
            else taskDetailView(route.key); break;
        case 'clarifications': clarificationsView(); break;
        case 'clarify': clarificationEditorView(); break;
        case 'review': reviewView(); break;
        case 'events': eventsView(); break;
        case 'event': eventFormView(route.type || 'address_changed',route.original,route.candidateId); break;
        case 'workflow': workflowFormView(); break;
        case 'result': resultView(); break;
        case 'history': historyView(); break;
        case 'profile': profileView(); break;
        case 'edit': fieldEditorView(); break;
        default: route={name:'plan'};homeView();
    }
    restoreStoredFormDraft();
}
function progressText(p) {return p.total?tr(`${p.completed} из ${p.total} завершено`,`${p.completed} of ${p.total} completed`):tr('Нет текущих действий','No current tasks');}
function timeline() {
    const current = RoadmapView.currentStage(plan.tasks,effectiveProfile());
    return `<div class="stage-timeline">${RoadmapView.stages.map(id=>{
        const p=RoadmapView.progress(plan.tasks,id);
        return `<button data-stage="${id}" class="stage-row ${p.done?'done':id===current?'current':'future'}"><span class="timeline-dot">${p.done?icon('check',15):''}</span><span class="tile-icon">${icon(stageIcon(id),29)}</span><span class="stage-copy"><strong>${tr(...stageNames[id])}</strong><span>${progressText(p)}</span>${p.done?`<small>${tr('Завершено по действиям','All current tasks completed')}</small>`:id===current?`<small>${tr('Вы сейчас здесь','You are here')}</small>`:''}</span>${icon('chevron')}</button>`;
    }).join('')}</div>`;
}
function wireStages() { document.querySelectorAll('[data-stage]').forEach(b=>b.onclick=()=>navigate({name:'stage',stage:b.dataset.stage})); }
function deadlineLines(t) {
    return (t.dates||[]).map(d=>`<div class="deadline-line">${icon(d.kind==='document_expiry'?'history':'calendar',18)}<span>${esc(d.kind==='document_expiry'?tr('Окончание документа','Document expiry'):shortTiming(d))}${d.owner==='university'?` · ${esc(universityName())}`:''}${d.computed_at?` — ${formatDate(d.computed_at)}`:`: ${esc(content(d.literal))}`}</span></div>`).join('');
}
function homeView() {
    const f=effectiveProfile(), hero=plan.tasks.find(t=>t.task_key===plan.hero_task_key)||RoadmapView.hero(plan.tasks), qs=RoadmapView.clarifications(plan.tasks);
    root.innerHTML=shell(`<button class="context-card" id="context-profile"><span class="tile-icon">${icon('university',30)}</span><span><strong>${esc(universityName())}</strong><small>${f.entry_at||f.arrival_status==='arrived'?tr('Уже в России','Already in Russia'):tr('Готовитесь к приезду','Preparing to arrive')} · ${esc(visaName(f.visa_regime))}</small></span>${icon('chevron')}</button>
        <section class="hero-card">${hero?`<span class="next-label">${icon('plane',16)}${hero.workflow_status==='waiting'?tr('Ожидается результат','Waiting for result'):tr('Следующий шаг','Next step')}</span><h1>${esc(content(hero.title_i18n))}</h1>${hero.engine_status==='requires_recheck'?`<p class="recheck">${tr('Ранее отмечено вами — проверьте снова','Previously reported — check again')}</p>`:''}${hero.waiting_i18n?`<p>${esc(content(hero.waiting_i18n))}</p>`:''}${deadlineLines(hero)}<button class="primary wide" data-task="${esc(hero.task_key)}">${tr('Открыть действие','Open task')}</button>`:`<h1>${tr('Пока нет действий','No actions for now')}</h1><p>${tr('Откройте маршрут или уточните данные.','Open your roadmap or complete your information.')}</p><button class="primary wide" id="${qs.length?'hero-clarify':'hero-stages'}">${qs.length?tr('Уточнить данные','Complete information'):tr('Открыть маршрут','Open roadmap')}</button>`}</section>
        <div class="section-heading"><h2>${tr('Ваш маршрут','Your roadmap')}</h2><button class="text-link" data-history>${tr('История','History')}</button></div>${timeline()}<button class="text-link all-stages" id="all-stages">${tr('Все этапы','All stages')}</button>
        ${!f.entry_at&&(f.arrival_status==='arrived'||!f.planned_entry)?`<button class="later-card" id="context-date"><span class="tile-icon">${icon('calendar',23)}</span><span><strong>${f.arrival_status==='arrived'?tr('Когда вы приехали?','When did you arrive?'):tr('Когда планируете приехать?','When will you arrive?')}</strong><small>${tr('Можно уточнить, когда будете готовы','Add this when you are ready')}</small></span>${icon('chevron',16)}</button>`:''}
        ${qs.length?`<section class="clarification-summary"><button class="clarification-heading" id="open-clarifications"><span class="warning-icon">!</span><span><strong>${tr('Нужно уточнить','Needs clarification')}: ${qs.length}</strong><small>${tr('Уточните данные и применимость правил в вашем случае.','Check your information and rule applicability.')}</small></span>${icon('chevron')}</button>${qs.slice(0,3).map(t=>`<button class="clarification-short" data-clarification="${esc(t.task_key)}">${icon(familyIcon(t),24)}<span>${esc(content(t.title_i18n))}</span>${icon('chevron')}</button>`).join('')}</section>`:''}`);
    wireShell();wireStages();wireTasks();
    document.querySelector('#context-profile').onclick=renderProfile;
    document.querySelector('#context-date')?.addEventListener('click',()=>f.arrival_status==='arrived'?resolveTask(plan.tasks.find(t=>t.process==='entry_context')):navigate({name:'edit',field:'planned_entry'}));
    document.querySelector('#all-stages').onclick=()=>navigate({name:'stages'});
    document.querySelector('#hero-clarify')?.addEventListener('click',()=>f.arrival_status==='arrived'&&!f.entry_at?eventForm('entry_recorded'):navigate({name:'clarifications'}));
    document.querySelector('#hero-stages')?.addEventListener('click',()=>navigate({name:'stages'}));
    document.querySelector('[data-history]').onclick=()=>navigate({name:'history'});
    document.querySelector('#open-clarifications')?.addEventListener('click',()=>navigate({name:'clarifications'}));
    document.querySelectorAll('[data-clarification]').forEach(b=>b.onclick=()=>resolveTask(plan.tasks.find(t=>t.task_key===b.dataset.clarification)));
}
function stagesView() {
    root.innerHTML=shell(`${heading(tr('Все этапы','All stages'))}<div class="section-heading"><p class="sub">${tr('Все этапы доступны. Действия могут идти параллельно.','All stages are available. Tasks can run in parallel.')}</p><button class="text-link" data-history>${tr('История','History')}</button></div>${timeline()}`);
    wireShell();wireStages();document.querySelector('[data-history]').onclick=()=>navigate({name:'history'});
}
function compactTask(t) {
    return `<button class="compact-task" data-task="${esc(t.task_key)}"><span class="tile-icon ${t.engine_status==='actionable'&&t.user_status==='completed'?'completed':''}">${icon(t.engine_status==='actionable'&&t.user_status==='completed'?'check':familyIcon(t),25)}</span><span><strong>${esc(content(t.title_i18n))}</strong><small class="${t.engine_status==='requires_recheck'?'recheck':''}">${workflowLabel(t)}</small>${taskTiming(t)?`<small>${esc(shortTiming(taskTiming(t)))} · ${esc(taskDate(t))}</small>`:''}</span>${icon('chevron',17)}</button>`;
}
function wireTasks() {document.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>taskDetail(b.dataset.task));}
function stageView() {
    const id=RoadmapView.stages.includes(route.stage)?route.stage:'arrival', p=RoadmapView.progress(plan.tasks,id);
    const rows=plan.tasks.filter(t=>RoadmapView.stage(t)===id&&t.engine_status!=='superseded').sort((a,b)=>id==='before'?(a.route_order??99)-(b.route_order??99):(a.priority_rank??999)-(b.priority_rank??999));
    const active=rows.filter(t=>t.user_status!=='completed'||t.engine_status==='requires_recheck'), completed=rows.filter(t=>t.user_status==='completed'&&t.engine_status!=='requires_recheck');
    const sources=[...new Map(p.tasks.flatMap(t=>t.source_snapshot).map(s=>[s.official_url,s])).values()];
    root.innerHTML=shell(`${heading(tr(...stageNames[id]))}<p class="progress-label">${progressText(p)}</p>${p.total?`<progress max="${p.total}" value="${p.completed}">${progressText(p)}</progress>`:''}<div class="task-stack">${active.map(compactTask).join('')}${!rows.length?empty(tr('В этом этапе пока нет текущих действий.','No current tasks in this stage.')):''}</div>${completed.length?`<details class="completed-tasks"><summary>${tr('Завершённые','Completed')} · ${completed.length}</summary>${completed.map(compactTask).join('')}</details>`:''}${sources.length?`<section class="surface"><h2>${tr('Полезная информация','Useful information')}</h2>${sources.map(s=>`<a class="source-link" href="${esc(s.official_url)}" target="_blank" rel="noopener noreferrer">${icon('info')}<span>${esc(s.title)}</span></a>`).join('')}</section>`:''}<button class="text-link" id="stage-questions">${tr('Посмотреть уточнения','View clarifications')}</button>`);
    wireShell();wireTasks();document.querySelector('#stage-questions').onclick=()=>navigate({name:'clarifications'});
}
function clarificationsView() {
    const qs=RoadmapView.clarifications(plan.tasks);
    root.innerHTML=shell(`${heading(tr('Нужно уточнить','Needs clarification'))}${note(tr('Чтобы показать точные рекомендации, нам нужно уточнить несколько пунктов.','We need to clarify a few points to show relevant recommendations.'))}${['conditional','needs_review'].map(status=>{const ts=qs.filter(t=>t.engine_status===status);return ts.length?`<h2>${status==='conditional'?tr('Можно заполнить сейчас','You can add now'):tr('Нужно проверить','Needs review')}</h2>${ts.map(t=>`<section class="surface clarification-card ${status}"><div class="card-heading"><span class="tile-icon">${icon(familyIcon(t),30)}</span><h3>${esc(content(t.title_i18n))}</h3></div><p>${esc(content(t.eligibility_reason))}</p><p class="sub">${esc((t.missing_fields||[]).map(k=>fieldLabels[k]?tr(...fieldLabels[k]):tr('Проверка применимости','Applicability review')).join(' · '))}</p><button class="${status==='conditional'?'primary':'secondary'} wide" data-resolve="${esc(t.task_key)}">${status==='conditional'?tr('Добавить данные','Add information'):tr('Как проверить','How to check')}</button></section>`).join('')}`:'';}).join('')}${!qs.length?empty(tr('Пока нет уточнений','No clarifications needed')):''}`);
    wireShell();document.querySelectorAll('[data-resolve]').forEach(b=>b.onclick=()=>{
        const t=plan.tasks.find(t=>t.task_key===b.dataset.resolve);
        const fields=t?.missing_fields||[];
        navigate(t?.engine_status==='conditional'&&fields.length&&fields.every(k=>editableFields().includes(k))?{name:'clarify',key:t.task_key}:{name:'review',key:t.task_key});
    });
}
function clarificationEditorView() {
    const task=plan.tasks.find(t=>t.task_key===route.key);
    if(!task||task.engine_status!=='conditional') {navigate({name:'clarifications'},true);return;}
    const fields=task.missing_fields||[];
    if(!fields.length||fields.some(k=>!editableFields().includes(k))) {navigate({name:'review',key:task.task_key},true);return;}
    clarificationsView();
    const count=fields.length;
    const title=tr('Уточнить данные','Complete information');
    const questions=fields.map((k,i)=>{
        const options=fieldChoices(k),value=profileInputValue(k);
        return `<div class="clarification-question"><span class="question-position">${tr('Вопрос','Question')} ${i+1}/${count}</span>${options?selectField(k,tr(...fieldLabels[k]),options,value):field(k,tr(...fieldLabels[k]),k==='citizenship'?'text':k==='arrival_at'?'datetime-local':'date',value,k==='citizenship'?'maxlength="60"':'')}</div>`;
    }).join('');
    const editorHTML=`<div class="sheet-language">${languageControls()}</div>${heading(title)}<p class="sub">${esc(content(task.title_i18n))}</p><p class="privacy">${tr('Заполните известные данные и сохраните их вместе. Маршрут пересчитается; пункт может остаться, если ещё нужны сведения или проверка в офисе.','Add what you know and save it together. The roadmap will be recalculated; this item may remain if more information or an office review is needed.')}</p><form id="field-form"><div class="clarification-fields">${questions}</div><p class="clarification-progress" role="status" aria-live="polite"></p><button class="primary wide" type="submit">${tr('Сохранить данные','Save information')}</button></form>`;
    document.querySelector('#screen').insertAdjacentHTML('beforeend',`<dialog id="field-editor" class="field-sheet clarification-sheet" aria-label="${esc(title)}"><button type="button" class="sheet-close" id="field-close" aria-label="${tr('Закрыть','Close')}">×</button>${editorHTML}</dialog>`);
    const editor=document.querySelector('#field-editor');editor.showModal();wireLanguageControls();
    const form=document.querySelector('#field-form');
    const updateProgress=()=>{const data=new FormData(form),answered=fields.filter(k=>!['','unknown'].includes(String(data.get(k)||''))).length;form.querySelector('.clarification-progress').textContent=tr(`Заполнено ${answered} из ${count}${count>3?' · прокрутите вопросы':''}`,`${answered} of ${count} answered${count>3?' · scroll for more':''}`);};
    form.addEventListener('input',updateProgress);form.addEventListener('change',updateProgress);updateProgress();
    editor.addEventListener('cancel',e=>{e.preventDefault();goBack();});
    document.querySelector('#field-close').onclick=goBack;
    form.onsubmit=guard(async e=>{
        e.preventDefault();
        const data=new FormData(e.currentTarget),next={...profile};
        for(const k of fields){const v=data.get(k);next[k]=['stay_over_90_days','fingerprinting_completed'].includes(k)?v===''?null:v==='true':k==='arrival_at'&&v?v+(v.length===16?':00':'')+'+03:00':v||null;}
        if(fields.includes('visa_regime')&&next.visa_regime==='visa_free')next.visa_expiry=null;
        if(fields.every(k=>next[k]===profile[k]))throw Error(tr('Измените хотя бы одно поле или закройте форму.','Change at least one field or close the form.'));
        profile=await api('/me/profile?fields='+[...fields,...(fields.includes('visa_regime')&&next.visa_regime==='visa_free'?['visa_expiry']:[])].join(','),'PATCH',next);await refreshSnapshot();lang=profile.language;clearFormDraft();dirty=false;goBack();toast(tr('Данные сохранены, маршрут пересчитан','Information saved; roadmap updated'));
    });
}
function reviewView() {
    const t=plan.tasks.find(t=>t.task_key===route.key);
    if (!t) {navigate({name:'clarifications'},true);return;}
    root.innerHTML=shell(`${heading(content(t.title_i18n))}<section class="review-notice"><h3>${icon('warning',24)}${tr('Нужно проверить','Needs review')}</h3><p>${esc(content(t.eligibility_reason))}</p><p>${tr('Персональный срок не показан, пока применимость не подтверждена.','No personal deadline is shown while applicability remains unverified.')}</p></section><section class="surface"><h2>${tr('Что можно сделать','What you can do')}</h2><p>${esc(content(t.action_i18n))}</p><p>${tr('Уточните применимость требования в указанном офисе.','Ask the office below to confirm whether the requirement applies.')}</p></section><section class="surface"><h2>${tr('Источник и контакт','Source and contact')}</h2><p>${esc(t.contact)}</p>${t.source_snapshot.map(s=>`<a class="source-link" href="${esc(s.official_url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a><small>${tr('Проверено','Checked')}: ${formatDate(s.checked_at)}</small>`).join('')}</section><button class="primary wide" id="review-done">${tr('Понятно','Understood')}</button>`);
    wireShell();document.querySelector('#review-done').onclick=goBack;
    root.querySelector('#review-done').insertAdjacentHTML('beforebegin',workflowControls(t));wireWorkflow(t);
}
function eventsView() {
    const order=['address_changed','reentry_recorded','visa_issued','registration_confirmed','medical_completed','fingerprinting_completed',...Object.keys(eventNames).filter(k=>!['address_changed','reentry_recorded','visa_issued','registration_confirmed','medical_completed','fingerprinting_completed'].includes(k))];
    root.innerHTML=shell(`${heading(tr('Сообщить событие','Record an event'))}<p class="sub">${tr('Выберите, что изменилось. Это поможет обновить ваши рекомендации.','Choose what changed to update your recommendations.')}</p><div class="event-options">${order.map(type=>`<button class="event-option" data-event="${type}"><span class="tile-icon">${icon(({address_changed:'address',reentry_recorded:'plane',visa_issued:'passport',registration_confirmed:'plan',medical_completed:'medical',fingerprinting_completed:'fingerprint'})[type]||'calendar',27)}</span><strong>${tr(...eventNames[type])}</strong>${icon('chevron',17)}</button>`).join('')}</div><button class="text-link" id="event-history">${tr('История событий','Event history')}</button>`);
    wireShell();document.querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>eventForm(b.dataset.event));
    document.querySelector('#event-history').onclick=()=>{historyFilter='events';navigate({name:'history'});};
}
function readLoading(title) { root.innerHTML=shell(`${heading(title)}<div class="loading" role="status">${tr('Загружаем…','Loading…')}</div>`);wireShell(); }
function readError(err) {if(authState==='expired')return;root.querySelector('.screen').innerHTML=`${heading(tr('Не удалось загрузить','Could not load'))}<p>${esc(err.message)}</p><button class="primary" id="read-retry">${tr('Повторить','Retry')}</button>`;document.querySelector('#read-retry').onclick=paintRoute;}
function changeKind(c) {return !c.before?'new':c.after.engine_status==='superseded'?'superseded':c.after.engine_status==='requires_recheck'?'recheck':'changed';}
const diffNames={new:['Новые действия','New tasks'],changed:['Что изменилось','What changed'],recheck:['Требует повторной проверки','Needs rechecking'],superseded:['Прежние действия','Previous tasks']};
function revisionCopy(reason) {
    if(reason in eventNames || ['event_corrected','event_retracted'].includes(reason)) return {
        title:tr('Что изменилось после события','What changed after the event'),
        saved:reason==='event_retracted'?tr('Событие отменено','Event retracted'):reason==='event_corrected'?tr('Исправление учтено','Correction saved'):tr('Данные сохранены','Data saved'),
        empty:tr('Событие сохранено, задачи не изменились.','Event saved. Tasks did not change.')
    };
    return {title:tr('Изменения маршрута','Roadmap changes'),saved:reasonLabel(reason),empty:tr('Задачи не изменились.','Tasks did not change.')};
}
function revisionDetails(change) {
    if(!change.before)return '';
    const values=[
        [tr('Действие','Action'),t=>content(t.action_i18n)],
        [tr('Результат','Result'),t=>workflowLabel(t)],
        [tr('Доступность','Availability'),t=>content(t.availability_reason_i18n)],
        [tr('Название','Title'),t=>content(t.title_i18n)],
        [tr('Документы','Documents'),t=>(content(t.documents_i18n)||[]).join('\n')],
        [tr('Офис и контакт','Office and contact'),t=>t.contact],
        [tr('Сроки','Timing'),t=>(t.dates||[]).map(d=>`${shortTiming(d)}: ${content(d.literal)}${d.computed_at?' — '+formatDate(d.computed_at):''}`).join('\n')],
        [tr('Источники','Sources'),t=>(t.source_snapshot||[]).map(s=>`${s.title}\n${s.official_url}\n${formatDate(s.checked_at)}\n${s.section_label||''}\n${content(s.purpose_i18n)}`).join('\n')],
        [tr('Версия правила','Rule version'),t=>String(t.rule_version)]
    ];
    return values.flatMap(([label,read])=>{
        const before=read(change.before)||'—',after=read(change.after)||'—';
        return before===after?[]:[`<div class="revision-field"><h3>${esc(label)}</h3><div class="diff"><div><b>${tr('До','Before')}</b><p>${esc(before)}</p></div><div><b>${tr('После','After')}</b><p>${esc(after)}</p></div></div></div>`];
    }).join('');
}
async function resultView() {
    const generation=painting;readLoading(tr('Изменения маршрута','Roadmap changes'));
    try {
        const h=route.revision?null:await api('/me/history');
        const r=route.revision?await api('/me/history/'+encodeURIComponent(route.revision)):h.revisions.find(r=>r.trigger_id===route.eventId && (!route.reason||r.reason===route.reason));
        if(generation!==painting)return;
        if(route.revision&&!r) throw Error(tr('Эта ревизия недоступна. Откройте актуальный план.','This revision is unavailable. Open the current plan.'));
        if(!r) {
            const es=await api('/me/events');if(generation!==painting)return;
            if(!route.eventId||!es.events.some(e=>e.id===route.eventId)) throw Error(tr('Нет сохранённого события для этого результата. Откройте План.','No saved event exists for this result. Open Plan.'));
        }
        const changes=r?.changes||[];
        route.reason=r?.reason||route.reason;
        const copy=revisionCopy(route.reason);
        root.innerHTML=shell(`${heading(copy.title)}<div class="success-note">${icon('check',26)}<span><strong>${esc(copy.saved)}</strong><small>${r?formatDate(r.created_at):tr('Событие учтено','Event recorded')}</small></span></div>${['new','changed','recheck','superseded'].map(kind=>{const group=changes.filter(c=>changeKind(c)===kind);return group.length?`<h2>${tr(...diffNames[kind])}</h2>${group.map(c=>`<section class="surface"><button class="diff-task" data-diff-task="${esc(c.task_key)}"><strong>${esc(content(c.after.title_i18n))}</strong>${icon('chevron')}</button><div class="diff"><div><b>${tr('До','Before')}</b><p>${c.before?`${tr(...states[c.before.engine_status])} · ${tr(...statuses[c.before.user_status])}<br>${esc(taskDate(c.before))}`:tr('Задачи не было','No task')}</p></div><div><b>${tr('После','After')}</b><p>${tr(...states[c.after.engine_status])} · ${tr(...statuses[c.after.user_status])}<br>${esc(taskDate(c.after))}</p></div></div>${revisionDetails(c)}</section>`).join('')}`:'';}).join('')}${!changes.length?empty(copy.empty):''}<button class="primary wide" id="result-plan">${tr('Открыть обновлённый план','Open updated roadmap')}</button><button class="secondary wide" id="result-history">${tr('История','History')}</button>`);
        wireShell();document.querySelector('#result-plan').onclick=renderPlan;document.querySelector('#result-history').onclick=()=>navigate({name:'history'});
        document.querySelectorAll('[data-diff-task]').forEach(b=>b.onclick=()=>{const c=changes.find(c=>c.task_key===b.dataset.diffTask);navigate({name:'task',key:c.task_key,...(plan.tasks.some(t=>t.task_key===c.task_key)?{}:{snapshot:{...c.after,engine_status:'superseded'}})});});
    }catch(e){if(generation===painting)readError(e);}
}
async function historyView() {
    const generation=painting;readLoading(tr('История','History'));
    try {
        const [h,es,rs]=await Promise.all([api('/me/history'),api('/me/events'),api('/me/results')]);if(generation!==painting)return;
        let nextOffset=h.next_offset;
        while(nextOffset!==null&&nextOffset!==undefined) {
            const more=await api('/me/history?offset='+nextOffset);if(generation!==painting)return;
            h.revisions.push(...more.revisions);nextOffset=more.next_offset;
        }
        h.revisions=[...new Map(h.revisions.map(r=>[r.id,r])).values()];
        const replaced=new Set(es.events.filter(e=>!e.retracted_at).map(e=>e.supersedes_event_id));
        const replacedResults=new Set(rs.results.filter(r=>!r.retracted_at).map(r=>r.supersedes_report_id));
        const items=[...rs.results.map(r=>({id:r.id,when:r.recorded_at,type:'events',report:r})),...es.events.map(e=>({id:e.id,when:e.recorded_at,type:'events',event:e})),...h.revisions.map(r=>({id:r.id,when:r.created_at,type:'tasks',revision:r}))].sort((a,b)=>b.when.localeCompare(a.when)||a.id.localeCompare(b.id));
        let month='';
        root.innerHTML=shell(`${heading(tr('История','History'))}<div class="segmented">${[['all','Все','All'],['events','События','Events'],['tasks','Задачи','Tasks']].map(([id,ru,en])=>`<button data-history-filter="${id}" class="${historyFilter===id?'active':''}">${tr(ru,en)}</button>`).join('')}</div><div class="history-timeline">${items.filter(i=>historyFilter==='all'||i.type===historyFilter).map(i=>{
            const label=new Date(i.when).toLocaleDateString(lang==='en'?'en-GB':'ru-RU',{month:'long',year:'numeric',timeZone:'Europe/Moscow'}), group=label!==month?`<h2>${label}</h2>`:'';month=label;
            const time=new Date(i.when).toLocaleString(lang==='en'?'en-GB':'ru-RU',{timeZone:'Europe/Moscow'});
            if(i.report){const r=i.report,t=plan.tasks.find(t=>t.task_key===r.task_key)||{process:r.process};return `${group}<article class="history-item"><span class="tile-icon">${icon('check',23)}</span><div><strong>${esc(resultActionLabel(t,r.outcome))}</strong><p>${r.retracted_at?tr('Отменено','Retracted'):replacedResults.has(r.id)?tr('Исправлено','Corrected'):tr('Сообщено вами','Reported by you')} · ${time} ${tr('МСК','MSK')}</p><small>${tr('Дата результата','Result date')}: ${r.occurred_at?formatDate(r.occurred_at):tr('Неизвестна','Unknown')}</small>${r.body.document_expiry?`<p>${tr('Окончание документа','Document expiry')}: ${formatDate(r.body.document_expiry)}</p>`:''}${!r.retracted_at&&!replacedResults.has(r.id)?`<div class="actions"><button class="text-link" data-edit-result="${r.id}">${tr('Исправить','Correct')}</button><button class="text-link danger" data-retract-result="${r.id}">${tr('Отменить','Retract')}</button></div>`:''}</div></article>`;}
            if(i.event){const e=i.event;return `${group}<article class="history-item"><span class="tile-icon">${icon('calendar',23)}</span><div><strong>${tr(...eventNames[e.type])}</strong><p>${e.retracted_at?tr('Отменено','Retracted'):replaced.has(e.id)?tr('Исправлено','Corrected'):tr('Сообщено вами','Reported by you')} · ${time} ${tr('МСК','MSK')}</p><small>${tr('Дата события','Occurred')}: ${formatDate(e.occurred_at)}</small><details><summary>${tr('Данные события','Event information')}</summary>${Object.entries(e.payload).map(([k,v])=>`<p>${esc(fieldLabels[k]?tr(...fieldLabels[k]):k)}: ${esc(v)}</p>`).join('')}</details>${!e.retracted_at&&!replaced.has(e.id)?`<div class="actions"><button class="text-link" data-edit-event="${e.id}">${tr('Исправить','Correct')}</button><button class="text-link danger" data-retract-event="${e.id}">${tr('Отменить','Retract')}</button></div>`:''}</div></article>`;}
            const r=i.revision;return `${group}<button class="history-item revision-item" data-revision="${r.id}"><span class="tile-icon">${icon(r.reason==='user_status_changed'?'check':'history',23)}</span><span><strong>${esc(reasonLabel(r.reason))}</strong><small>${time} ${tr('МСК','MSK')} · ${r.changes.length} ${tr('изменений','changes')}</small>${r.changes.slice(0,2).map(c=>`<small>${esc(content(c.after.title_i18n))}${r.reason==='user_status_changed'?` · ${tr(...statuses[c.after.user_status])}`:''}</small>`).join('')}</span>${icon('chevron',16)}</button>`;
        }).join('')||empty(tr('Пока нет записей','No history yet'))}</div>${note(tr('История показывает ваши события, отметки и изменения маршрута.','History shows your events, self-reports and roadmap changes.'))}`);
        wireShell();document.querySelectorAll('[data-history-filter]').forEach(b=>b.onclick=()=>{historyFilter=b.dataset.historyFilter;paintRoute();});
        document.querySelectorAll('[data-revision]').forEach(b=>b.onclick=()=>navigate({name:'result',revision:b.dataset.revision}));
        document.querySelectorAll('[data-edit-result]').forEach(b=>b.onclick=()=>{const r=rs.results.find(r=>r.id===b.dataset.editResult);navigate({name:'workflow',key:r.task_key,outcome:r.outcome,report:r,external:r.body.external_result});});
        document.querySelectorAll('[data-retract-result]').forEach(b=>b.onclick=()=>{
            showModal(`<h2>${tr('Отменить результат?','Retract result?')}</h2><p>${tr('Зависимые шаги пересчитаются. История и независимые результаты сохранятся.','Dependent steps will be recalculated. History and independent results will remain.')}</p><button class="primary" id="confirm-result-retract">${tr('Отменить результат','Retract result')}</button>`);
            document.querySelector('#confirm-result-retract').onclick=guard(async()=>{const saved=await api('/me/results/'+b.dataset.retractResult,'DELETE');modal.close();await refreshSnapshot();navigate({name:'result',revision:saved.revision_id,reason:'result_retracted'},true);});
        });
        document.querySelectorAll('[data-edit-event]').forEach(b=>b.onclick=()=>{const e=es.events.find(e=>e.id===b.dataset.editEvent);eventForm(e.type,e);});
        document.querySelectorAll('[data-retract-event]').forEach(b=>b.onclick=()=>{
            showModal(`<h2>${tr('Отменить событие?','Retract event?')}</h2><p>${tr('План пересчитается. Запись останется в истории.','The roadmap will be recalculated. The record stays in history.')}</p><button class="primary" id="confirm-retract">${tr('Отменить событие','Retract event')}</button>`);
            document.querySelector('#confirm-retract').onclick=guard(async()=>{const saved=await api('/me/events/'+b.dataset.retractEvent,'DELETE');modal.close();await refreshSnapshot();navigate({name:'result',eventId:b.dataset.retractEvent,revision:saved.revision_id,reason:'event_retracted'},true);});
        });
    }catch(e){if(generation===painting)readError(e);}
}
const extraFieldNames={preparation_state:['Запрос приглашения','Invitation request'],arrival_status:['Ситуация','Situation'],university_id:['Вуз','University'],entry_at:['Дата въезда в Россию','Entry date'],planned_entry:['Планируемый въезд','Planned entry'],language:['Язык','Language'],last_medical_completed_at:['Предыдущий медосмотр','Previous medical examination'],stay_expiry:['Окончание пребывания','Permitted stay expiry'],education_start:['Начало занятий','Classes start'],arrival_at:['Прибытие в Санкт-Петербург (МСК)','Arrival in St Petersburg (MSK)'],campus_id:['Площадка','Campus'],study_form:['Форма обучения','Study form']};
Object.assign(fieldLabels,extraFieldNames);
function profileInputValue(k) {const value=effectiveProfile()[k];return k==='arrival_at'&&value?new Date(new Date(value).getTime()+3*60*60*1000).toISOString().slice(0,19):value===null?'':String(value??(k==='arrival_status'?'unknown':''));}
function fieldChoices(k) {
    const unknown=['unknown',tr('Не указано','Not set')];
    return ({preparation_state:[unknown,['not_started',tr('Ещё не начинал(а) запрос приглашения','I have not requested an invitation yet')]],arrival_status:[unknown,['planned',tr('Готовлюсь к приезду','Preparing to arrive')],['arrived',tr('Уже в России','Already in Russia')]],university_id:[['sutd','СПбГУПТД'],['leti','ЛЭТИ']],language:[['ru','Русский'],['en','English']],visa_regime:[unknown,['visa',tr('По визе','Visa')],['visa_free',tr('Без визы','Visa-free')]],residence_type:[unknown,['dorm',tr('Общежитие','Dormitory')],['private',tr('Частный адрес','Private accommodation')],['other',tr('Другое','Other')]],age_band:[unknown,['adult',tr('18 лет и старше','18 or older')],['minor',tr('До 18 лет','Under 18')]],migration_basis:[unknown,['study',tr('Учёба','Study')],['rvpo','РВПО'],['rvp','РВП'],['residence_permit','ВНЖ']],entry_purpose:[unknown,['study',tr('Учёба','Study')],['other',tr('Другое','Other')]],study_status:[unknown,['admitted',tr('Зачислен(а), занятия ещё не начались','Admitted, classes not started')],...[['active','Учусь','Active'],['leave','Академический отпуск','Academic leave'],['transferred','Перевод','Transferred'],['expelled','Отчисление','Expelled'],['graduated','Выпуск','Graduated'],['working','Работа','Working']].map(([v,ru,en])=>[v,tr(ru,en)])],stay_over_90_days:[['',tr('Не знаю','Not sure')],['true',tr('Да','Yes')],['false',tr('Нет','No')]],fingerprinting_completed:[['',tr('Не знаю','Not sure')],['true',tr('Да','Yes')],['false',tr('Нет','No')]],campus_id:[['main',tr('Основная','Main')],['vshte','ВШТЭ'],['other',tr('Другая','Other')]],study_form:[unknown,['full_time',tr('Очная','Full-time')],['part_time',tr('Очно-заочная','Part-time')]]})[k];
}
function editableFields(){return ['preparation_state','arrival_status','university_id','language','visa_regime','residence_type','age_band','citizenship','migration_basis','study_status','entry_purpose','stay_over_90_days','fingerprinting_completed','visa_expiry','registration_expiry','planned_entry','entry_at','last_medical_completed_at','stay_expiry','education_start','arrival_at','study_form'];}
function profileValue(k,f) {
    if(k==='arrival_status'&&f.entry_at)return tr('Уже в России','Already in Russia');
    const v=f[k];if(v===null||v===undefined||v===''||v==='unknown')return tr('Не указано','Not set');
    return fieldChoices(k)?.find(([x])=>x===String(v))?.[1] || (/(?:_at|_expiry|_entry|_start)$/.test(k)?formatDate(v):String(v));
}
function profileView() {
    const f=effectiveProfile();
    const groups=[['profile','Данные маршрута','Roadmap information',['arrival_status','university_id','visa_regime','preparation_state','entry_at','planned_entry','residence_type']],['plan','Документы и сроки','Documents and dates',['visa_expiry','registration_expiry','stay_expiry']],['info','Дополнительные уточнения','Additional information',['age_band','citizenship','migration_basis','study_status','entry_purpose','stay_over_90_days','fingerprinting_completed','last_medical_completed_at','education_start','arrival_at','study_form','language']]];
    root.innerHTML=shell(`${heading(tr('Мои данные','My information'))}${groups.map(([glyph,ru,en,keys])=>`<section class="profile-group"><h2>${icon(glyph,24)}${tr(ru,en)}</h2>${keys.map(k=>`<button class="profile-row" data-field="${k}"><span>${tr(...fieldLabels[k])}</span><span class="field-value">${esc(profileValue(k,f))}</span>${icon('chevron',16)}</button>`).join('')}</section>`).join('')}${note(tr('Мы храним только данные, необходимые для построения маршрута. Новые документы и изменения обстоятельств записываются как события.','We store only information needed for your roadmap. New documents and changes are recorded as events.'))}<button class="secondary wide" id="notification-toggle">${profile.reminders_enabled?tr('Отключить напоминания','Disable reminders'):tr('Включить напоминания','Enable reminders')}</button><button class="text-link danger" id="delete-data">${tr('Удалить мои данные','Delete my data')}</button>${demoProfilePanel()}`);
    wireShell();document.querySelectorAll('[data-field]').forEach(b=>b.onclick=()=>navigate({name:'edit',field:b.dataset.field}));
    document.querySelectorAll('[data-demo-profile]').forEach(b=>b.onclick=guard(()=>switchDemoProfile(b.dataset.demoProfile)));
    document.querySelector('#notification-toggle').onclick=guard(async()=>{profile=await api('/me/profile','PATCH',{...profile,reminders_enabled:!profile.reminders_enabled});paintRoute();});
    document.querySelector('#delete-data').onclick=()=>{showModal(`<h2>${tr('Удалить профиль?','Delete profile?')}</h2><p>${tr('Все данные сервиса будут удалены. Это нельзя отменить.','All service data will be deleted. This cannot be undone.')}</p><button class="primary danger" id="confirm-delete">${tr('Удалить данные','Delete data')}</button>`);document.querySelector('#confirm-delete').onclick=guard(async()=>{await api('/me/profile','DELETE');clearSessionDrafts();forgetDemoSession();sessionStorage.removeItem('student_token');token=null;profile={};plan={tasks:[]};step=0;onboardingDraft=null;modal.close();routeStack=[];route={name:'plan'};writeLocation(true);await landing();});};
}
function fieldEditorView() {
    const k=route.field;if(!editableFields().includes(k)){navigate({name:'profile'},true);return;}
    if(k==='university_id' && profile.university_id) {
        root.innerHTML=shell(`${heading(tr('Ваш вуз','Your university'))}<section class="surface"><h2>${esc(universityName())}</h2><p>${tr('Перевод в другой вуз требует проверки в международном офисе. Сообщите об изменении учебного статуса: план отметит действия, которые нужно проверить.','A university transfer needs an international office review. Record a study status change so your roadmap can flag tasks for review.')}</p><button class="primary wide" id="university-transfer">${tr('Сообщить о переводе','Report a transfer')}</button></section>`);
        wireShell();document.querySelector('#university-transfer').onclick=()=>eventForm('enrolment_changed');return;
    }
    const eventType={visa_expiry:'visa_issued',registration_expiry:'registration_confirmed',fingerprinting_completed:'fingerprinting_completed',last_medical_completed_at:'medical_completed',entry_at:effectiveProfile().entry_at?'reentry_recorded':'entry_recorded',residence_type:'address_changed'}[k];
    const options=fieldChoices(k),value=profileInputValue(k);
    const editorHTML = `<div class="sheet-language">${languageControls()}</div>${heading(tr(...fieldLabels[k]))}${eventType?`<p class="sub">${tr('Новый факт нужно сохранить как событие. Начальные сведения можно уточнить отдельно.','Record a new fact as an event. Initial information can be corrected separately.')}</p><button class="primary wide" id="field-event">${tr(...eventNames[eventType])}</button><details><summary>${tr('Уточнить исходные сведения','Correct initial information')}</summary>`:''}<form id="field-form">${options?selectField(k,tr(...fieldLabels[k]),options,value):field(k,tr(...fieldLabels[k]),k==='citizenship'?'text':k==='arrival_at'?'datetime-local':'date',value,k==='citizenship'?'maxlength="60"':'')}<p class="privacy">${tr('Изменения уже записанных событий исправляйте в истории.','Correct previously recorded events in History.')}</p><button class="primary wide" type="submit">${tr('Сохранить','Save')}</button></form>${eventType?'</details>':''}`;
    profileView();
    document.querySelector('#screen').insertAdjacentHTML('beforeend', `<dialog id="field-editor" class="field-sheet" aria-label="${esc(tr(...fieldLabels[k]))}"><button type="button" class="sheet-close" id="field-close" aria-label="${tr('Закрыть','Close')}">×</button>${editorHTML}</dialog>`);
    const editor=document.querySelector('#field-editor');editor.showModal();wireLanguageControls();
    editor.addEventListener('cancel',e=>{e.preventDefault();goBack();});
    document.querySelector('#field-close').onclick=goBack;
    document.querySelector('#field-event')?.addEventListener('click',()=>eventForm(eventType));
    document.querySelector('#field-form').onsubmit=guard(async e=>{
        e.preventDefault();const v=new FormData(e.currentTarget).get(k), next={...profile,[k]:['stay_over_90_days','fingerprinting_completed'].includes(k)?v===''?null:v==='true':v||null};
        if(k==='visa_regime'&&v==='visa_free')next.visa_expiry=null;
        if(k==='arrival_at'&&v)next[k]=v+(v.length===16?':00':'')+'+03:00';
        profile=await api('/me/profile?fields='+[k,...(k==='visa_regime'&&v==='visa_free'?['visa_expiry']:[])].join(','),'PATCH',next);await refreshSnapshot();lang=profile.language;clearFormDraft();dirty=false;goBack();toast(tr('Данные сохранены','Information saved'));
    });
}
function focusEntryHeading() {
    const title=root.querySelector('h1');
    title?.setAttribute('tabindex','-1');title?.focus({preventScroll:true});window.scrollTo(0,0);
}
function renderEntry() {entryScreen==='questions'?renderOnboarding():renderWelcome();}
function restoreOnboardingEntry() {
    ensureOnboardingDraft();
    if(!onboardingDraft.started) {renderWelcome();return;}
    // Rebuild a return path when a saved draft is opened in a fresh history entry.
    if(history.state?.entry!=='questions') {
        history.replaceState({ryadom:true,entry:'welcome'},'',location.href);
        for(let i=0;i<=step;i++) history.pushState({ryadom:true,entry:'questions',onboardingStep:i},'',location.href);
    }
    renderOnboarding();
}
function welcomePreview() {
    // Illustration only: never reads or writes profile, roadmap or task statuses.
    const p=lang==='en'?{
        title:'Your roadmap at a glance',example:'Example',stages:['Before arrival','After arrival','During your studies'],
        now:'Current stage in this example',next:'Next step',task:'Contact the office after arrival',note:'Your answers will help us find your stage and actions.'
    }:{
        title:'Так выглядит ваш маршрут',example:'Пример',stages:['До приезда','После приезда','Во время учебы'],
        now:'Текущий этап в примере',next:'Следующий шаг',task:'Обратиться в офис после приезда',note:'Ваш этап и действия определим по ответам.'
    };
    return `<section class="rp rp-a" aria-label="${p.example}"><div class="rp-head"><h2>${p.title}</h2><span class="rp-badge">${p.example}</span></div><div class="rp-action"><span class="rp-label">${p.next}</span><h3>${p.task}</h3></div><ol class="rp-list">${p.stages.map((s,i)=>`<li class="rp-row ${i===0?'rp-done':i===1?'rp-on':''}"><span class="rp-dot" aria-hidden="true">${i===0?'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 8 2.5 2.5L12 5"/></svg>':''}</span><span class="rp-icon" aria-hidden="true">${icon(['plane','address','study'][i],16)}</span><span class="rp-stage">${s}${i===1?`<small class="rp-sub">${p.now}</small>`:''}</span></li>`).join('')}</ol><p class="rp-foot">${p.note}</p></section>`;
}
function renderWelcome() {
    entryScreen='welcome';
    history.replaceState({ryadom:true,entry:'welcome'},'',location.href);
    root.innerHTML=shell(`<h1 class="welcome-title">${tr('Ваш план<br>для жизни и учебы<br><em>в России</em>','Your plan for<br>life and study<br><em>in Russia</em>')}</h1>${welcomePreview()}<p class="welcome-intro">${tr('<strong>Начнем с вашей ситуации</strong><br>Узнаем, на каком вы этапе, и соберем персональный план действий.','<strong>Start with your situation</strong><br>Tell us where you are on your journey. We’ll build a personal action plan for you.')}</p><div class="welcome-footer"><button class="primary" id="start-plan" type="button">${tr('Составить мой план','Build my plan')}</button></div>`);
    wireShell();
    document.querySelector('#start-plan').onclick=()=>{
        if(authState!=='ready'||!token)return;
        ensureOnboardingDraft();step=0;onboardingDraft.started=true;persistOnboardingDraft();
        history.pushState({ryadom:true,entry:'questions',onboardingStep:0},'',location.href);
        renderOnboarding();focusEntryHeading();
    };
}
function renderAuthStatus() {
    if(authState==='expired')modal.close();
    entryScreen=authState;
    root.innerHTML=shell(authState==='expired'?`${heading(tr('Войдите снова','Sign in again'))}<p role="alert">${tr('Сессия завершилась. Сохраненные данные остаются в аккаунте, черновик — в этом окне. Повторите вход или откройте приложение заново из MAX.','Your session expired. Saved information remains in your account and your draft remains in this window. Sign in again or reopen the app from MAX.')}</p><button class="primary wide" id="retry-auth">${tr('Повторить вход','Retry sign-in')}</button>`:authState==='error'?`${heading(tr('Не удалось войти','Could not sign in'))}<p role="alert">${tr('Не удалось проверить вход. Проверьте соединение и повторите попытку.','We could not verify your sign-in. Check your connection and try again.')}</p><button class="primary wide" id="retry-auth">${tr('Повторить вход','Retry sign-in')}</button>`:`<div class="loading" role="status">${tr('Проверяем вход…','Checking sign-in…')}</div>`,true);
    wireShell();
    document.querySelector('#retry-auth')?.addEventListener('click',()=>authState==='expired'?location.reload():authenticateEntry());
}
function renderMaxLanding() {
    entryScreen='max';
    root.innerHTML=shell(`${heading(tr('Ваш план — в MAX','Your roadmap in MAX'))}<p class="sub">${tr('Откройте приложение из бота, чтобы сохранить план в своем аккаунте.','Open the app from the bot to save your roadmap to your account.')}</p><a class="primary wide" href="https://max.ru/${esc(config.max_bot_username||'t647_hakaton_max_bot')}">${tr('Открыть в MAX','Open in MAX')}</a>`);wireShell();
}
async function landing() {
    if(!token && config.demo_mode) {
        const auth=await api('/auth/demo','POST');token=auth.access_token;sessionStorage.setItem('student_token',token);
        onboardingScope=null;
        sessionStorage.removeItem(demoStorageKey);profile=await api('/me/profile');plan=await api('/me/roadmap');
    }
    if(token) {restoreOnboardingEntry();return;}
    renderMaxLanding();
}
let entryNavigationApplied=false;
function applyEntryNavigation() {
    if(entryNavigationApplied || !profile.consent)return;
    entryNavigationApplied=true;
    const params=requestedScreen, name=params.get('screen');
    if(name && ['plan','stages','stage','task','clarifications','review','events','event','result','history','profile','edit','clarify','workflow'].includes(name)) {
        const saved=requestedNavigation?.ryadom&&ownsNavigation(requestedNavigation)&&requestedNavigation.route?.name===name?requestedNavigation:null;
        route=saved?.route||{name};for(const key of ['stage','key','revision','eventId','reason'])if(params.has(key))route[key]=params.get(key);
        routeStack=saved?.stack||[{name:'plan'}];writeLocation(true);paintRoute();
        return;
    }
    const startParam=window.WebApp?.initDataUnsafe?.start_param; /* navigation only, never identity */
    if(startParam?.startsWith('task_')) {
        const t=plan.tasks.find(t=>t.deep_link_id===startParam.slice(5));
        if(t)taskDetail(t.task_key);else toast(tr('Задача больше недоступна. Открыт актуальный план.','Task unavailable. Showing the current plan.'));
    }
}
async function authenticateEntry() {
    authState='loading';renderAuthStatus();
    try {await start();authState='ready';}
    catch {authState='error';renderAuthStatus();}
}
authenticateEntry();
