/* ============================================================
   Shopee Post Studio v3 — engine
   templates: t1 hero · t2 price · t3 flash · t4 chat
              t5 review · t6 cover · t8 carousel set
   every photo template supports 4 插图 layouts (1/2/3/4 图)
   ============================================================ */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const post=$('post'),wrap=$('canvasWrap'),photoEl=$('photo'),gridEl=$('grid');
const KEY='leePostStudioV3';
const GRID_TPLS=['t1','t2','t3','t5','t6'];

/* ---------------- state ---------------- */
const ph=()=>({img:null,iw:0,ih:0,zoom:100,x:50,y:50});
function freshDef(){return{
  tpl:'t1',lang:'zh',layout:1,
  l1:'我不允许你\n还不知道这个',l2:'用过都说回不去了',
  c1:'#e8232e',c2:'#8f8f8f',ol:'#ffffff',hl:false,hlc:'#ffe14d',
  font:'"Noto Sans SC","Nunito"',size:100,align:'left',scrim:24,
  photos:[ph(),ph(),ph(),ph()],
  set:{active:0,pages:[{...ph(),cap:''},{...ph(),cap:'为什么值得买 ✅'},{...ph(),cap:'细节实拍 🔍'},{...ph(),cap:'怎么下单 👇'}]},
  price:true,was:'RM 29.90',now:'RM 9.90',pct:'',sealLabel:'OFF',seal:true,
  proof:true,rate:'4.9',sold:'已售 12k+',
  voucher:false,voucherCode:'LEE10',
  cta:true,ctaText:'评论区拿链接 👇',
  arrow:true,shopee:true,
  badge:true,bstyle:'lee',bInit:'L',bName:'LEE',bTag:'Sharing',badgec:'#1c1c1e',bg:'#fdf6ec',
  cd:{h:'02',m:'47',s:'19'},stockTxt:'只剩最后 37 件',stockPct:82,
  chat:{title:'好物分享群 🔥',sub:'你、Amy、Mei 和 45 人',m1:'姐！上次你说的那个还有货吗？？',m2:'有！！Shopee 促销中 才 RM9.90 😍',m3:'快发我！我也要买 🥳'},
  review:{quote:'真的好用，已经回购第 3 次了！朋友看到也叫我帮她下单 😆',author:'— 真实买家'},
  cap:{mode:'comment',name:'',link:'',price:'',code:'',tags:'#shopee #好物分享 #开箱',out:'',out2:'',manual:false,manual2:false}
};}
function load(){
  const d=freshDef();
  try{
    const s=JSON.parse(localStorage.getItem(KEY)||'null');
    if(!s)return d;
    for(const k of ['cd','chat','review','cap'])if(s[k])s[k]={...d[k],...s[k]};
    /* migrate old single photo / t7 cells → photos[] */
    if(!s.photos){
      s.photos=d.photos.map(p=>({...p}));
      if(s.tpl==='t7'&&s.cells){s.photos=d.photos.map((p,i)=>({...p,...(s.cells[i]||{})}));}
      else if(s.photo){s.photos[0]={...d.photos[0],...s.photo};}
    }else{
      s.photos=d.photos.map((p,i)=>({...p,...(s.photos[i]||{})}));
    }
    if(s.tpl==='t7'){s.tpl='t1';if(!s.layout)s.layout=4;}
    delete s.photo;delete s.cells;
    if(s.set)s.set={active:s.set.active||0,pages:d.set.pages.map((p,i)=>({...p,...((s.set.pages||[])[i]||{})}))};
    return {...d,...s};
  }catch(e){return d;}
}
let state=load();
let saveT=null;
function save(){clearTimeout(saveT);saveT=setTimeout(()=>{
  try{localStorage.setItem(KEY,JSON.stringify(state));}
  catch(e){/* quota: strip images */
    try{const s=JSON.parse(JSON.stringify(state));
      s.photos.forEach(p=>p.img=null);s.set.pages.forEach(p=>p.img=null);
      localStorage.setItem(KEY,JSON.stringify(s));}catch(e2){}
  }
},350);}

/* ---------------- content data ---------------- */
const HOOKS={
 zh:[
  {k:'好奇',l1:'我不允许你\n还不知道这个',l2:'用过都说回不去了'},
  {k:'好奇',l1:'这玩意儿也太\n好用了吧？！',l2:'不买真的亏'},
  {k:'怕亏',l1:'现在不买\n等下涨价别哭',l2:'历史最低价 就今天'},
  {k:'怕亏',l1:'最后一批\n卖完真的没了',l2:'仓库清货 亏本卖'},
  {k:'从众',l1:'全网都在抢的\n爆款终于补货',l2:'已经卖爆 12,000+ 件'},
  {k:'从众',l1:'闺蜜看到我用\n马上叫我发链接',l2:'好东西 一传十十传百'},
  {k:'省钱',l1:'把价格\n打下来了！',l2:'一杯奶茶钱 用一整年'},
  {k:'省钱',l1:'不到 RM10\n还要什么自行车',l2:'学生党打工人 闭眼冲'}
 ],
 mix:[
  {k:'好奇',l1:'OMG 这个必须\n分享给你们！',l2:'Trust me，你会回来谢我'},
  {k:'好奇',l1:'Shopee 藏着的\n宝藏 DEAL 被我挖到',l2:'我不说 谁知道？'},
  {k:'怕亏',l1:'LAST CHANCE!\n今晚恢复原价',l2:"Don't say I never share"},
  {k:'怕亏',l1:'CLEARANCE!\n最后 50 件',l2:'Sold out = 真的没了'},
  {k:'从众',l1:'TikTok 爆款\n终于被我抢到',l2:'Viral 到断货三次'},
  {k:'省钱',l1:'RM9.90 ONLY!!\n不冲对不起自己',l2:'比一杯 kopi 还便宜'}
 ]
};
const CTAS={
 zh:['评论区拿链接 👇','链接在第一条评论 📌','想要的扣“1”发你链接','DM 我拿链接 💬'],
 mix:['Link 在评论区 👇','Comment “link” 我发你','第一条 comment 自取 📌','PM me for link 💬']
};
const CTA_DEFAULT={comment:'评论区拿链接 👇',direct:'点链接直接买 🛒'};
const PAL={
 1:['#e8232e','#1c1c1e','#ffffff','#ff8a00','#0a84ff'],
 2:['#8f8f8f','#1c1c1e','#ffffff','#e8232e','#0f9d58'],
 ol:['#ffffff','#1c1c1e','#ffe14d','#ffd0d8'],
 hl:['#ffe14d','#ffd0d8','#b8f2c9','#cfe4ff'],
 badge:['#1c1c1e','#e8232e','#ee4d2d','#0a84ff','#0f9d58'],
 bg:['#fdf6ec','#ffffff','#fff1f1','#eef5ff','#f2efe9']
};
const PALKEY={'1':'c1','2':'c2','ol':'ol','hl':'hlc','badge':'badgec','bg':'bg'};

