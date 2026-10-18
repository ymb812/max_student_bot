const {test} = require('node:test');
const assert = require('node:assert/strict');
const view = require('../app/static/roadmap-view.js');
const task = (key, overrides={}) => ({task_key:key,semantic_action_key:key,episode_id:'entry-1',cycle_id:'cycle-1',family:'M03',engine_status:'actionable',user_status:'not_started',priority_bucket:'now',dates:[],...overrides});
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
