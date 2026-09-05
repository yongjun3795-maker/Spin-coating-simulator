/**
 * Emslie-Bonner-Peck 스핀코팅 모델 — 솔버 모음
 *
 * 지배식 (축대칭 얇은막, 윤활 근사):
 *
 *     ∂h/∂t = -(1/r)·∂(r·q)/∂r - E ,      q = ρω²r·h³/(3η)
 *
 * h 가 r 에 대해 균일하면 발산항이 r 에 무관해져 EBP 의 잘 알려진 형태가 된다:
 *
 *     dh/dt = -2ρω²h³/(3η) - E
 *
 * 점도는 Meyerhofer 의 농축 모형을 쓴다: η(h) = η₀·(h₀/h)ⁿ.
 * 용매가 날아가 막이 얇아질수록 점도가 올라가고, 어느 순간 원심 배출이
 * 증발보다 느려진다. 그 교차점이 겔화 시각이다.
 */

// ── 단위 환산 ────────────────────────────────────────────────────────────────
export function toSI(p) {
  return {
    omega: (p.omega_rpm * 2 * Math.PI) / 60, // rad/s
    eta0: p.eta0_mPas * 1e-3,                // Pa·s
    h0: p.h0_um * 1e-6,                      // m
    E: p.E_nm_s * 1e-9,                      // m/s
    n: p.n,
    rho: p.rho,                              // kg/m³
  };
}

/** 축소 레이놀즈수 ρωh₀²/η₀. 윤활 근사가 서려면 ≪ 1 이어야 한다. */
export function reducedRe(p) {
  const { omega, eta0, h0, rho } = toSI(p);
  return (rho * omega * h0 * h0) / eta0;
}

/**
 * 균일막 EBP ODE 를 적분한다.
 *
 * 고정 스텝을 쓰지 않는 이유: 배출항이 h³ 이라 초기 dh/dt 가 조건에 따라
 * 3~4 자릿수까지 벌어진다. 8000 rpm · 1 mPa·s · 50 µm 에서는 고정 dt=1e-4 가
 * 한 스텝에 6 µm 를 깎아 해가 무너진다. 그래서 매 스텝 h 의 0.5 % 만
 * 움직이도록 dt 를 잡는다.
 *
 * 반환 곡선은 최대 `maxPoints` 개로 솎아낸다 — 차트가 받는 점의 개수와
 * 적분 정확도는 별개다.
 */
export function solveEBP(params, { tMax = 120, maxPoints = 600 } = {}) {
  const { omega, eta0, h0, E, n, rho } = toSI(params);
  const A = (2 * rho * omega * omega) / 3;

  const curve = [];
  let h = h0;
  let t = 0;
  let tGel = null;
  let gelled = false;
  let prevExcess = null;
  let steps = 0;
  const STEP_CAP = 400000;
  const hFloor = h0 * 1e-3;

  // 솎아내기 간격 — 로그가 아니라 시간 균등으로 뽑는다
  let nextSample = 0;
  const sampleDt = tMax / maxPoints;

  while (t <= tMax && h > hFloor && steps < STEP_CAP) {
    const eta = eta0 * Math.pow(h0 / h, n);
    const spinOff = (A * h * h * h) / eta; // 원심 배출 속도 [m/s]
    const dhdt = -spinOff - E;

    // 겔화: 원심 배출이 증발 아래로 내려가는 첫 순간.
    // 여기서 적분을 멈춘다 — 이후로는 용매만 마르고 고체 골격이 남으므로
    // 막이 더 얇아지지 않는다. Meyerhofer 모델의 핵심이 이 지점이다.
    // (멈추지 않으면 최종 두께가 조건과 무관하게 바닥값으로 수렴해
    //  스핀 커브가 통째로 무의미해진다.)
    const excess = spinOff - E;
    if (E > 0 && prevExcess !== null && prevExcess >= 0 && excess < 0) {
      tGel = t;
      gelled = true;
      break;
    }
    prevExcess = excess;

    if (t >= nextSample || curve.length === 0) {
      // 해석해 h₀/√(1+4ρω²h₀²t/(3η₀)) — E=0, n=0 극한에서만 유효하다
      const hAn = h0 / Math.sqrt(1 + (4 * rho * omega * omega * h0 * h0 * t) / (3 * eta0));
      curve.push({
        t: +t.toFixed(4),
        h_um: +(h * 1e6).toFixed(5),
        h_an_um: +(hAn * 1e6).toFixed(5),
        eta_rel: +(eta / eta0).toFixed(3),
      });
      nextSample = t + sampleDt;
    }

    // 적응 스텝: h 의 0.5 % 이상 움직이지 않게
    const rate = Math.abs(dhdt);
    let dt = rate > 0 ? (0.005 * h) / rate : tMax;
    dt = Math.min(Math.max(dt, 1e-7), 0.05);

    h += dhdt * dt;
    if (h < 0) h = 0;
    t += dt;
    steps++;
  }

  // 마지막 점은 항상 남긴다
  curve.push({
    t: +t.toFixed(4),
    h_um: +(Math.max(h, 0) * 1e6).toFixed(5),
    h_an_um: null,
    eta_rel: +((eta0 * Math.pow(h0 / Math.max(h, hFloor), n)) / eta0).toFixed(3),
  });

  return {
    curve,
    tGel,
    gelled,
    hFinal_um: Math.max(h, 0) * 1e6,
    steps,
    hitCap: steps >= STEP_CAP,
    // 겔화 두께의 해석 예측: 2ρω²h^(3+n)/(3η₀h₀ⁿ) = E 를 h 에 대해 풀면
    //   h_gel = [3η₀h₀ⁿE/(2ρω²)]^(1/(3+n))  →  h ∝ ω^(-2/(3+n))
    exponentTheory: E > 0 ? -2 / (3 + n) : null,
  };
}

