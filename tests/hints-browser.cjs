const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SJTU_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'sjtu-hints-test-'));
 const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.SJTU_EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`],viewport:{width:1450,height:1100}});
 try{
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),id=new URL(worker.url()).host;
 await worker.evaluate(async()=>{await queue;await chrome.storage.local.set({settings:{autoSign:true,sound:false}});globalThis.testNotices=[];chrome.notifications.create=async(id,n)=>{testNotices.push(n);return id;};globalThis.testSubmits=0;AutoSign.submit=async()=>{testSubmits++;return {status:'success',message:'服务端确认签到成功（模拟）',attempted:true};};});
 await context.route('https://v.sjtu.edu.cn/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><title>课堂字幕测试</title><div class="vjs-text-track-display"><div class="vjs-text-track-cue">讲解课程内容</div></div>'}));
 const source=await context.newPage();await source.goto('https://v.sjtu.edu.cn/caption-test');
 const sourceId=await worker.evaluate(async()=> (await chrome.tabs.query({url:'https://v.sjtu.edu.cn/*'}))[0].id);
 const monitor=await context.newPage(),errors=[];monitor.on('pageerror',e=>errors.push(e.message));
 await monitor.addInitScript(()=>{
   class FakeSpeech{constructor(){window.testRecognition=this;this.processLocally=true;}start(track){window.testAudioKind=track?.kind;this.onstart?.();}abort(){window.testSpeechAborted=true;}}
   Object.defineProperty(window,'SpeechRecognition',{value:FakeSpeech,configurable:true});
 });
 await monitor.goto(`chrome-extension://${id}/monitor.html`);await monitor.waitForFunction(()=>!document.getElementById('start').disabled);
 await monitor.evaluate(()=>{
   const c=document.createElement('canvas');c.width=960;c.height=540;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,960,540);window.testCanvas=c;
   const audio=new AudioContext();window.testAudioContext=audio;const sink=audio.createMediaStreamDestination();
   navigator.mediaDevices.getDisplayMedia=async options=>{window.testRequestedAudio=options.audio;const stream=c.captureStream(5);for(const t of sink.stream.getAudioTracks())stream.addTrack(t);setInterval(()=>{ctx.drawImage(c,0,0);},100);return stream;};
 });
 await monitor.locator('#voiceHints').check();await monitor.locator('#start').click();await monitor.waitForFunction(()=>window.testAudioKind==='audio');assert.equal(await monitor.evaluate(()=>testRequestedAudio),true);
 await monitor.locator('#captionRefresh').click();await monitor.locator('#captionSource').selectOption(String(sourceId));await monitor.locator('#captionBind').click();
 await source.evaluate(()=>document.querySelector('.vjs-text-track-cue').textContent='今天不需要签到');await new Promise(r=>setTimeout(r,500));assert.equal(await worker.evaluate(()=>testSubmits),0);
 await source.evaluate(()=>document.querySelector('.vjs-text-track-cue').textContent='现在请大家扫码签到');
 await monitor.waitForFunction(()=>document.getElementById('hintStatus').textContent.includes('检测到字幕提示'));
 assert.equal(await monitor.evaluate(()=>boostUntil>Date.now()),true);assert.equal(await worker.evaluate(()=>testSubmits),0,'words alone must never submit');
 assert.equal(await worker.evaluate(async()=>JSON.stringify(await chrome.storage.local.get(null)).includes('现在请大家扫码签到')),false);
 await monitor.evaluate(()=>testRecognition.onresult({resultIndex:0,results:[[{transcript:'现在开始签到'}]]}));
 assert.equal(await worker.evaluate(()=>testSubmits),0,'transcript alone must never submit');
 const fixture='data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'qr-fixture.png')).toString('base64');
 await monitor.evaluate(async data=>{const img=new Image();img.src=data;await img.decode();const c=testCanvas,ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(img,0,0);},fixture);
 await monitor.waitForFunction(()=>document.getElementById('result').textContent.includes('服务端确认签到成功'),null,{timeout:20000});assert.equal(await worker.evaluate(()=>testSubmits),1);
 await monitor.screenshot({path:path.join(__dirname,'hints-preview.png'),fullPage:true});
 await monitor.locator('#stop').click();await monitor.waitForFunction(()=>document.getElementById('status').textContent==='扫描已停止');
 await monitor.waitForFunction(async sourceId=>!(await chrome.storage.session.get('captionBindings')).captionBindings?.[sourceId],sourceId);
 assert.equal(await worker.evaluate(async id=>(await chrome.storage.session.get('captionBindings')).captionBindings[id],sourceId),undefined);
 assert.equal(await monitor.evaluate(()=>testSpeechAborted),true);assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: real DOM captions and shared audio track routing, negative phrase ignored, hint accelerates without signing, later QR permits one simulated submit, stop removes bindings and recognizer. ASR service and school interface mocked.');
 }finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
