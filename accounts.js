/* A game-only username is distinct from the freely editable display name. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),online=window.onlineLeaderboard,api=window.DazouguOnline;
 let registering=false,busy=false,selected=false,leaving=false,settingsOrigin=null;
 const errors={invalid_input:'用户名为2–12字，密码为6位数字',invalid_credentials:'用户名或密码不正确',username_taken:'用户名已被使用或保留，请更换',too_many_attempts:'尝试较多，请稍后再试',registration_pending:'注册正在完成，请稍后用密码登录',registration_failed:'注册未完成，请稍后重试',temporarily_unavailable:'暂时连不上，可重试或游客登台'};
 function mode(register){
  registering=register;$('loginTab').setAttribute('aria-selected',String(!register));$('registerTab').setAttribute('aria-selected',String(register));
  $('confirmPasswordRow').hidden=!register;$('accountConfirm').required=register;
  $('accountPassword').autocomplete=register?'new-password':'current-password';$('accountSubmit').textContent=register?'注册并登台':'登录登台';$('accountError').textContent='';
 }
 function status(message=''){$('accountError').textContent=message;}
 function setBusy(value){busy=value;for(const el of $('accountForm').elements)el.disabled=value;$('guestLogin').disabled=value;$('loginTab').disabled=value;$('registerTab').disabled=value;}
 function enter(client){
  selected=true;online.selectClient(client);window.enterGameCover();client.warm();if(client.pending())client.flush();
 }
 $('loginTab').onclick=()=>mode(false);$('registerTab').onclick=()=>mode(true);
 $('guestLogin').onclick=()=>{
  if(busy)return;const guest=online.guestClient;if(!guest.nickname)guest.setNickname('鼓乐游客');enter(guest);
 };
 $('accountForm').addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;
  const username=api.cleanUsername($('accountUsername').value),password=$('accountPassword').value;
  if(!api.validUsername(username)||!api.validPassword(password)){status(errors.invalid_input);return;}
  if(registering&&password!==$('accountConfirm').value){status('两次密码不一致');return;}
  audio.unlock();
  setBusy(true);status(registering?'正在登记账号…':'正在登录…');
  const client=online.createAccountClient();
  try{await client.login(registering?'register':'login',username,password);status();enter(client);}
  catch(error){status(errors[error.code]||errors.temporarily_unavailable);}
  finally{$('accountPassword').value='';$('accountConfirm').value='';setBusy(false);}
 });
 function showSettings(){
  if(!selected||!['home','over','paused'].includes($('app').dataset.state))return;
  settingsOrigin=document.activeElement;$('settingsName').value=online.nickname;$('settingsMessage').textContent='';
  $('settingsIdentity').textContent=online.client.isAccount?'用户名：'+online.client.accountProfile.username:'游客 · 当前浏览器';
  const volumes=audio.volumes;$('gameVolume').value=Math.round(volumes.game*100);$('rainVolume').value=Math.round(volumes.rain*100);updateVolumeLabels();
  $('settingsDialog').hidden=false;for(const id of ['home','game','over','paused'])$(id).inert=true;$('settingsClose').focus({preventScroll:true});
 }
 function closeSettings(){
  $('settingsDialog').hidden=true;$('home').inert=false;$('game').inert=['paused','over'].includes($('app').dataset.state);$('over').inert=false;$('paused').inert=false;
  settingsOrigin?.focus?.({preventScroll:true});settingsOrigin=null;
 }
 function updateVolumeLabels(){for(const [input,label] of [['gameVolume','gameVolumeLabel'],['rainVolume','rainVolumeLabel']])$(label).textContent=$(input).value+'%';}
 for(const id of ['gameVolume','rainVolume'])$(id).addEventListener('input',()=>{
  updateVolumeLabels();audio.setVolumes(Number($('gameVolume').value)/100,Number($('rainVolume').value)/100);audio.setMuted(false);audio.unlock();syncWeatherAudio();soundButtons();
 });
 $('settingsNameForm').addEventListener('submit',async event=>{
  event.preventDefault();const name=$('settingsName').value;if(!api.validNickname(name)){$('settingsMessage').textContent='名称需为1–12个字';return;}
  $('saveSettingsName').disabled=true;$('settingsMessage').textContent='正在保存…';const current=online.client;
  try{const synced=await current.setDisplayName(name);if(current!==online.client)return;$('settingsName').value=current.nickname;$('settingsMessage').textContent=synced?'名称已保存':'名称已保存在本机，联网后更新';online.refreshProfile();}
  catch{$('settingsMessage').textContent='名称未保存，请重试';}
  finally{$('saveSettingsName').disabled=false;}
 });
 $('openSettings').onclick=showSettings;$('settingsClose').onclick=closeSettings;
 $('logout').onclick=async()=>{
  if(leaving)return;leaving=true;const current=online.client;closeSettings();selected=false;window.returnToLogin();online.selectClient(online.guestClient);
  if(current.isAccount)try{await current.logout();}catch{}leaving=false;
 };
 document.addEventListener('keydown',event=>{
  if($('settingsDialog').hidden)return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeSettings();return;}
  if(event.key==='Tab'){
   event.stopImmediatePropagation();const controls=[...$('settingsDialog').querySelectorAll('button,input')].filter(x=>!x.disabled&&x.getClientRects().length),first=controls[0],last=controls.at(-1);
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }
 },true);
 window.gameSession={
  showLogin(){selected=false;window.returnToLogin();},
  sessionExpired(){if(!selected||leaving)return;selected=false;closeSettings();window.returnToLogin();status('登录已过期，请重新登录');online.selectClient(online.guestClient);},
  get ready(){return selected;},
  get hasDialog(){return!$('settingsDialog').hidden;}
 };
 mode(false);
})();
