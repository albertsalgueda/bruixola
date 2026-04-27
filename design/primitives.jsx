// Shared bits used across all wireframes
// Reusable: TopBar, LeftRail, FauxMap, Sparkline, MiniChart, KPIStrip, etc.

const TopBar = ({ title = "ATLAS · real estate intel", crumbs = ["us-portfolio", "san-francisco-bay"], right }) => (
  <div className="topbar">
    <span className="dot" />
    <span className="up" style={{fontWeight: 700, letterSpacing: '0.12em'}}>{title}</span>
    <span className="faint">/</span>
    {crumbs.map((c, i) => (
      <React.Fragment key={i}>
        <span className="crumb">{i === crumbs.length - 1 ? <b>{c}</b> : c}</span>
        {i < crumbs.length - 1 && <span className="faint">/</span>}
      </React.Fragment>
    ))}
    <span style={{flex: 1}} />
    {right || (
      <>
        <span className="pill">live · 12s</span>
        <span className="pill">v 4.7.1</span>
        <span className="dim">analyst@atlas</span>
      </>
    )}
  </div>
);

const LeftRail = ({ active = 0, items = ["▣","◎","≡","◴","☷","⌖","△","✦"] }) => (
  <div className="rail">
    {items.map((c, i) => (
      <div key={i} className={"ic " + (i === active ? "on" : "")}>{c}</div>
    ))}
    <div style={{flex: 1}} />
    <div className="ic">⚙</div>
  </div>
);

// Faux map with parcels, pins, labels
const FauxMap = ({ children, style = {}, dense = false }) => (
  <div className="map" style={{flex: 1, ...style}}>
    {/* fake water/parks already in CSS pseudo */}
    {/* generic district labels */}
    <div className="maplbl" style={{left: '12%', top: '18%'}}>SOMA</div>
    <div className="maplbl" style={{left: '42%', top: '28%'}}>FIDI</div>
    <div className="maplbl" style={{left: '68%', top: '52%'}}>MISSION BAY</div>
    <div className="maplbl" style={{left: '22%', top: '72%'}}>POTRERO</div>
    <div className="maplbl" style={{left: '78%', top: '18%', color: 'var(--ink-faint)'}}>· Bay</div>
    {/* parcels */}
    <div className="parcel" style={{left: '20%', top: '24%', width: 38, height: 28}} />
    <div className="parcel warn" style={{left: '36%', top: '32%', width: 22, height: 30}} />
    <div className="parcel good" style={{left: '46%', top: '38%', width: 44, height: 22}} />
    <div className="parcel ghost" style={{left: '60%', top: '50%', width: 58, height: 36}} />
    <div className="parcel" style={{left: '28%', top: '60%', width: 26, height: 26}} />
    {dense && <>
      <div className="parcel ghost" style={{left: '14%', top: '40%', width: 30, height: 18}} />
      <div className="parcel ghost" style={{left: '52%', top: '64%', width: 18, height: 22}} />
      <div className="parcel warn" style={{left: '70%', top: '40%', width: 16, height: 16}} />
    </>}
    {/* pins */}
    <div className="pin" style={{left: '24%', top: '30%'}} />
    <div className="pin warn" style={{left: '40%', top: '38%'}} />
    <div className="pin good" style={{left: '52%', top: '44%'}} />
    <div className="pin" style={{left: '32%', top: '64%'}} />
    <div className="pin tiny" style={{left: '64%', top: '32%'}} />
    <div className="pin tiny" style={{left: '74%', top: '60%'}} />
    <div className="pin tiny good" style={{left: '18%', top: '50%'}} />
    {dense && <>
      <div className="pin tiny" style={{left: '46%', top: '70%'}} />
      <div className="pin tiny warn" style={{left: '58%', top: '24%'}} />
      <div className="pin tiny" style={{left: '36%', top: '52%'}} />
      <div className="pin tiny good" style={{left: '70%', top: '46%'}} />
    </>}
    {children}
  </div>
);

// Tiny SVG sparkline
const Spark = ({ data = [3,4,3,5,6,5,7,6,8,7,9,8,10], color = "var(--ink-dim)" }) => {
  const w = data.length * 3, h = 14;
  const max = Math.max(...data), min = Math.min(...data);
  return (
    <span className="spark" style={{height: h}}>
      {data.map((v, i) => (
        <i key={i} style={{height: 2 + ((v - min) / (max - min || 1)) * (h - 2), background: color}} />
      ))}
    </span>
  );
};

// Larger area chart placeholder
const AreaChart = ({ height = 80, color = "var(--accent)" }) => {
  const pts = [10,12,11,14,18,16,20,19,24,22,26,30,28,34,32,38,36,42,46,44,50,48,55,52,58];
  const w = 240, h = height;
  const max = Math.max(...pts);
  const path = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i/(pts.length-1))*w} ${h - (v/max)*(h-6) - 3}`).join(' ');
  const area = path + ` L ${w} ${h} L 0 ${h} Z`;
  return (
    <div className="chart" style={{height}}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`g${color.replace(/[^a-z]/gi,'')}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* gridlines */}
        {[0.25,0.5,0.75].map(y => (
          <line key={y} x1="0" x2={w} y1={h*y} y2={h*y} stroke="var(--line)" strokeDasharray="2 3" strokeWidth="0.5" />
        ))}
        <path d={area} fill={`url(#g${color.replace(/[^a-z]/gi,'')})`} />
        <path d={path} stroke={color} strokeWidth="1" fill="none" />
      </svg>
    </div>
  );
};

const KPI = ({ label, value, delta, deltaClass = "good" }) => (
  <div className="kpi">
    <div className="lbl">{label}</div>
    <div className="val">{value}</div>
    {delta && <div className={"delta " + deltaClass}>{delta}</div>}
  </div>
);

// hand-written sticky annotation (like a margin note)
const Annot = ({ children, style = {}, dir = "left" }) => (
  <div className="annot" style={style}>
    {dir === "left" && <span className="arrow" style={{transform: 'rotate(-8deg) scaleX(-1)'}} />}
    <span>{children}</span>
    {dir === "right" && <span className="arrow" />}
  </div>
);

Object.assign(window, { TopBar, LeftRail, FauxMap, Spark, AreaChart, KPI, Annot });
