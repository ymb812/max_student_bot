/* Shared RU/EN presentation of recorded data; no eligibility or date calculation. */
function invitationTask() { return plan.tasks.find(t=>t.process==='invitation'&&t.engine_status!=='superseded'); }
function tripCheckLabels() {return [tr('Документы для поездки подготовлены','Travel documents are prepared'),tr('Порядок обращения в вуз после приезда понятен','I know how to contact the university after arrival'),tr('Порядок заселения известен','I know the check-in arrangements')];}
function onboardingOfficeDocuments(tenant) {
    const info=config.office_documents?.[tenant];
    const open=!!onboardingDraft.office_documents_open;
    return info?`<section class="onboarding-documents"><button type="button" class="document-toggle" id="toggle-office-documents" aria-expanded="${open}" aria-controls="office-documents">${icon('passport',22)}<span>${open?tr('Скрыть список документов','Hide document list'):tr('Посмотреть список документов','View document list')}</span>${icon('chevron',18)}</button><div id="office-documents" ${open?'':'hidden'}><p>${esc(content(info.office_name_i18n))}</p><ul>${(content(info.documents_i18n)||[]).map(d=>`<li>${esc(d)}</li>`).join('')}</ul></div></section>`:'';
}
function wireOnboardingDocuments() {
    const button=document.querySelector('#toggle-office-documents');
    if(!button)return;
    button.onclick=()=>{
        const open=button.getAttribute('aria-expanded')!=='true';
        onboardingDraft.office_documents_open=open;persistOnboardingDraft();
        button.setAttribute('aria-expanded',String(open));document.querySelector('#office-documents').hidden=!open;
        button.querySelector('span').textContent=open?tr('Скрыть список документов','Hide document list'):tr('Посмотреть список документов','View document list');
    };
}
function entryPurposeNote() {
    return `<p id="entry-purpose-note" class="field-note" role="status" ${onboardingDraft.entry_purpose==='other'?'':'hidden'}>${tr('Обычный план рассчитан на въезд с целью «Учёба». При другой цели покажем, что нужно уточнить в отделе вуза. Точную цель нужно будет сверить с сотрудником по вашим документам.','The standard plan is for entry with “Study” as its purpose. For another purpose, we’ll show what to clarify with your university office. Check the exact purpose with staff using your entry documents.')}</p>`;
}
function processLabel(process) {
    const labels={invitation:['Приглашение','Invitation'],initial_visa:['Первичная виза','Initial visa'],trip:['Подготовка поездки','Trip preparation'],entry_context:['Сведения о въезде','Entry information'],documents:['Проверка документов','Document check'],office:['Документы для отдела вуза','Documents for the university office'],registration:['Регистрация','Registration'],visa_renewal:['Продление визы','Visa renewal'],registration_renewal:['Продление регистрации','Registration renewal'],consultation:['Консультация','Advice']};
    return tr(...(labels[process]||['Результат действия','Task result']));
}
function apiErrorMessage(error,status) {
    const messages={
        result_predates_episode:['Дата результата раньше начала текущего периода въезда или проживания. Проверьте дату. Прежние результаты можно посмотреть в истории.','The result date is earlier than the start of your current entry or residence period. Check the date. Previous results are available in History.'],
        result_unavailable:['Состояние задачи изменилось. Вернитесь в план, обновите страницу и выберите доступный результат.','The task has changed. Return to your plan, reload the page and choose an available result.'],
        result_already_recorded:['Этот результат уже сохранён. Исправить его можно в истории.','This result is already saved. You can correct it in History.'],
        city_before_entry:['Прибытие в город не может быть раньше въезда в Россию. Проверьте обе даты.','City arrival cannot be earlier than entry into Russia. Check both dates.'],
        city_date_invalid:['Прибытие в город должно быть после въезда и не позже текущего времени. Проверьте даты.','City arrival must follow entry and cannot be in the future. Check the dates.'],
        future_fact:['Дата произошедшего события или результата не может быть в будущем. Проверьте дату.','A completed event or result cannot have a future date. Check the date.'],
        expiry_before_receipt:['Дата окончания документа не может быть раньше даты получения. Проверьте обе даты.','Document expiry cannot be earlier than receipt. Check both dates.'],
        expiry_before_issuance:['Дата окончания документа не может быть раньше даты выдачи. Проверьте обе даты.','Document expiry cannot be earlier than issuance. Check both dates.'],
        trip_checks:['Подтвердите все три пункта подготовки поездки. Если пункт не подходит, уточните порядок в отделе.','Confirm all three trip preparation checks. If a check does not fit your situation, ask the office for advice.'],
        remaining_documents:['Проверьте список оставшихся документов в текущей карточке.','Check the remaining documents against the current task list.'],
        invalid_outcome:['Выберите результат, доступный для этого действия.','Choose a result available for this task.'],
        expiry_requires_receipt:['Дату окончания можно сохранить только вместе с получением документа.','An expiry date can only be saved with document receipt.'],
        past_journey:['Эта подготовка относится к прошлому приезду. Откройте текущий план.','This preparation belongs to a past journey. Open your current plan.'],
        arrived_required:['Сначала укажите, что вы уже приехали, и известные сведения о въезде.','First record that you have arrived and add the entry details you know.'],
        onboarding_saved:['Ответы первого входа уже сохранены. Измените нужные данные в профиле или результат в истории.','Your onboarding answers are saved. Update the relevant profile field or correct a result in History.'],
        onboarding_required:['Сначала завершите вопросы первого входа.','Complete onboarding first.'],
        transfer_review:['Перевод в другой вуз нужно обсудить с отделом. Сообщите изменение учебного статуса.','Discuss your university transfer with the office. Record a study status change.'],
        consent_withdrawal:['Чтобы отозвать согласие, используйте «Удалить мои данные» в профиле.','To withdraw consent, use “Delete my data” in your profile.'],
        correction_inactive:['Эта запись уже исправлена или отменена. Откройте её актуальную версию в истории.','This report has already been corrected or retracted. Open its current version in History.'],
        retract_replacement:['Сначала отмените заменяющую запись в истории.','Retract the replacement report in History first.'],
        idempotency_conflict:['Эта попытка уже связана с другой записью. Проверьте историю и откройте форму заново.','This attempt is already linked to another report. Check History and reopen the form.'],
        use_result:['Сообщите конкретный результат в карточке действия.','Record a specific result in the task.'],
        superseded_task:['Это прежнее действие. Откройте текущий план.','This is a previous task. Open your current plan.'],
        fields_invalid:['Проверьте заполненные поля: некоторые данные не соответствуют этой форме.','Check the fields: some details do not match this form.'],
        missing_fields:['Заполните обязательные поля формы.','Complete the required form fields.'],
        visa_branch:['Данные визы доступны только при въезде по визе. Проверьте выбранный режим.','Visa details are only available for visa entry. Check your selected entry type.'],
        planned_entry_conflict:['Для подготовки к первому приезду нельзя указывать уже состоявшийся въезд. Проверьте ситуацию и дату.','Preparation for a first arrival cannot include a completed entry. Check your situation and date.'],
        consent_required:['Выберите вуз и подтвердите согласие.','Choose your university and confirm consent.'],
    };
    const code=error.error_code||error.errors?.[0]?.code;
    if(messages[code])return tr(...messages[code]);
    if(status===401)return tr('Сессия истекла. Откройте приложение заново.','Your session has expired. Open the app again.');
    if(status===403)return tr('У вас нет доступа к этому действию.','You do not have access to this action.');
    if(status===404)return tr('Эта запись недоступна. Откройте текущий план.','This record is unavailable. Open your current plan.');
    if(status===409)return tr('Данные изменились. Проверьте историю и обновите план.','The data has changed. Check History and refresh your plan.');
    if(status===422)return tr('Проверьте поля формы. Данные не сохранены.','Check the form fields. Data was not saved.');
    return tr('Не удалось получить подтверждение. Проверьте соединение и повторите попытку.','We could not get confirmation. Check your connection and try again.');
}
function displayDate(value) {
    if(!value)return tr('Дата пока неизвестна','Date not known yet');
    if(/^\d{4}-\d{2}-\d{2}T/.test(value)) {
        const date=new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value)?value:value+'+03:00');
        return date.toLocaleString(lang==='en'?'en-GB':'ru-RU',{day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'})+' '+tr('МСК','Moscow time');
    }
    return formatDate(value);
}
function eventPayloadText(type,key,value) {
    const field=key==='status'?(type==='enrolment_changed'?'study_status':'migration_basis'):key==='from_residence_type'?'residence_type':key;
    const label=key==='from_residence_type'?tr('Прежнее место проживания','Previous residence'):fieldLabels[field]?tr(...fieldLabels[field]):tr('Дополнительные сведения','Additional information');
    return {label,value:profileValue(field,{[field]:value})};
}
function remainingDocuments(t) {
    return t.missing_documents?.length?t.missing_documents.map(i=>content(t.documents_i18n)?.[i]||tr('Позиция из прежнего списка документов','Item from the previous document list')).join('; '):tr('Какие документы ещё нужны — пока не указано','The remaining documents have not been specified');
}
function taskDisplayTitle(t) {
    if(t.user_status==='completed'&&t.engine_status!=='requires_recheck') {
        if(t.process==='entry_context')return tr('Дата и цель въезда указаны','Entry date and purpose recorded');
        if(t.reported_outcome)return resultActionLabel(t,t.reported_outcome);
    }
    return content(t.title_i18n);
}
function taskInstruction(t) {
    const outcome=t.reported_outcome, process=t.process;
    if(t.engine_status==='requires_recheck')return tr('Проверьте результат повторно. Прежняя отметка сохранена в истории.','Check this result again. Your previous report is kept in History.');
    if(t.availability==='past')return content(t.availability_reason_i18n)||tr('Этот пункт больше не требует действий.','No further action is needed for this item.');
    if(outcome==='question_sent')return tr('Вы отметили отправку вопроса. Ждёте ответ; когда получите его, отметьте результат здесь.','You recorded sending a question. You are waiting for an answer; record it here when it arrives.');
    if(outcome==='clarified')return tr('Вы отметили получение ответа. Порядок дальнейших действий и применимость процедуры ещё нужно проверить.','You recorded receiving an answer. The next steps and whether the procedure applies still need checking.');
    if(outcome==='question')return tr('Вы отметили ошибку или вопрос. Опишите отделу, в каком документе возникло расхождение. После ответа можно снова сообщить результат проверки.','You reported an error or question. Tell the office which document has a discrepancy. After their answer, you can record a new check result.');
    if(outcome==='partial')return t.missing_documents?.length?tr('Часть документов передана. Передайте оставшиеся документы из списка ниже.','Some documents have been submitted. Submit the remaining documents listed below.'):tr('Часть документов передана. Какие документы ещё нужно передать — пока не указано.','Some documents have been submitted. The remaining documents have not been specified.');
    if(t.workflow_status==='waiting') {
        if(process==='invitation')return tr('Запрос уже отправлен. Когда получите приглашение, нажмите «Приглашение получено».','Your request has been sent. When your invitation arrives, select “Invitation received”.');
        if(process?.includes('visa'))return tr('Документы на визу поданы. Когда получите визу, отметьте «Виза получена». Дату окончания можно указать, если она известна.','Your visa documents have been submitted. When you receive your visa, select “Visa received”. Add its expiry date if known.');
        if(process?.includes('registration'))return tr('Документы на регистрацию поданы. Когда получите документ, нажмите «Регистрация получена». Дату окончания можно добавить отдельно.','Your registration documents have been submitted. When you receive the document, select “Registration received”. You can add the expiry date separately.');
    }
    if(t.user_status==='completed') {
        return ({invitation:tr('Вы отметили получение приглашения. Следующий шаг — подача документов на визу, если он доступен в плане.','You recorded receiving your invitation. Apply for your visa next if that step is available in your plan.'),
            initial_visa:tr('Вы отметили получение визы. Проверьте её данные; подготовка поездки доступна в плане.','You recorded receiving your visa. Check its details; trip preparation is available in your plan.'),
            trip:tr('Подготовка отмечена как завершённая. Когда въедете в Россию, сообщите дату въезда.','You marked trip preparation as complete. Record your entry date after entering Russia.'),
            entry_context:tr('Дата и цель въезда указаны.','Entry date and purpose recorded.'),
            documents:tr('Вы отметили, что документы сверены и расхождений нет.','You reported checking your documents and finding no discrepancies.'),
            office:tr('Вы отметили передачу всего комплекта. Получение регистрации отмечается отдельно.','You reported submitting the full set of documents. Record registration receipt separately.'),
            registration:tr('Вы отметили получение регистрации по нынешнему месту проживания. Дату окончания можно добавить отдельно.','You reported receiving registration at your current residence. You can add the expiry date separately.'),
            visa_renewal:tr('Вы отметили получение новой визы. Её срок отображается в плане, если известен.','You reported receiving a new visa. Its expiry appears in your plan if known.'),
            registration_renewal:tr('Вы отметили получение новой регистрации. Её срок отображается в плане, если известен.','You reported receiving new registration. Its expiry appears in your plan if known.')})[process]||content(t.action_i18n);
    }
    if(['conditional','needs_review'].includes(t.engine_status)) {
        if(t.family==='M06')return tr('Уточните в указанном отделе, нужно ли вам проходить дактилоскопию и фотографирование и где их пройти. Если они требуются, пройдите их и сохраните документ о прохождении.','Ask the office listed here whether you need fingerprinting and photographs and where to have them taken. If they are required, complete them and keep the confirmation document.');
        if(t.family==='M05')return tr('Уточните в указанном отделе, нужно ли вам проходить медицинское освидетельствование и где его пройти. Если оно требуется, пройдите его и сохраните выданные медицинские документы.','Ask the office listed here whether you need a medical examination and where to have it. If it is required, complete it and keep the medical documents issued to you.');
        if(t.family==='M10')return tr('Уточните в указанном отделе, нужно ли вам проходить повторное медицинское освидетельствование и где его пройти. Если оно требуется, пройдите его и сохраните новые медицинские документы.','Ask the office listed here whether you need a repeat medical examination and where to have it. If it is required, complete it and keep your new medical documents.');
    }
    return content(t.action_i18n);
}
function resultOccurredAt(original,outcome,editingDate,value) {
    // New reports never inherit hidden dates from drafts or another outcome.
    if(!original || original.outcome!==outcome)return null;
    return editingDate ? value||null : original.occurred_at||null;
}
function resultFormHint(t,outcome) {
    if(outcome==='question_sent')return tr('Отправьте вопрос в отдел самостоятельно. Здесь можно отметить, что вы это сделали.','Send your question to the office yourself. Here you can record that you have done so.');
    if(outcome==='clarified')return tr('Получение ответа не подтверждает применимость процедуры.','Receiving an answer does not confirm that the procedure applies.');
    return '';
}
function documentListView(t) {
    const documents=content(t.documents_i18n)||[];
    const instructions=t.document_instruction_indices||[];
    const listed=documents.filter((_,i)=>!instructions.includes(i));
    return `${instructions.length?`<p>${esc(content(t.document_note_i18n))}</p>`:''}${t.document_guidance_i18n?`<p>${esc(content(t.document_guidance_i18n))}</p>`:''}${listed.length?`<ul class="task-documents">${listed.map(d=>`<li>${esc(d)}</li>`).join('')}</ul>`:''}`;
}
function documentDateLabel(d) {
    const anchor=d.anchor_field||'';
    return anchor==='visa_expiry'?tr('Окончание визы','Visa expiry'):anchor==='registration_expiry'?tr('Окончание регистрации','Registration expiry'):anchor==='stay_expiry'?tr('Окончание разрешённого пребывания','Permitted stay expiry'):tr('Окончание документа','Document expiry');
}

