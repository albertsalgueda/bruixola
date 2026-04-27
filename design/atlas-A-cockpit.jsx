// Atlas v2 — Direction A: Operations Cockpit (the hero)
// Map-centric, dense-but-breathable, fully populated with realistic data,
// floating glass panels, an interactive selected-property dossier, alerts
// stream, KPI strip, layer controls, mini-charts.

const A_OpsCockpit = () => {
  const [layers, setLayers] = React.useState({
    parcel: true, heat: true, roads: true, topo: true,
    permits: true, transit: false, comps: true, zoning: false, crime: false
  });
  const [selected] = React.useState('488 Brannan St');

  return (
    <div className="atlas">
      <ChromeTop />
      <div style={{display: 'flex', flex: 1, minHeight: 0}}>
        <Rail active="map" />
        <div style={{flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0}}>
          {/* Search bar */}
          <div style={{padding: 10, borderBottom: '1px solid var(--line-1)', background: 'var(--bg-1)', display: 'flex', gap: 8, alignItems: 'center'}}>
            <div className="search-bar" style={{flex: 1, height: 34, padding: '6px 12px'}}>
              <span className="glyph">⌕</span>
              <span className="placeholder">
                <em>asset:office</em> · <em>geo:soma</em> · <em>vacancy:&gt;15%</em> · <em>rba:&gt;50k</em>
                <span className="typing-cursor"/>
              </span>
              <span className="dim-3" style={{fontSize: 9.5, letterSpacing: '0.1em'}}>248 RESULTS · 0.32s</span>
            </div>
            <span className="btn">⌘ saved · 12</span>
            <span className="btn">↧ export</span>
            <span className="btn primary">+ new view</span>
          </div>

          {/* KPI strip */}
          <div className="kpi-row" style={{gridTemplateColumns: 'repeat(5, 1fr)'}}>
            <div className="kpi-cell">
              <div className="lbl">Portfolio NOI · ttm</div>
              <div className="val t-num">$284<span className="unit">.1M</span></div>
              <div className="delta good"><span className="arrow">▲</span> +3.2% qoq · +$8.8M</div>
              <div className="kpi-spark"><Sparkline data={[44,46,45,48,49,51,50,53,54,56,55,58,60,59,62]} color="var(--good)" /></div>
            </div>
            <div className="kpi-cell">
              <div className="lbl">Occupancy</div>
              <div className="val t-num">91.4<span className="unit">%</span></div>
              <div className="delta warn"><span className="arrow">▼</span> −0.8pt qoq · 4 of 22 below target</div>
              <div className="kpi-spark"><Sparkline data={[94,93.4,93,92.8,92.5,92.2,92,91.8,91.6,91.4]} color="var(--warn)" /></div>
            </div>
            <div className="kpi-cell">
              <div className="lbl">Cap rate · weighted</div>
              <div className="val t-num">5.62<span className="unit">%</span></div>
              <div className="delta warn"><span className="arrow">▲</span> +12bp · expansion vs 24Q4</div>
              <div className="kpi-spark"><Sparkline data={[5.4,5.42,5.44,5.46,5.48,5.5,5.52,5.55,5.58,5.62]} color="var(--warn)" /></div>
            </div>
            <div className="kpi-cell">
              <div className="lbl">Pipeline · screening</div>
              <div className="val t-num">128 <span className="unit">deals</span></div>
              <div className="delta amber"><span className="arrow">●</span> $1.24B target · 22 in tour</div>
              <div className="kpi-spark"><Sparkline data={[80,84,88,92,98,104,108,114,118,124,128]} color="var(--amber)" /></div>
            </div>
            <div className="kpi-cell">
              <div className="lbl">Risk index</div>
              <div className="val t-num">62 <span className="unit">/100</span></div>
              <div className="delta warn"><span className="arrow">▲</span> 3 high-priority alerts last 24h</div>
              <div className="kpi-spark"><Sparkline data={[55,56,58,57,59,60,62,61,63,62]} color="var(--warn)" /></div>
            </div>
          </div>

          {/* Map + side dossier */}
          <div style={{flex: 1, display: 'flex', minHeight: 0}}>
            <div style={{flex: 1, position: 'relative', display: 'flex'}}>
              <AtlasMap layers={layers}>

                {/* Floating: layers control top-right */}
                <div className="glass" style={{position: 'absolute', top: 14, right: 14, width: 200, padding: 0}}>
                  <div style={{padding: '6px 10px', borderBottom: '1px solid var(--line-1)', display: 'flex', justifyContent: 'space-between'}}>
                    <span className="t-mark">Layers</span>
                    <span className="dim-3" style={{fontSize: 9}}>4 / 9</span>
                  </div>
                  <div className="layer-list" style={{padding: '4px 0'}}>
                    {[
                      ['parcel', 'Parcels', 'var(--ink-1)', '100%'],
                      ['heat',   'Rent ∆ heat', 'var(--amber)', ' 80%'],
                      ['roads',  'Streets', 'var(--ink-2)', '100%'],
                      ['comps',  'Comps · 90d', 'var(--cyan)', '100%'],
                      ['permits','Permits · 30d', 'var(--warn)', ' 60%'],
                      ['zoning', 'Zoning overlay', 'var(--cyan)', ' off'],
                      ['transit','Transit · GTFS', 'var(--good)', ' off'],
                      ['topo',   'Topography', 'var(--ink-3)', '100%'],
                      ['crime',  'Crime · 365d', 'var(--hot)', ' off'],
                    ].map(([k, l, c, op]) => (
                      <div key={k} className={"row " + (layers[k] ? "on" : "")} onClick={() => setLayers(s => ({...s, [k]: !s[k]}))}>
                        <span className="swatch" style={{color: c, borderColor: c, opacity: layers[k] ? 1 : 0.3}} />
                        <span>{l}</span>
                        <span className="opacity">{op}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Floating: market pulse bottom-right */}
                <div className="glass" style={{position: 'absolute', bottom: 50, right: 14, width: 280, padding: 10}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6}}>
                    <span className="t-mark">SoMa · class A · $/sf · 24mo</span>
                    <span className="t-num good" style={{fontSize: 11}}>+4.2%</span>
                  </div>
                  <div style={{height: 70}}>
                    <TimeSeries height={70} yAxis={false} xLabels={['24Q3','25Q1','25Q3','now']}
                      series={[
                        { data: [612,628,632,648,656,672,690,702,718,732,748], color: 'var(--amber)', fill: true },
                        { data: [620,624,626,630,634,640,648,656,662,672,684], color: 'var(--ink-3)', fill: false, dashed: true, weight: 0.8 },
                      ]}
                    />
                  </div>
                  <div style={{display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10}}>
                    <span><span style={{display:'inline-block',width:8,height:1,background:'var(--amber)',marginRight:6,verticalAlign:3}}/>Class A</span>
                    <span><span style={{display:'inline-block',width:8,height:1,background:'var(--ink-3)',marginRight:6,verticalAlign:3}}/>Class B</span>
                    <span className="dim-3">spread $64</span>
                  </div>
                </div>

                {/* Selected property callout — anchored by stem to a pin */}
                <div className="callout" style={{left: 'calc(46% + 18px)', top: '54%', width: 280}}>
                  <div className="callout-head">
                    <div>
                      <div className="t-mark amber">SELECTED · 4521-018</div>
                      <div style={{fontFamily:'var(--serif)', fontSize: 18, marginTop: 1, lineHeight: 1}}>{selected}</div>
                    </div>
                    <span className="badge warn">vac 22%</span>
                  </div>
                  <div style={{padding: '8px 10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px'}}>
                    <div>
                      <div className="t-eyebrow">Class</div>
                      <div className="t-num dim-0">A · OFC</div>
                    </div>
                    <div>
                      <div className="t-eyebrow">RBA</div>
                      <div className="t-num">84,200 sf</div>
                    </div>
                    <div>
                      <div className="t-eyebrow">Last sale</div>
                      <div className="t-num">2019 · $112M</div>
                    </div>
                    <div>
                      <div className="t-eyebrow">Cap (est)</div>
                      <div className="t-num">5.8%</div>
                    </div>
                    <div>
                      <div className="t-eyebrow">Owner</div>
                      <div>BREP IX</div>
                    </div>
                    <div>
                      <div className="t-eyebrow">WALT</div>
                      <div className="t-num">3.4 y</div>
                    </div>
                  </div>
                  <div style={{padding: '0 10px 8px'}}>
                    <div className="t-eyebrow" style={{marginBottom: 3}}>Est. value</div>
                    <div style={{display: 'flex', alignItems: 'baseline', gap: 8}}>
                      <span className="t-serif" style={{fontSize: 22}}>$98–112M</span>
                      <span className="dim-3 t-num" style={{fontSize: 10}}>±7% · 3 models</span>
                    </div>
                  </div>
                  <div style={{padding: '8px 10px', borderTop: '1px solid var(--line-1)', display: 'flex', gap: 6, background: 'var(--bg-2)'}}>
                    <span className="btn primary" style={{flex: 1, justifyContent: 'center'}}>Open dossier →</span>
                    <span className="btn">★</span>
                    <span className="btn">⚑</span>
                  </div>
                </div>

                {/* Top-left: filter chips */}
                <div style={{position: 'absolute', top: 14, left: 14, display: 'flex', gap: 6, flexWrap: 'wrap', maxWidth: 480}}>
                  <span className="chip on">asset = office <span className="x">×</span></span>
                  <span className="chip on">geo ∈ SoMa <span className="x">×</span></span>
                  <span className="chip on">vacancy &gt; 15% <span className="x">×</span></span>
                  <span className="chip on">RBA &gt; 50k <span className="x">×</span></span>
                  <span className="chip">+ add filter</span>
                </div>

                {/* Bottom-left: legend / heat */}
                <div className="glass" style={{position: 'absolute', bottom: 50, left: 14, width: 220, padding: 8}}>
                  <div className="t-mark" style={{marginBottom: 4}}>Rent ∆ · 12mo · $/sf</div>
                  <div style={{display: 'flex', height: 8, marginBottom: 4}}>
                    {['#3a423d','#5a5d57','#8c6d3a','#e8b25c','#e07a5f','#c94a3d'].map((c, i) => (
                      <div key={i} style={{flex: 1, background: c}} />
                    ))}
                  </div>
                  <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--ink-3)'}}>
                    <span>−6%</span><span>0</span><span>+8%</span>
                  </div>
                </div>
              </AtlasMap>
            </div>

            {/* Right side: live activity + watchlist */}
            <div style={{width: 340, borderLeft: '1px solid var(--line-1)', background: 'var(--bg-1)', display: 'flex', flexDirection: 'column', minHeight: 0}}>
              {/* Tabs */}
              <div className="tabs">
                <div className="tab on">Activity <span className="count">14</span></div>
                <div className="tab">Watchlist <span className="count">42</span></div>
                <div className="tab">Notes <span className="count">8</span></div>
              </div>
              {/* Activity feed */}
              <div className="scroll" style={{flex: 1}}>
                <div style={{padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line-0)'}}>
                  <span className="t-eyebrow"><span className="live-dot"/>live · last 24h</span>
                  <span className="dim-3" style={{fontSize: 10}}>filters · 3</span>
                </div>
                {[
                  ['hot', 'PERMIT', '12:04', '2900 16th St', '84-unit MFR · adj. watchlist · 0.3mi from Brannan', 'new'],
                  ['amber', 'COMP', '11:41', '633 Folsom · sold $812/sf', 'comp resets SoMa class-B · 4% above your est', 'new'],
                  ['warn', 'LEASE', '10:18', '488 Brannan · Stripe sublease', 'listed at 27% under asking · 18.8k sqft', 'new'],
                  ['amber', 'OWNER', '09:02', '215 Townsend · UCC mod', 'BREP IX → debt restructure · refi signal', ''],
                  ['', 'FILING', '08:30', 'Hines · 10-Q', '"considering disposition of non-core SF assets"', ''],
                  ['warn', 'TAX', 'yest', 'Mission Bay · reval', '14 parcels reassessed · +12% avg', ''],
                  ['good', 'TRANSIT', 'yest', 'Muni · 22-Fillmore extension', 'public hearing scheduled · 2026-05-12', ''],
                  ['', 'COMP', 'yest', '350 Mission · cap reset 5.2%', '', ''],
                  ['', 'NEWS', '2d', 'SF Chronicle · zoning overlay', '16th St corridor · clears 4 parcels', ''],
                  ['', 'FILING', '2d', 'Boston Properties · 8-K', 'tenant retention update · Q1 leasing flat', ''],
                ].map((r, i) => (
                  <div key={i} className={"evt-row " + (r[5] === 'new' ? 'new' : '')}>
                    <span className={"sig " + r[0]} />
                    <span className="time">{r[2]}</span>
                    <div>
                      <div className="badge-mini">{r[1]}</div>
                      <div className="what" style={{marginTop: 1}}><b>{r[3]}</b></div>
                      {r[4] && <div className="dim-2" style={{fontSize: 10, marginTop: 1}}>{r[4]}</div>}
                    </div>
                    <span className="dim-3" style={{fontSize: 10}}>›</span>
                  </div>
                ))}
              </div>

              {/* Bottom: ai assist hint */}
              <div style={{padding: 10, borderTop: '1px solid var(--line-1)', background: 'var(--bg-2)'}}>
                <div className="t-eyebrow" style={{marginBottom: 4}}>↗ Atlas suggest</div>
                <div className="t-serif-i dim-0" style={{fontSize: 14, lineHeight: 1.3}}>
                  Three signals on 488 Brannan within 24h. Want me to assemble a deal memo?
                </div>
                <div style={{display: 'flex', gap: 6, marginTop: 8}}>
                  <span className="btn primary" style={{fontSize: 10}}>Yes · draft memo</span>
                  <span className="btn" style={{fontSize: 10}}>Show signals</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

window.A_OpsCockpit = A_OpsCockpit;
