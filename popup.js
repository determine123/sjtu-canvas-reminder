const $=id=>document.getElementById(id);let tabId,state,loading=false,refreshTimer;
function message(text){$('message').textContent=text;$('message').hidden=!text;}
async function send(type,data={}){const result=await chrome.runtime.sendMessage({type,...data});if(!result?.ok)throw Error(result?.error||'插件未响应，请重新加载');return result;}
function element(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function empty(title,text){const box=element('div',undefined,'empty');box.append(element('strong',title),element('span',text));return box;}
function time(value){return new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});}
function action(text,run,danger=false){const b=element('button',text,'text-button'+(danger?' danger':''));b.type='button';b.onclick=async()=>{b.disabled=true;try{message('');await run();await refresh();}catch(e){message(e.message);}finally{b.disabled=false;}};return b;}
function render(){
  const q=state.qr||{};const result=state.autoSign;
  $('autoSignResult').hidden=!result;$('autoSignResult').textContent=result?.message||'';
  $('autoRetry').hidden=!state.settings.autoSign||!result||!['needs-login','cancelled'].includes(result.status);$('autoRetry').disabled=!q.running||!q.canOpen;$('qrStatus').textContent=q.status||'尚未开启';$('qrTime').textContent=q.lastScan?'最近扫描 '+time(q.lastScan)+(q.width?' · '+q.width+'×'+q.height:''):'每 2.5 秒检查可见课堂画面';
  $('qrPill').textContent=q.running?'已开启':'未开启';$('qrPill').classList.toggle('on',Boolean(q.running));$('scanDot').classList.toggle('on',Boolean(q.running));
  $('qrStart').disabled=Boolean(q.running);$('qrStop').disabled=!q.running;$('qrOpen').disabled=!q.canOpen;
  const pending=Object.entries(state.pending||{}).sort((a,b)=>b[1].time-a[1].time);$('noticeCount').textContent=pending.length;$('ackAll').disabled=!pending.length;$('notices').replaceChildren();
  if(!pending.length)$('notices').append(empty('暂时没有待处理提醒','放心上课，我们会留意新的签到。'));
  for(const [id,n] of pending){const box=element('div',undefined,'item');box.append(element('div',n.title,'item-title'),element('p',n.message),element('small',time(n.time)));const buttons=element('div',undefined,'item-actions');if(n.kind==='qr'||n.url)buttons.append(action('打开查看 ↗',()=>send('openNotice',{id})));buttons.append(action('已收到',()=>send('ack',{id})));box.append(buttons);$('notices').append(box);}
  for(const key of ['autoSign','coursesEnabled','lessonsEnabled','sound','autoOpen'])$(key).checked=Boolean(state.settings[key]);$('interval').value=state.settings.interval;
  $('courseList').replaceChildren();if(!state.courses.length)$('courseList').append(empty('还没有监控课程','添加课程编号，或粘贴签到工具地址。'));
  for(const c of state.courses){const status=state.courseStates?.[c.id]||{};const box=element('div',undefined,'item');box.append(element('div',c.name,'item-title'),element('p',state.settings.coursesEnabled?(status.status||'等待检查'):'监控已关闭'));if(status.lastRead)box.append(element('small','最近识别 '+time(status.lastRead)));const buttons=element('div',undefined,'item-actions');buttons.append(action('打开课程 ↗',()=>send('openCourse',{id:c.id})),action('移除',()=>send('removeCourse',{id:c.id}),true));box.append(buttons);$('courseList').append(box);}
  $('lessonList').replaceChildren();if(!state.lessons.length)$('lessonList').append(empty('还没有课前提醒','按课表添加课程，提前 30 分钟提醒。'));
  for(const r of state.lessons){const box=element('div',undefined,'item');box.append(element('div',r.name,'item-title'),element('p','周'+r.days.map(d=>'一二三四五六日'[d-1]).join('、')+' '+r.time+' · '+({all:'每周',odd:'单周',even:'双周'}[r.weeks])));box.append(element('small',r.from+' 至 '+r.to+(r.location?' · '+r.location:'')));const due=state.due?.['lesson:'+r.id];box.append(element('small',state.settings.lessonsEnabled?(due?'下次提醒 '+time(due.when):'当前无待提醒日期'):'课前提醒已关闭'));box.append(action('移除',()=>send('removeLesson',{id:r.id}),true));$('lessonList').append(box);}
  $('logs').replaceChildren();for(const log of (state.logs||[]).slice(0,10)){const row=element('div',log.message,'event');row.append(element('small',time(log.time)));$('logs').append(row);}if(!state.logs?.length)$('logs').append(element('p','还没有事件记录','intro'));
}
async function refresh(){if(loading)return;loading=true;try{state=await send('state',{tabId});render();}catch(e){message(e.message);}finally{loading=false;}}
async function run(type,data={}){message('');try{const r=await send(type,data);if(r.audioStopped===false)message('通知已处理，但声音停止失败，请重新加载插件');await refresh();return true;}catch(e){message(e.message);return false;}}
for(const button of document.querySelectorAll('[data-page]'))button.onclick=()=>{for(const b of document.querySelectorAll('[data-page]')){const selected=b===button;b.classList.toggle('selected',selected);b.setAttribute('aria-selected',String(selected));}for(const p of document.querySelectorAll('.page'))p.hidden=p.id!==button.dataset.page;message('');};
for(const [id,type] of [['openMonitor','openMonitor'],['qrStart','qrStart'],['qrStop','qrStop'],['qrOpen','qrOpen'],['autoRetry','autoRetry'],['test','test'],['clearLogs','clearLogs']])$(id).onclick=async()=>{const b=$(id);b.disabled=true;await run(type,{tabId});if(['test','clearLogs','openMonitor'].includes(id))b.disabled=false;};
for(const id of ['ackAll','stopSound'])$(id).onclick=()=>run('ack');
for(const key of ['autoSign','coursesEnabled','lessonsEnabled','sound','autoOpen','interval'])$(key).onchange=async()=>{const value=key==='interval'?Number($(key).value):$(key).checked;await run('saveSettings',{settings:{[key]:value}});};
$('courseForm').onsubmit=async event=>{event.preventDefault();const f=new FormData(event.target);if(await run('addCourse',{course:{name:f.get('name'),url:f.get('url')}})){event.target.reset();$('addCourseDetails').open=false;}};
$('lessonForm').onsubmit=async event=>{event.preventDefault();const f=new FormData(event.target);const lesson=Object.fromEntries(f);lesson.days=f.getAll('day').map(Number);delete lesson.day;if(await run('addLesson',{lesson})){event.target.reset();$('addLessonDetails').open=false;}};
chrome.storage.onChanged.addListener(()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,120);});
(async()=>{try{const tabs=await chrome.tabs.query({active:true,currentWindow:true});tabId=tabs[0]?.id;await refresh();}catch(e){message(e.message);}})();
setInterval(refresh,3000);