/**
 * 반경 방향 프로파일 — 보존형 유한체적.
 *
 * ⚠️ EBP 의 유명한 결과: **초기에 균일한 막은 계속 균일하다.**
 * h 가 r 에 무관하면 (1/r)∂(r·q)/∂r 가 r 에 무관해지기 때문이다.
 * 그래서 균일한 초기조건으로 이 솔버를 돌리면 "균일도"는 물리가 아니라
 * 수치 오차를 재는 값이 된다.
 *
 * 실제로 보고 싶은 건 그 반대다 — **불균일하게 떨어뜨린 액이 평탄해지는 과정.**
 * 그래서 초기조건을 실제 디스펜스처럼 중앙이 두꺼운 형태로 준다
 * (`bump` = 중앙 과잉 비율). bump=0 이면 균일 초기조건이고,
 * 그때 프로파일이 평평하게 유지되는지가 곧 솔버 검증이 된다.
 */
export function solveRadial(params, { tEval = 10, Nr = 60, bump = 0.35, R = 0.1 } = {}) {
  const { omega, eta0, h0, E, n, rho } = toSI(params);
  const dr = R / Nr;

  // 셀 중심 r_i, 면 r_{i+1/2}
  const rc = Array.from({ length: Nr }, (_, i) => (i + 0.5) * dr);

  // 초기 디스펜스 프로파일: 중앙이 두꺼운 완만한 종 모양
  let h = rc.map((r) => h0 * (1 + bump * Math.exp(-((r / (0.45 * R)) ** 2))));
  const h0mean = h.reduce((a, b) => a + b, 0) / Nr;

  const coef = (rho * omega * omega) / (3 * eta0);
  let t = 0;
  let guard = 0;

  while (t < tEval && guard < 200000) {
    // 안정 조건: 가장 빠른 셀이 자기 두께의 0.5 % 만 움직이도록
    let maxRate = 0;
    for (let i = 0; i < Nr; i++) {
      const eta = Math.pow(h0 / Math.max(h[i], h0 * 1e-3), n);
      maxRate = Math.max(maxRate, (coef * 2 * h[i] ** 3) / eta + E);
    }
    let dt = maxRate > 0 ? (0.005 * Math.min(...h)) / maxRate : tEval;
    dt = Math.min(Math.max(dt, 1e-6), tEval - t, 0.02);

    // 면 유속 (바깥으로 흐르므로 안쪽 셀 값을 업윈드)
    const flux = new Array(Nr + 1).fill(0); // flux[i] = r_{i-1/2}·q
    for (let i = 1; i <= Nr; i++) {
      const rf = i * dr;
      const hUp = h[i - 1];
      const etaRel = Math.pow(h0 / Math.max(hUp, h0 * 1e-3), n);
      flux[i] = (rf * rf * hUp ** 3 * coef) / etaRel; // r·q, q ∝ r h³/η
    }

    const hNew = new Array(Nr);
    for (let i = 0; i < Nr; i++) {
      const div = (flux[i + 1] - flux[i]) / (rc[i] * dr);
      hNew[i] = Math.max(h[i] - (div + E) * dt, 0);
    }
    h = hNew;
    t += dt;
    guard++;
  }

  const profile = h.map((hi, i) => ({
    r_mm: +(rc[i] * 1000).toFixed(2),
    h_um: +(hi * 1e6).toFixed(5),
  }));

  const vals = h.map((x) => x * 1e6);
  const hMax = Math.max(...vals);
  const hMin = Math.min(...vals);
  const hAvg = vals.reduce((a, b) => a + b, 0) / vals.length;

  return {
    profile,
    center_um: vals[0],
    edge_um: vals[vals.length - 1],
    nonUniformity_pct: hAvg > 0 ? ((hMax - hMin) / (2 * hAvg)) * 100 : 0,
    initialBump_pct: bump * 100,
    initialMean_um: h0mean * 1e6,
  };
}

