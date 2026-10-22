/* Forms report explicit facts. Availability, process transitions and priority come from the API. */
function onboardingBlocks() { return ['situation','support','branch',...(onboardingDraft.arrival_status==='arrived'?['done']:[]),'summary']; }
function onboardingSelect(name, label, values=fieldChoices(name)) {
    return selectField(name,label,[['',tr('Выберите ответ','Choose an answer')],...values],onboardingDraft[name]??'').replace('<select ', '<select required ');
}
function onboardingStudyFields() {
    const status=onboardingDraft.study_status;
    const main=['admitted','active'];
    const selected=onboardingDraft.study_path??(main.includes(status)?status:status?'other':'');
    const choices=[['',tr('Выберите ответ','Choose an answer')],
        ['admitted',tr('Зачислен(а), занятия ещё не начались','Admitted; classes have not started')],
        ['active',tr('Да, уже учусь','Yes, I am already studying')],
        ['other',tr('Другая ситуация / пока не уверен(а)','Another situation / not sure yet')]];
    const primary=selectField('study_path',tr('Вы уже начали учиться в выбранном вузе?','Have you started studying at your chosen university?'),choices,selected).replace('<select ','<select required ');
    return primary+(selected==='other'?onboardingSelect('study_status',tr('Уточните вашу ситуацию','Tell us more about your situation'),fieldChoices('study_status').filter(([value])=>!main.includes(value))):'');
}
function onboardingRadios(name, values) {
    return `<fieldset class="quiz-options"><legend class="sr-only">${tr('Ваша ситуация','Your situation')}</legend>${values.map(([value,glyph,label,description])=>`<label class="quiz-option"><input type="radio" name="${name}" value="${value}" ${onboardingDraft[name]===value?'checked':''} required><span class="tile-icon">${icon(glyph,21)}</span><span class="option-copy"><strong>${label}</strong><small>${description}</small></span><span class="choice-dot" aria-hidden="true"></span></label>`).join('')}</fieldset>`;
}
const preparationChoices=()=>[['not_started',tr('Запрос на приглашение ещё не отправлен','Invitation request not sent yet')],['requested',tr('Запрос отправлен, ожидаю приглашение','Request sent, waiting for invitation')],['invitation_received',tr('Приглашение получено','Invitation received')],['visa_submitted',tr('Документы на визу поданы','Visa application submitted')],['visa_received',tr('Учебная виза получена','Study visa received')],['unknown',tr('Пока не знаю, что уже оформлено','Not sure yet')]];
const officeChoices=()=>[['not_started',tr('Пока ничего не передано','None submitted yet')],['partial',tr('Передана часть документов','Some documents submitted')],['completed',tr('Передан весь комплект из списка','All documents on the list submitted')],['unknown',tr('Пока не знаю','Not sure yet')]];
const registrationChoices=()=>[['not_started',tr('Документы ещё не поданы','Documents not submitted yet')],['submitted',tr('Документы поданы, жду регистрацию','Documents submitted; waiting for registration')],['received',tr('Регистрация получена','Registration received')],['unknown',tr('Пока не знаю','Not sure yet')]];
function onboardingDate(name,label) {
    return `<div class="date-answer">${field(name,label,'date',onboardingDraft[name]||'',onboardingDraft[name+'_unknown']?'disabled':'required')}<label class="checkbox"><input type="checkbox" name="${name}_unknown" ${onboardingDraft[name+'_unknown']?'checked':''}>${tr('Дата пока неизвестна','I don’t know the date yet')}</label></div>`;
}
function renderOnboarding() {
    ensureOnboardingDraft();entryScreen='questions';onboardingDraft.started=true;
    const blocks=onboardingBlocks();step=Math.min(step,blocks.length-1);persistOnboardingDraft();
    const block=blocks[step], arrived=onboardingDraft.arrival_status==='arrived', d=onboardingDraft;
    let title, hint, fields='';
    if(block==='situation') {
        title=tr('Вы уже в России?','Are you already in Russia?');hint=tr('Выберите свою ситуацию и университет.','Choose your situation and university.');
        fields=onboardingRadios('arrival_status',[
            ['planned','plane',tr('Готовлюсь к приезду','Preparing to arrive'),tr('Нужен план подготовки к поездке','I need a plan to prepare for arrival')],
            ['arrived','address',tr('Я уже в России','I am already in Russia'),tr('Нужен план после приезда','I need a plan after arrival')]])+onboardingSelect('university_id',tr('В каком университете вы учитесь или будете учиться?','Which university do you attend or plan to attend?'));
    } else if(block==='support') {
        title=tr('Немного о вашей ситуации','A few details about your situation');hint=tr('Некоторые ситуации нужно обсудить с отделом вуза. Если это ваш случай, покажем, что уточнить.','Some situations need advice from your university office. We’ll show you what to ask.');
        fields=onboardingSelect('age_band',tr('Вам исполнилось 18 лет?','Are you 18 or older?'))+onboardingStudyFields()+onboardingSelect('migration_basis',arrived?tr('Какое у вас основание для пребывания в России?','What is the basis for your stay in Russia?'):tr('На каком основании планируете приехать?','What will be the basis for your stay?'));
    } else if(block==='branch') {
        title=arrived?tr('Ваш последний въезд','Your latest entry'):tr('Что готово к приезду?','What is ready for your arrival?');hint=arrived?tr('Укажите сведения о последнем въезде в Россию.','Add details of your latest entry into Russia.'):tr('Укажите, что уже готово. Если не знаете ответ, выберите «Пока не знаю».','Tell us what is ready. Choose “Not sure yet” if you do not know.');
        fields=onboardingSelect('visa_regime',arrived?tr('Вы въехали по визе или без визы?','Did you enter Russia with or without a visa?'):tr('Как вы планируете въехать в Россию?','How do you plan to enter Russia?'));
        if(arrived) fields+=onboardingDate('entry_at',tr('Дата последнего въезда в Россию','Date of last entry into Russia'))+onboardingSelect('entry_purpose',tr('Какая цель указана в документах о въезде?','What purpose is recorded in your entry documents?'))+onboardingSelect('residence_type',tr('Где вы сейчас живёте?','Where do you live now?'))+(d.university_id==='leti'?`<label class="field"><span>${tr('Когда вы прибыли в Санкт-Петербург?','When did you arrive in St Petersburg?')}</span><small>${tr('Необязательно','Optional')}</small><input name="arrival_at" type="datetime-local" step="1" value="${esc(d.arrival_at||'')}" aria-describedby="arrival-time-hint"></label><p id="arrival-time-hint">${tr('Укажите дату и время по Москве. Если не знаете, оставьте поле пустым.','Enter the date and time in Moscow time. Leave the field blank if you do not know.')}</p>`:'');
        else {
            if(d.visa_regime==='visa')fields+=onboardingSelect('preparation',tr('Что уже сделано для получения приглашения и визы?','What have you completed for your invitation and visa?'),preparationChoices());
            if(d.visa_regime==='visa_free'&&d.university_id==='sutd')fields+=onboardingSelect('study_form',tr('Форма обучения','Study mode'));
            if(d.visa_regime==='visa_free'||d.preparation==='visa_received')fields+=onboardingSelect('residence_type',tr('Где планируете жить?','Where will you live?'));
            if(d.preparation==='visa_received'&&d.visa_regime==='visa')fields+=onboardingDate('visa_expiry',tr('Окончание визы','Visa expiry'));
        }
    } else if(block==='done') {
        title=tr('Что уже сделано?','What have you already done?');hint=tr('Отметьте, что уже сделано после приезда. Известные даты можно указать ниже.','Mark what you have already done after arrival. Add known dates below.');
        fields=onboardingOfficeDocuments(d.university_id)+onboardingSelect('office_package',tr('Вы передали документы в отдел вуза после последнего приезда?','Have you submitted documents to the university office since your latest arrival?'),officeChoices())+onboardingSelect('registration',tr('На каком этапе регистрация по нынешнему месту проживания?','What is the status of registration at your current residence?'),registrationChoices());
        if(d.registration==='received')fields+=onboardingDate('registration_expiry',tr('Окончание регистрации','Registration expiry'));
        if(d.visa_regime==='visa')fields+=onboardingDate('visa_expiry',tr('Окончание визы','Visa expiry'));
    } else {
        title=tr('Проверьте сведения','Review your information');hint=tr('Проверьте ответы. После подтверждения сохраним их и откроем план.','Review your answers. We will save them and open your plan after confirmation.');
        const keys=['arrival_status','university_id','age_band','study_status','migration_basis','visa_regime',
            ...(arrived?['entry_at','entry_purpose','residence_type',...(d.university_id==='leti'?['arrival_at']:[]),'office_package','registration',...(d.registration==='received'?['registration_expiry']:[])]:[
                ...(d.visa_regime==='visa'?['preparation']:[]),...(d.visa_regime==='visa_free'&&d.university_id==='sutd'?['study_form']:[]),
                ...(d.visa_regime==='visa_free'||(d.visa_regime==='visa'&&d.preparation==='visa_received')?['residence_type']:[])]),
            ...(d.visa_regime==='visa'&&(arrived||d.preparation==='visa_received')?['visa_expiry']:[])];
        fields=`<dl class="onboarding-summary">${keys.filter(k=>d[k]||d[k+'_unknown']).map(k=>{const choices=k==='preparation'?preparationChoices():k==='office_package'?officeChoices():k==='registration'?registrationChoices():fieldChoices(k);const label=fieldLabels[k]?tr(...fieldLabels[k]):({preparation:tr('Готовность документов','Document readiness'),office_package:tr('Комплект в отдел','Office package'),registration:tr('Регистрация','Registration')})[k];return `<div><dt>${esc(label||k)}</dt><dd>${esc(choices?.find(([v])=>v===d[k])?.[1]||(d[k+'_unknown']?tr('Дата неизвестна','Date unknown'):(/^(?:entry_at|arrival_at|visa_expiry|registration_expiry)$/.test(k)?displayDate(d[k]):d[k])))}</dd></div>`;}).join('')}</dl><label class="checkbox quiz-consent"><input type="checkbox" name="consent" required ${d.consent?'checked':''}><span>${tr('Подтверждаю ответы и соглашаюсь на хранение выбранного вуза, сведений о моей ситуации, дат и статусов процедур для составления плана. Без сканов, номеров паспортов, точного адреса и медицинских результатов. Удаление — в профиле. Срок хранения после последней активности:','I confirm these answers and agree to storage of my university, situation details, dates and procedure statuses for this plan. No scans, passport numbers, exact addresses or medical results. Delete data in your profile. Retention after last activity:')} ${config.privacy_retention_days} ${tr('дней.','days.')}</span></label>`;
    }
    history.replaceState({ryadom:true,entry:'questions',onboardingStep:step},'',location.href);
    root.innerHTML=shell(`<section class="onboard"><div class="quiz-meta"><span>${tr('Ваш первый план','Your first roadmap')}</span><span>${tr('Шаг','Step')} ${step+1} / ${blocks.length}</span></div><div class="steps" aria-hidden="true">${blocks.map((_,i)=>`<span class="${i<=step?'active':''}"></span>`).join('')}</div><h1>${title}</h1><p class="quiz-lede">${hint}</p><form id="onboard-form">${fields}<div class="quiz-footer"><button class="primary wide" id="next" type="submit">${block==='summary'?tr('Подтвердить и открыть план','Confirm and open roadmap'):tr('Продолжить','Continue')}</button></div></form></section>`);wireShell();
    const form=document.querySelector('#onboard-form');
    wireOnboardingDocuments();
    const purpose=form.querySelector('[name=entry_purpose]');
    if(purpose){purpose.setAttribute('aria-describedby','entry-purpose-note');purpose.closest('label').insertAdjacentHTML('afterend',entryPurposeNote());}
    const persist=()=>{for(const el of form.elements)if(el.name){if(el.type==='radio'){if(el.checked)d[el.name]=el.value;}else if(el.type==='checkbox')d[el.name]=el.checked;else d[el.name]=el.value;}
        // study_path only groups answers in this browser draft; the API receives the existing study_status.
        if(block==='support') {
            if(d.study_path!=='other')d.study_status=d.study_path;
            else if(['admitted','active'].includes(d.study_status))d.study_status='';
        }
        persistOnboardingDraft();};
    form.oninput=persist;
    form.onchange=e=>{persist();if(e.target.name==='entry_purpose')document.querySelector('#entry-purpose-note').hidden=d.entry_purpose!=='other';if(['arrival_status','visa_regime','preparation','registration','study_path'].includes(e.target.name)||e.target.name.endsWith('_unknown')){const name=e.target.name;renderOnboarding();if(name==='study_path'||name.endsWith('_unknown'))document.querySelector(`[name="${name}"]`)?.focus();}};
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
    if(t.engine_status==='requires_recheck')return t.user_status==='completed'?tr('Ранее выполнено. Нужна повторная проверка','Previously completed. Check again'):tr('Проверьте результат повторно','Check the result again');
    if(t.availability==='past')return tr('Больше не требует действий','No further action needed');
    if(t.workflow_status==='waiting')return content(RoadmapView.heroPresentation(t,effectiveProfile()).title);
    if(t.reported_outcome==='clarified')return tr('Ответ получен. Порядок действий ещё нужно проверить','Answer received. The next steps still need checking');
    if(t.workflow_status==='partial')return tr('Передана часть документов','Some documents submitted');
    if(t.workflow_status==='needs_help')return tr('Нужна помощь с документами','Help needed with your documents');
    if(t.user_status==='completed')return tr('Выполнено','Completed');
    if(t.availability==='future')return tr('Предстоит','Upcoming');
    return tr(...(states[t.engine_status]||statuses[t.user_status]));
}
function resultActionLabel(t,outcome) {
    if(outcome==='submitted'&&t.process?.includes('visa'))return tr('Документы на визу поданы','Visa documents submitted');
    if(outcome==='submitted'&&t.process?.includes('registration'))return tr('Документы на регистрацию поданы','Registration documents submitted');
    if(outcome==='received')return t.process==='invitation'?tr('Приглашение получено','Invitation received'):t.process.includes('visa')?tr('Виза получена','Visa received'):tr('Регистрация получена','Registration received');
    if(outcome==='completed')return t.process==='trip'?tr('Всё готово к поездке','Everything is ready for the trip'):t.process==='documents'?tr('Документы сверены, расхождений нет','Documents checked; no discrepancies found'):tr('Передан весь комплект из списка','All documents on the list submitted');
    return ({requested:tr('Запрос отправлен','Request sent'),submitted:tr('Документы поданы','Documents submitted'),partial:tr('Часть документов передана','Some documents submitted'),question:tr('Есть ошибка или вопрос','There is an error or question'),question_sent:tr('Вопрос отправлен','Question sent'),clarified:tr('Ответ получен','Answer received')})[outcome]||outcome;
}
function resolveTask(t) {
    const fields=t.missing_fields||[];
    navigate(t.engine_status==='conditional'&&fields.length&&fields.every(k=>editableFields().includes(k))?{name:'clarify',key:t.task_key}:{name:'review',key:t.task_key});
}
function workflowControls(t) {
    if(!t.process)return '';
    if(t.prototype_timing&&t.engine_status==='actionable'&&t.user_status!=='completed'&&['M05','M06','M10'].includes(t.family)) {
        return `<div class="actions workflow-actions"><button class="primary" ${t.family==='M06'?'data-fingerprinting-completed':'data-medical-completed'}>${t.family==='M06'?tr('Дактилоскопия пройдена','Fingerprinting completed'):tr('Медосмотр пройден','Medical examination completed')}</button></div>`;
    }
    const external=t.availability==='future'&&t.process==='initial_visa';
    const invitationUnknown=t.process==='invitation'&&t.missing_fields?.includes('preparation_state');
    const outcomes=t.result_actions||[], primary=outcomes.find(o=>!['question','partial'].includes(o));
    return `<div class="actions workflow-actions">${outcomes.map(outcome=>`<button class="${outcome===primary?'primary':'secondary'}" data-result="${outcome}">${esc(resultActionLabel(t,outcome))}</button>`).join('')}${invitationUnknown?`<button class="secondary" data-result="requested" data-external="true">${tr('Запрос уже отправлен','Request already sent')}</button><button class="secondary" data-result="received" data-external="true">${tr('Приглашение уже получено','Invitation already received')}</button>`:''}${external?`<button class="secondary" data-result="submitted" data-external="true">${tr('Документы на визу уже поданы','Visa documents already submitted')}</button><button class="secondary" data-result="received" data-external="true">${tr('Уже получил(а) визу','Already received a visa')}</button>`:''}${t.process==='entry_context'&&t.user_status!=='completed'?`<button class="primary" id="record-entry">${effectiveProfile().arrival_status==='arrived'?tr('Уточнить сведения въезда','Clarify entry information'):tr('Я уже приехал(а)','I have arrived')}</button>`:''}</div>`;
}
function wireWorkflow(t) {
    document.querySelectorAll('[data-result]').forEach(b=>b.onclick=()=>navigate({name:'workflow',key:t.task_key,outcome:b.dataset.result,external:b.dataset.external==='true'}));
    document.querySelector('#record-entry')?.addEventListener('click',()=>effectiveProfile().arrival_status==='arrived'?resolveTask(t):eventForm('entry_recorded'));
}
function workflowFormView() {
    const t=plan.tasks.find(t=>t.task_key===route.key);if(!t){navigate({name:'plan'},true);return;}
    const original=route.report, outcome=route.outcome||original?.outcome, old=original?.body||{};
    if(!outcome){navigate({name:'task',key:t.task_key},true);return;}
    const editingDate=!!(route.editResultDate&&original?.occurred_at&&original.outcome===outcome);
    let fields=original?selectField('outcome',tr('Какой результат нужно сохранить?','Which result should be recorded?'),(t.valid_result_outcomes||[outcome]).map(o=>[o,resultActionLabel(t,o)]),outcome):'';
    if(editingDate)fields+=`<label class="field"><span>${tr('Дата результата','Result date')}</span><small>${tr('Необязательно','Optional')}</small><input name="occurred_at" type="date" value="${esc(original.occurred_at)}" max="${today()}" aria-describedby="result-date-hint"></label><p id="result-date-hint">${tr('Сохранённая дата. Можно исправить или очистить.','Previously recorded date. You can correct or clear it.')}</p>`;
    if(outcome==='received'&&t.process!=='invitation')fields+=`<label class="field"><span>${t.process.includes('visa')?tr('До какой даты действует виза?','When does your visa expire?'):tr('До какой даты действует регистрация?','When does your registration expire?')}</span><small>${tr('Необязательно','Optional')}</small><input name="document_expiry" type="date" value="${esc(old.document_expiry||'')}" aria-describedby="document-expiry-hint"></label><p id="document-expiry-hint">${tr('Дата нужна для плана продления. Если сейчас её не знаете, сохраните получение без срока — его можно добавить позже.','This date helps plan renewal. If you do not know it now, save the receipt and add the expiry later.')}</p>`;
    if(t.process==='trip'&&outcome==='completed')fields+=['documents','arrival','housing'].map((key,i)=>`<label class="checkbox"><input type="checkbox" name="check_${key}" required ${old.checklist?.includes(key)?'checked':''}>${esc(tripCheckLabels()[i])}</label>`).join('');
    if(outcome==='partial')fields+=`<p>${tr('Какие документы ещё нужно передать? Отметьте только оставшиеся. Если не знаете, оставьте список пустым.','Which documents remain to be submitted? Select only those remaining. Leave the list empty if you do not know.')}</p>`+content(t.documents_i18n).map((label,i)=>`<label class="checkbox"><input type="checkbox" name="missing_${i}" ${old.missing_documents?.includes(i)?'checked':''}>${esc(label)}</label>`).join('');
    showDetail(`<div class="result-entry">${heading(resultActionLabel(t,outcome))}${resultFormHint(t,outcome)?`<p class="result-explanation">${esc(resultFormHint(t,outcome))}</p>`:''}<form id="result-form">${fields}<label class="checkbox"><input type="checkbox" name="confirmed" required>${tr('Подтверждаю этот результат','I confirm this result')}</label><button class="primary wide" type="submit">${original?tr('Сохранить исправление','Save correction'):tr('Сохранить результат','Save result')}</button></form><button class="secondary wide" id="cancel-result">${tr('Отмена','Cancel')}</button></div>`);
    document.querySelector('#cancel-result').onclick=goBack;
    document.querySelector('#result-form [name=outcome]')?.addEventListener('change',e=>{clearFormDraft();route.outcome=e.target.value;dirty=false;paintRoute();});
    route.submissionKey ||= crypto.randomUUID();writeLocation(true);
    document.querySelector('#result-form').onsubmit=guard(async e=>{e.preventDefault();const form=e.currentTarget;if(!form.reportValidity())return;const data=new FormData(form);
        const occurredAt=resultOccurredAt(original,outcome,editingDate,data.get('occurred_at'));
        const body={outcome,occurred_at:occurredAt,document_expiry:data.get('document_expiry')||null,checklist:['documents','arrival','housing'].filter(k=>data.has('check_'+k)),missing_documents:content(t.documents_i18n).map((_,i)=>i).filter(i=>data.has('missing_'+i)),external_result:!!route.external,confirmed:true,idempotency_key:route.submissionKey,supersedes_report_id:original?.id||null};
        const saved=await api('/me/tasks/'+encodeURIComponent(t.task_key)+'/results','POST',body);
        clearFormDraft();dirty=false;await refreshSnapshot();navigate({name:'result',revision:saved.revision_id,reason:original?'result_corrected':'result_reported'},true);toast(tr('Результат сохранён. План обновлён.','Result saved. Plan updated.'));
    });
}
