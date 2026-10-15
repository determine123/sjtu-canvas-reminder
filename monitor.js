const $=id=>document.getElementById(id);let tabId,stream,timer,roi,autoROI,drag,running=false,busy=false,frames=0,epoch=0,staticFrame=false;
const reports=new Map();
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
  const began=performance.now();if(!running)return;
  try{if(video.readyState<2||!video.videoWidth){$('status').textContent='正在等待共享画面，请检查共享来源是否仍在播放';return;}
    if(!busy){if(work.width!==video.videoWidth||work.height!==video.videoHeight){work.width=video.videoWidth;work.height=video.videoHeight;autoROI=null;}workCtx.drawImage(video,0,0);preview();await analyze(true);}
  }finally{if(running)timer=setTimeout(tick,Math.max(40,250-(performance.now()-began)));}
}
async function stop(){epoch++;running=false;clearTimeout(timer);for(const track of stream?.getTracks()||[])track.stop();stream=null;video.srcObject=null;$('start').disabled=false;$('stop').disabled=true;$('status').textContent='扫描已停止';try{await send('monitorStop');}catch(e){$('result').textContent=e.message;}}
$('start').onclick=async()=>{
  try{
    $('status').textContent='请选择课堂标签页、窗口或屏幕进行共享';
    const selected=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:10,max:15}},audio:false});
    stream=selected;$('status').textContent='已选择共享来源，等待首帧画面';video.srcObject=stream;let playbackTimer;try{await Promise.race([video.play(),new Promise((_,reject)=>{playbackTimer=setTimeout(()=>reject(Error('共享来源未产生视频帧，请重新选择课堂画面')),8000);})]);}finally{clearTimeout(playbackTimer);}await send('monitorStart');epoch++;running=true;staticFrame=false;roi=null;autoROI=null;reports.clear();$('captureRate').textContent=(stream.getVideoTracks()[0].getSettings().frameRate||'未知')+' fps';$('clearROI').disabled=false;$('start').disabled=true;$('stop').disabled=false;
    stream.getVideoTracks()[0].addEventListener('ended',()=>{if(running)stop();});await tick();
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
(async()=>{try{tabId=(await chrome.tabs.getCurrent()).id;const data=await send('state');$('autoSign').checked=data.settings.autoSign;await checkLogin();await ScanEngine.ready();$('status').textContent='ZBar 引擎就绪，请选择课堂画面或导入截图检查';$('start').disabled=false;$('file').disabled=false;diagnostics(['本地 ZBar WASM 引擎已加载','使用系统共享选择器获取真实画面，不依赖活动标签页截图权限。']);}catch(e){$('status').textContent='初始化失败：'+e.message;}})();
