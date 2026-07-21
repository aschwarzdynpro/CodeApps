import { useEffect, useRef, type CSSProperties } from "react";

/**
 * PenaltyGame — Elfmeter-Widget zum Überbrücken langer Wartezeiten.
 *
 * Self-contained: keine externen Abhängigkeiten außer React.
 * In eine Power Apps Code App: Datei ablegen und <PenaltyGame /> einbinden.
 *
 *   import { PenaltyGame } from "./PenaltyGame";
 *   ...
 *   <PenaltyGame accentColor="#742774" busy={isRunning} onGoal={() => {}} />
 *
 * Die Fonts "Anton" und "Rubik" per Google Fonts einbinden (index.html):
 *   <link href="https://fonts.googleapis.com/css2?family=Anton&family=Rubik:wght@500;700;900&display=swap" rel="stylesheet">
 * (Ohne Fonts fällt das Widget sauber auf System-Fonts zurück.)
 */

export interface PenaltyGameProps {
  /** Akzentfarbe (Trikot-Nr., Fadenkreuz, Torschütze-Nr.). Default #2f6bff */
  accentColor?: string;
  /** Trikotfarbe. Default #ffffff */
  jerseyColor?: string;
  /** Rasenfarbe. Default #3fa457 */
  pitchColor?: string;
  /** Torwart-Trikotfarbe. Default #ffd23f */
  keeperColor?: string;
  /** Torwart-Stärke 0–100. Default 45 */
  keeperSkill?: number;
  /** Titel im Kopf. Default "Elfmeterschießen" */
  title?: string;
  /** Untertitel im Kopf. Default "Ziel ins Tor & triff!" */
  subtitle?: string;
  /** Hinweistext unten. */
  hint?: string;
  /** Optional: läuft der lange Prozess noch? (nur informativ, blendet keinen Zustand aus) */
  busy?: boolean;
  /** Callback bei Tor. */
  onGoal?: (stats: { goals: number; shots: number; streak: number }) => void;
  /** Callback bei jedem Versuch. */
  onShot?: (outcome: "goal" | "save" | "miss", stats: { goals: number; shots: number; streak: number }) => void;
  /** Regler ausblenden (z.B. wenn keeperSkill fix gesteuert wird). Default false */
  hideControls?: boolean;
  style?: CSSProperties;
}

const skillWord = (k: number) =>
  k < 25 ? "schwach" : k < 55 ? "mittel" : k < 80 ? "stark" : "Weltklasse";

