import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

// ── EBP numerical solver ──────────────────────────────────────────────────────
function solveEBP({ omega_rpm, eta0_mPas, h0_um, E_nm_s, n, rho, dt, t_max }) {
  const omega = omega_rpm * 2 * Math.PI / 60;       // rad/s
  const eta0  = eta0_mPas * 1e-3;                    // Pa·s
  const h0    = h0_um    * 1e-6;                     // m
  const E     = E_nm_s   * 1e-9;                     // m/s

  const results = [];
  let h = h0;
  let t = 0;
  let t_gel = null;

  const A = 2 * rho * omega * omega / 3;             // centrifugal coeff

  while (t <= t_max && h > h0 * 0.01) {
    const eta = eta0 * Math.pow(h0 / h, n);
    const dhdt = -(A * h * h * h / eta) - E;

    // gelation: centrifugal term ≈ E
    if (t_gel === null && Math.abs(A * h * h * h / eta) < Math.abs(E) * 1.05) {
      t_gel = t;
    }

    results.push({
      t: parseFloat(t.toFixed(3)),
      h_um: parseFloat((h * 1e6).toFixed(4)),
      eta_rel: parseFloat((eta / eta0).toFixed(2)),
    });

    h += dhdt * dt;
    if (h < 0) h = 0;
    t += dt;
  }

  return { results, t_gel, h_final: h * 1e6 };
}

// ── Radial profile solver ─────────────────────────────────────────────────────
function solveRadial({ omega_rpm, eta0_mPas, h0_um, E_nm_s, n, rho, t_eval, Nr }) {
  const omega = omega_rpm * 2 * Math.PI / 60;
  const eta0  = eta0_mPas * 1e-3;
  const h0    = h0_um    * 1e-6;
  const E     = E_nm_s   * 1e-9;
  const R     = 0.1;                                  // wafer radius 10 cm
  const dr    = R / (Nr - 1);
  const dt    = 1e-4;

  let h = new Array(Nr).fill(h0);
  let t = 0;

  while (t < t_eval) {
    const h_new = [...h];
    for (let i = 0; i < Nr; i++) {
      const r   = i * dr;
      const eta = eta0 * Math.pow(h0 / Math.max(h[i], h0 * 0.01), n);
      const A   = 2 * rho * omega * omega / 3;
      let conv  = 0;
      if (i > 0 && i < Nr - 1) {
        const dhdr = (h[i] - h[i - 1]) / dr;
        conv = (rho * omega * omega * r * h[i] * h[i] / eta) * dhdr;
      }
      const dhdt = -(A * h[i] * h[i] * h[i] / eta) - E - conv;
      h_new[i] = Math.max(h[i] + dhdt * dt, 0);
    }
    h = h_new;
    t += dt;
  }

  return h.map((hi, i) => ({
    r_mm: parseFloat((i * dr * 1000).toFixed(1)),
    h_um: parseFloat((hi * 1e6).toFixed(4)),
  }));
}

