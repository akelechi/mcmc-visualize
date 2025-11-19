"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play, Pause, RotateCcw, Settings, Info, ChevronRight,
  Activity, Zap, Compass, Disc, TrendingUp, Grid
} from 'lucide-react';
import './simulator.css';

/**
 * TYPESCRIPT INTERFACES
 */

type AlgoType = 'rwm' | 'mh' | 'slice' | 'elliptical' | 'hitnrun' | 'hmc';
type TargetType = 'gaussian' | 'bimodal' | 'donut' | 'banana';

interface Point {
  x: number;
  y: number;
}

interface Sample extends Point {
  accepted: boolean;
}

interface Params {
  stepSize: number;
  stepsPerFrame: number;
  hmcSteps: number;
  hmcEpsilon: number;
}

interface Gradient {
  dx: number;
  dy: number;
}

interface StateRef {
  x: number;
  y: number;
  samples: Sample[];
  currentPath: Point[] | null;
}

// --- MATH UTILS ---

const PI2 = Math.PI * 2;

const randn = (): number => {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

const rand = (min: number, max: number): number => Math.random() * (max - min) + min;

const LOG_PROBS: Record<TargetType, (x: number, y: number) => number> = {
  gaussian: (x, y) => -0.5 * (x * x + y * y),
  bimodal: (x, y) => {
    const p1 = Math.exp(-((x + 1.5) ** 2 + (y + 1.5) ** 2) * 2);
    const p2 = Math.exp(-((x - 1.5) ** 2 + (y - 1.5) ** 2) * 2);
    return Math.log(p1 + p2 + 1e-9);
  },
  donut: (x, y) => {
    const r = Math.sqrt(x * x + y * y);
    return -2 * ((r - 2.5) ** 2);
  },
  banana: (x, y) => {
    const a = 1; 
    const b = 5;
    return -((a - x) ** 2 + b * (y - x * x) ** 2) / 10;
  }
};

const GRADIENTS: Record<TargetType, (x: number, y: number) => Gradient> = {
  gaussian: (x, y) => ({ dx: -x, dy: -y }),
  bimodal: (x, y) => {
    const e1 = Math.exp(-((x + 1.5) ** 2 + (y + 1.5) ** 2) * 2);
    const e2 = Math.exp(-((x - 1.5) ** 2 + (y - 1.5) ** 2) * 2);
    const sum = e1 + e2 + 1e-9;
    const dx = (e1 * -4 * (x + 1.5) + e2 * -4 * (x - 1.5)) / sum;
    const dy = (e1 * -4 * (y + 1.5) + e2 * -4 * (y - 1.5)) / sum;
    return { dx, dy };
  },
  donut: (x, y) => {
    const r = Math.sqrt(x * x + y * y) + 1e-9;
    const term = -4 * (r - 2.5);
    return { dx: term * (x / r), dy: term * (y / r) };
  },
  banana: (x, y) => {
    const b = 5;
    const term2 = (y - x * x);
    const dx = -( (2 * (x - 1) + 2 * b * term2 * (-2 * x)) / 10 );
    const dy = -( (2 * b * term2) / 10 );
    return { dx, dy };
  }
};

// --- COMPONENT ---

export default function MCMCSimulator() {
  const [algo, setAlgo] = useState<AlgoType>('rwm');
  const [target, setTarget] = useState<TargetType>('bimodal');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  
  // Stats for UI
  const [sampleCount, setSampleCount] = useState(0);
  
  const [params, setParams] = useState<Params>({
    stepSize: 0.5,
    stepsPerFrame: 1,
    hmcSteps: 10,
    hmcEpsilon: 0.1,
  });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const backgroundRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  
  const stateRef = useRef<StateRef>({
    x: 0.1, y: 0.1,
    samples: [],
    currentPath: null
  });

  const reset = useCallback(() => {
    stateRef.current = { x: 0.1, y: 0.1, samples: [], currentPath: null };
    setSampleCount(0);
    drawBackground();
    
    // Clear main canvas immediately
    const cvs = canvasRef.current;
    if (cvs) {
      const ctx = cvs.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, cvs.width, cvs.height);
        // Draw start
        const width = cvs.width;
        const scale = width / 10;
        const offset = width / 2;
        const cx = 0.1 * scale + offset;
        const cy = -0.1 * scale + offset;
        
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, PI2);
        ctx.fillStyle = '#fbbf24';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.stroke();
      }
    }
  }, [target]);

  useEffect(() => {
    reset();
  }, [target, reset]);

  const drawBackground = () => {
    const cvs = backgroundRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const width = cvs.width;
    const height = cvs.height;
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;
    const scale = width / 10;
    const offset = width / 2;
    const logProbFn = LOG_PROBS[target];
    
    for (let py = 0; py < height; py++) {
      for (let px = 0; px < width; px++) {
        const x = (px - offset) / scale;
        const mathY = -((py - offset) / scale);
        
        const lp = logProbFn(x, mathY);
        const p = Math.exp(lp); 
        const intensity = Math.min(255, Math.floor(p * 2000));
        
        const index = (py * width + px) * 4;
        data[index] = 30 + intensity * 0.5;     // R
        data[index + 1] = 40 + intensity * 0.8; // G
        data[index + 2] = 50 + intensity;       // B
        data[index + 3] = 255;                  // A
      }
    }
    ctx.putImageData(imgData, 0, 0);
  };

  // --- ALGORITHMS (Types added) ---

  const stepRWM = (current: Point, lpFn: (x:number, y:number)=>number) => {
    const { stepSize } = params;
    const xNew = current.x + randn() * stepSize;
    const yNew = current.y + randn() * stepSize;
    
    const currentLp = lpFn(current.x, current.y);
    const newLp = lpFn(xNew, yNew);
    
    if (Math.log(Math.random()) < newLp - currentLp) {
      return { x: xNew, y: yNew, accepted: true };
    }
    return { ...current, accepted: false };
  };

  const stepMH = (current: Point, lpFn: (x:number, y:number)=>number) => {
    const sigma = 1.5;
    const xNew = randn() * sigma;
    const yNew = randn() * sigma;
    const currentLp = lpFn(current.x, current.y);
    const newLp = lpFn(xNew, yNew);
    const logQ = (x: number, y: number) => -0.5 * (x*x + y*y) / (sigma*sigma);
    const ratio = newLp + logQ(current.x, current.y) - currentLp - logQ(xNew, yNew);
    
    if (Math.log(Math.random()) < ratio) {
      return { x: xNew, y: yNew, accepted: true };
    }
    return { ...current, accepted: false };
  };

  const stepSlice = (current: Point, lpFn: (x:number, y:number)=>number) => {
    const currentLp = lpFn(current.x, current.y);
    const threshold = currentLp + Math.log(Math.random());
    const theta = Math.random() * PI2;
    const dx = Math.cos(theta);
    const dy = Math.sin(theta);

    let L = -Math.random() * params.stepSize;
    let R = L + params.stepSize;
    
    let loop = 0;
    while (loop < 100 && lpFn(current.x + L*dx, current.y + L*dy) > threshold) {
      L -= params.stepSize;
      loop++;
    }
    loop = 0;
    while (loop < 100 && lpFn(current.x + R*dx, current.y + R*dy) > threshold) {
      R += params.stepSize;
      loop++;
    }

    let newX, newY;
    loop = 0;
    while (loop < 100) {
      const dist = rand(L, R);
      newX = current.x + dist * dx;
      newY = current.y + dist * dy;
      
      if (lpFn(newX, newY) > threshold) {
        return { 
          x: newX, y: newY, accepted: true, 
          path: [{x: current.x + L*dx, y: current.y + L*dy}, {x: current.x + R*dx, y: current.y + R*dy}] 
        };
      }
      if (dist < 0) L = dist;
      else R = dist;
      loop++;
    }
    return { ...current, accepted: false };
  };

  const stepElliptical = (current: Point, lpFn: (x:number, y:number)=>number) => {
    const nuX = randn();
    const nuY = randn();
    const currentLp = lpFn(current.x, current.y);
    const threshold = currentLp + Math.log(Math.random());

    let theta = Math.random() * PI2;
    let thetaMin = theta - PI2;
    let thetaMax = theta;

    let newX, newY;
    let loops = 0;
    while (loops < 50) {
      newX = current.x * Math.cos(theta) + nuX * Math.sin(theta);
      newY = current.y * Math.cos(theta) + nuY * Math.sin(theta);

      if (lpFn(newX, newY) > threshold) {
        return { x: newX, y: newY, accepted: true };
      }

      if (theta < 0) thetaMin = theta;
      else thetaMax = theta;

      theta = rand(thetaMin, thetaMax);
      loops++;
    }
    return { ...current, accepted: false };
  };

  const stepHitAndRun = (current: Point, lpFn: (x:number, y:number)=>number) => {
    const theta = Math.random() * PI2;
    const dx = Math.cos(theta);
    const dy = Math.sin(theta);
    const currentLp = lpFn(current.x, current.y);
    const threshold = currentLp + Math.log(Math.random());
    
    let L = -1.0;
    let R = 1.0;
    
    let loop = 0;
    while (loop < 20 && lpFn(current.x + L*dx, current.y + L*dy) > threshold) { L *= 2; loop++; }
    loop = 0;
    while (loop < 20 && lpFn(current.x + R*dx, current.y + R*dy) > threshold) { R *= 2; loop++; }
    
    let newX, newY;
    loop = 0;
    while (loop < 50) {
      const dist = rand(L, R);
      newX = current.x + dist * dx;
      newY = current.y + dist * dy;
      if (lpFn(newX, newY) > threshold) return { x: newX, y: newY, accepted: true };
      if (dist < 0) L = dist; else R = dist;
      loop++;
    }
    return { ...current, accepted: false };
  };

  const stepHMC = (current: Point, lpFn: (x:number, y:number)=>number, gradFn: (x:number, y:number)=>Gradient) => {
    const { hmcSteps, hmcEpsilon } = params;
    let px = randn();
    let py = randn();
    const initialPx = px;
    const initialPy = py;
    let x = current.x;
    let y = current.y;
    const trajectory = [{x, y}];

    let grad = gradFn(x, y);
    px += 0.5 * hmcEpsilon * grad.dx;
    py += 0.5 * hmcEpsilon * grad.dy;

    for (let i = 0; i < hmcSteps; i++) {
      x += hmcEpsilon * px;
      y += hmcEpsilon * py;
      trajectory.push({x, y});
      grad = gradFn(x, y);
      if (i !== hmcSteps - 1) {
        px += hmcEpsilon * grad.dx;
        py += hmcEpsilon * grad.dy;
      }
    }
    px += 0.5 * hmcEpsilon * grad.dx;
    py += 0.5 * hmcEpsilon * grad.dy;

    const currentU = -lpFn(current.x, current.y);
    const currentK = 0.5 * (initialPx**2 + initialPy**2);
    const proposedU = -lpFn(x, y);
    const proposedK = 0.5 * (px**2 + py**2);
    const currentH = currentU + currentK;
    const proposedH = proposedU + proposedK;

    if (Math.log(Math.random()) < currentH - proposedH) {
      return { x, y, accepted: true, path: trajectory };
    }
    return { ...current, accepted: false, path: trajectory };
  };

  const animate = (time: number) => {
    if (!isRunning) return;
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const width = cvs.width;
    const height = cvs.height;
    const scale = width / 10;
    const offset = width / 2;
    const toCanvas = (x: number, y: number) => ({ cx: x * scale + offset, cy: -y * scale + offset });

    ctx.clearRect(0, 0, width, height);

    const lpFn = LOG_PROBS[target];
    const gradFn = GRADIENTS[target];
    let accepts = 0;

    for (let k = 0; k < params.stepsPerFrame; k++) {
      let result: any;
      const curr = { x: stateRef.current.x, y: stateRef.current.y };
      
      switch(algo) {
        case 'rwm': result = stepRWM(curr, lpFn); break;
        case 'mh': result = stepMH(curr, lpFn); break;
        case 'slice': result = stepSlice(curr, lpFn); break;
        case 'elliptical': result = stepElliptical(curr, lpFn); break;
        case 'hitnrun': result = stepHitAndRun(curr, lpFn); break;
        case 'hmc': result = stepHMC(curr, lpFn, gradFn); break;
        default: result = curr;
      }

      stateRef.current.x = result.x;
      stateRef.current.y = result.y;
      stateRef.current.currentPath = result.path || null;
      if (result.accepted) accepts++;
      
      stateRef.current.samples.push({ x: result.x, y: result.y, accepted: result.accepted });
      if (stateRef.current.samples.length > 2000) stateRef.current.samples.shift();
    }

    // Update UI stats sparsely
    if (Math.random() < 0.1) {
      setSampleCount(stateRef.current.samples.length);
    }

    // Draw Samples
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    stateRef.current.samples.forEach((s, i) => {
      const { cx, cy } = toCanvas(s.x, s.y);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.stroke();

    // Draw Dots
    stateRef.current.samples.forEach(s => {
      const { cx, cy } = toCanvas(s.x, s.y);
      ctx.fillStyle = s.accepted ? 'rgba(100, 255, 218, 0.6)' : 'rgba(239, 68, 68, 0.3)';
      ctx.fillRect(cx - 1, cy - 1, 2, 2);
    });

    // Draw Path
    const curPos = toCanvas(stateRef.current.x, stateRef.current.y);
    if (stateRef.current.currentPath) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 200, 0, 0.8)';
      ctx.lineWidth = 2;
      stateRef.current.currentPath.forEach((pt, i) => {
        const { cx, cy } = toCanvas(pt.x, pt.y);
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      });
      ctx.stroke();
    }

    // Draw Head
    ctx.beginPath();
    ctx.arc(curPos.cx, curPos.cy, 4, 0, PI2);
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.stroke();

    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (isRunning) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(requestRef.current);
    }
    return () => cancelAnimationFrame(requestRef.current);
  }, [isRunning, algo, target, params]);


  // --- SUBCOMPONENTS ---

  const SidebarItem = ({ id, label, icon: Icon, desc }: { id: AlgoType, label: string, icon: any, desc: string }) => (
    <button
      onClick={() => { setAlgo(id); reset(); }}
      className={`sidebar-item ${algo === id ? 'active' : ''}`}
    >
      <div className={`icon-box ${algo === id ? 'active' : ''}`}>
        <Icon size={18} />
      </div>
      <div className="label-box">
        <div className="title">{label}</div>
        <div className="desc">{desc}</div>
      </div>
      {algo === id && <ChevronRight className="arrow" />}
    </button>
  );

  return (
    <div className="app-container">
      {/* LEFT SIDEBAR */}
      <div className="sidebar">
        <div className="header-logo">
          <Activity className="text-emerald-400" size={24} color="#34d399" />
          <h1>MCMC<span>Lab</span></h1>
        </div>

        <div className="section-title">Algorithms</div>
        <div className="menu">
          <SidebarItem id="rwm" label="Random Walk Metropolis" desc="Simple local proposals" icon={Compass} />
          <SidebarItem id="mh" label="Indep. Metropolis Hastings" desc="Fixed global proposal" icon={Grid} />
          <SidebarItem id="slice" label="Slice Sampling" desc="Adaptive step size" icon={Disc} />
          <SidebarItem id="elliptical" label="Elliptical Slice" desc="For Gaussian priors" icon={Zap} />
          <SidebarItem id="hitnrun" label="Hit-and-Run" desc="Random direction lines" icon={TrendingUp} />
          <SidebarItem id="hmc" label="Hamiltonian Monte Carlo" desc="Gradient-based physics" icon={Activity} />
        </div>

        <div className="info-box">
          <div style={{display:'flex', gap:'8px', marginBottom:'8px', fontWeight:'bold', color:'#cbd5e1'}}>
            <Info size={14} />
            <span>About {algo.toUpperCase()}</span>
          </div>
          <p style={{lineHeight:'1.5', opacity:0.8}}>
            {algo === 'rwm' && "Proposes a move nearby. Fails in high dimensions or correlated distributions (Random Walk behavior)."}
            {algo === 'mh' && "Uses a fixed proposal distribution. Good if proposal matches target, terrible otherwise."}
            {algo === 'slice' && "Adaptively chooses step size by sampling uniformly under the curve. Robust and requires less tuning."}
            {algo === 'elliptical' && "Specialized for models with Gaussian priors. Replaces linear search with elliptical rotation."}
            {algo === 'hitnrun' && "Picks a random direction and samples along the line. Good for bounded convex spaces."}
            {algo === 'hmc' && "Uses gradients to simulate particle physics. Suppresses random walk behavior, moving far across the state space efficiently."}
          </p>
        </div>
      </div>

      {/* MAIN VISUALIZER */}
      <div className="main-content">
        
        <div className="top-bar">
          <div className="controls-group">
            <select 
              value={target} 
              onChange={(e) => setTarget(e.target.value as TargetType)}
              className="select-input"
            >
              <option value="gaussian">Gaussian</option>
              <option value="bimodal">Bimodal Mixture</option>
              <option value="donut">Donut (Ring)</option>
              <option value="banana">Banana (Rosenbrock)</option>
            </select>
            
            <div className="divider"></div>

            <button 
              onClick={() => setIsRunning(!isRunning)}
              className={`btn ${isRunning ? 'btn-danger' : 'btn-primary'}`}
            >
              {isRunning ? <><Pause size={14}/> Stop</> : <><Play size={14}/> Start</>}
            </button>

            <button 
              onClick={reset}
              className="btn btn-icon"
              title="Reset Chain"
            >
              <RotateCcw size={16} />
            </button>
          </div>

          <div className="stats">
            <div>SAMPLES: <span>{sampleCount}</span></div>
          </div>
        </div>

        <div className="canvas-container">
          <div className="canvas-wrapper">
            <canvas 
              ref={backgroundRef} 
              width={600} 
              height={600} 
              className="canvas-layer canvas-bg"
            />
            <canvas 
              ref={canvasRef} 
              width={600} 
              height={600} 
              className="canvas-layer canvas-fg"
            />
            <div className="crosshair-h"></div>
            <div className="crosshair-v"></div>
          </div>
        </div>
      </div>

      {/* RIGHT CONFIG PANEL */}
      <div className="config-panel">
        <div className="panel-header">
          <Settings size={16} />
          <span>Parameters</span>
        </div>

        <div className="control-item">
          <label>
            Step Size (Sigma)
            <span>{params.stepSize}</span>
          </label>
          <input 
            type="range" min="0.1" max="3.0" step="0.1"
            value={params.stepSize}
            onChange={(e) => setParams({...params, stepSize: parseFloat(e.target.value)})}
            className="range-input"
          />
        </div>

        <div className="control-item">
          <label>
            Speed (Steps/Frame)
            <span>{params.stepsPerFrame}</span>
          </label>
          <input 
            type="range" min="1" max="20" step="1"
            value={params.stepsPerFrame}
            onChange={(e) => setParams({...params, stepsPerFrame: parseInt(e.target.value)})}
            className="range-input"
          />
        </div>

        {algo === 'hmc' && (
          <div className="hmc-section">
            <div className="hmc-title">HMC Specific</div>
            <div className="control-item">
              <label>
                Leapfrog Steps (L)
                <span className="amber">{params.hmcSteps}</span>
              </label>
              <input 
                type="range" min="1" max="50" step="1"
                value={params.hmcSteps}
                onChange={(e) => setParams({...params, hmcSteps: parseInt(e.target.value)})}
                className="range-input amber"
              />
            </div>
            <div className="control-item">
              <label>
                Step Size (ε)
                <span className="amber">{params.hmcEpsilon}</span>
              </label>
              <input 
                type="range" min="0.01" max="0.5" step="0.01"
                value={params.hmcEpsilon}
                onChange={(e) => setParams({...params, hmcEpsilon: parseFloat(e.target.value)})}
                className="range-input amber"
              />
            </div>
          </div>
        )}

        <div className="tip-box">
            <div className="tip-title">Pro Tip</div>
            <div className="tip-text">
              Try the <strong>Donut</strong> distribution. Random Walk will get stuck, but <strong>HMC</strong> will glide effortlessly around the ring.
            </div>
        </div>
      </div>

    </div>
  );
}