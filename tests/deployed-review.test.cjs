const {test}=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const copy=fs.readFileSync(path.join(__dirname,'../app/static/student-copy.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../app/static/student-ui.js'),'utf8');
function context(en){const c=vm.createContext({tr:(ru,eng)=>en?eng:ru,content:x=>x?.[en?'en':'ru']||'',formatDate:x=>x,displayDate:x=>x,esc:String,fieldLabels:{},shortTiming:()=>''});vm.runInContext(copy,c);vm.runInContext(ui.slice(ui.indexOf('function revisionDetails('),ui.indexOf('function revisionCard(')),c);return c;}
for(const en of [false,true]){
 test(`legacy snapshots distinguish visa submission and receipt: ${en?'EN':'RU'}`,()=>{
  const c=context(en);c.t={process:'initial_visa',reported_outcome:'submitted',context_dates:{document_kind:'visa',document_expiry:null}};
  assert.equal(vm.runInContext('taskContextLabel(t)',c),'');
  c.t.reported_outcome='received';assert.match(vm.runInContext('taskContextLabel(t)',c),en?/expiry date not known/:/пока неизвестен/);
  c.t.context_dates.document_expiry='2027-10-01';assert.match(vm.runInContext('taskContextLabel(t)',c),/2027-10-01/);
  delete c.t.reported_outcome;assert.match(vm.runInContext('taskContextLabel(t)',c),/2027-10-01/,'An explicitly known document expiry remains visible for legacy profiles');
 });
 test(`visa correction shows both dates and unknown transitions: ${en?'EN':'RU'}`,()=>{
  const c=context(en),visa=expiry=>({process:'initial_visa',context_dates:{document_kind:'visa',document_expiry:expiry}});
  for(const [before,after] of [['2027-09-01','2027-10-01'],['2027-10-01',null],[null,'2027-10-01']]){
   c.change={before:visa(before),after:visa(after)};const html=vm.runInContext('revisionDetails(change)',c);
   assert.match(html,en?/Visa expiry/:/Окончание визы/);
   for(const value of [before,after])assert.ok(html.includes(value||(en?'Unknown':'Неизвестно')));
  }
  c.change={before:visa('2027-10-01'),after:visa('2027-10-01')};assert.equal(vm.runInContext('revisionDetails(change)',c),'');
 });
 test(`partial documents and past invitation explain actual state: ${en?'EN':'RU'}`,()=>{
  const c=context(en);c.t={reported_outcome:'partial',missing_documents:[0],documents_i18n:{ru:['Копия паспорта'],en:['Passport copy']}};
  assert.match(vm.runInContext('taskInstruction(t)',c),en?/remaining documents listed below/:/оставшиеся документы из списка ниже/);
  c.t.missing_documents=[];assert.match(vm.runInContext('taskInstruction(t)',c),en?/not been specified/:/пока не указано/);
  c.t={availability:'past',availability_reason_i18n:{ru:'Виза уже получена. Получение приглашения отдельно не подтверждалось.',en:'Your visa is already received. Invitation receipt was not separately reported.'}};
  assert.match(vm.runInContext('taskInstruction(t)',c),en?/visa is already received/:/Виза уже получена/);
  assert.doesNotMatch(vm.runInContext('taskInstruction(t)',c),/прошл|past/);
 });
}
