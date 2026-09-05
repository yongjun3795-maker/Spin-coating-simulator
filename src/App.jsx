import { useState, useEffect, useMemo, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { solveEBP, solveRadial, spinCurve, reducedRe } from "./physics";

const C = {
  bg: "#0a0f1e", panel: "#0f172a", line: "#1e293b", deep: "#020817",
  text: "#e2e8f0", dim: "#64748b", faint: "#475569",
  cyan: "#38bdf8", cyanSoft: "#7dd3fc", amber: "#fbbf24",
  violet: "#a78bfa", green: "#34d399", orange: "#f97316",
  ok: "#86efac", bad: "#fca5a5", okBg: "#14532d", badBg: "#7f1d1d",
};

const TABS = [
  ["spin", "스핀 커브 — h vs ω"],
  ["ht", "h(t) — 두께"],
  ["radial", "h(r) — 평탄화"],
  ["eta", "η(t) — 점도"],
];

function Slider({ label, unit, value, min, max, step, onChange, info }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 12.5, color: "#cbd5e1", fontFamily: "monospace" }}>{label}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: C.cyanSoft, fontFamily: "monospace" }}>
          {value} {unit}
        </span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: C.cyan, cursor: "pointer" }}
      />
      {info && <div style={{ fontSize: 10.5, color: C.faint, marginTop: 2 }}>{info}</div>}
    </div>
  );
}

function Metric({ label, value, unit, tone }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: "13px 15px" }}>
      <div style={{ fontSize: 10.5, color: C.faint, marginBottom: 4, lineHeight: 1.3 }}>{label}</div>
      <div>
        <span style={{ fontSize: 20, fontWeight: 700, fontFamily: "monospace", color: tone || C.cyanSoft }}>
          {value}
        </span>
        {unit && <span style={{ fontSize: 11, color: C.faint, marginLeft: 4 }}>{unit}</span>}
      </div>
    </div>
  );
}

const axis = { tick: { fill: C.dim, fontSize: 11 }, stroke: C.line };
const tip = {
  contentStyle: { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, fontSize: 12 },
  labelStyle: { color: C.dim },
};

