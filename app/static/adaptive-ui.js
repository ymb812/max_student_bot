/* Forms report explicit facts. Availability, process transitions and priority come from the API. */
function onboardingBlocks() { return ['situation','support','branch',...(onboardingDraft.arrival_status==='arrived'?['done']:[]),'summary']; }
function onboardingSelect(name, label, values=fieldChoices(name)) {
    return selectField(name,label,[['',tr('Выберите ответ','Choose an answer')],...values],onboardingDraft[name]??'').replace('<select ', '<select required ');
}
function onboardingRadios(name, values) {
    return `<fieldset class="quiz-options"><legend class="sr-only">${tr('Ваша ситуация','Your situation')}</legend>${values.map(([value,glyph,label,description])=>`<label class="quiz-option"><input type="radio" name="${name}" value="${value}" ${onboardingDraft[name]===value?'checked':''} required><span class="tile-icon">${icon(glyph,21)}</span><span class="option-copy"><strong>${label}</strong><small>${description}</small></span><span class="choice-dot" aria-hidden="true"></span></label>`).join('')}</fieldset>`;
}
const preparationChoices=()=>[['not_started',tr('Не начинал(а) запрос приглашения','Invitation not requested')],['requested',tr('Запрос отправлен, ожидаю приглашение','Request sent, waiting for invitation')],['invitation_received',tr('Приглашение получено','Invitation received')],['visa_submitted',tr('Документы на визу поданы','Visa application submitted')],['visa_received',tr('Учебная виза получена','Study visa received')],['unknown',tr('Не знаю, уточню','Not sure yet')]];
const officeChoices=()=>[['not_started',tr('Не передавал(а)','Not submitted')],['partial',tr('Передал(а) часть комплекта','Submitted part of the package')],['completed',tr('Весь комплект передан','Full package submitted')],['unknown',tr('Не знаю','Not sure')]];
const registrationChoices=()=>[['not_started',tr('Не начинал(а)','Not started')],['submitted',tr('Документы поданы, ожидаю','Submitted, waiting')],['received',tr('Регистрация получена','Registration received')],['unknown',tr('Не знаю','Not sure')]];
function onboardingDate(name,label) {
    return `${field(name,label,'date',onboardingDraft[name]||'',onboardingDraft[name+'_unknown']?'disabled':'required')}<label class="checkbox"><input type="checkbox" name="${name}_unknown" ${onboardingDraft[name+'_unknown']?'checked':''}>${tr('Не знаю дату — уточню по документу','I do not know the date — I will check the document')}</label>`;
}
function renderOnboarding() {
    ensureOnboardingDraft();entryScreen='questions';onboardingDraft.started=true;
    const blocks=onboardingBlocks();step=Math.min(step,blocks.length-1);persistOnboardingDraft();
    const block=blocks[step], arrived=onboardingDraft.arrival_status==='arrived', d=onboardingDraft;
    let title, hint, fields='';
    if(block==='situation') {
        title=tr('С какого места начнём?','Where shall we start?');hint=tr('Учтём вашу ситуацию и порядок университета.','We will use your situation and university’s instructions.');
        fields=onboardingRadios('arrival_status',[
            ['planned','plane',tr('Готовлюсь к приезду','Preparing to arrive'),tr('Обучение в вузе уже подтверждено','Your admission is confirmed')],
            ['arrived','address',tr('Я уже в России','I am already in Russia'),tr('Продолжить с текущего положения','Continue from your current situation')]])+onboardingSelect('university_id',tr('Ваш университет','Your university'));
    } else if(block==='support') {
        title=tr('Какой маршрут вам подходит?','Which route fits your situation?');hint=tr('Особые обстоятельства направим на индивидуальную проверку. Неизвестное можно уточнить позже.','Special circumstances need individual review. Unknown information can be added later.');
        fields=onboardingSelect('age_band',tr('Вам исполнилось 18 лет?','Are you 18 or older?'))+onboardingSelect('study_status',tr('Ваш учебный статус','Your study status'))+onboardingSelect('migration_basis',tr('Основание пребывания в России','Grounds for staying in Russia'));
    } else if(block==='branch') {
        title=arrived?tr('Ваш последний въезд','Your latest entry'):tr('Что готово к приезду?','What is ready for your arrival?');hint=tr('Сообщите только известные сведения. Дата въезда и дата прибытия в город могут различаться.','Report only what you know. Entry into Russia and arrival in the city may be on different dates.');
        fields=onboardingSelect('visa_regime',tr('Режим въезда','Entry regime'));
        if(arrived) fields+=onboardingDate('entry_at',tr('Дата последнего въезда в Россию','Date of last entry into Russia'))+onboardingSelect('entry_purpose',tr('Цель в документах въезда','Purpose in entry documents'))+onboardingSelect('residence_type',tr('Где вы сейчас живёте?','Where do you live now?'))+(d.university_id==='leti'?field('arrival_at',tr('Прибытие в Санкт-Петербург · МСК, если известно','Arrival in St Petersburg · MSK, if known'),'datetime-local',d.arrival_at||''):'');
        else {
            if(d.visa_regime==='visa')fields+=onboardingSelect('preparation',tr('На каком вы шаге?','Which step are you on?'),preparationChoices());
            if(d.visa_regime==='visa_free'&&d.university_id==='sutd')fields+=onboardingSelect('study_form',tr('Форма обучения','Study mode'));
            if(d.visa_regime==='visa_free'||d.preparation==='visa_received')fields+=onboardingSelect('residence_type',tr('Где планируете жить?','Where will you live?'));
            if(d.preparation==='visa_received'&&d.visa_regime==='visa')fields+=onboardingDate('visa_expiry',tr('Окончание визы','Visa expiry'));
        }
    } else if(block==='done') {
        title=tr('Что уже сделано?','What have you already done?');hint=tr('Получение документа и передача комплекта — разные результаты. Даты прошлых процедур не будем угадывать.','Receiving a document and submitting a package are different results. We will not guess when past procedures happened.');
        fields=onboardingSelect('office_package',tr('Комплект в отдел после последнего приезда','Office package after your latest arrival'),officeChoices())+onboardingSelect('registration',tr('Регистрация по текущему месту проживания','Registration at your current residence'),registrationChoices());
        if(d.registration==='received')fields+=onboardingDate('registration_expiry',tr('Окончание регистрации','Registration expiry'));
        if(d.visa_regime==='visa')fields+=onboardingDate('visa_expiry',tr('Окончание визы','Visa expiry'));
    } else {
        title=tr('Проверьте сведения','Review your information');hint=tr('После подтверждения сохраним факты и покажем следующий шаг.','After confirmation we will save your facts and show the next step.');
        const keys=['arrival_status','university_id','age_band','study_status','migration_basis','visa_regime',
            ...(arrived?['entry_at','entry_purpose','residence_type',...(d.university_id==='leti'?['arrival_at']:[]),'office_package','registration',...(d.registration==='received'?['registration_expiry']:[])]:[
                ...(d.visa_regime==='visa'?['preparation']:[]),...(d.visa_regime==='visa_free'&&d.university_id==='sutd'?['study_form']:[]),
                ...(d.visa_regime==='visa_free'||(d.visa_regime==='visa'&&d.preparation==='visa_received')?['residence_type']:[])]),
            ...(d.visa_regime==='visa'&&(arrived||d.preparation==='visa_received')?['visa_expiry']:[])];
        fields=`<dl class="onboarding-summary">${keys.filter(k=>d[k]||d[k+'_unknown']).map(k=>{const choices=k==='preparation'?preparationChoices():k==='office_package'?officeChoices():k==='registration'?registrationChoices():fieldChoices(k);const label=fieldLabels[k]?tr(...fieldLabels[k]):({preparation:tr('Готовность документов','Document readiness'),office_package:tr('Комплект в отдел','Office package'),registration:tr('Регистрация','Registration')})[k];return `<div><dt>${esc(label||k)}</dt><dd>${esc(choices?.find(([v])=>v===d[k])?.[1]||(d[k+'_unknown']?tr('Дата неизвестна','Date unknown'):d[k]))}</dd></div>`;}).join('')}</dl><label class="checkbox quiz-consent"><input type="checkbox" name="consent" required ${d.consent?'checked':''}><span>${tr('Подтверждаю сводку и согласен на хранение в этом сервисе вуза, дат и статусов процедур для построения плана. Без сканов, номеров паспортов, точного адреса и медицинских результатов. Удаление — в профиле. Срок хранения после последней активности:','I confirm this summary and agree to storage of my university, dates and procedure statuses for this roadmap. No scans, passport numbers, exact addresses or medical results. Delete data in your profile. Retention after last activity:')} ${config.privacy_retention_days} ${tr('дней.','days.')}</span></label>`;
    }
    history.replaceState({ryadom:true,entry:'questions',onboardingStep:step},'',location.href);
    root.innerHTML=shell(`<section class="onboard"><div class="quiz-meta"><span>${tr('Ваш первый план','Your first roadmap')}</span><span>${tr('Шаг','Step')} ${step+1} / ${blocks.length}</span></div><div class="steps" aria-hidden="true">${blocks.map((_,i)=>`<span class="${i<=step?'active':''}"></span>`).join('')}</div><h1>${title}</h1><p class="quiz-lede">${hint}</p><form id="onboard-form">${fields}<div class="quiz-footer"><button class="primary wide" id="next" type="submit">${block==='summary'?tr('Подтвердить и открыть план','Confirm and open roadmap'):tr('Продолжить','Continue')}</button></div></form></section>`);wireShell();
    const form=document.querySelector('#onboard-form');
    const persist=()=>{for(const el of form.elements)if(el.name){if(el.type==='radio'){if(el.checked)d[el.name]=el.value;}else if(el.type==='checkbox')d[el.name]=el.checked;else d[el.name]=el.value;}persistOnboardingDraft();};
    form.oninput=persist;
    form.onchange=e=>{persist();if(['visa_regime','preparation','registration'].includes(e.target.name)||e.target.name.endsWith('_unknown')){renderOnboarding();}};
    form.onsubmit=guard(async e=>{e.preventDefault();if(!form.reportValidity())return;persist();
        if(block!=='summary'){step++;persistOnboardingDraft();history.pushState({ryadom:true,entry:'questions',onboardingStep:step},'',location.href);renderOnboarding();focusEntryHeading();return;}
        const next={...profile,language:lang,consent:true};
        for(const k of ['arrival_status','university_id','age_band','study_status','migration_basis','visa_regime'])if(d[k])next[k]=d[k];
        next.residence_type=arrived||d.visa_regime==='visa_free'||(d.visa_regime==='visa'&&d.preparation==='visa_received')?d.residence_type||'unknown':'unknown';
        next.study_form=d.visa_regime==='visa_free'&&d.university_id==='sutd'?d.study_form||'unknown':'unknown';
        next.entry_at=arrived&&!d.entry_at_unknown?d.entry_at||null:null;
        next.entry_purpose=arrived?d.entry_purpose||'unknown':'unknown';
        next.arrival_at=arrived&&d.university_id==='leti'&&d.arrival_at?d.arrival_at+(d.arrival_at.length===16?':00':'')+'+03:00':null;
        next.visa_expiry=d.visa_regime==='visa'&&(arrived||d.preparation==='visa_received')&&!d.visa_expiry_unknown?d.visa_expiry||null:null;
        next.registration_expiry=arrived&&d.registration==='received'&&!d.registration_expiry_unknown?d.registration_expiry||null:null;
        d.submissionKey ||= crypto.randomUUID();persistOnboardingDraft();
        await api('/me/onboarding','POST',{profile:next,preparation:!arrived&&d.visa_regime==='visa'?d.preparation||'unknown':'unknown',office_package:arrived?d.office_package||'unknown':'unknown',registration:arrived?d.registration||'unknown':'unknown',confirmed:true,idempotency_key:d.submissionKey});
        sessionStorage.removeItem(onboardingStorageKey());onboardingDraft=null;await load();
    });
}

