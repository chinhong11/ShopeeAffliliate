/* Renders real posters with the studio (hidden iframe → window.PostStudio), one at a time, cached for the session */
(function(){
'use strict';
const STORE='leeReviewPosters.v1';
const SRC=window.STUDIO_URL||'Shopee%20Post%20Maker%20v3.html';
let frame=null,ready=null,chain=Promise.resolve();
const mem=Object.create(null);
function hash(s){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36)+'_'+s.length;}
const abs=u=>typeof u==='string'&&!/^(data:|blob:|https?:)/.test(u)?new URL(u,document.baseURI).href:u;
function boot(){
  const box=document.createElement('div');
  box.style.cssText='position:fixed;left:0;bottom:0;width:2px;height:2px;overflow:hidden;opacity:.01;pointer-events:none;z-index:0';
  frame=document.createElement('iframe');
  frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;frame.title='poster renderer';
  frame.style.cssText='width:1400px;height:1000px;border:0';
  frame.src=SRC;box.appendChild(frame);document.body.appendChild(box);
  ready=new Promise((res,rej)=>{
    const t0=Date.now();
    (function poll(){
      let ps=null;
      try{ps=frame.contentWindow&&frame.contentWindow.PostStudio;}catch(e){return rej(e);}
      if(ps)return res(ps);
      if(Date.now()-t0>40000)return rej(new Error('studio load timeout'));
      setTimeout(poll,150);
    })();
  });
  ready.catch(()=>{box.remove();frame=null;});
}
const timeout=(p,ms)=>Promise.race([p,new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),ms))]);
function shrink(url,size){return new Promise((res,rej)=>{const im=new Image();im.onload=()=>{const c=document.createElement('canvas');c.width=c.height=size;c.getContext('2d').drawImage(im,0,0,size,size);res(c.toDataURL('image/jpeg',.86));};im.onerror=()=>rej(new Error('decode'));im.src=url;});}
function readStore(){try{return JSON.parse(sessionStorage.getItem(STORE)||'{}');}catch(e){return {};}}
function writeStore(k,v){try{const c=readStore();c[k]=v;const ks=Object.keys(c);while(ks.length>20)delete c[ks.shift()];sessionStorage.setItem(STORE,JSON.stringify(c));}catch(e){}}
function render(state){
  const k=hash(JSON.stringify(state));
  if(mem[k])return Promise.resolve(mem[k]);
  const hit=readStore()[k];
  if(hit){mem[k]=hit;return Promise.resolve(hit);}
  if(!frame)boot();
  const st=JSON.parse(JSON.stringify(state));
  if(st.photos)st.photos=st.photos.map(abs);
  if(st.set&&st.set.pages)st.set.pages.forEach(pg=>{if(pg.src)pg.src=abs(pg.src);});
  const job=chain.then(async()=>{
    const ps=await ready;
    await timeout(ps.load(st),30000);
    const png=await timeout(ps.exportPng(),40000);
    const jpg=await shrink(png,720);
    mem[k]=jpg;writeStore(k,jpg);
    return jpg;
  });
  chain=job.catch(()=>{});
  return job;
}
window.PosterRenderer={render,hash};
})();
