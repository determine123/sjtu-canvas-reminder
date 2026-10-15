const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const H=require('../hint-policy.js');
test('attendance hints recognize instructions while rejecting negatives and feature discussion',()=>{
 for(const s of ['现在请大家扫码签到','同学们签个到','开始点名了','扫码签到','不要忘记签到','没有签到的同学请签到','Please sign in now','签到','有签到'])assert.equal(H.match(s),true,s);
 for(const s of ['今天不需要签到','请大家不要签到','签到已经结束','现在介绍签到系统','这节课讨论算法','已签到','签到功能'])assert.equal(H.match(s),false,s);
});
test('hint cooldown suppresses repeated interim speech and persistent captions',()=>{
 const accept=H.gate();assert.equal(accept('请大家签到',0),true);assert.equal(accept('现在扫码签到',1000),false);assert.equal(accept('请大家签到',16000),false);assert.equal(accept('现在扫码签到',16000),true);assert.equal(accept('请大家签到',61000),true);
});
function voice(version=154){
 const calls=[],statuses=[];let instance;
 class Recognition{constructor(){instance=this;this.processLocally=true;}start(track){calls.push(track);this.onstart?.();}abort(){}}
 const ctx=vm.createContext({navigator:{userAgent:'Mozilla Edg/'+version+'.0'},SpeechRecognition:Recognition,setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../voice-hints.js'),'utf8'),ctx);
 const texts=[];const api=ctx.VoiceHints.create({onText:t=>texts.push(t),onStatus:s=>statuses.push(s)});
 return {calls,statuses,texts,api,instance:()=>instance};
}
test('voice uses only a live shared audio track and never falls back to a microphone',()=>{
 const v=voice();assert.equal(v.api.start(),false);assert.equal(v.calls.length,0);
 assert.equal(v.api.start({kind:'video',readyState:'live'}),false);assert.equal(v.calls.length,0);
 const track={kind:'audio',readyState:'live',addEventListener(){}};assert.equal(v.api.start(track),true);assert.equal(v.calls[0],track);assert.equal(v.instance().lang,'zh-CN');assert.equal(v.instance().processLocally,false);
 v.instance().onresult({resultIndex:0,results:[[{transcript:'现在扫码签到'}]]});assert.deepEqual(v.texts,['现在扫码签到']);v.instance().onresult({resultIndex:1,results:[[{transcript:'现在大家'}],[{transcript:'签到'}]]});assert.equal(v.texts.at(-1),'现在大家 签到');v.api.stop();v.instance().onresult({resultIndex:0,results:[[{transcript:'停止后不处理'}]]});assert.equal(v.texts.length,2);
});
test('unsupported audio-track browsers and service failures report status rather than using another input',()=>{
 const old=voice(134),track={kind:'audio',readyState:'live',addEventListener(){}};assert.equal(old.api.start(track),false);assert.equal(old.calls.length,0);
 const v=voice();v.api.start(track);v.instance().onerror({error:'network'});assert.ok(v.statuses.at(-1).includes('network'));v.api.stop();assert.equal(v.calls.length,1);
});
