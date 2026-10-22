const {test} = require('node:test');
const assert = require('node:assert/strict');
const view = require('../app/static/roadmap-view.js');
const task = (key, overrides={}) => ({task_key:key,semantic_action_key:key,episode_id:'entry-1',cycle_id:'cycle-1',family:'M03',engine_status:'actionable',user_status:'not_started',priority_bucket:'now',dates:[],...overrides});

test('arrival closes the preparation phase without inventing completed tasks',()=>{
    const past=task('old',{presentation_stage:'before',availability:'past'});
    const tasks=[past];
    assert.equal(view.stagePassed(tasks,'before',{arrival_status:'arrived'}),true);
    assert.equal(view.progress(tasks,'before').done,false);
    assert.equal(past.user_status,'not_started');
    assert.equal(view.stagePassed(tasks,'before',{arrival_status:'planned'}),false);
    assert.equal(view.stagePassed(tasks,'arrival',{entry_at:'2026-10-01'}),false);
    assert.equal(view.stagePassed([...tasks,task('open',{presentation_stage:'before'})],'before',{entry_at:'2026-10-01'}),false);
    assert.equal(view.stagePassed([...tasks,task('review',{presentation_stage:'before',engine_status:'needs_review'})],'before',{entry_at:'2026-10-01'}),false);
});
test('urgent M07 is hero while arrival remains current; M07/M08 always default to study',()=>{
    const visa=task('visa',{family:'M07',dates:[{kind:'university_submission_deadline',owner:'university',computed_at:'2026-10-05'}]});
    const tasks=[task('office'),visa,task('registration',{family:'M08'})];
    assert.equal(view.currentStage(tasks,{entry_at:'2026-09-12'}),'arrival');
    assert.equal(view.hero(tasks).task_key,'visa');
    assert.equal(view.stage(visa),'study');
    assert.equal(view.stage(tasks[2]),'study');
    assert.equal(view.progress(tasks,'arrival').total,1);
});
test('bucket wins over a date from a later bucket; expiry is not a practical date',()=>{
    const tasks=[task('now'),task('soon',{priority_bucket:'soon',dates:[{kind:'legal_deadline',owner:'state',computed_at:'2026-01-01'}]})];
    assert.equal(view.hero(tasks).task_key,'now');
    assert.equal(view.hero([task('a'),task('b',{dates:[{kind:'document_expiry',owner:'user',computed_at:'2026-01-01'}]})]).task_key,'a');
});
test('progress deduplicates current actions and excludes uncertainty, superseded and old completion',()=>{
    const tasks=[task('done',{user_status:'completed'}),task('done',{user_status:'completed'}),task('recheck',{user_status:'completed',engine_status:'requires_recheck'}),task('conditional',{engine_status:'conditional'}),task('review',{engine_status:'needs_review'}),task('old',{engine_status:'superseded',user_status:'completed'})];
    const p=view.progress(tasks,'arrival');
    assert.equal(p.total,2);assert.equal(p.completed,1);assert.equal(p.done,false);
    assert.equal(view.hero(tasks).task_key,'recheck');
    assert.equal(view.clarifications(tasks).length,2);
});
test('new episodes reopen progress and empty stages are not complete',()=>{
    assert.equal(view.progress([],'study').done,false);
    assert.equal(view.hero([task('done',{user_status:'completed'})]),undefined);
    const tasks=[task('old',{engine_status:'superseded',user_status:'completed'}),task('new',{episode_id:'entry-2'})];
    assert.equal(view.progress(tasks,'arrival').completed,0);
});
test('situation without an entry date is presentation only; actual entry and tasks take precedence',()=>{
    assert.equal(view.currentStage([],{arrival_status:'arrived',entry_at:null}),'arrival');
    assert.equal(view.currentStage([],{arrival_status:'planned',entry_at:null}),'before');
    assert.equal(view.currentStage([task('office')],{arrival_status:'planned',entry_at:'2026-09-01'}),'arrival');
    assert.equal(view.progress([],'before').done,false);
});
test('manual completion selects the next actual task and can be undone in an earlier stage',()=>{
    const tasks=[task('border',{family:'M02'}),task('office')];
    assert.equal(view.hero(tasks).task_key,'border');
    tasks[0].user_status='completed';
    assert.equal(view.hero(tasks).task_key,'office');
    assert.equal(view.progress(tasks,'before').done,true);
    tasks[0].user_status='not_started';
    assert.equal(view.progress(tasks,'before').done,false);
    assert.equal(view.hero(tasks).task_key,'border');
});
test('server priority is shared by hero and future work cannot falsely complete a stage',()=>{
    const tasks=[task('future',{availability:'future',priority_rank:0,presentation_stage:'before'}),task('done',{user_status:'completed',presentation_stage:'before'}),task('renewal',{family:'M07',priority_rank:1}),task('office',{priority_rank:2})];
    assert.equal(view.hero(tasks).task_key,'renewal');
    assert.equal(view.progress(tasks,'before').done,false);
});
test('open medical review stays visible after arrival tasks and does not block study context',()=>{
    const tasks=['entry_context','documents','office','registration'].map(process=>task(process,{process,presentation_stage:'arrival',user_status:'completed'}));
    tasks.push(task('medical',{process:'consultation',presentation_stage:'arrival',engine_status:'needs_review'}));
    assert.equal(view.currentStage(tasks,{entry_at:'2026-10-01'}),'study');
    assert.equal(view.progress(tasks,'arrival').done,false);
    assert.equal(view.clarifications(tasks)[0].task_key,'medical');
});

