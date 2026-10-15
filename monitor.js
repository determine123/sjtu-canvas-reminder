const $=id=>document.getElementById(id);let tabId,stream,timer,roi,autoROI,drag,running=false,busy=false,frames=0,epoch=0,staticFrame=false;
const reports=new Map();let boostUntil=0,captionsActive=false;
const acceptHint=HintPolicy.gate();
const voice=VoiceHints.create({onText:text=>handleHint(text,'voice'),onStatus:status=>{$('voiceStatus').textContent=status;}});
function handleHint(text,source){
  if(!HintPolicy.match(text))return;
  if(!running){$('hintStatus').textContent='检测到可能的签到提示，但扫描尚未开始；不会提交签到';return;}
  if(!acceptHint(text))return;
  boostUntil=Date.now()+15000;autoROI=null;
  $('hintStatus').textContent=`检测到${source==='voice'?'语音':'字幕'}提示：${text.slice(0,80)}。已加速扫描 15 秒；等待当前有效签到码。`;
  send('attendanceHint',{text:text.slice(0,500),source}).catch(e=>{$('hintStatus').textContent='提示已触发扫描，系统提醒失败：'+e.message;});
  if(!busy){clearTimeout(timer);timer=setTimeout(tick,0);}
}
function startVoice(){if(!$('voiceHints').checked){$('voiceStatus').textContent='请先勾选语音识别并阅读音频处理说明';return;}voice.start(stream?.getAudioTracks()[0]);}
async function refreshCaptions(){try{const data=await send('captionTabs');$('captionSource').replaceChildren();const initial=document.createElement('option');initial.value='';initial.textContent='请选择课堂标签页';$('captionSource').append(initial);for(const tab of data.tabs){const option=document.createElement('option');option.value=tab.id;option.textContent=tab.title+' · '+tab.host;$('captionSource').append(option);}}catch(e){$('captionStatus').textContent=e.message;}}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{if(sender.id===chrome.runtime.id&&m.type==='captionDelivery'&&m.to===tabId){if(!captionsActive){reply({ok:true});return;}$('captionStatus').textContent=m.observed?'已读取播放器字幕，正在检测签到提示':'未读取到可用字幕：请打开播放器字幕，或改用语音';if(m.text)handleHint(m.text,'captions');reply({ok:true});}});
$('captionRefresh').onclick=refreshCaptions;
$('captionBind').onclick=async()=>{try{const sourceId=Number($('captionSource').value);if(!sourceId)throw Error('请选择课堂标签页');captionsActive=true;await send('captionBind',{sourceId});$('captionStatus').textContent='字幕已绑定，等待播放器字幕更新';}catch(e){captionsActive=false;$('captionStatus').textContent=e.message;}};
$('captionUnbind').onclick=()=>{captionsActive=false;return send('captionUnbind').then(()=>{$('captionStatus').textContent='字幕读取已停止';}).catch(e=>{$('captionStatus').textContent=e.message;});};
$('voiceStart').onclick=startVoice;$('voiceStop').onclick=()=>{voice.stop();$('voiceStatus').textContent='语音识别已停止';};
$('voiceHints').onchange=()=>{if(!$('voiceHints').checked){voice.stop();$('voiceStatus').textContent='语音未启用';}else if(running)startVoice();else $('voiceStatus').textContent='下一次共享时请选择课堂标签页并勾选共享音频';};
const canvas=$('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true}),work=document.createElement('canvas'),workCtx=work.getContext('2d',{willReadFrequently:true}),video=$('video');
async function send(type,data={}){const r=await chrome.runtime.sendMessage({type,tabId,...data});if(!r?.ok)throw Error(r?.error||'插件未响应');return r;}
function diagnostics(lines){$('diagnostics').replaceChildren(...lines.map(s=>{const li=document.createElement('li');li.textContent=s;return li;}));}
function preview(){if(canvas.width!==work.width||canvas.height!==work.height){canvas.width=work.width;canvas.height=work.height;}ctx.drawImage(work,0,0);const area=roi||autoROI;if(area){ctx.strokeStyle='#ffab35';ctx.lineWidth=Math.max(2,canvas.width/450);ctx.strokeRect(area.x*canvas.width,area.y*canvas.height,area.w*canvas.width,area.h*canvas.height);}$('dimensions').textContent=work.width+' × '+work.height;$('placeholder').hidden=true;}
async function reportTarget(code,token){
  const key=code.target.key,previous=reports.get(key),now=performance.now();
  if(previous?.pending||(previous&&now-previous.sent<3000))return;
  const item={pending:true,sent:now};reports.set(key,item);
  if(reports.size>100)reports.delete(reports.keys().next().value);
  $('status').textContent='已识别 · 正在提交，扫描继续进行';
  try{const response=await send('monitorFound',{url:code.target.url});if(!running||token!==epoch)return;
    const result=response.signResult;$('result').textContent=result?.message||'已识别签到码并发出提醒，请打开学校页面完成签到';$('open').disabled=false;$('retry').hidden=!result||!['needs-login','cancelled'].includes(result.status);
    $('status').textContent=result?.status==='success'?'服务端确认签到成功 · 请核对记录':'已发现签到码 · '+(result?'查看右侧处理结果':'已提醒');
    const t=result?.timings;$('signTiming').textContent=t?`登录准备 ${t.authMs} ms / 接口 ${t.requestMs} ms / 总计 ${t.totalMs} ms`:`处理 ${Math.round(performance.now()-now)} ms`;
  }catch(e){if(token===epoch)$('result').textContent='签到处理失败：'+e.message;}finally{item.pending=false;}
}
async function analyze(submit){
  if(busy)return;busy=true;const token=epoch;
  try{const start=performance.now();const decoded=await ScanEngine.decode(work,roi||(submit?autoROI:null));if(token!==epoch)return;
    const elapsed=Math.round(performance.now()-start);$('decodeTiming').textContent=elapsed+' ms';
    frames++;$('frames').textContent=frames;$('lastScan').textContent=new Date().toLocaleTimeString('zh-CN');$('codes').textContent=decoded.codes.length;
    diagnostics([`本帧耗时 ${elapsed} ms · ${decoded.passes.join(' + ')}`,...decoded.codes.map(c=>c.engine+'：'+c.description),...(decoded.codes.length?[]:['未解出二维码。请确认预览清晰完整，或框选放大。'])]);
    const targets=decoded.codes.filter(c=>c.target);
    if(!submit){$('result').textContent=targets.length?'测试截图中识别到有效签到二维码（仅测试，未提交）':decoded.codes.length?'已解出二维码，但不是完整有效的上交签到链接':'截图中暂未解出二维码';return;}
    if(targets[0]?.region)autoROI=targets[0].region;
    if(!targets.length){$('status').textContent=[...reports.values()].some(r=>r.pending)?'扫描继续进行 · 正在等待签到接口响应':decoded.black?'共享画面接近全黑，请检查共享来源、播放器及视频保护限制':'正在扫描 · '+(decoded.codes.length?'已解出其他二维码':'等待签到二维码');return;}
    // Do not hold the decoder lock during a network request; keep capturing fresh codes.
    for(const code of targets)if(running&&token===epoch)reportTarget(code,token);
  }catch(e){$('status').textContent='识别失败：'+e.message;diagnostics(['本帧处理失败，请检查画面或重新加载扩展。']);}finally{busy=false;}
}
async function tick(){
  const began=performance.now();if(!running)return;if(boostUntil&&Date.now()>=boostUntil){boostUntil=0;$('hintStatus').textContent='加速时段结束，已恢复常规扫描；等待下一次提示';}
  try{if(video.readyState<2||!video.videoWidth){$('status').textContent='正在等待共享画面，请检查共享来源是否仍在播放';return;}
    if(!busy){if(work.width!==video.videoWidth||work.height!==video.videoHeight){work.width=video.videoWidth;work.height=video.videoHeight;autoROI=null;}workCtx.drawImage(video,0,0);preview();await analyze(true);}
  }finally{if(running)timer=setTimeout(tick,Math.max(40,(Date.now()<boostUntil?100:250)-(performance.now()-began)));}
}
async function stop(){captionsActive=false;voice.stop();boostUntil=0;$('voiceStatus').textContent='语音识别已停止';$('hintStatus').textContent='扫描已停止，语音与字幕不会触发提交';$('captionStatus').textContent='扫描停止后字幕绑定将解除';epoch++;running=false;clearTimeout(timer);for(const track of stream?.getTracks()||[])track.stop();stream=null;video.srcObject=null;$('start').disabled=false;$('stop').disabled=true;$('status').textContent='扫描已停止';try{await send('monitorStop');}catch(e){$('result').textContent=e.message;}}
$('start').onclick=async()=>{
  try{
    $('status').textContent='请选择课堂标签页、窗口或屏幕进行共享';
    const selected=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:10,max:15}},audio:$('voiceHints').checked});
    stream=selected;$('status').textContent='已选择共享来源，等待首帧画面';video.srcObject=stream;let playbackTimer;try{await Promise.race([video.play(),new Promise((_,reject)=>{playbackTimer=setTimeout(()=>reject(Error('共享来源未产生视频帧，请重新选择课堂画面')),8000);})]);}finally{clearTimeout(playbackTimer);}await send('monitorStart');epoch++;running=true;staticFrame=false;roi=null;autoROI=null;reports.clear();$('captureRate').textContent=(stream.getVideoTracks()[0].getSettings().frameRate||'未知')+' fps';$('clearROI').disabled=false;$('start').disabled=true;$('stop').disabled=false;
    stream.getVideoTracks()[0].addEventListener('ended',()=>{if(running)stop();});if($('voiceHints').checked)startVoice();await tick();
  }catch(e){for(const track of stream?.getTracks()||[])track.stop();stream=null;$('status').textContent=e.name==='NotAllowedError'?'未开始共享：请重新选择课堂标签页、窗口或屏幕':'无法开始扫描：'+e.message;}
};
$('stop').onclick=stop;$('open').onclick=()=>send('qrOpen').catch(e=>{$('result').textContent=e.message;});$('retry').onclick=()=>send('autoRetry').then(()=>send('state')).then(r=>{$('result').textContent=r.autoSign?.message||'请查看提醒结果';}).catch(e=>{$('result').textContent=e.message;});$('ack').onclick=()=>send('ack',{id:'qr:'+tabId}).catch(e=>{$('result').textContent=e.message;});
$('autoSign').onchange=()=>send('saveSettings',{settings:{autoSign:$('autoSign').checked}}).catch(e=>{$('result').textContent=e.message;});
$('file').onchange=async event=>{const file=event.target.files[0];if(!file)return;await stop();staticFrame=true;roi=null;autoROI=null;try{const image=await createImageBitmap(file);work.width=image.width;work.height=image.height;workCtx.drawImage(image,0,0);image.close();preview();$('clearROI').disabled=false;$('status').textContent='截图识别测试 · 不提交签到';await analyze(false);}catch(e){$('status').textContent='无法读取图片：'+e.message;}event.target.value='';};
function point(e){const rect=canvas.getBoundingClientRect();return {x:Math.min(1,Math.max(0,(e.clientX-rect.left)/rect.width)),y:Math.min(1,Math.max(0,(e.clientY-rect.top)/rect.height))};}
canvas.onpointerdown=e=>{if(!work.width)return;drag=point(e);canvas.setPointerCapture(e.pointerId);};canvas.onpointermove=e=>{if(!drag)return;const p=point(e);roi={x:Math.min(drag.x,p.x),y:Math.min(drag.y,p.y),w:Math.abs(drag.x-p.x),h:Math.abs(drag.y-p.y)};preview();};canvas.onpointerup=()=>{drag=null;if(roi&&(roi.w<.01||roi.h<.01))roi=null;preview();if(staticFrame)analyze(false);};
$('clearROI').onclick=()=>{roi=null;autoROI=null;preview();if(staticFrame)analyze(false);};
$('loginCheck').onclick=()=>checkLogin();$('loginOpen').onclick=()=>send('openSchoolLogin').catch(e=>{$('loginStatus').textContent=e.message;});
async function checkLogin(){try{const r=await send('sessionCheck');$('loginStatus').textContent=r.ready?'已检测到学校凭据（是否有效以接口为准）':'尚无学校签到凭据；建议先打开学校页完成登录';}catch(e){$('loginStatus').textContent='检查失败：'+e.message;}}
(async()=>{try{tabId=(await chrome.tabs.getCurrent()).id;const data=await send('state');$('autoSign').checked=data.settings.autoSign;await checkLogin();await refreshCaptions();await ScanEngine.ready();$('status').textContent='ZBar 引擎就绪，请选择课堂画面或导入截图检查';$('start').disabled=false;$('file').disabled=false;diagnostics(['本地 ZBar WASM 引擎已加载','使用系统共享选择器获取真实画面，不依赖活动标签页截图权限。']);}catch(e){$('status').textContent='初始化失败：'+e.message;}})();
