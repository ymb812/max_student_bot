// UX iteration: edit a relevant field without restarting onboarding.
const originalRender=render;
let editSnapshot=null;
render=function(){
 originalRender();
 const campus=el.querySelector('[name=campus]');
 if(campus){state.campus='main';campus.value='main';campus.parentElement.remove();save();}
 const office=el.querySelector('[name=office]');
 if(office){office.parentElement.firstChild.textContent='Вы уже передали документы в международный отдел после последнего приезда?';office.options[1].text='Нет / передал(а) только часть';office.options[2].text='Да, весь комплект передан';}
 const edit=el.querySelector('#edit');
 if(edit){const fresh=edit.cloneNode(true);edit.replaceWith(fresh);fresh.textContent=state.screen===4?(state.registration==='yes'&&!state.registrationExpiry?'Добавить дату регистрации':state.dateUnknown?'Указать дату въезда':'Изменить сведения по этому шагу'):'Сведения о маршруте';fresh.onclick=()=>openEditor(state.screen===4);}
};
function openEditor(targeted){
 editSnapshot={...state};
 let fields='';
 if(targeted&&state.registration==='yes'&&!state.registrationExpiry)fields='<label class="field">Дата окончания регистрации<input name="registrationExpiry" type="date" required></label>';
 else if(targeted&&state.situation==='arrived'&&(state.dateUnknown||!state.entryDate))fields='<label class="field">Дата последнего въезда в Россию<input name="entryDate" type="date" required></label>';
 else fields=options('visa','Режим въезда',[['visa','По учебной визе'],['visa_free','Без визы'],['unknown','Не знаю']])+`<div id="branch">${branch()}</div>`;
 el.innerHTML=`<h2 tabindex="-1">${targeted?'Уточнение для этого шага':'Сведения о маршруте'}</h2><p class="sub">После сохранения вернемся в ваш план.</p><form>${fields}<button class="primary">Сохранить и обновить план</button></form><button class="secondary" id="cancel">Вернуться без изменений</button><p class="footer-note">Макет редактирования сведений о поездке. Остальные разделы профиля и события описаны в дополнении к handoff.</p>`;
 const form=el.querySelector('form');
 form.onchange=()=>{persistForm();const branchEl=el.querySelector('#branch');if(branchEl)branchEl.innerHTML=branch();};
 form.onsubmit=e=>{e.preventDefault();persistForm();if(state.entryDate)state.dateUnknown=false;normalise();state.screen=3;editSnapshot=null;render();restoreBack();};
 const cancel=()=>{state={...editSnapshot};editSnapshot=null;render();restoreBack();};
 el.querySelector('#cancel').onclick=cancel;
 document.getElementById('back').onclick=cancel;
}
const normalBack=document.getElementById('back').onclick;
function restoreBack(){document.getElementById('back').onclick=normalBack;}
render();
