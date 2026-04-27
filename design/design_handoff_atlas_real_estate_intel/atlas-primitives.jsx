// Atlas v2 — shared primitives: brand mark, rail, map, charts, sparklines

const BrandMark = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10.5" stroke="var(--amber)" strokeWidth="1" fill="none" />
    <circle cx="12" cy="12" r="6" stroke="var(--amber)" strokeWidth="0.6" fill="none" opacity="0.6" />
    <path d="M2 12 L22 12 M12 2 L12 22" stroke="var(--amber)" strokeWidth="0.4" opacity="0.4" />
    <path d="M6 8 L11 14 L15 10 L19 16" stroke="var(--amber)" strokeWidth="1.2" fill="none" />
    <circle cx="11" cy="14" r="1.4" fill="var(--amber)" />
  </svg>
);

const ChromeTop = ({ workspace = "us-portfolio", region = "san-francisco-bay", session = "14:22:08 PT" }) => (
  <div className="chrome-top">
    <div className="brand">
      <BrandMark />
      <div>
        <div className="brand-name">Atlas<b>v4</b></div>
      </div>
    </div>
    <div className="crumbs" style={{paddingLeft: 18}}>
      <span className="live">live</span>
      <span>workspace</span><span className="sep">/</span>
      <span>{workspace}</span><span className="sep">/</span>
      <span className="now">{region}</span>
      <span className="sep">·</span>
      <span className="dim-3">12 layers · 248 parcels in view · feed ok</span>
    </div>
    <div className="chrome-right">
      <span><span className="kbd">⌘K</span> command</span>
      <span><span className="kbd">/</span> search</span>
      <span className="session-clock">{session}</span>
      <span style={{display: 'inline-flex', alignItems: 'center', gap: 6}}>
        <span style={{width: 18, height: 18, borderRadius: '50%', background: 'linear-gradient(135deg, #c9a06b, #6b4f2a)', display: 'inline-block'}} />
        <span className="dim-1">l.salgueda</span>
      </span>
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────
// Side rail with labeled glyphs
// ─────────────────────────────────────────────────────────────
const RailGlyph = ({ kind }) => {
  const props = { width: 16, height: 16, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1 };
  switch (kind) {
    case 'map':    return <svg {...props}><path d="M1 4 L5 2 L11 4 L15 2 L15 12 L11 14 L5 12 L1 14 Z" /><path d="M5 2 L5 12 M11 4 L11 14" /></svg>;
    case 'list':   return <svg {...props}><path d="M2 4 L14 4 M2 8 L14 8 M2 12 L14 12" /></svg>;
    case 'inbox':  return <svg {...props}><path d="M2 9 L2 13 L14 13 L14 9 L11 9 L10 11 L6 11 L5 9 Z" /><path d="M5 6 L8 3 L11 6" /><path d="M8 3 L8 9" /></svg>;
    case 'pipe':   return <svg {...props}><circle cx="3" cy="8" r="2" /><circle cx="13" cy="8" r="2" /><path d="M5 8 L11 8" /></svg>;
    case 'comp':   return <svg {...props}><path d="M2 14 L2 6 L5 6 L5 14 M7 14 L7 2 L10 2 L10 14 M12 14 L12 9 L15 9 L15 14" /></svg>;
    case 'risk':   return <svg {...props}><path d="M8 1 L15 14 L1 14 Z" /><path d="M8 6 L8 10 M8 12 L8 12.5" /></svg>;
    case 'feed':   return <svg {...props}><circle cx="3" cy="13" r="1.5" /><path d="M2 9 A7 7 0 0 1 7 14" /><path d="M2 5 A11 11 0 0 1 11 14" /></svg>;
    case 'doc':    return <svg {...props}><path d="M3 1 L11 1 L13 3 L13 15 L3 15 Z" /><path d="M11 1 L11 3 L13 3 M5 6 L11 6 M5 9 L11 9 M5 12 L9 12" /></svg>;
    default:       return <svg {...props}><circle cx="8" cy="8" r="6" /></svg>;
  }
};

const Rail = ({ active = 'map' }) => {
  const items = [
    ['map', 'Map'], ['list', 'List'], ['inbox', 'Alerts'], ['pipe', 'Deals'],
    ['comp', 'Comps'], ['risk', 'Risk'], ['feed', 'News'], ['doc', 'Files']
  ];
  return (
    <div className="rail">
      {items.map(([k, l]) => (
        <div key={k} className={"rail-item " + (k === active ? "on" : "")}>
          <span className="rail-glyph"><RailGlyph kind={k} /></span>
          <span className="rail-label">{l}</span>
        </div>
      ))}
      <div style={{flex: 1}} />
      <div className="rail-item">
        <span className="rail-glyph"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"><circle cx="8" cy="8" r="2"/><path d="M8 1 L8 4 M8 12 L8 15 M1 8 L4 8 M12 8 L15 8 M3 3 L5 5 M11 11 L13 13 M3 13 L5 11 M11 5 L13 3"/></svg></span>
        <span className="rail-label">Cfg</span>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Atlas Map — layered SVG basemap with parcels and labels
// ─────────────────────────────────────────────────────────────
const AtlasMap = ({ children, layers = { parcel: true, heat: true, roads: true, topo: true }, focus = null }) => {
  // Generate a deterministic-ish set of parcel polygons
  const parcels = React.useMemo(() => {
    const rng = (s) => { let x = s; return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; }; };
    const r = rng(42);
    const out = [];
    for (let i = 0; i < 80; i++) {
      const cx = r() * 100, cy = r() * 100;
      const w = 1 + r() * 3, h = 1 + r() * 3;
      const tone = r();
      out.push({ cx, cy, w, h, tone, id: i });
    }
    return out;
  }, []);

  return (
    <div className="atlas-map">
      <div className="basemap" />
      {/* Topo / contour lines */}
      {layers.topo && (
        <svg className="topo" viewBox="0 0 100 60" preserveAspectRatio="none" style={{width: '100%', height: '100%'}}>
          {[0.15, 0.25, 0.35, 0.5, 0.65].map((y, i) => (
            <path key={i}
              d={`M -5 ${y * 60 + Math.sin(i)*4} Q 25 ${y*60 - 8} 50 ${y*60 + 4} T 105 ${y*60 + Math.cos(i)*4}`}
              stroke="rgba(180,180,140,0.08)" strokeWidth="0.15" fill="none" />
          ))}
          {[0.45, 0.7, 0.85].map((y, i) => (
            <path key={'b'+i}
              d={`M -5 ${y * 60} Q 35 ${y*60 + 6} 60 ${y*60 - 3} T 105 ${y*60 + 5}`}
              stroke="rgba(180,180,140,0.06)" strokeWidth="0.12" fill="none" />
          ))}
        </svg>
      )}
      {/* Roads */}
      {layers.roads && (
        <svg className="roads" viewBox="0 0 100 60" preserveAspectRatio="none" style={{width: '100%', height: '100%'}}>
          {/* major arterials */}
          <path d="M 0 22 L 100 28" stroke="rgba(140,150,130,0.18)" strokeWidth="0.7" fill="none" />
          <path d="M 0 38 L 100 42" stroke="rgba(140,150,130,0.16)" strokeWidth="0.6" fill="none" />
          <path d="M 22 0 L 28 60" stroke="rgba(140,150,130,0.18)" strokeWidth="0.7" fill="none" />
          <path d="M 52 0 L 58 60" stroke="rgba(140,150,130,0.18)" strokeWidth="0.7" fill="none" />
          <path d="M 78 0 L 82 60" stroke="rgba(140,150,130,0.16)" strokeWidth="0.6" fill="none" />
          {/* highway with double line */}
          <path d="M 0 50 Q 30 48 60 52 T 100 48" stroke="rgba(232,178,92,0.25)" strokeWidth="1.0" fill="none" />
          <path d="M 0 50 Q 30 48 60 52 T 100 48" stroke="rgba(232,178,92,0.5)" strokeWidth="0.3" strokeDasharray="1 1" fill="none" />
          {/* minor streets grid */}
          {Array.from({length: 12}).map((_, i) => (
            <line key={'h'+i} x1="0" y1={5 + i*5} x2="100" y2={5 + i*5 + (i%3 === 0 ? 1 : 0)} stroke="rgba(120,130,115,0.07)" strokeWidth="0.18" />
          ))}
          {Array.from({length: 16}).map((_, i) => (
            <line key={'v'+i} x1={5 + i*6} y1="0" x2={5 + i*6 + (i%2 === 0 ? 0.5 : 0)} y2="60" stroke="rgba(120,130,115,0.07)" strokeWidth="0.18" />
          ))}
        </svg>
      )}
      {/* Parcels */}
      {layers.parcel && (
        <svg className="topo" viewBox="0 0 100 60" preserveAspectRatio="none" style={{width: '100%', height: '100%', opacity: 0.9}}>
          {parcels.map(p => (
            <rect key={p.id} x={p.cx} y={p.cy * 0.6} width={p.w} height={p.h * 0.6}
              fill={p.tone > 0.85 ? 'rgba(224,122,95,0.18)' : p.tone > 0.7 ? 'rgba(232,178,92,0.15)' : p.tone > 0.5 ? 'rgba(140,192,111,0.10)' : 'rgba(200,200,180,0.04)'}
              stroke={p.tone > 0.85 ? 'rgba(224,122,95,0.5)' : p.tone > 0.7 ? 'rgba(232,178,92,0.4)' : 'rgba(120,130,115,0.18)'}
              strokeWidth="0.1" />
          ))}
        </svg>
      )}
      {/* Heat overlay */}
      {layers.heat && (
        <div className="heat" style={{
          background:
            'radial-gradient(circle 18% at 30% 35%, rgba(232,178,92,0.45) 0%, transparent 70%),' +
            'radial-gradient(circle 14% at 55% 45%, rgba(224,122,95,0.4) 0%, transparent 70%),' +
            'radial-gradient(circle 10% at 70% 30%, rgba(140,192,111,0.35) 0%, transparent 70%),' +
            'radial-gradient(circle 12% at 22% 60%, rgba(109,180,182,0.28) 0%, transparent 70%)'
        }} />
      )}
      {/* District labels */}
      <div className="district major" style={{left: '22%', top: '12%'}}>SoMa</div>
      <div className="district" style={{left: '50%', top: '20%'}}>FiDi</div>
      <div className="district" style={{left: '32%', top: '46%'}}>Mission</div>
      <div className="district" style={{left: '64%', top: '54%'}}>Mission Bay</div>
      <div className="district" style={{left: '14%', top: '64%'}}>Potrero</div>
      <div className="district" style={{left: '78%', top: '14%', color: 'rgba(120,150,160,0.4)'}}>↟ Bay</div>
      <div className="district" style={{left: '6%', top: '36%', color: 'rgba(120,150,160,0.35)'}}>↟ Bay</div>

      {/* Pins */}
      <div className="pin" style={{left: '24%', top: '26%'}}><div className="ring"/><div className="core"/></div>
      <div className="pin warn" style={{left: '38%', top: '34%'}}><div className="ring"/><div className="core"/></div>
      <div className="pin good" style={{left: '52%', top: '42%'}}><div className="ring"/><div className="core"/></div>
      <div className="pin hot" style={{left: '46%', top: '56%'}}><div className="ring"/><div className="core"/></div>
      <div className="pin tiny" style={{left: '64%', top: '32%'}}><div className="core"/></div>
      <div className="pin tiny" style={{left: '74%', top: '60%'}}><div className="core"/></div>
      <div className="pin tiny good" style={{left: '18%', top: '52%'}}><div className="core"/></div>
      <div className="pin tiny" style={{left: '32%', top: '62%'}}><div className="core"/></div>
      <div className="pin tiny warn" style={{left: '58%', top: '24%'}}><div className="core"/></div>
      <div className="pin tiny" style={{left: '36%', top: '50%'}}><div className="core"/></div>

      {/* Coord readout */}
      <div className="coord-readout">
        <span><b>37.7790°N</b> 122.3987°W</span>
        <span>z <b>14.2</b></span>
        <span>bearing <b>0°</b></span>
        <span>tile <b>4521-018</b></span>
      </div>

      <div className="scale-bar">
        <div className="bar"/>
        <span>0.5 mi</span>
      </div>

      {children}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Sparklines and area charts
// ─────────────────────────────────────────────────────────────
const Sparkline = ({ data, width = 80, height = 28, color = "var(--amber)", filled = true, range }) => {
  const max = range ? range[1] : Math.max(...data);
  const min = range ? range[0] : Math.min(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * width, height - 2 - ((v - min) / span) * (height - 4)]);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = path + ` L ${width} ${height} L 0 ${height} Z`;
  const id = `sg-${Math.random().toString(36).slice(2,7)}`;
  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {filled && (
        <>
          <defs>
            <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.5" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${id})`} />
        </>
      )}
      <path d={path} stroke={color} strokeWidth="1" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {/* end dot */}
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="1.6" fill={color} />
    </svg>
  );
};

const TimeSeries = ({ height = 160, series = [], yAxis = true, xLabels = ['24Q3','24Q4','25Q1','25Q2','25Q3','25Q4','26Q1','now'] }) => {
  const W = 600, H = height;
  const pad = { l: 32, r: 12, t: 10, b: 22 };
  const allVals = series.flatMap(s => s.data);
  const max = Math.max(...allVals) * 1.05;
  const min = Math.min(...allVals) * 0.95;
  const span = max - min;
  const x = (i, n) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:'block'}}>
      {/* gridlines */}
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
        <line key={i} x1={pad.l} x2={W - pad.r} y1={pad.t + t*(H-pad.t-pad.b)} y2={pad.t + t*(H-pad.t-pad.b)}
          stroke="var(--line-1)" strokeWidth="0.5" strokeDasharray={i === 4 ? '0' : '2 3'} />
      ))}
      {/* y-axis labels */}
      {yAxis && [0, 0.25, 0.5, 0.75, 1].map((t, i) => {
        const v = max - t * span;
        return <text key={i} x={pad.l - 6} y={pad.t + t*(H-pad.t-pad.b) + 3}
          fontFamily="var(--mono)" fontSize="9" fill="var(--ink-3)" textAnchor="end">{v.toFixed(0)}</text>;
      })}
      {/* x-axis labels */}
      {xLabels.map((l, i) => (
        <text key={i} x={x(i, xLabels.length)} y={H - 6}
          fontFamily="var(--mono)" fontSize="9" fill="var(--ink-3)" textAnchor="middle">{l}</text>
      ))}
      {/* series */}
      {series.map((s, idx) => {
        const pts = s.data.map((v, i) => [x(i, s.data.length), y(v)]);
        const path = pts.map((p, i) => `${i===0?'M':'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
        const area = path + ` L ${pts[pts.length-1][0]} ${H - pad.b} L ${pts[0][0]} ${H - pad.b} Z`;
        const id = `ts-${idx}-${Math.random().toString(36).slice(2,5)}`;
        return (
          <g key={idx}>
            {s.fill && (
              <>
                <defs>
                  <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={s.color} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={area} fill={`url(#${id})`} />
              </>
            )}
            <path d={path} stroke={s.color} strokeWidth={s.weight || 1.2} fill="none"
              strokeDasharray={s.dashed ? '3 3' : '0'} />
            {/* end dot */}
            <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2" fill={s.color} />
          </g>
        );
      })}
    </svg>
  );
};

