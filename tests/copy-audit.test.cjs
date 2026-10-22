const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const RoadmapView=require('../app/static/roadmap-view.js');
const read=name=>fs.readFileSync(path.join(__dirname,'../app/static',name),'utf8');
function context(language='ru') {
 const ui=read('student-ui.js'),student=read('student.js');
 const ctx=vm.createContext({lang:language,plan:{tasks:[]},tr:(ru,en)=>language==='en'?en:ru,content:x=>x?.[language]||'',formatDate:x=>x,esc:x=>String(x??''),effectiveProfile:()=>({}),RoadmapView,
  states:{actionable:['Можно действовать','Ready to act']},statuses:{not_started:['Не начато','Not started']}});
 vm.runInContext(student.slice(student.indexOf('const fieldLabels'),student.indexOf('function eventFormView')),ctx);
 vm.runInContext(ui.slice(ui.indexOf('const extraFieldNames'),ui.indexOf('function profileView')),ctx);
 vm.runInContext(read('adaptive-ui.js').slice(read('adaptive-ui.js').indexOf('function workflowLabel'),read('adaptive-ui.js').indexOf('function resolveTask')),ctx);
 vm.runInContext(read('student-copy.js'),ctx);
 return ctx;
}
test('invitation profile projects saved request and receipt, without changing the baseline',()=>{
 for(const language of ['ru','en']) {
  const c=context(language);c.plan.tasks=[{process:'invitation',engine_status:'actionable',reported_outcome:'requested',workflow_status:'waiting'}];
  const before={preparation_state:'unknown'};c.f=before;
  assert.match(vm.runInContext("profileValue('preparation_state',f)",c),language==='ru'?/Ждёте приглашение/:/Waiting for your invitation/);
  c.plan.tasks[0].reported_outcome='received';c.plan.tasks[0].workflow_status='completed';
  assert.equal(vm.runInContext("profileValue('preparation_state',f)",c),language==='ru'?'Приглашение получено':'Invitation received');
  assert.equal(before.preparation_state,'unknown');
 }
});
test('question waiting and answered question never claim document receipt or repeat submission',()=>{
 for(const language of ['ru','en']) for(const process of ['invitation','initial_visa','registration','documents','consultation']) {
  const c=context(language);c.t={process,workflow_status:'waiting',reported_outcome:'question_sent',engine_status:'actionable',action_i18n:{ru:'Отправьте запрос',en:'Send request'}};
  assert.match(vm.runInContext('workflowLabel(t)',c),language==='ru'?/ответ на вопрос/:/answer to your question/);
  assert.doesNotMatch(vm.runInContext('taskInstruction(t)',c),/Отправьте запрос|Send request/);
  c.t.reported_outcome='clarified';c.t.workflow_status='needs_help';
  assert.match(vm.runInContext('workflowLabel(t)',c),language==='ru'?/Ответ получен/:/Answer received/);
 }
});
test('history formats both event status domains, residence enums, nulls and Moscow datetime',()=>{
 for(const language of ['ru','en']) {
  const c=context(language);
  for(const expression of ["eventPayloadText('address_changed','from_residence_type','dorm')","eventPayloadText('address_changed','residence_type','private')","eventPayloadText('enrolment_changed','status','transferred')","eventPayloadText('status_changed','status','rvpo')"]){
   const value=vm.runInContext(expression,c);assert.doesNotMatch(value.label+' '+value.value,/from_residence_type|\bdorm\b|\bprivate\b|\btransferred\b|\brvpo\b/);
  }
  assert.doesNotMatch(vm.runInContext("displayDate('2026-10-11T12:00')",c),/2026-10-11T/);
  assert.match(vm.runInContext("displayDate('2026-10-11T12:00')",c),/12:00/);
 }
});
test('partial list distinguishes unknown remainder from an explicit document',()=>{
 const c=context();c.t={missing_documents:[],documents_i18n:{ru:['Копия паспорта']}};
 assert.match(vm.runInContext('remainingDocuments(t)',c),/пока не указано/);
 c.t.missing_documents=[0];assert.equal(vm.runInContext('remainingDocuments(t)',c),'Копия паспорта');
});
test('stable error codes localize validation and unknown errors never leak server detail',()=>{
 for(const language of ['ru','en']) {
  const c=context(language);
  const msg=vm.runInContext("apiErrorMessage({error_code:'result_predates_episode'},422)",c);
  assert.match(msg,language==='ru'?/Дата результата раньше/:/result date is earlier/);
  assert.doesNotMatch(vm.runInContext("apiErrorMessage({detail:'INTERNAL_RAW_TEXT'},500)",c),/INTERNAL_RAW_TEXT/);
  assert.match(vm.runInContext("apiErrorMessage({errors:[{code:'expiry_before_receipt'}]},422)",c),language==='ru'?/раньше даты получения/:/earlier than receipt/);
 }
});
test('new study event requires an explicit selection; corrections retain the recorded value',()=>{
 const c=context();c.plan.effective_profile={study_status:'active'};c.profile={};c.route={};c.today=()=> '2026-10-22';c.showDetail=s=>c.html=s;c.tr=(ru,en)=>ru;c.root={querySelector:()=>({})};
 c.document={querySelector:()=>({addEventListener:()=>{}})};c.guard=x=>x;c.writeLocation=()=>{};c.crypto={randomUUID:()=> 'test-key'};c.eventNames={enrolment_changed:['Изменение учебного статуса','Study status changed']};c.field=()=>'';
 const student=read('student.js');vm.runInContext(student.slice(student.indexOf('function option('),student.indexOf('function onboardingStorageKey')),c);
 vm.runInContext(student.slice(student.indexOf('function eventFormView('),student.indexOf('function reasonLabel(')),c);
 vm.runInContext("eventFormView('enrolment_changed')",c);
 assert.match(c.html,/<select required name="status"><option value="" selected>/);assert.doesNotMatch(c.html,/<option value="active" selected>/);
 c.original={payload:{status:'transferred'},occurred_at:'2026-10-18'};vm.runInContext("eventFormView('enrolment_changed',original)",c);assert.match(c.html,/<option value="transferred" selected>/);
});
