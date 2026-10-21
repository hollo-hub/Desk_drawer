export function computeCatLayout(width, height) {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    throw new RangeError('Canvas dimensions must be positive finite numbers.');
  }

  const scale = Math.max(4, Math.min(12, Math.floor((height * 0.42) / 32)));
  const catWidth = 32 * scale;
  const centerX = width / 2;
  const stageCenterY = height * 0.74;

  return {
    scale,
    catWidth,
    catX: Math.floor(centerX - catWidth / 2),
    catY: Math.floor(stageCenterY + 2 * scale - catWidth),
    centerX,
    centerY: Math.floor(stageCenterY + 2 * scale - catWidth) + catWidth / 2,
    stageCenterY,
    stageWidth: catWidth * 1.8,
  };
}
