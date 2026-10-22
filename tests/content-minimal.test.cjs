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
