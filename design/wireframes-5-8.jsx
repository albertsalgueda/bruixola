// Wireframes 5-8

// ─────────────────────────────────────────────────────────────
// W5 — Alerts inbox / triage workflow framing
// ─────────────────────────────────────────────────────────────
const W5_AlertsInbox = () => (
  <div className="wf">
    <TopBar crumbs={["alerts", "triage-queue"]} right={<><span className="pill warn">14 unread</span><span className="pill">live</span><span className="dim">analyst@atlas</span></>} />
    <div style={{display: 'flex', height: 'calc(100% - 28px)'}}>
      <LeftRail active={3} />
      {/* inbox list */}
      <div style={{width: 320, borderRight: '1px solid var(--line)', background: 'var(--panel)', display: 'flex', flexDirection: 'column'}}>
        <div style={{padding: 8, borderBottom: '1px solid var(--line)', display: 'flex', gap: 6, fontSize: 10}}>
          <span className="tag" style={{borderColor: 'var(--accent)', color: 'var(--accent)'}}>all · 14</span>
          <span className="tag">permits · 5</span>
          <span className="tag">comps · 4</span>
          <span className="tag">leases · 3</span>
          <span className="tag">filings · 2</span>
        </div>
        <div style={{flex: 1, overflow: 'hidden'}}>
          {[
            ['warn', 'PERMIT', '12:04', '2900 16th St', 'demo + 84 unit MFR · adj. to your watchlist', true],
            ['acc',  'COMP',   '11:41', '633 Folsom · sold $812/sf', 'comp resets SoMa class-B · ~4% above your est', true],
            ['',     'LEASE',  '10:18', '488 Brannan · 18.8k roll', 'Stripe sublease listed · 27% under asking', true],
            ['acc',  'OWNER',  '09:02', '215 Townsend · UCC filing', 'BREP IX → debt mod · refi signal', false],
            ['',     'FILING', '08:30', 'Hines · 10-Q', '"considering disposition of non-core SF assets"', false],
            ['warn', 'TAX',    'yest.', 'Assessor reval · Mission Bay', '14 parcels reassessed · +12% avg', false],
            ['',     'COMP',   'yest.', '350 Mission · cap reset 5.2%', '', false],
          ].map((r, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '8px 48px 1fr', gap: 6,
              padding: '6px 8px', fontSize: 10.5,
              borderBottom: '1px dashed var(--line)',
              background: i === 0 ? 'var(--panel-2)' : undefined,
              borderLeft: i === 0 ? '2px solid var(--accent)' : '2px solid transparent',
              opacity: r[5] ? 1 : 0.62,
            }}>
              <span className={r[0]}>{r[0] ? '●' : '○'}</span>
              <span className="faint up" style={{fontSize: 9}}>{r[1]}</span>
              <div>
                <div style={{display: 'flex', justifyContent: 'space-between'}}>
                  <span style={{fontWeight: 500}}>{r[3]}</span>
                  <span className="faint" style={{fontSize: 9}}>{r[2]}</span>
                </div>
                <div className="dim" style={{fontSize: 10}}>{r[4]}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* alert detail */}
      <div style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
        <div style={{padding: 10, borderBottom: '1px solid var(--line)', background: 'var(--panel)'}}>
          <div className="up accent" style={{fontSize: 9}}>PERMIT · open · since 12:04</div>
          <div className="sans" style={{fontSize: 18, fontWeight: 500, marginTop: 2}}>2900 16th St · demolition + 84-unit MFR</div>
          <div className="dim" style={{fontSize: 11, marginTop: 2}}>Mission · APN 3554-002 · DBI-2026-04-1182 · 0.3mi from <span className="accent">488 Brannan (watchlist)</span></div>
          <div style={{display: 'flex', gap: 6, marginTop: 8}}>
            <span className="btn acc">acknowledge</span>
            <span className="btn">→ create deal</span>
            <span className="btn">→ add to watchlist</span>
            <span className="btn">snooze 7d</span>
            <span className="btn">dismiss</span>
          </div>
        </div>
        <div style={{flex: 1, display: 'grid', gridTemplateColumns: '1.2fr 1fr'}}>
          <div style={{borderRight: '1px solid var(--line)', position: 'relative'}}>
            <FauxMap style={{height: '100%'}}>
              <Annot style={{left: '40%', top: '20%'}}>impact ring 0.5mi</Annot>
            </FauxMap>
          </div>
          <div style={{padding: 10, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto'}}>
            <div>
              <div className="up faint" style={{fontSize: 9}}>Why this matters</div>
              <div className="hand dim" style={{fontSize: 13, lineHeight: 1.4, marginTop: 2}}>
                Owner of adjacent 488 Brannan has 22% vacancy and Stripe sublease pending. New supply within 0.3mi could pressure rents 4–7% per scenario A.
              </div>
            </div>
            <div>
              <div className="up faint" style={{fontSize: 9, marginBottom: 4}}>Affected watchlist</div>
              {['488 Brannan St','215 Townsend','1 Hawthorne'].map(t => (
                <div key={t} style={{display: 'flex', justifyContent: 'space-between', fontSize: 10.5, padding: '2px 0', borderBottom: '1px dashed var(--line)'}}>
                  <span>{t}</span><span className="warn">−4.2%</span>
                </div>
              ))}
            </div>
            <div>
              <div className="up faint" style={{fontSize: 9, marginBottom: 4}}>Activity stream · APN 3554-002</div>
              {['2026-04-27 · permit filed','2025-11-12 · zoning variance approved','2024-06-08 · sold $24M ($340/sf land)','2023-02-14 · listing pulled'].map(t=>(
                <div key={t} style={{fontSize: 10.5, padding: '1px 0', color: 'var(--ink-dim)'}}>· {t}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// W6 — KPI-first ops cockpit (portfolio monitor)
// ─────────────────────────────────────────────────────────────
const W6_KPICockpit = () => (
  <div className="wf">
    <TopBar crumbs={["portfolio", "us-west · q2-2026"]} />
    <div style={{display: 'flex', height: 'calc(100% - 28px)'}}>
      <LeftRail active={4} />
      <div style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
        {/* KPI strip */}
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', borderBottom: '1px solid var(--line)', background: 'var(--panel)'}}>
          <KPI label="Portfolio NOI · ttm" value="$284.1M" delta="+3.2% qoq" deltaClass="good" />
          <KPI label="Occupancy" value="91.4%" delta="−0.8pt qoq" deltaClass="warn" />
          <KPI label="WALT" value="4.7y" delta="−0.1y" deltaClass="warn" />
          <KPI label="Cap rate · est" value="5.62%" delta="+12bp" deltaClass="warn" />
          <KPI label="Debt / value" value="48%" delta="flat" deltaClass="dim" />
          <KPI label="Risk score" value="62" delta="3 alerts" deltaClass="warn" />
        </div>
        <div style={{flex: 1, display: 'grid', gridTemplateColumns: '1.3fr 1fr', gridTemplateRows: '1fr 1fr', gap: 0}}>
          {/* big chart */}
          <div style={{borderRight: '1px solid var(--line)', borderBottom: '1px solid var(--line)', padding: 10}}>
            <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 6}}>
              <span className="up faint" style={{fontSize: 9}}>NOI · 24 months · stacked by region</span>
              <span style={{display: 'flex', gap: 8, fontSize: 9.5}}>
                <span className="accent">■ west</span>
                <span style={{color: 'var(--good)'}}>■ central</span>
                <span className="dim">■ east</span>
              </span>
            </div>
            <AreaChart height={170} />
          </div>
          {/* mini map */}
          <div style={{borderBottom: '1px solid var(--line)', position: 'relative', display: 'flex'}}>
            <FauxMap dense />
            <div style={{position: 'absolute', top: 6, left: 6}} className="up faint">geo · noi heat</div>
          </div>
          {/* exposure table */}
          <div style={{borderRight: '1px solid var(--line)', padding: 10, overflow: 'hidden'}}>
            <div className="up faint" style={{fontSize: 9, marginBottom: 6}}>Exposure · top assets</div>
            <table className="t">
              <thead><tr><th>asset</th><th>region</th><th className="num">noi</th><th className="num">occ</th><th className="num">walt</th><th>trend</th></tr></thead>
              <tbody>
                {[
                  ['488 Brannan','SF · OFC','$4.8M','77.6%','3.4y'],
                  ['Pier 70 Bldg 12','SF · MFR','$8.1M','94.2%','5.1y'],
                  ['Sunset Logistics Ctr','LAX · IND','$11.2M','100%','7.0y'],
                  ['Coronado Sq','SD · RTL','$3.4M','88.4%','4.2y'],
                  ['Bishop Ranch B','OAK · OFC','$6.0M','82.1%','3.8y'],
                  ['Grand & 9th','LAX · OFC','$2.9M','64.0%','2.1y'],
                ].map((r,i)=>(
                  <tr key={i}>
                    {r.map((c,j)=> <td key={j} className={j>=2 && j<=4 ? 'num' : ''}>{c}</td>)}
                    <td><Spark color={i % 2 ? 'var(--good)' : 'var(--warn)'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* risk + alerts */}
          <div style={{padding: 10, display: 'grid', gridTemplateRows: '1fr 1fr', gap: 8}}>
            <div>
              <div className="up faint" style={{fontSize: 9, marginBottom: 4}}>Risk heat · by sub-market</div>
              <div className="heat" style={{display: 'grid', gridTemplateColumns: 'repeat(16, 1fr)', gap: 1, fontSize: 9}}>
                {Array.from({length: 64}).map((_, i) => {
                  const v = (Math.sin(i*1.7) + 1) / 2;
                  const c = v > 0.7 ? 'var(--warn)' : v > 0.4 ? 'var(--accent)' : 'var(--ink-faint)';
                  return <span key={i} style={{background: c, opacity: 0.3 + v*0.7, height: 12}} />;
                })}
              </div>
            </div>
            <div>
              <div className="up faint" style={{fontSize: 9, marginBottom: 4}}>Alerts · 7d</div>
              {['● permit · 2900 16th St','● lease roll · 488 Brannan','● comp · 633 Folsom','● filing · Hines 10-Q'].map((t,i)=>(
                <div key={i} style={{fontSize: 10.5, padding: '1px 0'}} className={i===0?'warn':i===1?'':'dim'}>{t}</div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
    <Annot style={{position: 'absolute', left: 50, top: 36}}>KPIs first · drill down ↓</Annot>
  </div>
);

// ─────────────────────────────────────────────────────────────
// W7 — Sparse exploration mode (zen / decision-grade)
// ─────────────────────────────────────────────────────────────
const W7_Sparse = () => (
  <div className="wf" style={{background: '#0a0c0f'}}>
    <div style={{padding: '14px 24px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
        <span className="dot" />
        <span className="sans" style={{fontSize: 14, fontWeight: 500, letterSpacing: '0.04em'}}>Atlas</span>
        <span className="faint">/</span>
        <span className="dim hand" style={{fontSize: 14}}>exploring · san francisco · office</span>
      </div>
      <div style={{display: 'flex', gap: 12, fontSize: 10}} className="dim">
        <span>⌕ search</span><span>↧ export</span><span>analyst@atlas</span>
      </div>
    </div>
    <div style={{display: 'flex', height: 'calc(100% - 51px)'}}>
      <FauxMap style={{flex: 1.3}}>
        <Annot style={{left: '50%', top: '12%', transform: 'translateX(-50%)'}}>only essentials · breathe</Annot>
      </FauxMap>
      <div style={{width: 360, padding: 28, display: 'flex', flexDirection: 'column', gap: 24, background: '#0d1014'}}>
        <div>
          <div className="hand dim" style={{fontSize: 14, marginBottom: 4}}>focused on</div>
          <div className="sans" style={{fontSize: 28, fontWeight: 400, lineHeight: 1.1}}>488 Brannan St</div>
          <div className="dim" style={{fontSize: 11, marginTop: 4}}>SoMa · 84,200 sqft · class A</div>
        </div>
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16}}>
          <div>
            <div className="up faint" style={{fontSize: 9}}>Estimated value</div>
            <div className="sans" style={{fontSize: 22, fontWeight: 400}}>$98–112M</div>
            <div className="dim" style={{fontSize: 10}}>± 7% · last sale 2019</div>
          </div>
          <div>
            <div className="up faint" style={{fontSize: 9}}>Vacancy</div>
            <div className="sans warn" style={{fontSize: 22, fontWeight: 400}}>22.4%</div>
            <div className="dim" style={{fontSize: 10}}>vs SoMa avg 14.8%</div>
          </div>
        </div>
        <div>
          <div className="up faint" style={{fontSize: 9, marginBottom: 6}}>Rent · 5y</div>
          <AreaChart height={70} />
        </div>
        <div>
          <div className="hand" style={{fontSize: 14, color: 'var(--accent)', marginBottom: 4}}>three things to know</div>
          <div className="dim" style={{fontSize: 11.5, lineHeight: 1.5}}>
            <div>· Stripe sublease listed at 27% below asking</div>
            <div>· Owner BREP IX filed UCC mod last week</div>
            <div>· New 84-unit MFR permit at 2900 16th St (0.3mi)</div>
          </div>
        </div>
        <div style={{marginTop: 'auto', display: 'flex', gap: 6}}>
          <span className="btn acc">deep dive →</span>
          <span className="btn">comps</span>
          <span className="btn">tenants</span>
        </div>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// W8 — Extreme density terminal (bloomberg-energy)
// ─────────────────────────────────────────────────────────────
const W8_Terminal = () => (
  <div className="wf" style={{fontSize: 10}}>
    <div style={{padding: '4px 8px', borderBottom: '1px solid var(--line)', background: 'var(--panel)', display: 'flex', gap: 12, fontSize: 9.5, alignItems: 'center'}}>
      <span className="up" style={{color: 'var(--accent)', fontWeight: 700}}>ATLAS//1</span>
      <span className="dim">F1 MAP</span>
      <span className="dim">F2 LIST</span>
      <span className="dim">F3 OWN</span>
      <span className="dim">F4 COMP</span>
      <span className="dim">F5 PIPE</span>
      <span className="dim">F6 ALERT</span>
      <span className="dim">F7 NEWS</span>
      <span style={{flex:1}}/>
      <span className="dim">SF·USD·EDT 14:22:08 · uptime 142d · feeds 12/12 ✓</span>
    </div>
    <div style={{display: 'grid', gridTemplateColumns: '1.1fr 1.4fr 1.1fr', gridTemplateRows: '1fr 1fr 1fr', height: 'calc(100% - 22px)', gap: 0}}>
      {/* TL: hot list */}
      <Pane title="HOT LIST · MOVERS 24H">
        <table className="t" style={{fontSize: 9.5}}>
          <thead><tr><th>tkr</th><th>asset</th><th className="num">$/sf</th><th className="num">Δ</th><th>spk</th></tr></thead>
          <tbody>
            {[
              ['BRN488','488 Brannan','748','+2.1','up'],
              ['TWN215','215 Townsend','702','+1.4','up'],
              ['MKT1455','1455 Market','612','-0.8','dn'],
              ['MIS350','350 Mission','840','+3.0','up'],
              ['HAW01','1 Hawthorne','1182','+2.8','up'],
              ['HAR600','600 Harrison','498','+1.0','up'],
              ['SPR188','188 Spear','802','-0.3','dn'],
              ['MIS101','101 Mission','764','+0.4','up'],
              ['TWN650','650 Townsend','682','-1.2','dn'],
              ['SEC85','85 2nd St','719','+0.6','up'],
              ['FOL633','633 Folsom','812','+4.2','up'],
              ['BRN301','301 Brannan','782','+0.8','up'],
            ].map((r,i)=>(
              <tr key={i}>
                <td className="accent">{r[0]}</td>
                <td>{r[1]}</td>
                <td className="num">{r[2]}</td>
                <td className={"num " + (r[3].startsWith('-') ? 'warn' : 'good')}>{r[3]}</td>
                <td><Spark color={r[4]==='up'?'var(--good)':'var(--warn)'} data={r[4]==='up'?[2,3,3,4,5,4,6,7,8,9]:[8,7,6,7,5,4,5,3,3,2]} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Pane>
      {/* TM: map */}
      <Pane title="MAP · SF · LAYERS: PARCEL+RENT∆+PERMITS" rowSpan={2}>
        <FauxMap dense style={{height: '100%'}} />
      </Pane>
      {/* TR: order book / opportunities */}
      <Pane title="OPPORTUNITY BOOK · BID/ASK">
        <table className="t" style={{fontSize: 9.5}}>
          <thead><tr><th>asset</th><th className="num">ask$/sf</th><th className="num">bid$/sf</th><th className="num">spread</th><th>status</th></tr></thead>
          <tbody>
            {[
              ['488 Brannan','785','740','5.7%','listed'],
              ['215 Townsend','720','690','4.2%','off-mkt'],
              ['1455 Market','640','580','9.4%','listed'],
              ['Bishop Ranch B','620','590','4.8%','off-mkt'],
              ['Pier 70 B12','1100','1050','4.6%','—'],
              ['Coronado Sq','540','510','5.6%','—'],
              ['Sunset Log','480','465','3.1%','tour'],
              ['Grand & 9th','410','370','9.8%','listed'],
            ].map((r,i)=>(
              <tr key={i}>
                <td>{r[0]}</td><td className="num">{r[1]}</td><td className="num">{r[2]}</td>
                <td className={"num " + (parseFloat(r[3])>6?'warn':'')}>{r[3]}</td>
                <td className="dim">{r[4]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Pane>
      {/* ML: alerts */}
      <Pane title="ALERTS · LIVE">
        <div style={{fontSize: 9.5, lineHeight: 1.6}}>
          {[
            ['12:04', 'warn', 'PERMIT  2900 16th St  84u MFR'],
            ['11:41', 'good', 'COMP    633 Folsom    $812/sf'],
            ['11:22', '',     'LEASE   488 Brannan   18.8k roll'],
            ['10:59', 'warn', 'TAX     mission bay   reval +12%'],
            ['10:18', '',     'OWNER   215 Townsend  UCC mod'],
            ['09:42', 'good', 'TRANS   muni 22-Fillmore plan'],
            ['09:02', '',     'FILING  Hines 10-Q     disposition'],
            ['08:30', 'warn', 'CRIME   SoMa          +18% wow'],
            ['08:01', '',     'NEWS    Stripe        new lease 7th'],
          ].map((r,i)=>(
            <div key={i} style={{display: 'grid', gridTemplateColumns: '38px 1fr', gap: 4, color: r[1]==='warn'?'var(--warn)':r[1]==='good'?'var(--good)':'var(--ink)'}}>
              <span className="faint">{r[0]}</span>
              <span style={{fontFamily:'var(--mono)'}}>{r[2]}</span>
            </div>
          ))}
        </div>
      </Pane>
      {/* MR: tenant roster */}
      {/* skipped — map spans 2 rows */}
      <Pane title="TENANT ROSTER · 488 BRANNAN">
        <table className="t" style={{fontSize: 9.5}}>
          <thead><tr><th>tenant</th><th className="num">sqft</th><th>industry</th><th>exp</th><th>credit</th></tr></thead>
          <tbody>
            {[
              ['Stripe Inc','18,400','fintech','2027-Q3','AA'],
              ['Notion Labs','9,120','saas','2026-Q1','A'],
              ['Figma','6,200','saas','2028-Q2','AA'],
              ['Brex','5,800','fintech','2026-Q4','A'],
              ['Mercury','4,200','fintech','2027-Q1','BBB'],
              ['Linear','3,100','saas','2026-Q2','A'],
              ['Retool','2,800','saas','2028-Q4','A'],
              ['—vacant—','18,800','—','—','—'],
            ].map((r,i)=>(
              <tr key={i} style={{color: r[0].includes('vacant') ? 'var(--warn)' : undefined}}>
                {r.map((c,j)=> <td key={j} className={j===1?'num':''}>{c}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Pane>
      {/* BL: chart */}
      <Pane title="SOMA $/SF · 5Y · WITH COMPS">
        <AreaChart height={120} />
      </Pane>
      {/* BM: pipeline */}
      <Pane title="PIPELINE · $1.2B AUM TARGET Q3">
        <div style={{fontSize: 9.5}}>
          {[
            ['SCREEN', 84, 'var(--ink-faint)'],
            ['LOI',    22, 'var(--ink-dim)'],
            ['TOUR',   12, 'var(--accent)'],
            ['DD',      6, 'var(--accent)'],
            ['PSA',     3, 'var(--good)'],
            ['CLOSE',   1, 'var(--good)'],
          ].map(([s,n,c],i)=>(
            <div key={i} style={{display: 'grid', gridTemplateColumns: '60px 30px 1fr', gap: 6, alignItems: 'center', padding: '2px 0'}}>
              <span className="up faint">{s}</span>
              <span className="num">{n}</span>
              <span style={{height: 10, background: c, opacity: 0.7, width: `${n}%`}} />
            </div>
          ))}
          <div style={{marginTop: 8}} className="dim">next milestones · PSA · 215 Townsend · 04-30 · $84M</div>
          <div className="dim">next milestones · CLOSE · Sunset Log · 05-12 · $142M</div>
        </div>
      </Pane>
      {/* BR: news */}
      <Pane title="NEWS · TAGGED">
        <div style={{fontSize: 9.5, lineHeight: 1.55}}>
          {[
            ['Bisnow', 'SF office availability hits 36.2%, ticks up vs Q1'],
            ['SF Biz', 'Hines weighing sale of three SoMa towers'],
            ['Reuters','BREP IX restructures debt on three coastal assets'],
            ['CoStar', 'Mission Bay rents +6.4% YoY, supply tightening'],
            ['SFCh',  'New zoning overlay clears 16th St corridor'],
            ['WSJ',   'Class-A SoMa cap rates compress 18bp this quarter'],
          ].map((r,i)=>(
            <div key={i} style={{display: 'grid', gridTemplateColumns: '50px 1fr', gap: 6, padding: '1px 0'}}>
              <span className="faint up">{r[0]}</span>
              <span>{r[1]}</span>
            </div>
          ))}
        </div>
      </Pane>
    </div>
  </div>
);

const Pane = ({ title, children, rowSpan }) => (
  <div style={{
    border: '1px solid var(--line)', borderTop: 'none', borderLeft: 'none',
    background: 'var(--panel)', display: 'flex', flexDirection: 'column',
    gridRow: rowSpan ? `span ${rowSpan}` : undefined, overflow: 'hidden'
  }}>
    <div style={{padding: '3px 8px', borderBottom: '1px solid var(--line)', background: 'var(--panel-2)', fontSize: 9, color: 'var(--accent)', letterSpacing: '0.08em', fontWeight: 700}}>
      {title}
    </div>
    <div style={{padding: 6, flex: 1, overflow: 'hidden', position: 'relative'}}>{children}</div>
  </div>
);

Object.assign(window, { W5_AlertsInbox, W6_KPICockpit, W7_Sparse, W8_Terminal });
