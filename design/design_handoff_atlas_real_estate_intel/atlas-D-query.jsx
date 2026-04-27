// Atlas v2 — Direction D: Query-first / NL command mode
const D_QueryFirst = () => (
  <div className="atlas">
    <ChromeTop />
    <div style={{display: 'flex', flex: 1, minHeight: 0}}>
      <Rail active="list" />
      <div style={{flex: 1, position: 'relative', display: 'flex', minWidth: 0}}>
        <div style={{flex: 1, display: 'flex', minHeight: 0, opacity: 0.55}}>
          <AtlasMap layers={{parcel: true, heat: true, roads: true, topo: true}} />
        </div>
        <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 30%, rgba(0,0,0,0.55), rgba(0,0,0,0.85) 80%)', pointerEvents: 'none'}}/>

        {/* Mega search */}
        <div className="megasearch" style={{position: 'absolute', top: '12%', left: '50%', transform: 'translateX(-50%)', width: 760, zIndex: 5}}>
          <div className="input-row">
            <span className="glyph">⌕</span>
            <span className="text">
              show me <span className="highlight">class-A office</span> in <span className="highlight">SoMa</span> where <span className="highlight">lease rolls before EOY 2026</span> and <span className="highlight">vacancy &gt; 15%</span>
              <span className="typing-cursor"/>
            </span>
            <span className="kbd">↵</span>
          </div>
          <div style={{padding: '10px 18px', display: 'flex', gap: 8, borderBottom: '1px solid var(--line-1)', flexWrap: 'wrap', alignItems: 'center'}}>
            <span className="t-eyebrow">parsed</span>
            <span className="chip on">asset = office</span>
            <span className="chip on">class = A</span>
            <span className="chip on">geo ∈ SoMa</span>
            <span className="chip on">lease.exp &lt; 2026-12-31</span>
            <span className="chip on">vacancy &gt; 0.15</span>
            <span style={{flex: 1}}/>
            <span className="dim-3" style={{fontSize: 10}}>32 matches · 0.41s · model atlas-q4</span>
          </div>
          <div>
            <div className="t-eyebrow" style={{padding: '8px 18px 4px'}}>matches</div>
            {[
              ['488 Brannan St', '84.2k · 22.4% vac · roll 27Q3', '$108M', 'AA'],
              ['215 Townsend',   '62.0k · 11.0% vac · roll 26Q1', ' $84M', 'A'],
              ['1455 Market St', '1.2M · 18.6% vac · roll 26Q4',  '$612M', 'A'],
              ['85 2nd St',      '97k · 14.2% vac · roll 26Q2',   '$118M', 'A'],
              ['350 Mission',    '460k · 6.2% vac · roll 27Q1',   '$420M', 'AA'],
            ].map((r, i) => (
              <div key={i} style={{display: 'grid', gridTemplateColumns: '170px 1fr 90px 40px', gap: 12, padding: '7px 18px', fontSize: 11, fontFamily: 'var(--mono)', borderTop: '1px solid var(--line-1)', alignItems: 'baseline', cursor: 'pointer'}}
                onMouseEnter={e => e.currentTarget.style.background='var(--bg-2)'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <span className="t-serif" style={{fontSize: 14}}>{r[0]}</span>
                <span className="dim-2">{r[1]}</span>
                <span className="t-num">{r[2]}</span>
                <span className="badge amber">{r[3]}</span>
              </div>
            ))}
          </div>
          <div style={{padding: '10px 18px', borderTop: '1px solid var(--line-1)', fontSize: 9.5, color: 'var(--ink-3)', display: 'flex', gap: 16, fontFamily: 'var(--mono)'}}>
            <span><span className="kbd">↑↓</span> navigate</span>
            <span><span className="kbd">↵</span> open</span>
            <span><span className="kbd">⇧↵</span> on map</span>
            <span><span className="kbd">⌘S</span> save</span>
            <span><span className="kbd">⌘E</span> export</span>
            <span style={{flex: 1}}/>
            <span className="amber">↗ explain query</span>
          </div>
        </div>

        {/* Saved queries */}
        <div className="glass" style={{position: 'absolute', left: 18, top: 18, width: 220, padding: 10, zIndex: 5}}>
          <div className="t-eyebrow" style={{marginBottom: 6}}>Saved queries · 12</div>
          {['SoMa · roll < 2026','MFR · cap > 5.5','Permits · 30d','Off-market candidates','Owners · > 5 props','Fintech tenants exp 26'].map((q, i) => (
            <div key={i} style={{padding: '3px 0', fontFamily: 'var(--mono)', fontSize: 10.5, color: i === 0 ? 'var(--amber)' : 'var(--ink-2)'}}>› {q}</div>
          ))}
        </div>

        {/* Recent */}
        <div className="glass" style={{position: 'absolute', right: 18, top: 18, width: 220, padding: 10, zIndex: 5}}>
          <div className="t-eyebrow" style={{marginBottom: 6}}>Suggestions</div>
          <div className="t-serif-i dim-1" style={{fontSize: 12, lineHeight: 1.4}}>
            "owners with refi due 2026 in your watchlist"<br/>
            "comps within 0.3mi of 488 Brannan"<br/>
            "permits adjacent to my pipeline"
          </div>
        </div>
      </div>
    </div>
  </div>
);

window.D_QueryFirst = D_QueryFirst;
