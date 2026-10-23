const {test}=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../app/static',name),'utf8');
function context(language){
 const c=vm.createContext({tr:(ru,en)=>language==='en'?en:ru,content:x=>x?.[language]||'',esc:String});
 vm.runInContext(read('student-copy.js'),c);return c;
}
test('medical clarification is scoped and never overwrites result or recheck instructions',()=>{
 for(const language of ['ru','en'])for(const family of ['M05','M06','M10'])for(const status of ['conditional','needs_review']){
  const c=context(language);c.t={family,engine_status:status,process:'consultation',user_status:'not_started',action_i18n:{ru:'ORIGINAL',en:'ORIGINAL'}};
  assert.match(vm.runInContext('taskInstruction(t)',c),language==='ru'?/^Уточните/:/^Ask the office/);
  for(const [key,value,expected] of [['reported_outcome','question_sent',language==='ru'?'Вы отметили отправку':'You recorded sending'],['reported_outcome','clarified',language==='ru'?'Вы отметили получение':'You recorded receiving'],['engine_status','requires_recheck',language==='ru'?'Проверьте результат повторно':'Check this result again'],['user_status','completed','ORIGINAL']]){
   const original=c.t;c.t={...original,[key]:value};assert.ok(vm.runInContext('taskInstruction(t)',c).startsWith(expected));c.t=original;
  }
  c.t.engine_status='actionable';assert.equal(vm.runInContext('taskInstruction(t)',c),'ORIGINAL');
  c.t.engine_status=status;c.t.family='M03';assert.equal(vm.runInContext('taskInstruction(t)',c),'ORIGINAL');
 }
});
test('demo verification labels do not change source metadata or ordinary verification',()=>{
 for(const language of ['ru','en']){
  const c=context(language);Object.assign(c,{route:{},plan:{tasks:[]},heading:x=>x,sourceCard:s=>JSON.stringify(s),confidenceLabel:x=>'confidence:'+x,showDetail:html=>c.html=html});
  const source=read('student.js');vm.runInContext(source.slice(source.indexOf('function taskInformationView('),source.indexOf('function taskDetailView(')),c);
  c.route.snapshot={title_i18n:{},action_i18n:{},source_snapshot:[{checked_at:'2026-09-27',confidence:'P'}],engine_status:'actionable',norm_confidence:'P',eligibility_confidence:'P',formula_confidence:'P',prototype_timing:{version:'demo'}};
  vm.runInContext("taskInformationView('x')",c);
  assert.match(c.html,language==='ru'?/Демонстрационная модель/:/Demonstration model/);
  assert.equal((c.html.match(/confidence:P/g)||[]).length,1);assert.match(c.html,/2026-09-27/);
  delete c.route.snapshot.prototype_timing;vm.runInContext("taskInformationView('x')",c);
  assert.equal((c.html.match(/confidence:P/g)||[]).length,3);assert.doesNotMatch(c.html,/Демонстрационная модель|Demonstration model/);
 }
});
test('medical clarification titles and outcomes do not demand completed procedures',()=>{
 for(const language of ['ru','en'])for(const family of ['M05','M06','M10'])for(const status of ['conditional','needs_review']){
  const c=context(language);c.t={family,engine_status:status,user_status:'not_started',title_i18n:{ru:'PROCEDURE',en:'PROCEDURE'},expected_result_i18n:{ru:'COMPLETED',en:'COMPLETED'}};
  for(const outcome of [null,'question_sent','clarified']){
   c.t.reported_outcome=outcome;
   assert.match(vm.runInContext('taskDisplayTitle(t)',c),language==='ru'?/^Уточнить необходимость/:/^Check whether/);
   const expected=vm.runInContext('taskExpectedResult(t)',c);
   assert.match(expected,language==='ru'?/не подтверждает применимость/:/does not by itself confirm/);
   assert.doesNotMatch(expected,/COMPLETED/);
  }
  delete c.t.reported_outcome;
  for(const overrides of [{engine_status:'actionable'},{engine_status:'requires_recheck'},{engine_status:'superseded'},{availability:'past'},{user_status:'completed'},{family:'M03'}]){
   const original=c.t;c.t={...original,...overrides};
   assert.equal(vm.runInContext('taskDisplayTitle(t)',c),'PROCEDURE');
   assert.equal(vm.runInContext('taskExpectedResult(t)',c),'COMPLETED');c.t=original;
  }
 }
});
test('conditional timing retains the interval without a personal command or invented date',()=>{
 for(const language of ['ru','en']){
  const c=context(language),source=read('student.js');
  vm.runInContext(source.slice(source.indexOf('function taskDateDetails('),source.indexOf('function sourceCard(')),c);
  c.formatDate=String;c.timingExplanation=()=>language==='ru'?'Персональная дата не рассчитана':'No personal date calculated';
  c.t={family:'M05',engine_status:'conditional',user_status:'not_started'};
  c.d={kind:'legal_deadline',prototype_assumption:true,literal:{ru:'INTERVAL',en:'INTERVAL'},computed_at:null};
  const html=vm.runInContext('taskDateDetails(d,{},t)',c);
  assert.match(html,/INTERVAL/);assert.doesNotMatch(html,/Выполнить до|Complete by|task-date-value/);
  c.t.engine_status='actionable';c.d.computed_at='2026-11-01';
  const standard=vm.runInContext('taskDateDetails(d,{},t)',c);
  assert.match(standard,language==='ru'?/Выполнить до/:/Complete by/);assert.match(standard,/2026-11-01/);
 }
});
test('reference qualification follows state even when instruction strings are equal; model is not a calculated date',()=>{
 for(const language of ['ru','en']){
  const c=context(language),source=read('student.js');
  Object.assign(c,{route:{},plan:{tasks:[]},heading:x=>x,sourceCard:s=>JSON.stringify(s),confidenceLabel:String,showDetail:html=>c.html=html});
  vm.runInContext(source.slice(source.indexOf('function taskInformationView('),source.indexOf('function taskDetailView(')),c);
  c.route.snapshot={family:'M05',engine_status:'conditional',user_status:'not_started',title_i18n:{ru:'PROCEDURE',en:'PROCEDURE'},action_i18n:{ru:'ORIGINAL',en:'ORIGINAL'},source_snapshot:[],prototype_timing:{version:'demo'},dates:[{computed_at:null}]};
  // Equal wording must not hide the general-reference qualification.
  c.taskInstruction=t=>c.content(t.action_i18n);
  for(const date of [null,'2026-11-01']){
   c.route.snapshot.dates[0].computed_at=date;vm.runInContext("taskInformationView('x')",c);
   assert.match(c.html,/reference-instruction/);assert.match(c.html,language==='ru'?/на случай, если необходимость процедуры для вас подтвердится/:/only if the procedure is confirmed/);
   assert.match(c.html,language==='ru'?/используется демонстрационная модель/:/uses a demonstration timing model/);
   assert.doesNotMatch(c.html,/срок рассчитан|deadline has been calculated/);
  }
  delete c.route.snapshot.prototype_timing;vm.runInContext("taskInformationView('x')",c);
  assert.doesNotMatch(c.html,/демонстрационная модель|demonstration timing model/);
  c.route.snapshot.engine_status='actionable';vm.runInContext("taskInformationView('x')",c);
  assert.doesNotMatch(c.html,/reference-instruction|Общий порядок процедуры|General procedure/);
 }
});
