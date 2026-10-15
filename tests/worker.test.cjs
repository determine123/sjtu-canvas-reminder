const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');
const event=()=>({addListener(){}});
function worker({configured=true}={}){
 const data={local:{autoSignConfigured221:configured,settings:{sound:false,autoSign:false},courses:[],lessons:[]},session:{}};const notices=[],alarms=new Map();let captures=0;
 const area=key=>({async get(keys){if(typeof keys==='string')return {[keys]:data[key][keys]};if(Array.isArray(keys))return Object.fromEntries(keys.map(k=>[k,data[key][k]]));return {...keys,...data[key]};},async set(v){Object.assign(data[key],v)},async remove(keys){for(const k of [keys].flat())delete data[key][k];}});
 const chrome={runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:event(),onInstalled:event(),onStartup:event()},storage:{local:area('local'),session:area('session')},action:{async setBadgeText(){},async setBadgeBackgroundColor(){}},offscreen:{async hasDocument(){return false}},alarms:{async getAll(){return [...alarms.entries()].map(([name,o])=>({name,...o}))},async clear(n){alarms.delete(n)},async create(n,o){alarms.set(n,o)},onAlarm:event()},notifications:{async create(id,o){notices.push({id,...o})},async clear(){},onButtonClicked:event(),onClicked:event(),onClosed:event()},tabs:{onRemoved:event(),async get(id){return {id,active:true,windowId:1}},async query(){return [{id:7}]},async captureVisibleTab(){captures++;return 'image'},async sendMessage(){},async reload(){},async create(){}},windows:{async get(){return {focused:true}}}};
 const ctx=vm.createContext({chrome,URL,Date,console,AbortController,TextEncoder,crypto:require('node:crypto').webcrypto,Promise});ctx.importScripts=(...names)=>names.forEach(n=>vm.runInContext(fs.readFileSync(path.join(__dirname,'..',n),'utf8'),ctx));ctx.importScripts('background.js');return {ctx,data,chrome,notices,alarms,captures:()=>captures};
}
const url='https://mlearning.sjtu.edu.cn/lms/mobile2/forscan/?courseCode=c&rollCallToken=t&signHistoryId=h';
test('QR refresh updates session target, never persistent storage, and alerts only once',async()=>{
 const w=worker();await vm.runInContext('queue',w.ctx);w.data.session['qrEnabled:7']=true;const sender={tab:{id:7},frameId:0};
 await w.ctx.foundQR({url},sender);assert.equal(w.notices.length,1);await w.ctx.foundQR({url:url.replace('Token=t','Token=new')},sender);assert.equal(w.notices.length,1);assert.ok(w.data.session['qr:7'].url.includes('Token=new'));assert.equal(JSON.stringify(w.data.local).includes('rollCallToken'),false);
 delete w.data.session['qrEnabled:7'];await assert.rejects(w.ctx.foundQR({url},sender));
});
test('captures are gated, pause outside foreground, and drop results after tab switches',async()=>{
 const w=worker();await vm.runInContext('queue',w.ctx);assert.equal((await w.ctx.capture({tab:{id:7},frameId:0})).ok,false);assert.equal(w.captures(),0);
 w.data.session['qrEnabled:7']=true;w.chrome.windows.get=async()=>({focused:false});assert.equal((await w.ctx.capture({tab:{id:7},frameId:0})).paused,true);assert.equal(w.captures(),0);
 w.chrome.windows.get=async()=>({focused:true});w.chrome.tabs.query=async()=>[{id:8}];assert.equal((await w.ctx.capture({tab:{id:7},frameId:0})).image,undefined);
});
test('background trusts status text, not a forged active flag',async()=>{
 const w=worker();await vm.runInContext('queue',w.ctx);const c={id:'course',url:'https://oc.sjtu.edu.cn/courses/123/external_tools/6650',name:'数学'};w.data.local.courses=[c];w.data.local.settings.coursesEnabled=true;const sender={tab:{id:7,url:c.url}};
 await w.ctx.tableReport({record:{num:'1',created:'',status:'已签到',active:true}},sender);assert.equal(w.notices.length,0);
 await w.ctx.tableReport({record:{num:'2',created:'',status:'未知',active:true}},sender);assert.equal(w.notices.length,0);
 await w.ctx.tableReport({record:{num:'2',created:'',status:'未签到'}},sender);assert.equal(w.notices.length,1);
 await w.ctx.tableReport({record:{num:'2',created:'',status:'未签到'}},sender);assert.equal(w.notices.length,1);
});
test('saved switches rebuild alarms on worker restore and disabling removes them',async()=>{
 const w=worker();await vm.runInContext('queue',w.ctx);w.data.local.settings={coursesEnabled:true,lessonsEnabled:true,interval:60,sound:false};w.data.local.lessons=[{id:'1',name:'课',days:[1,2,3,4,5,6,7],time:'23:59',from:'2026-01-01',to:'2027-12-31',weeks:'all'}];await w.ctx.plan();assert.ok(w.alarms.has('poll'));assert.ok(w.alarms.has('plan'));assert.ok(w.alarms.has('lesson:1'));
 w.data.local.settings.coursesEnabled=false;w.data.local.settings.lessonsEnabled=false;await w.ctx.plan();assert.equal(w.alarms.size,0);
});