export default function App() {
  const [p, setP] = useState({
    omega_rpm: 3000, eta0_mPas: 10, h0_um: 10, E_nm_s: 50, n: 3.5, rho: 1100,
  });
  const [tEval, setTEval] = useState(10);
  const [bump, setBump] = useState(35);
  const [tab, setTab] = useState("spin");
  const [busy, setBusy] = useState(false);

  // 슬라이더를 끄는 동안 매 프레임 다시 풀지 않는다 — 200 ms 쉰 뒤 한 번만
  const [settled, setSettled] = useState(p);
  const [settledUI, setSettledUI] = useState({ tEval, bump });
  const timer = useRef();
  useEffect(() => {
    setBusy(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setSettled(p);
      setSettledUI({ tEval, bump });
      setBusy(false);
    }, 200);
    return () => clearTimeout(timer.current);
  }, [p, tEval, bump]);

  const ebp = useMemo(() => solveEBP(settled), [settled]);
  const radial = useMemo(
    () => solveRadial(settled, { tEval: settledUI.tEval, bump: settledUI.bump / 100 }),
    [settled, settledUI]
  );
  const spin = useMemo(() => spinCurve(settled), [settled]);

  const set = (k) => (v) => setP((q) => ({ ...q, [k]: v }));

  const Re = reducedRe(p);
  const ReOk = Re < 0.01;
  const showAnalytical = p.E_nm_s === 0 && p.n <= 0.1;

  // 지수 판정 — 증발이 있으면 -1/2 근처가 기대값
  const expo = spin.exponent;
  const theory = spin.theory;
  // 판정 기준은 "-1/2 인가" 가 아니라 "해석 예측과 맞는가" 다
  const matches = expo != null && theory != null && Math.abs(expo - theory) < 0.01;
  const expoTone = expo == null ? C.dim : matches ? C.ok : C.amber;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text,
                  fontFamily: "'Inter','Segoe UI',sans-serif", paddingBottom: 60 }}>
      <header style={{ background: "linear-gradient(135deg,#0f172a,#1e293b)",
                       borderBottom: "1px solid #1e3a5f", padding: "26px 40px 22px" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", letterSpacing: "-0.4px" }}>
          Spin Coating EBP Simulator
          <span style={{ fontSize: 12, fontWeight: 400, color: C.faint, marginLeft: 12 }}>
            Emslie–Bonner–Peck · 적응 스텝 적분 · 보존형 유한체적
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: C.dim, marginTop: 4 }}>
          포토레지스트 도포 공정 — 회전수와 용매 증발이 최종 막 두께를 어떻게 정하는가
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "290px 1fr", gap: 22,
                    maxWidth: 1220, margin: "26px auto 0", padding: "0 24px" }}>
        {/* 좌측 — 파라미터 */}
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "18px 17px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 600, color: C.faint, textTransform: "uppercase",
                        letterSpacing: ".1em", marginBottom: 16 }}>공정 조건</div>

          <Slider label="ω 회전수" unit="rpm" value={p.omega_rpm} min={500} max={8000} step={100}
                  onChange={set("omega_rpm")} info="빠를수록 얇아진다" />
          <Slider label="η₀ 초기 점도" unit="mPa·s" value={p.eta0_mPas} min={1} max={100} step={0.5}
                  onChange={set("eta0_mPas")} info="PR 용액의 점도" />
          <Slider label="h₀ 초기 두께" unit="µm" value={p.h0_um} min={1} max={50} step={0.5}
                  onChange={set("h0_um")} info="디스펜스 직후" />
          <Slider label="E 증발 속도" unit="nm/s" value={p.E_nm_s} min={0} max={200} step={1}
                  onChange={set("E_nm_s")} info="0 이면 겔화가 없다" />
          <Slider label="n 점도 지수" unit="" value={p.n} min={0} max={6} step={0.1}
                  onChange={set("n")} info="η = η₀(h₀/h)ⁿ · 0 이면 상수 점도" />
          <Slider label="ρ 밀도" unit="kg/m³" value={p.rho} min={800} max={1400} step={10}
                  onChange={set("rho")} />

          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 13, marginTop: 6 }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, color: C.faint, textTransform: "uppercase",
                          letterSpacing: ".1em", marginBottom: 12 }}>평탄화 탭 설정</div>
            <Slider label="t 평가 시각" unit="s" value={tEval} min={1} max={40} step={1} onChange={setTEval} />
            <Slider label="초기 중앙 과잉" unit="%" value={bump} min={0} max={80} step={5} onChange={setBump}
                    info="0 이면 균일 — 균일이 유지되는지가 솔버 검증" />
          </div>

          <div style={{ background: C.deep, borderRadius: 8, padding: "10px 12px", fontSize: 11.5,
                        fontFamily: "monospace", color: C.dim, lineHeight: 1.7 }}>
            <div>
              Re = <span style={{ color: ReOk ? C.ok : C.bad }}>{Re.toExponential(1)}</span>
              <span style={{ display: "inline-block", fontSize: 10, padding: "2px 8px", borderRadius: 999,
                             marginLeft: 8, background: ReOk ? C.okBg : C.badBg, color: ReOk ? C.ok : C.bad }}>
                {ReOk ? "윤활 근사 ✓" : "Re ≪ 1 아님"}
              </span>
            </div>
            {showAnalytical && <div style={{ color: C.amber, marginTop: 4 }}>▲ 해석해 비교 활성 (E=0, n=0)</div>}
            {ebp.hitCap && <div style={{ color: C.bad, marginTop: 4 }}>▲ 스텝 상한 도달 — 결과 신뢰 주의</div>}
            {busy && <div style={{ color: C.faint, marginTop: 4 }}>계산 중…</div>}
          </div>
        </div>

        {/* 우측 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 11 }}>
            <Metric label="최종 두께" value={ebp.hFinal_um.toFixed(3)} unit="µm" />
            <Metric label="겔화 시각" value={ebp.tGel != null ? ebp.tGel.toFixed(1) : "—"} unit="s" />
            <Metric label={theory != null ? `스핀 지수 p — 이론 ${theory.toFixed(3)}` : "스핀 지수 p (h ∝ ωᵖ)"}
                    value={expo != null ? expo.toFixed(3) : "—"} tone={expoTone} />
            <Metric label={`평탄화 후 불균일도 (t=${settledUI.tEval}s)`}
                    value={radial.nonUniformity_pct.toFixed(2)} unit="%"
                    tone={radial.nonUniformity_pct < 2 ? C.ok : C.bad} />
          </div>

          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12, padding: "18px 16px" }}>
            <div style={{ display: "flex", gap: 7, marginBottom: 14, flexWrap: "wrap" }}>
              {TABS.map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                  style={{ padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 500,
                           cursor: "pointer", border: "none", transition: "all .15s",
                           background: tab === k ? "#0ea5e9" : C.line,
                           color: tab === k ? "#fff" : C.dim }}>
                  {label}
                </button>
              ))}
            </div>

            {tab === "spin" && (
              <>
                <div style={{ fontSize: 12, color: C.dim, marginBottom: 10, lineHeight: 1.6 }}>
                  회전수를 500 → 8000 rpm 로 훑어 <b style={{ color: C.text }}>겔화 시점의 두께</b>를 뽑고
                  로그-로그 회귀했다.
                  {expo != null && (
                    <>
                      {" "}기울기 <b style={{ color: expoTone }}>p = {expo.toFixed(3)}</b>
                      <span style={{ color: C.faint }}> (R² = {spin.r2.toFixed(4)})</span>.
                    </>
                  )}
                  {theory != null ? (
                    <div style={{ marginTop: 6 }}>
                      겔화 조건 2ρω²h<sup>(3+n)</sup>/(3η₀h₀ⁿ) = E 를 풀면{" "}
                      <b style={{ color: C.text }}>h ∝ ω<sup>−2/(3+n)</sup></b>,
                      지금 n = {p.n} 이므로 이론값은{" "}
                      <b style={{ color: C.cyanSoft }}>{theory.toFixed(3)}</b> 이다.
                      {matches
                        ? " 수치해가 여기에 붙는다 — 적분기 검증이 된다."
                        : " 아직 벌어져 있다 — 적분 구간이나 스텝을 의심할 것."}
                      <span style={{ color: C.amber }}>
                        {" "}n = 1 로 두면 정확히 −1/2 가 되어 실험 경험식과 만난다.
                      </span>
                    </div>
                  ) : (
                    <div style={{ marginTop: 6, color: C.amber }}>
                      증발이 0 이라 겔화가 없다 — 막이 계속 얇아지므로 두께가 고정되지 않는다.
                      E 를 올려야 스핀 커브가 공정에서 쓰는 의미를 갖는다.
                    </div>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={310}>
                  <LineChart data={spin.points} margin={{ top: 8, right: 20, bottom: 22, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                    <XAxis dataKey="rpm" scale="log" domain={["auto", "auto"]} type="number" {...axis}
                           label={{ value: "ω (rpm, 로그)", position: "insideBottom", offset: -12, fill: C.dim, fontSize: 12 }} />
                    <YAxis scale="log" domain={["auto", "auto"]} {...axis}
                           tickFormatter={(v) => Number(v).toPrecision(2)}
                           label={{ value: "최종 h (µm, 로그)", angle: -90, position: "insideLeft", fill: C.dim, fontSize: 12 }} />
                    <Tooltip {...tip} formatter={(v, k) => [`${v} µm`, k === "h_um" ? "시뮬레이션" : "멱함수 적합"]}
                             labelFormatter={(v) => `${v} rpm`} />
                    <Legend wrapperStyle={{ fontSize: 12, color: C.dim }} />
                    <Line type="monotone" dataKey="h_um" stroke={C.cyan} strokeWidth={2} dot={{ r: 2.5 }} name="시뮬레이션" />
                    <Line type="monotone" dataKey="fit_um" stroke={C.amber} strokeWidth={1.5}
                          strokeDasharray="5 3" dot={false} name={`적합 h ∝ ω^${expo != null ? expo.toFixed(2) : "?"}`} />
                  </LineChart>
                </ResponsiveContainer>
              </>
            )}

            {tab === "ht" && (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={ebp.curve} margin={{ top: 8, right: 20, bottom: 22, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                  <XAxis dataKey="t" type="number" domain={[0, "dataMax"]} {...axis}
                         label={{ value: "시간 (s)", position: "insideBottom", offset: -12, fill: C.dim, fontSize: 12 }} />
                  <YAxis {...axis} label={{ value: "h (µm)", angle: -90, position: "insideLeft", fill: C.dim, fontSize: 12 }} />
                  <Tooltip {...tip} labelFormatter={(v) => `t = ${v} s`} />
                  <Legend wrapperStyle={{ fontSize: 12, color: C.dim }} />
                  <Line type="monotone" dataKey="h_um" stroke={C.cyan} dot={false} strokeWidth={2} name="수치해" />
                  {showAnalytical && (
                    <Line type="monotone" dataKey="h_an_um" stroke={C.amber} dot={false} strokeWidth={1.5}
                          strokeDasharray="5 3" name="해석해" connectNulls />
                  )}
                  {ebp.tGel != null && (
                    <ReferenceLine x={+ebp.tGel.toFixed(3)} stroke={C.orange} strokeDasharray="4 4"
                                   label={{ value: "겔화", fill: C.orange, fontSize: 11, position: "top" }} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}

            {tab === "radial" && (
              <>
                <div style={{ fontSize: 12, color: C.dim, marginBottom: 10, lineHeight: 1.6 }}>
                  t = {settledUI.tEval} s · 중앙 {radial.center_um.toFixed(3)} µm · 가장자리 {radial.edge_um.toFixed(3)} µm
                  {settledUI.bump === 0 ? (
                    <span style={{ marginLeft: 10, color: C.amber }}>
                      균일 초기조건 — EBP 는 균일막이 균일하게 유지된다고 예측한다.
                      여기 남는 값은 물리가 아니라 <b>수치 오차</b>다.
                    </span>
                  ) : (
                    <span style={{ marginLeft: 10 }}>
                      중앙을 {settledUI.bump}% 두껍게 떨어뜨린 상태에서 시작 — 두꺼운 곳이 h³ 로 더 빨리 빠져
                      <b style={{ color: C.text }}> 스스로 평탄해진다.</b>
                    </span>
                  )}
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={radial.profile} margin={{ top: 8, right: 20, bottom: 22, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                    <XAxis dataKey="r_mm" {...axis}
                           label={{ value: "r (mm) — 웨이퍼 중심에서", position: "insideBottom", offset: -12, fill: C.dim, fontSize: 12 }} />
                    <YAxis {...axis} domain={["auto", "auto"]}
                           label={{ value: "h (µm)", angle: -90, position: "insideLeft", fill: C.dim, fontSize: 12 }} />
                    <Tooltip {...tip} formatter={(v) => [`${v} µm`, "h"]} labelFormatter={(v) => `r = ${v} mm`} />
                    <Line type="monotone" dataKey="h_um" stroke={C.violet} dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </>
            )}

            {tab === "eta" && (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={ebp.curve} margin={{ top: 8, right: 20, bottom: 22, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
                  <XAxis dataKey="t" type="number" domain={[0, "dataMax"]} {...axis}
                         label={{ value: "시간 (s)", position: "insideBottom", offset: -12, fill: C.dim, fontSize: 12 }} />
                  <YAxis {...axis} label={{ value: "η/η₀", angle: -90, position: "insideLeft", fill: C.dim, fontSize: 12 }} />
                  <Tooltip {...tip} labelFormatter={(v) => `t = ${v} s`} formatter={(v) => [`${v}×`, "η/η₀"]} />
                  <Line type="monotone" dataKey="eta_rel" stroke={C.green} dot={false} strokeWidth={2} name="η/η₀" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 12,
                        padding: "15px 19px", fontSize: 11.5, color: C.faint, lineHeight: 1.9,
                        fontFamily: "monospace" }}>
            <div>
              <span style={{ color: C.dim, fontWeight: 600 }}>EBP </span>
              <span style={{ color: "#94a3b8" }}>∂h/∂t = −(1/r)·∂(r·q)/∂r − E,  q = ρω²r·h³/(3η)</span>
            </div>
            <div>
              <span style={{ color: C.dim, fontWeight: 600 }}>균일막 </span>
              <span style={{ color: "#94a3b8" }}>dh/dt = −2ρω²h³/(3η) − E</span>
              <span style={{ marginLeft: 20, color: C.dim, fontWeight: 600 }}>Meyerhofer </span>
              <span style={{ color: "#94a3b8" }}>η(h) = η₀·(h₀/h)ⁿ</span>
            </div>
            <div>
              <span style={{ color: C.dim, fontWeight: 600 }}>겔화 </span>
              <span style={{ color: "#94a3b8" }}>2ρω²h³/(3η) = E 가 되는 시각</span>
              <span style={{ marginLeft: 20, color: C.dim, fontWeight: 600 }}>불균일도 </span>
              <span style={{ color: "#94a3b8" }}>(h_max−h_min)/(2·h_avg)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
