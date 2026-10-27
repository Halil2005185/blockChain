/**
 * Draws a block's label (index + short hash) onto a 2D canvas and wraps it in
 * a three.js texture. This avoids downloading a 3D font: the browser's own
 * monospace font is used, and each label costs one small texture.
 */

import { CanvasTexture, SRGBColorSpace } from "three";

import { shortHash, splitLeadingZeros } from "@/lib/format";
import { COLORS } from "@/components/scene/sceneTheme";

export const LABEL_WIDTH = 512;
export const LABEL_HEIGHT = 176;
/** World-space size of the label plane (keeps the canvas aspect ratio). */
export const LABEL_WORLD_WIDTH = 2.2;
export const LABEL_WORLD_HEIGHT = (LABEL_WORLD_WIDTH * LABEL_HEIGHT) / LABEL_WIDTH;

// Monospace for hashes; the Arabic-capable fonts after it render Arabic titles.
const MONO = '"Cascadia Code", Consolas, "JetBrains Mono", ui-monospace, "Segoe UI", Tahoma, "Noto Sans Arabic", monospace';

interface LabelOptions {
  title: string;
  /** Full hash; shortened and drawn with its leading zeros highlighted. */
  hash?: string;
  /** Free text used instead of a hash (e.g. "mining…"). */
  subtitle?: string;
  color: string;
}

export function createLabelTexture({ title, hash, subtitle, color }: LabelOptions): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = LABEL_WIDTH;
  canvas.height = LABEL_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new CanvasTexture(canvas);

  // Rounded dark "chip" so the text stays readable over the grid and glow.
  const r = 28;
  ctx.fillStyle = "rgba(7, 9, 13, 0.82)";
  ctx.strokeStyle = color;
  ctx.globalAlpha = 1;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(4, 4, LABEL_WIDTH - 8, LABEL_HEIGHT - 8, r);
  ctx.fill();
  ctx.globalAlpha = 0.55;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Arabic titles read right-to-left; shrink the font until the title fits.
  const arabic = /[؀-ۿ]/;
  ctx.direction = arabic.test(title) ? "rtl" : "ltr";
  ctx.fillStyle = color;
  let size = 64;
  do {
    ctx.font = `700 ${size}px ${MONO}`;
    size -= 4;
  } while (size > 32 && ctx.measureText(title).width > LABEL_WIDTH - 48);
  ctx.fillText(title, LABEL_WIDTH / 2, 62);

  ctx.font = `500 38px ${MONO}`;
  ctx.direction = subtitle && arabic.test(subtitle) ? "rtl" : "ltr";
  if (hash) {
    ctx.direction = "ltr";
    const [zeros, rest] = splitLeadingZeros(shortHash(hash, 10, 4));
    const zerosWidth = ctx.measureText(zeros).width;
    const total = zerosWidth + ctx.measureText(rest).width;
    const startX = LABEL_WIDTH / 2 - total / 2;
    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.status.valid;
    ctx.fillText(zeros, startX, 128);
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(rest, startX + zerosWidth, 128);
  } else if (subtitle) {
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(subtitle, LABEL_WIDTH / 2, 128);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
