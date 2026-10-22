const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const RoadmapView=require('../app/static/roadmap-view.js');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app/static/student-copy.js'),'utf8');
function ctx(en=false){const c=vm.createContext({tr:(ru,enText)=>en?enText:ru,formatDate:x=>x,fieldLabels:{},content:x=>x?.[en?'en':'ru']||''});vm.runInContext(source,c);return c;}
test('future-only conditional stages explain dependencies instead of saying no tasks',()=>{
 const tasks=[{task_key:'pending',family:'M07',presentation_stage:'study',availability:'future',engine_status:'conditional',user_status:'not_started'}];
 const p=RoadmapView.progress(tasks,'study');assert.equal(p.future,1);assert.equal(p.done,false);
 assert.match(RoadmapView.progressLabel(p,'ru'),/после предыдущих шагов/);
 assert.match(RoadmapView.progressLabel(p,'en'),/depend on earlier steps/);
 assert.doesNotMatch(RoadmapView.progressLabel(p,'en'),/No tasks/);
});
test('timing explanations distinguish calendar, missing anchor and legal review',()=>{
 for(const en of [false,true]){const c=ctx(en),outputs=[];
  for(const reason of ['anchor_missing','working_calendar_unavailable','applicability_unverified']){c.d={calculation_status:reason};outputs.push(vm.runInContext('timingExplanation(d)',c));}
  assert.equal(new Set(outputs).size,3);assert.ok(outputs.every(Boolean));
  c.d={computed_at:'2026-12-01'};assert.equal(vm.runInContext('timingExplanation(d)',c),'');
 }
});
test('cycle captions use saved context, not current profile or internal identifiers',()=>{
 const c=ctx();c.t={context_dates:{document_kind:'visa',document_expiry:'2027-01-20'},cycle_id:'secret-internal-id'};
 assert.equal(vm.runInContext('taskContextLabel(t)',c),'Виза до 2027-01-20');
 c.t.engine_status='superseded';assert.match(vm.runInContext('taskContextLabel(t)',c),/^Прежнее действие/);
 c.t.context_dates.document_expiry=null;assert.doesNotMatch(vm.runInContext('taskContextLabel(t)',c),/null|secret-internal-id/);
});
test('profile routes status changes to events and known recoverable errors to history or plan',()=>{
 const c=ctx();assert.equal(vm.runInContext("eventForField('study_status',{})",c),'enrolment_changed');
 assert.equal(vm.runInContext("eventForField('migration_basis',{})",c),'status_changed');
 assert.equal(vm.runInContext("eventForField('entry_at',{entry_at:'2026-10-10'})",c),'reentry_recorded');
 assert.equal(vm.runInContext("errorRecovery('result_already_recorded').name",c),'history');
 assert.equal(vm.runInContext("errorRecovery('result_unavailable').name",c),'plan');
 assert.equal(vm.runInContext("errorRecovery('unknown')",c),null);
});
test('a timing row preserves its source explanation once and still shows a computed date',()=>{
 const c=ctx();c.esc=String;c.unitLabel=()=>'';c.timingLabel=()=>'';
 const student=fs.readFileSync(require('node:path').join(__dirname,'../app/static/student.js'),'utf8');
 vm.runInContext(student.slice(student.indexOf('function taskDateDetails('),student.indexOf('function taskInformationView(')),c);
 c.d={kind:'legal_deadline',owner:'state',literal:{ru:'Применимость не проверена — персональная дата не рассчитана.'},literal_explains_calculation:true};
 const html=vm.runInContext('taskDateDetails(d,{})',c);
 assert.equal((html.match(/не рассчитана/g)||[]).length,1);assert.doesNotMatch(html,/Ориентируйтесь на указанный интервал/);
 c.d.computed_at='2026-12-01';assert.match(vm.runInContext('taskDateDetails(d,{})',c),/2026-12-01/);
});

test('revision details translate contacts and sources and disclose missing verification',()=>{
 const ui=fs.readFileSync(require('node:path').join(__dirname,'../app/static/student-ui.js'),'utf8');
 for(const en of [false,true]) {
  const c=ctx(en);c.esc=String;c.workflowLabel=()=>'';c.shortTiming=()=>'';
  vm.runInContext(ui.slice(ui.indexOf('function revisionDetails('),ui.indexOf('async function resultView(')),c);
  const before={source_snapshot:[],contact:'',rule_version:1};
  c.change={before,after:{...before,contact:'Русский исходный контакт',contact_i18n:{ru:'Отдел приглашений',en:'Invitation office'},source_snapshot:[{
   title:'Русское исходное название',title_i18n:{ru:'Приглашение',en:'Invitation'},official_url:'https://example.invalid/source',checked_at:null,
   section_label:'До приезда',section_label_i18n:{ru:'До приезда',en:'Before arrival'},
   verification_note_i18n:{ru:'Страницу не удалось проверить.',en:'The page could not be checked.'}
  }]}};
  const html=vm.runInContext('revisionDetails(change)',c);
  assert.match(html,en?/Invitation office/:/Отдел приглашений/);
  assert.match(html,en?/Before arrival/:/До приезда/);
  if(en)assert.match(html,/Page section title: «До приезда»/);
  assert.match(html,en?/Not verified/:/Не проверено/);
  assert.match(html,en?/could not be checked/:/не удалось проверить/);
  assert.doesNotMatch(html,/Русский исходный|Русское исходное|null|undefined/);
 }
});

test('result cards show the status transition once and retain changed document details',()=>{
 const ui=fs.readFileSync(require('node:path').join(__dirname,'../app/static/student-ui.js'),'utf8');
 for(const en of [false,true]) {
  const c=ctx(en);c.esc=String;c.workflowLabel=t=>t.user_status;c.shortTiming=()=>'';c.icon=()=>'';c.familyIcon=()=>'';
  vm.runInContext(ui.slice(ui.indexOf('function revisionDetails('),ui.indexOf('async function resultView(')),c);
  const base={title_i18n:{ru:'Проверка',en:'Check'},user_status:'not_started',source_snapshot:[],dates:[],rule_version:1};
  c.change={task_key:'test',before:base,after:{...base,user_status:'completed'}};
  let html=vm.runInContext('revisionCard(change)',c);
  assert.equal((html.match(/completed/g)||[]).length,1);assert.equal((html.match(/not_started/g)||[]).length,1);
  assert.doesNotMatch(html,/Без отдельного срока|No separate deadline/);
  c.change.after.documents_i18n={ru:['Копия паспорта'],en:['Passport copy']};
  html=vm.runInContext('revisionCard(change)',c);assert.match(html,en?/Passport copy/:/Копия паспорта/);
 }
});

test('document confirmation explains the report and uses an optional check date',()=>{
 for(const en of [false,true]) {
  const c=ctx(en);c.t={process:'documents'};
  assert.match(vm.runInContext("resultFormHint(t,'completed')",c),en?/history/:/истории/);
  assert.match(vm.runInContext("resultDateLabel(t,'completed')",c),en?/optional/:/необязательно/);
 }
});
