async function verifyMonitor(tabId){const tab=await chrome.tabs.get(tabId);if(tab.url!==chrome.runtime.getURL('monitor.html'))throw Error('扫描器页面无效');return tab;}
async function captionTabs(){
  const tabs=await chrome.tabs.query({url:'https://*.sjtu.edu.cn/*'});
  return {tabs:tabs.filter(t=>{try{return new URL(t.url).hostname.endsWith('.sjtu.edu.cn');}catch{return false;}}).map(t=>({id:t.id,title:String(t.title||'课堂页面').slice(0,80),host:new URL(t.url).hostname}))};
}
async function unbindCaptions(monitorId){
  const {captionBindings={}}=await session.get('captionBindings');
  for(const [key,ids] of Object.entries(captionBindings)){
    const rest=ids.filter(id=>id!==monitorId);if(rest.length)captionBindings[key]=rest;else{delete captionBindings[key];try{await chrome.tabs.sendMessage(Number(key),{type:'captionControl',enabled:false});}catch{}}
  }await session.set({captionBindings});
}
async function bindCaptions(monitorId,sourceId){
  await verifyMonitor(monitorId);if(!Number.isInteger(sourceId)||sourceId===monitorId)throw Error('请选择课堂标签页');
  const source=await chrome.tabs.get(sourceId);let url;try{url=new URL(source.url);}catch{}
  if(!url||url.protocol!=='https:'||!url.hostname.endsWith('.sjtu.edu.cn'))throw Error('只能绑定已授权的上交课堂网页');
  await unbindCaptions(monitorId);const {captionBindings={}}=await session.get('captionBindings');captionBindings[sourceId]=[...new Set([...(captionBindings[sourceId]||[]),monitorId])];await session.set({captionBindings});
  try{
    try{await chrome.scripting.executeScript({target:{tabId:sourceId,allFrames:true},files:['hint-policy.js','captions-content.js']});}
    catch{await chrome.scripting.executeScript({target:{tabId:sourceId},files:['hint-policy.js','captions-content.js']});}
    await chrome.tabs.sendMessage(sourceId,{type:'captionControl',enabled:true});
  }catch{await unbindCaptions(monitorId);throw Error('字幕脚本未能启动，请刷新课堂页面后重新绑定');}
  return {bound:true};
}
async function deliverCaption(m,sender){
  if(!sender.tab)return {};const {captionBindings={}}=await session.get('captionBindings');const ids=captionBindings[sender.tab.id]||[];
  const text=typeof m.text==='string'?m.text.slice(0,500):'';
  for(const id of ids)try{await chrome.runtime.sendMessage({type:'captionDelivery',to:id,text:HintPolicy.match(text)?text:'',observed:Boolean(m.observed)});}catch{}
  return {};
}
async function attendanceHint(m){
  await verifyMonitor(m.tabId);
  if(!(await session.get('qrEnabled:'+m.tabId))['qrEnabled:'+m.tabId]||!HintPolicy.match(m.text))return {triggered:false};
  const key='hintLast:'+m.tabId,last=(await session.get(key))[key]||0;if(Date.now()-last<15000)return {triggered:false};
  await session.set({[key]:Date.now()});
  const source=m.source==='voice'?'语音':'字幕';
  // A hint is deliberately NOT routed to AutoSign. Only foundQR supplies current valid parameters.
  await notify('hint:'+m.tabId,'检测到'+source+'签到提示','正在加速扫描；仅在识别到有效二维码后尝试签到。',{kind:'hint'});
  return {triggered:true};
}
