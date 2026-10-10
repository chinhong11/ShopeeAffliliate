/* LEE 带货后台 — 编辑草稿 */
function RvEdit({d,info,desk,onBack,onCommit,onApprove,onToast,onRetryPoster}){
  const [f,setF]=React.useState(()=>RV.formOf(d));
  const [unlock,setUnlock]=React.useState(null);
  const fileRef=React.useRef(null),revRef=React.useRef(null);
  const merged={...d,...f};
  const dirty=RV.posterKey(d)!==RV.posterKey(merged);
  const busy=!!(info&&info.busy);
  const av=RV.availability(f);
  const p=d.p,n=f.photos.length,pc=d.priceChanged;
  const upd=patch=>setF(o=>{const x={...o,...patch};if(!x.cap1Manual)x.cap1=RV.cap1({...d,...x});return x;});
  React.useEffect(()=>{if(!av[f.tpl])setF(o=>({...o,tpl:d.autoTpl}));},[av[f.tpl]]);
  const pick=k=>{
    if(av[k]){upd({tpl:k});setUnlock(null);return;}
    setUnlock(k);
    if(k==='t5')setTimeout(()=>revRef.current&&revRef.current.focus(),60);
  };
  const onFile=e=>{
    const file=e.target.files&&e.target.files[0];e.target.value='';
    if(!file)return;
    const rd=new FileReader();
    rd.onload=()=>{const im=new Image();im.onload=()=>{
      const s=Math.min(1,900/Math.max(im.width,im.height)),c=document.createElement('canvas');
      c.width=Math.round(im.width*s);c.height=Math.round(im.height*s);
      c.getContext('2d').drawImage(im,0,0,c.width,c.height);
      const url=c.toDataURL('image/jpeg',.85);
      setF(o=>({...o,photos:[...o.photos,url].slice(0,4)}));
    };im.src=rd.result;};
    rd.readAsDataURL(file);
  };
  const UNLOCK_TXT={t3:'照 Shopee 闪购页填真实的结束时间和已抢进度。',t4:'写你和朋友真实聊过的话，不要编。',t5:'在下面「买家真实评价」贴一条买家原话。',t8:'在「照片」加满 4 张（现在 '+n+' 张）。'};
  return (<div className="ed">
    <div className="ed-top">
      <button className="back" onClick={()=>onBack(d.id,f)}>‹ 返回</button>
      <b className="tt">{d.status==='approved'?'已批准的草稿':'编辑草稿'}</b>
      <span className={'chip '+p.strat}>{RV.STRATS[p.strat].zh}</span>
    </div>
    <div className="rv-scroll"><div className="ed-grid">
      <div className="ed-pv">
        <RvPoster info={info} fallback={p.img} dirty={dirty} onRetry={()=>onRetryPoster(d.id)}/>
        <div className="ed-meta">
          <h3 className="nm">{p.name}</h3>
          <RvPriceRow p={p}/>
          <div className="cm"><b>{RV.commOf(p)}</b></div>
          {pc&&<div className="warn"><b>价格变了</b> {pc.from} → {pc.to}（{pc.fromPct} → {pc.toPct}）。海报已按新价格更新。</div>}
          {desk&&<button className="btn btn-ghost btn-sm" onClick={()=>onToast('真实后台会在新标签页打开 Studio，并载入这张草稿')}>在 Studio 精修 ↗</button>}
        </div>
      </div>
      <div className="ed-form">
        <section className="sec">
          <div className="sec-h"><span className="ic">🎨</span><h2>模板</h2><span className="tip">自动选：{RV.TPL[d.autoTpl]}</span></div>
          <div className="tps">{RV.TPL_ORDER.map(k=>{const lock=!av[k];return (
            <button key={k} className={'tp'+(lock?' lock':'')} aria-pressed={f.tpl===k} onClick={()=>pick(k)}>
              <b>{lock?'🔒 ':''}{RV.TPL[k]}</b><span>{lock?RV.TPL_LOCK[k]:k===d.autoTpl?'自动推荐':RV.TPL_NOTE[k]}</span>
            </button>);})}</div>
          {unlock&&<div className="unlock">
            {av[unlock]?<div className="uh ok">可以用了 · 点上面的「{RV.TPL[unlock]}」</div>:<div className="uh">{UNLOCK_TXT[unlock]}</div>}
            {unlock==='t3'&&<div className="u2">
              <div className="field"><label>结束时间</label><input type="time" value={f.flash.end} onChange={e=>upd({flash:{...f.flash,end:e.target.value}})}/></div>
              <div className="field"><label>已抢 %</label><input type="text" inputMode="numeric" maxLength={2} placeholder="82" value={f.flash.pct} onChange={e=>upd({flash:{...f.flash,pct:e.target.value.replace(/\D/g,'')}})}/></div>
            </div>}
            {unlock==='t4'&&[['m1','朋友问','例：上次你说的那个还有货吗？'],['m2','你的回复（配产品照片）','例：有！Shopee 现在 RM 19.90'],['m3','朋友反应','例：快发我链接']].map(([k,l,ph])=>(
              <div className="field" key={k}><label>{l}</label><input type="text" maxLength={40} placeholder={ph} value={f.chat[k]} onChange={e=>upd({chat:{...f.chat,[k]:e.target.value}})}/></div>))}
          </div>}
        </section>
        <section className="sec">
          <div className="sec-h"><span className="ic">✍️</span><h2>标题</h2></div>
          <div className="field"><label>主标题 <span className="soft">Enter 换行</span></label><textarea rows={2} value={f.l1} onChange={e=>upd({l1:e.target.value})}></textarea></div>
          <div className="field"><label>副标题</label><input type="text" value={f.l2} onChange={e=>upd({l2:e.target.value})}/></div>
          <div className="field"><label>换一个 <span className="soft">按商品数据{f.used?' · 含亲测款':''}</span></label>
            <div className="hooks">{RV.suggest(p,f.used).map(([a,b])=><button key={a} onClick={()=>upd({l1:a,l2:b})}>{a.replace(/\n/g,' ')}</button>)}</div>
          </div>
        </section>
        <section className="sec">
          <div className="sec-h"><span className="ic">📷</span><h2>照片</h2><span className="tip">{n} 张 · {RV.LAYOUT[n]}</span></div>
          <div className="phs">{[0,1,2,3].map(i=>{
            const src=f.photos[i];
            if(src)return (<div key={i} className="ph on" style={{backgroundImage:'url('+src+')'}}>{i===0?<span className="tag">Shopee</span>:<button className="x" aria-label="移除这张" onClick={()=>setF(o=>({...o,photos:o.photos.filter((_,j)=>j!==i)}))}>×</button>}</div>);
            if(i===n)return (<button key={i} className="ph add" aria-label="加照片" onClick={()=>fileRef.current&&fileRef.current.click()}>＋</button>);
            return (<div key={i} className="ph"></div>);
          })}</div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile}/>
          <div className="hint">第 1 张是 Shopee 商品图。加照片会自动换排版：2 张双图、3 张三图、4 张四宫格。</div>
        </section>
        <section className="sec">
          <div className="toggle-row"><label>我用过这个 <span className="soft">打开后标题和文案可以写亲身体验</span></label><button className="toggle" aria-label="我用过这个" aria-pressed={f.used} onClick={()=>upd({used:!f.used})}></button></div>
        </section>
        <section className="sec">
          <div className="sec-h"><span className="ic">⭐</span><h2>买家真实评价</h2><span className="tip">填了才能用「真实好评」</span></div>
          <div className="field"><textarea ref={revRef} rows={2} maxLength={80} placeholder="从 Shopee 评价区复制一条买家原话" value={f.review.quote} onChange={e=>upd({review:{...f.review,quote:e.target.value}})}></textarea></div>
          <div className="field"><label>署名</label><input type="text" maxLength={16} placeholder="— Shopee 买家" value={f.review.author} onChange={e=>upd({review:{...f.review,author:e.target.value}})}/></div>
        </section>
        <section className="sec">
          <div className="sec-h"><span className="ic">💬</span><h2>Facebook 文案</h2>
            {(f.cap1Manual||f.cap2Manual)&&<button className="btn btn-ghost btn-sm" style={{marginLeft:'auto'}} onClick={()=>setF(o=>({...o,cap1Manual:false,cap2Manual:false,cap1:RV.cap1({...d,...o}),cap2:RV.cap2(d)}))}>↻ 重新生成</button>}
          </div>
          <div className="field"><label>① 帖子</label><textarea rows={8} value={f.cap1} onChange={e=>setF(o=>({...o,cap1:e.target.value,cap1Manual:true}))}></textarea></div>
          <div className="field"><label>② 第一条评论 <span className="soft">发帖后自动发，带链接</span></label><textarea rows={3} value={f.cap2} onChange={e=>setF(o=>({...o,cap2:e.target.value,cap2Manual:true}))}></textarea></div>
        </section>
      </div>
    </div></div>
    <div className="ed-bar">
      <button className={'btn btn-ghost'+(dirty?' hot':'')} disabled={busy} onClick={()=>onCommit(d.id,f)}>{busy?'生成中…':'↻ 重新生成海报'}</button>
      <button className="btn btn-primary" disabled={busy} onClick={()=>onApprove(d.id,f)}>{d.status==='approved'?'保存修改':'批准'}</button>
    </div>
  </div>);
}
Object.assign(window,{RvEdit});
