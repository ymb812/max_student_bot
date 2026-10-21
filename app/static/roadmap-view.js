/* Presentation only: never computes a legal date or changes task eligibility. */
const RoadmapView = (() => {
    const stages = ['before', 'arrival', 'study'];
    const stage = task => stages.includes(task.presentation_stage) ? task.presentation_stage
        : ['M01', 'M02'].includes(task.family) ? 'before'
        : ['M07', 'M08', 'M10'].includes(task.family) ? 'study' : 'arrival';
    const current = (tasks, includeFuture=false) => {
        const seen = new Set();
        return tasks.filter(t => {
            if (!['actionable', 'requires_recheck'].includes(t.engine_status)) return false;
            if(t.availability==='past'||(!includeFuture&&t.availability==='future'))return false;
            const key = [t.semantic_action_key || t.task_key, t.episode_id, t.cycle_id].join('|');
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    };
    const practicalDate = t => (t.dates || []).filter(d => d.kind !== 'document_expiry' && d.owner && d.computed_at)
        .map(d => d.computed_at).sort()[0] || '9999-12-31';
    const hero = tasks => tasks.filter(t=>t.engine_status!=='superseded'&&!['future','past'].includes(t.availability)).map((task, index) => ({task, index}))
        .filter(({task: t}) => t.user_status !== 'completed' || t.engine_status === 'requires_recheck')
        .sort((a, b) => ((a.task.priority_rank??9999)-(b.task.priority_rank??9999)) || ({now: 0, soon: 1, later: 2}[a.task.priority_bucket] - {now: 0, soon: 1, later: 2}[b.task.priority_bucket])
            || practicalDate(a.task).localeCompare(practicalDate(b.task)) || a.index - b.index || a.task.task_key.localeCompare(b.task.task_key))[0]?.task;
    const progress = (tasks, id) => {
        const eligible = current(tasks,true).filter(t => stage(t) === id);
        const completed = eligible.filter(t => t.engine_status === 'actionable' && t.user_status === 'completed').length;
        const unresolved=tasks.some(t=>stage(t)===id&&t.engine_status!=='superseded'&&t.availability!=='past'&&(t.availability==='future'||['conditional','needs_review','requires_recheck'].includes(t.engine_status)));
        return {tasks: eligible, total: eligible.length, completed, done: eligible.length > 0 && eligible.length === completed&&!unresolved};
    };
    const currentStage = (tasks, profile) => !profile.entry_at ? (profile.arrival_status === 'arrived' ? 'arrival' : 'before')
        : tasks.filter(t=>(t.process?['entry_context','documents','office','registration'].includes(t.process):stage(t)==='arrival')&&t.engine_status!=='superseded'&&t.availability!=='past').some(t=>t.user_status!=='completed'||t.engine_status==='requires_recheck') ? 'arrival' : 'study';
    const clarifications = tasks => [...new Map(tasks.filter(t => ['conditional', 'needs_review'].includes(t.engine_status)&&!['future','past'].includes(t.availability)&&t.user_status!=='completed').map(t => [t.task_key, t])).values()];
    return {stages, stage, current, hero, progress, currentStage, clarifications};
})();
if (typeof module !== 'undefined') module.exports = RoadmapView;