// Bar / column chart
const BarChart = ({ data, height = 80, color = "var(--amber)" }) => {
  const W = 240, H = height;
  const max = Math.max(...data);
  const bw = W / data.length;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {data.map((v, i) => (
        <rect key={i} x={i * bw + 1} y={H - (v / max) * (H - 4) - 2}
          width={bw - 2} height={(v / max) * (H - 4)}
          fill={color} opacity={0.4 + (v/max)*0.6} />
      ))}
    </svg>
  );
};

// Distribution / histogram
const Histogram = ({ data, height = 60, marker, color = "var(--cyan)" }) => {
  const W = 200, H = height;
  const max = Math.max(...data);
  const bw = W / data.length;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      {data.map((v, i) => (
        <rect key={i} x={i*bw} y={H - (v/max)*(H-2)} width={bw - 0.5} height={(v/max)*(H-2)}
          fill={color} opacity="0.5" />
      ))}
      {marker !== undefined && (
        <line x1={marker * W} x2={marker * W} y1="0" y2={H} stroke="var(--amber)" strokeWidth="1.2" strokeDasharray="2 2" />
      )}
    </svg>
  );
};

Object.assign(window, { BrandMark, ChromeTop, Rail, AtlasMap, Sparkline, TimeSeries, BarChart, Histogram });
