(()=>{
  let busy=false,timer,last='',sent=0;
  async function scan(){if(busy)return;busy=true;try{
    const status=await chrome.runtime.sendMessage({type:'tableStatus'});if(!status?.enabled)return;
    const record=Core.table(document),login=window===window.top&&(/jaccount|\/login/i.test(location.href)||Boolean(document.querySelector('input[type=password]')));
    const tableFound=[...document.querySelectorAll('table')].some(table=>{let labels=[...table.querySelectorAll('thead th,thead td')];if(!labels.length)labels=[...(table.querySelector('tr')?.children||[])];return labels.some(cell=>/签到号|签到编号/.test(String(cell.textContent||'')));});
    const signature=JSON.stringify({record,login,tableFound});if(signature===last&&Date.now()-sent<20000)return;
    const result=await chrome.runtime.sendMessage({type:'tableReport',record,login,tableFound,top:window===window.top});
    if(result?.ok){last=signature;sent=Date.now();}
  }catch{}finally{busy=false;}}
  new MutationObserver(()=>{if(timer)return;timer=setTimeout(()=>{timer=null;scan();},800);}).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  setInterval(scan,15000);scan();
  chrome.runtime.onMessage.addListener((m,sender,reply)=>{if(m.type==='inspectTable'){scan();reply({ok:true});}});
})();