test('reporting a document question keeps unresolved work explicit without counting it as mandatory',()=>{
    const completed=['entry','office','registration'].map(k=>task(k,{user_status:'completed'}));
    const documents=task('documents');
    assert.equal(view.progressLabel(view.progress([...completed,documents],'arrival')),'Выполнено 3 из 4 действий');
    const review={...documents,engine_status:'needs_review',user_status:'in_progress'};
    const p=view.progress([...completed,review,review],'arrival');
    assert.equal(p.total,3);
    assert.equal(p.pending,1);
    assert.equal(p.done,false);
    assert.equal(view.progressLabel(p),'Выполнено 3 действий · Ещё нужно уточнить или проверить: 1');
    assert.match(view.progressLabel(p,'en'),/Other items to clarify or review: 1/);
    assert.doesNotMatch(view.progressLabel(view.progress([review],'arrival')),/Нет текущих/);
    assert.equal(view.progress([...completed,{...review,availability:'past'}],'arrival').pending,0);
});

test('unknown document expiry offers a targeted clarification and never prints a fact as a date',()=>{
    for(const field of ['visa_expiry','registration_expiry']) {
        const renewal=task('renewal',{engine_status:'conditional',missing_fields:[field],dates:[
            {kind:'document_expiry',computed_at:null,literal:{ru:'факт по данным пользователя'}},
            {kind:'university_submission_deadline',computed_at:null,literal:{ru:'45 рабочих дней'}}]});
        const copy=view.heroPresentation(renewal,{});
        assert.equal(copy.clarify,true);
        assert.match(copy.title.ru,/Укажите срок окончания/);
        assert.equal(view.visibleDates(renewal).length,1);
        renewal.dates[0].computed_at='2026-11-05';
        assert.equal(view.visibleDates(renewal).length,2);
        assert.equal(view.heroPresentation({...renewal,engine_status:'needs_review'},{}).clarify,undefined);
    }
});

test('trip completion never describes a planned entry as an existing fact',()=>{
    const entry=task('entry',{process:'entry_context',title_i18n:{ru:'Укажите дату и цель въезда'},availability_reason_i18n:{ru:'После фактического въезда'}});
    assert.equal(view.heroPresentation(entry,{arrival_status:'planned'}).title.ru,'Сообщите о въезде после приезда');
    assert.equal(view.heroPresentation(entry,{arrival_status:'arrived'}).title,entry.title_i18n);
});

test('compact waiting presentation preserves actual deadlines and expiry without old preparation',()=>{
    const dates=[{kind:'preparation_start',computed_at:'2026-10-01'},{kind:'university_submission_deadline',computed_at:'2026-10-25'},{kind:'document_expiry',computed_at:'2026-11-01'},{kind:'legal_deadline',computed_at:null,literal:{ru:'24 часа'}}];
    for(const process of ['invitation','initial_visa','visa_renewal','registration','registration_renewal','consultation']) {
        const t=task(process,{process,workflow_status:'waiting',dates});
        assert.ok(view.heroPresentation(t,{}).note.ru.length>0);
        assert.ok(view.heroPresentation(t,{}).note.en.length>0);
        assert.match(view.heroPresentation(t,{}).title.ru,/Ждёте|Ожидаете/);
        assert.deepEqual(view.heroDates(t),dates.slice(1));
        assert.deepEqual(view.visibleDates(t),dates);
    }
    assert.deepEqual(view.heroDates(task('active',{dates})),dates);
});
