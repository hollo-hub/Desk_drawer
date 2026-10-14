export const SPRITE_FRAME_SIZE = 32;
export const SPRITE_COLUMNS = 6;
export const SPRITE_FRAME_NAMES = Object.freeze([
  'idle_a', 'idle_b', 'blink', 'walk_0', 'walk_1', 'walk_2', 'walk_3', 'sit',
  'sleep_a', 'sleep_b', 'yawn_a', 'yawn_b', 'yawn_c', 'perk_a', 'perk_b',
  'happy_crouch', 'happy_jump', 'happy_land', 'curious_a', 'curious_b', 'eat_a',
  'eat_b', 'carried_a', 'carried_b', 'fall', 'jump_up_0', 'jump_up_1',
  'jump_up_2', 'jump_down_0', 'jump_down_1', 'jump_down_2', 'land_0', 'land_1',
  'lie_down_0', 'lie_down_1', 'lie_down_2', 'loaf_0', 'loaf_1', 'groom_0',
  'groom_1', 'groom_2', 'groom_3', 'stretch_0', 'stretch_1', 'stretch_2',
  'tail_flick_0', 'tail_flick_1', 'ear_twitch_0', 'ear_twitch_1', 'sit_edge_0',
  'sit_edge_1', 'turn_0', 'turn_1', 'look_up', 'look_down', 'sleep_loaf_0',
  'sleep_loaf_1',
]);

export const SPRITE_ANIMATIONS = Object.freeze({
  idle: [0, 1],
  blink: [2],
  walk: [3, 4],
  sit: [5],
  sleep: [6, 7],
  yawn: [8],
  perk: [9],
  happy: [10, 11],
  curious: [12],
  eat: [13, 14],
  carried: [15],
  fall: [16, 17],
});

export function resolvePackAnimationFrame(animation, elapsedMilliseconds) {
  if (!animation || !Array.isArray(animation.frames) || animation.frames.length === 0
    || !Number.isFinite(animation.fps) || animation.fps <= 0
    || typeof animation.loop !== 'boolean'
    || !Number.isFinite(elapsedMilliseconds) || elapsedMilliseconds < 0) {
    throw new TypeError('Pack animation timing or frame data is invalid.');
  }
  const elapsedFrame = Math.floor((elapsedMilliseconds / 1000) * animation.fps);
  const complete = !animation.loop && elapsedFrame >= animation.frames.length;
  return {
    sequenceIndex: animation.loop
      ? elapsedFrame % animation.frames.length
      : Math.min(elapsedFrame, animation.frames.length - 1),
    complete,
  };
}

export function spriteFrameRectangle(sheetWidth, frameIndex, frameSize = SPRITE_FRAME_SIZE) {
  if (!Number.isInteger(sheetWidth) || sheetWidth < frameSize || sheetWidth % frameSize
    || !Number.isInteger(frameIndex) || frameIndex < 0
    || !Number.isInteger(frameSize) || frameSize < 1) {
    throw new TypeError('Sprite sheet dimensions or frame index are invalid.');
  }
  const columns = sheetWidth / frameSize;
  return {
    x: (frameIndex % columns) * frameSize,
    y: Math.floor(frameIndex / columns) * frameSize,
    width: frameSize,
    height: frameSize,
  };
}

const A = ['..o....o......', '.ooo..ooo.....', '.ooooooooo....', '.oeoooeooo....', '.ooooppooo.oo.', '..ooooooooooo.', '..ooooooooooo.', '..ooooooooooo.', '..o.o....o.o..', '..............'];
const B = A.map((row, index) => index === 8 ? '...o.o..o.o...' : row);
const NAP = A.map((row, index) => index === 3 ? '.oooooooooo...' : index === 4 ? '.oeeooeeoo.oo.' : row);
const withRows = (pose, edits) => pose.map((row, index) => edits[index] ?? row);
const FRAME_POSES = [
  A,
  B,
  withRows(A, { 3: '.oeeeeeeooo....' }),
  A,
  B,
  withRows(A, { 6: '..ooooooooo...', 8: '...o......o....' }),
  NAP,
  withRows(NAP, { 6: '...oooooooo....', 7: '..ooooooooo....' }),
  withRows(A, { 3: '.oeeeepeooo....', 4: '.oooopppoo.oo.' }),
  withRows(A, { 3: '.eoooeoeooe....' }),
  withRows(A, { 3: '.eoooeoeooe....', 4: '.oooppppoo.oo.' }),
  withRows(B, { 3: '.eoooeoeooe....', 4: '.oooppppoo.oo.' }),
  withRows(A, { 3: '.eoooeoeooe....' }),
  withRows(NAP, { 4: '.oeeooeeoo.oo.', 5: '..ooooopoooo..' }),
  withRows(A, { 5: '..ooooopoooo..' }),
  withRows(A, { 6: '..ooooooooooo.', 8: '..............' }),
  withRows(B, { 6: '..ooooooooooo.', 8: '..............' }),
  withRows(A, { 6: '.ooooooooooo..', 8: '..............' }),
];

export function createPlaceholderSpriteSheet(documentRef = document, palette = {
  body: '#f5a25d',
  ink: '#3b3350',
  accent: '#ff6f91',
}) {
  const sheet = documentRef.createElement('canvas');
  sheet.width = SPRITE_FRAME_SIZE * SPRITE_COLUMNS;
  sheet.height = SPRITE_FRAME_SIZE * Math.ceil(FRAME_POSES.length / SPRITE_COLUMNS);
  const context = sheet.getContext('2d');
  if (!context) throw new Error('Could not create the buddy placeholder sprite sheet.');

  FRAME_POSES.forEach((rows, index) => {
    const originX = (index % SPRITE_COLUMNS) * SPRITE_FRAME_SIZE;
    const originY = Math.floor(index / SPRITE_COLUMNS) * SPRITE_FRAME_SIZE;
    rows.forEach((row, y) => [...row].forEach((pixel, x) => {
      if (pixel === '.') return;
      context.fillStyle = pixel === 'e' ? palette.ink : pixel === 'p' ? palette.accent : palette.body;
      context.fillRect(originX + 2 + x * 2, originY + 6 + y * 2, 2, 2);
    }));
  });
  return sheet;
}

export function drawSpriteFrame(context, sheet, animation, frame, x = 0, y = 0, width = SPRITE_FRAME_SIZE, height = SPRITE_FRAME_SIZE, packDef = null) {
  const definition = packDef?.buddy.animations[animation];
  const frames = packDef ? definition?.frames : SPRITE_ANIMATIONS[animation];
  if (!frames) {
    if (packDef?.buddy.animations.idle) return drawSpriteFrame(context, sheet, 'idle', 0, x, y, width, height, packDef);
    throw new Error(`Unknown buddy sprite animation: ${animation}`);
  }
  const sequenceIndex = packDef && definition.loop === false
    ? Math.min(frame, frames.length - 1)
    : ((frame % frames.length) + frames.length) % frames.length;
  const index = frames[sequenceIndex];
  const rectangle = packDef
    ? spriteFrameRectangle(sheet.width, index)
    : {
      x: (index % SPRITE_COLUMNS) * SPRITE_FRAME_SIZE,
      y: Math.floor(index / SPRITE_COLUMNS) * SPRITE_FRAME_SIZE,
      width: SPRITE_FRAME_SIZE,
      height: SPRITE_FRAME_SIZE,
    };
  context.drawImage(
    sheet,
    rectangle.x,
    rectangle.y,
    rectangle.width,
    rectangle.height,
    x,
    y,
    width,
    height,
  );
}
