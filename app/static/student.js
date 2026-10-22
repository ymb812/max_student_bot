/* No identity from initDataUnsafe is used for authorization. */
const root = document.querySelector('#app'),
    modal = document.querySelector('#modal');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
} [c]));
let token = sessionStorage.getItem('student_token'),
    profile = {},
    plan = {
        tasks: []
    },
    config = {},
    lang = sessionStorage.getItem('ryadom_entry_language') === 'en' ? 'en' : 'ru',
    step = 0;
let onboardingDraft = null, onboardingDraftScope = null;
let onboardingScope = token ? sessionStorage.getItem('ryadom_onboarding_scope_' + token) : null;
let entryScreen = 'loading', authState = 'loading';
const tr = (ru, en) => lang === 'en' ? en : ru;
const content = x => x?.[lang] ?? x?.ru ?? '';
const today = () => new Date().toLocaleDateString('en-CA', {
    timeZone: 'Europe/Moscow'
});
const formatDate = x => x ? new Date(x.length === 10 ? x + 'T12:00:00+03:00' : x).toLocaleDateString(lang === 'en' ? 'en-GB' : 'ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
}) : tr('Уточнить', 'Check with office');
const states = {
    actionable: ['Можно действовать', 'Ready to act'],
    conditional: ['Нужны данные', 'More information'],
    needs_review: ['Проверить в офисе', 'Office review'],
    requires_recheck: ['Проверить повторно', 'Recheck'],
    superseded: ['В истории', 'Superseded']
};
const statuses = {
    not_started: ['Не начато', 'Not started'],
    in_progress: ['В процессе', 'In progress'],
    completed: ['Выполнено', 'Completed']
};
const eventNames = {
    entry_recorded: ['Въезд в Россию', 'Entry into Russia'],
    reentry_recorded: ['Повторный въезд в Россию', 'Re-entry into Russia'],
    address_changed: ['Переезд на другое место проживания', 'Change of residence'],
    hotel_stay_started: ['Заселение в гостиницу', 'Hotel check-in'],
    hotel_stay_ended: ['Выезд из гостиницы', 'Hotel check-out'],
    visa_issued: ['Получение визы', 'Visa received'],
    registration_confirmed: ['Получение регистрации', 'Registration received'],
    medical_completed: ['Прохождение медосмотра', 'Medical examination completed'],
    fingerprinting_completed: ['Прохождение дактилоскопии', 'Fingerprinting completed'],
    passport_replaced: ['Замена паспорта', 'Passport replaced'],
    status_changed: ['Изменение основания пребывания', 'Basis for stay changed'],
    enrolment_changed: ['Изменение учебного статуса', 'Study status changed']
};

function toast(msg) {
    const el = document.querySelector('#toast');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 4500)
}
async function api(path, method = 'GET', body, credential = token) {
    const response = await fetch('/api' + path, {
        method,
        signal: AbortSignal.timeout(15000),
        headers: {
            'Content-Type': 'application/json',
            ...(credential ? {
                Authorization: 'Bearer ' + credential
            } : {})
        },
        ...(body ? {
            body: JSON.stringify(body)
        } : {})
    });
    if (!response.ok) {
        let e = await response.json().catch(() => ({}));
        if (response.status === 401 && credential === token) {
            sessionStorage.removeItem('student_token');
            token = null;
            if(authState==='ready'||authState==='expired') {
                authState='expired';
                painting++;
                renderAuthStatus();
            }
        }
        const error = Error(apiErrorMessage(e,response.status));
        error.status = response.status;
        error.code = e.error_code || e.errors?.[0]?.code;
        throw error
    }
    return response.json()
}

function guard(fn) {
    return async e => {
        const b = e?.currentTarget;
        const buttons = b?.tagName === 'BUTTON' ? [b] : b?.tagName === 'FORM' ? [...b.querySelectorAll('button[type=submit],button:not([type])')] : [];
        buttons.forEach(b => b.disabled = true);
        try {
            await fn(e)
        } catch (err) {
            const message = err.name === 'TimeoutError' || err instanceof TypeError ? tr('Не удалось получить подтверждение сохранения. Проверьте соединение и повторите попытку.', 'We could not confirm saving. Check your connection and try again.') : err.message;
            const form = b?.closest('form') || root.querySelector('#event-form,#field-form,#onboard-form,#result-form,#event-parser-form');
            if (form) {
                let error = form.querySelector('.form-error');
                if (!error) {error = document.createElement('div'); error.className='form-error'; error.setAttribute('role','alert'); form.append(error);}
                error.textContent = message;
                const recovery=errorRecovery(err.code);
                if(recovery) {
                    const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent=recovery.label;
                    button.onclick=()=>confirmLeave(()=>guard(async()=>{await refreshSnapshot();navigate({name:recovery.name});})());
                    error.append(document.createElement('br'),button);
                }
            }
            toast(message)
        } finally {
            buttons.filter(b => b.isConnected).forEach(b => b.disabled = false)
        }
    }
}

