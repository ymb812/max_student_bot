const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../app/static/roadmap-view.js');
const fields=['registration_expiry','visa_expiry','entry_at','planned_entry'];
const profile={entry_at:'2026-10-01',arrival_status:'arrived'};
const task=(key,extra={})=>({task_key:key,engine_status:'conditional',user_status:'not_started',availability:'available',presentation_stage:'arrival',priority_bucket:'now',missing_fields:['registration_expiry'],...extra});
test('one question per field with all affected tasks; false and known values are not missing',()=>{
 const qs=R.dataQuestions([task('a'),task('b'),task('v',{missing_fields:['visa_expiry']})],{...profile,visa_expiry:'2027-01-01'},fields);
 assert.equal(qs.length,1);assert.equal(qs[0].tasks.length,2);
 assert.equal(R.dataQuestions([task('a',{missing_fields:['stay_over_90_days']})],{...profile,stay_over_90_days:false},['stay_over_90_days']).length,0);
});
test('current questions precede future ones; review/past/completed do not become data requests',()=>{
 const qs=R.dataQuestions([task('later',{presentation_stage:'study',priority_bucket:'later',missing_fields:['visa_expiry'],priority_rank:0}),task('current',{priority_rank:5}),task('review',{engine_status:'needs_review',missing_fields:['entry_at']}),task('old',{availability:'past',missing_fields:['entry_at']})],profile,fields);
 assert.deepEqual(qs.map(q=>[q.field,q.current]),[['registration_expiry',true],['visa_expiry',false]]);
});
test('planned date is optional only before arrival, not requested as an actual entry date',()=>{
 assert.deepEqual(R.dataQuestions([],{arrival_status:'planned'},fields).map(q=>q.field),['planned_entry']);
 assert.equal(R.dataQuestions([],{arrival_status:'arrived'},fields).length,0);
});
test('data request cannot displace a ranked deadline; review remains an action',()=>{
 const data=task('missing',{priority_rank:0}),deadline=task('deadline',{engine_status:'actionable',missing_fields:[],priority_rank:2,dates:[{kind:'submission',owner:'university',computed_at:'2026-10-21'}]}), review=task('review',{engine_status:'needs_review',priority_rank:3});
 const tasks=[data,deadline,review],qs=R.dataQuestions(tasks,profile,fields);
 assert.equal(R.actionHero(tasks,qs).task_key,'deadline');
 assert.equal(R.actionHero([data,review],qs).task_key,'review');
 assert.equal(R.actionHero([data],qs),undefined);
});

test('unavailable future procedures do not ask for dates of documents not yet obtained',()=>{assert.equal(R.dataQuestions([task('future',{availability:'future'})],profile,fields).length,0);});
