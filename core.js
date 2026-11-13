(function(root){
  const defaults={autoSign:true,coursesEnabled:false,lessonsEnabled:false,autoOpen:false,sound:true,interval:60};
  function qr(value){
    try{if(typeof value!=='string'||value.length>8192)return null;const u=new URL(value);
      if(u.protocol!=='https:'||u.hostname!=='mlearning.sjtu.edu.cn'||u.port||u.username||u.password||u.hash||u.pathname!=='/lms/mobile2/forscan/')return null;
      for(const key of ['courseCode','rollCallToken','signHistoryId']){const a=u.searchParams.getAll(key);if(a.length!==1||!a[0].trim()||a[0].length>2048)return null;}
      return {url:u.href,key:JSON.stringify([u.searchParams.get('courseCode'),u.searchParams.get('signHistoryId')])};
    }catch{return null;}
  }
  function fresh(target,now=Date.now()){return Boolean(target&&Number.isFinite(target.time)&&now>=target.time&&now-target.time<300000&&qr(target.url));}
  function course(input){
    const name=String(input.name||'').trim();let value=String(input.url||'').trim();
    if(/^\d+$/.test(value))value=`https://oc.sjtu.edu.cn/courses/${value}/external_tools/6650`;
    let u;try{u=new URL(value);}catch{throw Error('填写课程编号或完整的 Canvas 签到工具地址');}
    if(u.protocol!=='https:'||u.hostname!=='oc.sjtu.edu.cn'||u.port||u.username||u.password||!/^\/courses\/\d+\/external_tools\/\d+\/?$/.test(u.pathname))throw Error('需要 oc.sjtu.edu.cn 的课程签到工具地址');
    const url=u.origin+u.pathname.replace(/\/$/,'');
    return {id:url,name:name.slice(0,60)||'课程 '+u.pathname.split('/')[2],url};
  }
  const dateOf=t=>new Date(t+8*3600000).toISOString().slice(0,10);
  function dateValid(s){return /^\d{4}-\d{2}-\d{2}$/.test(s||'')&&Number.isFinite(Date.parse(s+'T00:00:00+08:00'))&&dateOf(Date.parse(s+'T00:00:00+08:00'))===s;}
  const timeValid=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s||'');
  function scheduledDate(r,date){
    if(!dateValid(date)||date<r.from||date>r.to)return false;
    const t=Date.parse(date+'T00:00:00+08:00'),day=new Date(t+8*3600000).getUTCDay()||7;
    if(!r.days.includes(day))return false;
    if(r.weeks!=='all'){const week=Math.floor((t-Date.parse(r.anchor+'T00:00:00+08:00'))/604800000)+1;if(week<1||(week%2===1)!==(r.weeks==='odd'))return false;}
    return true;
  }
  function lesson(r){
    if(!r||typeof r.name!=='string'||!r.name.trim()||!Array.isArray(r.days)||!r.days.length||r.days.some(d=>!Number.isInteger(d)||d<1||d>7)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time||'')||!dateValid(r.from)||!dateValid(r.to)||r.from>r.to)throw Error('请检查课程名称、星期、时间和起止日期');
    const weeks=r.weeks||'all';if(!['all','odd','even'].includes(weeks))throw Error('周次设置不正确');
    if(weeks!=='all'&&(!dateValid(r.anchor)||new Date(r.anchor+'T12:00:00+08:00').getUTCDay()!==1))throw Error('单双周需填写第一周的周一日期');
    const out={id:typeof r.id==='string'?r.id:undefined,name:r.name.trim().slice(0,60),days:[...new Set(r.days)],time:r.time,from:r.from,to:r.to,location:String(r.location||'').slice(0,120),weeks,anchor:weeks==='all'?'':r.anchor};
    if(r.changes!==undefined&&!Array.isArray(r.changes))throw Error('停课或改期记录格式不正确');
    if((r.changes||[]).length>50)throw Error('每门课最多添加 50 条停课或改期记录');
    const seen=new Set();out.changes=(r.changes||[]).map(c=>{
      if(!c||typeof c!=='object'||!scheduledDate(out,c.date))throw Error('调整日期必须是起止范围内已安排的上课日');
      if(seen.has(c.date))throw Error('同一上课日只能添加一条停课或改期记录');seen.add(c.date);
      if(c.kind==='skip')return {date:c.date,kind:'skip'};
      if(c.kind!=='move'||!dateValid(c.toDate)||c.toDate<out.from||c.toDate>out.to||!timeValid(c.time))throw Error('改期需填写起止范围内的新日期和上课时间');
      return {date:c.date,kind:'move',toDate:c.toDate,time:c.time,location:String(c.location??out.location??'').slice(0,120)};
    }).sort((a,b)=>a.date.localeCompare(b.date));
    return out;
  }
  function nextLesson(row,now=Date.now(),sent={}){
    const r=lesson(row),candidates=[];
    for(const c of r.changes){if(c.kind!=='move')continue;const classAt=Date.parse(c.toDate+'T'+c.time+':00+08:00'),key=JSON.stringify([r.id||r.name,'move',c.date,c.toDate,c.time]);
      if(classAt>now&&!sent[key])candidates.push({key,classAt,when:Math.max(now+1000,classAt-1800000),date:c.toDate,time:c.time,location:c.location,moved:true,originalDate:c.date});}
    const start=Math.max(Date.parse(dateOf(now)+'T00:00:00+08:00'),Date.parse(r.from+'T00:00:00+08:00')),end=Date.parse(r.to+'T00:00:00+08:00'),changes=new Map(r.changes.map(c=>[c.date,c]));
    for(let t=start;t<=end;t+=86400000){const date=dateOf(t);if(changes.has(date)||!scheduledDate(r,date))continue;
      const classAt=Date.parse(date+'T'+r.time+':00+08:00'),key=JSON.stringify([r.id||r.name,date,r.time]);if(classAt<=now||sent[key])continue;
      candidates.push({key,classAt,when:Math.max(now+1000,classAt-1800000),date,time:r.time,location:r.location,moved:false});}
    candidates.sort((a,b)=>a.classAt-b.classAt);return candidates[0]||null;
  }
  function table(doc){
    const clean=s=>String(s||'').replace(/\s+/g,' ').trim();const owners=new Map(),maps=new Map(),records=[];
    const tables=[...doc.querySelectorAll('table')];const owner=t=>t.closest('.el-table__fixed,.el-table__fixed-right')||t.closest('.el-table');
    for(const t of tables){let labels=[...t.querySelectorAll('thead th,thead td')].map(e=>clean(e.textContent));if(!labels.length)labels=[...(t.querySelector('tr')?.children||[])].map(e=>clean(e.textContent));
      const map={num:labels.findIndex(x=>/签到号|签到编号/.test(x)),status:labels.findIndex(x=>/状态/.test(x)),time:labels.findIndex(x=>/创建时间|开始时间|发起时间/.test(x))};
      if(map.num>=0){maps.set(t,map);if(owner(t))owners.set(owner(t),map);}
    }
    for(const t of tables){const m=maps.get(t)||owners.get(owner(t));if(!m)continue;for(const row of t.querySelectorAll('tr')){const c=[...row.querySelectorAll(':scope > td')].map(e=>clean(e.textContent));const num=c[m.num];if(!/^\d{1,12}$/.test(num||''))continue;const status=c[m.status]||'',created=c[m.time]||'';records.push({num,status,created,key:num+'|'+created,active:/未签到|待签到|进行中|签到中/.test(status)&&!/已结束|已过期|已关闭/.test(status)});}}
    const unique=new Map();for(const r of records)if(!unique.has(r.key)||r.status)unique.set(r.key,r);
    return [...unique.values()].sort((a,b)=>{const x=Date.parse(a.created.replace(/-/g,'/')),y=Date.parse(b.created.replace(/-/g,'/'));return Number.isFinite(y)&&Number.isFinite(x)?y-x:Number.isFinite(y)?1:Number.isFinite(x)?-1:0;})[0]||null;
  }
  function shouldAlert(previous,record){return Boolean(record?.active&&(!previous||previous.key!==record.key||!previous.active));}
  root.Core={defaults,qr,fresh,course,dateOf,lesson,nextLesson,table,shouldAlert};
  if(typeof module!=='undefined')module.exports=root.Core;
})(globalThis);
