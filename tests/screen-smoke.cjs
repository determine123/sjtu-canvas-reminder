const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SJTU_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'sjtu-screen-test-'));
 const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.SJTU_EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`],viewport:{width:1400,height:1000}});
 try{
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
  await worker.evaluate(async()=>{await queue;chrome.notifications.create=async id=>id;await chrome.storage.local.set({settings:{sound:false,autoSign:false}});});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`chrome-extension://${id}/monitor.html`);
  await page.waitForFunction(()=>!document.getElementById('start').disabled,{timeout:20000});
  await page.locator('#file').setInputFiles(path.join(__dirname,'qr-fixture.png'));
  await page.waitForFunction(()=>document.getElementById('result').textContent.includes('有效签到二维码'),{timeout:20000});
  assert.equal(await page.locator('#codes').textContent(),'2');
  assert.ok((await page.locator('#diagnostics').textContent()).includes('ZBar'));
  assert.equal(await worker.evaluate(async()=>Object.keys((await chrome.storage.local.get('autoSignLedger')).autoSignLedger||{}).length),0,'file diagnostics must never submit');
  await page.screenshot({path:path.join(__dirname,'screen-diagnostics-preview.png'),fullPage:true});
  // Full-HD scene with small QR codes occupying a corner, not an isolated large QR.
  await page.locator('#file').setInputFiles(path.join(__dirname,'lecture-fixture.png'));
  await page.waitForFunction(()=>document.getElementById('dimensions').textContent==='1920 × 1080');
  await page.waitForFunction(()=>document.getElementById('result').textContent.includes('有效签到二维码'));
  assert.equal(await page.locator('#codes').textContent(),'2');
  const timings=await page.evaluate(async()=>{
    const t=performance.now();const full=await ScanEngine.decode(work);const fullMs=performance.now()-t;
    const area=full.codes.find(c=>c.target).region;
    const t2=performance.now();const tracked=await ScanEngine.decode(work,area);const trackedMs=performance.now()-t2;
    const fallback=await ScanEngine.decode(work,{x:0,y:0,w:.1,h:.1});
    return {fullMs,trackedMs,fullPasses:full.passes,trackedPasses:tracked.passes,found:tracked.codes.some(c=>c.target),fallback:fallback.passes};
  });
  assert.equal(timings.found,true);assert.equal(timings.trackedPasses.includes('原始画面'),false);assert.ok(timings.fallback.includes('原始画面'));
  console.log('Measured decode (synthetic 1080p): full='+Math.round(timings.fullMs)+'ms, tracked='+Math.round(timings.trackedMs)+'ms; ROI misses fall back to full frame.');
  const region=await page.locator('#canvas').boundingBox();
  await page.mouse.move(region.x+region.width*.73,region.y+region.height*.6);await page.mouse.down();
  await page.mouse.move(region.x+region.width*.96,region.y+region.height*.87);await page.mouse.up();
  await page.waitForFunction(()=>document.getElementById('diagnostics').textContent.includes('框选'));
  await page.screenshot({path:path.join(__dirname,'lecture-diagnostics-preview.png'),fullPage:true});
  // Real browser MediaStream from a canvas with a QR test frame, simulating the shared source.
  const fixture='data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'qr-fixture.png')).toString('base64');
  await page.evaluate(async data=>{const img=new Image();img.src=data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);window.testSourceCanvas=c;navigator.mediaDevices.getDisplayMedia=async()=>{const stream=c.captureStream(2);setInterval(()=>c.getContext('2d').drawImage(img,0,0),200);return stream;};},fixture);
  await worker.evaluate(()=>{const original=foundQR;globalThis.testFoundCalls=0;foundQR=async(...args)=>{globalThis.testFoundCalls++;await new Promise(resolve=>setTimeout(resolve,2500));return original(...args);};});
  const initialFrames=Number(await page.locator('#frames').textContent());
  await page.locator('#start').click();
  await page.waitForFunction(initial=>Number(document.getElementById('frames').textContent)>=initial+2,initialFrames,{timeout:2000});
  assert.equal(await page.locator('#result').textContent(),'测试截图中识别到有效签到二维码（仅测试，未提交）','decoder must continue while the worker reply is pending');
  try{await page.waitForFunction(()=>document.getElementById('result').textContent.includes('已识别签到码并发出提醒'),null,{timeout:15000});}catch(e){console.log('DEBUG',await page.locator('body').innerText(),await worker.evaluate(async()=>({session:await chrome.storage.session.get(null),logs:await chrome.storage.local.get('logs')})));throw e;}
  assert.equal(await page.locator('#open').isDisabled(),false);assert.equal(await worker.evaluate(()=>testFoundCalls),1,'in-flight reports must deduplicate');
  const tabId=await page.evaluate(async()=>(await chrome.tabs.getCurrent()).id);
  assert.ok(await worker.evaluate(async id=>(await chrome.storage.session.get('pending')).pending['qr:'+id],tabId));
  await page.locator('#stop').click();await page.waitForFunction(()=>document.getElementById('status').textContent==='扫描已停止');
  assert.equal(await worker.evaluate(async id=>(await chrome.storage.session.get('qrEnabled:'+id))['qrEnabled:'+id],tabId),undefined);
  assert.equal(errors.length,0,errors.join('\n'));console.log('PASS: actual ZBar WASM in Edge, multi-QR file diagnostics without submission, browser MediaStream capture-to-decode-to-notification, stop cleanup. System picker/source and desktop notification mocked.');
 }finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
