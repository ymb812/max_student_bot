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
    lang = 'ru',
    step = -1;
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
    entry_recorded: ['Я въехал в Россию', 'I entered Russia'],
    reentry_recorded: ['Я вернулся в Россию', 'I re-entered Russia'],
    address_changed: ['Я сменил адрес', 'I changed residence'],
    hotel_stay_started: ['Я заселился в гостиницу', 'I checked into a hotel'],
    hotel_stay_ended: ['Я выехал из гостиницы', 'I left a hotel'],
    visa_issued: ['Я получил новую визу', 'I received a new visa'],
    registration_confirmed: ['У меня новая регистрация', 'I have a new registration'],
    medical_completed: ['Я прошёл медосмотр', 'I completed a medical examination'],
    fingerprinting_completed: ['Я прошёл дактилоскопию', 'I completed fingerprinting'],
    passport_replaced: ['Я заменил паспорт', 'I replaced my passport'],
    status_changed: ['Изменилось основание пребывания', 'My migration status changed'],
    enrolment_changed: ['Изменился учебный статус', 'My study status changed']
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
            token = null
        }
        const error = Error(typeof e.detail === 'string' ? e.detail : tr('Проверьте поля формы. Данные не сохранены.', 'Check the form fields. Data was not saved.'));
        error.status = response.status;
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
            const message = err.name === 'TimeoutError' || err instanceof TypeError ? tr('Не удалось получить ответ. Проверьте историю и повторите действие.', 'No response received. Check the history and retry the action.') : err.message;
            const form = b?.closest('form') || root.querySelector('#event-form,#field-form,#onboard-form');
            if (form) {
                let error = form.querySelector('.form-error');
                if (!error) {error = document.createElement('p'); error.className='form-error'; error.setAttribute('role','alert'); form.append(error);}
                error.textContent = message;
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

async function switchLanguage() {
    const nextLanguage = lang === 'ru' ? 'en' : 'ru';
    if (profile.consent) {
        profile = await api('/me/profile', 'PATCH', {...profile,language:nextLanguage});
        await refreshSnapshot();
    }
    else saveOnboardDraft();
    lang=nextLanguage;
    profile.consent ? paintRoute() : renderOnboarding()
}

async function load() {
    profile = await api('/me/profile');
    lang = profile.language;
    plan = await api('/me/roadmap');
    profile.consent ? renderPlan() : renderOnboarding();
    window.scrollTo(0, 0)
}

function option(value, label, selected) {
    return `<option value="${esc(value)}" ${value===selected?'selected':''}>${esc(label)}</option>`
}

function field(name, label, type = 'text', value = '', extra = '') {
    return `<label class="field">${esc(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`
}

function residenceOptions(selected) {
    return [
        ['unknown', tr('Не знаю', 'Not sure')],
        ['dorm', tr('Общежитие', 'Dormitory')],
        ['private', tr('Частный адрес', 'Private accommodation')],
        ['other', tr('Другое', 'Other')]
    ].map(([v, l]) => option(v, l, selected)).join('')
}

function renderOnboarding() {
    if (step < 0) { landing(); return; }
    window.scrollTo(0, 0);
    let html = '';
    const steps = [tr('Выберите язык', 'Choose your language'), tr('Выберите ваш вуз', 'Choose your university'), tr('Как вы въезжаете в Россию?', 'How are you entering Russia?'), tr('Данные для первого маршрута', 'Your first roadmap')];
    if (step === 0) html = `<div class="choices"><button class="choice ${lang==='ru'?'selected':''}" data-lang="ru">Русский<small>План и уведомления на русском</small></button><button class="choice ${lang==='en'?'selected':''}" data-lang="en">English<small>Your roadmap and notifications in English</small></button></div>`;
    if (step === 1) html = `<div class="choices"><button class="choice ${profile.university_id==='sutd'?'selected':''}" data-university="sutd">СПбГУПТД<small>${tr('Санкт-Петербургский государственный университет промышленных технологий и дизайна','Saint Petersburg State University of Industrial Technologies and Design')}</small></button><button class="choice ${profile.university_id==='leti'?'selected':''}" data-university="leti">ЛЭТИ<small>${tr('Санкт-Петербургский государственный электротехнический университет «ЛЭТИ»','Saint Petersburg Electrotechnical University LETI')}</small></button></div>`;
    if (step === 2) html = `<p class="sub">${tr('Этот ответ помогает выбрать локальный порядок. Гражданство и договорные исключения проверяются отдельно.','This selects a local route. Citizenship and treaty exemptions are checked separately.')}</p><div class="choices">${[['visa',tr('Учебная виза','Study visa')],['visa_free',tr('Безвизовый въезд','Visa-free entry')],['unknown',tr('Другое / не знаю','Other / not sure')]].map(([v,l])=>`<button class="choice ${profile.visa_regime===v?'selected':''}" data-regime="${v}">${l}</button>`).join('')}</div>`;
    if (step === 3) html = `<div class="segmented"><button type="button" data-arrival="arrived" class="${arrivalMode==='arrived'?'active':''}">${tr('Уже въехал', 'Already arrived')}</button><button type="button" data-arrival="planned" class="${arrivalMode==='planned'?'active':''}">${tr('Планирую въезд', 'Planning arrival')}</button></div><form id="onboard-form"><div class="fields">${field('entry_at',tr('Фактическая дата въезда, если уже приехали','Actual entry date, if already arrived'),'date',profile.entry_at||'',`max="${today()}"`)}${field('planned_entry',tr('Планируемая дата, если ещё не приехали','Planned entry date, if not yet arrived'),'date',profile.planned_entry||'')}<label class="field">${tr('Где вы живёте?','Where do you live?')}<select name="residence_type">${residenceOptions(profile.residence_type)}</select></label>${profile.visa_regime==='visa'?field('visa_expiry',tr('Окончание визы, если известно','Visa expiry, if known'),'date',profile.visa_expiry||''):''}</div><p class="sub">${tr('Неизвестные поля можно оставить пустыми. Уточните их позднее в разделе «Мои данные».','You can leave unknown fields blank and add them later in My information.')}</p><label class="checkbox"><input type="checkbox" name="consent" required><span>${tr('Согласен на хранение в этом сервисе вуза, дат и статусов процедур для построения плана. Без сканов, номеров паспортов, точного адреса и медицинских результатов. Удалить данные можно в профиле. Срок хранения после последней активности:','I agree to storage of my university, dates and procedure statuses for this roadmap. No scans, passport numbers, exact addresses or medical results. Delete data from your profile. Retention after last activity:')} ${config.privacy_retention_days} ${tr('дней.','days.')}</span></label></form>`;
    root.innerHTML = shell(`<div class="onboard"><div class="eyebrow">${tr('Знакомство','Getting started')} · ${step+1}/4</div><div class="steps">${[0,1,2,3].map(i=>`<span class="${i<=step?'active':''}"></span>`).join('')}</div><div class="onboard-art" aria-hidden="true">${step===0?'<span class="language-bubble">A</span><span class="language-bubble second">Я</span>':icon(['info','university','passport','calendar'][step],48)}</div><h1>${steps[step]}</h1>${html}<div class="actions">${step>=0?`<button class="secondary" id="back">${tr('Назад','Back')}</button>`:''}<button class="primary" id="next">${step===3?tr('Построить мой план →','Build my roadmap →'):tr('Продолжить →','Continue →')}</button></div></div>`);
    wireShell();
    if (step === 3) {
        const f = document.querySelector('#onboard-form');
        f.elements.entry_at.closest('label').hidden = arrivalMode !== 'arrived';
        f.elements.planned_entry.closest('label').hidden = arrivalMode !== 'planned';
        document.querySelectorAll('[data-arrival]').forEach(b => b.onclick = () => { saveOnboardDraft(); arrivalMode = b.dataset.arrival; renderOnboarding(); });
    }
    document.querySelectorAll('[data-lang]').forEach(b => b.onclick = () => {
        lang = b.dataset.lang;
        profile.language = lang;
        renderOnboarding()
    });
    document.querySelectorAll('[data-university]').forEach(b => b.onclick = () => {
        profile.university_id = b.dataset.university;
        renderOnboarding()
    });
    document.querySelectorAll('[data-regime]').forEach(b => b.onclick = () => {
        profile.visa_regime = b.dataset.regime;
        renderOnboarding()
    });
    document.querySelector('#back')?.addEventListener('click', () => {
        saveOnboardDraft();
        step--;
        renderOnboarding()
    });
    document.querySelector('#next').addEventListener('click', guard(async () => {
        if (step === 1 && !profile.university_id) throw Error(tr('Выберите вуз', 'Choose a university'));
        if (step < 3) {
            step++;
            renderOnboarding();
            return
        }
        const form = document.querySelector('#onboard-form');
        if (!form.reportValidity()) return;
        const data = Object.fromEntries(new FormData(form));
        profile = {
            ...profile,
            language: lang,
            consent: true,
            entry_at: arrivalMode === 'arrived' ? data.entry_at || null : null,
            planned_entry: arrivalMode === 'planned' ? data.planned_entry || null : null,
            residence_type: data.residence_type,
            visa_expiry: profile.visa_regime === 'visa' ? data.visa_expiry || null : null
        };
        const enteredAt = profile.entry_at;
        profile = await api('/me/profile', 'PATCH', {...profile, entry_at: null});
        if (enteredAt && profile.residence_type !== 'unknown') {
            await api('/me/events', 'POST', {type:'entry_recorded', occurred_at:enteredAt,
                payload:{residence_type:profile.residence_type,visa_regime:profile.visa_regime,entry_purpose:profile.entry_purpose},
                confirmed:true,idempotency_key:onboardingEventKey});
        } else if (enteredAt) profile = await api('/me/profile', 'PATCH', {...profile,entry_at:enteredAt});
        await load()
    }))
}

function taskTiming(t) {
    const dates = t.dates.filter(d => d.kind !== 'document_expiry');
    return dates.find(d => d.computed_at) || dates[0] || null;
}

function taskDate(t) {
    const timing = taskTiming(t);
    return timing?.computed_at ? formatDate(timing.computed_at) : timing ? tr('Срок уточнить в офисе', 'Confirm timing with office') : tr('Без отдельного срока', 'No separate deadline');
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
    if (timing.kind === 'preparation_start') return tr('Начало подготовки', 'Start preparing');
    if (timing.required_or_recommended === 'recommended_by_university') return tr('Рекомендация вуза', 'University recommendation');
    if (timing.kind === 'preparation_start') return tr('Начало подготовки', 'Start preparing');
    if (timing.kind === 'legal_deadline') return tr('Государственный срок', 'Statutory deadline');
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
        unspecified: tr('Характер срока уточнить в офисе', 'Confirm timing requirements with the office'),
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

function taskDetailView(key) {
    const t = route.snapshot || plan.tasks.find(t => t.task_key === key);
    if (!t) return;
    const kinds = {
        legal_deadline: ['Государственный срок', 'Statutory deadline'],
        university_submission_deadline: ['Обращение в вуз', 'University submission'],
        preparation_start: ['Начало подготовки', 'Preparation start'],
        document_expiry: ['Окончание документа', 'Document expiry']
    };
    const fieldName = k => fieldLabels[k] ? tr(...fieldLabels[k]) : k;
    const statusLocked = t.engine_status !== 'actionable' || t.completion_basis === 'reported_fact';
    showDetail(`<div class="eyebrow">${esc(taskCategory(t))} · ${tr('Версия', 'Version')} ${t.rule_version}</div>
        <h2>${esc(content(t.title_i18n))}</h2>
        ${t.demo_model ? `<div class="banner">${tr('Демонстрационное изменение правила. Не официальное обновление вуза.', 'Demonstration rule change. This is not an official university update.')}</div>` : ''}
        ${t.engine_status !== 'actionable' ? `<span class="tag review">${tr(...states[t.engine_status])}</span>` : ''}
        <p class="detail-action">${esc(content(t.action_i18n))}</p>
        <div class="detail-label">${tr('Мой статус', 'My status')}</div>${statusLocked ? `<p class="user-status ${t.user_status}">${tr(...statuses[t.user_status])}</p><p class="privacy">${lockedStatusReason(t)}</p>` : `<div class="status-control" aria-label="${tr('Мой статус', 'My status')}">${Object.entries(statuses).map(([v,s])=>`<button aria-pressed="${t.user_status===v}" data-status="${v}">${tr(...s)}</button>`).join('')}</div>`}
        <section class="detail-section"><h3 class="detail-label">${tr('Сроки', 'Dates and timing')}</h3><p class="privacy">${tr('Все даты — по московскому времени.', 'All dates use Moscow time.')}</p>
        ${t.dates.length ? t.dates.map(d=>`<div class="time-row"><strong>${tr(...kinds[d.kind])} · ${d.owner==='university'?tr('Вуз','University'):d.owner==='state'?tr('Государство','State'):tr('Пользователь','User')}</strong><br>${esc(content(d.literal))}<br>${d.computed_at?`<b>${formatDate(d.computed_at)}</b>`:tr('Точная дата не рассчитана','Exact date has not been calculated')} · ${esc(unitLabel(d.unit))}<br>${esc(timingLabel(d.required_or_recommended))}</div>`).join('') : `<p class="detail-text">${tr('Отдельного числового срока у этого шага нет.', 'This task has no separate numeric deadline.')}</p>`}</section>
        <section class="detail-section"><h3 class="detail-label">${tr('Что подготовить', 'What to prepare')}</h3><ul class="detail-text">${content(t.documents_i18n).map(d=>`<li>${esc(d)}</li>`).join('')}</ul><p class="privacy">${tr('Документы в приложение загружать не нужно.', 'You do not need to upload documents here.')}</p>
        <h3 class="detail-label">${tr('Куда обратиться', 'Where to go')}</h3><p class="detail-text">${esc(t.contact)}</p></section>
        <details class="disclosure" ${t.missing_fields.length ? 'open' : ''}><summary>${tr('Почему это в моём плане', 'Why this is in my plan')}</summary><p class="detail-text">${esc(content(t.eligibility_reason))}</p>
        ${t.missing_fields.length ? `<p class="privacy">${tr('Что нужно уточнить', 'What needs clarification')}: ${esc(t.missing_fields.map(fieldName).join(', '))}</p><button class="secondary" id="detail-profile">${tr('Уточнить мои данные', 'Complete my information')}</button>` : ''}</details>
        <details class="disclosure"><summary>${tr('Источники и проверка', 'Sources and verification')}</summary>${t.source_snapshot.map(s=>`<div class="source"><a href="${esc(s.official_url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><br>${esc(sourceLabel(s.source_type))} · ${tr('Проверено','Checked')}: ${formatDate(s.checked_at)}</div>`).join('')}
        <p class="privacy">${tr('Подтверждение нормы', 'Norm verification')}: ${esc(confidenceLabel(t.norm_confidence))}<br>${tr('Применимость к вам', 'Applicability to you')}: ${esc(confidenceLabel(t.eligibility_confidence))}<br>${tr('Формула срока', 'Timing formula')}: ${esc(confidenceLabel(t.formula_confidence))}</p></details>
        ${!statusLocked && t.user_status !== 'completed' ? `<button class="primary wide" data-status="completed">${t.family === 'M07' ? tr('Отметить, что передал(а) документы', 'Mark documents as submitted') : tr('Отметить как выполненное', 'Mark as completed')}</button>` : ''}
        ${t.engine_status === 'requires_recheck' ? `<button class="primary wide" id="detail-confirm-event">${tr('Сообщить новое подтверждение', 'Record new confirmation')}</button>` : ''}
        <p class="privacy">${tr('«Выполнено» — ваша отметка о действии. Получение нового документа сообщите отдельным событием.', '“Completed” is your report of an action. Record a newly issued document as a separate event.')}</p>`);
    document.querySelector('#detail-confirm-event')?.addEventListener('click', () => eventForm(t.family==='M04'||t.family==='M08'?'registration_confirmed':t.family==='M07'?'visa_issued':'address_changed'));
    document.querySelector('#detail-profile')?.addEventListener('click', () => { modal.close(); renderProfile(); });
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
    migration_basis: ['Основание пребывания', 'Migration grounds'],
    study_status: ['Учебный статус', 'Study status'],
    entry_purpose: ['Цель въезда', 'Entry purpose'],
    stay_over_90_days: ['Пребывание >90 дней', 'Stay >90 days'],
    fingerprinting_completed: ['Дактилоскопия', 'Fingerprinting'],
    visa_expiry: ['Окончание визы', 'Visa expiry'],
    visa_regime: ['Режим въезда', 'Entry regime'],
    registration_expiry: ['Окончание регистрации', 'Registration expiry'],
    residence_type: ['Тип жилья', 'Residence'],
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
        fields += selectField('entry_purpose', tr('Цель въезда', 'Entry purpose'), [
            ['unknown', tr('Не знаю', 'Not sure')],
            ['study', tr('Учёба', 'Study')],
            ['other', tr('Другая', 'Other')]
        ], payload.entry_purpose || 'unknown');
        fields += selectField('visa_regime', tr('Режим въезда', 'Entry regime'), [
            ['unknown', tr('Не знаю', 'Not sure')],
            ['visa', tr('По визе', 'Visa')],
            ['visa_free', tr('Безвизовый', 'Visa-free')]
        ], payload.visa_regime || effective.visa_regime)
    }
    if (['entry_recorded', 'reentry_recorded', 'address_changed', 'registration_confirmed'].includes(type)) fields += `<label class="field">${tr('Тип жилья','Residence')}<select name="residence_type">${residenceOptions(payload.residence_type||effective.residence_type).replace(/<option value="unknown"[^>]*>.*?<\/option>/,'')}</select></label>`;
    if (type === 'visa_issued') fields += field('visa_expiry', tr('Окончание новой визы', 'New visa expiry'), 'date', payload.visa_expiry || '', 'required');
    if (type === 'registration_confirmed') fields += field('registration_expiry', tr('Окончание новой регистрации', 'New registration expiry'), 'date', payload.registration_expiry || '', 'required');
    if (type === 'status_changed') fields += selectField('status', tr('Новое основание', 'New grounds'), [
        ['unknown', tr('Не знаю', 'Not sure')],
        ['study', tr('Учёба', 'Study')],
        ['rvpo', 'РВПО'],
        ['rvp', 'РВП'],
        ['residence_permit', 'ВНЖ']
    ], payload.status || 'unknown');
    if (type === 'enrolment_changed') fields += selectField('status', tr('Новый учебный статус', 'New study status'), [
        ['active', tr('Учусь', 'Active')],
        ['leave', tr('Академический отпуск', 'Leave')],
        ['transferred', tr('Перевод', 'Transfer')],
        ['expelled', tr('Отчислен', 'Expelled')],
        ['graduated', tr('Выпуск', 'Graduated')],
        ['working', tr('Работа', 'Working')]
    ], payload.status || 'active');
    showDetail(`<h2>${tr(original?'Исправить событие':'Что изменилось?',original?'Correct an event':'What changed?')}</h2>${candidateId?`<div class="banner">${tr('Предложенная интерпретация. Проверьте тип, выберите точную дату и заполните поля. План изменится только после подтверждения.','Proposed interpretation. Verify the type, choose the exact date and fill in the fields. The roadmap changes only after confirmation.')}</div>`:''}<form id="event-form">${selectField('type',tr('Событие','Event'),Object.entries(eventNames).map(([v,s])=>[v,tr(...s)]),type)}<div class="fields">${field('occurred_at',tr('Когда это произошло?','When did it happen?'),'date',original?.occurred_at||'',`required max="${today()}"`)}${fields}</div>${type === "address_changed" ? `<label class="checkbox"><input type="checkbox" data-same-place>${tr("Переезд в другое место того же типа (если тип жилья не изменился)", "I moved to another place of the same type (if residence type is unchanged)")}</label>` : ""}<p class="privacy">${tr('Событие — ваш собственный отчёт. Не вводите номера документов, адрес или результаты медицинских исследований.','This is your own report. Do not enter document numbers, exact addresses or medical results.')}</p><label class="checkbox"><input type="checkbox" required>${tr('Подтверждаю указанное событие, дату и данные','I confirm the event, date and details')}</label><div class="actions"><button class="primary" type="submit">${tr('Подтвердить и обновить план','Confirm and update roadmap')}</button></div></form>${!original?`<div class="detail-label">${tr('Можно описать событие словами','You can describe the event in words')}</div><textarea id="event-text" maxlength="1500" placeholder="${tr('Например: я переехал. Без личных данных.','For example: I moved. No personal information.')}"></textarea><button class="secondary" id="parse-event">${tr('Предложить форму','Suggest a form')}</button>`:''}`);
    root.querySelector('[name=type]').disabled = true;
    const key = crypto.randomUUID();
    document.querySelector('#event-form').onsubmit = guard(async e => {
        e.preventDefault();
        if (!e.currentTarget.reportValidity()) return;
        const d = Object.fromEntries(new FormData(e.currentTarget));
        if (type === 'address_changed' && d.residence_type === effective.residence_type && !e.currentTarget.querySelector('[data-same-place]')?.checked) throw Error(tr('Подтвердите переезд в другое место того же типа.', 'Confirm a move to another place of the same type.'));
        const p = {
            ...d
        };
        delete p.type;
        delete p.occurred_at;
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
        dirty = false;
        await refreshSnapshot();
        navigate({name: 'result', eventId: saved.event_id, revision: saved.revision_id, reason: original ? 'event_corrected' : type}, true);
        toast(tr('Событие сохранено. План обновлён.', 'Event saved. Roadmap updated.'))
    });
    document.querySelector('#parse-event')?.addEventListener('click', guard(async () => {
        const r = await api('/me/candidates', 'POST', {
            text: document.querySelector('#event-text').value
        });
        if (r.candidate) eventForm(r.candidate.type, null, r.candidate_id);
        else toast(tr('Не удалось однозначно определить событие. Выберите тип в форме.', 'Could not identify a single event. Choose the type in the form.'))
    }))
}
function reasonLabel(r) {
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
        const auth = await api('/auth/max', 'POST', {
            init_data: init
        });
        token = auth.access_token;
        sessionStorage.setItem('student_token', token);
        window.WebApp?.ready?.()
    }
    if (token) {
        try {
            await load();
            const startParam = window.WebApp?.initDataUnsafe?.start_param; /* navigation only, never identity */
            if (startParam?.startsWith('task_')) {
                const t = plan.tasks.find(t => t.deep_link_id === startParam.slice(5));
                if (t) taskDetail(t.task_key); else toast(tr('Задача больше недоступна. Открыт актуальный план.', 'Task unavailable. Showing the current plan.'))
            }
            return
        } catch (e) {
            toast(e.message)
        }
    }
    landing()
}