export function PenaltyGame({
  accentColor = "#2f6bff",
  jerseyColor = "#ffffff",
  pitchColor = "#3fa457",
  keeperColor = "#ffd23f",
  keeperSkill = 45,
  title = "Elfmeterschießen",
  subtitle = "Ziel ins Tor & triff!",
  hint = "Bewege die Maus übers Tor & klicke zum Schießen",
  busy,
  onGoal,
  onShot,
  hideControls = false,
  style,
}: PenaltyGameProps) {
  // refs to live DOM nodes we animate imperatively
  const wrapRef = useRef<HTMLDivElement>(null);
  const sizerRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<HTMLDivElement>(null);
  const keeperRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const ballShadowRef = useRef<HTMLDivElement>(null);
  const shooterRef = useRef<HTMLDivElement>(null);
  const shooterLegRef = useRef<HTMLDivElement>(null);
  const shooterBackLegRef = useRef<HTMLDivElement>(null);
  const burstRef = useRef<HTMLDivElement>(null);
  const starRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const crosshairRef = useRef<HTMLDivElement>(null);
  const resultWrapRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const goalsRef = useRef<HTMLDivElement>(null);
  const shotsRef = useRef<HTMLDivElement>(null);
  const streakRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const skillRef = useRef<HTMLInputElement>(null);
  const skillLabelRef = useRef<HTMLSpanElement>(null);

  // keep latest callbacks without re-subscribing the loop
  const cb = useRef({ onGoal, onShot });
  useEffect(() => {
    cb.current = { onGoal, onShot };
  });

  useEffect(() => {
    const GOAL = { l: 250, r: 510, t: 124, b: 250 };
    const BALL0 = { x: 380, y: 396 };

    const state = {
      sc: 1,
      mode: "aim" as "aim" | "shoot",
      aim: { x: 380, y: 190 },
      over: false,
      goals: 0,
      shots: 0,
      streak: 0,
      keeperSkill: keeperSkill,
      shot: null as null | {
        target: { x: number; y: number };
        kp: { x: number; y: number };
        outcome: "goal" | "save" | "miss";
        side: number;
      },
      t0: 0,
      scored: false,
    };

    if (skillRef.current) skillRef.current.value = String(state.keeperSkill);
    updateSkillLabel();

    const cl = (a: number, b: number, x: number) => Math.max(0, Math.min(1, (x - a) / (b - a)));
    const lp = (a: number, b: number, t: number) => a + (b - a) * t;
    const eo = (t: number) => 1 - Math.pow(1 - t, 3);
    const ei = (t: number) => t * t * t;
    const reachR = () => 40 + (state.keeperSkill / 100) * 58;

    function updateSkillLabel() {
      if (skillLabelRef.current) skillLabelRef.current.textContent = skillWord(state.keeperSkill);
    }
    function paint() {
      if (goalsRef.current) goalsRef.current.textContent = String(state.goals);
      if (shotsRef.current) shotsRef.current.textContent = String(state.shots);
      if (streakRef.current) streakRef.current.textContent = String(state.streak);
    }

    function fit() {
      const s = sizerRef.current, f = fitRef.current;
      if (!s || !f) return;
      state.sc = s.clientWidth / 760;
      f.style.transform = `scale(${state.sc})`;
      s.style.height = 460 * state.sc + "px";
    }
    fit();
    window.addEventListener("resize", fit);

    function toStage(e: PointerEvent) {
      const r = sizerRef.current!.getBoundingClientRect();
      return { x: (e.clientX - r.left) / state.sc, y: (e.clientY - r.top) / state.sc };
    }
    function onMove(e: PointerEvent) {
      if (state.mode !== "aim") return;
      const pt = toStage(e);
      state.aim = pt;
      state.over = true;
      const c = crosshairRef.current;
      if (c) { c.style.transform = `translate(${pt.x}px,${pt.y}px)`; c.style.opacity = "1"; }
    }
    function onLeave() {
      state.over = false;
      if (state.mode === "aim" && crosshairRef.current) crosshairRef.current.style.opacity = "0";
    }
    function onShoot(e: PointerEvent) {
      if (state.mode !== "aim") return;
      const t = toStage(e);
      const g = GOAL;
      const onTarget = t.x > g.l && t.x < g.r && t.y > g.t && t.y < g.b;
      const bias = state.keeperSkill / 100;
      let kx = g.l + Math.random() * (g.r - g.l);
      let ky = g.t + Math.random() * (g.b - g.t);
      if (onTarget) { kx += (t.x - kx) * bias * 0.6; ky += (t.y - ky) * bias * 0.6; }
      const kp = { x: kx, y: ky };
      const save = onTarget && Math.hypot(t.x - kp.x, t.y - kp.y) < reachR();
      const outcome: "goal" | "save" | "miss" = !onTarget ? "miss" : save ? "save" : "goal";
      state.shot = { target: t, kp, outcome, side: Math.sign(t.x - 380 || 1) };
      state.mode = "shoot";
      state.t0 = performance.now();
      state.scored = false;
      if (crosshairRef.current) crosshairRef.current.style.opacity = "0";
      if (hintRef.current) hintRef.current.style.opacity = "0";
    }

    function finishShot() {
      state.scored = true;
      state.shots++;
      const o = state.shot!.outcome;
      const r = resultRef.current;
      if (o === "goal") {
        state.goals++; state.streak++;
        if (r) { r.textContent = "TOR!"; r.style.color = "#fff"; r.style.webkitTextStroke = "3px #10130f"; r.style.textShadow = "5px 5px 0 #10130f"; }
      } else if (o === "save") {
        state.streak = 0;
        if (r) { r.textContent = "GEHALTEN!"; r.style.color = "#ffe08a"; r.style.webkitTextStroke = "3px #6e1b1b"; r.style.textShadow = "5px 5px 0 #6e1b1b"; }
      } else {
        state.streak = 0;
        if (r) { r.textContent = "DANEBEN!"; r.style.color = "#ffd0d0"; r.style.webkitTextStroke = "3px #6e1b1b"; r.style.textShadow = "5px 5px 0 #6e1b1b"; }
      }
      paint();
      const stats = { goals: state.goals, shots: state.shots, streak: state.streak };
      cb.current.onShot?.(o, stats);
      if (o === "goal") cb.current.onGoal?.(stats);
    }
    function resetShot() {
      state.mode = "aim";
      state.shot = null;
      if (hintRef.current) hintRef.current.style.opacity = "1";
      if (state.over && crosshairRef.current) crosshairRef.current.style.opacity = "1";
    }

    const KICK = 175, FLY = 640, RES = 660, END = 1750;
    let raf = 0;

    function frame(now: number) {
      const t = state.mode === "aim" ? -1 : now - state.t0;
      const s = state.shot;

      // shooter
      let dip = 0, legA = 0, lean = 0;
      if (t < 0) { dip = Math.sin(now / 900) * 1.5; legA = Math.sin(now / 700) * 3; }
      else if (t < 90) { const a = cl(0, 90, t); legA = lp(0, -40, eo(a)); dip = lp(0, 8, a); lean = lp(0, 6, a); }
      else if (t < 210) { const k = cl(90, 210, t); legA = lp(-40, 75, ei(k)); dip = lp(8, -4, k); lean = lp(6, -6, k); }
      else { const f = cl(210, 620, t); legA = lp(75, 4, f); dip = lp(-4, 0, f); lean = lp(-6, 0, f); }
      if (shooterRef.current) shooterRef.current.style.transform = `translateY(${dip}px) rotate(${lean * 0.4}deg)`;
      if (shooterLegRef.current) shooterLegRef.current.style.transform = `rotate(${legA}deg)`;
      if (shooterBackLegRef.current) shooterBackLegRef.current.style.transform = `rotate(0deg)`;

      // ball
      const B0 = BALL0;
      if (t < KICK || !s) {
        const bob = t < 0 ? Math.sin(now / 300) * 2 : 0;
        if (ballRef.current) ballRef.current.style.transform = `translate(0px,${bob}px)`;
        if (ballShadowRef.current) { ballShadowRef.current.style.transform = "translate(0,0) scale(1)"; ballShadowRef.current.style.opacity = ".3"; }
      } else {
        const fp = cl(KICK, FLY, t);
        const tx = s.target.x, ty = s.target.y;
        let ex = lp(B0.x, tx, eo(fp));
        let ey = lp(B0.y, ty, ei(fp)) - 40 * Math.sin(Math.PI * fp) * (1 - 0.4 * fp);
        if (s.outcome === "save" && fp > 0.86) { const rb = cl(0.86, 1, fp); ex = lp(tx, lp(tx, 380, 0.6), rb); ey = lp(ty, ty + 60, ei(rb)); }
        const scl = lp(1, 0.4, fp);
        const spin = fp * s.side * 1000;
        if (ballRef.current) ballRef.current.style.transform = `translate(${ex - B0.x}px,${ey - B0.y}px) scale(${scl}) rotate(${spin}deg)`;
        const gy = cl(0, 1, (410 - ey) / 260);
        if (ballShadowRef.current) { ballShadowRef.current.style.transform = `translate(${(ex - B0.x) * 0.9}px,0) scale(${(1 - gy * 0.7) * scl})`; ballShadowRef.current.style.opacity = String(0.3 * (1 - gy * 0.7)); }
      }

      // keeper
      if (t < 0 || !s) {
        const sway = Math.sin(now / 520) * 9;
        if (keeperRef.current) keeperRef.current.style.transform = `translateX(${sway}px)`;
      } else {
        const g = cl(120, 560, t), ge = eo(g);
        const dx = (s.kp.x - 380) * ge;
        const dy = Math.max(0, s.kp.y - 190) * ge * 0.5;
        const jump = -Math.sin(Math.PI * Math.min(1, g)) * 22;
        const rot = Math.sign(s.kp.x - 380) * 48 * ge;
        if (keeperRef.current) keeperRef.current.style.transform = `translate(${dx}px,${dy + jump}px) rotate(${rot}deg)`;
      }

      // fx
      if (t >= 0 && s) {
        const burst = cl(140, 210, t) * (1 - cl(210, 380, t));
        if (burstRef.current) { burstRef.current.style.opacity = String(burst); burstRef.current.style.transform = `scale(${lp(0.35, 1.05, cl(140, 240, t))})`; }
        const star = cl(150, 200, t) * (1 - cl(200, 300, t));
        if (starRef.current) { starRef.current.style.opacity = String(star * 0.95); starRef.current.style.transform = `translate(-50%,-50%) scale(${lp(0.2, 1.15, cl(150, 220, t))}) rotate(${t * 0.6}deg)`; }
        const flash = cl(160, 190, t) * (1 - cl(190, 250, t));
        if (flashRef.current) flashRef.current.style.opacity = String(flash * 0.85);
        const punch = Math.max(0, 1 - Math.abs(t - 185) / 45);
        const shake = s.outcome === "goal" ? Math.max(0, 1 - Math.abs(t - RES) / 120) : 0;
        if (cameraRef.current) cameraRef.current.style.transform = `scale(${1 + 0.05 * punch}) translate(${Math.sin(now / 30) * 3 * shake}px,${-3 * punch}px)`;
      } else {
        if (burstRef.current) burstRef.current.style.opacity = "0";
        if (starRef.current) starRef.current.style.opacity = "0";
        if (flashRef.current) flashRef.current.style.opacity = "0";
        if (cameraRef.current) cameraRef.current.style.transform = "scale(1)";
      }

      // result + transitions
      if (s && t >= RES && !state.scored) finishShot();
      if (s) {
        const rop = cl(RES, RES + 60, t) * (1 - cl(END - 120, END, t));
        const rsc = lp(0.5, 1.08, eo(cl(RES, RES + 130, t))) - 0.08 * cl(RES + 130, RES + 260, t);
        if (resultWrapRef.current) { resultWrapRef.current.style.opacity = String(rop); resultWrapRef.current.style.transform = `scale(${rsc}) rotate(${lp(-3, 0, cl(RES, RES + 130, t))}deg)`; }
        if (t >= END) resetShot();
      } else if (resultWrapRef.current) {
        resultWrapRef.current.style.opacity = "0";
      }

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // wire pointer events (React synthetic onPointer* also work, but native keeps this effect self-contained)
    const sizer = sizerRef.current!;
    sizer.addEventListener("pointermove", onMove);
    sizer.addEventListener("pointerdown", onShoot);
    sizer.addEventListener("pointerleave", onLeave);

    const skillEl = skillRef.current;
    function onSkill() { if (skillEl) state.keeperSkill = +skillEl.value; updateSkillLabel(); }
    skillEl?.addEventListener("input", onSkill);

    // expose reset + external skill sync
    (sizer as unknown as { __reset: () => void }).__reset = () => { state.goals = 0; state.shots = 0; state.streak = 0; paint(); };
    (sizer as unknown as { __setSkill: (v: number) => void }).__setSkill = (v: number) => { state.keeperSkill = v; if (skillRef.current) skillRef.current.value = String(v); updateSkillLabel(); };

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
      sizer.removeEventListener("pointermove", onMove);
      sizer.removeEventListener("pointerdown", onShoot);
      sizer.removeEventListener("pointerleave", onLeave);
      skillEl?.removeEventListener("input", onSkill);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keep imperative state in sync when keeperSkill prop changes
  useEffect(() => {
    const sizer = sizerRef.current as unknown as { __setSkill?: (v: number) => void } | null;
    if (sizer?.__setSkill) sizer.__setSkill(keeperSkill);
  }, [keeperSkill]);

  const onReset = () => {
    const sizer = sizerRef.current as unknown as { __reset?: () => void } | null;
    if (sizer?.__reset) sizer.__reset();
  };

  const v = {
    "--accent": accentColor,
    "--jersey": jerseyColor,
    "--pitch": pitchColor,
    "--keeper": keeperColor,
  } as CSSProperties;

  return (
    <div
      ref={wrapRef}
      data-busy={busy ? "1" : undefined}
      style={{ width: "100%", maxWidth: 860, margin: "0 auto", fontFamily: "'Rubik',system-ui,sans-serif", boxSizing: "border-box", ...v, ...style }}
    >
      <style>{`
        @keyframes elf-spin { to { transform: rotate(360deg); } }
        @keyframes elf-cross { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(90deg); } }
      `}</style>
      <div style={{ background: "#0e1b12", borderRadius: 26, padding: 16, boxShadow: "0 22px 60px -22px rgba(6,20,10,.6)", border: "1px solid #16281b" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, margin: "4px 6px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 11, background: "var(--pitch)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "inset 0 -3px 0 rgba(0,0,0,.2)" }}>
              <div style={{ width: 15, height: 15, borderRadius: "50%", background: "#fff", boxShadow: "inset 0 0 0 1.5px #1c2a20" }} />
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: 15, letterSpacing: ".2px", color: "#eafff0" }}>{title}</div>
              <div style={{ fontSize: 11.5, color: "#6f8a79", fontWeight: 600, marginTop: 1 }}>{subtitle}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.5px", color: "#6f8a79" }}>TORE</div>
              <div ref={goalsRef} style={{ fontFamily: "'Anton',sans-serif", fontSize: 26, color: "var(--accent)", lineHeight: 0.9 }}>0</div>
            </div>
            <div style={{ width: 1, height: 30, background: "#22382a" }} />
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.5px", color: "#6f8a79" }}>VERSUCHE</div>
              <div ref={shotsRef} style={{ fontFamily: "'Anton',sans-serif", fontSize: 26, color: "#eafff0", lineHeight: 0.9 }}>0</div>
            </div>
            <div style={{ width: 1, height: 30, background: "#22382a" }} />
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.5px", color: "#6f8a79" }}>SERIE</div>
              <div ref={streakRef} style={{ fontFamily: "'Anton',sans-serif", fontSize: 26, color: "#ffd23f", lineHeight: 0.9 }}>0</div>
            </div>
          </div>
        </div>

        {/* stage */}
        <div ref={sizerRef} style={{ position: "relative", width: "100%", height: 460, overflow: "hidden", borderRadius: 18, background: "#2f8f47", cursor: "crosshair", touchAction: "none" }}>
          <div ref={fitRef} style={{ width: 760, height: 460, transformOrigin: "top left", position: "relative" }}>
            <div ref={cameraRef} style={{ position: "absolute", inset: 0, transformOrigin: "50% 58%", willChange: "transform" }}>
              {/* stands / sky */}
              <div style={{ position: "absolute", left: 0, top: 0, width: 760, height: 96, background: "linear-gradient(180deg,#12324a,#1c4a63)" }} />
              <div style={{ position: "absolute", left: 0, top: 24, width: 760, height: 64, background: "repeating-radial-gradient(circle at center, rgba(255,255,255,.35) 0 1.4px, transparent 1.4px 7px)", opacity: 0.45 }} />
              <div style={{ position: "absolute", left: 0, top: 72, width: 760, height: 26, background: "linear-gradient(180deg,#173a25,#2f8f47)" }} />
              {/* pitch */}
              <div style={{ position: "absolute", left: 0, top: 94, width: 760, height: 366, background: "linear-gradient(180deg,#3f9e55,#54c06d)" }} />
              <div style={{ position: "absolute", left: 0, top: 94, width: 760, height: 366, background: "repeating-linear-gradient(90deg, rgba(255,255,255,.06) 0 60px, rgba(0,0,0,.05) 60px 120px)" }} />
              <div style={{ position: "absolute", left: 150, top: 250, width: 460, height: 2, background: "rgba(255,255,255,.55)" }} />
              <div style={{ position: "absolute", left: 150, top: 250, width: 2, height: 120, background: "rgba(255,255,255,.4)", transform: "skewX(28deg)", transformOrigin: "top" }} />
              <div style={{ position: "absolute", left: 608, top: 250, width: 2, height: 120, background: "rgba(255,255,255,.4)", transform: "skewX(-28deg)", transformOrigin: "top" }} />
              <div style={{ position: "absolute", left: 372, top: 360, width: 16, height: 7, borderRadius: "50%", background: "rgba(255,255,255,.85)" }} />

              {/* goal */}
              <div style={{ position: "absolute", left: 238, top: 112, width: 284, height: 150, zIndex: 2 }}>
                <div style={{ position: "absolute", left: 12, top: 12, right: 12, bottom: 0, background: "repeating-linear-gradient(38deg, rgba(255,255,255,.22) 0 1px, transparent 1px 15px), repeating-linear-gradient(-38deg, rgba(255,255,255,.22) 0 1px, transparent 1px 15px)" }} />
                <div style={{ position: "absolute", left: 0, top: 0, width: 12, height: 150, background: "linear-gradient(90deg,#fff,#cfd6cf)", borderRadius: 5, boxShadow: "3px 0 8px rgba(0,0,0,.18)" }} />
                <div style={{ position: "absolute", right: 0, top: 0, width: 12, height: 150, background: "linear-gradient(90deg,#cfd6cf,#fff)", borderRadius: 5, boxShadow: "-3px 0 8px rgba(0,0,0,.18)" }} />
                <div style={{ position: "absolute", left: 0, top: 0, width: 284, height: 12, background: "linear-gradient(180deg,#fff,#cfd6cf)", borderRadius: 5, boxShadow: "0 3px 8px rgba(0,0,0,.18)" }} />
              </div>

              {/* keeper */}
              <div ref={keeperRef} style={{ position: "absolute", left: 340, top: 150, width: 80, height: 118, zIndex: 3, transformOrigin: "50% 90%", willChange: "transform" }}>
                <div style={{ position: "absolute", left: 20, top: 74, width: 15, height: 44, background: "#1b2a33", borderRadius: 6 }} />
                <div style={{ position: "absolute", left: 44, top: 74, width: 15, height: 44, background: "#1b2a33", borderRadius: 6 }} />
                <div style={{ position: "absolute", left: 19, top: 34, width: 42, height: 48, background: "var(--keeper)", borderRadius: 12, boxShadow: "inset 0 -5px 0 rgba(0,0,0,.12)" }} />
                <div style={{ position: "absolute", left: 5, top: 2, width: 17, height: 40, background: "var(--keeper)", borderRadius: 8, transform: "rotate(28deg)", transformOrigin: "bottom" }}><div style={{ position: "absolute", left: -5, top: -12, width: 19, height: 19, background: "#eef3f6", borderRadius: 6 }} /></div>
                <div style={{ position: "absolute", left: 58, top: 2, width: 17, height: 40, background: "var(--keeper)", borderRadius: 8, transform: "rotate(-28deg)", transformOrigin: "bottom" }}><div style={{ position: "absolute", left: 3, top: -12, width: 19, height: 19, background: "#eef3f6", borderRadius: 6 }} /></div>
                <div style={{ position: "absolute", left: 26, top: 2, width: 28, height: 28, background: "#f2c9a0", borderRadius: "50%" }}><div style={{ position: "absolute", left: 0, top: -4, width: 28, height: 14, background: "#3a2a1e", borderRadius: "14px 14px 0 0" }} /></div>
              </div>

              {/* ball */}
              <div ref={ballRef} style={{ position: "absolute", left: 357, top: 373, width: 46, height: 46, zIndex: 10, willChange: "transform" }}>
                <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle at 34% 30%, #fff, #e3e7e3 72%)", boxShadow: "inset -5px -6px 0 rgba(0,0,0,.08), 0 3px 6px rgba(0,0,0,.2)" }} />
                <div style={{ position: "absolute", left: 16, top: 14, width: 14, height: 14, background: "#1c1c22", clipPath: "polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%)" }} />
                <div style={{ position: "absolute", left: 4, top: 26, width: 9, height: 9, background: "#1c1c22", clipPath: "polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%)" }} />
                <div style={{ position: "absolute", left: 31, top: 28, width: 9, height: 9, background: "#1c1c22", clipPath: "polygon(50% 0,100% 38%,82% 100%,18% 100%,0 38%)" }} />
              </div>
              <div ref={ballShadowRef} style={{ position: "absolute", left: 352, top: 414, width: 56, height: 15, borderRadius: "50%", background: "rgba(0,0,0,.3)", filter: "blur(2px)", zIndex: 5, willChange: "transform,opacity" }} />

              {/* shooter */}
              <div ref={shooterRef} style={{ position: "absolute", left: 258, top: 274, width: 244, height: 230, zIndex: 8, transformOrigin: "50% 100%", willChange: "transform" }}>
                <div ref={shooterBackLegRef} style={{ position: "absolute", left: 74, top: 118, width: 40, height: 118, background: "#eef2ee", borderRadius: 16, transformOrigin: "50% 8px" }}><div style={{ position: "absolute", left: -6, bottom: -8, width: 56, height: 24, background: "#16161c", borderRadius: "8px 12px 12px 6px" }} /></div>
                <div ref={shooterLegRef} style={{ position: "absolute", left: 128, top: 118, width: 42, height: 120, background: "#f6f8f6", borderRadius: 16, transformOrigin: "50% 8px", zIndex: 4 }}><div style={{ position: "absolute", left: -6, bottom: -8, width: 58, height: 25, background: "#16161c", borderRadius: "8px 12px 12px 6px" }} /></div>
                <div style={{ position: "absolute", left: 66, top: 96, width: 112, height: 44, background: "var(--pitch)", borderRadius: 16, zIndex: 5, boxShadow: "inset 0 -7px 0 rgba(0,0,0,.16)" }} />
                <div style={{ position: "absolute", left: 56, top: 26, width: 132, height: 82, background: "var(--jersey)", borderRadius: 22, zIndex: 6, boxShadow: "inset 0 -8px 0 rgba(0,0,0,.06)" }}>
                  <div style={{ position: "absolute", left: 0, top: 14, width: 132, height: 12, background: "var(--accent)" }} />
                  <div style={{ position: "absolute", left: 0, bottom: 8, width: "100%", textAlign: "center", fontFamily: "'Anton',sans-serif", fontSize: 44, color: "var(--accent)", lineHeight: 1 }}>10</div>
                </div>
                <div style={{ position: "absolute", left: 34, top: 34, width: 30, height: 66, background: "var(--jersey)", borderRadius: 13, transform: "rotate(14deg)", transformOrigin: "top", zIndex: 5 }}><div style={{ position: "absolute", left: 2, bottom: -6, width: 26, height: 26, background: "#f2c9a0", borderRadius: "50%" }} /></div>
                <div style={{ position: "absolute", left: 180, top: 34, width: 30, height: 66, background: "var(--jersey)", borderRadius: 13, transform: "rotate(-14deg)", transformOrigin: "top", zIndex: 5 }}><div style={{ position: "absolute", left: 2, bottom: -6, width: 26, height: 26, background: "#f2c9a0", borderRadius: "50%" }} /></div>
                <div style={{ position: "absolute", left: 82, top: 0, width: 80, height: 56, background: "#f2c9a0", borderRadius: 26, zIndex: 6 }}>
                  <div style={{ position: "absolute", left: -6, top: -14, width: 92, height: 40, background: "#221a2e", clipPath: "polygon(0 100%, 10% 24%, 24% 74%, 40% 4%, 54% 70%, 70% 10%, 84% 72%, 100% 30%, 100% 100%)", borderRadius: 10 }} />
                  <div style={{ position: "absolute", left: -6, top: 22, width: 92, height: 11, background: "var(--accent)", borderRadius: 5 }} />
                </div>
              </div>

              {/* fx */}
              <div ref={burstRef} style={{ position: "absolute", left: 380, top: 392, opacity: 0, zIndex: 7, pointerEvents: "none", willChange: "transform,opacity" }}>
                <div style={{ position: "absolute", left: -260, top: -260, width: 520, height: 520, background: "repeating-conic-gradient(rgba(255,255,255,.9) 0deg 2.4deg, transparent 2.4deg 8.5deg)", WebkitMaskImage: "radial-gradient(circle, transparent 44px, #000 66px, #000 200px, transparent 250px)", maskImage: "radial-gradient(circle, transparent 44px, #000 66px, #000 200px, transparent 250px)", animation: "elf-spin .6s linear infinite" }} />
              </div>
              <div ref={starRef} style={{ position: "absolute", left: 380, top: 392, width: 150, height: 150, transform: "translate(-50%,-50%) scale(0)", opacity: 0, zIndex: 9, pointerEvents: "none", background: "var(--accent)", clipPath: "polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)" }} />
              <div ref={flashRef} style={{ position: "absolute", inset: 0, opacity: 0, zIndex: 9, pointerEvents: "none", background: "radial-gradient(circle at 50% 84%, rgba(255,255,255,.9), transparent 42%)" }} />

              {/* crosshair */}
              <div ref={crosshairRef} style={{ position: "absolute", left: 0, top: 0, width: 70, height: 70, margin: "-35px 0 0 -35px", opacity: 0, zIndex: 12, pointerEvents: "none", willChange: "transform,opacity" }}>
                <div style={{ position: "absolute", inset: 0, border: "3px solid var(--accent)", borderRadius: "50%", boxShadow: "0 0 0 2px rgba(0,0,0,.25), inset 0 0 0 2px rgba(0,0,0,.15)", animation: "elf-cross 3s linear infinite" }} />
                <div style={{ position: "absolute", left: "50%", top: -10, width: 2, height: 20, background: "var(--accent)", marginLeft: -1 }} />
                <div style={{ position: "absolute", left: "50%", bottom: -10, width: 2, height: 20, background: "var(--accent)", marginLeft: -1 }} />
                <div style={{ position: "absolute", top: "50%", left: -10, height: 2, width: 20, background: "var(--accent)", marginTop: -1 }} />
                <div style={{ position: "absolute", top: "50%", right: -10, height: 2, width: 20, background: "var(--accent)", marginTop: -1 }} />
                <div style={{ position: "absolute", left: "50%", top: "50%", width: 7, height: 7, margin: "-3.5px 0 0 -3.5px", borderRadius: "50%", background: "var(--accent)" }} />
              </div>

              {/* result banner */}
              <div ref={resultWrapRef} style={{ position: "absolute", left: 0, top: 120, width: 760, textAlign: "center", opacity: 0, zIndex: 13, pointerEvents: "none", transform: "scale(.5)", transformOrigin: "50% 50%", willChange: "transform,opacity" }}>
                <div ref={resultRef} style={{ display: "inline-block", fontFamily: "'Anton',sans-serif", fontSize: 82, letterSpacing: 2, color: "#fff", WebkitTextStroke: "3px #10130f", textShadow: "5px 5px 0 #10130f" }}>TOR!</div>
              </div>
            </div>

            {/* hint */}
            <div ref={hintRef} style={{ position: "absolute", left: 0, bottom: 14, width: 760, textAlign: "center", zIndex: 11, pointerEvents: "none" }}>
              <span style={{ display: "inline-block", background: "rgba(8,16,10,.55)", color: "#eafff0", fontSize: 12.5, fontWeight: 700, letterSpacing: ".3px", padding: "7px 14px", borderRadius: 999, backdropFilter: "blur(2px)" }}>{hint}</span>
            </div>
          </div>
        </div>

        {/* controls */}
        {!hideControls && (
          <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "14px 6px 4px" }}>
            <button onClick={onReset} style={{ flex: "none", border: "none", cursor: "pointer", fontFamily: "'Rubik',sans-serif", fontWeight: 800, fontSize: 13, padding: "10px 16px", borderRadius: 12, background: "#22382a", color: "#eafff0", boxShadow: "0 4px 0 rgba(0,0,0,.25)" }}>Neu starten</button>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: "#6f8a79" }}><span>Torwart-Stärke</span><span ref={skillLabelRef}>mittel</span></div>
              <input ref={skillRef} type="range" min={0} max={100} defaultValue={keeperSkill} step={5} style={{ width: "100%", accentColor: keeperColor, cursor: "pointer" }} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PenaltyGame;
