const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../app/static/student-copy.js'),'utf8');
const outcomes={invitation:['requested','received'],initial_visa:['submitted','received'],trip:['completed'],office:['partial','completed'],documents:['question','question_sent','clarified','completed'],registration:['submitted','received'],visa_renewal:['submitted','received'],registration_renewal:['submitted','received']};
Object.assign(outcomes,{consultation:[],entry_context:[]});
for(const process of Object.keys(outcomes))outcomes[process]=[...new Set([...outcomes[process],'question_sent','clarified'])];
function context(en=false){const c=vm.createContext({tr:(ru,eng)=>en?eng:ru});vm.runInContext(source,c);return c;}
test('new results ignore legacy hidden dates for every workflow outcome',()=>{
 const c=context();
 for(const [process,values] of Object.entries(outcomes))for(const outcome of values){
  c.outcome=outcome;c.t={process};
  assert.equal(vm.runInContext("resultOccurredAt(null,outcome,false,'2026-10-02')",c),null);
  assert.doesNotMatch(vm.runInContext('resultFormHint(t,outcome)',c),/дат|date|помните|remember/);
 }
});
test('same-outcome correction preserves history, explicit editing can change or clear it',()=>{
 const c=context();c.original={outcome:'completed',occurred_at:'2026-10-02'};
 assert.equal(vm.runInContext("resultOccurredAt(original,'completed',false,'2026-10-05')",c),'2026-10-02');
 assert.equal(vm.runInContext("resultOccurredAt(original,'completed',true,'2026-10-05')",c),'2026-10-05');
 assert.equal(vm.runInContext("resultOccurredAt(original,'completed',true,'')",c),null);
 assert.equal(vm.runInContext("resultOccurredAt(original,'partial',true,'2026-10-05')",c),null);
 c.original.occurred_at=null;
 assert.equal(vm.runInContext("resultOccurredAt(original,'completed',false,'2026-10-05')",c),null);
});
test('question and reply explanations retain their separate meanings in RU/EN',()=>{
 for(const en of [false,true]){
  const c=context(en);
  assert.match(vm.runInContext("resultFormHint({},'question_sent')",c),en?/yourself/:/самостоятельно/);
  assert.match(vm.runInContext("resultFormHint({},'clarified')",c),en?/does not confirm/:/не подтверждает/);
 }
});
test('named result drafts restore expiry but not removed dates; positional drafts cannot shift dates',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../app/static/student-ui.js'),'utf8');
 const fn=ui.slice(ui.indexOf('function restoreFormDraft('),ui.indexOf('function clearFormDraft('));
 const expiry={name:'document_expiry',value:'',checked:false},confirmation={name:'confirmed',value:'on',checked:false};
 const form={id:'result-form',dispatchEvent:()=>{}};
 const c=vm.createContext({root:{querySelector:()=>form},draftControls:()=>[expiry,confirmation],draftControlKey:el=>el.name,Event:class{},expiry,confirmation});
 vm.runInContext(fn,c);
 c.draft={version:2,fields:[{key:'occurred_at',value:'2026-10-02'},{key:'document_expiry',value:'2027-05-01'},{key:'confirmed',value:'on',checked:true}]};
 vm.runInContext('restoreFormDraft(draft)',c);assert.equal(expiry.value,'2027-05-01');assert.equal(confirmation.checked,true);
 expiry.value='';confirmation.checked=false;
 c.draft=[{value:'2026-10-02'},{value:'2027-05-01'},{value:'on',checked:true}];
 vm.runInContext('restoreFormDraft(draft)',c);assert.equal(expiry.value,'');assert.equal(confirmation.checked,false);
});
