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
    async function read(source,label){
      passes.push(label);const pixels=source.getContext('2d',{willReadFrequently:true}).getImageData(0,0,source.width,source.height);
      const symbols=await zbarWasm.scanImageData(pixels);
      for(const s of symbols)if(s.typeName==='QR-Code'||s.type===64)results.set(s.decode(),{engine:'ZBar',...classify(s.decode())});
      if(!symbols.some(s=>s.typeName==='QR-Code'||s.type===64)){const code=jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'});if(code)results.set(code.data,{engine:'jsQR',...classify(code.data)});}
    }
    if(roi){const crop=document.createElement('canvas');const w=Math.max(1,Math.round(canvas.width*roi.w)),h=Math.max(1,Math.round(canvas.height*roi.h));const scale=Math.min(3,2400/Math.max(w,h));crop.width=Math.round(w*scale);crop.height=Math.round(h*scale);const ctx=crop.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=false;ctx.drawImage(canvas,canvas.width*roi.x,canvas.height*roi.y,w,h,0,0,crop.width,crop.height);await read(crop,'框选放大');crop.width=crop.height=0;}
    await read(canvas,'原始画面');
    const sample=document.createElement('canvas');sample.width=sample.height=24;const sc=sample.getContext('2d',{willReadFrequently:true});sc.drawImage(canvas,0,0,24,24);const rgb=sc.getImageData(0,0,24,24).data;let light=0;for(let i=0;i<rgb.length;i+=4)light+=rgb[i]+rgb[i+1]+rgb[i+2];
    return {codes:[...results.values()],passes,black:light/(24*24*3)<3};
  }
  async function ready(){await zbarWasm.scanImageData(new ImageData(32,32));}
  globalThis.ScanEngine={ready,decode,classify};
})();
