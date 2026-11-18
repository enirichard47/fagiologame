(async()=>{
 const fs=require("fs");const d=await fetch("http://127.0.0.1:9226/json").then(r=>r.json());const p=(Array.isArray(d)?d:d.value).find(t=>t.type==="page");const w=new WebSocket(p.webSocketDebuggerUrl);const send=(id,method,params={})=>w.send(JSON.stringify({id,method,params}));
 w.onopen=()=>{send(1,"Page.reload",{ignoreCache:true});setTimeout(()=>{send(2,"Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:2,mobile:true,screenWidth:390,screenHeight:844,screenOrientation:{angle:0,type:"portraitPrimary"}});setTimeout(()=>send(3,"Page.captureScreenshot",{format:"png"}),800)},2800)};
 w.onmessage=e=>{const m=JSON.parse(e.data);if(m.id===3){fs.writeFileSync("review-mobile-portrait.png",Buffer.from(m.result.data,"base64"));console.log("portrait screenshot saved");w.close()}if(m.error)console.log(JSON.stringify(m.error))};
})().catch(console.error)
