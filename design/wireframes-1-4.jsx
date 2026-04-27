// Wireframes 1-4

// ─────────────────────────────────────────────────────────────
// W1 — Map-dominant with floating panels (atlas/operations cockpit)
// ─────────────────────────────────────────────────────────────
const W1_MapFloating = () => (
  <div className="wf">
    <TopBar />
    <div style={{display: 'flex', height: 'calc(100% - 28px)'}}>
      <LeftRail active={1} />
      <div style={{flex: 1, position: 'relative', display: 'flex'}}>
        <FauxMap dense>
          {/* floating search */}
          <div className="box" style={{position: 'absolute', top: 12, left: 12, width: 320, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 8}}>
            <span className="dim">⌕</span>
            <span className="dim hand" style={{fontSize: 13}}>parcels &gt; 10k sqft, vacancy &gt; 18%, sold &lt; 2y…</span>
            <span style={{flex:1}}/>
            <span className="tag">⌘K</span>
          </div>

          {/* layer toggle */}
          <div className="box" style={{position: 'absolute', top: 12, right: 12, width: 168, padding: 8}}>
            <div className="up faint" style={{fontSize: 9, marginBottom: 6}}>Layers</div>
            {[
              ['◼ Parcels', true],
              ['◼ Zoning', true],
              ['◻ Comps (90d)', false],
              ['◼ Rent ∆ heat', true],
              ['◻ Permits', false],
              ['◻ Crime', false],
              ['◻ Transit', false],
            ].map(([l, on]) => (
              <div key={l} style={{display: 'flex', justifyContent: 'space-between', fontSize: 10.5, padding: '1px 0', color: on ? 'var(--ink)' : 'var(--ink-faint)'}}>
                <span>{l}</span>
                <span className="faint">{on ? '·' : ''}</span>
              </div>
            ))}
          </div>

          {/* selected property card */}
          <div className="box thick" style={{position: 'absolute', left: '40%', top: '38%', width: 220, padding: 8, transform: 'translate(20px,-40%)', borderColor: 'var(--accent)'}}>
            <div className="up accent" style={{fontSize: 9}}>SELECTED · APN 4521-018</div>
            <div className="sans" style={{fontSize: 13, fontWeight: 500, margin: '2px 0 4px'}}>488 Brannan St</div>
            <div className="dim" style={{fontSize: 10}}>Office · 84,200 sqft · built 1998</div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 6}}>
              <div><div className="faint up" style={{fontSize: 8}}>Est. NOI</div><div>$4.8M</div></div>
              <div><div className="faint up" style={{fontSize: 8}}>Vacancy</div><div className="warn">22.4%</div></div>
              <div><div className="faint up" style={{fontSize: 8}}>Last sale</div><div>2019 · $112M</div></div>
              <div><div className="faint up" style={{fontSize: 8}}>Cap rate (est)</div><div>5.8%</div></div>
            </div>
            <div style={{display: 'flex', gap: 4, marginTop: 8}}>
              <span className="btn acc">Inspect</span>
              <span className="btn">Watchlist</span>
              <span className="btn">Comps</span>
            </div>
          </div>

          {/* alerts feed bottom-left */}
          <div className="box" style={{position: 'absolute', left: 12, bottom: 12, width: 320, padding: 8}}>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4}}>
              <span className="up faint" style={{fontSize: 9}}>Alerts · 14 new</span>
              <span className="dim" style={{fontSize: 9}}>last 24h</span>
            </div>
            {[
              ['warn', '12:04', 'Permit filed · 2900 16th St'],
              ['acc',  '11:41', 'Comp closed · $812/sf SoMa'],
              ['', '10:18', 'Lease expiry &lt;90d · Brannan'],
              ['acc',  '09:02', 'Owner change · 215 Townsend'],
            ].map((r, i) => (
              <div key={i} style={{display: 'grid', gridTemplateColumns: '12px 36px 1fr', gap: 6, fontSize: 10.5, padding: '1.5px 0'}}>
                <span className={r[0]}>{r[0] ? '●' : '·'}</span>
                <span className="faint">{r[1]}</span>
                <span dangerouslySetInnerHTML={{__html: r[2]}} />
              </div>
            ))}
          </div>

          {/* market trend top right pinned */}
          <div className="box" style={{position: 'absolute', right: 12, bottom: 12, width: 240, padding: 8}}>
            <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 10}}>
              <span className="up faint" style={{fontSize: 9}}>SoMa · $/sf · 24mo</span>
              <span className="good">+4.2%</span>
            </div>
            <AreaChart height={60} />
            <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--ink-faint)', marginTop: 2}}>
              <span>'24 Q1</span><span>'25 Q1</span><span>now</span>
            </div>
          </div>

          {/* hand annotations */}
          <Annot style={{left: '60%', top: '20%'}} dir="left">map = primary surface</Annot>
          <Annot style={{left: '6%', top: '56%'}} dir="right">panels float ⇢ dismissible</Annot>
        </FauxMap>
      </div>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// W2 — Three-column terminal: list / map / inspector
