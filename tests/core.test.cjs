const {test}=require('node:test');const assert=require('node:assert/strict');const C=require('../core.js');
const url='https://mlearning.sjtu.edu.cn/lms/mobile2/forscan/?courseCode=c&rollCallToken=t&signHistoryId=h';
test('QR accepts reordered parameters but rejects spoofed hosts, duplicates and missing fields',()=>{
 assert.ok(C.qr(url));assert.ok(C.qr('https://mlearning.sjtu.edu.cn/lms/mobile2/forscan/?signHistoryId=h&rollCallToken=t&courseCode=c'));
 for(const x of [url.replace('https:','http:'),url.replace('sjtu.edu.cn','sjtu.edu.cn.evil.test'),url+'&signHistoryId=duplicate',url.replace('Token=t','Token='),url.replace('https://','https://u:p@'),url+'#fake','javascript:alert(1)'])assert.equal(C.qr(x),null);
});
test('QR recent-entry expiry is independent of server validity',()=>{
 assert.equal(C.fresh({url,time:1000},2000),true);assert.equal(C.fresh({url,time:1000},301000),false);assert.equal(C.fresh({url,time:3000},2000),false);assert.equal(C.fresh({url}),false);
});
test('course validation supports numeric IDs and configurable tool IDs',()=>{
 assert.equal(C.course({url:'123'}).url,'https://oc.sjtu.edu.cn/courses/123/external_tools/6650');
 assert.equal(C.course({url:'https://oc.sjtu.edu.cn/courses/123/external_tools/999/?x=1'}).url,'https://oc.sjtu.edu.cn/courses/123/external_tools/999');
 assert.throws(()=>C.course({url:'https://evil.test/courses/123/external_tools/6650'}));
});
test('table alerts only new or newly active records and never completed/unknown records',()=>{
 const active={key:'1',active:true};assert.equal(C.shouldAlert(null,active),true);assert.equal(C.shouldAlert(active,active),false);
 assert.equal(C.shouldAlert(active,{key:'2',active:false}),false);assert.equal(C.shouldAlert({key:'2',active:false},{key:'2',active:true}),true);
});
const row={id:'1',name:'测试课',days:[5],time:'00:10',from:'2026-10-01',to:'2026-10-31',weeks:'all'};
test('midnight course reminds on preceding date in Shanghai time',()=>{
 const n=C.nextLesson(row,Date.parse('2026-10-15T22:00:00+08:00'));
 assert.equal(n.when,Date.parse('2026-10-15T23:40:00+08:00'));assert.equal(n.date,'2026-10-16');
});
test('wake-up catches upcoming classes but does not notify after class starts or duplicate sent events',()=>{
 const now=Date.parse('2026-10-16T00:05:00+08:00'),n=C.nextLesson(row,now);assert.equal(n.when,now+1000);
 const after=C.nextLesson(row,Date.parse('2026-10-16T00:10:00+08:00'));assert.equal(after.date,'2026-10-23');
 assert.equal(C.nextLesson(row,now,{[n.key]:now}).date,'2026-10-23');
});
test('schedule rejects invalid dates and validates odd/even anchor Monday',()=>{
 assert.throws(()=>C.lesson({...row,from:'2026-02-30'}));assert.throws(()=>C.lesson({...row,weeks:'odd',anchor:'2026-10-06'}));
 const n=C.nextLesson({...row,weeks:'even',anchor:'2026-10-05'},Date.parse('2026-10-08T20:00:00+08:00'));assert.equal(n.date,'2026-10-16');
});
test('single-class cancellation and rescheduling replace only the matching occurrence',()=>{
 const now=Date.parse('2026-10-16T20:00:00+08:00');
 const skipped=C.nextLesson({...row,changes:[{date:'2026-10-23',kind:'skip'}]},now);assert.equal(skipped.date,'2026-10-30');
 const changed={...row,location:'原教室',changes:[{date:'2026-10-23',kind:'move',toDate:'2026-10-25',time:'14:30',location:'临时教室'}]};
 const moved=C.nextLesson(changed,now);assert.equal(moved.date,'2026-10-25');assert.equal(moved.time,'14:30');assert.equal(moved.location,'临时教室');assert.equal(moved.originalDate,'2026-10-23');assert.equal(moved.moved,true);
 assert.equal(moved.when,Date.parse('2026-10-25T14:00:00+08:00'));
 assert.equal(C.nextLesson(changed,Date.parse('2026-10-24T20:00:00+08:00')).date,'2026-10-25');
 assert.equal(C.nextLesson(changed,now,{[moved.key]:now}).date,'2026-10-30');
});
test('schedule adjustments require scheduled original dates, unique records and valid replacements',()=>{
 const changes=[{date:'2026-10-23',kind:'skip'}];
 assert.throws(()=>C.lesson({...row,changes:[{date:'2026-10-22',kind:'skip'}]}),/已安排/);
 assert.throws(()=>C.lesson({...row,changes:[...changes,...changes]}),/只能添加一条/);
 assert.throws(()=>C.lesson({...row,changes:[{date:'2026-10-23',kind:'move',toDate:'2027-02-01',time:'14:30'}]}),/新日期/);
 assert.throws(()=>C.lesson({...row,changes:[{date:'2026-10-23',kind:'move',toDate:'2026-10-25',time:'25:00'}]}),/新日期/);
 assert.deepEqual(C.lesson({...row,changes}).changes,changes);
});
