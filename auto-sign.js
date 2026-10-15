/* Uses only this Edge profile's existing school session. No passwords or CAPTCHA handling. */
(function(root){
  const origin='https://mlearning.sjtu.edu.cn';
  function interpret(response,body){
    if(response.status===401||response.status===403||response.type==='opaqueredirect'||response.status>=300&&response.status<400)
      return {status:'needs-login',message:'登录状态失效或需要额外验证，请打开学校签到页处理'};
    if(response.ok&&body&&typeof body==='object'&&!Array.isArray(body)&&String(body.resultCode)==='200'&&body.body?.status==='NORMAL')
      return {status:'success',message:'服务端确认签到成功（NORMAL），请在 Canvas 中核对记录'};
    return {status:'unknown',message:'服务端未明确确认签到成功，请打开学校页面核对；不会自动重复提交'};
  }
  async function digest(key){
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
    return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  async function token(){
    const cookie=await chrome.cookies.get({url:origin+'/lms/mobile/',name:'token'});
    if(!cookie?.value)return null;
    let value;try{value=decodeURIComponent(cookie.value).replace(/^"|"$/g,'').trim();}catch{return null;}
    return value&&!/[\x00-\x20\x7f]/.test(value)&&value.length<16384?value:null;
  }
  async function submit(url,{signal,beforeSubmit=async()=>{}}={}){
    const target=Core.qr(url);if(!target)return {status:'invalid',message:'二维码不符合上交签到格式',attempted:false};
    let attempted=false;const started=Date.now();let authMs=0,requestMs=0,requestStarted=0;
    const finish=result=>({...result,timings:{authMs,requestMs,totalMs:Date.now()-started}});
    try{
      signal?.throwIfAborted();
      let credential=await token();
      if(!credential){
        // Initialize the mobile session via normal redirects. Never automate jAccount authentication.
        await fetch(target.url,{credentials:'include',redirect:'follow',cache:'no-store',signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(10000)])});
        credential=await token();
      }
      authMs=Date.now()-started;
      if(!credential)return finish({status:'needs-login',message:'未取得学校签到登录凭据，请先打开签到页完成登录，再点击重新尝试',attempted:false});
      await beforeSubmit();signal?.throwIfAborted();
      const params=new URL(target.url).searchParams;
      const api=origin+'/lms-lti-rollcall-sjtu/sign/scan/'+encodeURIComponent(params.get('rollCallToken'))+'/'+encodeURIComponent(params.get('signHistoryId'));
      attempted=true;requestStarted=Date.now();
      const response=await fetch(api,{method:'GET',credentials:'include',redirect:'manual',cache:'no-store',headers:{Authorization:credential,'X-Requested-With':'XMLHttpRequest',Accept:'application/json'},signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(12000)])});
      let body=null;try{body=await response.json();}catch{}
      requestMs=Date.now()-requestStarted;return finish({...interpret(response,body),attempted});
    }catch{
      if(attempted)requestMs=Date.now()-requestStarted;else authMs=Date.now()-started;
      if(signal?.aborted&&!attempted)return finish({status:'cancelled',message:'自动签到已取消，尚未提交',attempted:false});
      return finish({status:attempted?'unknown':'needs-login',message:attempted?'请求中断或超时，签到结果未知，请核对记录；不会自动重试':'无法准备登录状态，请检查网络和学校登录后重新尝试',attempted});
    }
  }
  root.AutoSign={submit,interpret,digest,sessionStatus:async()=>({ready:Boolean(await token())})};
  if(typeof module!=='undefined')module.exports=root.AutoSign;
})(globalThis);