const iconPaths = {
    plan: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v4H9zM9 12h6M9 16h4"/>',
    profile: '<circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
    event: '<path d="M12 5v14M5 12h14"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    address: '<path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7"/>'
};
const icon = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || ''}</svg>`;

async function switchLanguage(nextLanguage = lang === 'ru' ? 'en' : 'ru') {
    if (nextLanguage === lang) return;
    sessionStorage.setItem('ryadom_entry_language', nextLanguage);
    if (authState !== 'ready') {lang = nextLanguage; renderAuthStatus(); return;}
    if (!token) {lang = nextLanguage; renderMaxLanding(); return;}
    const draft = captureFormDraft(), wasDirty = dirty, position = scrollY;
    if (profile.consent) {
        profile = await api('/me/profile', 'PATCH', {...profile, language: nextLanguage});
        await refreshSnapshot();
    }
    lang = nextLanguage;
    if (!profile.consent) { ensureOnboardingDraft(); onboardingDraft.language = lang; persistOnboardingDraft(); }
    profile.consent ? paintRoute() : renderEntry();
    restoreFormDraft(draft); dirty = wasDirty;
    if (dirty) window.WebApp?.enableClosingConfirmation?.();
    window.scrollTo(0, position);
}

async function load() {
    profile = await api('/me/profile');
    lang = profile.language;
    plan = await api('/me/roadmap');
    if (profile.consent) {renderPlan(); applyEntryNavigation();}
    else restoreOnboardingEntry();
    window.scrollTo(0, 0)
}

function option(value, label, selected) {
    return `<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`
}

function field(name, label, type = 'text', value = '', extra = '') {
    return `<label class="field">${esc(label)}<input name="${name}" type="${type}" ${type==='datetime-local'?'step="1"':''} value="${esc(value)}" ${extra}></label>`
}

function residenceOptions(selected) {
    return fieldChoices('residence_type').map(([v,l])=>option(v,l,selected)).join('');
}

function onboardingStorageKey() { return 'ryadom_onboarding_' + (onboardingScope || token); }
function ensureOnboardingDraft() {
    if (onboardingDraft && onboardingDraftScope === onboardingStorageKey()) return;
    onboardingDraft = null;
    onboardingDraftScope = onboardingStorageKey();
    try { onboardingDraft = JSON.parse(sessionStorage.getItem(onboardingStorageKey())); } catch { /* Ignore an invalid local draft. */ }
    if (!onboardingDraft || typeof onboardingDraft !== 'object' || Array.isArray(onboardingDraft)) onboardingDraft = null;
    if (!onboardingDraft) onboardingDraft = {
        arrival_status: profile.arrival_status !== 'unknown' ? profile.arrival_status : null,
        university_id: profile.university_id || null, visa_regime: null, residence_type: null,
        language: sessionStorage.getItem('ryadom_entry_language') || lang, consent: false, step: 0, started: false
    };
    // Older clients created empty drafts before the student started answering.
    if (typeof onboardingDraft.started !== 'boolean') onboardingDraft.started = !!(
        onboardingDraft.arrival_status || onboardingDraft.visa_regime || onboardingDraft.residence_type || onboardingDraft.step > 0 || onboardingDraft.consent
    );
    if(onboardingDraft.version!==3) {onboardingDraft.version=3;onboardingDraft.step=0;}
    step = Math.max(0, Math.min(onboardingBlocks().length-1, Math.floor(Number(onboardingDraft.step) || 0)));
    lang = onboardingDraft.language === 'en' ? 'en' : 'ru';
}
function persistOnboardingDraft() {
    onboardingDraft.step = step;
    sessionStorage.setItem(onboardingStorageKey(), JSON.stringify(onboardingDraft));
}

function taskTiming(t) {
    const dates = t.dates.filter(d => d.kind !== 'document_expiry');
    return dates.find(d => d.computed_at) || dates[0] || null;
}

function taskDate(t) {
    const timing = taskTiming(t);
    return timing?.computed_at ? formatDate(timing.computed_at) : timing ? timingExplanation(timing) : tr('Без отдельного срока', 'No separate deadline');
}

function taskCategory(t) {
    const names = {
        M01: ['До приезда', 'Before arrival'], M02: ['Въезд', 'Entry'],
        M03: ['После приезда', 'After arrival'], M04: ['Миграционный учёт', 'Migration registration'],
        M05: ['Медосмотр', 'Medical examination'], M06: ['Дактилоскопия', 'Fingerprinting'],
        M07: ['Виза', 'Visa'], M08: ['Продление учёта', 'Registration renewal'],
        M09: ['Изменение обстоятельств', 'Changed circumstances'], M10: ['Повторный медосмотр', 'Repeat medical examination']
    };
    return tr(...(names[t.family] || ['Действие', 'Task']));
}

function shortTiming(timing) {
    if (!timing) return '';
    if(timing.prototype_assumption&&timing.kind==='legal_deadline')return tr('Выполнить до','Complete by');
    if (timing.kind === 'preparation_start') return tr('Начало подготовки', 'Start preparing');
    if (timing.required_or_recommended === 'recommended_by_university') return tr('Рекомендация вуза', 'University recommendation');
    if (timing.kind === 'legal_deadline') return tr('Общий срок из источника', 'General timing from the source');
    return tr('Обращение в вуз', 'University submission');
}

function showModal(html) {
    modal.innerHTML = `<button class="close" id="close" aria-label="${tr('Закрыть','Close')}">×</button>${html}`;
    document.querySelector('#close').onclick = () => modal.close();
    const title = modal.querySelector('h2');
    if (title) {
        title.id = 'modal-title';
        modal.setAttribute('aria-labelledby', 'modal-title');
    } else modal.removeAttribute('aria-labelledby');
    if (!modal.open) {
        modal.showModal();
        modal.scrollTop = 0;
    }
}

function unitLabel(v) {
    return ({
        calendar: tr('календарные дни', 'calendar days'),
        working: tr('рабочие дни', 'working days'),
        hours: tr('часы', 'hours'),
        unspecified: tr('единица времени не подтверждена', 'time unit unverified')
    })[v] || v
}

function timingLabel(v) {
    return ({
        required: tr('Обязательный по инструкции срок', 'Required by the instruction'),
        recommended_by_university: tr('Рекомендация вуза', 'University recommendation'),
        document_fact: tr('Дата из документа', 'Document date'),
        unspecified: tr('Уточните в отделе, обязателен ли этот срок или это рекомендация', 'Ask the office whether this timing is required or recommended'),
        product_sorting: tr('Совет приложения для подготовки', 'Preparation suggestion from the app')
    })[v] || v
}

function sourceLabel(v) {
    return ({
        public_official: tr('Опубликованная инструкция', 'Published instruction'),
        employee_confirmed: tr('Подтверждено сотрудником', 'Confirmed by staff'),
        demo_model: tr('Демонстрационное правило', 'Demonstration rule')
    })[v] || v
}

function confidenceLabel(v) {
    return ({
        P: tr('подтверждено источником', 'source verified'),
        C: tr('требует уточнения', 'requires verification'),
        U: tr('не подтверждено', 'unverified')
    })[v] || v
}

function taskContactLines(contact) {
    return String(contact||'').split(/\s*·\s*|\n+/).filter(Boolean).map(line=>{
        const parts=line.split(/(https?:\/\/[^\s<>]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi);
        return `<p>${parts.map(part=>/^https?:\/\//i.test(part)?`<a href="${esc(part)}" target="_blank" rel="noopener noreferrer">${esc(part)}</a>`:/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(part)?`<a href="mailto:${esc(part)}">${esc(part)}</a>`:esc(part)).join('')}</p>`;
    }).join('');
}
function taskDateDetails(d,kinds) {
    const expiry=d.kind==='document_expiry';
    const recommended=d.required_or_recommended==='recommended_by_university';
    const expiryTitles={visa_expiry:['Виза действует до','Visa valid until'],registration_expiry:['Регистрация действует до','Registration valid until'],stay_expiry:['Разрешённое пребывание до','Permitted stay until']};
    const title=expiry?tr(...(expiryTitles[d.anchor_field]||['Документ действует до','Document valid until'])):d.prototype_assumption&&d.kind==='legal_deadline'?tr('Выполнить до','Complete by'):recommended&&d.kind==='university_submission_deadline'?tr('Рекомендуемый срок обращения','Recommended time to contact the office'):tr(...(kinds[d.kind]||['Срок','Timing']));
    // Remove only the redundant recommendation prefix; retain the source interval and conditions.
    const literal=content(d.literal).replace(recommended?/^(?:Рекомендуемый вузом срок(?: обращения)?: |University recommendation: )/:/^$/, '');
    const value=d.computed_at?`<p class="task-date-value">${formatDate(d.computed_at)}</p>`:d.literal_explains_calculation&&!expiry?'':`<p>${expiry?tr('Дата окончания не указана. Уточните её по документу.','Expiry date is unknown. Check your document.'):esc(timingExplanation(d))}</p>`;
    const qualification=!expiry&&d.required_or_recommended==='unspecified'?`<p>${tr('Уточните в вузе, обязателен ли этот срок.','Check with the university whether this deadline is mandatory.')}</p>`:!expiry&&d.required_or_recommended==='product_sorting'?`<p>${tr('Ориентир для подготовки, предложенный приложением.','A preparation guide suggested by the app.')}</p>`:'';
    return `<div class="task-date-row"><h3>${title}</h3>${d.computed_at?value:''}${expiry?'':`<p>${esc(literal)}</p>`}${d.computed_at?'':value}${qualification}</div>`;
}
function sourceCard(s) {
    return `<article class="reference-source"><a class="reference-title" href="${esc(s.official_url)}" target="_blank" rel="noopener noreferrer">${esc(sourceTitle(s))}</a>${sourceSection(s)?`<p><strong>${tr('Где искать','Where to look')}</strong><br>${esc(sourceSection(s))}</p>`:''}${s.purpose_i18n?`<p>${esc(content(s.purpose_i18n))}</p>`:''}<dl class="reference-facts"><dt>${tr('Тип источника','Source type')}</dt><dd>${esc(sourceLabel(s.source_type))}</dd><dt>${tr('Содержание источника проверяли','Source content checked')}</dt><dd>${sourceCheckedDate(s)}</dd>${s.navigation_verified&&s.navigation_checked_at?`<dt>${tr('Раздел на странице проверяли','Page section checked')}</dt><dd>${formatDate(s.navigation_checked_at)}</dd>`:''}</dl>${s.verification_note_i18n?`<p>${esc(content(s.verification_note_i18n))}</p>`:''}</article>`;
}
function taskSupportingSections(t, showExpected=false) {
    const documents=content(t.documents_i18n)||[];
    const expected=(content(t.expected_result_i18n)||'').trim();
    const expectedSentence=expected&&!/[.!?…]$/.test(expected)?expected+'.':expected;
    return `        ${documents.length?`<section class="task-section"><h2>${tr('Что подготовить','What to prepare')}</h2>${documentListView(t)}${t.missing_documents?.length?`<div class="task-remaining"><h3>${tr('Осталось передать','Still to submit')}</h3><ul>${t.missing_documents.map(i=>`<li>${esc(documents[i])}</li>`).join('')}</ul></div>`:''}</section>`:''}
        ${t.contact?`<section class="task-section"><h2>${t.process==='documents'?tr('Куда обратиться за помощью','Where to get help'):tr('Куда обратиться','Where to go')}</h2><div class="task-contact">${taskContactLines(content(t.contact_i18n)||t.contact)}</div>${content(t.contact_note_i18n)?`<p>${esc(content(t.contact_note_i18n))}</p>`:''}</section>`:''}
        ${showExpected&&expected?`<section class="task-section task-expected"><h2>${tr('Результат этого шага','Expected outcome')}</h2><p>${esc(expectedSentence)}</p></section>`:''}
        ${t.help_i18n?`<section class="task-section task-help"><h2>${tr('Если возникла проблема','If you need help')}</h2><p>${esc(content(t.help_i18n))}</p></section>`:''}
`;
}
function taskInformationView(key) {
    const t=route.snapshot||plan.tasks.find(t=>t.task_key===key);
    if(!t)return;
    showDetail(`<div class="task-information">${heading(tr('Об этой рекомендации','About this recommendation'))}<p class="task-information-subtitle">${esc(content(t.title_i18n))}</p>
        ${t.prototype_timing?`<p>${tr('В прототипе срок рассчитан по демонстрационной модели.','This prototype uses a demonstration timing model.')}</p>`:''}
        <section class="task-section"><h2>${tr('Почему она в плане','Why it is in your plan')}</h2><p>${esc(content(t.eligibility_reason))}</p>${t.availability==='past'&&t.availability_reason_i18n?`<p>${esc(content(t.availability_reason_i18n))}</p>`:''}</section>
        ${taskInstruction(t)!==content(t.action_i18n)?`<section class="task-section"><h2>${tr('Порядок действий','Procedure')}</h2><p class="reference-instruction">${esc(content(t.action_i18n))}</p>${content(t.performer_i18n)?`<p>${esc(content(t.performer_i18n))}</p>`:''}</section>`:''}
        ${t.availability==='past'?taskSupportingSections(t):''}
        <section class="task-section"><h2>${tr('Источники','Sources')}</h2>${t.source_snapshot.map(sourceCard).join('')}</section>
        <section class="task-section"><h2>${tr('Что проверено','Verification details')}</h2><dl class="reference-facts"><dt>${tr('Что говорит источник','What the source confirms')}</dt><dd>${esc(confidenceLabel(t.norm_confidence))}</dd><dt>${tr('Применимость к вам','Applicability to you')}</dt><dd>${esc(confidenceLabel(['conditional','needs_review','requires_recheck'].includes(t.engine_status)?'C':t.eligibility_confidence))}</dd><dt>${tr('Проверен ли расчёт даты','Date calculation verified')}</dt><dd>${esc(confidenceLabel(t.formula_confidence))}</dd><dt>${tr('Версия правила','Rule version')}</dt><dd>${esc(t.rule_version)}</dd></dl></section></div>`);
}
function taskDetailView(key) {
    const t = route.snapshot || plan.tasks.find(t => t.task_key === key);
    if (!t) return;
    const kinds = {
        legal_deadline: ['Общий срок из источника', 'General timing from the source'],
        university_submission_deadline: ['Когда обратиться в вуз', 'When to contact the office'],
        preparation_start: ['Начало подготовки', 'Preparation start'],
        document_expiry: ['Окончание документа', 'Document expiry']
    };
    const past=t.availability==='past';
    const fieldName = k => fieldLabels[k] ? tr(...fieldLabels[k]) : k;
    const statusLocked = !!t.process || t.engine_status !== 'actionable' || t.completion_basis === 'reported_fact';
    const documents=content(t.documents_i18n)||[], missing=t.missing_fields||[];
    const showState=t.engine_status!=='actionable'||t.user_status!=='not_started'||['waiting','partial','needs_help'].includes(t.workflow_status)||['future','past'].includes(t.availability);
    const resultControls=t.process?workflowControls(t):statusLocked?`<p>${esc(lockedStatusReason(t))}</p>`:`<div class="status-control" aria-label="${tr('Мой статус','My status')}">${Object.entries(statuses).map(([v,s])=>`<button aria-pressed="${t.user_status===v}" data-status="${v}">${tr(...s)}</button>`).join('')}</div>`;
    const canReport=!t.process||t.result_actions?.length||t.process==='entry_context'&&t.user_status!=='completed'||t.process==='invitation'&&missing.includes('preparation_state')||t.process==='initial_visa'&&t.availability==='future';
    showDetail(`<header class="task-heading"><div class="eyebrow">${esc(taskCategory(t))}</div>
        <h1>${esc(taskDisplayTitle(t))}</h1>${taskContextLabel(t)?`<p class="task-caption">${esc(taskContextLabel(t))}</p>`:''}
        ${showState?`<p class="task-state">${esc(workflowLabel(t))}</p>`:''}</header>
        ${t.demo_model ? `<div class="banner">${tr('Демонстрационное изменение правила. Не официальное обновление вуза.', 'Demonstration rule change. This is not an official university update.')}</div>` : ''}
        ${!past&&(t.availability_reason_i18n||t.waiting_i18n)?`<div class="task-context">${[...new Set([content(t.availability_reason_i18n),content(t.waiting_i18n)].filter(Boolean))].map(text=>`<p>${esc(text)}</p>`).join('')}</div>`:''}
        ${!past&&(missing.length||t.engine_status==='needs_review')?`<section class="task-attention"><h2>${tr('Что нужно уточнить','What needs clarification')}</h2><p>${esc(content(t.eligibility_reason))}</p>${missing.length?`<p>${esc(missing.map(fieldName).join(', '))}</p><button class="secondary wide" id="detail-profile">${t.engine_status==='conditional'&&missing.length&&missing.every(k=>editableFields().includes(k))?tr('Дополнить данные','Complete information'):tr('Как уточнить в отделе','How to check with the office')}</button>`:''}</section>`:''}
        ${past?'':`<section class="task-section ${t.dates.length?'task-timing':'task-no-date'}"><h2>${tr('Когда выполнить','When to act')}</h2>
        ${t.dates.length?t.dates.map(d=>taskDateDetails(d,kinds)).join(''):`<p>${tr('Точный срок в инструкции не указан.','The instructions do not specify an exact time.')}</p>`}
        </section>`}
        <section class="task-section">${past?'':`<h2>${tr('Что нужно сделать','What to do')}</h2>`}<p class="task-instruction">${esc(taskInstruction(t))}</p>${!past&&content(t.performer_i18n)?`<p class="task-caption">${tr('Кто выполняет','Who acts')}: ${esc(content(t.performer_i18n))}</p>`:''}</section>
        ${past?'':taskSupportingSections(t,true)}
        ${canReport||t.completion_basis==='reported_fact'||t.engine_status==='superseded'||t.engine_status==='requires_recheck'?`<section class="task-section task-result"><h2>${canReport?tr('Сообщить результат','Report a result'):tr('Сохранённый результат','Recorded result')}</h2>
        ${resultControls}
        ${t.completion_basis === 'reported_fact' || t.engine_status === 'superseded' ? `<button class="secondary wide" id="detail-history">${tr('Открыть историю','Open history')}</button>` : ''}
        ${!statusLocked && t.user_status === 'completed' && RoadmapView.hero(plan.tasks) ? `<button class="primary wide" id="detail-next">${tr('Следующее действие','Next action')}</button>` : ''}
        ${t.engine_status === 'requires_recheck' ? `<button class="primary wide" id="detail-confirm-event">${tr('Сообщить новое подтверждение', 'Record new confirmation')}</button>` : ''}
        </section>`:''}
        <button class="task-reference-link" id="detail-reference"><span class="task-reference-icon">${icon('info',22)}</span><span><strong>${tr('Об этой рекомендации','About this recommendation')}</strong><small>${tr('Почему она в плане и на какие источники опирается','Why it is in your plan and the sources behind it')}</small></span>${icon('chevron',18)}</button>
        `);
    document.querySelector('#detail-reference').onclick=()=>navigate({name:'task-info',key:t.task_key,...(route.snapshot?{snapshot:route.snapshot}:{})});
    document.querySelector('#detail-history')?.addEventListener('click',()=>navigate({name:'history'}));
    document.querySelector('#detail-next')?.addEventListener('click',()=>taskDetail(RoadmapView.hero(plan.tasks).task_key));
    document.querySelector('#detail-confirm-event')?.addEventListener('click', () => eventForm(t.family==='M04'||t.family==='M08'?'registration_confirmed':t.family==='M07'?'visa_issued':'address_changed'));
    document.querySelector('#detail-profile')?.addEventListener('click', () => resolveTask(t));
    wireWorkflow(t);
    document.querySelector('[data-medical-completed]')?.addEventListener('click',()=>eventForm('medical_completed'));
    document.querySelector('[data-fingerprinting-completed]')?.addEventListener('click',()=>eventForm('fingerprinting_completed'));
    document.querySelectorAll('[data-status]').forEach(b => b.onclick = guard(async () => {
        await api('/me/tasks/' + encodeURIComponent(key) + '/status', 'PATCH', {status: b.dataset.status});
        plan = await api('/me/roadmap');
        paintRoute();
        toast(tr('Статус сохранён', 'Status saved'));
    }));
}
const fieldLabels = {
    age_band: ['Возраст', 'Age'],
    citizenship: ['Гражданство', 'Citizenship'],
    migration_basis: ['Основание пребывания', 'Basis for your stay'],
    study_status: ['Учебный статус', 'Study status'],
    entry_purpose: ['Какая цель указана в документах о въезде?', 'What purpose is recorded in your entry documents?'],
    stay_over_90_days: ['Планируете находиться в России больше 90 дней?', 'Do you plan to stay in Russia for more than 90 days?'],
    fingerprinting_completed: ['Вы уже проходили дактилоскопию — сдавали отпечатки пальцев?', 'Have you already had your fingerprints taken?'],
    visa_expiry: ['Окончание визы', 'Visa expiry'],
    visa_regime: ['Въезд по визе или без визы', 'Visa or visa-free entry'],
    registration_expiry: ['Окончание регистрации', 'Registration expiry'],
    residence_type: ['Тип жилья', 'Residence'],
    host_and_registration_effect: ['Кто оформляет регистрацию в вашем случае и нужно ли обновить прежние документы', 'Who arranges registration in your case and whether previous documents need updating'],
    support_envelope: ['Категория вне автоматической поддержки', 'Category outside automatic support'],
    country_exemptions_and_legal_applicability: ['Договоры, исключения и применимость', 'Treaties, exemptions and applicability'],
    event_legal_effect: ['Правовой эффект события', 'Legal effect']
};