function workflowLabel(t) {
    if(t.engine_status==='superseded')return tr('В истории','In history');
    if(t.engine_status==='requires_recheck')return tr('Проверить повторно','Recheck');
    if(t.workflow_status==='waiting')return tr('Ожидается результат','Waiting for result');
    if(t.workflow_status==='partial')return tr('Передана часть комплекта','Part of the package submitted');
    if(t.workflow_status==='needs_help')return tr('Есть вопрос — нужна помощь','A question needs help');
    if(t.user_status==='completed')return tr('Выполнено · по вашему сообщению','Completed · reported by you');
    if(t.availability==='future')return tr('Предстоит','Upcoming');
    if(t.availability==='past')return tr('В прошлом · выполнение не сообщалось','Past · completion not reported');
    return tr(...(states[t.engine_status]||statuses[t.user_status]));
}
function resultActionLabel(t,outcome) {
    if(outcome==='received')return t.process==='invitation'?tr('Приглашение получено','Invitation received'):t.process.includes('visa')?tr('Виза получена','Visa received'):tr('Регистрация получена','Registration received');
    if(outcome==='completed')return t.process==='trip'?tr('Всё готово к поездке','Everything is ready for the trip'):t.process==='documents'?tr('Проверил(а), расхождений не нашёл(ла)','Checked, no discrepancies found'):tr('Весь комплект передан','Full package submitted');
    return ({requested:tr('Запрос отправлен','Request sent'),submitted:tr('Документы поданы','Documents submitted'),partial:tr('Передал(а) часть','Submitted part'),question:tr('Есть ошибка или вопрос','There is an error or question'),question_sent:tr('Вопрос отправлен','Question sent'),clarified:tr('Ответ получен','Answer received')})[outcome]||outcome;
}
function resolveTask(t) {
    const fields=t.missing_fields||[];
    navigate(t.engine_status==='conditional'&&fields.length&&fields.every(k=>editableFields().includes(k))?{name:'clarify',key:t.task_key}:{name:'review',key:t.task_key});
}
function workflowControls(t) {
    if(!t.process)return '';
    const external=t.availability==='future'&&t.process==='initial_visa';
    const invitationUnknown=t.process==='invitation'&&t.missing_fields?.includes('preparation_state');
    return `<p class="user-status">${esc(workflowLabel(t))}</p>${t.availability_reason_i18n?note(content(t.availability_reason_i18n)):''}${t.waiting_i18n?note(content(t.waiting_i18n)):''}${t.missing_documents?.length?`<p>${tr('Осталось передать:','Still to submit:')} ${esc(t.missing_documents.map(i=>content(t.documents_i18n)[i]).join('; '))}</p>`:''}<div class="actions workflow-actions">${(t.result_actions||[]).map(outcome=>`<button class="${outcome==='question'?'secondary':'primary'}" data-result="${outcome}">${esc(resultActionLabel(t,outcome))}</button>`).join('')}${invitationUnknown?`<button class="secondary" data-result="requested" data-external="true">${tr('Запрос уже отправлен','Request already sent')}</button><button class="secondary" data-result="received" data-external="true">${tr('Приглашение уже получено','Invitation already received')}</button>`:''}${external?`<button class="secondary" data-result="submitted" data-external="true">${tr('Уже подал(а) вне сервиса','Already submitted outside the service')}</button><button class="secondary" data-result="received" data-external="true">${tr('Уже получил(а) визу','Already received a visa')}</button>`:''}${t.process==='entry_context'&&t.user_status!=='completed'?`<button class="primary" id="record-entry">${effectiveProfile().arrival_status==='arrived'?tr('Уточнить сведения въезда','Clarify entry information'):tr('Я уже приехал(а)','I have arrived')}</button>`:''}</div>`;
}
function wireWorkflow(t) {
    document.querySelectorAll('[data-result]').forEach(b=>b.onclick=()=>navigate({name:'workflow',key:t.task_key,outcome:b.dataset.result,external:b.dataset.external==='true'}));
    document.querySelector('#record-entry')?.addEventListener('click',()=>effectiveProfile().arrival_status==='arrived'?resolveTask(t):eventForm('entry_recorded'));
}
function workflowFormView() {
    const t=plan.tasks.find(t=>t.task_key===route.key);if(!t){navigate({name:'plan'},true);return;}
    const original=route.report, outcome=route.outcome||original?.outcome, old=original?.body||{};
    if(!outcome){navigate({name:'task',key:t.task_key},true);return;}
    let fields=(original?selectField('outcome',tr('Указанный результат','Reported result'),(t.valid_result_outcomes||[outcome]).map(o=>[o,resultActionLabel(t,o)]),outcome):'')+field('occurred_at',tr('Когда это произошло · если знаете','When it happened · if known'),'date',original?.occurred_at||'',`max="${today()}"`);
    if(outcome==='received'&&t.process!=='invitation')fields+=field('document_expiry',tr('Дата окончания документа · если известна','Document expiry · if known'),'date',old.document_expiry||'');
    if(t.process==='trip')fields+=['documents','arrival','housing'].map((key,i)=>`<label class="checkbox"><input type="checkbox" name="check_${key}" required ${old.checklist?.includes(key)?'checked':''}>${esc(content(t.documents_i18n)[i])}</label>`).join('');
    if(outcome==='partial')fields+=`<p>${tr('Отметьте, что ещё осталось передать (если известно):','Select what remains to submit (if known):')}</p>`+content(t.documents_i18n).map((label,i)=>`<label class="checkbox"><input type="checkbox" name="missing_${i}" ${old.missing_documents?.includes(i)?'checked':''}>${esc(label)}</label>`).join('');
    showDetail(`${heading(resultActionLabel(t,outcome))}<p>${route.external?tr('Вы сообщаете о результате вне сервиса. Промежуточные шаги не будут отмечены автоматически.','You are reporting a result outside the service. Intermediate steps will not be completed automatically.'):tr('Сохранится только указанный результат. Неизвестные даты оставьте пустыми.','Only this result will be saved. Leave unknown dates blank.')}</p><form id="result-form">${fields}<label class="checkbox"><input type="checkbox" name="confirmed" required>${tr('Подтверждаю указанный результат','I confirm this result')}</label><button class="primary wide" type="submit">${tr('Подтвердить и обновить план','Confirm and update roadmap')}</button></form><button class="secondary wide" id="cancel-result">${tr('Отмена','Cancel')}</button>`);
    document.querySelector('#cancel-result').onclick=goBack;
    document.querySelector('#result-form [name=outcome]')?.addEventListener('change',e=>{clearFormDraft();route.outcome=e.target.value;dirty=false;paintRoute();});
    route.submissionKey ||= crypto.randomUUID();writeLocation(true);
    document.querySelector('#result-form').onsubmit=guard(async e=>{e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;const data=new FormData(form);
        const body={outcome,occurred_at:data.get('occurred_at')||null,document_expiry:data.get('document_expiry')||null,checklist:['documents','arrival','housing'].filter(k=>data.has('check_'+k)),missing_documents:content(t.documents_i18n).map((_,i)=>i).filter(i=>data.has('missing_'+i)),external_result:!!route.external,confirmed:true,idempotency_key:route.submissionKey,supersedes_report_id:original?.id||null};
        const saved=await api('/me/tasks/'+encodeURIComponent(t.task_key)+'/results','POST',body);
        clearFormDraft();dirty=false;await refreshSnapshot();navigate({name:'result',revision:saved.revision_id,reason:original?'result_corrected':'result_reported'},true);
    });
}
