/* Presentation only: never computes a legal date or changes task eligibility. */
const RoadmapView = (() => {
    const stages = ['before', 'arrival', 'study'];
    const stage = task => stages.includes(task.presentation_stage) ? task.presentation_stage
        : ['M01', 'M02'].includes(task.family) ? 'before'
        : ['M07', 'M08', 'M10'].includes(task.family) ? 'study' : 'arrival';
    const current = (tasks, includeFuture=false) => {
        const seen = new Set();
        return tasks.filter(t => {
            if (!['actionable', 'requires_recheck'].includes(t.engine_status)) return false;
            if(t.availability==='past'||(!includeFuture&&t.availability==='future'))return false;
            const key = [t.semantic_action_key || t.task_key, t.episode_id, t.cycle_id].join('|');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    };
    const practicalDate = t => (t.dates || []).filter(d => d.kind !== 'document_expiry' && d.owner && d.computed_at)
        .map(d => d.computed_at).sort()[0] || '9999-12-31';
    const hero = tasks => tasks.filter(t=>t.engine_status!=='superseded'&&!['future','past'].includes(t.availability)).map((task, index) => ({task, index}))
        .filter(({task: t}) => t.user_status !== 'completed' || t.engine_status === 'requires_recheck')
        .sort((a, b) => ((a.task.priority_rank??9999)-(b.task.priority_rank??9999)) || ({now: 0, soon: 1, later: 2}[a.task.priority_bucket] - {now: 0, soon: 1, later: 2}[b.task.priority_bucket])
            || practicalDate(a.task).localeCompare(practicalDate(b.task)) || a.index - b.index || a.task.task_key.localeCompare(b.task.task_key))[0]?.task;
    const progress = (tasks, id) => {
        const eligible = current(tasks,true).filter(t => stage(t) === id);
        const completed = eligible.filter(t => t.engine_status === 'actionable' && t.user_status === 'completed').length;
        const unresolved=tasks.some(t=>stage(t)===id&&t.engine_status!=='superseded'&&t.availability!=='past'&&(t.availability==='future'||['conditional','needs_review','requires_recheck'].includes(t.engine_status)));
        const pending = new Set(tasks.filter(t=>stage(t)===id&&!['future','past'].includes(t.availability)&&['conditional','needs_review'].includes(t.engine_status)&&t.user_status!=='completed')
            .map(t=>[t.semantic_action_key||t.task_key,t.episode_id,t.cycle_id].join('|'))).size;
        const future=tasks.filter(t=>stage(t)===id&&t.engine_status!=='superseded'&&t.availability==='future').length;
        return {future,tasks: eligible, total: eligible.length, completed, pending, done: eligible.length > 0 && eligible.length === completed&&!unresolved};
    };
    const progressLabel = (p, language='ru') => {
        const en=language==='en';
        const count=p.completed===p.total?`${p.completed}`:(en?`${p.completed} of ${p.total}`:`${p.completed} из ${p.total}`);
        if(p.pending) return (p.total ? (en?`Actions completed: ${count}\n`:`Выполнено действий: ${count}\n`):'')
            +(en?`Other items to clarify or review: ${p.pending}`:`Ещё нужно уточнить или проверить: ${p.pending}`);
        return p.total?(en?`Completed ${p.completed} of ${p.total} actions`:`Выполнено ${p.completed} из ${p.total} действий`):p.future?(en?'Upcoming tasks depend on earlier steps or missing information':'Действия появятся после предыдущих шагов или уточнения данных'):(en?'No tasks in this section yet':'В этом разделе пока нет действий');
    };
    // Describe the server-selected task without changing its priority or eligibility.
    const heroPresentation = (t, profile) => {
        if(t.workflow_status==='waiting') {
            const waiting=t.reported_outcome==='question_sent'?['Ждёте ответ на вопрос','Waiting for an answer to your question']
                :t.process==='invitation'?['Ждёте приглашение','Waiting for your invitation']
                :t.process?.includes('visa')?['Ожидаете визу','Waiting for your visa']
                :t.process?.includes('registration')?['Ожидаете регистрацию','Waiting for your registration']
                :['Ожидаете ответ','Waiting for a response'];
            const note=t.waiting_i18n||(t.reported_outcome==='question_sent'
                ?{ru:'Ответ можно отметить в этой задаче.',en:'You can record the answer in this task.'}
                :t.process==='invitation'
                ?{ru:'Способ и срок получения уточните в отделе, куда отправили запрос.',en:'Ask the office that received your request when and how to collect your invitation.'}
                :t.process?.includes('visa')
                ?{ru:'Уточните готовность там, куда подали документы. Получение визы отметьте в задаче.',en:'Check with the office or consulate you applied to. Record receipt of your visa in the task.'}
                :t.process?.includes('registration')
                ?{ru:'Уточните готовность у принимающей стороны. Когда получите регистрацию, отметьте это в задаче.',en:'Check with your host. Record receipt in the task when you receive your registration.'}
                :{ru:'Уточните ответ у адресата вашего вопроса. Полученный ответ можно отметить в задаче.',en:'Follow up with the recipient of your question. You can record their response in the task.'});
            return {title:{ru:waiting[0],en:waiting[1]},note};
        }
        const expiry=(t.missing_fields||[]).filter(k=>['visa_expiry','registration_expiry'].includes(k));
        if(t.engine_status==='conditional'&&expiry.length===1&&t.missing_fields.length===1) {
            const visa=expiry[0]==='visa_expiry';
            return {clarify:true,title:{ru:visa?'Укажите срок окончания визы':'Укажите срок окончания регистрации',en:visa?'Add your visa expiry date':'Add your registration expiry date'},
                note:{ru:'Найдите дату окончания в документе. Она нужна, чтобы определить следующий шаг по продлению.',en:'Find the expiry date on your document so we can identify your next renewal step.'}};
        }
        if(t.process==='entry_context'&&!profile.entry_at&&profile.arrival_status!=='arrived')
            return {title:{ru:'Сообщите о въезде после приезда',en:'Report your entry after arrival'},note:t.availability_reason_i18n};
        return {title:t.title_i18n};
    };
    const visibleDates = t => (t.dates||[]).filter(d=>d.kind!=='document_expiry'||d.computed_at);
    // Preparation is no longer a prompt to submit after a request has been sent.
    // Actual action dates and document expiries remain distinct and visible.
    const heroDates = t => visibleDates(t).filter(d=>d.kind!=='preparation_start'||(t.workflow_status!=='waiting'&&d.computed_at));
    const currentStage = (tasks, profile) => !profile.entry_at ? (profile.arrival_status === 'arrived' ? 'arrival' : 'before')
        : tasks.filter(t=>(t.process?['entry_context','documents','office','registration'].includes(t.process):stage(t)==='arrival')&&t.engine_status!=='superseded'&&t.availability!=='past').some(t=>t.user_status!=='completed'||t.engine_status==='requires_recheck') ? 'arrival' : 'study';
    const clarifications = tasks => [...new Map(tasks.filter(t => ['conditional', 'needs_review'].includes(t.engine_status)&&!['future','past'].includes(t.availability)&&t.user_status!=='completed').map(t => [t.task_key, t])).values()];
    const dataQuestions = (tasks, profile, editable) => {
        const questions=new Map(), activeStage=currentStage(tasks,profile);
        for(const t of tasks) {
            if(t.engine_status!=='conditional'||['future','past'].includes(t.availability)||t.user_status==='completed')continue;
            for(const field of t.missing_fields||[]) {
                if(!editable.includes(field))continue;
                const value=profile[field];
                if(value!==null&&value!==undefined&&value!==''&&value!=='unknown')continue;
                const current=t.availability!=='future'&&(stage(t)===activeStage||t.priority_bucket==='now');
                const q=questions.get(field)||{field,tasks:[],current:false,rank:9999};
                q.tasks.push(t);q.current ||= current;q.rank=Math.min(q.rank,t.priority_rank??9999);questions.set(field,q);
            }
        }
        if(!profile.entry_at&&profile.arrival_status!=='arrived'&&!profile.planned_entry)
            questions.set('planned_entry',{field:'planned_entry',tasks:[],current:false,rank:10000});
        return [...questions.values()].sort((a,b)=>Number(b.current)-Number(a.current)||a.rank-b.rank||a.field.localeCompare(b.field));
    };
    // Keep server ordering among actions, but collect answerable data requests separately.
    const actionHero = (tasks, questions) => {
        const dataOnly=new Set(questions.flatMap(q=>q.tasks).filter(t=>!['waiting','needs_help'].includes(t.workflow_status)&&(t.missing_fields||[]).every(f=>questions.some(q=>q.field===f))).map(t=>t.task_key));
        return hero(tasks.filter(t=>!dataOnly.has(t.task_key)));
    };
    const stagePassed = (tasks, id, profile) => {
        if(id!=='before'||!(profile.entry_at||profile.arrival_status==='arrived'))return false;
        const p=progress(tasks,id);
        return !p.pending&&!p.future&&p.total===p.completed;
    };
    return {stages, stage, current, hero, actionHero, dataQuestions, progress, progressLabel, heroPresentation, visibleDates, heroDates, currentStage, stagePassed, clarifications};
})();
if (typeof module !== 'undefined') module.exports = RoadmapView;