function selectField(name, label, options, value) {
    return `<label class="field">${esc(label)}<select name="${name}">${options.map(([v,l])=>option(v,l,value)).join('')}</select></label>`
}

function eventFormView(type, original = null, candidateId = null) {
    const effective = plan.effective_profile || profile;
    let payload = original?.payload || {};
    let fields = '';
    if (['entry_recorded', 'reentry_recorded'].includes(type)) {
        fields += selectField('entry_purpose', tr(...fieldLabels.entry_purpose), fieldChoices('entry_purpose'), payload.entry_purpose || 'unknown');
        fields += selectField('visa_regime', tr('Вы въехали по визе или без визы?', 'Did you enter Russia with or without a visa?'), fieldChoices('visa_regime'), payload.visa_regime || effective.visa_regime);
        const arrival = payload.arrival_at ? new Date(new Date(payload.arrival_at).getTime()+3*60*60*1000).toISOString().slice(0,19) : '';
        fields += field('arrival_at',tr('Время прибытия (МСК, если известно)','Arrival time (MSK, if known)'),'datetime-local',arrival,'step="1"');
    }
    if (['entry_recorded', 'reentry_recorded', 'address_changed', 'registration_confirmed'].includes(type)) {
        const residence = payload.residence_type || effective.residence_type;
        fields += `<label class="field">${type==='address_changed'?tr('Куда вы переехали?','Where have you moved?'):tr('Где вы живёте?','Where do you live?')}<select name="residence_type" required>${!residence || residence==='unknown'?`<option value="" selected disabled>${tr('Выберите тип жилья','Choose residence type')}</option>`:''}${residenceOptions(residence).replace(/<option value="unknown"[^>]*>.*?<\/option>/,'')}</select></label>`;
    }
    if (type === 'visa_issued') fields += field('visa_expiry', tr('Окончание новой визы', 'New visa expiry'), 'date', payload.visa_expiry || '', 'required');
    if (type === 'registration_confirmed') fields += field('registration_expiry', tr('Окончание новой регистрации', 'New registration expiry'), 'date', payload.registration_expiry || '', 'required');
    if (type === 'registration_confirmed') fields += field('stay_expiry', tr('Окончание пребывания (если известно)', 'Permitted stay expiry (if known)'), 'date', payload.stay_expiry || '');
    if (type === 'status_changed') fields += selectField('status', tr('Новое основание пребывания', 'New basis for your stay'), fieldChoices('migration_basis'), payload.status || 'unknown');
    if (type === 'enrolment_changed') fields += selectField('status', tr('Новый учебный статус', 'New study status'), [['',tr('Выберите ответ','Choose an answer')],...fieldChoices('study_status').filter(([v])=>v!=='unknown')], payload.status || '').replace('<select ', '<select required ');
    showDetail(`<h2>${original?tr('Исправить событие: ','Correct event: '):''}${esc(tr(...eventNames[type]))}</h2>${candidateId?`<div class="banner">${tr('Мы подобрали форму по вашему описанию. Проверьте, подходит ли она, и укажите дату и сведения. План изменится после подтверждения.','We chose a form based on your description. Check that it fits and add the date and details. Your plan changes after confirmation.')}</div>`:''}<form id="event-form"><div class="fields">${field('occurred_at',tr('Когда это произошло?','When did it happen?'),'date',original?.occurred_at||'',`required max="${today()}"`)}${fields}</div>${type === "address_changed" ? `<label class="checkbox" data-same-place-row hidden><input type="checkbox" data-same-place>${tr("Подтверждаю переезд на другой адрес того же типа жилья", "I moved to another address with the same residence type")}</label>` : ""}<p class="privacy">${tr('Событие — ваш собственный отчёт. Не вводите номера документов, адрес или результаты медицинских исследований.','This is your own report. Do not enter document numbers, exact addresses or medical results.')}</p><label class="checkbox"><input type="checkbox" required>${tr('Подтверждаю указанное событие, дату и данные','I confirm the event, date and details')}</label><div class="actions"><button class="primary" type="submit">${original?tr('Сохранить исправление','Save correction'):tr('Сохранить событие','Save event')}</button></div></form>`);

    const form=document.querySelector('#event-form');
    if(type==='address_changed') {
        const priorResidence=payload.from_residence_type||effective.residence_type;
        const updateSamePlace=()=>{
            const row=form.querySelector('[data-same-place-row]'),box=form.querySelector('[data-same-place]');
            const same=!!priorResidence&&priorResidence!=='unknown'&&form.querySelector('[name=residence_type]').value===priorResidence;
            row.hidden=!same;box.required=same;if(!same)box.checked=false;
        };
        form.addEventListener('input',updateSamePlace);form.addEventListener('change',updateSamePlace);updateSamePlace();
    }
    const key = route.submissionKey ||= crypto.randomUUID();
    writeLocation(true);
    document.querySelector('#event-form').onsubmit = guard(async e => {
        e.preventDefault();
        if (!e.currentTarget.reportValidity()) return;
        const d = Object.fromEntries(new FormData(e.currentTarget));
        if (type === 'address_changed' && d.residence_type === (payload.from_residence_type || effective.residence_type) && !e.currentTarget.querySelector('[data-same-place]')?.checked) throw Error(tr('Подтвердите переезд в другое место того же типа.', 'Confirm a move to another place of the same type.'));
        const p = {
            ...d
        };
        delete p.type;
        delete p.occurred_at;
        if('arrival_at' in p) {if(p.arrival_at)p.arrival_at += (p.arrival_at.length===16?':00':'')+'+03:00';else delete p.arrival_at;}
        if('stay_expiry' in p && !p.stay_expiry)delete p.stay_expiry;
        if (type === 'address_changed') p.from_residence_type = payload.from_residence_type || effective.residence_type || 'unknown';
        let body = {
            type,
            occurred_at: d.occurred_at,
            payload: p,
            idempotency_key: key,
            confirmed: true,
            ...(original ? {
                supersedes_event_id: original.id
            } : {})
        };
        let saved;
        try {
        if (candidateId) {
            delete body.type;
            saved = await api('/me/candidates/' + candidateId + '/confirm', 'POST', body)
        } else saved = await api('/me/events', 'POST', body);
        } catch (error) {
            if (!(error instanceof TypeError) && error.name !== 'TimeoutError') throw error;
            const events = await api('/me/events');
            const recorded = events.events.find(event => event.idempotency_key === key);
            if (!recorded) throw error;
            const revisions = await api('/me/history');
            const revision = revisions.revisions.find(r => r.trigger_id === recorded.id);
            saved = {event_id: recorded.id, revision_id: revision?.id};
        }
        clearFormDraft(); dirty = false;
        await refreshSnapshot();
        navigate({name: 'result', eventId: saved.event_id, revision: saved.revision_id, reason: original ? 'event_corrected' : type}, true);
        toast(tr('Событие сохранено. План обновлён.', 'Event saved. Roadmap updated.'))
    });

}
function reasonLabel(r) {
    const resultReasons={onboarding_confirmed:['Начальные сведения подтверждены','Initial information confirmed'],result_reported:['Результат сохранён','Result saved'],result_corrected:['Результат исправлен','Result corrected'],result_retracted:['Результат отменён','Result retracted']};
    if(resultReasons[r])return tr(...resultReasons[r]);
    return r in eventNames ? tr(...eventNames[r]) : ({
        profile_updated: tr('Уточнение данных', 'Profile updated'),
        event_corrected: tr('Исправление события', 'Event corrected'),
        event_retracted: tr('Отмена события', 'Event retracted'),
        user_status_changed: tr('Ваш статус действия', 'Task status changed'),
        university_rule_published: tr('Опубликована версия правила вуза', 'University rule version published'),
        university_rule_archived: tr('Правило архивировано', 'Rule archived'),
        time_refresh: tr('Обновление по времени', 'Time refresh'),
        rule_effective: tr('Вступила в силу версия правила', 'A rule version became effective')
    })[r] || r
}
async function start() {
    config = await api('/config');
    const outer = new URLSearchParams(location.hash.slice(1));
    let init = window.WebApp?.initData || outer.get('WebAppData');
    if (init) {
        const previousToken=token, previousScope=onboardingScope;
        const auth = await api('/auth/max', 'POST', {
            init_data: init
        });
        token = auth.access_token;
        // This signed user field is read only after the server verified launch data.
        // A stable scope keeps the session draft when MAX rotates its bearer token.
        const signedUser = JSON.parse(new URLSearchParams(init).get('user') || '{}');
        onboardingScope = signedUser.id != null ? 'max_' + signedUser.id : null;
        if(previousScope && previousScope===onboardingScope)migrateFormDrafts(previousToken);
        if (onboardingScope) sessionStorage.setItem('ryadom_onboarding_scope_' + token, onboardingScope);
        sessionStorage.setItem('student_token', token);
        window.WebApp?.ready?.()
    }
    if (token) {
        try {
            await load();
            return
        } catch (e) {
            if(token || init)throw e;
            toast(e.message)
        }
    }
    await landing()
}
