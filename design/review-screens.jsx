/* LEE 带货后台 — screens: queue, log, stats, login, nav */
const rvBag=size=>(<svg viewBox="0 0 24 24" fill="none" width={size} height={size} aria-hidden="true"><path d="M5 7h14l-1 13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 7z" stroke="#fff" strokeWidth="2" strokeLinejoin="round"></path><path d="M9 7a3 3 0 0 1 6 0" stroke="#fff" strokeWidth="2" strokeLinecap="round"></path></svg>);

function RvPoster({info,fallback,dirty,onRetry}){
  const src=info&&info.src,busy=!info||!!info.busy,err=!!(info&&info.err&&!info.busy);
  return (<div className={'pvw'+(src?'':' raw')}>
    <img src={src||fallback} alt=""/>
    {busy&&<div className="pv-over"><i className="spin"></i><span>{src?'重新生成中…':'生成海报中…'}</span></div>}
    {err&&<div className="pv-over"><span>海报没生成出来</span>{onRetry&&<button className="btn btn-ghost btn-sm" onClick={e=>{e.stopPropagation();onRetry();}}>重试</button>}</div>}
    {dirty&&!busy&&<div className="pv-dirty">有改动 · 点下面「重新生成海报」</div>}
  </div>);
}

function RvPriceRow({p}){
  return (<div className="pr"><span className="now">{RV.rm(p.price)}</span>{p.disc>=10&&<span className="pct">-{p.disc}%</span>}<span className="rt"><b>★{p.rating.toFixed(1)}</b> · {RV.fmtSold(p.sales)}</span></div>);
}

function RvCard({d,info,onApprove,onSkip,onEdit,onRetryPoster}){
  const p=d.p,pc=d.priceChanged;
  return (<article className="card">
    <div className="pv" role="button" tabIndex={0} onClick={()=>onEdit(d.id)}>
      <RvPoster info={info} fallback={p.img} onRetry={()=>onRetryPoster(d.id)}/>
      <div className="chips"><span className={'chip '+p.strat}>{RV.STRATS[p.strat].zh}</span>{d.isNew&&<span className="chip new">新</span>}</div>
    </div>
    <div className="bd">
      {pc&&<div className="warn"><b>价格变了</b> {pc.from} → {pc.to}（{pc.fromPct} → {pc.toPct}）。海报已按新价格更新，确认后再批准。</div>}
      <h3 className="nm">{p.name}</h3>
      <RvPriceRow p={p}/>
      <div className="cm"><b>{RV.commOf(p)}</b> · {RV.TPL[d.tpl]}</div>
      <div className="act">
        <button className="btn btn-ghost" onClick={()=>onSkip(d.id)}>跳过</button>
        <button className="btn btn-ghost" onClick={()=>onEdit(d.id)}>编辑</button>
        <button className="btn btn-primary" onClick={()=>onApprove(d.id)}>批准</button>
      </div>
    </div>
  </article>);
}

function RvQueue({drafts,posters,paused,collecting,onCollect,onApprove,onSkip,onEdit,onUnapprove,onRetryToken,onRetryPoster}){
  const pending=drafts.filter(d=>d.status==='draft');
  const approved=drafts.filter(d=>d.status==='approved').sort((a,b)=>a.approvedAt-b.approvedAt);
  const sl=RV.slotsFor(approved.length);
  return (<>
    <header className="rv-head">
      <div className="grow">
        <h1>待审核{pending.length>0&&<span className="cnt">{pending.length}</span>}</h1>
        <div className={'hsub'+(collecting?' busy':'')}>{collecting||'10月10日 周六 · 08:00 抓了 6 个新品'}</div>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={onCollect} disabled={!!collecting}>↻ 抓取</button>
    </header>
    <div className="rv-scroll">
      {paused&&<div className="alert"><div className="at"><b>发布已暂停</b><p>Facebook token 失效（错误 190）。到 Meta 重新生成 Page token，更新到服务器设置后点「重试」。批准的帖子会继续排队。</p></div><button className="btn btn-sm" onClick={onRetryToken}>重试</button></div>}
      <div className="slots">{RV.SLOTS.map((s,i)=>{
        const d=approved[i];
        return (<div key={s.t} className={'slot '+(paused?'paused':d?'filled':'empty')} role={d?'button':undefined} onClick={d?()=>onEdit(d.id):undefined}>
          <div className="st"><b>{s.t}</b><span>{paused?'暂停':d?'约 '+s.at+' 发':'今天'}</span></div>
          <div className="sn">{d&&<i></i>}<span>{d?RV.shortName(d.p.name):'空，批准一张就排进来'}</span></div>
        </div>);
      })}</div>
      {pending.length?<div className="list">{pending.map(d=><RvCard key={d.id} d={d} info={posters[d.id]} onApprove={onApprove} onSkip={onSkip} onEdit={onEdit} onRetryPoster={onRetryPoster}/>)}</div>
        :<div className="empty"><b>今天的都处理完了</b><p>明天 08:00 自动抓新品，也可以现在抓一次。</p><button className="btn btn-ghost btn-sm" onClick={onCollect} disabled={!!collecting}>↻ 现在抓取</button></div>}
      {approved.length>0&&<>
        <div className="lbl">已批准 · 排队中 · {approved.length}</div>
        <div className="qlist">{approved.map((d,i)=>(<div className="qrow" key={d.id}>
          <img src={(posters[d.id]&&posters[d.id].src)||d.p.img} alt=""/>
          <button className="qt" onClick={()=>onEdit(d.id)}><b>{RV.shortName(d.p.name)}</b><span>✓ {sl[i].label} 发布</span></button>
          <button className="btn btn-ghost btn-sm" onClick={()=>onUnapprove(d.id)}>撤回</button>
        </div>))}</div>
      </>}
      <div className="endpad"></div>
    </div>
  </>);
}

