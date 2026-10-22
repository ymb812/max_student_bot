const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const RoadmapView=require('../app/static/roadmap-view.js');
const source=fs.readFileSync(path.join(__dirname,'../app/static/student-ui.js'),'utf8');

function render(tasks,language='ru') {
    const handlers={};
    const context=vm.createContext({
        dataQuestions:()=>RoadmapView.dataQuestions(tasks,{entry_at:'2026-10-01',arrival_status:'arrived'},['registration_expiry','visa_expiry']),questionWaiting:()=>false,fieldLabels:{registration_expiry:['Срок регистрации','Registration expiry'],visa_expiry:['Срок визы','Visa expiry']},editableFields:()=>['registration_expiry','visa_expiry'],RoadmapView,lang:language,plan:{tasks,hero_task_key:tasks[0]?.task_key},root:{innerHTML:''},
        route:{stage:'arrival'},stageNames:{before:['До приезда','Before arrival'],arrival:['После приезда','After arrival'],study:['Во время учёбы','During studies']},
        sessionStorage:{getItem:()=>null},sessionScope:()=>'test',
        effectiveProfile:()=>({entry_at:'2026-10-01',arrival_status:'arrived'}),
        tr:(ru,en)=>language==='en'?en:ru,content:x=>x?.[language]||'',esc:x=>String(x??''),
        shell:x=>x,heading:x=>`<h1>${x}</h1>`,icon:()=>'',stageIcon:()=>'',universityName:()=>'ЛЭТИ',visaName:()=>'',
        shortTiming:()=>'',formatDate:x=>x,wireShell:()=>{},wireTasks:()=>{},renderProfile:()=>{},
        familyIcon:()=>'',workflowLabel:()=>'',taskTiming:()=>null,empty:x=>x,
        document:{querySelector:selector=>({addEventListener:(event,fn)=>handlers[selector]=fn}),querySelectorAll:()=>[]},
        resolveTask:t=>{context.resolved=t.task_key;},navigate:()=>{},taskDetail:()=>{}
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../app/static/student-copy.js'),'utf8'),context);
    vm.runInContext(source.slice(source.indexOf('function stageProgress('),source.indexOf('function stagesView(')),context);
    vm.runInContext(source.slice(source.indexOf('function compactTask('),source.indexOf('function clarificationsView(')),context);
    return {context,handlers};
}
const task=(key,extra={})=>({task_key:key,semantic_action_key:key,presentation_stage:'arrival',engine_status:'actionable',user_status:'completed',source_snapshot:[],title_i18n:{ru:key,en:key},dates:[],...extra});

test('rendered stage does not show a full progress bar while a question is unresolved',()=>{
    const tasks=[task('documents',{engine_status:'needs_review',user_status:'in_progress'}),task('entry'),task('office'),task('registration')];
    for(const lang of ['ru','en']) {
        const {context}=render(tasks,lang);
        vm.runInContext('stageView()',context);
        assert.doesNotMatch(context.root.innerHTML,/<progress/);
        assert.match(context.root.innerHTML,lang==='ru'?/Ещё нужно уточнить или проверить: 1/:/Other items to clarify or review: 1/);
    }
});

test('data requests follow the full roadmap and do not displace an available action',()=>{
    const renewal=task('renewal',{presentation_stage:'study',engine_status:'conditional',user_status:'not_started',missing_fields:['registration_expiry'],dates:[]});
    const action=task('office',{user_status:'not_started',priority_rank:1});
    for(const lang of ['ru','en']) {
        const {context}=render([renewal,action],lang);
        vm.runInContext('homeView()',context);
        assert.match(context.root.innerHTML,/data-task="office"/);
        assert.match(context.root.innerHTML,/class="data-summary"/);
        assert.doesNotMatch(context.root.innerHTML,/clarification-summary|warning-icon|context-date|data-hero-clarification/);
        assert.ok(context.root.innerHTML.indexOf('data-summary')>context.root.innerHTML.indexOf('hero-card'));
        assert.ok(context.root.innerHTML.indexOf('data-summary')>context.root.innerHTML.indexOf('data-stage="study"'));
        assert.doesNotMatch(context.root.innerHTML,/id="all-stages"/);
    }
});

test('a current question is promoted only when no action is available; deferred questions stay below',()=>{
    const tasks=[task('missing',{engine_status:'conditional',user_status:'not_started',missing_fields:['registration_expiry']})];
    const {context,handlers}=render(tasks);
    vm.runInContext('homeView()',context);
    assert.match(context.root.innerHTML,/id="hero-question"/);
    assert.match(context.root.innerHTML,/До какой даты действует регистрация\?/);
    context.navigate=next=>{context.opened=next;};
    handlers['#hero-question']();
    assert.equal(context.opened.name,'clarify');
    assert.equal(context.opened.field,'registration_expiry');
    context.questionWaiting=()=>true;
    vm.runInContext('homeView()',context);
    assert.doesNotMatch(context.root.innerHTML,/id="hero-question"/);
    assert.match(context.root.innerHTML,/id="hero-stages"/);
    assert.match(context.root.innerHTML,/class="data-summary"/);
});

test('waiting hero does not repeat its instructions or an already-used preparation prompt',()=>{
    const {context}=render([task('invitation',{process:'invitation',user_status:'in_progress',workflow_status:'waiting',waiting_i18n:{ru:'Приглашение придёт на e-mail из анкеты.'},dates:[{kind:'preparation_start',computed_at:'2026-10-01',literal:{ru:'OLD PREPARATION'}}]})]);
    vm.runInContext('homeView()',context);
    assert.match(context.root.innerHTML,/Ждёте приглашение/);
    assert.match(context.root.innerHTML,/Приглашение придёт на e-mail из анкеты/);
    assert.doesNotMatch(context.root.innerHTML,/LONG INSTRUCTION|OLD PREPARATION|Ожидается результат|next-label/);
});

test('completed actions remain visible while rechecks stay with current work',()=>{
    const tasks=[task('completed-office'),task('recheck',{engine_status:'requires_recheck'}),task('future',{user_status:'not_started',availability:'future',availability_reason_i18n:{ru:'После получения визы',en:'After receiving a visa'}})];
    for(const lang of ['ru','en']) {
        const {context}=render(tasks,lang);
        vm.runInContext('stageView()',context);
        const html=context.root.innerHTML;
        assert.doesNotMatch(html,/<details/);
        assert.match(html,/data-task="completed-office"/);
        assert.ok(html.indexOf('data-task="recheck"')<html.indexOf('completed-tasks'));
        assert.match(html,lang==='ru'?/После получения визы/:/After receiving a visa/);
        assert.doesNotMatch(html,/Полезная информация|Useful information| · /);
    }
});
