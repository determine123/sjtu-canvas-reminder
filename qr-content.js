(()=>{
  if(globalThis.__sjtuQR)return;
  const state={running:false,status:'尚未开启',lastScan:0,width:0,height:0,decoded:0};globalThis.__sjtuQR=state;
  let timer,busy=false,card,lastKey='';
  async function send(type,data={}){const r=await chrome.runtime.sendMessage({type,...data});if(!r?.ok)throw Error(r?.error||'插件没有响应');return r;}
  function show(target,result){
    card?.remove();card=document.createElement('div');card.dataset.sjtuReminder='';card.style.cssText='position:fixed;right:24px;top:24px;z-index:2147483647;width:328px;';
    const shadow=card.attachShadow({mode:'closed'}),css=document.createElement('style');css.textContent='*{box-sizing:border-box}.box{background:#fff;color:#18352e;font:14px/1.6 system-ui,sans-serif;padding:20px;border-radius:16px;border:2px solid #148173;box-shadow:0 12px 50px #0004}strong{font-size:18px}p{color:#5c716b;margin:8px 0 14px}button,a{border:0;padding:9px 13px;border-radius:8px;font:inherit;cursor:pointer;text-decoration:none;display:inline-block}a{background:#147e70;color:white}button{background:#edf3f0;color:#294c43;margin-left:8px}';
    const box=document.createElement('div');box.className='box';box.setAttribute('role','alert');
    const title=document.createElement('strong');title.textContent=result?.status==='success'?'自动签到已获服务端确认':result?'自动签到需要处理':'课堂签到开始了';const text=document.createElement('p');text.textContent=result?.message||'发现上交签到二维码，请打开学校页面完成签到并核对结果。';
    const open=document.createElement('a');open.href=target.url;open.target='_blank';open.rel='noopener noreferrer';open.textContent='打开签到页';const created=Date.now();
    open.onclick=e=>{if(!Core.fresh({url:target.url,time:created})){e.preventDefault();text.textContent='这条入口已超过 5 分钟，请扫描新的二维码。';}else send('qrAck').catch(()=>{});};
    const dismiss=document.createElement('button');dismiss.textContent='已收到';dismiss.onclick=()=>{card.remove();send('qrAck').catch(()=>{});};
    box.append(title,text,open,dismiss);shadow.append(css,box);(document.fullscreenElement||document.documentElement).append(card);
  }
  async function scan(){
    if(!state.running||busy)return;if(document.visibilityState!=='visible'){state.status='已暂停 · 请回到课堂标签页';return;}busy=true;
    try{const result=await send('qrCapture');if(!state.running)return;if(!result.image){state.status='已暂停 · 请将课堂窗口置于前台';return;}
      const bytes=Uint8Array.from(atob(result.image.split(',')[1]),x=>x.charCodeAt(0));const image=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
      state.width=image.width;state.height=image.height;state.decoded=0;
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);image.close();
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);canvas.width=canvas.height=0;let target=null;
      for(let n=0;n<4;n++){const code=jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'});if(!code)break;state.decoded++;target=Core.qr(code.data);if(target)break;
        const points=Object.values(code.location).filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y));const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
        const left=Math.max(0,Math.floor(Math.min(...xs))-8),right=Math.min(pixels.width,Math.ceil(Math.max(...xs))+8),top=Math.max(0,Math.floor(Math.min(...ys))-8),bottom=Math.min(pixels.height,Math.ceil(Math.max(...ys))+8);
        for(let y=top;y<bottom;y++)pixels.data.fill(255,(y*pixels.width+left)*4,(y*pixels.width+right)*4);
      }
      state.lastScan=Date.now();state.status=state.decoded?'已解出二维码，但缺少有效上交签到参数':'已捕获画面，尚未解出二维码；请使用屏幕扫描器预览或框选';if(!state.running)return;
      if(target){const reply=await send('qrFound',{url:target.url});if(!state.running)return;const result=reply.signResult;state.status=result?(result.status==='success'?'自动签到成功 · 请核对记录':result.message):'发现签到码 · 请及时处理';const signature=target.key+'|'+(result?.status||'manual');if(lastKey!==signature){show(target,result);lastKey=signature;}}
    }catch(e){state.status='需要检查 · '+e.message;}finally{busy=false;}
  }
  chrome.runtime.onMessage.addListener((m,sender,reply)=>{
    if(m.type==='qrState'){reply({...state});}
    if(m.type==='qrStart'){state.running=true;state.status='准备扫描';clearInterval(timer);timer=setInterval(scan,2500);scan();reply({...state});}
    if(m.type==='qrStop'){state.running=false;clearInterval(timer);card?.remove();state.status='扫描已停止';reply({...state});}
  });
})();
