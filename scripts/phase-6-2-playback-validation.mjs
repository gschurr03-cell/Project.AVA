import { createServer } from "node:http";
import { createReadStream, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, webkit } from "@playwright/test";

const videoPath = path.resolve("tmp/phase50e/sources/gav_stationary_reference.mov");
const size = statSync(videoPath).size;
const server = createServer((req,res) => {
  const match = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
  const start = match ? Number(match[1]) : 0;
  const end = match?.[2] ? Number(match[2]) : size - 1;
  res.writeHead(match ? 206 : 200, { "Content-Type":"video/quicktime", "Content-Length":end-start+1, "Accept-Ranges":"bytes", ...(match ? {"Content-Range":`bytes ${start}-${end}/${size}`} : {}) });
  createReadStream(videoPath,{start,end}).pipe(res);
});
await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
const port = server.address().port;
const browserType = process.env.PHASE62_BROWSER === "webkit" ? webkit : chromium;
const browser = await browserType.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:1000,height:700},deviceScaleFactor:2});
  await page.setContent(`<video id="v" width="960" height="540" muted playsinline src="http://127.0.0.1:${port}/gav.mov"></video><canvas id="c"></canvas>`);
  await page.evaluate(() => Promise.race([
    new Promise((resolve,reject) => { const v=document.querySelector("video"); v.onloadedmetadata=resolve; v.onerror=()=>reject(new Error(`video decode error ${v.error?.code ?? "unknown"}`)); }),
    new Promise((_,reject) => setTimeout(()=>reject(new Error("benchmark video metadata/decode timeout")),5000)),
  ]));
  const result = await page.evaluate(async () => {
    const v=document.querySelector("video"); const c=document.querySelector("canvas");
    const callbacks=[]; let active=true;
    const listen=()=>v.requestVideoFrameCallback((_now,m)=>{callbacks.push({mediaTime:m.mediaTime,currentTime:v.currentTime}); if(active)listen();}); listen();
    const run=async rate=>{v.playbackRate=rate; await v.play(); await new Promise(r=>setTimeout(r,350)); v.pause(); return callbacks.length;};
    const counts=[]; for(const rate of [.25,.5,1]) counts.push(await run(rate));
    v.currentTime=Math.min(v.duration*.5,1); await new Promise(r=>v.addEventListener("seeked",r,{once:true}));
    const seekTime=v.currentTime; c.style.width="640px";c.style.height="360px";c.width=Math.round(640*devicePixelRatio);c.height=Math.round(360*devicePixelRatio);const ctx=c.getContext("2d");ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);ctx.beginPath();ctx.moveTo(100.25,0);ctx.lineTo(100.25,360);ctx.stroke();
    active=false;
    return {supported:typeof v.requestVideoFrameCallback==="function",callbackCount:callbacks.length,monotonic:callbacks.every((x,i)=>i===0||x.mediaTime>=callbacks[i-1].mediaTime),ratesProducedFrames:counts[0]>0&&counts[1]>counts[0]&&counts[2]>counts[1],seekTime,lastMediaTime:callbacks.at(-1)?.mediaTime,dpr:devicePixelRatio,canvas:[c.width,c.height],css:[c.clientWidth,c.clientHeight]};
  });
  if (!result.supported || !result.monotonic || !result.ratesProducedFrames || result.dpr !== 2 || result.canvas[0] !== 1280 || result.canvas[1] !== 720) throw new Error(JSON.stringify(result));
  writeFileSync("tmp/phase62/playback-validation.json", JSON.stringify(result,null,2)+"\n");
  console.log(JSON.stringify(result,null,2));
  console.log("PHASE 6.2 REAL-BROWSER PLAYBACK VALIDATION PASSED");
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