const RV_LOG_ST={posted:'已发布',failed:'失败',returned:'退回'};
function RvLog({log,onRetry,onToast}){
  return (<>
    <header className="rv-head"><div className="grow"><h1>已发布</h1><div className="hsub">每条链接都带 sub ID，用来统计哪个模板卖得好</div></div></header>
    <div className="rv-scroll">
      {log.map(g=>(<section key={g.day}>
        <div className="lbl">{g.day}</div>
        <div className="lgc">{g.items.map(it=>(<div key={it.id} className={'lg '+it.kind}>
          <img src={it.img} alt=""/>
          <div className="lt">
            <div className="l1"><span className={'st '+it.kind}>{RV_LOG_ST[it.kind]}</span><b>{it.time}</b>{it.tpl&&<span className="mt">{RV.TPL[it.tpl]} · {RV.STRATS[it.strat].zh}</span>}</div>
            <div className="nm">{it.name}</div>
            {it.msg&&<div className="msg">{it.msg}</div>}
            {it.sub&&<code>{it.sub}</code>}
          </div>
          <div className="la">
            {it.kind==='posted'&&<a href="#" onClick={e=>{e.preventDefault();onToast('真实后台会打开这条 Facebook 帖子');}}>查看 ↗</a>}
            {it.kind==='failed'&&<button className="btn btn-ghost btn-sm" disabled={!!it.retrying} onClick={()=>onRetry(it.id)}>{it.retrying?'重试中…':'重试'}</button>}
          </div>
        </div>))}</div>
      </section>))}
      <div className="endpad"></div>
    </div>
  </>);
}

function RvStats(){
  const [r,setR]=React.useState('7');
  const s=RV.STATS[r];
  const bars=(rows,strat)=>{
    const mx=Math.max(...rows.map(x=>x[3]));
    return (<div className="bars">{rows.map(([k,n,o,c])=>(<div className="br" key={k}>
      <div className="bl"><span className={strat?'chip '+k:'tn'}>{n}</span><span className="bo">{o} 单</span><b>{RV.rm(c)}</b></div>
      <div className="bt"><i className={strat?k:''} style={{width:(c/mx*100)+'%'}}></i></div>
    </div>))}</div>);
  };
  return (<>
    <header className="rv-head">
      <div className="grow"><h1>数据</h1><div className="hsub">Shopee 转化报告 · 每周一更新 · 上次 10月6日</div></div>
      <div className="seg seg-mini">{[['7','7 天'],['30','30 天']].map(([k,l])=><button key={k} aria-pressed={r===k} onClick={()=>setR(k)}>{l}</button>)}</div>
    </header>
    <div className="rv-scroll">
      <div className="kpis">
        <div className="kpi"><b>{s.posts}</b><span>帖子</span></div>
        <div className="kpi"><b>{s.orders}</b><span>订单</span></div>
        <div className="kpi"><b><small>RM</small>{s.comm.toFixed(2)}</b><span>佣金</span></div>
      </div>
      <div className="lbl">按策略</div>{bars(s.strat,true)}
      <div className="lbl">按模板</div>{bars(s.tpl,false)}
      <div className="endpad"></div>
    </div>
  </>);
}

function RvLogin({onLogin}){
  const [pw,setPw]=React.useState('');
  const [err,setErr]=React.useState('');
  return (<div className="login">
    <div className="lg-logo">{rvBag(30)}</div>
    <h1>LEE 带货后台</h1>
    <p className="lg-sub">Shopee 好物自动做图，你批准了才发到 Facebook 专页。</p>
    <form onSubmit={e=>{e.preventDefault();if(!pw.trim()){setErr('请输入密码');return;}onLogin();}}>
      <div className="field"><label>密码</label><input type="password" value={pw} placeholder="后台密码" onChange={e=>{setPw(e.target.value);setErr('');}}/></div>
      {err&&<div className="ferr">{err}</div>}
      <button className="btn btn-primary" type="submit">登录</button>
    </form>
    <div className="hint">连续输错 5 次锁 15 分钟。登录后 30 天内不用再输入。</div>
  </div>);
}

const RV_TABS=[['queue','待审核'],['log','已发布'],['stats','数据']];
function RvTabButtons({tab,setTab,count}){
  return RV_TABS.map(([k,l])=>(<button key={k} role="tab" className="tab" aria-selected={tab===k} onClick={()=>setTab(k)}>{l}{k==='queue'&&count>0&&<span className="bdg">{count}</span>}</button>));
}
function RvTabs(props){return (<nav className="tabs" role="tablist"><RvTabButtons {...props}/></nav>);}
function RvTopNav(props){
  return (<div className="topnav"><div className="tn-brand"><span className="tn-logo">{rvBag(18)}</span><b>LEE 带货后台</b></div><nav role="tablist"><RvTabButtons {...props}/></nav></div>);
}
function RvToast({t,onUndo}){
  if(!t)return null;
  return (<div className="toast" key={t.id}><span>{t.msg}</span>{t.undo&&<button onClick={onUndo}>撤销</button>}</div>);
}

Object.assign(window,{rvBag,RvPoster,RvPriceRow,RvCard,RvQueue,RvLog,RvStats,RvLogin,RvTabs,RvTopNav,RvToast});
