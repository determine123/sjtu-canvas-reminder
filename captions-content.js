(()=>{
  if(globalThis.__sjtuCaptionReader)return;globalThis.__sjtuCaptionReader=true;
  let enabled=false,timer,observer,last='',sent=0;
  const selectors='.vjs-text-track-display .vjs-text-track-cue,.dplayer-subtitle,.xgplayer-text-track,.art-subtitle,.plyr__captions,[class*="subtitle"],.caption-text,[data-caption]';
  function texts(){
    const parts=[];
    for(const video of document.querySelectorAll('video'))for(const track of video.textTracks||[])for(const cue of track.activeCues||[])if(cue.text)parts.push(cue.text);
    for(const node of document.querySelectorAll(selectors)){
      const style=getComputedStyle(node);if(style.display==='none'||style.visibility==='hidden'||!node.getClientRects().length)continue;
      if(node.textContent?.trim())parts.push(node.textContent.trim());
      if(parts.length>=20)break;
    }
    return [...new Set(parts)].join(' ').slice(-1000);
  }
  async function scan(){if(!enabled)return;const text=texts(),now=Date.now();if(text===last&&now-sent<5000)return;last=text;sent=now;
    // Only attendance-related phrases leave this content script; no whole-page transcription.
    try{await chrome.runtime.sendMessage({type:'captionReport',text:HintPolicy.match(text)?text.slice(0,500):'',observed:Boolean(text)});}catch{}
  }
  function setEnabled(value){if(value===enabled)return;enabled=value;clearInterval(timer);observer?.disconnect();if(enabled){timer=setInterval(scan,300);let queued=false;observer=new MutationObserver(()=>{if(queued)return;queued=true;setTimeout(()=>{queued=false;scan();},120);});observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});scan();}}
  chrome.runtime.onMessage.addListener((m,sender,reply)=>{if(m.type==='captionControl'){setEnabled(Boolean(m.enabled));reply({ok:true});}});
  chrome.runtime.sendMessage({type:'captionIsEnabled'}).then(r=>setEnabled(Boolean(r?.enabled))).catch(()=>{});
})();
