let timer;
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
  if(m.type!=='audio'||sender.id!==chrome.runtime.id)return;
  const a=document.getElementById('audio');clearTimeout(timer);
  if(!m.play){a.pause();a.currentTime=0;reply({ok:true});return;}
  a.play().then(()=>{timer=setTimeout(()=>{a.pause();a.currentTime=0;},30000);reply({ok:true});}).catch(()=>reply({ok:false}));return true;
});
