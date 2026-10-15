const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {chromium}=require(process.env.SJTU_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=process.env.SJTU_EXTENSION_DIR||path.resolve(__dirname,'..'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'sjtu-v2-test-'));
 const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.SJTU_EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`],viewport:{width:1100,height:800}});
 try{
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=new URL(worker.url()).host;
 await worker.evaluate(async()=>{await queue;if(!(await config()).settings.autoSign)throw Error('Default auto-sign migration failed');chrome.notifications.create=async id=>id;await chrome.storage.local.set({settings:{autoSign:false,sound:false}});});
 await context.route('https://oc.sjtu.edu.cn/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><title>课堂直播 · 本地测试</title><style>body{font:18px system-ui;background:#edf3ed;color:#254633;padding:50px}</style><h1>课堂直播 · 本地测试</h1><p>使用合成二维码测试，不连接学校签到接口。</p><table><thead><tr><th>签到号</th><th>状态</th><th>创建时间</th></tr></thead><tbody><tr><td>123</td><td>已签到</td><td>2026-10-15 08:00</td></tr><tr><td>456</td><td>未签到</td><td>2026-10-15 09:00</td></tr></tbody></table>'}));
 const lesson=await context.newPage();await lesson.goto('https://oc.sjtu.edu.cn/courses/123/external_tools/6650');
 const tabId=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({url:'https://oc.sjtu.edu.cn/*'});return tabs[0].id;});
 const image='data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'qr-fixture.png')).toString('base64');await worker.evaluate(image=>{chrome.tabs.captureVisibleTab=async()=>image;},image);
 const popup=await context.newPage();const errors=[];popup.on('pageerror',e=>errors.push(e.message));
 await popup.goto(`chrome-extension://${id}/popup.html`);await popup.setViewportSize({width:420,height:650});
 await popup.waitForFunction(()=>document.getElementById('qrStatus').textContent==='尚未开启');
 assert.equal(await worker.evaluate(async()=>(await config()).settings.coursesEnabled),false,'opening popup must not enable monitoring');
 await popup.screenshot({path:path.join(__dirname,'monitor-preview.png'),fullPage:true});
 await popup.getByRole('button',{name:'设置',exact:true}).click();await popup.locator('#sound').uncheck();
 await popup.getByRole('button',{name:'课程',exact:true}).click();await popup.locator('#addCourseDetails summary').click();await popup.locator('#courseForm input[name=name]').fill('高等数学');await popup.locator('#courseForm input[name=url]').fill('123');await popup.locator('#courseForm button').click();await popup.locator('#courseList').getByText('高等数学').waitFor();
 await popup.locator('#addLessonDetails summary').click();await popup.locator('#lessonForm input[name=name]').fill('计算机系统');await popup.locator('#lessonForm input[name=day][value="5"]').check();await popup.locator('#lessonForm input[name=time]').fill('10:00');await popup.locator('#lessonForm input[name=from]').fill('2026-10-01');await popup.locator('#lessonForm input[name=to]').fill('2027-01-31');await popup.locator('#lessonForm button').click();await popup.locator('#lessonList').getByText('计算机系统').waitFor();
 await popup.locator('#lessonsEnabled').check();await popup.waitForFunction(()=>document.querySelector('#lessonList').textContent.includes('下次提醒'));
 await popup.screenshot({path:path.join(__dirname,'courses-preview.png'),fullPage:true});
 const parse=await worker.evaluate(async tabId=>{const result=await chrome.scripting.executeScript({target:{tabId},func:()=>Core.table(document)});return result[0].result;},tabId);assert.equal(parse.num,'456');assert.equal(parse.active,true);
 await popup.getByRole('button',{name:'监控',exact:true}).click();await popup.evaluate(tabId=>{window.testTab=tabId;},tabId);
 // Test popup against the classroom tab. Production gets this ID from the actual action popup.
 await popup.evaluate(tabId=>{chrome.tabs.query=async()=>[{id:tabId}];},tabId);
 // tabId is lexical in popup.js; use isolated evaluation without changing application code.
 await popup.evaluate(tab=>{tabId=tab;},tabId);await popup.locator('#qrStart').click();await lesson.bringToFront();
 await lesson.locator('[data-sjtu-reminder]').waitFor({timeout:20000});await lesson.screenshot({path:path.join(__dirname,'reminder-preview.png')});
 const status=await worker.evaluate(async tab=>await getState(tab),tabId);assert.equal(status.qr.canOpen,true);assert.ok(status.pending['qr:'+tabId]);
 await popup.bringToFront();await popup.waitForFunction(()=>!document.getElementById('qrOpen').disabled);await popup.screenshot({path:path.join(__dirname,'active-preview.png'),fullPage:true});
 await popup.locator('#qrStop').click();await popup.waitForFunction(()=>document.getElementById('qrPill').textContent==='未开启');assert.equal(await lesson.locator('[data-sjtu-reminder]').count(),0);
 // Exercise the entire optional auto-sign pipeline against a simulated school API.
 await worker.evaluate(()=>{
   globalThis.testSignCalls=0;chrome.cookies.get=async()=>({value:'%22fixture-token%22'});
   globalThis.fetch=async(url,options)=>{
     if(!String(url).startsWith('https://mlearning.sjtu.edu.cn/lms-lti-rollcall-sjtu/sign/scan/'))throw Error('Unexpected network target');
     if(options.headers.Authorization!=='fixture-token'||options.redirect!=='manual')throw Error('Bad authentication handling');
     globalThis.testSignCalls++;return new Response(JSON.stringify({resultCode:'200',body:{status:'NORMAL'}}),{status:200,headers:{'Content-Type':'application/json'}});
   };
 });
 await popup.getByRole('button',{name:'设置',exact:true}).click();await popup.locator('#autoSign').check();
 await popup.getByRole('button',{name:'监控',exact:true}).click();await popup.locator('#qrStart').click();await lesson.bringToFront();
 await lesson.locator('[data-sjtu-reminder]').waitFor({timeout:20000});await popup.bringToFront();
 await popup.waitForFunction(()=>document.getElementById('autoSignResult').textContent.includes('服务端确认签到成功'));
 assert.equal(await worker.evaluate(()=>testSignCalls),1);
 assert.equal(await worker.evaluate(async()=>JSON.stringify(await chrome.storage.local.get(null)).includes('fixture-token')),false);
 await popup.screenshot({path:path.join(__dirname,'auto-sign-preview.png'),fullPage:true});
 await popup.locator('#qrStop').click();
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: Edge MV3 load, passive popup, tabs, add course, add/enable lesson, DOM parser, synthetic multi-QR decode, reminder card, stop. Optional auto-sign succeeds through mocked school API. Native capture, session cookie and system notifications mocked.');
 }finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
