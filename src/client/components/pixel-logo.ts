export function drawLogo(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d')!;
  const s = 2; // pixel size

  const sprite: string[] = [
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

  const colors: Record<string, string | null> = {
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
