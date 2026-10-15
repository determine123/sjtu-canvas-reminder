/* Never call recognition.start() without a live shared audio track. */
(()=>{
  function create({onText,onStatus}){
    let recognizer,track,restartTimer,enabled=false,restarts=0;
    function stop(){enabled=false;clearTimeout(restartTimer);if(recognizer){recognizer.onend=null;try{recognizer.abort();}catch{}recognizer=null;}}
    function start(audioTrack){
      stop();
      const Recognition=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition;
      const version=Number(/(?:Edg|Chrome)\/(\d+)/.exec(navigator.userAgent)?.[1]||0);
      if(!Recognition||version<135){onStatus('当前浏览器不支持共享音轨语音识别，请使用字幕触发');return false;}
      if(!audioTrack||audioTrack.kind!=='audio'||audioTrack.readyState!=='live'){onStatus('没有共享音频：重新选择课堂标签页并勾选“共享标签页音频”');return false;}
      track=audioTrack;enabled=true;restarts=0;
      function launch(){
        if(!enabled||track.readyState!=='live')return;
        const r=new Recognition();recognizer=r;r.lang='zh-CN';r.continuous=true;r.interimResults=true;
        if('processLocally' in r)r.processLocally=false;
        r.onstart=()=>onStatus('正在识别共享课堂音频（浏览器语音服务）');
        r.onresult=event=>{if(!enabled)return;const text=Array.from(event.results).slice(-3).map(result=>result[0]?.transcript||'').join(' ').slice(-500);if(text.trim())onText(text);};
        r.onerror=event=>{if(!enabled)return;if(event.error==='no-speech'){onStatus('暂未听到语音，等待下一段');return;}enabled=false;clearTimeout(restartTimer);onStatus('语音服务不可用：'+event.error+'；字幕和二维码扫描仍可使用');};
        r.onend=()=>{if(!enabled)return;if(++restarts>5){enabled=false;onStatus('语音会话多次结束，请点击“启动语音”重新连接');return;}restartTimer=setTimeout(launch,700);};
        try{r.start(track);}catch{enabled=false;onStatus('无法从共享音轨启动语音服务；不会改用麦克风');}
      }
      track.addEventListener('ended',stop,{once:true});onStatus('正在连接浏览器语音服务…');launch();return enabled;
    }
    return {start,stop};
  }
  globalThis.VoiceHints={create};
})();
