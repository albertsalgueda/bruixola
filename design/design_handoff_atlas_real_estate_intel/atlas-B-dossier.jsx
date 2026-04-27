// Atlas v2 — Direction B: Property Dossier (drilldown view)
// What you get when you click "Open dossier" on a property.

const B_Dossier = () => (
  <div className="atlas">
    <ChromeTop region="488-brannan-st" />
    <div style={{display: 'flex', flex: 1, minHeight: 0}}>
      <Rail active="list" />
      <div style={{flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0}}>

        {/* Property header */}
        <div style={{padding: '16px 20px', borderBottom: '1px solid var(--line-1)', background: 'var(--bg-1)', display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'end'}}>
          <div>
            <div className="t-mark" style={{marginBottom: 4}}>APN 4521-018 · SoMa · San Francisco · CA</div>
            <div className="headline" style={{fontSize: 38, marginBottom: 4}}>
              488 Brannan Street
              <span className="t-serif-i dim-2" style={{fontSize: 22, marginLeft: 12}}>— eight floors above the rail yard</span>
            </div>
            <div style={{display: 'flex', gap: 18, fontSize: 11, color: 'var(--ink-2)', fontFamily: 'var(--mono)'}}>
              <span>OFFICE · CLASS A</span>
              <span>·</span>
              <span>84,200 sf RBA</span>
              <span>·</span>
              <span>built 1998 · renov 2018</span>
              <span>·</span>
              <span>owner BREP IX</span>
              <span>·</span>
              <span>last sale 2019 · $112M</span>
            </div>
          </div>
          <div style={{display: 'flex', gap: 8}}>
            <span className="btn">★ watchlist</span>
            <span className="btn">⇲ share</span>
            <span className="btn">↧ pdf</span>
            <span className="btn primary">+ add to pipeline</span>
          </div>
        </div>

        {/* Three-col body */}
        <div style={{flex: 1, display: 'grid', gridTemplateColumns: '320px 1fr 360px', minHeight: 0}}>

          {/* Left: model output */}
          <div style={{borderRight: '1px solid var(--line-1)', background: 'var(--bg-1)', display: 'flex', flexDirection: 'column', minHeight: 0}}>
            <div className="scroll" style={{padding: 16, flex: 1}}>
              <div className="t-eyebrow">Atlas valuation · v4</div>
              <div className="headline" style={{fontSize: 32, marginTop: 6}}>$98–112<span style={{fontSize: 18, color: 'var(--ink-2)'}}>M</span></div>
              <div className="dim-2" style={{fontSize: 11, marginTop: 2}}>$1,164–1,330 / sf · 5.6–6.4% cap</div>

              <div style={{height: 60, marginTop: 14}}>
                <Histogram data={[2,4,8,14,22,32,38,42,38,30,22,14,8,4,2]} marker={0.55} />
              </div>
              <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--ink-3)', fontFamily: 'var(--mono)', marginTop: 2}}>
                <span>$84M</span><span>median $103M</span><span>$128M</span>
              </div>

              <div style={{marginTop: 18}} className="div-lbl">model contributions</div>
              <div style={{marginTop: 8}}>
                {[
                  ['DCF · base case', 0.38, '$104M'],
                  ['Comp set · 12 sales', 0.32, '$108M'],
                  ['Cap rate · ttm NOI', 0.22, '$96M'],
                  ['Replacement · land+const', 0.08, '$118M'],
                ].map(([n, w, v]) => (
                  <div key={n} style={{marginBottom: 8}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 2}}>
                      <span className="dim-1">{n}</span>
                      <span className="t-num">{v} <span className="dim-3">· {(w*100).toFixed(0)}%</span></span>
                    </div>
                    <div className="progress"><i style={{width: `${w*100}%`}}/></div>
                  </div>
                ))}
              </div>

              <div style={{marginTop: 18}} className="div-lbl">scenarios</div>
              <div style={{marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6}}>
                {[
                  ['Hold · re-tenant 18.8k vacant', '$108M', 'good', '+$5M'],
                  ['Sell · 30d marketing', '$96–104M', 'amber', 'base'],
                  ['Refi · 60% LTV @ 6.4%', '$112M (post)', 'good', '+$9M'],
                  ['Convert · partial residential', '$84–98M', 'warn', '−$15M'],
                ].map(([s, v, t, d]) => (
                  <div key={s} className="inset" style={{padding: '8px 10px'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline'}}>
                      <span style={{fontSize: 11}}>{s}</span>
                      <span className={"t-num " + t} style={{fontSize: 11}}>{d}</span>
                    </div>
                    <div className="t-num dim-2" style={{fontSize: 10, marginTop: 1}}>→ {v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Center: chart + map + tenants */}
          <div style={{display: 'flex', flexDirection: 'column', minHeight: 0}}>
            {/* Big NOI chart */}
            <div className="panel" style={{border: 0, borderBottom: '1px solid var(--line-1)', flex: '0 0 240px'}}>
              <div className="panel-head">
                <span className="title"><b>01</b> Operating performance · NOI · 8q · forecast</span>
                <span className="actions"><span>annual</span><span style={{color:'var(--amber)'}}>quarterly</span><span>monthly</span><span>·</span><span>↧</span></span>
              </div>
              <div className="panel-body" style={{padding: 12}}>
                <TimeSeries height={200} xLabels={['24Q1','24Q2','24Q3','24Q4','25Q1','25Q2','25Q3','25Q4','26Q1','26Q2f','26Q3f','26Q4f']}
                  series={[
                    { data: [4.2,4.3,4.4,4.5,4.6,4.7,4.7,4.6,4.5,4.6,4.8,5.0], color: 'var(--amber)', fill: true, weight: 1.6 },
                    { data: [4.0,4.1,4.2,4.2,4.3,4.4,4.4,4.4,4.3,4.4,4.5,4.6], color: 'var(--ink-3)', fill: false, dashed: true, weight: 0.8 },
                  ]}
                />
              </div>
            </div>

            {/* Map + tenants split */}
            <div style={{flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 0}}>
              <div style={{position: 'relative', borderRight: '1px solid var(--line-1)', display: 'flex'}}>
                <AtlasMap layers={{parcel: true, heat: true, roads: true, topo: true, comps: true}}>
                  <div className="glass" style={{position: 'absolute', top: 12, left: 12, padding: '6px 10px', fontSize: 10}}>
                    <span className="t-eyebrow">subject + 12 comps · 0.4mi</span>
                  </div>
                </AtlasMap>
              </div>
              <div className="panel" style={{border: 0}}>
                <div className="panel-head">
                  <span className="title"><b>02</b> Tenant roster · 12 of 14</span>
                  <span className="actions"><span>by sqft</span><span style={{color: 'var(--amber)'}}>by exp</span><span>by industry</span></span>
                </div>
                <div className="panel-body scroll">
                  <table className="tbl">
                    <thead><tr><th>tenant</th><th>industry</th><th className="num">sqft</th><th>floor</th><th>expiry</th><th>credit</th></tr></thead>
                    <tbody>
                      {[
                        ['Stripe Inc', 'fintech', '18,400', '5–6', '2027 · Q3', 'AA'],
                        ['Notion Labs', 'saas', '9,120', '4', '2026 · Q1', 'A'],
                        ['Figma', 'saas', '6,200', '3', '2028 · Q2', 'AA'],
                        ['Brex', 'fintech', '5,800', '7', '2026 · Q4', 'A'],
                        ['Mercury', 'fintech', '4,200', '7', '2027 · Q1', 'BBB'],
                        ['Linear', 'saas', '3,100', '2', '2026 · Q2', 'A'],
                        ['Retool', 'saas', '2,800', '8', '2028 · Q4', 'A'],
                        ['Glow Capital', 'finance', '2,400', '8', '2027 · Q2', 'A'],
                        ['Hex', 'saas', '2,100', '3', '2026 · Q3', 'BBB'],
                        ['Numeral', 'fintech', '1,900', '2', '2028 · Q1', 'BBB'],
                        ['Posthog', 'saas', '1,380', '8', '2027 · Q4', 'BBB'],
                        ['—vacant—', '—', '18,800', '1, 6', '—', '—'],
                      ].map((r, i) => (
                        <tr key={i} className={r[0].includes('vacant') ? 'on' : ''}>
                          {r.map((c, j) => (
                            <td key={j} className={j === 2 ? 'num' : ''} style={r[0].includes('vacant') ? {color: 'var(--warn)'} : {}}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Right: signals timeline */}
          <div style={{borderLeft: '1px solid var(--line-1)', background: 'var(--bg-1)', display: 'flex', flexDirection: 'column', minHeight: 0}}>
            <div style={{padding: '12px 14px', borderBottom: '1px solid var(--line-1)'}}>
              <div className="t-eyebrow">Signals · since you saved this</div>
              <div className="headline" style={{fontSize: 22, marginTop: 4}}>14 events · 47 days</div>
              <div style={{display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap'}}>
                <span className="badge amber">3 high</span>
                <span className="badge">5 med</span>
                <span className="badge">6 low</span>
              </div>
            </div>
            <div className="scroll" style={{flex: 1, padding: '8px 0'}}>
              {[
                ['hot', '04-27 12:04', 'PERMIT', '2900 16th St', '84-unit MFR adj · 0.3mi'],
                ['warn', '04-26', 'LEASE', 'Stripe sublease listed', '−27% asking · 18.8k sqft'],
                ['amber', '04-22', 'OWNER', 'BREP IX · UCC mod', 'debt restructure signal'],
                ['amber', '04-19', 'COMP', '633 Folsom · $812/sf', '+4% above est'],
                ['', '04-15', 'TAX', 'County · reval pending', 'mailed Q3'],
                ['good', '04-08', 'TRANSIT', 'Muni 22 ext', 'public hearing'],
                ['', '03-30', 'NEWS', 'SF Chronicle · zoning', '16th St overlay'],
                ['', '03-22', 'FILING', 'Hines 10-Q', 'disposition language'],
                ['', '03-12', 'COMP', '350 Mission · 5.2%', 'cap reset'],
                ['amber', '03-04', 'PERMIT', '199 Fremont · TI', 'tenant build-out'],
              ].map((r, i) => (
                <div key={i} className="evt-row" style={{borderBottom: '1px solid var(--line-0)'}}>
                  <span className={"sig " + r[0]} />
                  <span className="time">{r[1]}</span>
                  <div>
                    <div className="badge-mini">{r[2]}</div>
                    <div className="what"><b>{r[3]}</b></div>
                    {r[4] && <div className="dim-2" style={{fontSize: 10}}>{r[4]}</div>}
                  </div>
                  <span className="dim-3">›</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

window.B_Dossier = B_Dossier;
