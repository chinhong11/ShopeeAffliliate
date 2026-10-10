/* LEE 带货后台 — review app prototype: sample data + README Step 1–2 rules (port these to the real app) */
(function(){
'use strict';
const TAGS='#shopee #好物分享 #开箱';
const STRATS={top:{zh:'爆卖'},com:{zh:'高佣'},disc:{zh:'大折扣'}};
const TPL={t1:'爆款分享',t2:'价格暴击',t3:'限时抢购',t4:'好友爆料',t5:'真实好评',t6:'杂志封面',t8:'轮播套图'};
const TPL_NOTE={t1:'照片为主',t2:'大字价格',t6:'杂志风',t5:'买家原话',t3:'倒计时',t4:'聊天截图风',t8:'4 张一组'};
const TPL_LOCK={t5:'先填买家真实评价',t3:'需要真实结束时间',t4:'需要你写聊天内容',t8:'需要 4 张照片'};
const TPL_ORDER=['t1','t2','t6','t5','t3','t4','t8'];
const LAYOUT=['','单图','双图','三图','四宫格'];
const DEMO_NOW=10*60+15;
const rm=n=>'RM '+Number(n).toFixed(2);
function fmtSold(n){if(n<1000)return '已售 '+n;if(n<10000)return '已售 '+Math.floor(n/100)/10+'k+';return '已售 '+Math.floor(n/1000)+'k+';}
function shortName(s){s=s.replace(/【[^】]*】/g,'').replace(/\b(Ready Stock|COD)\b/gi,'').replace(/\s+/g,' ').trim();return s.length>24?s.slice(0,23)+'…':s;}
const wasOf=p=>p.disc>=10?rm(p.price/(1-p.disc/100)):'';
const pctOf=p=>p.disc>=10?'-'+p.disc+'%':'';
const commOf=p=>'佣金 '+Math.round(p.comm*100)+'% ≈ '+rm(p.price*p.comm)+'/单';

/* sample offers (shape of productOfferV2 after mapping) */
const PRODUCTS=[
 {id:'d1',strat:'top',img:'review-photos/p-ramen5.jpg',name:'辛拉面 甜辣泡菜炒面 5包装',price:12.9,disc:32,rating:4.9,sales:15200,comm:.05,short:'9fK2aQx'},
 {id:'d2',strat:'top',img:'review-photos/p-cd-pair.jpg',name:'奇奇蒂蒂 贴贴日常系列 植绒盲盒 单盒',price:39.9,disc:15,rating:4.9,sales:3400,comm:.08,short:'7Hq3LmB'},
 {id:'d3',strat:'com',img:'review-photos/p-cd-cuddle.jpg',name:'奇奇蒂蒂 植绒盲盒 整盒 6 款',price:219,disc:12,rating:4.7,sales:640,comm:.12,short:'2Rt8VwN'},
 {id:'d4',strat:'com',img:'review-photos/p-cd-skate.jpg',name:'奇奇蒂蒂 滑板款 公仔摆件',price:49.9,disc:42,rating:4.8,sales:1300,comm:.10,short:'5Zc1PdK'},
 {id:'d5',strat:'disc',img:'review-photos/p-cd-glasses.jpg',name:'奇奇蒂蒂 眼镜款 桌面摆件',price:19.9,disc:60,rating:4.7,sales:2100,comm:.07,short:'8Lp4XsE'},
 {id:'d6',strat:'disc',img:'review-photos/p-ramen1.jpg',name:'辛拉面 甜辣泡菜炒面 单包 137g',price:2.9,disc:41,rating:4.8,sales:8700,comm:.05,short:'3Gd6YuT'}
];
const RESERVE=[{id:'r1',strat:'top',img:'review-photos/p-cd-paint.jpg',name:'奇奇蒂蒂 刷漆款 公仔',price:45.9,disc:20,rating:4.9,sales:5600,comm:.08,short:'6Wm9BrJ'}];

/* Step 2 — template */
function pickTemplate(p,prev,hasReview){
  if(p.disc>=40)return 't2';
  if(p.rating>=4.8&&p.sales>=1000&&hasReview)return 't5';
  if(p.sales>=5000)return 't1';
  return prev==='t1'?'t6':'t1';
}
/* Step 2 — headline: first matching condition, variants A/B alternate per condition */
const HL={
 disc:[['把价格\n打下来了！','现在只要 {now}'],['直接砍到\n{now}！','原价 {was}']],
 sales:[['全网都在抢的\n爆款','{sold} 件'],['大家都在买的\n这个','{sold} 件 · ★{rate}']],
 rate:[['评分 {rate} 的\n宝藏好物','买过的都说值'],['{rate} 分好评\n闭眼入','{sold}']],
 base:[['我不允许你\n还不知道这个','{now} · ★{rate}'],['这个必须\n分享给你们','{now} · ★{rate}']]
};
const PERSONAL=[['这玩意儿也太\n好用了吧？！','不买真的亏'],['闺蜜看到我用\n马上叫我发链接','好东西 一传十十传百']];
const hlKind=p=>p.disc>=40?'disc':p.sales>=5000?'sales':p.rating>=4.8?'rate':'base';
const fill=(t,p)=>t.replace('{now}',rm(p.price)).replace('{was}',wasOf(p)).replace('{sold}',fmtSold(p.sales)).replace('{rate}',p.rating.toFixed(1));
function suggest(p,used){
  const k=hlKind(p),list=[...HL[k]];
  if(k!=='base')list.push(...HL.base);
  if(used)list.push(...PERSONAL);
  return list.map(([a,b])=>[fill(a,p),fill(b,p)]);
}
/* captions ① ② */
function cap1(d){
  const p=d.p,hook=(d.l1||'').replace(/\n/g,''),name=shortName(p.name),now=rm(p.price);
  if(d.used)return [hook+'🔥','',`最近超多人问的「${name}」，我先冲了，真的没让我失望 👍`,`💰 现在只要 ${now}，这个价格真的离谱`,'⭐ 评价区好评刷屏，用过的都说值','','👉 购买链接放在第一条评论，自取！👇👇','⏰ 优惠随时结束，看到就是赚到～','',TAGS].join('\n');
  return [hook+'🔥','',`发现这个「${name}」，评分 ${p.rating.toFixed(1)}、${fmtSold(p.sales)}，看了评价决定分享给你们 👀`,p.disc>=10?`💰 现在 ${now}（-${p.disc}%）`:`💰 现在 ${now}`,'👉 购买链接放在第一条评论 👇','',TAGS].join('\n');
}
function cap2(d){const p=d.p;return [`🛒 「${shortName(p.name)}」链接在这 👇`,'https://s.shopee.com.my/'+p.short,`💰 ${rm(p.price)}`].join('\n');}

function makeDraft(p,prev,rot){
  const k=hlKind(p),v=rot[k]||0;rot[k]=v+1;
  const [l1,l2]=HL[k][v%2].map(t=>fill(t,p));
  const tpl=pickTemplate(p,prev,false);
  const d={id:p.id,p,tpl,autoTpl:tpl,l1,l2,photos:[p.img],used:false,review:{quote:'',author:''},flash:{end:'',pct:''},chat:{m1:'',m2:'',m3:''},cap1Manual:false,cap2Manual:false,status:'draft',approvedAt:0,priceChanged:null,isNew:false};
  d.cap1=cap1(d);d.cap2=cap2(d);
  return d;
}
function initialDrafts(){
  const rot={},drafts=[];let prev=null;
  PRODUCTS.forEach(p=>{const d=makeDraft(p,prev,rot);prev=d.tpl;drafts.push(d);});
  drafts[0].status='approved';drafts[0].approvedAt=1;
  drafts[5].priceChanged={from:'RM 2.50',fromPct:'-50%',to:'RM 2.90',toPct:'-41%'};
  return {drafts,rot,prev};
}
function formOf(d){return {tpl:d.tpl,l1:d.l1,l2:d.l2,photos:d.photos.slice(),used:d.used,review:{...d.review},flash:{...d.flash},chat:{...d.chat},cap1:d.cap1,cap2:d.cap2,cap1Manual:d.cap1Manual,cap2Manual:d.cap2Manual};}
function availability(f){return {t1:true,t2:true,t6:true,t5:!!f.review.quote.trim(),t3:!!(f.flash.end&&f.flash.pct),t4:!!(f.chat.m1.trim()&&f.chat.m2.trim()&&f.chat.m3.trim()),t8:f.photos.length===4};}
function remain(end){const [h,m]=end.split(':').map(Number);let r=h*60+m-DEMO_NOW;if(r<0)r+=1440;return {h:String(Math.floor(r/60)).padStart(2,'0'),m:String(r%60).padStart(2,'0'),s:'00'};}

/* draft → window.PostStudio.load() patch (README Step 1 mapping) */
function studioState(d){
  const p=d.p,n=Math.max(1,Math.min(4,d.photos.length));
  const st={tpl:d.tpl,layout:n,lang:'zh',l1:d.l1,l2:d.l2,photos:d.photos.slice(0,4),
    price:p.disc>=10||d.tpl==='t2',now:rm(p.price),was:wasOf(p),pct:pctOf(p),seal:p.disc>=20,sealLabel:'OFF',
    proof:p.rating>=4.5,rate:p.rating.toFixed(1),sold:fmtSold(p.sales),
    voucher:false,cta:true,ctaText:'评论区拿链接 👇',arrow:true,shopee:true,
    badge:true,bstyle:'lee',bInit:'L',bName:'LEE',bTag:'Sharing',badgec:'#1c1c1e',
    cap:{mode:'comment',name:shortName(p.name),link:'https://s.shopee.com.my/'+p.short,price:rm(p.price),code:'',tags:TAGS}};
  if(d.tpl==='t5')st.review={quote:d.review.quote,author:d.review.author||'— Shopee 买家'};
  if(d.tpl==='t3'){st.cd=remain(d.flash.end);st.stockTxt='限时闪购中';st.stockPct=Math.max(1,Math.min(99,+d.flash.pct||1));}
  if(d.tpl==='t4')st.chat={title:'好物分享群 🔥',sub:'群聊',m1:d.chat.m1,m2:d.chat.m2,m3:d.chat.m3};
  if(d.tpl==='t8')st.set={pages:d.photos.slice(0,4).map((src,i)=>({src,cap:['','为什么值得买 ✅','细节实拍 🔍','怎么下单 👇'][i]}))};
  return st;
}
const posterKey=d=>window.PosterRenderer.hash(JSON.stringify(studioState(d)));

/* slots: approved drafts fill upcoming slots in approval order */
const SLOTS=[{t:'12:30',at:'12:34'},{t:'20:30',at:'20:26'}];
const DAYS=['今天','明天','后天'];
function slotsFor(n){const o=[];for(let day=0;o.length<n;day++)SLOTS.forEach(s=>o.push({day,t:s.t,label:(DAYS[day]||day+' 天后')+' '+s.t}));return o.slice(0,n);}

const LOG=[
 {day:'昨天 · 10月9日',items:[
  {id:'l1',kind:'returned',time:'20:30',name:'辛拉面 甜辣泡菜炒面 单包 137g',img:'review-photos/p-ramen1.jpg',msg:'发帖前查价：价格变了，已退回待审核。这个时段没有发帖。'},
  {id:'l2',kind:'posted',time:'12:34',name:'奇奇蒂蒂 贴贴日常 泡澡款盲盒',img:'review-photos/post-cd.jpg',tpl:'t2',strat:'disc',sub:'fb·t2·disc·20261009·d9a1'}]},
 {day:'10月8日',items:[
  {id:'l3',kind:'posted',time:'20:27',name:'辛拉面 甜辣泡菜炒面 10包箱装',img:'review-photos/post-ramen.jpg',tpl:'t1',strat:'top',sub:'fb·t1·top·20261008·d8k3'},
  {id:'l4',kind:'failed',time:'12:31',name:'奇奇蒂蒂 树枝款 摆件',img:'review-photos/p-cd-branch.jpg',tpl:'t6',strat:'com',sub:'fb·t6·com·20261008·d8b7',msg:'Facebook 服务器错误 (500)，60 秒后自动重试也失败。'}]}
];
const STATS={
 '7':{posts:12,orders:31,comm:58.4,strat:[['top','爆卖',14,21.7],['com','高佣',6,24.1],['disc','大折扣',11,12.6]],tpl:[['t2','价格暴击',13,19.8],['t1','爆款分享',10,17.3],['t6','杂志封面',6,15.9],['t5','真实好评',2,5.4]]},
 '30':{posts:52,orders:118,comm:236.9,strat:[['top','爆卖',51,82.4],['com','高佣',24,97.1],['disc','大折扣',43,57.4]],tpl:[['t2','价格暴击',49,78.2],['t1','爆款分享',41,74.6],['t6','杂志封面',20,61.3],['t5','真实好评',8,22.8]]}
};

window.RV={TAGS,STRATS,TPL,TPL_NOTE,TPL_LOCK,TPL_ORDER,LAYOUT,rm,fmtSold,shortName,wasOf,pctOf,commOf,PRODUCTS,RESERVE,pickTemplate,suggest,cap1,cap2,makeDraft,initialDrafts,formOf,availability,studioState,posterKey,SLOTS,slotsFor,LOG,STATS};
})();
