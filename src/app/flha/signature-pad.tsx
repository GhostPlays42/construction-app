"use client";

import { useEffect, useRef, useState } from "react";

// The drawing area's own coordinates; the box scales to the screen.
const WIDTH = 600;
const HEIGHT = 200;

// A finger signature, kept as SVG path data so it is small and sharp at
// any size.
export function SignaturePad({ value, onChange }: { value: string; onChange: (path: string) => void }) {
  const box = useRef<SVGSVGElement>(null);
  const [drawing, setDrawing] = useState(false);
  // Moves arrive faster than the screen redraws, so each one builds on the
  // latest path rather than the last drawn one.
  const latest = useRef(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  function add(part: string) {
    latest.current = latest.current ? `${latest.current} ${part}` : part;
    onChange(latest.current);
  }

  function point(e: React.PointerEvent) {
    const r = box.current!.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * WIDTH);
    const y = Math.round(((e.clientY - r.top) / r.height) * HEIGHT);
    return `${Math.min(Math.max(x, 0), WIDTH)} ${Math.min(Math.max(y, 0), HEIGHT)}`;
  }

  return (
    <div className="flex flex-col gap-2">
      <svg
        ref={box}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Signature box"
        className="h-40 w-full touch-none rounded-xl border-2 border-zinc-300 bg-white dark:border-zinc-700"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrawing(true);
          const p = point(e);
          add(`M${p} L${p}`);
        }}
        onPointerMove={(e) => {
          if (drawing) add(`L${point(e)}`);
        }}
        onPointerUp={() => setDrawing(false)}
        onPointerCancel={() => setDrawing(false)}
      >
        <line x1="20" y1="160" x2="580" y2="160" stroke="#d4d4d8" strokeWidth="2" />
        {value && (
          <path d={value} fill="none" stroke="#18181b" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
      <button
        type="button"
        onClick={() => {
          latest.current = "";
          onChange("");
        }}
        disabled={!value}
        className="self-start rounded-lg border-2 border-zinc-300 px-3 py-2 text-base disabled:opacity-30 dark:border-zinc-700"
      >
        Clear signature
      </button>
    </div>
  );
}

// Shows a saved signature.
export function Signature({ path }: { path: string }) {
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="Signature"
      className="h-32 w-full rounded-xl border-2 border-zinc-200 bg-white dark:border-zinc-800"
    >
      <path d={path} fill="none" stroke="#18181b" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
