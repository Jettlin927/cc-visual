// Draw a pixel art Claude icon on a 32x32 canvas
export function drawLogo(canvas) {
  const ctx = canvas.getContext('2d');
  const s = 2; // pixel size

  // Simple 16x16 robot face, scaled 2x
  const sprite = [
    '................',
    '....cccccccc....',
    '...cccccccccc...',
    '..ccEEccccEEcc..',
    '..ccEEccccEEcc..',
    '..cccccccccccc..',
    '..ccccMMMMcccc..',
    '..cccccccccccc..',
    '...cccccccccc...',
    '....cccccccc....',
    '..MMMMMMMMMMMM..',
    '..Mc..cccc..cM..',
    '..Mc..cccc..cM..',
    '..MMMMMMMMMMMM..',
    '................',
    '................',
  ];

  const colors = {
    '.': null,
    'c': '#0ff',
    'E': '#f0f',
    'M': '#e94560',
  };

  sprite.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const color = colors[ch];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(x * s, y * s, s, s);
      }
    });
  });
}
