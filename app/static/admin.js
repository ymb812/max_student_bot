const root = document.querySelector('#app'),
    modal = document.querySelector('#modal');
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
} [c]));
let token = sessionStorage.getItem('editor_token'),
    rules = [],
    tenant = 'sutd',
    publications = [],
    notifications = [];

function toast(msg) {
    const t = document.querySelector('#toast');
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(() => t.style.display = 'none', 5000)
}
async function api(path, method = 'GET', body) {
    const r = await fetch('/api' + path, {
        method,
        signal: AbortSignal.timeout(15000),
        headers: {
            'Content-Type': 'application/json',
            ...(token ? {
                Authorization: 'Bearer ' + token
            } : {})
        },
        ...(body ? {
            body: JSON.stringify(body)
        } : {})
    });
    if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw Error(typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail))
    }
    return r.json()
}

function guard(fn) {
    return async e => {
        const b = e?.currentTarget;
        const buttons = b?.tagName === 'BUTTON' ? [b] : b?.tagName === 'FORM' ? [...b.querySelectorAll('button[type=submit],button:not([type])')] : [];
        buttons.forEach(b => b.disabled = true);
        try {
            await fn(e)
        } catch (e) {
            toast(e.message)
        } finally {
            buttons.filter(b => b.isConnected).forEach(b => b.disabled = false)
        }
    }
}

function shell(inner) {
    return `<div class="shell admin-shell"><aside class="rail"><div class="brand"><span class="brand-mark">↗</span>рядом</div><p>Университетский редактор<br>Модельная роль сотрудника</p><div class="nav"><button class="active" id="reload">Правила вуза</button></div><div class="rail-bottom"><a href="/">Студенческое приложение ↗</a><button class="secondary" data-logout>Выйти</button></div></aside><main class="main"><div class="topbar"><span class="eyebrow">Редактор · ${tenant==='sutd'?'СПбГУПТД':tenant==='leti'?'ЛЭТИ':'Maintainer'}</span><div class="row"><span class="pill">Модельная роль</span><button data-logout>Выйти</button></div></div>${inner}</main></div>`
}

function wire() {
    document.querySelector('#reload')?.addEventListener('click', guard(load));
    document.querySelectorAll('[data-logout]').forEach(b => b.addEventListener('click', () => {
        token = null;
        sessionStorage.removeItem('editor_token');
        login()
    }))
}

function show(html) {
    modal.innerHTML = `<button class="close" id="close" aria-label="Закрыть">×</button>${html}`;
    document.querySelector('#close').onclick = () => modal.close();
    const title = modal.querySelector('h2');
    if (title) { title.id='modal-title'; modal.setAttribute('aria-labelledby','modal-title'); }
    if (!modal.open) { modal.showModal(); modal.scrollTop=0; }
}

function login() {
    root.innerHTML = shell(`<div class="onboard"><div class="eyebrow">Модельная роль сотрудника</div><h1>Вход для редактора</h1><p class="sub">Доступ ограничен одним вузом. Федеральный слой защищён. Изменения здесь демонстрационные.</p><form id="login-form"><label class="field">Ключ редактора<input type="password" name="key" required autocomplete="current-password"></label><div class="actions"><button class="primary">Войти →</button></div></form></div>`);
    wire();
    document.querySelector('#login-form').onsubmit = guard(async e => {
        e.preventDefault();
        const key = new FormData(e.currentTarget).get('key');
        const r = await api('/auth/editor', 'POST', {
            key
        });
        token = r.access_token;
        sessionStorage.setItem('editor_token', token);
        await load()
    })
}
async function load() {
    const result = await api('/admin/rules');
    rules = result.rules;
    tenant = result.tenant;
    [publications, notifications] = await Promise.all([api('/admin/publications'), api('/admin/notifications')]);
    render()
}

const ruleState = v => ({draft:'Черновик', validated:'Проверено', published:'Опубликовано', archived:'В архиве'})[v] || v;
const ruleSource = v => ({public_official:'Опубликованная инструкция', demo_model:'Демонстрационное правило', employee_confirmed:'Подтверждено сотрудником'})[v] || v;