test('automatic signing is opt-in and durably deduplicates the same attendance',async()=>{
 const w=worker();await vm.runInContext('queue',w.ctx);w.data.session['qrEnabled:7']=true;const sender={tab:{id:7},frameId:0};let calls=0;
 w.ctx.AutoSign.submit=async()=>{calls++;return {status:'success',message:'服务端确认',attempted:true};};
 await w.ctx.foundQR({url},sender);assert.equal(calls,0);
 w.data.local.settings.autoSign=true;
 await w.ctx.foundQR({url},sender);assert.equal(calls,1);assert.equal(w.data.session['signResult:7'].status,'success');
 await w.ctx.foundQR({url:url.replace('Token=t','Token=new')},sender);assert.equal(calls,1);
 assert.equal(JSON.stringify(w.data.local).includes('rollCallToken'),false);
 // Worker restart: the persistent ledger still prevents another submit.
 const w2=worker();await vm.runInContext('queue',w2.ctx);w2.data.local.settings.autoSign=true;w2.data.local.autoSignLedger=w.data.local.autoSignLedger;w2.data.session['qrEnabled:7']=true;
 w2.ctx.AutoSign.submit=async()=>{calls++;return {status:'success'};};await w2.ctx.foundQR({url},sender);assert.equal(calls,1);
});
test('interrupted or uncertain submissions never automatically replay; login failures require explicit retry',async()=>{
 const w=worker();await vm.runInContext('queue',w.ctx);w.data.local.settings.autoSign=true;w.data.session['qrEnabled:7']=true;const target=w.ctx.Core.qr(url);const key=await w.ctx.AutoSign.digest(target.key);let calls=0;
 w.ctx.AutoSign.submit=async()=>{calls++;return {status:'success',message:'确认',attempted:true};};
 w.data.local.autoSignLedger={[key]:{status:'submitting',time:Date.now(),attempted:true}};
 assert.equal((await w.ctx.attemptAutoSign(target,7)).status,'unknown');assert.equal(calls,0);await assert.rejects(w.ctx.attemptAutoSign(target,7,true));
 w.data.local.autoSignLedger={[key]:{status:'needs-login',time:Date.now(),attempted:false}};
 assert.equal((await w.ctx.attemptAutoSign(target,7)).status,'needs-login');assert.equal(calls,0);
 await w.ctx.attemptAutoSign(target,7,true);assert.equal(calls,1);
});


test('screen monitor is bound to its own extension tab and cleans up when stopped',async()=>{
 const w=worker();await vm.runInContext('queue',w.ctx);
 w.chrome.tabs.get=async id=>({id,url:'https://evil.example'});
 await assert.rejects(w.ctx.dispatch({type:'monitorStart',tabId:7},{}));assert.equal(w.data.session['qrEnabled:7'],undefined);
 w.chrome.tabs.get=async id=>({id,url:'chrome-extension://test/monitor.html'});
 await w.ctx.dispatch({type:'monitorStart',tabId:7},{});assert.equal(w.data.session['qrEnabled:7'],true);
 await w.ctx.dispatch({type:'monitorFound',tabId:7,url},{});assert.equal(w.notices.length,1);
 await w.ctx.dispatch({type:'monitorStop',tabId:7},{});assert.equal(w.data.session['qrEnabled:7'],undefined);assert.equal(Object.keys(w.data.session.pending).length,0);
});

test('requested update enables auto-sign once and preserves later manual disabling',async()=>{
 const w=worker({configured:false});await vm.runInContext('queue',w.ctx);
 assert.equal(w.data.local.settings.autoSign,true);assert.equal(w.data.local.autoSignConfigured221,true);
 w.data.local.settings.autoSign=false;await w.ctx.configureAutomaticSigning();assert.equal(w.data.local.settings.autoSign,false);
});


test('a voice or caption instruction only alerts and never invokes signing without a QR',async()=>{
 const w=worker();await vm.runInContext('queue',w.ctx);w.chrome.tabs.get=async id=>({id,url:'chrome-extension://test/monitor.html'});w.data.session['qrEnabled:7']=true;
 w.ctx.AutoSign.submit=async()=>{throw Error('must not sign from a phrase');};
 const r=await w.ctx.dispatch({type:'attendanceHint',tabId:7,source:'voice',text:'现在大家扫码签到'},{});
 assert.equal(r.triggered,true);assert.equal(w.notices.length,1);assert.equal(w.data.local.autoSignLedger,undefined);assert.equal(w.data.session['qr:7'],undefined);
 assert.equal(JSON.stringify(w.data.local).includes('现在大家扫码签到'),false);
 const again=await w.ctx.dispatch({type:'attendanceHint',tabId:7,source:'captions',text:'现在大家扫码签到'},{});assert.equal(again.triggered,false);
});
test('caption binding accepts only school tabs and only delivers matched text to bound monitors',async()=>{
 const w=worker();await vm.runInContext('queue',w.ctx);w.chrome.tabs.get=async id=>({id,url:id===7?'chrome-extension://test/monitor.html':'https://v.sjtu.edu.cn/player'});w.chrome.scripting={async executeScript(){}};
 await w.ctx.bindCaptions(7,9);assert.equal(w.data.session.captionBindings[9][0],7);
 const delivered=[];w.chrome.runtime.sendMessage=async m=>{delivered.push(m);return {ok:true};};
 await w.ctx.deliverCaption({text:'普通课程讲解',observed:true},{tab:{id:9}});assert.equal(delivered[0].text,'');
 await w.ctx.deliverCaption({text:'现在开始签到',observed:true},{tab:{id:9}});assert.equal(delivered[1].to,7);assert.equal(delivered[1].text,'现在开始签到');
 await w.ctx.deliverCaption({text:'现在开始签到',observed:true},{tab:{id:10}});assert.equal(delivered.length,2);
 await w.ctx.unbindCaptions(7);assert.equal(w.data.session.captionBindings[9],undefined);
});