/**
 * 스핀 커브 — 회전수를 훑어 최종 두께를 뽑고 h ∝ ω^p 의 지수 p 를 회귀한다.
 *
 * 공정에서 실제로 쓰는 그래프가 이것이다. 그리고 여기에 이 모델의 제일
 * 재미있는 지점이 있다:
 *
 *   - 증발이 없으면(E=0) 배출만으로 얇아지므로 오래 돌릴수록 h → 0,
 *     같은 시간에서 비교하면 지수가 **-1** 쪽으로 간다.
 *   - 증발이 있으면 겔화에서 두께가 고정되고, 실험에서 잘 알려진
 *     **h ∝ ω^(-1/2)** 에 가까워진다.
 *
 * 즉 경험식의 -1/2 승은 원심력만으로는 안 나오고 용매 증발이 있어야 나온다.
 */
export function spinCurve(params, { rpmMin = 500, rpmMax = 8000, points = 22, tMax = 60 } = {}) {
  const pts = [];
  for (let k = 0; k < points; k++) {
    // 로그 등간격 — 지수 회귀는 로그축에서 균등해야 한다
    const f = k / (points - 1);
    const rpm = Math.round(rpmMin * Math.pow(rpmMax / rpmMin, f));
    const { hFinal_um } = solveEBP({ ...params, omega_rpm: rpm }, { tMax, maxPoints: 2 });
    if (hFinal_um > 1e-6) pts.push({ rpm, h_um: +hFinal_um.toFixed(5) });
  }

  // log h = p·log ω + c 최소제곱
  let p = null, r2 = null;
  if (pts.length >= 3) {
    const xs = pts.map((d) => Math.log(d.rpm));
    const ys = pts.map((d) => Math.log(d.h_um));
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) {
      sxy += (xs[i] - mx) * (ys[i] - my);
      sxx += (xs[i] - mx) ** 2;
      syy += (ys[i] - my) ** 2;
    }
    p = sxy / sxx;
    r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 1;
    const c = my - p * mx;
    pts.forEach((d) => {
      d.fit_um = +Math.exp(p * Math.log(d.rpm) + c).toFixed(5);
    });
  }

  // 해석 예측: 겔화 조건 2ρω²h^(3+n)/(3η₀h₀ⁿ) = E 를 풀면 h ∝ ω^(-2/(3+n)).
  // n = 1 일 때 정확히 -1/2 — 실험 경험식이 나오는 조건이 여기서 특정된다.
  const nExp = params.n;
  const theory = params.E_nm_s > 0 ? -2 / (3 + nExp) : null;

  return { points: pts, exponent: p, r2, theory, nForHalf: 1 };
}
