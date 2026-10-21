/* A local scenario model. Production must use the server engine. */
const Journey=(()=>{
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const supported=s=>s.age==='adult'&&s.basis==='study'&&['admitted','active'].includes(s.education);
 function tasks(s){
  const f=s.flow||{},arr=s.situation==='arrived',r=s.readiness,t=[];
  const add=(id,stage,title,status,why,actions=[])=>t.push({id,stage,title,status,why,actions});
  if(!supported(s)){add('support',arr?'arrival':'before','Уточните индивидуальный порядок в университете',f.consulted?'waiting':'check','Стандартный маршрут не подтвержден для вашей ситуации.',f.consulted?[]:['consult']);return t;}
  if(!['visa','visa_free'].includes(s.visa)){add('regime',arr?'arrival':'before','Уточните режим въезда','check','От режима зависит состав подготовки.',['regime']);return t;}
  if(s.visa==='visa'){
   add('invitation','before','Получить приглашение',arr?(f.invitation?'done':'past'):f.invitation||['invitation','visaPending'].includes(r)?'done':r==='requested'?'waiting':r==='visaReady'?'past':r==='unknown'?'check':'now','Уточните в университете список сведений и способ подачи запроса на приглашение. Если запрос уже отправлен — дождитесь приглашения или уточните статус у отдела.',arr?[]:r==='requested'?['invite_received']:['none',''].includes(r)?['invite_request']:r==='unknown'?['readiness']:[]);
   add('visa','before','Получить учебную визу',r==='visaReady'||f.visa?'done':arr?'past':r==='visaPending'?'waiting':r==='invitation'?'now':'future','Подготовьте подачу по инструкции консульства. Если документы поданы, проверьте результат способом, указанным при подаче.',arr?[]:r==='invitation'?['visa_submit']:r==='visaPending'?['visa_received']:[]);
  }
  const canPrepare=s.visa==='visa_free'||r==='visaReady';
  add('prepare','before','Подготовить поездку',f.prepared?'done':arr?'past':canPrepare?'now':'future','Сверьте комплект для поездки, порядок прибытия в вуз и заселения. Подтвердите готовность, когда все три вопроса решены.',!arr&&canPrepare&&!f.prepared?['prepared']:[]);
  add('entry','arrival','Сообщить о фактическом въезде',arr&&s.entryDate?'done':arr?'check':f.prepared?'now':'future','Укажите фактическую дату и цель въезда. Планируемая поездка не считается состоявшимся въездом.',!arr||!s.entryDate?['entry']:[]);
  const valid=arr&&s.entryDate&&s.purpose==='study';
  if(arr&&s.entryDate&&s.purpose!=='study')add('purpose','arrival','Уточните цель въезда и порядок действий','check','Проверьте цель в документах; при другой цели нужен индивидуальный порядок.',['purpose']);
  add('documents','arrival','Проверить документы въезда',f.documents?'done':valid?'now':'future','Сверьте данные паспорта, визы при наличии и документов въезда. Если есть ошибка, обратитесь в университет.',valid&&!f.documents?['documents']:[]);
  add('office','arrival','Передать документы в международный отдел',s.office==='yes'?'done':valid?'now':'future','Сверьте комплект по инструкции вашего вуза и передайте его указанным способом. Частичный комплект еще не завершает действие.',valid&&s.office!=='yes'?['office']:[]);
  add('registration','arrival','Получить регистрацию по месту проживания',s.registration==='yes'?'done':f.registrationPending?'waiting':valid?'now':'future','Уточните у принимающей стороны порядок оформления. Передача документов в вуз сама по себе не подтверждает получение регистрации.',valid&&s.registration!=='yes'?(f.registrationPending?['registration_received']:['registration_submit','registration_received']):[]);
  if(s.registration==='yes'&&!s.registrationExpiry)add('registration_date','arrival','Укажите дату окончания регистрации','check','Найдите дату окончания в полученном документе.',['registration_date']);
  if(arr&&s.visa==='visa')add('visa_date','study','Указать дату окончания визы',s.visaExpiry?'done':'check','Эта дата понадобится для подготовки продления; срок подачи нужно проверять отдельно.',!s.visaExpiry?['visa_date']:[]);
  add('medical','arrival','Уточнить необходимые медицинские процедуры',f.consulted?'waiting':arr?'check':'future',f.consulted?'Вопрос отправлен. Дождитесь индивидуального ответа; применимость пока не подтверждена.':'Уточните в международном отделе, какие процедуры нужны и действуют ли ранее полученные результаты.',arr&&!f.consulted?['consult']:[]);
  add('renewals','study','Уточнить порядок будущих продлений',arr?'check':'future','Сроки документов сохранены отдельно. В этом макете нет расчета персональных сроков подачи; проверьте порядок по инструкции университета.',arr?['instructions']:[]);
  return t;
 }
 function model(s){const list=tasks(s),arr=s.situation==='arrived';const by=id=>list.find(x=>x.id===id);
  const stage=!arr?'before':['entry','purpose','documents','office','registration','registration_date'].some(id=>by(id)&&!['done','past'].includes(by(id).status))?'arrival':'study';
  const order=arr?['support','regime','entry','purpose','visa_date','registration_date','documents','office','registration','medical','renewals']:['support','regime','invitation','visa','prepare','entry'];
  const hero=order.map(by).find(x=>x&&!['done','past','future'].includes(x.status))||by('entry')||list[0];
  return {tasks:list,stage,hero};
 }
 const labels={invite_request:'Запрос на приглашение отправлен',invite_received:'Приглашение получено',visa_submit:'Документы на визу поданы',visa_received:'Учебная виза получена',prepared:'Поездка подготовлена',entry:'Фактический въезд подтвержден',documents:'Документы въезда проверены',office:'Полный комплект передан',registration_submit:'Документы на регистрацию поданы',registration_received:'Регистрация получена',registration_date:'Дата регистрации сохранена',visa_date:'Дата визы сохранена',consult:'Вопрос отправлен в университет',regime:'Режим въезда уточнен',purpose:'Цель въезда уточнена',readiness:'Готовность документов уточнена'};
 function apply(s,event,data={}){
  if(!tasks(s).some(t=>t.actions.includes(event)))throw Error('Это действие сейчас недоступно. Обновите план.');
  if(['entry','registration_date','visa_date'].includes(event)||event==='registration_received'&&data.date){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(data.date||'')||Number.isNaN(Date.parse(data.date)))throw Error('Укажите дату из документа.');
   if(event==='entry'&&data.date>today())throw Error('Дата фактического въезда не может быть в будущем.');
  }
  if(event==='entry'&&!['study','other','unknown'].includes(data.purpose))throw Error('Укажите цель въезда.');
  const next=JSON.parse(JSON.stringify(s));next.flow=next.flow||{};const f=next.flow;
  switch(event){
   case 'invite_request':next.readiness='requested';break;
   case 'invite_received':next.readiness='invitation';f.invitation=true;break;
   case 'visa_submit':next.readiness='visaPending';break;
   case 'visa_received':next.readiness='visaReady';f.visa=true;break;
   case 'prepared':f.prepared=true;break;
   case 'entry':next.situation='arrived';next.entryDate=data.date;next.dateUnknown=false;next.purpose=data.purpose;break;
   case 'documents':f.documents=true;break;
   case 'office':next.office='yes';break;
   case 'registration_submit':f.registrationPending=true;break;
   case 'registration_received':next.registration='yes';next.registrationExpiry=data.date||'';f.registrationPending=false;break;
   case 'registration_date':next.registrationExpiry=data.date;break;
   case 'visa_date':next.visaExpiry=data.date;break;
   case 'consult':f.consulted=true;break;
   case 'regime':if(!['visa','visa_free'].includes(data.value))throw Error('Выберите режим');next.visa=data.value;break;
   case 'purpose':if(!['study','other','unknown'].includes(data.value))throw Error('Выберите цель');next.purpose=data.value;break;
   case 'readiness':if(!['none','requested','invitation','visaPending','visaReady'].includes(data.value))throw Error('Выберите готовность');next.readiness=data.value;break;
   default:throw Error('Неизвестное действие');
  }
  const snapshot=JSON.parse(JSON.stringify(s));delete snapshot.journeyHistory;
  next.journeyHistory=[...(s.journeyHistory||[]),{event,label:labels[event],at:new Date().toISOString(),before:snapshot}];next.screen=3;return next;
 }
 function undo(s){const h=s.journeyHistory||[];if(!h.length)return s;return {...h[h.length-1].before,journeyHistory:h.slice(0,-1),screen:3};}
 return {model,tasks,apply,undo,today,labels};
})();
if(typeof module!=='undefined')module.exports=Journey;

