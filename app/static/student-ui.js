/* Screen state, navigation and rendering. Rule decisions remain on the server. */
let route = {name: 'plan'}, dirty = false, arrivalMode = 'arrived', historyFilter = 'all';
let routeStack = [], rootScroll = {}, painting = 0;
const requestedScreen = new URLSearchParams(location.search);
const onboardingEventKey = crypto.randomUUID();
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
function shell(inner) {
    document.documentElement.lang = lang;
const section = ['events', 'event', 'result'].includes(route.name) ? 'events' : ['profile', 'edit'].includes(route.name) ? 'profile' : 'plan';
    const nested = !['plan', 'profile', 'events'].includes(route.name);
    const nav = `<nav class="bottom-tabs" aria-label="${tr('Основная навигация', 'Main navigation')}">${[['plan','plan','План','Plan'],['events','calendar','Событие','Event'],['profile','profile','Мои данные','My information']].map(([id, glyph, ru, en]) => `<button data-nav="${id}" class="${section===id?'active':''}" ${section===id?'aria-current="page"':''}>${icon(glyph,25)}<span>${tr(ru,en)}</span></button>`).join('')}</nav>`;
    return `<div class="ryadom-shell"><header class="app-header">${profile.consent && nested ? `<button class="icon-button" data-back aria-label="${tr('Назад','Back')}">${icon('back',24)}</button>` : '<span class="brand-mark">↗</span>'}<span class="brand-name">${tr('Рядом','Ryadom')}</span><button id="mobile-language" class="language-button" aria-label="${tr('Switch to English','Переключить на русский')}">${lang==='ru'?'EN':'RU'}</button></header><main class="screen" id="screen">${plan.demo_model?`<div class="demo-notice"><span>${tr('Демо','Demo')}</span>${tr('Отдельный тестовый профиль','Separate test profile')}</div>`:''}${inner}</main>${profile.consent?nav:''}</div>`;
}
function wireShell() {
    document.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => navigate({name:b.dataset.nav}));
    document.querySelector('[data-back]')?.addEventListener('click', goBack);
    document.querySelector('#mobile-language')?.addEventListener('click', guard(async () => {
        if (dirty) { confirmLeave(() => switchLanguage()); return; }
        await switchLanguage();
    }));
    const backButton = window.WebApp?.BackButton;
    if (backButton) {
        backButton.offClick?.(goBack);
        if (profile.consent && !['plan','events','profile'].includes(route.name)) {backButton.show?.();backButton.onClick?.(goBack);}
        else backButton.hide?.();
    }
}
function confirmLeave(action) {
    if (!dirty) { action(); return; }
    showModal(`<h2>${tr('Не сохранять изменения?','Discard changes?')}</h2><p>${tr('Черновик ещё не записан.','Your draft has not been saved.')}</p><div class="actions"><button class="primary" id="keep-editing">${tr('Продолжить редактирование','Keep editing')}</button><button class="secondary" id="discard-draft">${tr('Не сохранять','Discard')}</button></div>`);
    document.querySelector('#keep-editing').onclick = () => modal.close();
    document.querySelector('#discard-draft').onclick = () => { dirty = false; modal.close(); action(); };
}
function writeLocation(replace=false) {
    const url = new URL(location.href);
    url.searchParams.set('screen', route.name);
    for (const key of ['stage','key','revision','eventId','reason']) {
        url.searchParams.delete(key);
        if (route[key]) url.searchParams.set(key, route[key]);
    }
    const state = {ryadom:true, route, stack:routeStack};
    history[replace?'replaceState':'pushState'](state, '', url);
}
function navigate(next, replace=false) {
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
    confirmLeave(() => {
        const next = route.name === 'result' ? {name:'plan'} : routeStack.pop() || {name:'plan'};
        route = next; dirty = false; writeLocation(true); paintRoute(); window.scrollTo(0,next.scroll||0);
    });
}
window.addEventListener('popstate', e => {
    const next = route.name==='result' ? {name:'plan'} : e.state?.route || {name:'plan'}, stack = route.name==='result' ? [] : e.state?.stack || [];
    if (dirty) { writeLocation(false); confirmLeave(() => {route=next; routeStack=stack; writeLocation(true); paintRoute();}); }
    else {route=next; routeStack=stack; paintRoute(); window.scrollTo(0,next.scroll||0);}
});
window.addEventListener('beforeunload', e => {if (dirty) {e.preventDefault(); e.returnValue='';}});
root.addEventListener('input', markDraftDirty);
root.addEventListener('change', markDraftDirty);
function markDraftDirty(e) {if(e.target.closest('#event-form,#profile-form,#field-form')) {dirty=true;window.WebApp?.enableClosingConfirmation?.();}}
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
    if(!dirty)window.WebApp?.disableClosingConfirmation?.();
    if (!profile.consent) {renderOnboarding(); return;}
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
        case 'result': resultView(); break;
        case 'history': historyView(); break;
        case 'profile': profileView(); break;
        case 'edit': fieldEditorView(); break;
        default: route={name:'plan'};homeView();
    }
}
function progressText(p) {return p.total?tr(`${p.completed} из ${p.total} завершено`,`${p.completed} of ${p.total} completed`):tr('Нет текущих действий','No current tasks');}
function timeline() {
    const current = RoadmapView.currentStage(plan.tasks,effectiveProfile());
    return `<div class="stage-timeline">${RoadmapView.stages.map(id=>{
        const p=RoadmapView.progress(plan.tasks,id);
        return `<button data-stage="${id}" class="stage-row ${id===current?'current':''} ${p.done?'done':''}"><span class="timeline-dot">${p.done?icon('check',15):''}</span><span class="tile-icon">${icon(stageIcon(id),29)}</span><span class="stage-copy"><strong>${tr(...stageNames[id])}</strong><span>${progressText(p)}</span>${id===current?`<small>${tr('Вы сейчас здесь','You are here')}</small>`:''}</span>${icon('chevron')}</button>`;
    }).join('')}</div>`;
}
function wireStages() { document.querySelectorAll('[data-stage]').forEach(b=>b.onclick=()=>navigate({name:'stage',stage:b.dataset.stage})); }
function deadlineLines(t) {
    return (t.dates||[]).map(d=>`<div class="deadline-line">${icon(d.kind==='document_expiry'?'history':'calendar',18)}<span>${esc(d.kind==='document_expiry'?tr('Окончание документа','Document expiry'):shortTiming(d))}${d.owner==='university'?` · ${esc(universityName())}`:''}${d.computed_at?` — ${formatDate(d.computed_at)}`:`: ${esc(content(d.literal))}`}</span></div>`).join('');
}
function homeView() {
    const f=effectiveProfile(), hero=RoadmapView.hero(plan.tasks), qs=RoadmapView.clarifications(plan.tasks);
    root.innerHTML=shell(`<button class="context-card" id="context-profile"><span class="tile-icon">${icon('university',30)}</span><span><strong>${esc(universityName())}</strong><small>${esc(visaName(f.visa_regime))} · ${esc(residenceName(f.residence_type))}</small></span>${icon('chevron')}</button>
        <section class="hero-card">${hero?`<div class="hero-art" aria-hidden="true">${icon(familyIcon(hero),70)}</div><span class="next-label">${tr('Следующий шаг','Next step')}</span><h1>${esc(content(hero.title_i18n))}</h1>${hero.engine_status==='requires_recheck'?`<p class="recheck">${tr('Ранее отмечено вами — проверьте снова','Previously reported — check again')}</p>`:''}${deadlineLines(hero)}<button class="primary wide" data-task="${esc(hero.task_key)}">${tr('Открыть действие','Open task')} <span>→</span></button>`:`<h1>${tr('Пока нет действий','No actions for now')}</h1><p>${tr('Откройте маршрут или уточните данные.','Open your roadmap or complete your information.')}</p><button class="primary wide" id="hero-stages">${tr('Открыть маршрут','Open roadmap')} →</button>`}</section>
        <div class="section-heading"><h2>${tr('Ваш маршрут','Your roadmap')}</h2><button class="text-link" data-history>${tr('История','History')}</button></div>${timeline()}<button class="text-link all-stages" id="all-stages">${tr('Все этапы','All stages')} →</button>
        ${qs.length?`<section class="clarification-summary"><button class="clarification-heading" id="open-clarifications"><span class="warning-icon">!</span><span><strong>${tr('Нужно уточнить','Needs clarification')}: ${qs.length}</strong><small>${tr('Уточните данные и применимость правил в вашем случае.','Check your information and rule applicability.')}</small></span>${icon('chevron')}</button>${qs.slice(0,3).map(t=>`<button class="clarification-short" data-clarification="${esc(t.task_key)}">${icon(familyIcon(t),24)}<span>${esc(content(t.title_i18n))}</span>${icon('chevron')}</button>`).join('')}</section>`:''}`);
    wireShell();wireStages();wireTasks();
    document.querySelector('#context-profile').onclick=renderProfile;
    document.querySelector('#all-stages').onclick=()=>navigate({name:'stages'});
    document.querySelector('#hero-stages')?.addEventListener('click',()=>navigate({name:'stages'}));
    document.querySelector('[data-history]').onclick=()=>navigate({name:'history'});
    document.querySelector('#open-clarifications')?.addEventListener('click',()=>navigate({name:'clarifications'}));
    document.querySelectorAll('[data-clarification]').forEach(b=>b.onclick=()=>navigate({name:'clarifications'}));
}
function stagesView() {
    root.innerHTML=shell(`${heading(tr('Все этапы','All stages'))}<div class="section-heading"><p class="sub">${tr('Все этапы доступны. Действия могут идти параллельно.','All stages are available. Tasks can run in parallel.')}</p><button class="text-link" data-history>${tr('История','History')}</button></div>${timeline()}`);
    wireShell();wireStages();document.querySelector('[data-history]').onclick=()=>navigate({name:'history'});
}
function compactTask(t) {
    return `<button class="compact-task" data-task="${esc(t.task_key)}"><span class="tile-icon ${t.engine_status==='actionable'&&t.user_status==='completed'?'completed':''}">${icon(t.engine_status==='actionable'&&t.user_status==='completed'?'check':familyIcon(t),25)}</span><span><strong>${esc(content(t.title_i18n))}</strong><small class="${t.engine_status==='requires_recheck'?'recheck':''}">${t.engine_status==='requires_recheck'?tr('Ранее отмечено — проверьте снова','Previously reported — recheck'):tr(...statuses[t.user_status])}</small>${taskTiming(t)?`<small>${esc(shortTiming(taskTiming(t)))} · ${esc(taskDate(t))}</small>`:''}</span>${icon('chevron',17)}</button>`;
}
function wireTasks() {document.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>taskDetail(b.dataset.task));}
function stageView() {
    const id=RoadmapView.stages.includes(route.stage)?route.stage:'arrival', p=RoadmapView.progress(plan.tasks,id);
    const active=p.tasks.filter(t=>t.user_status!=='completed'||t.engine_status==='requires_recheck'), completed=p.tasks.filter(t=>t.user_status==='completed'&&t.engine_status==='actionable');
    const sources=[...new Map(p.tasks.flatMap(t=>t.source_snapshot).map(s=>[s.official_url,s])).values()];
    root.innerHTML=shell(`${heading(tr(...stageNames[id]))}<p class="progress-label">${progressText(p)}</p>${p.total?`<progress max="${p.total}" value="${p.completed}">${progressText(p)}</progress>`:''}<div class="task-stack">${active.map(compactTask).join('')}${!p.total?empty(tr('В этом этапе пока нет текущих действий.','No current tasks in this stage.')):''}</div>${completed.length?`<details class="completed-tasks"><summary>${tr('Завершённые','Completed')} · ${completed.length}</summary>${completed.map(compactTask).join('')}</details>`:''}${sources.length?`<section class="surface"><h2>${tr('Полезная информация','Useful information')}</h2>${sources.map(s=>`<a class="source-link" href="${esc(s.official_url)}" target="_blank" rel="noopener noreferrer">${icon('info')}<span>${esc(s.title)}</span>↗</a>`).join('')}</section>`:''}<button class="text-link" id="stage-questions">${tr('Посмотреть уточнения','View clarifications')} →</button>`);
    wireShell();wireTasks();document.querySelector('#stage-questions').onclick=()=>navigate({name:'clarifications'});
}
function clarificationsView() {
    const qs=RoadmapView.clarifications(plan.tasks);
    root.innerHTML=shell(`${heading(tr('Нужно уточнить','Needs clarification'))}${note(tr('Чтобы показать точные рекомендации, нам нужно уточнить несколько пунктов.','We need to clarify a few points to show relevant recommendations.'))}${['conditional','needs_review'].map(status=>{const ts=qs.filter(t=>t.engine_status===status);return ts.length?`<h2>${status==='conditional'?tr('Можно заполнить сейчас','You can add now'):tr('Нужно проверить','Needs review')}</h2>${ts.map(t=>`<section class="surface clarification-card ${status}"><div class="card-heading"><span class="tile-icon">${icon(familyIcon(t),30)}</span><h3>${esc(content(t.title_i18n))}</h3></div><p>${esc(content(t.eligibility_reason))}</p><p class="sub">${esc((t.missing_fields||[]).map(k=>fieldLabels[k]?tr(...fieldLabels[k]):tr('Проверка применимости','Applicability review')).join(' · '))}</p><button class="${status==='conditional'?'primary':'secondary'} wide" data-resolve="${esc(t.task_key)}">${status==='conditional'?tr('Добавить данные','Add information'):tr('Как проверить','How to check')} →</button></section>`).join('')}`:'';}).join('')}${!qs.length?empty(tr('Пока нет уточнений','No clarifications needed')):''}`);
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
        const options=fieldChoices(k),value=profile[k]===null?'':String(profile[k]??'');
        return `<div class="clarification-question"><span class="question-position">${tr('Вопрос','Question')} ${i+1}/${count}</span>${options?selectField(k,tr(...fieldLabels[k]),options,value):field(k,tr(...fieldLabels[k]),k==='citizenship'?'text':'date',value,k==='citizenship'?'maxlength="60"':'')}</div>`;
    }).join('');
    const editorHTML=`${heading(title)}<p class="sub">${esc(content(task.title_i18n))}</p><p class="privacy">${tr('Заполните известные данные и сохраните их вместе. Маршрут пересчитается; пункт может остаться, если ещё нужны сведения или проверка в офисе.','Add what you know and save it together. The roadmap will be recalculated; this item may remain if more information or an office review is needed.')}</p><form id="field-form"><div class="clarification-fields">${questions}</div><p class="clarification-progress" role="status" aria-live="polite"></p><button class="primary wide" type="submit">${tr('Сохранить данные','Save information')}</button></form>`;
    document.querySelector('#screen').insertAdjacentHTML('beforeend',`<dialog id="field-editor" class="field-sheet clarification-sheet" aria-label="${esc(title)}"><button type="button" class="sheet-close" id="field-close" aria-label="${tr('Закрыть','Close')}">×</button>${editorHTML}</dialog>`);
    const editor=document.querySelector('#field-editor');editor.showModal();
    const form=document.querySelector('#field-form');
    const updateProgress=()=>{const data=new FormData(form),answered=fields.filter(k=>!['','unknown'].includes(String(data.get(k)||''))).length;form.querySelector('.clarification-progress').textContent=tr(`Заполнено ${answered} из ${count}${count>3?' · прокрутите вопросы':''}`,`${answered} of ${count} answered${count>3?' · scroll for more':''}`);};
    form.addEventListener('input',updateProgress);form.addEventListener('change',updateProgress);updateProgress();
    editor.addEventListener('cancel',e=>{e.preventDefault();goBack();});
    document.querySelector('#field-close').onclick=goBack;
    form.onsubmit=guard(async e=>{
        e.preventDefault();
        const data=new FormData(e.currentTarget),next={...profile};
        for(const k of fields){const v=data.get(k);next[k]=['stay_over_90_days','fingerprinting_completed'].includes(k)?v===''?null:v==='true':v||null;}
        if(fields.includes('visa_regime')&&next.visa_regime==='visa_free')next.visa_expiry=null;
        if(fields.every(k=>next[k]===profile[k]))throw Error(tr('Измените хотя бы одно поле или закройте форму.','Change at least one field or close the form.'));
        profile=await api('/me/profile','PATCH',next);await refreshSnapshot();lang=profile.language;dirty=false;goBack();toast(tr('Данные сохранены, маршрут пересчитан','Information saved; roadmap updated'));
    });
}
function reviewView() {
    const t=plan.tasks.find(t=>t.task_key===route.key);
    if (!t) {navigate({name:'clarifications'},true);return;}
    root.innerHTML=shell(`${heading(content(t.title_i18n))}<section class="review-notice"><h3>${icon('warning',24)}${tr('Нужно проверить','Needs review')}</h3><p>${esc(content(t.eligibility_reason))}</p><p>${tr('Персональный срок не показан, пока применимость не подтверждена.','No personal deadline is shown while applicability remains unverified.')}</p></section><section class="surface"><h2>${tr('Что можно сделать','What you can do')}</h2><p>${esc(content(t.action_i18n))}</p><p>${tr('Уточните применимость требования в указанном офисе.','Ask the office below to confirm whether the requirement applies.')}</p></section><section class="surface"><h2>${tr('Источник и контакт','Source and contact')}</h2><p>${esc(t.contact)}</p>${t.source_snapshot.map(s=>`<a class="source-link" href="${esc(s.official_url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><small>${tr('Проверено','Checked')}: ${formatDate(s.checked_at)}</small>`).join('')}</section><button class="primary wide" id="review-done">${tr('Понятно','Understood')}</button>`);
    wireShell();document.querySelector('#review-done').onclick=goBack;
}
function eventsView() {
    const order=['address_changed','reentry_recorded','visa_issued','registration_confirmed','medical_completed','fingerprinting_completed',...Object.keys(eventNames).filter(k=>!['address_changed','reentry_recorded','visa_issued','registration_confirmed','medical_completed','fingerprinting_completed'].includes(k))];
    root.innerHTML=shell(`${heading(tr('Сообщить событие','Record an event'))}<p class="sub">${tr('Выберите, что изменилось. Это поможет обновить ваши рекомендации.','Choose what changed to update your recommendations.')}</p><div class="event-options">${order.map(type=>`<button class="event-option" data-event="${type}"><span class="tile-icon">${icon(({address_changed:'address',reentry_recorded:'plane',visa_issued:'passport',registration_confirmed:'plan',medical_completed:'medical',fingerprinting_completed:'fingerprint'})[type]||'calendar',27)}</span><strong>${tr(...eventNames[type])}</strong>${icon('chevron',17)}</button>`).join('')}</div><button class="text-link" id="event-history">${tr('История событий','Event history')} →</button>`);
    wireShell();document.querySelectorAll('[data-event]').forEach(b=>b.onclick=()=>eventForm(b.dataset.event));
    document.querySelector('#event-history').onclick=()=>{historyFilter='events';navigate({name:'history'});};
}
function readLoading(title) { root.innerHTML=shell(`${heading(title)}<div class="loading" role="status">${tr('Загружаем…','Loading…')}</div>`);wireShell(); }
function readError(err) {root.querySelector('.screen').innerHTML=`${heading(tr('Не удалось загрузить','Could not load'))}<p>${esc(err.message)}</p><button class="primary" id="read-retry">${tr('Повторить','Retry')}</button>`;document.querySelector('#read-retry').onclick=paintRoute;}
function changeKind(c) {return !c.before?'new':c.after.engine_status==='superseded'?'superseded':c.after.engine_status==='requires_recheck'?'recheck':'changed';}
const diffNames={new:['Новые действия','New tasks'],changed:['Что изменилось','What changed'],recheck:['Требует повторной проверки','Needs rechecking'],superseded:['Прежние действия','Previous tasks']};
async function resultView() {
    const generation=painting;readLoading(tr('Что изменилось после события','What changed after the event'));
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
        root.innerHTML=shell(`${heading(tr('Что изменилось после события','What changed after the event'))}<div class="success-note">${icon('check',26)}<span><strong>${route.reason==='event_retracted'?tr('Событие отменено','Event retracted'):route.reason==='event_corrected'?tr('Исправление учтено','Correction saved'):tr('Данные сохранены','Data saved')}</strong><small>${r?formatDate(r.created_at):tr('Событие учтено','Event recorded')}</small></span></div>${['new','changed','recheck','superseded'].map(kind=>{const group=changes.filter(c=>changeKind(c)===kind);return group.length?`<h2>${tr(...diffNames[kind])}</h2>${group.map(c=>`<section class="surface"><button class="diff-task" data-diff-task="${esc(c.task_key)}"><strong>${esc(content(c.after.title_i18n))}</strong>${icon('chevron')}</button><div class="diff"><div><b>${tr('До','Before')}</b><p>${c.before?`${tr(...states[c.before.engine_status])} · ${tr(...statuses[c.before.user_status])}<br>${esc(taskDate(c.before))}`:tr('Задачи не было','No task')}</p></div><div><b>${tr('После','After')}</b><p>${tr(...states[c.after.engine_status])} · ${tr(...statuses[c.after.user_status])}<br>${esc(taskDate(c.after))}</p></div></div></section>`).join('')}`:'';}).join('')}${!changes.length?empty(tr('Событие сохранено, задачи не изменились.','Event saved. Tasks did not change.')):''}<button class="primary wide" id="result-plan">${tr('Открыть обновлённый план','Open updated roadmap')}</button><button class="secondary wide" id="result-history">${tr('История','History')}</button>`);
        wireShell();document.querySelector('#result-plan').onclick=renderPlan;document.querySelector('#result-history').onclick=()=>navigate({name:'history'});
        document.querySelectorAll('[data-diff-task]').forEach(b=>b.onclick=()=>{const c=changes.find(c=>c.task_key===b.dataset.diffTask);navigate({name:'task',key:c.task_key,...(plan.tasks.some(t=>t.task_key===c.task_key)?{}:{snapshot:{...c.after,engine_status:'superseded'}})});});
    }catch(e){if(generation===painting)readError(e);}
}
async function historyView() {
    const generation=painting;readLoading(tr('История','History'));
    try {
        const [h,es]=await Promise.all([api('/me/history'),api('/me/events')]);if(generation!==painting)return;
        let nextOffset=h.next_offset;
        while(nextOffset!==null&&nextOffset!==undefined) {
            const more=await api('/me/history?offset='+nextOffset);if(generation!==painting)return;
            h.revisions.push(...more.revisions);nextOffset=more.next_offset;
        }
        h.revisions=[...new Map(h.revisions.map(r=>[r.id,r])).values()];
        const replaced=new Set(es.events.filter(e=>!e.retracted_at).map(e=>e.supersedes_event_id));
        const items=[...es.events.map(e=>({id:e.id,when:e.recorded_at,type:'events',event:e})),...h.revisions.map(r=>({id:r.id,when:r.created_at,type:'tasks',revision:r}))].sort((a,b)=>b.when.localeCompare(a.when)||a.id.localeCompare(b.id));
        let month='';
        root.innerHTML=shell(`${heading(tr('История','History'))}<div class="segmented">${[['all','Все','All'],['events','События','Events'],['tasks','Задачи','Tasks']].map(([id,ru,en])=>`<button data-history-filter="${id}" class="${historyFilter===id?'active':''}">${tr(ru,en)}</button>`).join('')}</div><div class="history-timeline">${items.filter(i=>historyFilter==='all'||i.type===historyFilter).map(i=>{
            const label=new Date(i.when).toLocaleDateString(lang==='en'?'en-GB':'ru-RU',{month:'long',year:'numeric',timeZone:'Europe/Moscow'}), group=label!==month?`<h2>${label}</h2>`:'';month=label;
            const time=new Date(i.when).toLocaleString(lang==='en'?'en-GB':'ru-RU',{timeZone:'Europe/Moscow'});
            if(i.event){const e=i.event;return `${group}<article class="history-item"><span class="tile-icon">${icon('calendar',23)}</span><div><strong>${tr(...eventNames[e.type])}</strong><p>${e.retracted_at?tr('Отменено','Retracted'):replaced.has(e.id)?tr('Исправлено','Corrected'):tr('Сообщено вами','Reported by you')} · ${time} ${tr('МСК','MSK')}</p><small>${tr('Дата события','Occurred')}: ${formatDate(e.occurred_at)}</small><details><summary>${tr('Данные события','Event information')}</summary>${Object.entries(e.payload).map(([k,v])=>`<p>${esc(fieldLabels[k]?tr(...fieldLabels[k]):k)}: ${esc(v)}</p>`).join('')}</details>${!e.retracted_at&&!replaced.has(e.id)?`<div class="actions"><button class="text-link" data-edit-event="${e.id}">${tr('Исправить','Correct')}</button><button class="text-link danger" data-retract-event="${e.id}">${tr('Отменить','Retract')}</button></div>`:''}</div></article>`;}
            const r=i.revision;return `${group}<button class="history-item revision-item" data-revision="${r.id}"><span class="tile-icon">${icon(r.reason==='user_status_changed'?'check':'history',23)}</span><span><strong>${esc(reasonLabel(r.reason))}</strong><small>${time} ${tr('МСК','MSK')} · ${r.changes.length} ${tr('изменений','changes')}</small>${r.changes.slice(0,2).map(c=>`<small>${esc(content(c.after.title_i18n))}${r.reason==='user_status_changed'?` · ${tr(...statuses[c.after.user_status])}`:''}</small>`).join('')}</span>${icon('chevron',16)}</button>`;
        }).join('')||empty(tr('Пока нет записей','No history yet'))}</div>${note(tr('История показывает ваши события, отметки и изменения маршрута.','History shows your events, self-reports and roadmap changes.'))}`);
        wireShell();document.querySelectorAll('[data-history-filter]').forEach(b=>b.onclick=()=>{historyFilter=b.dataset.historyFilter;paintRoute();});
        document.querySelectorAll('[data-revision]').forEach(b=>b.onclick=()=>navigate({name:'result',revision:b.dataset.revision}));
        document.querySelectorAll('[data-edit-event]').forEach(b=>b.onclick=()=>{const e=es.events.find(e=>e.id===b.dataset.editEvent);eventForm(e.type,e);});
        document.querySelectorAll('[data-retract-event]').forEach(b=>b.onclick=()=>{
            showModal(`<h2>${tr('Отменить событие?','Retract event?')}</h2><p>${tr('План пересчитается. Запись останется в истории.','The roadmap will be recalculated. The record stays in history.')}</p><button class="primary" id="confirm-retract">${tr('Отменить событие','Retract event')}</button>`);
            document.querySelector('#confirm-retract').onclick=guard(async()=>{const saved=await api('/me/events/'+b.dataset.retractEvent,'DELETE');modal.close();await refreshSnapshot();navigate({name:'result',eventId:b.dataset.retractEvent,revision:saved.revision_id,reason:'event_retracted'},true);});
        });
    }catch(e){if(generation===painting)readError(e);}
}
const extraFieldNames={university_id:['Вуз','University'],entry_at:['Дата въезда в Россию','Entry date'],planned_entry:['Планируемый въезд','Planned entry'],language:['Язык','Language'],last_medical_completed_at:['Предыдущий медосмотр','Previous medical examination'],stay_expiry:['Окончание пребывания','Permitted stay expiry'],education_start:['Начало занятий','Classes start'],campus_id:['Площадка','Campus'],study_form:['Форма обучения','Study form']};
Object.assign(fieldLabels,extraFieldNames);
function fieldChoices(k) {
    const unknown=['unknown',tr('Не указано','Not set')];
    return ({university_id:[['sutd','СПбГУПТД'],['leti','ЛЭТИ']],language:[['ru','Русский'],['en','English']],visa_regime:[unknown,['visa',tr('По визе','Visa')],['visa_free',tr('Без визы','Visa-free')]],residence_type:[unknown,['dorm',tr('Общежитие','Dormitory')],['private',tr('Частный адрес','Private accommodation')],['other',tr('Другое','Other')]],age_band:[unknown,['adult',tr('18 лет и старше','18 or older')],['minor',tr('До 18 лет','Under 18')]],migration_basis:[unknown,['study',tr('Учёба','Study')],['rvpo','РВПО'],['rvp','РВП'],['residence_permit','ВНЖ']],entry_purpose:[unknown,['study',tr('Учёба','Study')],['other',tr('Другое','Other')]],study_status:[unknown,...[['active','Учусь','Active'],['leave','Академический отпуск','Academic leave'],['transferred','Перевод','Transferred'],['expelled','Отчисление','Expelled'],['graduated','Выпуск','Graduated'],['working','Работа','Working']].map(([v,ru,en])=>[v,tr(ru,en)])],stay_over_90_days:[['',tr('Не знаю','Not sure')],['true',tr('Да','Yes')],['false',tr('Нет','No')]],fingerprinting_completed:[['',tr('Не знаю','Not sure')],['true',tr('Да','Yes')],['false',tr('Нет','No')]],campus_id:[['main',tr('Основная','Main')],['vshte','ВШТЭ'],['other',tr('Другая','Other')]],study_form:[unknown,['full_time',tr('Очная','Full-time')],['part_time',tr('Очно-заочная','Part-time')]]})[k];
}
function editableFields(){return ['university_id','language','visa_regime','residence_type','age_band','citizenship','migration_basis','study_status','entry_purpose','stay_over_90_days','fingerprinting_completed','visa_expiry','registration_expiry','planned_entry','entry_at','last_medical_completed_at','stay_expiry','education_start','campus_id','study_form'];}
function profileValue(k,f) {
    const v=f[k];if(v===null||v===undefined||v===''||v==='unknown')return tr('Не указано','Not set');
    return fieldChoices(k)?.find(([x])=>x===String(v))?.[1] || (/(?:_at|_expiry|_entry|_start)$/.test(k)?formatDate(v):String(v));
}
function profileView() {
    const f=effectiveProfile();
    const groups=[['profile','Данные маршрута','Roadmap information',['university_id','visa_regime','entry_at','planned_entry','residence_type']],['plan','Документы и сроки','Documents and dates',['visa_expiry','registration_expiry','stay_expiry']],['info','Дополнительные уточнения','Additional information',['age_band','citizenship','migration_basis','study_status','entry_purpose','stay_over_90_days','fingerprinting_completed','last_medical_completed_at','education_start','campus_id','study_form','language']]];
    root.innerHTML=shell(`${heading(tr('Мои данные','My information'))}${groups.map(([glyph,ru,en,keys])=>`<section class="profile-group"><h2>${icon(glyph,24)}${tr(ru,en)}</h2>${keys.map(k=>`<button class="profile-row" data-field="${k}"><span>${tr(...fieldLabels[k])}</span><span class="field-value">${esc(profileValue(k,f))}</span>${icon('chevron',16)}</button>`).join('')}</section>`).join('')}${note(tr('Мы храним только данные, необходимые для построения маршрута. Новые документы и изменения обстоятельств записываются как события.','We store only information needed for your roadmap. New documents and changes are recorded as events.'))}<button class="secondary wide" id="notification-toggle">${profile.reminders_enabled?tr('Отключить напоминания','Disable reminders'):tr('Включить напоминания','Enable reminders')}</button><button class="text-link danger" id="delete-data">${tr('Удалить мои данные','Delete my data')}</button>${demoProfilePanel()}`);
    wireShell();document.querySelectorAll('[data-field]').forEach(b=>b.onclick=()=>navigate({name:'edit',field:b.dataset.field}));
    document.querySelectorAll('[data-demo-profile]').forEach(b=>b.onclick=guard(()=>switchDemoProfile(b.dataset.demoProfile)));
    document.querySelector('#notification-toggle').onclick=guard(async()=>{profile=await api('/me/profile','PATCH',{...profile,reminders_enabled:!profile.reminders_enabled});paintRoute();});
    document.querySelector('#delete-data').onclick=()=>{showModal(`<h2>${tr('Удалить профиль?','Delete profile?')}</h2><p>${tr('Все данные сервиса будут удалены. Это нельзя отменить.','All service data will be deleted. This cannot be undone.')}</p><button class="primary danger" id="confirm-delete">${tr('Удалить данные','Delete data')}</button>`);document.querySelector('#confirm-delete').onclick=guard(async()=>{await api('/me/profile','DELETE');forgetDemoSession();sessionStorage.removeItem('student_token');token=null;profile={};plan={tasks:[]};step=0;modal.close();routeStack=[];route={name:'plan'};writeLocation(true);landing();});};
}
function fieldEditorView() {
    const k=route.field;if(!editableFields().includes(k)){navigate({name:'profile'},true);return;}
    const eventType={visa_expiry:'visa_issued',registration_expiry:'registration_confirmed',fingerprinting_completed:'fingerprinting_completed',last_medical_completed_at:'medical_completed',entry_at:effectiveProfile().entry_at?'reentry_recorded':'entry_recorded',residence_type:'address_changed'}[k];
    const options=fieldChoices(k),value=profile[k]===null?'':String(profile[k]??'');
    const editorHTML = `${heading(tr(...fieldLabels[k]))}${eventType?`<p class="sub">${tr('Новый факт нужно сохранить как событие. Начальные сведения можно уточнить отдельно.','Record a new fact as an event. Initial information can be corrected separately.')}</p><button class="primary wide" id="field-event">${tr(...eventNames[eventType])} →</button><details><summary>${tr('Уточнить исходные сведения','Correct initial information')}</summary>`:''}<form id="field-form">${options?selectField(k,tr(...fieldLabels[k]),options,value):field(k,tr(...fieldLabels[k]),k==='citizenship'?'text':'date',value,k==='citizenship'?'maxlength="60"':'')}<p class="privacy">${tr('Изменения уже записанных событий исправляйте в истории.','Correct previously recorded events in History.')}</p><button class="primary wide" type="submit">${tr('Сохранить','Save')}</button></form>${eventType?'</details>':''}`;
    profileView();
    document.querySelector('#screen').insertAdjacentHTML('beforeend', `<dialog id="field-editor" class="field-sheet" aria-label="${esc(tr(...fieldLabels[k]))}"><button type="button" class="sheet-close" id="field-close" aria-label="${tr('Закрыть','Close')}">×</button>${editorHTML}</dialog>`);
    const editor=document.querySelector('#field-editor');editor.showModal();
    editor.addEventListener('cancel',e=>{e.preventDefault();goBack();});
    document.querySelector('#field-close').onclick=goBack;
    document.querySelector('#field-event')?.addEventListener('click',()=>eventForm(eventType));
    document.querySelector('#field-form').onsubmit=guard(async e=>{
        e.preventDefault();const v=new FormData(e.currentTarget).get(k), next={...profile,[k]:['stay_over_90_days','fingerprinting_completed'].includes(k)?v===''?null:v==='true':v||null};
        if(k==='visa_regime'&&v==='visa_free')next.visa_expiry=null;
        profile=await api('/me/profile','PATCH',next);await refreshSnapshot();lang=profile.language;dirty=false;goBack();toast(tr('Данные сохранены','Information saved'));
    });
}
function saveOnboardDraft() {
    const f=document.querySelector('#onboard-form');if(!f)return;
    const d=Object.fromEntries(new FormData(f));for(const k of ['entry_at','planned_entry','visa_expiry','residence_type'])if(k in d)profile[k]=d[k]||null;
}
function landing() {
    root.innerHTML=shell(`<section class="welcome"><div class="welcome-logo">↗</div><h1>${tr('Рядом','Ryadom')}</h1><p>${tr('Пошаговая поддержка<br>для международных<br>студентов в России','Step-by-step support<br>for international<br>students in Russia')}</p><div class="welcome-world" aria-hidden="true"><span class="world-orbit"></span>${icon('university',90)}<span class="world-pin">${icon('address',30)}</span></div>${token||config.demo_mode?`<button class="primary wide" id="welcome-start">${tr('Начать','Get started')} →</button>`:`<a class="primary wide" href="https://max.ru/${esc(config.max_bot_username||'t647_hakaton_max_bot')}">${tr('Открыть в MAX','Open in MAX')} →</a>`}${!token&&config.demo_mode?`<small>${tr('В браузере — отдельный тестовый профиль. В MAX план связан с вашим аккаунтом.','Browser mode uses a separate test profile. In MAX, your plan is linked to your account.')}</small>`:''}</section>`);
    wireShell();document.querySelector('#welcome-start')?.addEventListener('click',guard(async()=>{
        if(!token){const auth=await api('/auth/demo','POST');token=auth.access_token;sessionStorage.setItem('student_token',token);sessionStorage.removeItem(demoStorageKey);profile=await api('/me/profile');plan=await api('/me/roadmap');}
        step=0;renderOnboarding();
    }));
}
start().then(()=>{
    if(!profile.consent)return;
    const params=requestedScreen, name=params.get('screen');
    if(name && ['plan','stages','stage','task','clarifications','review','events','result','history','profile'].includes(name)) {
        route={name};for(const key of ['stage','key','revision','eventId','reason'])if(params.has(key))route[key]=params.get(key);
        routeStack=[{name:'plan'}];writeLocation(true);paintRoute();
    }
}).catch(e=>{
    root.innerHTML=`<div class="onboard"><h2>Не удалось открыть приложение / Could not open the app</h2><p>${esc(e.message)}</p><button class="primary" id="retry">Повторить / Retry</button></div>`;
    document.querySelector('#retry').onclick=()=>location.reload();
});