// ─────────────────────────────────────────────────────────────
const W2_ThreeCol = () => (
  <div className="wf">
    <TopBar />
    <div style={{display: 'flex', height: 'calc(100% - 28px)'}}>
      <LeftRail active={2} />
      {/* col 1 — query + list */}
      <div style={{width: 260, borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', background: 'var(--panel)'}}>
        <div style={{padding: 8, borderBottom: '1px solid var(--line)'}}>
          <div className="up faint" style={{fontSize: 9, marginBottom: 4}}>Query</div>
          <div className="input" style={{padding: '4px 6px'}}>asset:office vacancy:&gt;15 sqft:&gt;50k</div>
          <div style={{display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap'}}>
            <span className="tag">SoMa</span><span className="tag">FiDi</span><span className="tag">Mission Bay</span>
            <span className="tag" style={{borderColor: 'var(--accent)', color: 'var(--accent)'}}>+ filter</span>
          </div>
        </div>
        <div style={{flex: 1, overflow: 'hidden', position: 'relative'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', padding: '4px 8px', borderBottom: '1px solid var(--line)'}}>
            <span className="up faint" style={{fontSize: 9}}>Results · 248</span>
            <span className="dim" style={{fontSize: 9}}>sort: NOI ▾</span>
          </div>
          {[
            ['488 Brannan St', 'OFC', '84.2k', '5.8%', true],
            ['215 Townsend', 'OFC', '62.0k', '6.1%', false],
            ['1455 Market St', 'OFC', '1.2M', '5.4%', false],
            ['650 Townsend', 'OFC', '320k', '5.9%', false],
            ['350 Mission', 'OFC', '460k', '5.2%', false],
            ['1 Hawthorne', 'MFR', '180k', '4.8%', false],
            ['188 Spear', 'OFC', '160k', '6.0%', false],
            ['101 Mission', 'OFC', '510k', '5.5%', false],
            ['600 Harrison', 'IND', '92k', '6.4%', false],
            ['85 2nd St', 'OFC', '97k', '5.7%', false],
          ].map((r, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '1fr 28px 44px 36px',
              gap: 4, padding: '4px 8px', fontSize: 10,
              borderBottom: '1px dashed var(--line)',
              background: r[4] ? 'var(--panel-2)' : 'transparent',
              borderLeft: r[4] ? '2px solid var(--accent)' : '2px solid transparent'
            }}>
              <span style={{overflow:'hidden', textOverflow:'ellipsis'}}>{r[0]}</span>
              <span className="faint">{r[1]}</span>
              <span className="num dim">{r[2]}</span>
              <span className="num">{r[3]}</span>
            </div>
          ))}
        </div>
      </div>
      {/* col 2 — map */}
      <FauxMap />
      {/* col 3 — inspector */}
      <div style={{width: 280, borderLeft: '1px solid var(--line)', background: 'var(--panel)', display: 'flex', flexDirection: 'column'}}>
        <div style={{padding: 8, borderBottom: '1px solid var(--line)'}}>
          <div className="up accent" style={{fontSize: 9}}>INSPECTOR</div>
          <div className="sans" style={{fontSize: 14, fontWeight: 500, marginTop: 2}}>488 Brannan St</div>
          <div className="dim" style={{fontSize: 10}}>APN 4521-018 · SoMa</div>
        </div>
        <div style={{padding: 8, borderBottom: '1px solid var(--line)'}}>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 10.5}}>
            <div><div className="faint up" style={{fontSize: 8}}>Owner</div><div>BREP IX</div></div>
            <div><div className="faint up" style={{fontSize: 8}}>Built</div><div>1998</div></div>
            <div><div className="faint up" style={{fontSize: 8}}>RBA</div><div>84,200</div></div>
            <div><div className="faint up" style={{fontSize: 8}}>Class</div><div>A</div></div>
            <div><div className="faint up" style={{fontSize: 8}}>Vacancy</div><div className="warn">22.4%</div></div>
            <div><div className="faint up" style={{fontSize: 8}}>WALT</div><div>3.4y</div></div>
          </div>
        </div>
        <div style={{padding: 8, borderBottom: '1px solid var(--line)'}}>
          <div className="up faint" style={{fontSize: 9, marginBottom: 4}}>Rent / sf · 5y</div>
          <AreaChart height={60} />
        </div>
        <div style={{padding: 8, borderBottom: '1px solid var(--line)'}}>
          <div className="up faint" style={{fontSize: 9, marginBottom: 4}}>Tenants · 12</div>
          {['Stripe Inc · 18.4k · 2027', 'Notion Labs · 9.1k · 2026', 'Figma · 6.2k · 2028', '─ vacant · 18.8k ─'].map((t,i)=>(
            <div key={i} style={{fontSize: 10, padding: '1px 0', color: t.startsWith('─') ? 'var(--warn)' : undefined}}>{t}</div>
          ))}
        </div>
        <div style={{padding: 8, flex: 1}}>
          <div className="up faint" style={{fontSize: 9, marginBottom: 4}}>Comps · within 0.4mi</div>
          <table className="t">
            <tbody>
              <tr><td>301 Brannan</td><td className="num">$782/sf</td><td className="num dim">'24</td></tr>
              <tr><td>633 Folsom</td><td className="num">$809/sf</td><td className="num dim">'24</td></tr>
              <tr><td>140 New Mont</td><td className="num">$840/sf</td><td className="num dim">'25</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    <Annot style={{position: 'absolute', left: 240, top: 36}}>list ⇢ map ⇢ detail</Annot>
  </div>
);

// ─────────────────────────────────────────────────────────────
// W3 — Map + bottom drawer (comps/alerts/timeline)
// ─────────────────────────────────────────────────────────────
const W3_BottomDrawer = () => (
  <div className="wf">
    <TopBar />
    <div style={{display: 'flex', height: 'calc(100% - 28px)'}}>
      <LeftRail active={0} />
      <div style={{flex: 1, display: 'flex', flexDirection: 'column'}}>
        <FauxMap dense style={{flex: 1}}>
          <div className="box" style={{position: 'absolute', top: 12, left: 12, right: 12, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 10}}>
            <span className="dim">⌕</span>
            <span className="hand dim" style={{fontSize: 13, flex: 1}}>"office buildings within 0.5mi of muni, vacancy over 15%"</span>
            <span className="tag">draw ⌐</span>
            <span className="tag">isochrone ⊙</span>
            <span className="tag">heatmap ☷</span>
            <span className="tag">save ↧</span>
          </div>
          <Annot style={{left: '40%', top: '36%'}}>NL query → map state</Annot>
        </FauxMap>
        {/* drawer */}
        <div style={{height: 220, borderTop: '1px solid var(--line)', background: 'var(--panel)', display: 'flex', flexDirection: 'column'}}>
          <div style={{display: 'flex', borderBottom: '1px solid var(--line)', fontSize: 10}}>
            {['Properties · 248', 'Comps · 86', 'Alerts · 14', 'Permits · 31', 'Owners · 42', 'Timeline'].map((t, i) => (
              <div key={i} style={{padding: '6px 12px', borderRight: '1px solid var(--line)', color: i === 0 ? 'var(--ink)' : 'var(--ink-dim)', borderBottom: i === 0 ? '2px solid var(--accent)' : 'none'}}>{t}</div>
            ))}
            <span style={{flex:1}}/>
            <div style={{padding: '6px 12px'}} className="dim">↧ export</div>
          </div>
          <div style={{flex: 1, overflow: 'hidden'}}>
            <table className="t">
              <thead>
                <tr><th>address</th><th>type</th><th>rba</th><th>built</th><th>owner</th><th className="num">vac</th><th className="num">$/sf</th><th className="num">Δ 90d</th><th>last evt</th></tr>
              </thead>
              <tbody>
                {[
                  ['488 Brannan St','OFC','84.2k','1998','BREP IX','22.4%','$748','+2.1%','permit'],
                  ['215 Townsend','OFC','62.0k','2002','Hines','11.0%','$702','+1.4%','lease'],
                  ['1455 Market St','OFC','1.2M','1976','Hudson','18.6%','$612','-0.8%','sale'],
                  ['350 Mission','OFC','460k','2015','KKR','6.2%','$840','+3.0%','—'],
                  ['1 Hawthorne','MFR','180k','2008','Equity','4.4%','$1,182','+2.8%','—'],
                  ['600 Harrison','IND','92k','1962','—','0.0%','$498','+1.0%','permit'],
                  ['85 2nd St','OFC','97k','2001','Boston P.','14.2%','$719','+0.6%','lease'],
                  ['650 Townsend','OFC','320k','2002','TMG','24.8%','$682','-1.2%','—'],
                ].map((r, i) => (
                  <tr key={i} style={{background: i === 0 ? 'var(--panel-2)' : undefined}}>
                    {r.map((c, j) => <td key={j} className={j>=5 && j<=7 ? 'num' : ''}>{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    <Annot style={{position: 'absolute', left: '50%', top: 'calc(100% - 240px)'}}>resizable drawer ⇕</Annot>
  </div>
);

// ─────────────────────────────────────────────────────────────
// W4 — Command palette / query-first (everything starts as text)
// ─────────────────────────────────────────────────────────────
const W4_QueryFirst = () => (
  <div className="wf">
    <TopBar right={<><span className="pill">⌘K</span><span className="dim">analyst@atlas</span></>} />
    <div style={{display: 'flex', height: 'calc(100% - 28px)'}}>
      <LeftRail active={3} />
      <div style={{flex: 1, position: 'relative', display: 'flex'}}>
        {/* Big map dimmed in bg */}
        <FauxMap style={{opacity: 0.4}} />
        {/* centered command palette */}
        <div style={{position: 'absolute', top: '14%', left: '50%', transform: 'translateX(-50%)', width: 620}}>
          <div className="box thick" style={{padding: 0, borderColor: 'var(--accent)', boxShadow: '0 8px 40px rgba(0,0,0,0.6)'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--line)'}}>
              <span className="accent" style={{fontSize: 14}}>⌕</span>
              <span className="sans" style={{fontSize: 16, fontWeight: 400}}>show me all class-A office in SoMa where lease rolls before EOY 2026 and vacancy &gt; 15%</span>
              <span className="dim" style={{fontSize: 10}}>↵ run</span>
            </div>
            <div style={{padding: '8px 14px', display: 'flex', gap: 8, borderBottom: '1px solid var(--line)', flexWrap: 'wrap'}}>
              <span className="tag" style={{borderColor: 'var(--accent)', color: 'var(--accent)'}}>asset = office</span>
              <span className="tag" style={{borderColor: 'var(--accent)', color: 'var(--accent)'}}>class = A</span>
              <span className="tag" style={{borderColor: 'var(--accent)', color: 'var(--accent)'}}>geo ∈ SoMa</span>
              <span className="tag" style={{borderColor: 'var(--accent)', color: 'var(--accent)'}}>lease.exp &lt; 2026-12-31</span>
              <span className="tag" style={{borderColor: 'var(--accent)', color: 'var(--accent)'}}>vacancy &gt; 0.15</span>
            </div>
            <div style={{padding: '4px 0'}}>
              <div className="up faint" style={{fontSize: 9, padding: '4px 14px'}}>matches · 32</div>
              {[
                ['488 Brannan St', '84.2k sqft · 22.4% vac · roll Q3 ’26', '↗'],
                ['215 Townsend', '62.0k sqft · 11.0% vac · roll Q1 ’26', '↗'],
                ['1455 Market St', '1.2M sqft · 18.6% vac · roll Q4 ’26', '↗'],
                ['85 2nd St', '97k sqft · 14.2% vac · roll Q2 ’26', '↗'],
              ].map((r,i)=>(
                <div key={i} style={{display: 'grid', gridTemplateColumns: '1fr 2fr 16px', gap: 8, padding: '5px 14px', fontSize: 11, borderTop: '1px dashed var(--line)'}}>
                  <span>{r[0]}</span>
                  <span className="dim">{r[1]}</span>
                  <span className="faint">{r[2]}</span>
                </div>
              ))}
            </div>
            <div style={{padding: '6px 14px', borderTop: '1px solid var(--line)', fontSize: 9.5, color: 'var(--ink-faint)', display: 'flex', gap: 12}}>
              <span>↑↓ navigate</span><span>↵ open</span><span>⇧↵ map</span><span>⌘S save query</span><span>⌘E export</span>
            </div>
          </div>
        </div>
        {/* recent queries */}
        <div className="box" style={{position: 'absolute', left: 12, top: 12, width: 200, padding: 8}}>
          <div className="up faint" style={{fontSize: 9, marginBottom: 4}}>Saved queries</div>
          {['SoMa · roll &lt; 2026','MFR · cap &gt; 5.5','Permits · 30d','Off-market candidates','Owners · &gt; 5 props'].map((q,i)=>(
            <div key={i} style={{fontSize: 10.5, padding: '2px 0', color: i === 0 ? 'var(--accent)' : 'var(--ink-dim)'}} dangerouslySetInnerHTML={{__html: '› ' + q}} />
          ))}
        </div>
        <Annot style={{position: 'absolute', right: 16, top: 60}} dir="left">query is the front door · map renders the answer</Annot>
      </div>
    </div>
  </div>
);

Object.assign(window, { W1_MapFloating, W2_ThreeCol, W3_BottomDrawer, W4_QueryFirst });
