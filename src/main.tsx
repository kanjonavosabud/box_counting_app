import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Upload, Play, Pause, Image as ImageIcon, SlidersHorizontal } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import './index.css';

type BoxResult = {
  s: number;
  count: number;
  totalBoxes: number;
  logInvS: number;
  logN: number;
};

type RegressionResult = {
  slope: number;
  intercept: number;
} | null;

type HighlightBox = {
  x: number;
  y: number;
  size: number;
  boxIndex: number;
};

type AnalysisResponse = {
  width: number;
  height: number;
  threshold: number;
  boxSizes: number[];
  results: BoxResult[];
  regression: RegressionResult;
  progressiveRegressions: RegressionResult[];
  highlightsByScale: Record<string, HighlightBox[]>;
};

const App: React.FC = () => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number>(180);
  const [isRunning, setIsRunning] = useState(false);
  const [speedMode, setSpeedMode] = useState<'fast' | 'slow'>('fast');
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [results, setResults] = useState<BoxResult[]>([]);
  const [regression, setRegression] = useState<RegressionResult>(null);
  const [currentBoxSizeIndex, setCurrentBoxSizeIndex] = useState<number>(0);
  const [currentHighlightBoxes, setCurrentHighlightBoxes] = useState<HighlightBox[]>([]);

  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null);
  const analysisRequestIdRef = useRef(0);

  const [gridProgress, setGridProgress] = useState<number>(0);
  const [isPrepared, setIsPrepared] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const cleanupAnimation = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  const resetSimulation = useCallback(() => {
    cleanupAnimation();
    setIsRunning(false);
    setResults([]);
    setRegression(null);
    setCurrentBoxSizeIndex(0);
    setGridProgress(0);
    setCurrentHighlightBoxes([]);
  }, []);

  const drawBaseImage = useCallback(() => {
    if (!analysis || !displayCanvasRef.current) return null;

    const canvas = displayCanvasRef.current;
    canvas.width = analysis.width;
    canvas.height = analysis.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, analysis.width, analysis.height);
    if (imageElementRef.current) {
      ctx.drawImage(imageElementRef.current, 0, 0, analysis.width, analysis.height);
    }

    return ctx;
  }, [analysis]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setImageFile(file);
    setAnalysisError(null);
  };

  useEffect(() => {
    if (!imageFile) return;

    const requestId = analysisRequestIdRef.current + 1;
    analysisRequestIdRef.current = requestId;
    const abortController = new AbortController();

    resetSimulation();
    setIsPrepared(false);
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysis(null);

    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('threshold', String(threshold));

    fetch('/api/analyze', {
      method: 'POST',
      body: formData,
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Backend request failed with status ${response.status}`);
        }
        return response.json() as Promise<AnalysisResponse>;
      })
      .then((data) => {
        if (analysisRequestIdRef.current !== requestId) return;
        setAnalysis(data);
        setIsPrepared(true);
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) return;
        const message =
          error instanceof Error ? error.message : 'The Python analysis failed to run.';
        setAnalysisError(message);
      })
      .finally(() => {
        if (analysisRequestIdRef.current === requestId) {
          setIsAnalyzing(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [imageFile, resetSimulation, threshold]);

  const drawGridOverlay = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    boxSize: number,
    highlightBoxes: HighlightBox[],
  ) => {
    ctx.save();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.lineWidth = 1;

    for (let x = 0; x <= width; x += boxSize) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += boxSize) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
    ctx.lineWidth = 2;
    for (const b of highlightBoxes) {
      ctx.beginPath();
      ctx.rect(b.x + 1, b.y + 1, b.size - 2, b.size - 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  };

  useEffect(() => {
    if (!imageUrl || !analysis) return;

    const img = new Image();
    img.onload = () => {
      imageElementRef.current = img;
      const ctx = drawBaseImage();
      if (ctx && currentBoxSizeIndex < analysis.boxSizes.length) {
        drawGridOverlay(
          ctx,
          analysis.width,
          analysis.height,
          analysis.boxSizes[currentBoxSizeIndex],
          currentHighlightBoxes,
        );
      }
    };
    img.src = imageUrl;

    return () => {
      imageElementRef.current = null;
    };
  }, [
    analysis,
    currentBoxSizeIndex,
    currentHighlightBoxes,
    drawBaseImage,
    imageUrl,
  ]);

  const stepSimulation = useCallback(() => {
    if (!analysis || !displayCanvasRef.current || !imageElementRef.current) {
      setIsRunning(false);
      return;
    }

    if (currentBoxSizeIndex >= analysis.boxSizes.length) {
      setIsRunning(false);
      animationFrameRef.current = null;
      return;
    }

    const currentResult = analysis.results[currentBoxSizeIndex];
    const s = currentResult.s;
    const totalBoxes = currentResult.totalBoxes;
    const scaleHighlights = analysis.highlightsByScale[String(s)] ?? [];

    const processedBoxes = Math.floor(gridProgress * totalBoxes);
    const speedFactor = speedMode === 'fast' ? 1 : 0.3;
    const boxesPerFrame = Math.max(1, Math.floor((totalBoxes / 30) * speedFactor));
    const targetProcessed = Math.min(processedBoxes + boxesPerFrame, totalBoxes);

    const visibleHighlights = scaleHighlights.filter(
      (box) => box.boxIndex < targetProcessed,
    );

    const ctx = drawBaseImage();
    if (!ctx) {
      setIsRunning(false);
      return;
    }

    drawGridOverlay(ctx, analysis.width, analysis.height, s, visibleHighlights);
    setCurrentHighlightBoxes(visibleHighlights);

    if (targetProcessed >= totalBoxes) {
      setResults(analysis.results.slice(0, currentBoxSizeIndex + 1));
      setRegression(analysis.progressiveRegressions[currentBoxSizeIndex] ?? null);
      setCurrentBoxSizeIndex((prev) => prev + 1);
      setGridProgress(0);
    } else {
      setGridProgress(targetProcessed / totalBoxes);
    }

    if (isRunning) {
      animationFrameRef.current = requestAnimationFrame(stepSimulation);
    }
  }, [
    analysis,
    currentBoxSizeIndex,
    drawBaseImage,
    gridProgress,
    isRunning,
    speedMode,
  ]);

  useEffect(() => {
    if (isRunning) {
      cleanupAnimation();
      animationFrameRef.current = requestAnimationFrame(stepSimulation);
    } else {
      cleanupAnimation();
    }
    return () => {
      cleanupAnimation();
    };
  }, [isRunning, stepSimulation]);

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  const handleToggleRun = () => {
    if (!imageUrl || !isPrepared || !analysis || analysis.boxSizes.length === 0) return;

    if (isRunning) {
      setIsRunning(false);
      return;
    }

    if (currentBoxSizeIndex >= analysis.boxSizes.length) {
      setResults([]);
      setRegression(null);
      setCurrentBoxSizeIndex(0);
      setGridProgress(0);
      setCurrentHighlightBoxes([]);
    }

    setIsRunning(true);
  };

  const handleThresholdChange = (value: number) => {
    setThreshold(value);
  };

  const chartData = results
    .map((r) => ({
      logInvS: r.logInvS,
      logN: r.logN,
    }))
    .sort((a, b) => a.logInvS - b.logInvS);

  const regressionLineData =
    regression && chartData.length >= 2
      ? (() => {
          const xs = chartData.map((p) => p.logInvS);
          const minX = Math.min(...xs);
          const maxX = Math.max(...xs);
          const y1 = regression.intercept + regression.slope * minX;
          const y2 = regression.intercept + regression.slope * maxX;
          return [
            { logInvS: minX, logN: y1 },
            { logInvS: maxX, logN: y2 },
          ];
        })()
      : [];

  const currentD =
    regression && !Number.isNaN(regression.slope) ? regression.slope : undefined;

  const boxSizes = analysis?.boxSizes ?? [];

  return (
    <div className="min-h-screen bg-white text-slate-900 flex justify-center overflow-y-auto">
      <div className="w-full max-w-5xl px-4 py-6 space-y-4">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-cyan-100 flex items-center justify-center">
              <ImageIcon className="h-5 w-5 text-cyan-500" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Box-Counting Fractal Dimension
              </h1>
              <p className="text-xs text-slate-500">
                Upload an image, then run the box-counting simulation.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="relative inline-flex items-center">
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleFileChange}
              />
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer">
                <Upload className="h-4 w-4" />
                Upload Image
              </div>
            </label>

            <button
              type="button"
              onClick={handleToggleRun}
              disabled={!imageUrl || !isPrepared || boxSizes.length === 0 || isAnalyzing}
              className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isRunning ? (
                <>
                  <Pause className="h-4 w-4" />
                  Pause
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run
                </>
              )}
            </button>

            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span className="font-medium">Speed:</span>
              <button
                type="button"
                onClick={() => setSpeedMode('fast')}
                className={`px-2 py-1 rounded-full border text-[11px] ${
                  speedMode === 'fast'
                    ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                    : 'border-slate-300 bg-white text-slate-600'
                }`}
              >
                Fast
              </button>
              <button
                type="button"
                onClick={() => setSpeedMode('slow')}
                className={`px-2 py-1 rounded-full border text-[11px] ${
                  speedMode === 'slow'
                    ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                    : 'border-slate-300 bg-white text-slate-600'
                }`}
              >
                Slow
              </button>
            </div>

            {(isAnalyzing || analysisError) && (
              <span className={`text-xs ${analysisError ? 'text-rose-600' : 'text-slate-500'}`}>
                {analysisError ?? 'Analyzing image in Python...'}
              </span>
            )}

          </div>
        </header>

        <main className="flex flex-col gap-6 lg:flex-row">
          <section className="lg:w-1/2 flex flex-col gap-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                Image & Box Grid
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 border border-slate-200">
                <SlidersHorizontal className="h-3 w-3" />
                Box size index {currentBoxSizeIndex + 1} / {boxSizes.length || 1}
              </span>
            </div>
            <span className="text-[10px] text-slate-500">
              Powered by `requestAnimationFrame`
            </span>
          </div>

          <div className="relative flex-1 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center min-h-[320px]">
            {imageUrl && (
              <canvas
                ref={displayCanvasRef}
                className="max-w-full max-h-[480px] rounded-lg border border-slate-200 bg-white"
              />
            )}
            {!imageUrl && (
              <div className="flex flex-col items-center text-center text-slate-500 text-sm max-w-xs">
                <ImageIcon className="h-10 w-10 mb-3 text-slate-400" />
                <p className="font-medium mb-1">Upload an image to begin</p>
                <p className="text-xs text-slate-500">
                  The algorithm will convert it to grayscale, threshold it, and
                  overlay dynamic counting grids.
                </p>
              </div>
            )}

            {imageUrl && (
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[10px] text-slate-600">
                <span>
                  Threshold:{' '}
                  <span className="font-semibold text-slate-900">
                    {threshold}
                  </span>
                </span>
                <span>
                  Progress:{' '}
                  <span className="font-semibold text-cyan-600">
                    {(gridProgress * 100).toFixed(0)}%
                  </span>
                </span>
                <span>
                  Boxes in view:{' '}
                  <span className="font-semibold text-slate-900">
                    {currentHighlightBoxes.length}
                  </span>
                </span>
              </div>
            )}
          </div>

          <div className="mt-2">
            <label className="flex items-center justify-between text-xs font-medium text-slate-700 mb-2">
              <span className="flex items-center gap-2">
                Threshold for "black" pixels
                <span className="text-[10px] text-slate-500">
                  lower → only the darkest pixels are foreground
                </span>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700 border border-slate-200">
                {threshold}
              </span>
            </label>
            <input
              type="range"
              min={40}
              max={255}
              value={threshold}
              onChange={(e) => handleThresholdChange(Number(e.target.value))}
              className="w-full accent-cyan-500"
            />
          </div>
        </section>

        <section className="lg:w-1/2 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 mb-1">
                Log–Log Plot
              </h2>
              <p className="text-xs text-slate-600 max-w-md">
                Each point corresponds to a box size \(s\) and the number of
                non-empty boxes \(N(s)\). The slope of the best-fit line is the
                estimated fractal dimension \(D\).
              </p>
            </div>

            <div className="flex flex-col items-end gap-1">
              <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                Current Estimate of D
              </span>
              <div className="inline-flex items-baseline gap-1 rounded-2xl bg-white px-4 py-2 border border-slate-200 shadow-sm">
                <span className="text-2xl font-semibold text-cyan-600 tabular-nums">
                  {currentD !== undefined ? currentD.toFixed(3) : '—'}
                </span>
              </div>
              <span className="text-[10px] text-slate-500">
                using {results.length} scale(s)
              </span>
            </div>
          </div>

          <div className="h-72 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#e5e7eb"
                  vertical={false}
                />
                <XAxis
                  dataKey="logInvS"
                  type="number"
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  tickLine={{ stroke: '#d1d5db' }}
                  axisLine={{ stroke: '#d1d5db' }}
                  label={{
                    value: 'log(L / s)',
                    position: 'insideBottomRight',
                    offset: -5,
                    fill: '#6b7280',
                    fontSize: 11,
                  }}
                  domain={['auto', 'auto']}
                />
                <YAxis
                  dataKey="logN"
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  tickLine={{ stroke: '#d1d5db' }}
                  axisLine={{ stroke: '#d1d5db' }}
                  label={{
                    value: 'log(N)',
                    angle: -90,
                    position: 'insideLeft',
                    offset: 10,
                    fill: '#6b7280',
                    fontSize: 11,
                  }}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    fontSize: 11,
                    color: '#111827',
                  }}
                  labelFormatter={(x) => `log(L / s) = ${x.toFixed(3)}`}
                  formatter={(value: number) => [`${value.toFixed(3)}`, 'log(N)']}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value) => (
                    <span className="text-xs text-slate-600">{value}</span>
                  )}
                />
                <Line
                  type="monotone"
                  dataKey="logN"
                  stroke="#06b6d4"
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 1, stroke: '#e5e7eb', fill: '#06b6d4' }}
                  name="log(N)"
                  isAnimationActive={true}
                />
                {regressionLineData.length > 0 && (
                  <Line
                    type="linear"
                    data={regressionLineData}
                    dataKey="logN"
                    stroke="#f97316"
                    strokeWidth={1.5}
                    dot={false}
                    name="Best-fit line"
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-2">
            <h3 className="text-xs font-semibold text-slate-700 mb-2">
              Scale-by-Scale Results
            </h3>
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="max-h-52 overflow-auto">
                <table className="min-w-full text-[11px]">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-500 border-b border-slate-200">
                        Box size s (px)
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500 border-b border-slate-200">
                        N(s)
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500 border-b border-slate-200">
                        log(L / s)
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-slate-500 border-b border-slate-200">
                        log(N)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, idx) => (
                      <tr
                        key={r.s}
                        className={
                          idx === results.length - 1
                            ? 'bg-cyan-50'
                            : idx % 2 === 0
                            ? 'bg-white'
                            : 'bg-slate-50'
                        }
                      >
                        <td className="px-3 py-1.5 text-slate-900 tabular-nums">
                          {r.s}
                        </td>
                        <td className="px-3 py-1.5 text-slate-900 tabular-nums">
                          {r.count}
                        </td>
                        <td className="px-3 py-1.5 text-slate-700 tabular-nums">
                          {r.logInvS.toFixed(4)}
                        </td>
                        <td className="px-3 py-1.5 text-slate-700 tabular-nums">
                          {r.logN.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                    {results.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-3 text-center text-slate-500"
                        >
                          Run the simulation to populate scale-by-scale results.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
      </main>
      </div>
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