// ── Slider component ──────────────────────────────────────────────────────────
function Slider({ label, unit, value, min, max, step, onChange, info }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 13, color: "#ccc", fontFamily: "monospace" }}>
          {label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#7dd3fc", fontFamily: "monospace" }}>
          {value} {unit}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "#38bdf8", cursor: "pointer" }}
      />
      {info && <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{info}</div>}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [params, setParams] = useState({
    omega_rpm: 3000,
    eta0_mPas: 10,
    h0_um:     10,
    E_nm_s:    50,
    n:         3.5,
    rho:       1100,
  });
  const [data, setData]         = useState({ results: [], t_gel: null, h_final: null });
  const [radial, setRadial]     = useState([]);
  const [t_eval, setTeval]      = useState(10);
  const [tab, setTab]           = useState("ht");   // "ht" | "radial" | "eta"
  const [running, setRunning]   = useState(false);

  const run = useCallback(() => {
    setRunning(true);
    setTimeout(() => {
      const res = solveEBP({ ...params, dt: 1e-4, t_max: 120 });
      setData(res);
      const rad = solveRadial({ ...params, t_eval, Nr: 50 });
      setRadial(rad);
      setRunning(false);
    }, 10);
  }, [params, t_eval]);

  useEffect(() => { run(); }, [run]);

  const set = (key) => (val) => setParams(p => ({ ...p, [key]: val }));

  // uniformity from radial profile
  const uniformity = (() => {
    if (radial.length < 2) return null;
    const vals = radial.map(d => d.h_um);
    const hc   = vals[0];
    const he   = vals[vals.length - 1];
    const pct  = Math.abs((he - hc) / hc * 100);
    return { hc: hc.toFixed(3), he: he.toFixed(3), pct: pct.toFixed(2) };
  })();

  const styles = {
    app: {
      minHeight: "100vh",
      background: "#0a0f1e",
      color: "#e2e8f0",
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      padding: "0 0 60px",
    },
    header: {
      background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
      borderBottom: "1px solid #1e3a5f",
      padding: "28px 40px 24px",
    },
    title: {
      fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0,
      letterSpacing: "-0.5px",
    },
    subtitle: { fontSize: 13, color: "#64748b", marginTop: 4 },
    body: {
      display: "grid",
      gridTemplateColumns: "280px 1fr",
      gap: 24,
      maxWidth: 1200,
      margin: "28px auto 0",
      padding: "0 24px",
    },
    panel: {
      background: "#0f172a",
      border: "1px solid #1e293b",
      borderRadius: 12,
      padding: "20px 18px",
    },
    panelTitle: {
      fontSize: 11, fontWeight: 600, color: "#475569",
      textTransform: "uppercase", letterSpacing: "0.1em",
      marginBottom: 20,
    },
    right: { display: "flex", flexDirection: "column", gap: 16 },
    metrics: {
      display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12,
    },
    metric: {
      background: "#0f172a", border: "1px solid #1e293b",
      borderRadius: 10, padding: "14px 16px",
    },
    metricLabel: { fontSize: 11, color: "#475569", marginBottom: 4 },
    metricValue: { fontSize: 20, fontWeight: 700, color: "#7dd3fc", fontFamily: "monospace" },
    metricUnit: { fontSize: 11, color: "#475569", marginLeft: 4 },
    chartBox: {
      background: "#0f172a", border: "1px solid #1e293b",
      borderRadius: 12, padding: "20px 16px",
    },
    tabs: { display: "flex", gap: 8, marginBottom: 16 },
    tab: (active) => ({
      padding: "6px 16px", borderRadius: 6, fontSize: 12, fontWeight: 500,
      cursor: "pointer", border: "none",
      background: active ? "#0ea5e9" : "#1e293b",
      color: active ? "#fff" : "#64748b",
      transition: "all 0.15s",
    }),
    warn: (ok) => ({
      display: "inline-block",
      fontSize: 11, padding: "3px 10px", borderRadius: 999,
      background: ok ? "#14532d" : "#7f1d1d",
      color: ok ? "#86efac" : "#fca5a5",
      marginLeft: 8,
    }),
  };

  const h_final   = data.h_final?.toFixed(3) ?? "—";
  const t_gel_s   = data.t_gel != null ? data.t_gel.toFixed(1) : "—";
  const Re        = (params.rho * (params.omega_rpm * 2 * Math.PI / 60) *
                    (params.h0_um * 1e-6) ** 2 / (params.eta0_mPas * 1e-3)).toExponential(1);
  const Re_ok     = parseFloat(Re) < 0.01;

  return (
    <div style={styles.app}>
      <div style={styles.header}>
        <div style={styles.title}>
          Spin Coating EBP Simulator
          <span style={{ fontSize: 12, fontWeight: 400, color: "#475569", marginLeft: 12 }}>
            Emslie-Bonner-Peck | Forward Euler FDM
          </span>
        </div>
        <div style={styles.subtitle}>
          SKKU Chemical Engineering · Fluid Mechanics Term Project 2026
        </div>
      </div>

      <div style={styles.body}>
        {/* ── Left panel: parameters ── */}
        <div style={styles.panel}>
          <div style={styles.panelTitle}>Parameters</div>
          <Slider label="ω (spin speed)"   unit="rpm"   value={params.omega_rpm} min={500}  max={8000} step={100}  onChange={set("omega_rpm")} info="Higher ω → thinner film" />
          <Slider label="η₀ (viscosity)"   unit="mPa·s" value={params.eta0_mPas} min={1}    max={100}  step={0.5}  onChange={set("eta0_mPas")} info="Initial viscosity of PR solution" />
          <Slider label="h₀ (init thick)"  unit="μm"    value={params.h0_um}     min={1}    max={50}   step={0.5}  onChange={set("h0_um")}    info="Initial film thickness" />
          <Slider label="E (evaporation)"  unit="nm/s"  value={params.E_nm_s}    min={0}    max={200}  step={1}    onChange={set("E_nm_s")}   info="Solvent evaporation rate" />
          <Slider label="n (viscosity exp)" unit=""      value={params.n}          min={1}    max={6}    step={0.1}  onChange={set("n")}        info="Meyerhofer power-law exponent" />
          <Slider label="ρ (density)"      unit="kg/m³" value={params.rho}        min={800}  max={1400} step={10}   onChange={set("rho")}      />

          <div style={{ borderTop: "1px solid #1e293b", paddingTop: 14, marginTop: 4 }}>
            <div style={styles.panelTitle}>Radial profile at t =</div>
            <Slider label="t_eval" unit="s" value={t_eval} min={1} max={60} step={1} onChange={setTeval} />
          </div>

          <div style={{
            background: "#020817", borderRadius: 8, padding: "10px 12px",
            fontSize: 12, fontFamily: "monospace", color: "#64748b", lineHeight: 1.7,
          }}>
            <div>Re = <span style={{ color: Re_ok ? "#86efac" : "#fca5a5" }}>{Re}</span>
              <span style={styles.warn(Re_ok)}>{Re_ok ? "lubrication ✓" : "Re not ≪ 1 !"}</span>
            </div>
          </div>
        </div>

        {/* ── Right: metrics + charts ── */}
        <div style={styles.right}>
          <div style={styles.metrics}>
            <div style={styles.metric}>
              <div style={styles.metricLabel}>Final thickness</div>
              <div><span style={styles.metricValue}>{h_final}</span><span style={styles.metricUnit}>μm</span></div>
            </div>
            <div style={styles.metric}>
              <div style={styles.metricLabel}>Gelation time</div>
              <div><span style={styles.metricValue}>{t_gel_s}</span><span style={styles.metricUnit}>s</span></div>
            </div>
            <div style={styles.metric}>
              <div style={styles.metricLabel}>Uniformity (edge/center)</div>
              <div>
                <span style={{ ...styles.metricValue, color: uniformity && parseFloat(uniformity.pct) < 2 ? "#86efac" : "#fca5a5" }}>
                  {uniformity ? uniformity.pct : "—"}
                </span>
                <span style={styles.metricUnit}>%</span>
              </div>
            </div>
            <div style={styles.metric}>
              <div style={styles.metricLabel}>Re</div>
              <div><span style={{ ...styles.metricValue, fontSize: 16, color: Re_ok ? "#86efac" : "#fca5a5" }}>{Re}</span></div>
            </div>
          </div>

          <div style={styles.chartBox}>
            <div style={styles.tabs}>
              {[["ht","h(t) — thickness vs time"],["radial","h(r) — radial profile"],["eta","η(t) — viscosity"]].map(([k, label]) => (
                <button key={k} style={styles.tab(tab === k)} onClick={() => setTab(k)}>{label}</button>
              ))}
            </div>

            {tab === "ht" && (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={data.results} margin={{ top: 8, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="t" label={{ value: "time (s)", position: "insideBottom", offset: -12, fill: "#64748b", fontSize: 12 }} tick={{ fill: "#64748b", fontSize: 11 }} />
                  <YAxis label={{ value: "h (μm)", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 12 }} tick={{ fill: "#64748b", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }} labelFormatter={v => `t = ${v} s`} formatter={v => [`${v} μm`, "h"]} />
                  <Line type="monotone" dataKey="h_um" stroke="#38bdf8" dot={false} strokeWidth={2} name="h (μm)" />
                  {data.t_gel != null && (
                    <Line type="monotone" data={[{ t: data.t_gel, h_um: 0 }, { t: data.t_gel, h_um: params.h0_um }]}
                      dataKey="h_um" stroke="#f97316" dot={false} strokeDasharray="4 4" strokeWidth={1.5} name="t_gel" />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}

            {tab === "radial" && (
              <>
                <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                  Radial thickness profile at t = {t_eval} s
                  {uniformity && (
                    <span style={{ marginLeft: 12, color: "#94a3b8" }}>
                      center: {uniformity.hc} μm · edge: {uniformity.he} μm · deviation: {uniformity.pct}%
                      <span style={styles.warn(parseFloat(uniformity.pct) < 2)}>
                        {parseFloat(uniformity.pct) < 2 ? "±2% spec ✓" : "spec fail ✗"}
                      </span>
                    </span>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={radial} margin={{ top: 8, right: 20, bottom: 20, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="r_mm" label={{ value: "r (mm)", position: "insideBottom", offset: -12, fill: "#64748b", fontSize: 12 }} tick={{ fill: "#64748b", fontSize: 11 }} />
                    <YAxis label={{ value: "h (μm)", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 12 }} tick={{ fill: "#64748b", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }} formatter={v => [`${v} μm`, "h"]} />
                    <Line type="monotone" dataKey="h_um" stroke="#a78bfa" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </>
            )}

            {tab === "eta" && (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={data.results} margin={{ top: 8, right: 20, bottom: 20, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="t" label={{ value: "time (s)", position: "insideBottom", offset: -12, fill: "#64748b", fontSize: 12 }} tick={{ fill: "#64748b", fontSize: 11 }} />
                  <YAxis label={{ value: "η/η₀", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 12 }} tick={{ fill: "#64748b", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }} labelFormatter={v => `t = ${v} s`} formatter={v => [`${v}×`, "η/η₀"]} />
                  <Line type="monotone" dataKey="eta_rel" stroke="#34d399" dot={false} strokeWidth={2} name="η/η₀" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* equation reference */}
          <div style={{
            background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12,
            padding: "16px 20px", fontSize: 12, color: "#475569", lineHeight: 1.8,
            fontFamily: "monospace",
          }}>
            <span style={{ color: "#64748b", fontWeight: 600 }}>EBP ODE: </span>
            <span style={{ color: "#94a3b8" }}>dh/dt = −2ρω²h³/(3η(t)) − E</span>
            <span style={{ marginLeft: 24, color: "#64748b", fontWeight: 600 }}>Meyerhofer: </span>
            <span style={{ color: "#94a3b8" }}>η(t) = η₀·(h₀/h)ⁿ</span>
            <span style={{ marginLeft: 24, color: "#64748b", fontWeight: 600 }}>Scheme: </span>
            <span style={{ color: "#94a3b8" }}>Forward Euler, Δt = 0.1 ms</span>
          </div>
        </div>
      </div>
    </div>
  );
}
