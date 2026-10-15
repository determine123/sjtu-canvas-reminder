importScripts('core.js','auto-sign.js','hint-policy.js','hint-background.js');
const signControllers=new Map();
const cancelledSignTabs=new Set();let autoSigningPaused=false;
let queue=Promise.resolve(),audioCreation;
const local=chrome.storage.local,session=chrome.storage.session;
async function config(){const d=await local.get(['settings','courses','lessons']);return {settings:{...Core.defaults,...d.settings},courses:d.courses||[],lessons:d.lessons||[]};}
async function log(kind,message){const {logs=[]}=await local.get('logs');await local.set({logs:[{time:Date.now(),kind,message},...logs].slice(0,150)});}
async function sound(play){
  if(play){if(!await chrome.offscreen.hasDocument()){audioCreation ||= chrome.offscreen.createDocument({url:'offscreen.html',reasons:['AUDIO_PLAYBACK'],justification:'Play the local attendance reminder sound for up to 30 seconds'}).finally(()=>audioCreation=null);await audioCreation;}}
  if(await chrome.offscreen.hasDocument()){const r=await chrome.runtime.sendMessage({type:'audio',play});if(!r?.ok)throw Error('音频页面没有确认');}
}
async function badge(){const {pending={}}=await session.get('pending');const n=Object.keys(pending).length;await chrome.action.setBadgeText({text:n?String(n):''});await chrome.action.setBadgeBackgroundColor({color:'#11776e'});}
async function notify(id,title,message,target){
  const {pending={}}=await session.get('pending');pending[id]={title,message,time:Date.now(),...target};await session.set({pending});await badge();
  try{await chrome.notifications.create(id,{type:'basic',iconUrl:'icons/128.png',title,message,requireInteraction:true,buttons:[{title:'打开查看'},{title:'已收到'}]});}catch{await log('error','系统通知不可用，请检查 Windows 通知设置');}
  if((await config()).settings.sound)try{await sound(true);}catch{await log('error','提示音未能播放，请使用测试提醒检查');}
  await log(target.kind,message);
}
async function ack(id){
  const {pending={}}=await session.get('pending');const ids=id?[id]:Object.keys(pending);
  for(const key of ids){delete pending[key];await chrome.notifications.clear(key);}
  await session.set({pending});await badge();let stopped=true;
  if(!Object.keys(pending).length)try{await sound(false);}catch{stopped=false;await log('error','停止音频失败，请重新加载插件');}
  return stopped;
}
async function openTarget(id){
  const {pending={}}=await session.get('pending');const item=pending[id];if(!item)throw Error('这条提醒已处理');
  let url=item.url;
  if(item.kind==='qr'){const data=(await session.get('qr:'+item.tabId))['qr:'+item.tabId];if(!Core.fresh(data))throw Error('二维码入口已过期，请回到课堂重新扫描');url=Core.qr(data.url).url;}
  if(url)await chrome.tabs.create({url});await ack(id);
}
async function plan(){
  for(const alarm of await chrome.alarms.getAll())if(alarm.name==='poll'||alarm.name==='plan'||alarm.name.startsWith('lesson:'))await chrome.alarms.clear(alarm.name);
  const {settings:s,lessons}=await config();
  if(s.coursesEnabled)await chrome.alarms.create('poll',{periodInMinutes:s.interval/60});
  const due={};const {sentLessons={}}=await local.get('sentLessons');
  for(const key of Object.keys(sentLessons))if(Date.now()-sentLessons[key]>90*86400000)delete sentLessons[key];
  if(s.lessonsEnabled){for(const row of lessons){const event=Core.nextLesson(row,Date.now(),sentLessons);if(event){due['lesson:'+row.id]={...event,row};await chrome.alarms.create('lesson:'+row.id,{when:event.when});}}await chrome.alarms.create('plan',{periodInMinutes:60});}
  await local.set({due,sentLessons});
}
async function remindLesson(name){
  const {settings:s}=await config();const {due={},sentLessons={}}=await local.get(['due','sentLessons']);const event=due[name];
  if(!s.lessonsEnabled||!event||event.classAt<=Date.now()||sentLessons[event.key]){await plan();return;}
  if(event.when>Date.now()){await chrome.alarms.create(name,{when:event.when});return;}
  sentLessons[event.key]=Date.now();await local.set({sentLessons});
  const minutes=Math.max(1,Math.ceil((event.classAt-Date.now())/60000));
  await notify(name,'即将上课 · '+event.row.name,`${event.date} ${event.row.time} · 约 ${minutes} 分钟后\n${event.row.location||'记得查看课程安排'}`,{kind:'lesson'});await plan();
}
async function poll(){
  const {settings:s,courses}=await config();if(!s.coursesEnabled)return;
  const {courseStates={}}=await local.get('courseStates');const tabs=await chrome.tabs.query({});
  for(const c of courses){const state=courseStates[c.id]||{};state.since ||= Date.now();try{
    let tab=tabs.find(t=>(t.url||'').split('?')[0].replace(/\/$/,'')===c.url)||tabs.find(t=>t.id===state.tabId&&/jaccount|\/login/i.test(t.url||''));
    if(!tab){if(s.autoOpen){tab=await chrome.tabs.create({url:c.url,active:false});state.status='等待页面加载';state.opened=Date.now();state.tabId=tab.id;}else{state.status='等待打开课程页';delete state.tabId;}}
    else{state.tabId=tab.id;if(/jaccount|\/login/i.test(tab.url||''))state.status='需要登录';else if(tab.discarded||tab.frozen)state.status='页面休眠，请打开课程页';else if(tab.status==='complete'){
      try{await chrome.tabs.sendMessage(tab.id,{type:'inspectTable'});}catch{state.status='页面脚本未就绪，请刷新课程页';}
      if(Date.now()-(state.opened||0)>s.interval*1000){await chrome.tabs.reload(tab.id);state.opened=Date.now();}
      if(Date.now()-(state.lastRead||state.since)>120000)state.status='未识别签到表格，请检查课程页';
    }}
  }catch{state.status='检查失败，将在下次重试';}courseStates[c.id]=state;}
  await local.set({courseStates});
}
async function tableReport(m,sender){
  const {settings:s,courses}=await config();if(!s.coursesEnabled||!sender.tab)return;
  const {courseStates={}}=await local.get('courseStates');
  const c=courses.find(c=>(sender.tab.url||'').split('?')[0].replace(/\/$/,'')===c.url)||courses.find(c=>courseStates[c.id]?.tabId===sender.tab.id);
  if(!c)return;const st=courseStates[c.id]||{};st.tabId=sender.tab.id;st.checked=Date.now();
  if(m.login&&m.top)st.status='需要登录';
  const r=m.record;let alert=false;
  if(r&&typeof r.num==='string'&&/^\d{1,12}$/.test(r.num)&&typeof r.status==='string'&&typeof r.created==='string'&&r.created.length<100&&r.status.length<100){
    const record={num:r.num,status:r.status,created:r.created,key:r.num+'|'+r.created,active:/未签到|待签到|进行中|签到中/.test(r.status)&&!/已结束|已过期|已关闭/.test(r.status)};
    alert=Core.shouldAlert(st.record,record);st.record=record;st.lastRead=Date.now();st.status=record.status?'已连接 · '+record.status:'已连接 · 状态未知';
  }else if(m.top&&!m.login&&!st.lastRead)st.status='等待签到表格';
  courseStates[c.id]=st;await local.set({courseStates});
  if(alert)await notify('course:'+c.id,'发现新签到 · '+c.name,`签到号 ${st.record.num} · ${st.record.status}`,{kind:'table',url:c.url});
}
async function startQR(tabId){
  cancelledSignTabs.delete(tabId);
  const tab=await chrome.tabs.get(tabId);if(!/^https?:\/\//.test(tab.url||''))throw Error('请先打开课堂网页，再开启扫描');
  await chrome.scripting.executeScript({target:{tabId},files:['vendor/jsQR.js','core.js','qr-content.js']});
  await session.set({['qrEnabled:'+tabId]:true});
  try{await chrome.tabs.sendMessage(tabId,{type:'qrStart'});}catch(e){await session.remove('qrEnabled:'+tabId);throw e;}
}
async function capture(sender){
  const id=sender.tab?.id;if(id===undefined||sender.frameId!==0||!(await session.get('qrEnabled:'+id))['qrEnabled:'+id])return {ok:false,error:'请重新开启扫描'};
  const tab=await chrome.tabs.get(id),window=await chrome.windows.get(tab.windowId);if(!tab.active||!window.focused)return {ok:true,paused:true};
  const image=await chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'});const active=await chrome.tabs.query({active:true,windowId:tab.windowId});
  return active[0]?.id===id?{ok:true,image}:{ok:true,paused:true};
}
async function attemptAutoSign(target,tabId,retry=false){
  if(!(await config()).settings.autoSign||autoSigningPaused||cancelledSignTabs.has(tabId)||!(await session.get('qrEnabled:'+tabId))['qrEnabled:'+tabId]){
    return {status:'cancelled',message:'自动签到未启用或扫描已停止',newAttempt:false,attempted:false};
  }
  const controller=new AbortController();signControllers.set(tabId,controller);
  try{
    const key=await AutoSign.digest(target.key),now=Date.now();
    const {autoSignLedger={}}=await local.get('autoSignLedger');
    for(const hash of Object.keys(autoSignLedger))if(now-autoSignLedger[hash].time>7*86400000)delete autoSignLedger[hash];
    const old=autoSignLedger[key];
    if(old&&!retry){
      const result=['checking','submitting'].includes(old.status)?{status:'unknown',message:'上次自动签到被中断，结果未知，请手动核对；不会再次自动提交',attempted:true}:old;
      await session.set({['signResult:'+tabId]:result});return {...result,newAttempt:false};
    }
    if(retry&&old&&old.status!=='needs-login'&&!(old.status==='cancelled'&&!old.attempted))throw Error('本次提交结果可能已生效，请打开学校页面核对，不可自动重试');
    controller.signal.throwIfAborted();
    autoSignLedger[key]={status:'checking',time:now,attempted:false};
    const bounded=Object.fromEntries(Object.entries(autoSignLedger).sort((a,b)=>b[1].time-a[1].time).slice(0,200));
    await local.set({autoSignLedger:bounded});
    const outcome=await AutoSign.submit(target.url,{signal:controller.signal,beforeSubmit:async()=>{
      if(!(await config()).settings.autoSign||autoSigningPaused||cancelledSignTabs.has(tabId)||!(await session.get('qrEnabled:'+tabId))['qrEnabled:'+tabId])controller.abort();
      controller.signal.throwIfAborted();
      bounded[key]={status:'submitting',time:Date.now(),attempted:true};await local.set({autoSignLedger:bounded});
    }});
    const result={...outcome,time:Date.now()};bounded[key]=result;
    await local.set({autoSignLedger:bounded});await session.set({['signResult:'+tabId]:result});
    return {...result,newAttempt:true};
  }finally{if(signControllers.get(tabId)===controller)signControllers.delete(tabId);}
}
async function foundQR(m,sender){
  const id=sender.tab?.id,target=Core.qr(m.url);if(!target||id===undefined||sender.frameId!==0||!(await session.get('qrEnabled:'+id))['qrEnabled:'+id])throw Error('扫描未启用或二维码无效');
  const {seenQR={}}=await session.get('seenQR'),now=Date.now();const repeated=Boolean(seenQR[target.key]&&now-seenQR[target.key]<43200000);
  seenQR[target.key]=now;const entries=Object.entries(seenQR).filter(([,time])=>now-time<43200000).sort((a,b)=>b[1]-a[1]).slice(0,200);
  await session.set({seenQR:Object.fromEntries(entries),['qr:'+id]:{url:target.url,time:now}});
  if((await config()).settings.autoSign){
    const signResult=await attemptAutoSign(target,id);
    if(!repeated||signResult.newAttempt)await notify('qr:'+id,signResult.status==='success'?'自动签到成功 · 服务端确认':'自动签到需要处理',signResult.message,{kind:'qr',tabId:id});
    return {repeated,signResult};
  }
  await session.remove('signResult:'+id);
  if(!repeated)await notify('qr:'+id,'发现课堂签到二维码','打开学校签到页，完成后请核对签到记录。',{kind:'qr',tabId:id});
  return {repeated};
}
async function getState(tabId){
  const data=await config(),extra=await local.get(['courseStates','logs','due']),{pending={}}=await session.get('pending');let qr={running:false,status:'尚未开启'};
  if(Number.isInteger(tabId))try{qr=await chrome.tabs.sendMessage(tabId,{type:'qrState'})||qr;}catch{}
  const target=(await session.get('qr:'+tabId))['qr:'+tabId];return {...data,...extra,pending,qr:{...qr,canOpen:Core.fresh(target)},autoSign:(await session.get('signResult:'+tabId))['signResult:'+tabId]};
}
async function dispatch(m,sender){
  switch(m.type){
    case 'openMonitor':await chrome.windows.create({url:chrome.runtime.getURL('monitor.html'),type:'normal',width:1280,height:900});break;
    case 'captionTabs':return await captionTabs();
    case 'captionBind':return await bindCaptions(m.tabId,m.sourceId);
    case 'captionUnbind':await unbindCaptions(m.tabId);break;
    case 'attendanceHint':return await attendanceHint(m);
    case 'sessionCheck':return await AutoSign.sessionStatus();
    case 'openSchoolLogin':await chrome.tabs.create({url:'https://mlearning.sjtu.edu.cn/lms/mobile/'});break;
    case 'monitorStart':case 'monitorStop':case 'monitorFound':{
      const tab=await chrome.tabs.get(m.tabId);if(tab.url!==chrome.runtime.getURL('monitor.html'))throw Error('扫描器页面无效');
      if(m.type==='monitorStart'){cancelledSignTabs.delete(m.tabId);await session.set({['qrEnabled:'+m.tabId]:true});}
      else if(m.type==='monitorStop'){await unbindCaptions(m.tabId);await session.remove('qrEnabled:'+m.tabId);await ack('qr:'+m.tabId);await ack('hint:'+m.tabId);}
      else return await foundQR(m,{...sender,tab,frameId:0});break;
    }
    case 'state':return await getState(m.tabId);
    case 'qrStart':await startQR(m.tabId);break;
    case 'qrStop':await session.remove('qrEnabled:'+m.tabId);try{await chrome.tabs.sendMessage(m.tabId,{type:'qrStop'});}catch{}await ack('qr:'+m.tabId);break;
    case 'autoRetry':{
      const t=(await session.get('qr:'+m.tabId))['qr:'+m.tabId];if(!Core.fresh(t))throw Error('没有近期二维码，请先重新扫描');
      const result=await attemptAutoSign(Core.qr(t.url),m.tabId,true);
      await notify('qr:'+m.tabId,result.status==='success'?'自动签到成功 · 服务端确认':'自动签到需要处理',result.message,{kind:'qr',tabId:m.tabId});break;
    }
    case 'qrFound':return await foundQR(m,sender);
    case 'qrOpen':{const target=(await session.get('qr:'+m.tabId))['qr:'+m.tabId];if(!Core.fresh(target))throw Error('没有近期二维码，请回到课堂重新扫描');await chrome.tabs.create({url:Core.qr(target.url).url});await ack('qr:'+m.tabId);break;}
    case 'tableReport':await tableReport(m,sender);break;
    case 'saveSettings':{const {settings:s}=await config();const p=m.settings||{};if(p.autoSign===true)autoSigningPaused=false;for(const key of ['autoSign','coursesEnabled','lessonsEnabled','autoOpen','sound'])if(typeof p[key]==='boolean')s[key]=p[key];if(p.interval!==undefined)s.interval=Math.min(600,Math.max(30,Number(p.interval)||60));await local.set({settings:s});if(!s.sound)await sound(false);await plan();if(s.coursesEnabled)await poll();break;}
    case 'addCourse':{const c=Core.course(m.course),{courses}=await config();if(courses.some(x=>x.id===c.id))throw Error('这门课程已经添加');if(courses.length>=20)throw Error('最多添加 20 门监控课程');await local.set({courses:[...courses,c]});if((await config()).settings.coursesEnabled)await poll();break;}
    case 'removeCourse':{const {courses}=await config(),{courseStates={}}=await local.get('courseStates');delete courseStates[m.id];await local.set({courses:courses.filter(c=>c.id!==m.id),courseStates});await ack('course:'+m.id);break;}
    case 'openCourse':{const c=(await config()).courses.find(c=>c.id===m.id);if(!c)throw Error('课程不存在');await chrome.tabs.create({url:c.url});break;}
    case 'addLesson':{const r=Core.lesson(m.lesson),{lessons}=await config();if(lessons.length>=100)throw Error('最多添加 100 条课前提醒');r.id=crypto.randomUUID();await local.set({lessons:[...lessons,r]});await plan();break;}
    case 'removeLesson':{const {lessons}=await config();await local.set({lessons:lessons.filter(r=>r.id!==m.id)});await plan();await ack('lesson:'+m.id);break;}
    case 'ack':return {audioStopped:await ack(m.id)};
    case 'qrAck':await ack('qr:'+sender.tab.id);break;
    case 'openNotice':await openTarget(m.id);break;
    case 'test':await notify('test','提醒测试','这是一条测试提醒；提示音最多播放 30 秒。',{kind:'test'});break;
    case 'clearLogs':await local.set({logs:[]});break;
    default:throw Error('不支持的操作');
  }return {};
}
const pageTypes=['tableStatus','tableReport','qrCapture','qrFound','qrAck','captionReport','captionIsEnabled'];
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(!m||sender.id!==chrome.runtime.id||m.type==='audio')return;
  const ui=[chrome.runtime.getURL('popup.html'),chrome.runtime.getURL('monitor.html')].includes(sender.url);if(!ui&&!pageTypes.includes(m.type))return;
  // Cancellation must reach an in-flight request without waiting behind it in the queue.
  if(ui&&['qrStop','monitorStop'].includes(m.type)){cancelledSignTabs.add(m.tabId);signControllers.get(m.tabId)?.abort();}
  if(ui&&m.type==='saveSettings'&&m.settings?.autoSign===false){autoSigningPaused=true;for(const controller of signControllers.values())controller.abort();}
  const send=p=>p.then(data=>reply({ok:true,...data})).catch(e=>reply({ok:false,error:e.message||'操作失败'}));
  if(m.type==='captionReport'){send(deliverCaption(m,sender));return true;}
  if(m.type==='captionIsEnabled'){send(session.get('captionBindings').then(d=>({enabled:Boolean(d.captionBindings?.[sender.tab?.id]?.length)})));return true;}
  if(m.type==='tableStatus'){send(config().then(c=>({enabled:c.settings.coursesEnabled})));return true;}
  if(m.type==='qrCapture'){send(capture(sender));return true;}
  if(m.type==='state'){send(getState(m.tabId));return true;}
  queue=queue.catch(()=>{}).then(()=>dispatch(m,sender));send(queue);return true;
});
const enqueue=fn=>{queue=queue.catch(()=>{}).then(fn).catch(()=>log('error','后台任务失败，将在下次检查重试'));};
chrome.alarms.onAlarm.addListener(a=>enqueue(()=>a.name==='poll'?poll():a.name==='plan'?plan():a.name.startsWith('lesson:')?remindLesson(a.name):Promise.resolve()));
chrome.notifications.onButtonClicked.addListener((id,index)=>enqueue(async()=>{if(index===0)try{await openTarget(id);}catch(e){await log('error',e.message);}else await ack(id);}));
chrome.notifications.onClicked.addListener(id=>enqueue(async()=>{try{await openTarget(id);}catch(e){await log('error',e.message);}}));
chrome.notifications.onClosed.addListener((id,byUser)=>{if(byUser)enqueue(()=>ack(id));});
chrome.tabs.onRemoved.addListener(id=>{signControllers.get(id)?.abort();enqueue(async()=>{await unbindCaptions(id);await session.remove(['qrEnabled:'+id,'qr:'+id,'signResult:'+id]);await ack('qr:'+id);});});
chrome.runtime.onInstalled.addListener(()=>enqueue(plan));
chrome.runtime.onStartup.addListener(()=>enqueue(async()=>{await badge();await plan();await poll();}));
async function configureAutomaticSigning(){
  const {autoSignConfigured221}=await local.get('autoSignConfigured221');
  if(!autoSignConfigured221){
    const {settings:s}=await config();
    await local.set({settings:{...s,autoSign:true},autoSignConfigured221:true});
  }
}
enqueue(async()=>{await configureAutomaticSigning();await plan();await badge();});