/* ---------------- helpers ---------------- */
const cls=(n,on)=>post.classList.toggle(n,!!on);
const isGrid=()=>GRID_TPLS.includes(state.tpl);
const visPhotos=()=>state.photos.slice(0,isGrid()?state.layout:1);
function strokeCSS(col){
  const r=8,s=[];
  for(let a=0;a<360;a+=22.5){
    s.push(`${(Math.cos(a*Math.PI/180)*r).toFixed(1)}px ${(Math.sin(a*Math.PI/180)*r).toFixed(1)}px 0 ${col}`);
  }
  s.push('0 12px 26px rgba(0,0,0,.16)');
  return s.join(',');
}
function autoPct(){
  const n=parseFloat((state.now||'').replace(/[^\d.]/g,'')),w=parseFloat((state.was||'').replace(/[^\d.]/g,''));
  if(!n||!w||w<=n)return'';
  return '-'+Math.round((w-n)/w*100)+'%';
}
function cur(){ // current single-photo target (t8 page / t4 main)
  return state.tpl==='t8'?state.set.pages[state.set.active]:state.photos[0];
}
function shortLink(){
  let l=(state.cap.link||'').replace(/^https?:\/\//,'').replace(/\/$/,'');
  if(!l)return 's.shopee.com.my/9AbCdE';
  return l.length>30?l.slice(0,29)+'…':l;
}

/* ---------------- photo engine ---------------- */
function applyPhotoBox(el,o){
  if(!o||!o.img){el.classList.add('empty');el.style.backgroundImage='';return;}
  el.classList.remove('empty');
  el.style.backgroundImage=`url(${o.img})`;
  const cw=el.offsetWidth||1,chh=el.offsetHeight||1;
  const coverW=Math.max(100,(chh/cw)*(o.iw/o.ih)*100);
  el.style.backgroundSize=(coverW*o.zoom/100)+'% auto';
  el.style.backgroundPosition=`${o.x}% ${o.y}%`;
}
function applyPhotos(){
  applyPhotoBox(photoEl,state.tpl==='t8'?state.set.pages[state.set.active]:state.photos[0]);
  for(let i=0;i<4;i++)applyPhotoBox($('cellphoto'+i),state.photos[i]);
  /* scrim only when there's an image behind it */
  const hasImg=isGrid()?visPhotos().some(p=>p.img):(state.tpl==='t8'?!!cur().img:!!state.photos[0].img);
  cls('scrim-off',!hasImg);
  /* chat visuals use photo 1 */
  const p=state.photos[0];
  const im=$('chImg'),th=$('chThumb');
  if(p.img){im.classList.remove('empty');im.style.backgroundImage=`url(${p.img})`;
    th.style.backgroundImage=`url(${p.img})`;th.textContent='';}
  else{im.classList.add('empty');im.style.backgroundImage='';th.style.backgroundImage='';th.textContent='🛒';}
}
function loadImageFile(file,cb){
  const rd=new FileReader();
  rd.onload=()=>{
    const img=new Image();
    img.onload=()=>{
      const max=1400,sc=Math.min(1,max/Math.max(img.width,img.height));
      const c=document.createElement('canvas');
      c.width=Math.round(img.width*sc);c.height=Math.round(img.height*sc);
      c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      cb({img:c.toDataURL('image/jpeg',.85),iw:c.width,ih:c.height});
    };
    img.src=rd.result;
  };
  rd.readAsDataURL(file);
}
function setPhotoTarget(o,data){
  o.img=data.img;o.iw=data.iw;o.ih=data.ih;o.zoom=100;o.x=50;o.y=50;
  applyPhotos();syncPhotoUI();score();save();
}
function firstEmptyTarget(){
  if(state.tpl==='t8'||state.tpl==='t4')return cur();
  const v=visPhotos();
  const i=v.findIndex(p=>!p.img);
  return i<0?v[0]:v[i];
}
function sampleImg(kind){
  const c=document.createElement('canvas');c.width=c.height=900;
  const x=c.getContext('2d');
  const g=x.createRadialGradient(450,380,80,450,450,650);
  if(kind==='ram'){g.addColorStop(0,'#ffe9c8');g.addColorStop(1,'#ff9a3d');}
  else{g.addColorStop(0,'#e3f0ff');g.addColorStop(1,'#7db4ff');}
  x.fillStyle=g;x.fillRect(0,0,900,900);
  x.globalAlpha=.5;x.fillStyle='#fff';
  for(let i=0;i<26;i++){x.beginPath();x.arc(Math.random()*900,Math.random()*900,Math.random()*5+2,0,7);x.fill();}
  x.globalAlpha=1;x.font='430px serif';x.textAlign='center';x.textBaseline='middle';
  x.fillText(kind==='ram'?'🍜':'🧸',450,470);
  return{img:c.toDataURL('image/png'),iw:900,ih:900};
}
/* drag-pan */
function bindPan(el,getObj){
  let st=null;
  el.addEventListener('pointerdown',e=>{
    const o=getObj(e);if(!o||!o.img)return;
    st={o,sx:e.clientX,sy:e.clientY,x:o.x,y:o.y,el};
    el.setPointerCapture(e.pointerId);el.classList.add('dragging');
  });
  el.addEventListener('pointermove',e=>{
    if(!st)return;
    const sc=post.getBoundingClientRect().width/1080;
    const cw=st.el.offsetWidth,chh=st.el.offsetHeight,o=st.o;
    const coverW=Math.max(100,(chh/cw)*(o.iw/o.ih)*100);
    const bgW=coverW*o.zoom/100*cw/100,bgH=bgW*o.ih/o.iw;
    const oX=bgW-cw,oY=bgH-chh;
    const dx=(e.clientX-st.sx)/sc,dy=(e.clientY-st.sy)/sc;
    if(oX>2)o.x=Math.min(100,Math.max(0,st.x-dx/oX*100));
    if(oY>2)o.y=Math.min(100,Math.max(0,st.y-dy/oY*100));
    applyPhotoBox(st.el,o);
  });
  const end=e=>{if(!st)return;st=null;el.classList.remove('dragging');save();};
  el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
}

/* ---------------- render ---------------- */
function applyVars(){
  post.style.setProperty('--c1',state.c1);
  post.style.setProperty('--c2',state.c2);
  post.style.setProperty('--stroke',strokeCSS(state.ol));
  post.style.setProperty('--hlc',state.hlc);
  post.style.setProperty('--ts',state.size/100);
  post.style.setProperty('--scrim',state.scrim/100);
  post.style.setProperty('--badgec',state.badgec);
  post.style.setProperty('--postbg',state.bg);
  /* ✨ AI 设计 (from the app): panel colour, accent (price, buttons, seal), white text on a dark panel; '' = the template's own */
  for(const [v,k] of [['--panel','panel'],['--accent','accent'],['--panelink','panelInk']])state[k]?post.style.setProperty(v,state[k]):post.style.removeProperty(v);
  post.style.setProperty('--titlefont',state.font+',sans-serif');
  post.style.setProperty('--burst','polygon(50% 0%,60% 12%,74% 4%,78% 19%,94% 17%,90% 32%,100% 40%,89% 50%,100% 60%,90% 68%,94% 83%,78% 81%,74% 96%,60% 88%,50% 100%,40% 88%,26% 96%,22% 81%,6% 83%,10% 68%,0% 60%,11% 50%,0% 40%,10% 32%,6% 17%,22% 19%,26% 4%,40% 12%)');
  cls('mk',state.hl);
  fitText();
}
/* ---------------- fit (real product data is longer than the demo values) ----------------
   headline: every typed line stays on one line — shrink it (down to 75 %) instead of leaving a word alone on a new line;
   a line that still wraps at 75 % is long on purpose and keeps the chosen size.
   t2 big price: shrinks so it ends left of the 评论区拿链接 button instead of running under it. */
function fitLine1(){
  const el=$('line1'),ink=el.querySelector('.ink');
  el.style.fontSize='';
  const t=ink.textContent;if(!t.trim()||el.style.display==='none')return;
  const want=t.split('\n').length;
  /* lines drawn = distinct tops of the text's line boxes (a typed line break adds an empty box on its own line) */
  const lines=()=>new Set([...ink.getClientRects()].filter(r=>r.width>1).map(r=>Math.round(r.top))).size;
  if(lines()<=want)return;
  const base=parseFloat(getComputedStyle(el).fontSize);
  for(let k=0.97;k>=0.749;k-=0.03){el.style.fontSize=(base*k).toFixed(1)+'px';if(lines()<=want)return;}
  el.style.fontSize='';
}
function fitBigPrice(){
  const now=$('bpNow');now.style.fontSize='';
  if(state.tpl!=='t2'||!state.price||!now.textContent)return;
  const cta=$('ctaFloat'),edge=state.cta&&getComputedStyle(cta).display!=='none'?cta.offsetLeft-24:$('post').offsetWidth-56;
  const avail=edge-$('bigPrice').offsetLeft,w=now.scrollWidth;
  if(w>avail)now.style.fontSize=Math.floor(parseFloat(getComputedStyle(now).fontSize)*avail/w)+'px';
}
function fitText(){fitLine1();fitBigPrice();}
function applyText(){
  const t8p=state.tpl==='t8'&&state.set.active>0;
  const l1=t8p?(state.set.pages[state.set.active].cap||''):state.l1;
  const l2=t8p?'':state.l2;
  $('line1').querySelector('.ink').textContent=l1;
  $('line2').querySelector('.ink').textContent=l2;
  $('line1').style.display=l1.trim()?'':'none';
  $('line2').style.display=l2.trim()?'':'none';
  const cap=$('caption');
  cap.style.alignItems=state.align==='center'?'center':state.align==='right'?'flex-end':'flex-start';
  cap.style.textAlign=state.align;
  fitText();
}
function applyConv(){
  const pct=state.pct||autoPct();
  cls('has-price',state.price);cls('no-price',!state.price);
  cls('has-seal',state.price&&state.seal);
  $('seal').querySelector('.sp').textContent=pct||'SALE';
  $('seal').querySelector('.ss').textContent=state.sealLabel||'';
  $('ptWas').textContent=state.was||'';$('ptNow').textContent=state.now||'';$('ptOff').textContent=pct;
  $('bpWas').textContent=state.was||'';$('bpNow').textContent=state.now||'';$('bpPct').textContent=pct;
  cls('no-proof',!state.proof);
  $('bbRate').textContent=state.rate;$('bbSold').textContent=state.sold;
  $('rvRate').textContent=state.rate;$('rvSold').textContent=state.sold;
  cls('no-voucher',!state.voucher);
  $('bbVoucher').innerHTML='🎟 <b></b>';$('bbVoucher').querySelector('b').textContent=state.voucherCode||'CODE';
  cls('no-cta',!state.cta);
  $('bbCta').textContent=state.ctaText;$('ctaFloat').textContent=state.ctaText;
  cls('has-arrow',state.arrow);
  cls('no-shopee',!state.shopee);
  cls('no-bar',!(state.proof||state.voucher||state.cta||state.shopee));
  fitText();
}
function applyBrand(){
  $('badge').style.display=state.badge?'':'none';
  cls('badge-lee',state.bstyle==='lee');cls('badge-pill',state.bstyle==='pill');
  $('badge').querySelector('.av').textContent=state.bInit||'L';
  $('badge').querySelector('.bt b').textContent=state.bName||'LEE';
  $('badge').querySelector('.bt span').textContent=state.bTag||'';
}
function applyChat(){
  $('chTitle').textContent=state.chat.title;$('chSub').textContent=state.chat.sub;
  $('chM1').textContent=state.chat.m1;$('chM2').textContent=state.chat.m2;$('chM3').textContent=state.chat.m3;
  $('chLink').textContent=shortLink();
}
function applyReview(){
  $('rbQuote').textContent=state.review.quote;
  $('rbAuthor').textContent=state.review.author;
}
/* countdown */
let cdStamp=Date.now();
function cdBase(){return (parseInt(state.cd.h)||0)*3600+(parseInt(state.cd.m)||0)*60+(parseInt(state.cd.s)||0);}
function renderCd(){
  const base=cdBase();
  let rem=base-Math.floor((Date.now()-cdStamp)/1000);
  if(base<=0)rem=0;else if(rem<=0){cdStamp=Date.now();rem=base;}
  const p=n=>String(n).padStart(2,'0');
  $('cdHH').textContent=p(Math.floor(rem/3600));
  $('cdMM').textContent=p(Math.floor(rem/60)%60);
  $('cdSS').textContent=p(rem%60);
}
setInterval(()=>{if(state.tpl==='t3')renderCd();},500);
function applyFlash(){
  renderCd();
  $('stockTxt').textContent=state.stockTxt;
  $('stockPctTxt').textContent='已抢 '+state.stockPct+'%';
  $('stockWrap').style.setProperty('--stock',state.stockPct+'%');
}
/* caption builder */
function buildMain(){
  const c=state.cap,name=c.name||'这个宝藏好物';
  const hook=(state.l1||'').replace(/\n/g,'');
  const L=[hook+'🔥',''];
  L.push(`最近超多人问的「${name}」，我先冲了，真的没让我失望 👍`);
  if(c.price)L.push(`💰 现在只要 ${c.price}，这个价格真的离谱`);
  if(c.code)L.push(`🎟 结账记得输折扣码【${c.code}】还能再省`);
  L.push('⭐ 评价区好评刷屏，用过的都说值');
  L.push('');
  if(c.mode==='comment')L.push('👉 购买链接放在第一条评论，自取！👇👇');
  else L.push('👉 直接点这里买：'+(c.link||'（贴上你的带货链接）'));
  L.push('⏰ 优惠随时结束，看到就是赚到～');
  if(c.tags){L.push('');L.push(c.tags);}
  return L.join('\n');
}
function buildComment(){
  const c=state.cap;
  const L=[`🛒 「${c.name||'好物'}」链接在这 👇`,c.link||'https://s.shopee.com.my/（你的链接）'];
  const bits=[];
  if(c.price)bits.push('💰 '+c.price);
  if(c.code)bits.push('🎟 折扣码 '+c.code);
  if(bits.length)L.push(bits.join('｜'));
  L.push('库存不多，手快有手慢无！');
  return L.join('\n');
}
function applyCaption(force){
  if(force){state.cap.manual=false;state.cap.manual2=false;}
  if(!state.cap.manual){state.cap.out=buildMain();$('capOut').value=state.cap.out;}
  if(!state.cap.manual2){state.cap.out2=buildComment();$('capOut2').value=state.cap.out2;}
  const isC=state.cap.mode==='comment';
  $('capCommentField').style.display=isC?'':'none';
  $('copyBtn2').style.display=isC?'':'none';
}
/* score */
function score(){
  const anyImg=state.tpl==='t8'?state.set.pages.some(p=>p.img)
    :state.tpl==='t4'?!!state.photos[0].img
    :visPhotos().some(p=>p.img);
  const checks=[anyImg,!!state.l1.trim(),state.price,state.proof,state.cta,state.voucher||state.seal];
  const n=checks.filter(Boolean).length;
  [...$('scoreDots').children].forEach((d,i)=>d.classList.toggle('on',checks[i]));
  $('scoreVerdict').textContent=n<=1?'刚起步':n<=3?'有点东西了':n<=5?'很能打 💪':'爆款预定 🚀';
}
/* template */
function applyTemplate(){
  const t=state.tpl;
  const mods=[...post.classList].filter(c=>!/^t\d|t6c/.test(c));
  post.className='';
  post.classList.add(t==='t6'?'t6c':t,...mods);
  cls('hasgrid',isGrid());
  gridEl.dataset.layout=state.layout;
  $('setSec').hidden=t!=='t8';
  $('chatSec').hidden=t!=='t4';
  $('cdSec').hidden=t!=='t3';
  $('rvSec').hidden=t!=='t5';
  /* photo panel modes */
  $('layoutField').hidden=!isGrid();
  $('gridPhoto').hidden=!isGrid();
  $('singlePhoto').hidden=isGrid();
  $('scrimField').hidden=!(t==='t1'||t==='t2'||t==='t6'||t==='t8');
  $('bgField').hidden=!(t==='t3'||t==='t5');
  $('pageNo').textContent=(state.set.active+1)+' / 4';
  document.querySelectorAll('.tpl').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tpl===t));
  requestAnimationFrame(()=>{applyPhotos();});
  fitText();
}
function applyAll(){
  applyVars();applyTemplate();applyText();applyConv();applyBrand();
  applyChat();applyReview();applyFlash();applyCaption(false);score();
  syncPhotoUI();
}

