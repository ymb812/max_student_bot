/* Synthetic inputs only. All tasks and deadlines come from the regular backend. */
const demoProfileNames = {
    original: ['Исходный профиль', 'Original profile'],
    incomplete: ['Не хватает данных', 'Missing information'],
    sutd_visa: ['СПбГУПТД · виза · общежитие', 'SUTD · visa · dormitory'],
    sutd_visa_free: ['СПбГУПТД · без визы · частный адрес', 'SUTD · visa-free · private address'],
    leti_visa: ['ЛЭТИ · виза · общежитие', 'LETI · visa · dormitory']
};
const demoStorageKey = 'student_demo_profiles';
let demoSwitching = false;

function demoSessions() {
    try {
        const value = JSON.parse(sessionStorage.getItem(demoStorageKey) || '{}');
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch {
        return {};
    }
}

function demoProfilePanel() {
    if (!config.demo_mode || !plan.demo_model) return '';
    const sessions = demoSessions();
    if (!sessions.original) {
        sessions.original = token;
        sessionStorage.setItem(demoStorageKey, JSON.stringify(sessions));
    }
    return `<details class="demo-panel" open aria-label="${tr('Демо-профили','Demo profiles')}"><summary>${tr('Демо-профили для показа','Demo profiles for a walkthrough')}</summary><p class="sub">${tr('У каждого тестового студента свой план. Исходный профиль сохраняется.','Switch between test students. Each has a separate plan. Your original profile is preserved.')}</p><div class="actions">${Object.entries(demoProfileNames).map(([id,names])=>`<button type="button" class="secondary ${sessions[id]===token?'selected':''}" data-demo-profile="${id}" aria-pressed="${sessions[id]===token}">${esc(names[lang==='en'?1:0])}</button>`).join('')}</div><details class="demo-explanation"><summary>${tr('О тестовых данных','About the test data')}</summary><p class="privacy">${tr('Это вымышленные данные. Даты задаются относительно первого выбора профиля. Заполненный профиль не подтверждает правовые исключения: медицина и биометрия могут требовать проверки в офисе. Переключение доступно в этой вкладке; на аккаунте MAX этих кнопок нет.','These are synthetic inputs. Dates are relative to the first profile selection. Complete information does not verify legal exemptions: medical and fingerprinting tasks may still need office review. Switching is available in this tab; these buttons are absent on MAX accounts.')}</p></details></details>`;
}

async function switchDemoProfile(id) {
    if (demoSwitching || !config.demo_mode || !plan.demo_model || !Object.hasOwn(demoProfileNames, id)) return;
    demoSwitching = true;
    const controls = [...root.querySelectorAll('button,input,select')].map(el => [el, el.disabled]);
    controls.forEach(([el]) => el.disabled = true);
    let candidate = demoSessions()[id], created = false;
    try {
        if (candidate) {
            try {
                await api('/me/profile', 'GET', undefined, candidate);
            } catch (e) {
                if (e.status !== 401 && e.status !== 404) throw e;
                if (id === 'original') throw Error(tr('Сессия исходного профиля истекла. Он недоступен для переключения.', 'The original profile session expired and cannot be switched to.'));
                candidate = null;
            }
        }
        if (!candidate) {
            const response = await fetch('/static/demo-profiles.json', {signal: AbortSignal.timeout(15000)});
            if (!response.ok) throw Error(tr('Не удалось загрузить демо-профили', 'Could not load demo profiles'));
            const fixture = (await response.json())[id];
            const auth = await api('/auth/demo', 'POST', undefined, null);
            candidate = auth.access_token;
            created = true;
            const base = await api('/me/profile', 'GET', undefined, candidate);
            const dates = Object.fromEntries(Object.entries(fixture.date_offsets).map(([field, days]) => {
                const date = new Date(today() + 'T12:00:00Z');
                date.setUTCDate(date.getUTCDate() + days);
                return [field, date.toISOString().slice(0, 10)];
            }));
            await api('/me/profile', 'PATCH', {...base, ...fixture.profile, ...dates, language: lang, consent: true, reminders_enabled: false}, candidate);
        }
        const nextProfile = await api('/me/profile', 'GET', undefined, candidate);
        const nextPlan = await api('/me/roadmap', 'GET', undefined, candidate);
        if (!nextPlan.demo_model) throw Error(tr('Этот профиль не является демонстрационным', 'This is not a demo profile'));
        const sessions = demoSessions();
        sessions[id] = candidate;
        sessionStorage.setItem(demoStorageKey, JSON.stringify(sessions));
        token = candidate;
        sessionStorage.setItem('student_token', token);
        profile = nextProfile;
        plan = nextPlan;
        lang = profile.language;
        renderProfile();
        toast(tr('Демо-профиль выбран. Откройте «Мой план».', 'Demo profile selected. Open My roadmap.'));
    } catch (e) {
        if (created) await api('/me/profile', 'DELETE', undefined, candidate).catch(() => {});
        throw e;
    } finally {
        demoSwitching = false;
        controls.filter(([el]) => el.isConnected).forEach(([el, disabled]) => el.disabled = disabled);
    }
}

function forgetDemoSession() {
    const sessions = demoSessions();
    for (const [id, value] of Object.entries(sessions)) if (value === token) delete sessions[id];
    sessionStorage.setItem(demoStorageKey, JSON.stringify(sessions));
}
