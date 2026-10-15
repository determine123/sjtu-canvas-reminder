/* A phrase is a scan hint, never a substitute for attendance parameters. */
(function(root){
  function match(input){
    if(typeof input!=='string'||input.length>2000)return false;
    const text=input.replace(/不要忘记/g,'记得').replace(/(?:没有|还没)签到的(?:同学们|同学|人)/g,'请同学').toLowerCase().replace(/\s+/g,'').replace(/[，。！？、,:：;；]/g,' ').trim();
    if(/(?:不(?:用|要|需要|必)?|无需|取消|没有|已经结束|已结束|停止).{0,8}(?:签到|签个到|点名|考勤)|(?:签到|点名|考勤).{0,6}(?:取消|结束|不用|不需要)/.test(text))return false;
    if(/(?:介绍|设计|开发|实现|研究|演示).{0,8}(?:签到|考勤)(?:功能|系统|程序|工具)/.test(text))return false;
    return /^(?:签到|签个到|点名|有签到|要签到|需要签到)$/.test(text)||/(?:现在|开始|大家|同学|请|准备|赶紧|马上|记得|进行|可以|来).{0,16}(?:签到|签个到|签一下到|点名|考勤|扫.{0,4}码)|(?:扫码|扫描二维码).{0,5}签到|(?:签到|点名).{0,8}(?:开始|一下|现在|准备|啦|了)|(?:please|now).{0,15}(?:checkin|signin|takeattendance)/.test(text);
  }
  function gate(cooldown=15000){let last=-Infinity;const seen=new Map();return (text,now=Date.now())=>{const key=String(text).replace(/\s+/g,'').slice(0,500);if(!match(text)||now-last<cooldown||now-(seen.get(key)??-Infinity)<60000)return false;last=now;seen.set(key,now);if(seen.size>100)seen.delete(seen.keys().next().value);return true;};}
  root.HintPolicy={match,gate};if(typeof module!=='undefined')module.exports=root.HintPolicy;
})(globalThis);