/* ---------------- photo UI sync ---------------- */
function syncPhotoUI(){
  const o=cur();
  $('removeBtn').style.display=o.img?'':'none';
  $('photoTools').style.display=o.img?'':'none';
  $('zoom').value=o.zoom;$('zoomVal').textContent=o.zoom+'%';
  const n=isGrid()?state.layout:0;
  $('slotList').dataset.n=n;
  for(let i=0;i<4;i++){
    const c=state.photos[i];
    $('gslot'+i).hidden=i>=n;
    const th=$('gthumb'+i);
    th.classList.toggle('filled',!!c.img);
    th.style.backgroundImage=c.img?`url(${c.img})`:'';
    $('gzoom'+i).value=c.zoom;
    $('gclear'+i).style.display=c.img?'':'none';
  }
}

/* ---------------- UI builders ---------------- */
function buildSwatches(){
  document.querySelectorAll('.swatches').forEach(box=>{
    const tgt=box.dataset.target,key=PALKEY[tgt];
    box.innerHTML='';
    PAL[tgt].forEach(col=>{
      const b=document.createElement('button');
      b.className='swatch';b.style.background=col;b.title=col;
      b.addEventListener('click',()=>{state[key]=col;markSw(box,col);applyVars();save();});
      box.appendChild(b);
    });
    const cust=document.createElement('button');
    cust.className='swatch custom';
    const inp=document.createElement('input');inp.type='color';inp.value=state[key]||'#ff0000';
    inp.addEventListener('input',()=>{state[key]=inp.value;markSw(box,null);cust.setAttribute('aria-pressed','true');applyVars();save();});
    cust.appendChild(inp);box.appendChild(cust);
    markSw(box,state[key]);
  });
}
function markSw(box,val){
  [...box.children].forEach(b=>{
    const hit=!b.classList.contains('custom')&&val&&b.title.toLowerCase()===String(val).toLowerCase();
    b.setAttribute('aria-pressed',hit?'true':'false');
  });
}
function renderHooks(){
  const box=$('hooksBox');box.innerHTML='';
  HOOKS[state.lang].forEach(h=>{
    const b=document.createElement('button');
    const k=document.createElement('span');k.className='k';k.textContent=h.k;
    b.appendChild(k);b.appendChild(document.createTextNode(h.l1.replace(/\n/g,' ')));
    b.addEventListener('click',()=>{
      state.l1=h.l1;state.l2=h.l2;
      $('l1text').value=h.l1;$('l2text').value=h.l2;
      applyText();applyCaption(false);score();save();
    });
    box.appendChild(b);
  });
}
function renderCtaChips(){
  const box=$('ctaChips');box.innerHTML='';
  CTAS[state.lang].forEach(t=>{
    const b=document.createElement('button');b.textContent=t;
    b.addEventListener('click',()=>{state.ctaText=t;$('dCtaIn').value=t;applyConv();save();});
    box.appendChild(b);
  });
}

