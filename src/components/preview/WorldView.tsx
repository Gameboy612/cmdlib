"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EntityData, Vec3 } from "@/lib/mc/entities";
import { entityCustomName, entityPos, entityRotation } from "@/lib/mc/entities";
import { entityInfo } from "@/lib/mc/data";
import type { World } from "@/lib/mc/world";
import { renderTextComponent, type TextRenderContext } from "@/lib/mc/text";
import type { NbtTag } from "@/lib/mc/nbt";
import styles from "./world-view.module.css";

export interface WorldViewProps {
  world: World;
  revision: number;
  interactive?: boolean;
  compact?: boolean;
  selected?: string | null;
  onSelect?: (uuid: string | null) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLCanvasElement>, entity: EntityData | null) => void;
  showHud?: boolean;
  className?: string;
}

interface Camera {
  zoom: number;
  panX: number;
  panY: number;
  angle: number;
}

const GROUND_Y = 64;

export function WorldView({
  world,
  revision,
  interactive = false,
  compact = false,
  selected = null,
  onSelect,
  onContextMenu,
  showHud = true,
  className,
}: WorldViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const camera = useRef<Camera>({ zoom: 1, panX: 0, panY: 0, angle: 0 });
  const [hovered, setHovered] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 800, height: 500 });
  const pointer = useRef<{ x: number; y: number; dragging: boolean; moved: boolean }>({
    x: 0,
    y: 0,
    dragging: false,
    moved: false,
  });
  const rotate = useRef<{ x: number; y: number; travel: number; active: boolean; moved: boolean }>({
    x: 0,
    y: 0,
    travel: 0,
    active: false,
    moved: false,
  });
  const pendingContext = useRef<{
    event: React.MouseEvent<HTMLCanvasElement>;
    entity: EntityData | null;
  } | null>(null);
  const positions = useRef(new Map<string, { x: number; y: number; entity: EntityData }>());
  const chatRef = useRef<HTMLDivElement | null>(null);
  const chatStick = useRef(true);

  const textContext = useMemo(
    () => world.textContext(world.player() ?? null),
    [world, revision],
  );

  useEffect(() => {
    const element = chatRef.current;
    if (element && chatStick.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [revision, world.logs.length]);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(size.width * dpr));
    canvas.height = Math.max(1, Math.floor(size.height * dpr));
    canvas.style.width = `${size.width}px`;
    canvas.style.height = `${size.height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    const monoFamily =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--font-jetbrains")
        .trim() || "monospace";
    const mono = (px: number) => `${px}px ${monoFamily}`;

    const { zoom, panX, panY, angle } = camera.current;
    const base = Math.min(size.width, size.height) / (compact ? 24 : 23);
    const scale = base * zoom;
    const cx = size.width / 2 + panX;
    const cy = size.height / 2 + panY + (compact ? 18 : 8);
    const cos30 = 0.866;
    const sin30 = 0.5;
    const rotation = (Math.PI / 2) * angle;

    const project = (pos: Vec3): [number, number] => {
      const rx = pos.x * Math.cos(rotation) - pos.z * Math.sin(rotation);
      const rz = pos.x * Math.sin(rotation) + pos.z * Math.cos(rotation);
      return [
        cx + (rx - rz) * cos30 * scale,
        cy + (rx + rz) * sin30 * scale - (pos.y - GROUND_Y) * scale * 0.82,
      ];
    };

    // Ambient radial glow.
    const glow = ctx.createRadialGradient(cx, cy - scale * 2, 0, cx, cy, scale * 11);
    glow.addColorStop(0, "rgba(255, 122, 69, 0.07)");
    glow.addColorStop(0.5, "rgba(121, 217, 198, 0.025)");
    glow.addColorStop(1, "rgba(8, 9, 11, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size.width, size.height);

    // Ground plate.
    const R = 14;
    const corners: Vec3[] = [
      { x: -R, y: GROUND_Y, z: -R },
      { x: R, y: GROUND_Y, z: -R },
      { x: R, y: GROUND_Y, z: R },
      { x: -R, y: GROUND_Y, z: R },
    ];
    ctx.beginPath();
    corners.forEach((corner, index) => {
      const [x, y] = project(corner);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    const plate = ctx.createLinearGradient(cx, cy - scale * 6, cx, cy + scale * 8);
    plate.addColorStop(0, "rgba(30, 44, 38, 0.42)");
    plate.addColorStop(1, "rgba(12, 17, 16, 0.1)");
    ctx.fillStyle = plate;
    ctx.fill();
    ctx.strokeStyle = "rgba(233, 229, 220, 0.10)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Grid.
    ctx.font = mono(9);
    for (let i = -R; i <= R; i += 2) {
      const major = i % 4 === 0;
      ctx.strokeStyle = major ? "rgba(233, 229, 220, 0.09)" : "rgba(233, 229, 220, 0.045)";
      ctx.lineWidth = major ? 1 : 0.6;
      const [ax, ay] = project({ x: -R, y: GROUND_Y, z: i });
      const [bx, by] = project({ x: R, y: GROUND_Y, z: i });
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      const [cx1, cy1] = project({ x: i, y: GROUND_Y, z: -R });
      const [cx2, cy2] = project({ x: i, y: GROUND_Y, z: R });
      ctx.beginPath();
      ctx.moveTo(cx1, cy1);
      ctx.lineTo(cx2, cy2);
      ctx.stroke();
      if (major && !compact) {
        ctx.fillStyle = "rgba(233, 229, 220, 0.22)";
        const [lx, ly] = project({ x: i, y: GROUND_Y, z: -R });
        ctx.fillText(String(i), lx + 4, ly - 2);
      }
    }

    // Axes.
    const axis = (
      from: Vec3,
      to: Vec3,
      color: string,
      label: string,
    ) => {
      const [x1, y1] = project(from);
      const [x2, y2] = project(to);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = mono(9);
      ctx.fillText(label, x2 + 6, y2 + 2);
    };
    axis({ x: 0, y: GROUND_Y, z: 0 }, { x: 9, y: GROUND_Y, z: 0 }, "rgba(255, 122, 69, 0.6)", "x");
    axis({ x: 0, y: GROUND_Y, z: 0 }, { x: 0, y: GROUND_Y, z: 9 }, "rgba(121, 217, 198, 0.55)", "z");
    axis({ x: 0, y: GROUND_Y, z: 0 }, { x: 0, y: GROUND_Y + 7, z: 0 }, "rgba(233, 201, 143, 0.6)", "y");

    // Origin ring.
    const [ox, oy] = project({ x: 0, y: GROUND_Y, z: 0 });
    ctx.strokeStyle = "rgba(233, 229, 220, 0.2)";
    ctx.beginPath();
    ctx.arc(ox, oy, 4, 0, Math.PI * 2);
    ctx.stroke();

    // Blocks (setblock is not simulated yet, but showing any that exist makes
    // the preview honest if that changes).
    for (const [key] of world.blocks) {
      const [bx, by, bz] = key.split(",").map(Number);
      const cornersBlock: Vec3[] = [
        { x: bx - 0.5, y: by + 0.5, z: bz - 0.5 },
        { x: bx + 0.5, y: by + 0.5, z: bz - 0.5 },
        { x: bx + 0.5, y: by + 0.5, z: bz + 0.5 },
        { x: bx - 0.5, y: by + 0.5, z: bz + 0.5 },
      ];
      ctx.beginPath();
      cornersBlock.forEach((corner, index) => {
        const [x, y] = project(corner);
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = "rgba(121, 217, 198, 0.18)";
      ctx.fill();
      ctx.strokeStyle = "rgba(121, 217, 198, 0.4)";
      ctx.stroke();
    }

    // Entities, drawn far-to-near.
    const titleLife =
      (world.titles.times.fadeIn + world.titles.times.stay + world.titles.times.fadeOut) * 50;
    const titleFresh =
      !!world.titles.title && Date.now() - world.titles.setAt < titleLife;
    const entities = [...world.entities]
      .map((entity) => ({ entity, pos: entityPos(entity) }))
      .sort((a, b) => {
        const ar = Math.cos(rotation) * a.pos.x - Math.sin(rotation) * a.pos.z;
        const br = Math.cos(rotation) * b.pos.x - Math.sin(rotation) * b.pos.z;
        return ar - br;
      });

    positions.current.clear();

    for (const { entity, pos } of entities) {
      const [sx, sy] = project(pos);
      const [gx, gy] = project({ x: pos.x, y: GROUND_Y, z: pos.z });
      const info = entityInfo(entity.type);
      const isSelected = selected === entity.uuid;
      const isHovered = hovered === entity.uuid;
      positions.current.set(entity.uuid, { x: sx, y: sy, entity });

      // Shadow on the ground plane.
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.ellipse(gx, gy, scale * 0.55, scale * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Tether for elevated entities.
      if (Math.abs(pos.y - GROUND_Y) > 0.2) {
        ctx.strokeStyle = "rgba(233, 229, 220, 0.16)";
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(gx, gy);
        ctx.lineTo(sx, sy);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const color = info.color;
      ctx.save();
      if (isSelected || isHovered) {
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
      }
      drawEntityGlyph(ctx, sx, sy, scale, info.shape, color, isSelected || isHovered);
      ctx.restore();

      if (isSelected) {
        ctx.strokeStyle = "#ff7a45";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy - scale * 0.35, scale * 1.1, 0, Math.PI * 2);
        ctx.stroke();
      }

      const showLabel =
        !titleFresh &&
        (isSelected ||
          isHovered ||
          (!compact && (info.category === "player" || entity.isPlayer || zoom > 1.25)) ||
          entity.isPlayer);
      if (showLabel) {
        const name = entityCustomName(entity);
        const label = compact && !entity.isPlayer ? name.slice(0, 14) : name;
        ctx.font = mono(compact ? 9 : 10);
        const width = ctx.measureText(label).width;
        const lx = sx - width / 2 - 6;
        const ly = sy - scale * 1.45;
        ctx.fillStyle = "rgba(8, 10, 12, 0.78)";
        ctx.strokeStyle = isSelected ? "rgba(255, 122, 69, 0.55)" : "rgba(233, 229, 220, 0.14)";
        ctx.lineWidth = 1;
        roundedRect(ctx, lx, ly, width + 12, 18, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = isSelected ? "#ffb28a" : "#d9d5cc";
        ctx.fillText(label, lx + 6, ly + 12.5);
      }
    }

    // Hover hit test happens in pointer handlers; the tooltip is DOM.
  }, [size, compact, selected, hovered, revision, world]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element || !interactive) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const next = camera.current.zoom * (event.deltaY > 0 ? 0.92 : 1.08);
      camera.current.zoom = Math.min(2.4, Math.max(0.55, next));
      draw();
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [interactive, draw]);

  const pick = (clientX: number, clientY: number): EntityData | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let best: EntityData | null = null;
    let bestDistance = 26;
    for (const entry of positions.current.values()) {
      const distance = Math.hypot(entry.x - x, entry.y - 12 - y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = entry.entity;
      }
    }
    return best;
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (!interactive) return;
    if (event.button === 2) {
      pendingContext.current = null;
      rotate.current = {
        x: event.clientX,
        y: event.clientY,
        travel: 0,
        active: true,
        moved: false,
      };
      pointer.current.dragging = false;
      setHovered(null);
      (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
      return;
    }
    if (event.button !== 0) return;
    pointer.current = {
      x: event.clientX,
      y: event.clientY,
      dragging: true,
      moved: false,
    };
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!interactive) return;
    if (rotate.current.active) {
      const dx = event.clientX - rotate.current.x;
      const dy = event.clientY - rotate.current.y;
      rotate.current.travel += Math.abs(dx) + Math.abs(dy);
      if (rotate.current.travel > 4) rotate.current.moved = true;
      rotate.current.x = event.clientX;
      rotate.current.y = event.clientY;
      if (dx !== 0) {
        // About 90px of horizontal travel per quarter turn.
        const angle = (camera.current.angle + dx / 90) % 4;
        camera.current.angle = angle < 0 ? angle + 4 : angle;
        draw();
      }
      return;
    }
    if (pointer.current.dragging) {
      const dx = event.clientX - pointer.current.x;
      const dy = event.clientY - pointer.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) pointer.current.moved = true;
      camera.current.panX += dx;
      camera.current.panY += dy;
      pointer.current.x = event.clientX;
      pointer.current.y = event.clientY;
      draw();
    } else {
      const entity = pick(event.clientX, event.clientY);
      setHovered(entity?.uuid ?? null);
    }
  };
  const onPointerUp = (event: React.PointerEvent) => {
    if (!interactive) return;
    if (event.button === 2) {
      rotate.current.active = false;
      const pending = pendingContext.current;
      pendingContext.current = null;
      if (pending) {
        if (!rotate.current.moved) onContextMenu?.(pending.event, pending.entity);
        rotate.current.moved = false;
      }
      return;
    }
    if (event.button !== 0) return;
    if (!pointer.current.moved) {
      const entity = pick(event.clientX, event.clientY);
      onSelect?.(entity?.uuid ?? null);
    }
    pointer.current.dragging = false;
  };

  const resetCamera = () => {
    camera.current = { zoom: 1, panX: 0, panY: 0, angle: 0 };
    draw();
  };

  const sidebar = showHud ? world.sidebar() : null;
  const player = world.player() ?? null;
  const componentContext: TextRenderContext = textContext;
  const hoveredEntity = hovered ? world.entityByUuid(hovered) : null;

  return (
    <div
      ref={wrapRef}
      className={`${styles.viewport} ${compact ? styles.compact : ""} ${className ?? ""}`}
      data-interactive={interactive || undefined}
    >
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(event) => {
          if (!interactive) return;
          event.preventDefault();
          if (rotate.current.active) {
            // Some platforms fire the menu on right-button press. Defer the
            // decision until the pointer is released so a drag can suppress it.
            pendingContext.current = {
              event,
              entity: pick(event.clientX, event.clientY),
            };
            return;
          }
          if (rotate.current.moved) {
            rotate.current.moved = false;
            return;
          }
          onContextMenu?.(event, pick(event.clientX, event.clientY));
        }}
        onPointerLeave={() => {
          setHovered(null);
          pointer.current.dragging = false;
          rotate.current.active = false;
        }}
        aria-label="Isometric preview of the simulated Minecraft world"
      />

      {showHud && (
        <>
          <div className={styles.topLeft}>
            <span className={styles.liveBadge}>
              <span className={styles.liveDot} />
              {world.version.id} · overworld
            </span>
            <span className={styles.coord}>y={GROUND_Y} · {world.entities.length} entities</span>
          </div>

          <div className={styles.cameraControls}>
            <button type="button" onClick={() => { camera.current.zoom = Math.min(2.4, camera.current.zoom * 1.15); draw(); }} aria-label="Zoom in">+</button>
            <button type="button" onClick={() => { camera.current.zoom = Math.max(0.55, camera.current.zoom * 0.87); draw(); }} aria-label="Zoom out">−</button>
            <button type="button" onClick={() => { camera.current.angle = (camera.current.angle + 1) % 4; draw(); }} aria-label="Rotate view">↻</button>
            <button type="button" onClick={resetCamera} aria-label="Reset view">⌂</button>
          </div>

          {hoveredEntity && (
            <div className={styles.hoverCard}>
              <strong>{entityCustomName(hoveredEntity)}</strong>
              <span>{hoveredEntity.type}</span>
              <span>
                {entityPos(hoveredEntity).x.toFixed(1)} / {entityPos(hoveredEntity).y.toFixed(1)} /{" "}
                {entityPos(hoveredEntity).z.toFixed(1)}
              </span>
            </div>
          )}

          {sidebar && (
            <div className={styles.sidebar}>
              <div className={styles.sidebarTitle}>
                {world.plain(sidebar.objective.displayName) || sidebar.objective.name}
              </div>
              <ol>
                {sidebar.entries.length === 0 && <li className={styles.emptyScore}>no scores</li>}
                {sidebar.entries.map((entry) => (
                  <li key={entry.holder}>
                    <span>{entry.display}</span>
                    <b>{entry.value}</b>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className={styles.titleLayer} aria-live="polite">
            {world.titles.title && (
              <TitleAnimation
                key={`title-${world.titles.titleRevision}`}
                tag={world.titles.title}
                ctx={componentContext}
                kind="title"
                times={world.titles.times}
              />
            )}
            {world.titles.subtitle && (
              <TitleAnimation
                key={`subtitle-${world.titles.titleRevision}`}
                tag={world.titles.subtitle}
                ctx={componentContext}
                kind="subtitle"
                times={world.titles.times}
              />
            )}
          </div>

          {world.titles.actionbar && (
            <div className={styles.actionbar} key={`action-${world.titles.actionbarRevision}`}>
              <ComponentText tag={world.titles.actionbar} ctx={componentContext} />
            </div>
          )}

          <div
            className={styles.chat}
            ref={chatRef}
            onScroll={(event) => {
              const element = event.currentTarget;
              chatStick.current =
                element.scrollHeight - element.scrollTop - element.clientHeight < 12;
            }}
            onWheel={(event) => event.stopPropagation()}
            aria-label="Chat history"
          >
            {world.logs
              .filter((entry) => entry.kind === "chat")
              .slice(-80)
              .map((entry) => (
                <div key={entry.id} className={styles.chatLine}>
                  <ComponentText tag={entry.component ?? { type: "string", value: entry.text }} ctx={componentContext} />
                </div>
              ))}
          </div>

          <div className={styles.footer}>
            <span>{player ? `player ${entityCustomName(player)}` : "no player"}</span>
            <span>rotation {player ? Math.round(entityRotation(player).yaw) : 0}°</span>
            <span>tick {world.tick}</span>
          </div>
        </>
      )}
    </div>
  );
}

function ComponentText({ tag, ctx }: { tag: NbtTag; ctx: TextRenderContext }) {
  const runs = renderTextComponent(tag, ctx);
  return (
    <>
      {runs.map((run, index) => (
        <span
          key={index}
          style={{
            color: run.color,
            fontWeight: run.bold ? 700 : undefined,
            fontStyle: run.italic ? "italic" : undefined,
            textDecoration: [
              run.underlined ? "underline" : "",
              run.strikethrough ? "line-through" : "",
            ].filter(Boolean).join(" ") || undefined,
          }}
          className={run.obfuscated ? styles.obfuscated : undefined}
        >
          {run.text}
        </span>
      ))}
    </>
  );
}

function TitleAnimation({
  tag,
  ctx,
  kind,
  times,
}: {
  tag: NbtTag;
  ctx: TextRenderContext;
  kind: "title" | "subtitle";
  times: { fadeIn: number; stay: number; fadeOut: number };
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const total = Math.max(1, times.fadeIn + times.stay + times.fadeOut) * 50;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      element.style.opacity = "1";
      return;
    }
    const fadeIn = (times.fadeIn * 50) / total;
    const fadeOutStart = (times.fadeIn + times.stay) * 50 / total;
    element.animate(
      [
        { opacity: 0, transform: "translateY(10px) scale(0.98)" },
        { opacity: 1, transform: "translateY(0) scale(1)", offset: Math.min(0.35, Math.max(0.01, fadeIn)) },
        { opacity: 1, transform: "translateY(0) scale(1)", offset: Math.max(0.36, Math.min(0.96, fadeOutStart)) },
        { opacity: 0, transform: "translateY(-6px) scale(1)" },
      ],
      { duration: total, easing: "linear", fill: "forwards" },
    );
  }, [tag, times]);

  return (
    <div ref={ref} className={kind === "title" ? styles.title : styles.subtitle}>
      <ComponentText tag={tag} ctx={ctx} />
    </div>
  );
}

function drawEntityGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  shape: string,
  color: string,
  highlight: boolean,
): void {
  const s = Math.max(0.8, Math.min(1.6, scale / 34));
  ctx.translate(x, y);
  ctx.scale(s, s);
  const outline = highlight ? "rgba(255,255,255,0.75)" : "rgba(8,10,12,0.75)";
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = outline;
  ctx.fillStyle = color;

  if (shape === "humanoid") {
    ctx.beginPath();
    ctx.roundRect(-6, -30, 12, 20, 3);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -36, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(8,10,12,0.6)";
    ctx.fillRect(-4, -34, 2.5, 2.5);
    ctx.fillRect(1.5, -34, 2.5, 2.5);
  } else if (shape === "quadruped") {
    ctx.beginPath();
    ctx.roundRect(-11, -20, 22, 11, 5);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.roundRect(5, -26, 10, 10, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-10, -8, 3, 8);
    ctx.fillRect(6, -8, 3, 8);
  } else if (shape === "bird") {
    ctx.beginPath();
    ctx.ellipse(0, -14, 8, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(6, -24, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (shape === "item") {
    const size = 10;
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size, -size / 2);
    ctx.lineTo(size, size / 2);
    ctx.lineTo(0, size);
    ctx.lineTo(-size, size / 2);
    ctx.lineTo(-size, -size / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (shape === "marker") {
    ctx.beginPath();
    ctx.moveTo(0, -38);
    ctx.lineTo(9, -26);
    ctx.lineTo(0, -14);
    ctx.lineTo(-9, -26);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, -26, 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(8,10,12,0.9)";
    ctx.fill();
  } else if (shape === "orb") {
    ctx.beginPath();
    ctx.arc(0, -24, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-3, -27, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.roundRect(-9, -24, 18, 18, 4);
    ctx.fill();
    ctx.stroke();
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}