function render() {
    root.innerHTML = shell(`<div class="hero"><div><div class="eyebrow">Каталог и публикации</div><h1>Правила вуза</h1><p class="sub">Создавайте версии правил и проверяйте, какие планы изменятся до публикации.</p></div></div><div class="banner">Роль сотрудника и изменения демонстрационные. Нет подключения к внутренним системам университетов. Публичные инструкции не заменяются произвольным демосроком.</div><div class="row"><h2>Каталог правил</h2><button class="primary" id="create">＋ Новое правило</button></div><div class="table-wrap"><table class="admin-table"><thead><tr><th>Действие</th><th>Версия</th><th>Статус</th><th>Проверка</th></tr></thead><tbody>${rules.map((r,i)=>`<tr><td><strong>${esc(r.title_i18n.ru)}</strong><br><span class="family">${r.family} · ${esc(r.rule_id)} · ${r.university_id}</span><br><span class="tag ${r.source_type==='demo_model'?'demo':''}">${esc(ruleSource(r.source_type))}</span></td><td>v${r.version}</td><td>${esc(ruleState(r.status))}</td><td><button data-inspect="${i}">Смотреть</button>${r.source_type==='demo_model'?`<button data-edit="${i}">${r.status==='draft'||r.status==='validated'?'Редактировать':'Новая версия'}</button>${r.status==='draft'||r.status==='validated'?`<button data-preview="${i}">Проверить и preview</button>`:''}${r.status==='published'?`<button data-archive="${i}">Архивировать</button>`:''}`:''}</td></tr>`).join('')}</tbody></table></div><h2>Публикации</h2>${publications.publications.length?publications.publications.map(p=>`<div class="history-row">${esc(p.rule_id)} · v${p.version} · ${p.affected_count} затронутых пользователей<br><span class="family">${esc(p.body.change_label)} · ${esc(p.created_at)}</span></div>`).join(''):`<div class="empty">Пока нет публикаций. Создайте отдельное модельное правило.</div>`}<h2>Доставка уведомлений</h2>${notifications.notifications.length?`<div class="table-wrap"><table class="admin-table"><thead><tr><th>Статус</th><th>Попыток</th><th>Ошибка / отправлено</th></tr></thead><tbody>${notifications.notifications.map(n=>`<tr><td>${esc(n.status)}</td><td>${n.attempts}</td><td>${esc(n.last_error||n.sent_at||'—')}</td></tr>`).join('')}</tbody></table></div>`:`<p class="privacy">Очередь пуста. Реальная отправка требует пользователя MAX; браузерный демопрофиль не получает сообщения.</p>`}`);
    wire();
    document.querySelector('#create').onclick = () => editForm();
    document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => editForm(rules[b.dataset.edit]));
    document.querySelectorAll('[data-preview]').forEach(b => b.onclick = guard(() => preview(rules[b.dataset.preview])));
    document.querySelectorAll('[data-inspect]').forEach(b => b.onclick = () => {
        const r = rules[b.dataset.inspect];
        show(`<h2>${esc(r.title_i18n.ru)}</h2><p class="detail-text">${esc(r.action_i18n.ru)}</p><p class="detail-text">${esc(r.contact)}</p><div class="detail-label">Временные правила</div>${r.deadline_specs.map(d=>`<div class="time-row">${esc(d.literal.ru)}<br>${esc(d.kind)} · ${esc(d.anchor_field)} · ${d.offset??'—'} · ${esc(d.unit)}</div>`).join('')}<div class="detail-label">Источники</div>${r.source_snapshot.map(s=>`<div class="source"><a href="${esc(s.official_url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a><br>${esc(s.checked_at)} · ${esc(s.source_type)}</div>`).join('')}`)
    });
    document.querySelectorAll('[data-archive]').forEach(b => b.onclick = () => {
        const r = rules[b.dataset.archive];
        show(`<h2>Архивировать модельное правило?</h2><p class="detail-text">Маршруты будут пересчитаны. Старая версия останется в истории.</p><button class="primary" id="archive-confirm">Архивировать</button>`);
        document.querySelector('#archive-confirm').onclick = guard(async () => {
            await api(`/admin/rules/${r.rule_id}/versions/${r.version}/archive`, 'POST');
            modal.close();
            await load()
        })
    })
}

function input(name, label, value = '', type = 'text', extra = '') {
    return `<label class="field">${esc(label)}<input type="${type}" name="${name}" value="${esc(value)}" ${extra}></label>`
}

function textarea(name, label, value = '') {
    return `<label class="field full">${esc(label)}<textarea name="${name}" required>${esc(value)}</textarea></label>`
}

function opts(values, selected) {
    return values.map(([v, l]) => `<option value="${v}" ${v===selected?'selected':''}>${esc(l)}</option>`).join('')
}