/* ---------------- generic bindings ---------------- */
function bindSeg(el,cb){
  el.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
    el.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b?'true':'false'));
    cb(b);
  }));
}
function setSeg(el,fn){
  el.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',fn(b)?'true':'false'));
}
function bindToggle(btn,get,set){
  btn.setAttribute('aria-pressed',get()?'true':'false');
  btn.addEventListener('click',()=>{
    const v=!get();set(v);
    btn.setAttribute('aria-pressed',v?'true':'false');
    applyConv();applyBrand();applyVars();score();save();
    syncCvRows();
  });
}
function syncCvRows(){
  const map=[['cvPriceRow',state.price,'priceSub'],['cvProofRow',state.proof,'proofSub'],
    ['cvVoucherRow',state.voucher,'voucherSub'],['cvCtaRow',state.cta,'ctaSub']];
  map.forEach(([row,on,sub])=>{
    $(row).classList.toggle('on',on);
    $(sub).hidden=!on;
  });
  $('hlSub').hidden=!state.hl;
}
function bindText(id,fn){
  const el=$(id);
  el.addEventListener('input',()=>{fn(el.value);save();});
  return el;
}

/* ---------------- wire everything ---------------- */
function init(){
  /* scale to fit */
  const fit=()=>{post.style.transform=`scale(${wrap.clientWidth/1080})`;};
  new ResizeObserver(()=>{fit();applyPhotos();}).observe(wrap);
  fit();

  buildSwatches();renderHooks();renderCtaChips();

  /* templates */
  document.querySelectorAll('.tpl').forEach(b=>b.addEventListener('click',()=>{
    state.tpl=b.dataset.tpl;applyAll();save();
  }));

  /* 插图 layout */
  bindSeg($('layoutSeg'),b=>{
    state.layout=+b.dataset.lay;
    gridEl.dataset.layout=state.layout;
    requestAnimationFrame(()=>applyPhotos());
    syncPhotoUI();score();save();
  });

  /* carousel set */
  bindSeg($('setTabs'),b=>{
    state.set.active=[...$('setTabs').children].indexOf(b);
    $('setCoverHint').style.display=state.set.active===0?'':'none';
    $('setCapField').hidden=state.set.active===0;
    $('setCap').value=state.set.pages[state.set.active].cap||'';
    $('pageNo').textContent=(state.set.active+1)+' / 4';
    applyText();applyPhotos();syncPhotoUI();save();
  });
  bindText('setCap',v=>{state.set.pages[state.set.active].cap=v;applyText();});

  /* photo — single (t4/t8) */
  $('uploadBtn').addEventListener('click',()=>$('fileInput').click());
  $('fileInput').addEventListener('change',e=>{
    if(e.target.files[0])loadImageFile(e.target.files[0],d=>setPhotoTarget(cur(),d));
    e.target.value='';
  });
  photoEl.addEventListener('click',()=>{if(!cur().img&&!isGrid())$('fileInput').click();});
  $('removeBtn').addEventListener('click',()=>{
    const o=cur();o.img=null;applyPhotos();syncPhotoUI();score();save();
  });
  $('sampleRam').addEventListener('click',()=>setPhotoTarget(firstEmptyTarget(),sampleImg('ram')));
  $('sampleToy').addEventListener('click',()=>setPhotoTarget(firstEmptyTarget(),sampleImg('toy')));
  $('zoom').addEventListener('input',()=>{
    const o=cur();o.zoom=+$('zoom').value;$('zoomVal').textContent=o.zoom+'%';
    applyPhotos();save();
  });
  $('scrimIn').addEventListener('input',()=>{
    state.scrim=+$('scrimIn').value;$('scrimVal').textContent=state.scrim+'%';
    applyVars();save();
  });
  bindPan(photoEl,()=>cur());

  /* photo — grid slots */
  let pendingCell=0;
  for(let i=0;i<4;i++){
    $('gthumb'+i).addEventListener('click',()=>{pendingCell=i;$('gridFileInput').click();});
    $('gclear'+i).addEventListener('click',()=>{state.photos[i].img=null;applyPhotos();syncPhotoUI();score();save();});
    $('gzoom'+i).addEventListener('input',e=>{state.photos[i].zoom=+e.target.value;applyPhotos();save();});
    const cell=$('cellphoto'+i);
    cell.addEventListener('click',()=>{if(!state.photos[i].img){pendingCell=i;$('gridFileInput').click();}});
    bindPan(cell,()=>state.photos[i]);
  }
  $('gridFileInput').addEventListener('change',e=>{
    if(e.target.files[0])loadImageFile(e.target.files[0],d=>setPhotoTarget(state.photos[pendingCell],d));
    e.target.value='';
  });

  /* drag & drop + paste */
  ['dragover','dragenter'].forEach(ev=>post.addEventListener(ev,e=>{e.preventDefault();post.classList.add('drag-over');}));
  ['dragleave','drop'].forEach(ev=>post.addEventListener(ev,e=>{e.preventDefault();post.classList.remove('drag-over');}));
  const WEB_IMG_TIP='Shopee 网页上的图片不能直接拖进来（被网站拦截）。\n\n换这几种方法：\n① 在图片上右键 →「复制图片」，回来按 Ctrl+V（Mac：⌘V）\n② 截图（Win+Shift+S / Mac：⌘+Ctrl+Shift+4），回来按 Ctrl+V\n③ 先把图片存到电脑或手机，再点「上传照片」';
  function dropUrl(dt){
    const m=(dt.getData('text/html')||'').match(/<img[^>]+src=["']([^"']+)/i);
    if(m)return m[1].replace(/&amp;/g,'&');
    const u=(dt.getData('text/uri-list')||'').split('\n').map(s=>s.trim()).find(s=>/^https?:/.test(s));
    return u||'';
  }
  post.addEventListener('drop',async e=>{
    let f=[...(e.dataTransfer.files||[])].find(f=>f.type.startsWith('image/'));
    const url=f?'':dropUrl(e.dataTransfer);
    let tgt=firstEmptyTarget();
    if(isGrid()){
      const cell=e.target.closest&&e.target.closest('.cellphoto');
      if(cell)tgt=state.photos[+cell.dataset.i];
    }
    if(!f){
      if(!url)return;
      try{const b=await(await fetch(url)).blob();if(!b.type.startsWith('image/'))throw 0;f=b;}
      catch(err){alert(WEB_IMG_TIP);return;}
    }
    loadImageFile(f,d=>setPhotoTarget(tgt,d));
  });
  document.addEventListener('paste',e=>{
    const it=[...(e.clipboardData.items||[])].find(i=>i.type.startsWith('image/'));
    if(!it)return;
    loadImageFile(it.getAsFile(),d=>setPhotoTarget(firstEmptyTarget(),d));
  });

  /* language */
  bindSeg($('langSeg'),b=>{state.lang=b.dataset.lang;renderHooks();renderCtaChips();save();});

  /* text */
  bindText('l1text',v=>{state.l1=v;applyText();applyCaption(false);score();});
  bindText('l2text',v=>{state.l2=v;applyText();});
  $('textSize').addEventListener('input',()=>{
    state.size=+$('textSize').value;$('textSizeVal').textContent=state.size+'%';
    applyVars();save();
  });
  $('fontSel').addEventListener('change',()=>{state.font=$('fontSel').value;applyVars();save();});
  bindSeg($('alignSeg'),b=>{state.align=b.dataset.align;applyText();save();});
  bindToggle($('hlToggle'),()=>state.hl,v=>state.hl=v);

  /* flash */
  ['cdHIn','cdMIn','cdSIn'].forEach((id,i)=>{
    bindText(id,v=>{
      state.cd[['h','m','s'][i]]=v.replace(/\D/g,'').slice(0,2);
      cdStamp=Date.now();renderCd();
    });
  });
  bindText('stockTxtIn',v=>{state.stockTxt=v;applyFlash();});
  $('stockPctIn').addEventListener('input',()=>{
    state.stockPct=+$('stockPctIn').value;$('stockPctVal').textContent=state.stockPct+'%';
    applyFlash();save();
  });

  /* review */
  bindText('rbQuoteIn',v=>{state.review.quote=v;applyReview();});
  bindText('rbAuthorIn',v=>{state.review.author=v;applyReview();});

  /* chat */
  bindText('chTitleIn',v=>{state.chat.title=v;applyChat();});
  bindText('chSubIn',v=>{state.chat.sub=v;applyChat();});
  bindText('chM1In',v=>{state.chat.m1=v;applyChat();});
  bindText('chM2In',v=>{state.chat.m2=v;applyChat();});
  bindText('chM3In',v=>{state.chat.m3=v;applyChat();});

  /* conversion */
  bindToggle($('cvPriceToggle'),()=>state.price,v=>state.price=v);
  bindToggle($('cvProofToggle'),()=>state.proof,v=>state.proof=v);
  bindToggle($('cvVoucherToggle'),()=>state.voucher,v=>state.voucher=v);
  bindToggle($('cvCtaToggle'),()=>state.cta,v=>state.cta=v);
  bindToggle($('sealToggle'),()=>state.seal,v=>state.seal=v);
  bindToggle($('arrowToggle'),()=>state.arrow,v=>state.arrow=v);
  bindToggle($('shopeeToggle'),()=>state.shopee,v=>state.shopee=v);
  bindText('dWasIn',v=>{state.was=v;applyConv();});
  bindText('dNowIn',v=>{state.now=v;applyConv();});
  bindText('dPctIn',v=>{state.pct=v;applyConv();});
  bindText('sealLabelIn',v=>{state.sealLabel=v;applyConv();});
  bindText('dRateIn',v=>{state.rate=v;applyConv();});
  bindText('dSoldIn',v=>{state.sold=v;applyConv();});
  bindText('dVoucherIn',v=>{state.voucherCode=v;applyConv();});
  bindText('dCtaIn',v=>{state.ctaText=v;applyConv();});

  /* brand */
  bindToggle($('badgeToggle'),()=>state.badge,v=>state.badge=v);
  bindSeg($('brandStyleSeg'),b=>{state.bstyle=b.dataset.bstyle;applyBrand();save();});
  bindText('brandInit',v=>{state.bInit=v;applyBrand();});
  bindText('brandName',v=>{state.bName=v;applyBrand();});
  bindText('brandTag',v=>{state.bTag=v;applyBrand();});

  /* caption */
  bindSeg($('linkModeSeg'),b=>{
    state.cap.mode=b.dataset.mode;
    if(Object.values(CTA_DEFAULT).includes(state.ctaText)||CTAS.zh.includes(state.ctaText)){
      state.ctaText=CTA_DEFAULT[state.cap.mode];$('dCtaIn').value=state.ctaText;
    }
    applyConv();applyCaption(true);save();
  });
  bindText('capName',v=>{state.cap.name=v;applyCaption(false);});
  bindText('capLink',v=>{state.cap.link=v;applyChat();applyCaption(false);});
  bindText('capPrice',v=>{state.cap.price=v;applyCaption(false);});
  bindText('capCode',v=>{state.cap.code=v;applyCaption(false);});
  bindText('capTags',v=>{state.cap.tags=v;applyCaption(false);});
  $('capOut').addEventListener('input',()=>{state.cap.manual=true;state.cap.out=$('capOut').value;save();});
  $('capOut2').addEventListener('input',()=>{state.cap.manual2=true;state.cap.out2=$('capOut2').value;save();});
  $('capRebuild').addEventListener('click',()=>applyCaption(true));
  const copy=(btn,get)=>btn.addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(get());}catch(e){}
    const t=btn.textContent;btn.textContent='✅ 已复制！';
    setTimeout(()=>btn.textContent=t,1400);
  });
  copy($('copyBtn'),()=>$('capOut').value);
  copy($('copyBtn2'),()=>$('capOut2').value);

  /* export */
  async function snapshot(){
    return await htmlToImage.toPng(post,{width:1080,height:1080,pixelRatio:2,style:{transform:'none'}}); // 2160px: Facebook keeps up to 2048px
  }
  function dl(url,name){
    const a=document.createElement('a');a.href=url;a.download=name;a.click();
  }
  $('downloadBtn').addEventListener('click',async()=>{
    const btn=$('downloadBtn');btn.disabled=true;btn.textContent='生成中…';
    try{dl(await snapshot(),'LEE-shopee-post.png');}catch(e){alert('导出失败，请重试');}
    btn.disabled=false;btn.textContent='⬇ 下载海报';
  });
  $('dlSetBtn').addEventListener('click',async()=>{
    const btn=$('dlSetBtn');btn.disabled=true;
    const orig=state.set.active;
    for(let i=0;i<4;i++){
      state.set.active=i;
      $('pageNo').textContent=(i+1)+' / 4';
      applyText();applyPhotos();
      await new Promise(r=>setTimeout(r,140));
      btn.textContent=`生成第 ${i+1} 张…`;
      try{dl(await snapshot(),`LEE-shopee-set-${i+1}.png`);}catch(e){}
    }
    state.set.active=orig;
    $('pageNo').textContent=(orig+1)+' / 4';
    applyText();applyPhotos();syncPhotoUI();
    btn.disabled=false;btn.textContent='⬇ 下载全部 4 张';
  });
  $('resetBtn').addEventListener('click',()=>{
    if(confirm('恢复默认？会清掉当前所有编辑。')){
      localStorage.removeItem(KEY);location.reload();
    }
  });

  /* ---- automation API: headless render for Claude Code / Playwright ---- */
  async function srcToPhoto(x){
    const o=typeof x==='string'?{src:x}:x;
    const b=await(await fetch(o.src)).blob();
    const d=await new Promise((res,rej)=>{loadImageFile(b,res);setTimeout(()=>rej(new Error('image load timeout: '+String(o.src).slice(0,60))),20000);});
    return{...ph(),...d,zoom:o.zoom||100,x:o.x??50,y:o.y??50};
  }
  const settle=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  window.PostStudio={
    version:3,
    getState:()=>JSON.parse(JSON.stringify(state)),
    async load(patch={},opt={}){
      const base=opt.keep?JSON.parse(JSON.stringify(state)):freshDef();
      const {photos,set,...rest}=patch;
      const n={...base,...rest};
      for(const k of ['cd','chat','review','cap'])if(rest[k])n[k]={...base[k],...rest[k]};
      if(photos){n.photos=[ph(),ph(),ph(),ph()];for(let i=0;i<4;i++)if(photos[i])n.photos[i]=await srcToPhoto(photos[i]);}
      if(set&&set.pages){
        n.set={active:0,pages:await Promise.all(base.set.pages.map(async(pg,i)=>{
          const s=set.pages[i];if(!s)return pg;
          const o=s.src?await srcToPhoto(s):{...pg};
          return{...o,cap:s.cap??pg.cap};
        }))};
      }
      state=n;cdStamp=Date.now();
      renderHooks();renderCtaChips();syncControls();applyAll();
      if(opt.persist)save();
      await document.fonts.ready;fitText();await settle();applyPhotos();await settle();
      return true;
    },
    fit:()=>fitText(), // re-measure after the page's fonts changed (the renderer trims them before exporting)
    exportPng:()=>snapshot(),
    async exportSet(){
      const out=[],orig=state.set.active;
      for(let i=0;i<4;i++){state.set.active=i;$('pageNo').textContent=(i+1)+' / 4';applyText();applyPhotos();await settle();out.push(await snapshot());}
      state.set.active=orig;$('pageNo').textContent=(orig+1)+' / 4';applyText();applyPhotos();syncPhotoUI();
      return out;
    },
    caption:()=>({post:state.cap.out,comment:state.cap.mode==='comment'?state.cap.out2:''})
  };
  syncControls();
  applyAll();
  document.fonts.addEventListener('loadingdone',fitText); // sizes measured with a fallback font are redone
}
function syncControls(){
  $('l1text').value=state.l1;$('l2text').value=state.l2;
  $('textSize').value=state.size;$('textSizeVal').textContent=state.size+'%';
  $('fontSel').value=state.font;
  $('zoom').value=cur().zoom;$('scrimIn').value=state.scrim;$('scrimVal').textContent=state.scrim+'%';
  $('cdHIn').value=state.cd.h;$('cdMIn').value=state.cd.m;$('cdSIn').value=state.cd.s;
  $('stockTxtIn').value=state.stockTxt;$('stockPctIn').value=state.stockPct;$('stockPctVal').textContent=state.stockPct+'%';
  $('rbQuoteIn').value=state.review.quote;$('rbAuthorIn').value=state.review.author;
  $('chTitleIn').value=state.chat.title;$('chSubIn').value=state.chat.sub;
  $('chM1In').value=state.chat.m1;$('chM2In').value=state.chat.m2;$('chM3In').value=state.chat.m3;
  $('dWasIn').value=state.was;$('dNowIn').value=state.now;$('dPctIn').value=state.pct;
  $('sealLabelIn').value=state.sealLabel;
  $('dRateIn').value=state.rate;$('dSoldIn').value=state.sold;
  $('dVoucherIn').value=state.voucherCode;$('dCtaIn').value=state.ctaText;
  $('brandInit').value=state.bInit;$('brandName').value=state.bName;$('brandTag').value=state.bTag;
  $('capName').value=state.cap.name;$('capLink').value=state.cap.link;
  $('capPrice').value=state.cap.price;$('capCode').value=state.cap.code;$('capTags').value=state.cap.tags;
  if(state.cap.manual)$('capOut').value=state.cap.out;
  if(state.cap.manual2)$('capOut2').value=state.cap.out2;
  setSeg($('langSeg'),b=>b.dataset.lang===state.lang);
  setSeg($('alignSeg'),b=>b.dataset.align===state.align);
  setSeg($('brandStyleSeg'),b=>b.dataset.bstyle===state.bstyle);
  setSeg($('linkModeSeg'),b=>b.dataset.mode===state.cap.mode);
  setSeg($('layoutSeg'),b=>+b.dataset.lay===state.layout);
  setSeg($('setTabs'),(b)=>[...$('setTabs').children].indexOf(b)===state.set.active);
  $('setCoverHint').style.display=state.set.active===0?'':'none';
  $('setCapField').hidden=state.set.active===0;
  $('setCap').value=state.set.pages[state.set.active].cap||'';
  syncCvRows();
  [['cvPriceToggle','price'],['cvProofToggle','proof'],['cvVoucherToggle','voucher'],['cvCtaToggle','cta'],['sealToggle','seal'],['arrowToggle','arrow'],['shopeeToggle','shopee'],['badgeToggle','badge'],['hlToggle','hl']]
    .forEach(([id,k])=>$(id).setAttribute('aria-pressed',state[k]?'true':'false'));
  document.querySelectorAll('.swatches').forEach(box=>markSw(box,state[PALKEY[box.dataset.target]]));
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
else init();
})();
