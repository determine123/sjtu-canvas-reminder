/* Local ZBar engine (the same decoder family as Python pyzbar), with jsQR fallback. */
(()=>{
  zbarWasm.setModuleArgs({locateFile:()=>chrome.runtime.getURL('vendor/zbar.wasm')});
  function classify(value){
    const target=Core.qr(value);if(target)return {target,description:'有效上交签到二维码'};
    try{const u=new URL(value);if(u.hostname==='mlearning.sjtu.edu.cn'){
      const missing=['courseCode','rollCallToken','signHistoryId'].filter(k=>!u.searchParams.get(k));
      return {description:missing.length?'上交二维码缺少签到参数：'+missing.join('、'):'上交二维码路径或参数格式不受支持'};
    }return {description:'识别到其他二维码：'+u.hostname};}catch{return {description:'识别到非网址二维码，未作为签到链接处理'};}
  }
  async function decode(canvas,roi){
    const results=new Map(),passes=[];
    function region(points,source,area){
      if(!points?.length)return undefined;const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
      const w=(Math.max(...xs)-Math.min(...xs))/source.width,h=(Math.max(...ys)-Math.min(...ys))/source.height;
      const x=Math.max(0,Math.min(...xs)/source.width-w*.25),y=Math.max(0,Math.min(...ys)/source.height-h*.25);
      const rect={x,y,w:Math.min(1-x,w*1.5),h:Math.min(1-y,h*1.5)};
      return area?{x:area.x+rect.x*area.w,y:area.y+rect.y*area.h,w:rect.w*area.w,h:rect.h*area.h}:rect;
    }
    async function read(source,label,area){
      passes.push(label);const pixels=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,source.width,source.height);
      const symbols=await zbarWasm.scanImageData(pixels);
      for(const s of symbols)if(s.typeName==='QR-Code'||s.type===64)results.set(s.decode(),{engine:'ZBar',region:region(s.points,source,area),...classify(s.decode())});
      if(!symbols.some(s=>s.typeName==='QR-Code'||s.type===64)){const code=jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'});if(code)results.set(code.data,{engine:'jsQR',region:region([code.location.topLeftCorner,code.location.topRightCorner,code.location.bottomLeftCorner,code.location.bottomRightCorner],source,area),...classify(code.data)});}
    }
    const found=()=>[...results.values()].some(c=>c.target);
    if(roi){const crop=document.createElement('canvas');const w=Math.max(1,Math.round(canvas.width*roi.w)),h=Math.max(1,Math.round(canvas.height*roi.h));
      for(const scale of [1,Math.min(3,Math.max(1,650/Math.max(w,h)))]){
        if(scale===1&&passes.length)continue;
        crop.width=Math.max(1,Math.round(w*scale));crop.height=Math.max(1,Math.round(h*scale));const ctx=crop.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;ctx.drawImage(canvas,canvas.width*roi.x,canvas.height*roi.y,w,h,0,0,crop.width,crop.height);await read(crop,scale===1?'框选优先':'框选放大',roi);if(found())break;
      }crop.width=crop.height=0;
    }
    // A successful local scan is enough to act; a second full-frame pass only adds latency.
    if(!found())await read(canvas,'原始画面');
    let black=false;if(!results.size){const sample=document.createElement('canvas');sample.width=sample.height=24;const sc=sample.getContext('2d',{willReadFrequently:true});sc.drawImage(canvas,0,0,24,24);const rgb=sc.getImageData(0,0,24,24).data;let light=0;for(let i=0;i<rgb.length;i+=4)light+=rgb[i]+rgb[i+1]+rgb[i+2];black=light/(24*24*3)<3;}
    return {codes:[...results.values()],passes,black};
  }
  async function ready(){await zbarWasm.scanImageData(new ImageData(32,32));}
  globalThis.ScanEngine={ready,decode,classify};
})();
