// Atlas v2 — Direction C: Terminal Density (extreme density grid)

const C_Terminal = () => (
  <div className="atlas">
    {/* Custom topbar */}
    <div style={{height: 28, display: 'flex', alignItems: 'center', gap: 14, padding: '0 12px', background: 'var(--bg-1)', borderBottom: '1px solid var(--line-1)', fontFamily: 'var(--mono)', fontSize: 10}}>
      <span className="amber" style={{fontWeight: 700, letterSpacing: '0.2em'}}>ATLAS//4</span>
      <span className="dim-3">F1·MAP</span>
      <span className="dim-3">F2·LIST</span>
      <span className="dim-3">F3·OWN</span>
      <span className="dim-3">F4·COMP</span>
      <span className="dim-3">F5·PIPE</span>
      <span className="dim-3">F6·ALERT</span>
      <span className="dim-3">F7·NEWS</span>
      <span className="dim-3">F8·FIN</span>
      <span style={{flex: 1}}/>
      <span className="dim-2"><span className="live-dot"/>12 feeds · 14:22:08 EDT · uptime 142d · USD/SF</span>
    </div>

    <div style={{flex: 1, display: 'grid', gridTemplateColumns: '1.1fr 1.5fr 1.1fr', gridTemplateRows: '1.1fr 1fr 1fr', gap: 1, background: 'var(--line-0)', minHeight: 0}}>

      {/* TL — movers */}
      <Pane title="HOT LIST · MOVERS 24H" sub="248 mkt · 12 watch">
        <table className="tbl" style={{fontSize: 10}}>
          <thead><tr><th>tkr</th><th>asset</th><th className="num">$/sf</th><th className="num">Δ%</th><th className="num">vol</th><th>spk</th></tr></thead>
          <tbody>
            {[
              ['BRN488','488 Brannan','748','+2.1','12k','up'],
              ['FOL633','633 Folsom','812','+4.2','8k','up'],
              ['MIS350','350 Mission','840','+3.0','42k','up'],
              ['HAW01','1 Hawthorne','1182','+2.8','—','up'],
              ['TWN215','215 Townsend','702','+1.4','—','up'],
              ['HAR600','600 Harrison','498','+1.0','—','up'],
              ['SEC85','85 2nd St','719','+0.6','—','up'],
              ['MIS101','101 Mission','764','+0.4','—','up'],
              ['BRN301','301 Brannan','782','+0.8','—','up'],
              ['MKT1455','1455 Market','612','-0.8','18k','dn'],
              ['SPR188','188 Spear','802','-0.3','—','dn'],
              ['TWN650','650 Townsend','682','-1.2','—','dn'],
              ['FRM199','199 Fremont','892','+0.2','—','flat'],
              ['MMS140','140 Newmnt','840','+1.8','6k','up'],
              ['MAR1','1 Market','922','+0.4','—','up'],
            ].map((r, i) => (
              <tr key={i} className={i === 0 ? 'on' : ''}>
                <td className="ticker">{r[0]}</td>
                <td>{r[1]}</td>
                <td className="num">{r[2]}</td>
                <td className={"num " + (r[3].startsWith('-') ? 'warn' : r[3].startsWith('+0.0') ? 'dim-2' : 'good')}>{r[3]}</td>
                <td className="num dim-3">{r[4]}</td>
                <td><Sparkline width={48} height={14} data={r[5] === 'up' ? [2,3,4,4,5,6,7,8,9,10] : r[5] === 'dn' ? [9,8,8,7,6,7,5,4,4,3] : [5,5,6,5,5,6,5,6,5,5]}
                  color={r[5] === 'up' ? 'var(--good)' : r[5] === 'dn' ? 'var(--warn)' : 'var(--ink-3)'} filled={false} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Pane>

      {/* TM — Map (spans 2 rows) */}
      <Pane title="MAP · SF · BAY · LIVE" sub="parcel + heat + permits + comps" rowSpan={2}>
        <div style={{flex: 1, display: 'flex', minHeight: 0}}>
          <AtlasMap layers={{parcel: true, heat: true, roads: true, topo: true}}>
            <div style={{position: 'absolute', top: 8, left: 8, display: 'flex', gap: 4}}>
              <span className="chip on">SoMa</span>
              <span className="chip">FiDi</span>
              <span className="chip">Mission Bay</span>
              <span className="chip">+</span>
            </div>
          </AtlasMap>
        </div>
      </Pane>

      {/* TR — order book */}
      <Pane title="OPPORTUNITY BOOK · BID/ASK" sub="off + on market · weighted">
        <table className="tbl" style={{fontSize: 10}}>
          <thead><tr><th>asset</th><th className="num">ask</th><th className="num">bid</th><th className="num">spr%</th><th>stage</th><th>days</th></tr></thead>
          <tbody>
            {[
              ['488 Brannan','785','740','5.7','listed','12'],
              ['215 Townsend','720','690','4.2','off-mkt','—'],
              ['1455 Market','640','580','9.4','listed','42'],
              ['Bishop Rch B','620','590','4.8','off-mkt','—'],
              ['Pier 70 B12','1100','1050','4.6','tour','3'],
              ['Coronado Sq','540','510','5.6','LOI','7'],
              ['Sunset Log','480','465','3.1','PSA','2'],
              ['Grand & 9th','410','370','9.8','listed','58'],
              ['SF Design','680','630','7.4','tour','9'],
              ['Embar 1','1240','1180','4.8','—','—'],
              ['MM 2','920','880','4.3','off-mkt','—'],
              ['Folsom 4','590','555','5.9','listed','22'],
              ['Bryant 280','520','485','6.7','listed','31'],
            ].map((r, i) => (
              <tr key={i}>
                <td>{r[0]}</td>
                <td className="num">{r[1]}</td>
                <td className="num">{r[2]}</td>
                <td className={"num " + (parseFloat(r[3]) > 6 ? 'warn' : '')}>{r[3]}</td>
                <td className="dim-2">{r[4]}</td>
                <td className="num dim-3">{r[5]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Pane>

      {/* ML — alerts */}
      <Pane title="ALERTS · LIVE" sub="14 unread">
        <div className="scroll" style={{padding: '4px 0'}}>
          {[
            ['12:04', 'hot', 'PERMIT', '2900 16th St · 84u MFR'],
            ['11:41', 'good', 'COMP', '633 Folsom · $812/sf'],
            ['11:22', 'warn', 'LEASE', '488 Brannan · 18.8k roll'],
            ['10:59', 'warn', 'TAX', 'mission bay reval +12%'],
            ['10:18', 'amber', 'OWNER', '215 Townsend · UCC mod'],
            ['09:42', 'good', 'TRANS', 'muni 22-fillmore plan'],
            ['09:02', '', 'FILING', 'Hines 10-Q · disposition'],
            ['08:30', 'warn', 'CRIME', 'SoMa · +18% wow'],
            ['08:01', '', 'NEWS', 'Stripe lease · 7th St'],
            ['07:42', '', 'COMP', '350 Mission · cap 5.2%'],
            ['07:18', 'amber', 'PERMIT', '199 Fremont · TI'],
            ['06:55', '', 'OWNER', 'KKR · acquisition close'],
            ['06:22', '', 'NEWS', 'Bisnow · vacancy 36.2%'],
          ].map((r, i) => (
            <div key={i} style={{display: 'grid', gridTemplateColumns: '40px 14px 38px 1fr', gap: 6, padding: '2.5px 10px', fontSize: 10.5, fontFamily: 'var(--mono)', alignItems: 'baseline', borderBottom: '1px solid var(--line-0)'}}>
              <span className="dim-3">{r[0]}</span>
              <span className={"sig " + r[1]} />
              <span className="dim-3" style={{fontSize: 9, letterSpacing: '0.1em'}}>{r[2]}</span>
              <span style={{color: r[1] === 'hot' ? 'var(--hot)' : r[1] === 'warn' ? 'var(--warn)' : 'var(--ink-1)'}}>{r[3]}</span>
            </div>
          ))}
        </div>
      </Pane>

      {/* MR — tenants */}
      <Pane title="TENANT ROSTER · 488 BRANNAN" sub="14 tenants · 1 vacant block">
        <table className="tbl" style={{fontSize: 10}}>
          <thead><tr><th>tenant</th><th className="num">sqft</th><th>industry</th><th>exp</th><th>cred</th></tr></thead>
          <tbody>
            {[
              ['Stripe Inc','18.4k','fintech','27Q3','AA'],
              ['Notion Labs','9.1k','saas','26Q1','A'],
              ['Figma','6.2k','saas','28Q2','AA'],
              ['Brex','5.8k','fintech','26Q4','A'],
              ['Mercury','4.2k','fintech','27Q1','BBB'],
              ['Linear','3.1k','saas','26Q2','A'],
              ['Retool','2.8k','saas','28Q4','A'],
              ['Glow Cap','2.4k','finance','27Q2','A'],
              ['Hex','2.1k','saas','26Q3','BBB'],
              ['Numeral','1.9k','fintech','28Q1','BBB'],
              ['Posthog','1.4k','saas','27Q4','BBB'],
              ['—vacant—','18.8k','—','—','—'],
            ].map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={j === 1 ? 'num' : ''} style={r[0].includes('vacant') ? {color: 'var(--warn)'} : {}}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Pane>

      {/* BL — chart */}
      <Pane title="SOMA $/SF · 5Y · A vs B" sub="rolling, weighted">
        <div style={{padding: 8, height: '100%'}}>
          <TimeSeries height={140} xLabels={['21','22','23','24','25','now']}
            series={[
              { data: [520,548,602,684,712,748], color: 'var(--amber)', fill: true },
              { data: [488,498,558,628,648,684], color: 'var(--cyan)', fill: false, weight: 0.9 },
              { data: [612,640,665,712,718,694], color: 'var(--ink-3)', fill: false, dashed: true, weight: 0.8 },
            ]}
          />
        </div>
      </Pane>

      {/* BM — pipeline */}
      <Pane title="PIPELINE · $1.24B AUM TARGET Q3" sub="6 stages · 128 deals">
        <div style={{padding: '8px 10px', fontSize: 10, fontFamily: 'var(--mono)'}}>
          {[
            ['SCREEN', 84, 'var(--ink-3)', '$2.1B'],
            ['LOI',    22, 'var(--ink-2)', '$680M'],
            ['TOUR',   12, 'var(--cyan)',  '$420M'],
            ['DD',      6, 'var(--amber)', '$280M'],
            ['PSA',     3, 'var(--good)',  '$184M'],
            ['CLOSE',   1, 'var(--good)',  '$142M'],
          ].map(([s,n,c,v], i) => (
            <div key={i} style={{display: 'grid', gridTemplateColumns: '52px 24px 1fr 56px', gap: 6, alignItems: 'center', padding: '2.5px 0'}}>
              <span className="t-eyebrow">{s}</span>
              <span className="t-num" style={{textAlign: 'right'}}>{n}</span>
              <div style={{height: 12, background: 'var(--bg-3)', position: 'relative', overflow: 'hidden'}}>
                <div style={{position: 'absolute', inset: 0, width: `${(n/84)*100}%`, background: c, opacity: 0.7}}/>
              </div>
              <span className="t-num dim-2" style={{textAlign: 'right', fontSize: 9.5}}>{v}</span>
            </div>
          ))}
          <div style={{borderTop: '1px solid var(--line-1)', marginTop: 8, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 9.5}}>
            <span className="t-eyebrow">next milestones</span>
            <span className="dim-1">⏵ <span className="amber">04-30</span> PSA · 215 Townsend · $84M</span>
            <span className="dim-1">⏵ <span className="amber">05-12</span> CLOSE · Sunset Log · $142M</span>
            <span className="dim-1">⏵ <span className="dim-3">05-21</span> TOUR · Pier 70 B12 · $310M</span>
            <span className="dim-1">⏵ <span className="dim-3">06-02</span> LOI exp · Coronado · $112M</span>
          </div>
        </div>
      </Pane>

      {/* BR — news */}
      <Pane title="NEWS · TAGGED" sub="11 sources · 24h">
        <div className="scroll" style={{padding: '4px 0', fontFamily: 'var(--mono)', fontSize: 10}}>
          {[
            ['Bisnow', '04-27', 'SF office availability hits 36.2%, ticks up vs Q1'],
            ['SF Biz', '04-27', 'Hines weighing sale of three SoMa towers'],
            ['Reuters','04-26', 'BREP IX restructures debt on three coastal assets'],
            ['CoStar', '04-26', 'Mission Bay rents +6.4% YoY, supply tightening'],
            ['SFCh',   '04-25', 'New zoning overlay clears 16th St corridor'],
            ['WSJ',    '04-25', 'Class-A SoMa cap rates compress 18bp this quarter'],
            ['Bloom',  '04-24', 'KKR closes $4.2B opportunity vehicle, eyes west'],
            ['REJ',    '04-23', 'Pier 70 phase 2 entitlements approved'],
            ['SFCh',   '04-22', 'Caltrain DTX funding clears senate committee'],
            ['Bisnow', '04-21', 'Stripe sublease listings spike across SoMa'],
          ].map((r, i) => (
            <div key={i} style={{display: 'grid', gridTemplateColumns: '50px 38px 1fr', gap: 6, padding: '2px 10px', alignItems: 'baseline', borderBottom: '1px solid var(--line-0)'}}>
              <span className="dim-3" style={{fontSize: 9, letterSpacing: '0.1em'}}>{r[0]}</span>
              <span className="dim-3" style={{fontSize: 9}}>{r[1]}</span>
              <span className="dim-1">{r[2]}</span>
            </div>
          ))}
        </div>
      </Pane>
    </div>
  </div>
);

const Pane = ({ title, sub, children, rowSpan }) => (
  <div style={{
    background: 'var(--bg-1)',
    display: 'flex', flexDirection: 'column',
    gridRow: rowSpan ? `span ${rowSpan}` : undefined,
    overflow: 'hidden',
    minHeight: 0
  }}>
    <div style={{height: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 10px', background: 'var(--bg-2)', borderBottom: '1px solid var(--line-1)', fontFamily: 'var(--mono)', flex: '0 0 auto'}}>
      <span style={{fontSize: 9, letterSpacing: '0.16em', color: 'var(--amber)', fontWeight: 700}}>{title}</span>
      {sub && <span style={{fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.1em'}}>{sub}</span>}
    </div>
    <div style={{flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative'}}>{children}</div>
  </div>
);

window.C_Terminal = C_Terminal;
