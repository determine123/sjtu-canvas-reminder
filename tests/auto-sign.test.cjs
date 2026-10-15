const {test}=require('node:test');const assert=require('node:assert/strict');
global.Core=require('../core.js');const A=require('../auto-sign.js');
const url='https://mlearning.sjtu.edu.cn/lms/mobile2/forscan/?courseCode=c&rollCallToken=t&signHistoryId=h';
test('only HTTP success with resultCode 200 and NORMAL confirms success',()=>{
 assert.equal(A.interpret({ok:true,status:200},{resultCode:'200',body:{status:'NORMAL'}}).status,'success');
 for(const body of [{resultCode:500,error:'200 操作成功'}, {resultCode:200,body:{status:'EXPIRED'}},null,{},[]])assert.equal(A.interpret({ok:true,status:200},body).status,'unknown');
 assert.equal(A.interpret({ok:false,status:500},{resultCode:200,body:{status:'NORMAL'}}).status,'unknown');
 assert.equal(A.interpret({ok:false,status:401},{}).status,'needs-login');
 assert.equal(A.interpret({ok:false,status:0,type:'opaqueredirect'},null).status,'needs-login');
});
test('credentials are sent only to the fixed school API, never forwarded via redirects',async t=>{
 const old=global.chrome;global.chrome={cookies:{async get(){return {value:'%22test-token%22'};}}};t.after(()=>{global.chrome=old;});let options,address,marked=false;
 t.mock.method(global,'fetch',async(u,o)=>{address=u;options=o;return {ok:true,status:200,async json(){return {resultCode:'200',body:{status:'NORMAL'}};}};});
 const r=await A.submit(url,{beforeSubmit:async()=>{marked=true;}});assert.equal(r.status,'success');assert.equal(marked,true);assert.equal(address,'https://mlearning.sjtu.edu.cn/lms-lti-rollcall-sjtu/sign/scan/t/h');assert.equal(options.headers.Authorization,'test-token');assert.equal(options.redirect,'manual');assert.equal(options.credentials,'include');
});
test('without school session it only initializes login and does not submit',async t=>{
 const old=global.chrome;global.chrome={cookies:{async get(){return null;}}};t.after(()=>{global.chrome=old;});let calls=0;
 t.mock.method(global,'fetch',async u=>{calls++;assert.equal(u,url);return {};});const r=await A.submit(url);assert.equal(r.status,'needs-login');assert.equal(r.attempted,false);assert.equal(calls,1);
});
test('timeout after submit is unknown and no retry occurs',async t=>{
 const old=global.chrome;global.chrome={cookies:{async get(){return {value:'test-token'};}}};t.after(()=>{global.chrome=old;});let calls=0;
 t.mock.method(global,'fetch',async()=>{calls++;throw new DOMException('timeout','TimeoutError');});const r=await A.submit(url);assert.equal(r.status,'unknown');assert.equal(r.attempted,true);assert.equal(calls,1);
});
test('cancel before submission sends no request and invalid QR never reads cookies',async t=>{
 const old=global.chrome;global.chrome={cookies:{async get(){throw Error('must not read');}}};t.after(()=>{global.chrome=old;});let calls=0;
 t.mock.method(global,'fetch',async()=>{calls++;});assert.equal((await A.submit('https://evil.test')).status,'invalid');const controller=new AbortController();controller.abort();const r=await A.submit(url,{signal:controller.signal});assert.equal(r.status,'cancelled');assert.equal(r.attempted,false);assert.equal(calls,0);
});