function sourceTitle(s) { return content(s.title_i18n)||s.title||''; }
function sourceSection(s) {
    const label=content(s.section_label_i18n)||s.section_label||'';
    return s.section_label&&label!==s.section_label?label+' — '+tr('Заголовок на странице: ','Page section title: ')+'«'+s.section_label+'»':label;
}
function sourceCheckedDate(s) { return s.checked_at?formatDate(s.checked_at):tr('Не проверено','Not verified'); }
function sourceSummary(s) {
    return [sourceTitle(s),s.official_url,sourceSection(s),content(s.purpose_i18n),
        tr('Содержание источника проверяли: ','Source content checked: ')+sourceCheckedDate(s),
        s.navigation_verified&&s.navigation_checked_at?tr('Раздел на странице проверяли: ','Page section checked: ')+formatDate(s.navigation_checked_at):'',
        content(s.verification_note_i18n)].filter(Boolean).join('\n');
}

function questionTitle(field) {
    const questions={entry_at:['Когда вы в последний раз въехали в Россию?','When did you last enter Russia?'],arrival_at:['Когда вы прибыли в Санкт-Петербург?','When did you arrive in St Petersburg?'],visa_expiry:['До какой даты действует виза?','When does your visa expire?'],registration_expiry:['До какой даты действует регистрация?','When does your registration expire?'],stay_expiry:['До какой даты вам разрешено пребывание?','Until when are you permitted to stay?'],preparation_state:['На каком этапе приглашение?','What is your invitation status?'],entry_purpose:['Какая цель въезда указана в документах?','What entry purpose is recorded in your documents?'],age_band:['Вам уже исполнилось 18 лет?','Are you 18 or older?'],migration_basis:['На каком основании вы находитесь в России?','What is the basis for your stay in Russia?'],study_status:['Какой у вас учебный статус?','What is your study status?'],residence_type:['Где вы сейчас живёте?','Where do you live now?'],citizenship:['Какое у вас гражданство?','What is your citizenship?'],visa_regime:['Вы въехали по визе или без визы?','Did you enter with or without a visa?'],planned_entry:['Когда вы планируете въезд?','When do you plan to enter Russia?']};
    return questions[field]?tr(...questions[field]):tr('Уточните: ','Please clarify: ')+(fieldLabels[field]?tr(...fieldLabels[field]):tr('вашу ситуацию','your situation'));
}
function questionButton(field) {
    return ['entry_at','arrival_at','visa_expiry','registration_expiry','stay_expiry','planned_entry','education_start','last_medical_completed_at'].includes(field)?tr('Указать дату','Add date'):tr('Ответить','Answer');
}
function timingExplanation(d) {
    const reasons={anchor_missing:['Сначала укажите дату, от которой считается этот срок.','First add the date this interval starts from.'],applicability_unverified:['Применимость к вашей ситуации нужно проверить; персональная дата пока не рассчитана.','Applicability needs checking; a personal date has not been calculated.'],working_calendar_unavailable:['Для точной даты нужен проверенный календарь рабочих дней. Уточните дату обращения в отделе.','An exact date requires a verified working-day calendar. Confirm the submission date with the office.'],office_schedule_unavailable:['Уточните время обращения с учётом графика отдела.','Confirm when to visit, taking the office schedule into account.'],literal_only:['Ориентируйтесь на указанный интервал; точную дату уточните в отделе.','Use the stated interval and confirm the exact date with the office.']};
    return d.computed_at?'':tr(...(reasons[d.calculation_status]||reasons.literal_only));
}
function taskContextLabel(t) {
    const c=t.context_dates;
    if(!c)return '';
    const parts=[];
    // Older persisted revisions also attached document context before receipt.
    const documentKnown=c.document_kind&&(t.process!=='initial_visa'||c.document_expiry||t.reported_outcome==='received'||t.auto_completed||t.user_status==='completed');
    if(documentKnown)parts.push(c.document_expiry?(c.document_kind==='visa'?tr('Виза до ','Visa valid until '):tr('Регистрация до ','Registration valid until '))+formatDate(c.document_expiry):(c.document_kind==='visa'?tr('Срок действия визы пока неизвестен','Visa expiry date not known yet'):tr('Срок действия регистрации пока неизвестен','Registration expiry date not known yet')));
    else if(c.medical_completed_at)parts.push(tr('После медосмотра от ','Following the examination on ')+formatDate(c.medical_completed_at));
    else if(c.residence_event_at)parts.push(tr('Изменение проживания от ','Residence change on ')+formatDate(c.residence_event_at));
    else if(c.entry_at)parts.push(tr('Въезд ','Entry on ')+formatDate(c.entry_at));
    if(t.engine_status==='superseded')parts.unshift(tr('Прежнее действие','Previous task'));
    return parts.join(' · ');
}
function eventForField(field,f) {
    return {study_status:'enrolment_changed',migration_basis:'status_changed',visa_expiry:'visa_issued',registration_expiry:'registration_confirmed',fingerprinting_completed:'fingerprinting_completed',last_medical_completed_at:'medical_completed',entry_at:f.entry_at?'reentry_recorded':'entry_recorded',residence_type:'address_changed'}[field];
}
function errorRecovery(code) {
    return code==='result_already_recorded'||code==='correction_inactive'?{name:'history',label:tr('Открыть историю','Open history')}:code==='result_unavailable'||code==='superseded_task'?{name:'plan',label:tr('Обновить план','Refresh plan')}:null;
}