function editForm(rule) {
    const now = new Date().toLocaleDateString('en-CA', {
            timeZone: 'Europe/Moscow'
        }),
        id = rule?.rule_id || `demo.${tenant||'local'}.${crypto.randomUUID().slice(0,8)}`;
    const target = tenant || rule?.university_id || 'sutd';
    const spec = rule?.deadline_specs[0];
    show(`<h2>${rule?'Версия модельного правила':'Новое модельное правило'}</h2><div class="banner">Демонстрационное изменение университетского правила. Это локальное действие, без новой федеральной обязанности.</div><form id="rule-form"><div class="fields">${!tenant&&!rule?`<label class="field">Университет<select name="university_id">${opts([['sutd','СПбГУПТД'],['leti','ЛЭТИ']],target)}</select></label>`:`<input type="hidden" name="university_id" value="${target}">`}${input('rule_id','Идентификатор',id,'text',rule?'readonly':'required')}${input('semantic_action_key','Уникальное действие',rule?.semantic_action_key||id,'text','required')}<label class="field">Семейство<select name="family">${opts(['M01','M02','M03','M04','M07','M08','M09'].map(v=>[v,v]),rule?.family||'M07')}</select></label><label class="field">Режим въезда<select name="visa_regime">${opts([['','Все'],['visa','Визовый'],['visa_free','Безвизовый']],rule?.eligibility_predicate.visa_regime||'')}</select></label><label class="field">Событие-триггер<select name="trigger_type">${opts([['','Без события'],['entry_recorded','Въезд'],['reentry_recorded','Повторный въезд'],['address_changed','Смена адреса'],['visa_issued','Новая виза'],['registration_confirmed','Новая регистрация']],rule?.trigger_types[0]||'')}</select></label>${input('title_ru','Заголовок RU',rule?.title_i18n.ru||'','text','required')}${input('title_en','Заголовок EN',rule?.title_i18n.en||'','text','required')}${textarea('action_ru','Действие RU',rule?.action_i18n.ru||'')}${textarea('action_en','Действие EN',rule?.action_i18n.en||'')}${textarea('documents_ru','Документы RU — по одному на строку',rule?.documents_i18n.ru.join('\n')||'Точный пакет уточнить в офисе')}${textarea('documents_en','Документы EN — по одному на строку',rule?.documents_i18n.en.join('\n')||'Ask the office for the exact document list')}${input('contact','Офис / контакт',rule?.contact||'','text','required')}<label class="field">Тип жилья<select name="residence_type">${opts([['','Все'],['dorm','Общежитие'],['private','Частный адрес']],rule?.eligibility_predicate.residence_type||'')}</select></label><label class="field">Тип срока<select name="kind">${opts([['none','Без отдельного срока'],['university_submission_deadline','Обращение в вуз'],['preparation_start','Начало подготовки']],spec?.kind||'none')}</select></label><label class="field">Якорь<select name="anchor_field">${opts(['visa_expiry','registration_expiry','education_start','entry_at','occurred_at'].map(v=>[v,v]),spec?.anchor_field||'visa_expiry')}</select></label><label class="field">Единица<select name="unit">${opts([['calendar','Календарные дни'],['unspecified','Не указана: только текст']],spec?.unit||'calendar')}</select></label>${input('offset','Сдвиг дней (например −60)',spec?.offset??'','number','min="-366" max="366"')}<label class="field">Характер срока<select name="required_or_recommended">${opts([['recommended_by_university','Рекомендация вуза'],['required','Локально обязательный'],['unspecified','Не уточнён']],spec?.required_or_recommended||'recommended_by_university')}</select></label>${input('literal_ru','Формулировка срока RU',spec?.literal.ru||'')}${input('literal_en','Формулировка срока EN',spec?.literal.en||'')}${input('source_url','Ссылка на основание',rule?.source_url||'https://example.org/demo','url','required')}${input('source_title','Название основания',rule?.source_title||'Модельная инструкция для демонстрации','text','required')}${input('checked_at','Дата проверки',rule?.checked_at||now,'date','required')}${input('effective_from','Действует с',rule?.effective_from||now,'date','required')}${textarea('evidence_note','Основание / пометка',rule?.evidence_note||'Демонстрационное изменение университетского правила. Не официальное обновление вуза.')}</div><div class="actions"><button class="primary">Сохранить draft</button></div></form>`);
    document.querySelector('#rule-form').onsubmit = guard(async e => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.currentTarget));
        if (d.kind !== 'none' && d.unit === 'calendar' && d.offset.trim() === '') throw Error('Укажите сдвиг дней, включая 0, либо выберите срок только текстом');
        const conditions = {
            ...(rule?.eligibility_predicate || {})
        };
        for (const k of ['visa_regime', 'residence_type']) {
            if (d[k]) conditions[k] = d[k];
            else delete conditions[k]
        }
        const body = {
            rule_id: d.rule_id,
            family: d.family,
            semantic_action_key: d.semantic_action_key,
            title_i18n: {
                ru: d.title_ru,
                en: d.title_en
            },
            action_i18n: {
                ru: d.action_ru,
                en: d.action_en
            },
            documents_i18n: {
                ru: d.documents_ru.split('\n').filter(Boolean),
                en: d.documents_en.split('\n').filter(Boolean)
            },
            contact: d.contact,
            eligibility_predicate: conditions,
            trigger_types: d.trigger_type ? [d.trigger_type] : [],
            deadline_specs: d.kind === 'none' ? [] : [{
                kind: d.kind,
                owner: 'university',
                required_or_recommended: d.required_or_recommended,
                anchor_field: d.anchor_field,
                offset: d.unit === 'unspecified' ? null : Number(d.offset),
                unit: d.unit,
                literal: {
                    ru: d.literal_ru,
                    en: d.literal_en
                },
                uncertainty: d.unit === 'unspecified' ? 'unit_unconfirmed' : ''
            }],
            source_type: 'demo_model',
            source_url: d.source_url,
            source_title: d.source_title,
            checked_at: d.checked_at,
            effective_from: d.effective_from,
            evidence_note: d.evidence_note
        };
        const path = rule && ['draft', 'validated'].includes(rule.status) ? `/admin/rules/${rule.rule_id}/versions/${rule.version}` : '/admin/rules' + (tenant ? '' : '?tenant=' + encodeURIComponent(d.university_id));
        await api(path, path.startsWith('/admin/rules/') ? 'PATCH' : 'POST', body);
        modal.close();
        await load();
        toast('Draft сохранён. Теперь выполните проверку и preview.')
    })
}
async function preview(rule) {
        const validation = await api(`/admin/rules/${rule.rule_id}/versions/${rule.version}/validate`, 'POST');
        const p = await api(`/admin/rules/${rule.rule_id}/versions/${rule.version}/preview`, 'POST');
        show(`<h2>Проверка перед публикацией</h2><div class="banner">Демонстрационное изменение университетского правила. Проверка структуры не является юридическим удостоверением.</div><div class="detail-label">Проверка на трёх синтетических профилях</div>${validation.simulations.map(s=>`<p class="privacy">${esc(({applicable:'Подходящий профиль',non_applicable:'Неподходящий профиль',unknown:'Неизвестные данные'})[s.case])}: ${s.tasks_count} задач · ${esc(s.result.map(d=>d.engine_status).join(', ')||'правило не применяется')}</p>`).join('')}<p class="detail-text"><b>${p.affected_count}</b> пользователей получат изменение плана.</p>${p.affected.slice(0,10).map(a=>a.changes.map(c=>`<div class="detail-text">${esc(c.after.title_i18n.ru)}</div><div class="diff"><div><b>До</b><br>${c.before?`v${c.before.rule_version} · ${esc(c.before.engine_status)}<br>${esc(c.before.dates.map(d=>d.computed_at||d.literal.ru).join('; '))}`:'Задачи не было'}</div><div><b>После</b><br>v${c.after.rule_version} · ${esc(c.after.engine_status)}<br>${esc(c.after.dates.map(d=>d.computed_at||d.literal.ru).join('; '))}</div></div>`).join('')).join('')}<label class="checkbox"><input type="checkbox" id="publish-consent">Я проверил изменения и подтверждаю публикацию модельного правила.</label><div class="actions"><button class="primary" id="publish">Опубликовать версию ${rule.version}</button></div>`);
        const key = crypto.randomUUID();
        document.querySelector('#publish').onclick = guard(async () => {
            if (!document.querySelector('#publish-consent').checked) throw Error('Подтвердите проверку изменений');
            const r = await api(`/admin/rules/${rule.rule_id}/versions/${rule.version}/publish`, 'POST', {
                confirmed: true,
                preview_token: p.preview_token,
                idempotency_key: key
            });
            modal.close();
            await load();
            toast(`Опубликовано. Изменено маршрутов: ${r.affected_count}.`)
        })
    }
    (token ? load() : Promise.resolve(login())).catch(e => {
        toast(e.message);
        login()
    });
