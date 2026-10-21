// Product proposal, not an eligibility engine. No invented legal deadlines.
const statusNames={done:'Выполнено',now:'Актуально',waiting:'Ожидается результат',future:'Предстоит',check:'Нужно уточнить',past:'Не уточняли при входе'};
function stageRows(id){
 const arrived=state.situation==='arrived',r=state.readiness;
 const row=(title,status,note,group)=>({title,status,note,group});
 if(id==='before'){
  const rows=[];
  if(state.visa==='visa'){
   rows.push(row('Получить приглашение',arrived?'past':['invitation','visaPending'].includes(r)?'done':r==='requested'?'waiting':r==='none'?'now':'check',arrived?'Вы присоединились после приезда. Выполнение не предполагаем.':r==='requested'?'Запрос отправлен. Следующий результат — приглашение.':'Отдельный процесс; порядок зависит от вашей ситуации.','Последовательная подготовка'));
   rows.push(row('Получить учебную визу',arrived?'past':r==='visaReady'?'done':r==='visaPending'?'waiting':r==='invitation'?'now':'future',r==='visaPending'?'Документы поданы. Получение визы — отдельный результат.':'Подача документов не означает получение визы.','Последовательная подготовка'));
  }else if(state.visa!=='visa_free')rows.push(row('Уточнить режим въезда','check','Состав подготовки станет понятен после уточнения.','Подготовка'));
  rows.push(row('Согласовать прибытие с университетом',arrived?'past':state.visa==='visa_free'||r==='visaReady'?'now':'future','Когда это предусмотрено инструкцией вашего вуза.','Подготовка поездки · возможно параллельно'));
  rows.push(row('Подготовить документы для поездки',arrived?'past':r==='visaReady'||state.visa==='visa_free'?'now':'future','Список для поездки; проверка документов фактического въезда будет после приезда.','Подготовка поездки · возможно параллельно'));
  rows.push(row('Уточнить порядок заселения',arrived?'past':state.housing==='dorm'?'now':'check','Зависит от выбранного жилья. Выполнение пока не уточняли.','Подготовка поездки · возможно параллельно'));
  return rows;
 }
 if(id==='arrival')return [
  row('Проверить документы въезда',!arrived?'future':'check',!arrived?'После фактического въезда.':'Дата и цель въезда не подтверждают, что весь комплект проверен.','Первые действия · могут идти параллельно'),
  row('Передать документы в международный отдел',!arrived?'future':state.office==='yes'?'done':state.office==='no'?'now':'check','Комплект и название отдела — по инструкции выбранного вуза.','Первые действия · могут идти параллельно'),
  row('Получить регистрацию по месту проживания',!arrived?'future':state.registration==='yes'?'done':state.registration==='no'?'now':'check','Подачу и ожидание результата нужно уточнить отдельно.','Оформление по месту проживания'),
  row('Проверить данные и срок регистрации',!arrived||state.registration!=='yes'?'future':state.registrationExpiry?'now':'check',state.registrationExpiry?`Вы указали окончание: ${state.registrationExpiry}. Это срок документа, а не дата подачи.`:'После получения документа.','Оформление по месту проживания'),
  row('Уточнить необходимые медицинские процедуры','check','Сначала проверка применимости; универсальный список и срок не назначаем.','Отдельные процедуры')
 ];
 return [
  ...(state.visa==='visa'?[row('Подготовить продление визы',arrived?'check':'future','Нужны срок визы и сведения о текущем цикле продления.','Документы · независимые циклы')]:[]),
  row('Подготовить продление регистрации',arrived?'check':'future','Дата окончания документа сама по себе не определяет дату подачи.','Документы · независимые циклы'),
  row('Проверить необходимость повторных процедур','check','Применимость и даты уточняются отдельно.','Отдельные процедуры')
 ];
}
const oldRouteHtml=routeHtml;
routeHtml=function(r){
 const names={before:'До приезда',arrival:'После приезда',study:'Во время учебы'};
 return `<div class="section-head"><h3>Весь маршрут</h3><span>Раскройте раздел</span></div>${Object.entries(names).map(([id,name])=>{
 const rows=stageRows(id),done=rows.filter(x=>x.status==='done').length;let group='';
 return `<details class="stage-panel" ${r.stage===id?'open':''}><summary><span>${name}<small>${done?`${done} отмечено выполненными · `:''}${rows.length} пунктов для просмотра</small></span><span aria-hidden="true">⌄</span></summary><p class="small">${id===r.stage?'Ваш текущий раздел. ':''}Предварительный состав: применимость отдельных пунктов еще уточняется.</p>${rows.map(x=>{const heading=group!==x.group?`<h4>${x.group}</h4>`:'';group=x.group;return `${heading}<div class="step-item ${x.status}"><span class="step-icon" aria-hidden="true">${x.status==='done'?'✓':x.status==='waiting'?'◷':x.status==='check'?'?':x.status==='now'?'●':'○'}</span><div><strong>${x.title}</strong><span class="step-status">${statusNames[x.status]}</span><p>${x.note}</p></div></div>`;}).join('')}${id==='study'?'<p class="note">Изменилось что-то? Повторный въезд, переезд и изменение учебного статуса запускают пересчет. Это события, а не обязательные будущие задачи.</p>':''}</details>`;
 }).join('')}<p class="footer-note">Галочка означает ваш ответ о результате. Неуточненные прошлые действия не отмечаются выполненными. В этом макете сроки задач не рассчитаны.</p>`;
};
render();
