/** Draw authored overlay text into image bytes so sharing preserves the edit. */
export async function addTextToPhoto(file: File, text: string,
  position: 'top' | 'center' | 'bottom' = 'center',
  ink: 'white' | 'yellow' | 'black' = 'white'): Promise<File> {
  const caption = text.trim().slice(0, 120);
  if (!caption) return file;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Só é possível escrever sobre fotografias');
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = sourceUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Não foi possível abrir a fotografia'));
    });
    const maxSide = 2048;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('O navegador não permite editar esta fotografia');
    ctx.drawImage(image, 0, 0, width, height);
    const fontSize = Math.max(19, Math.round(width * .052));
    const margin = Math.round(width * .08);
    const lineHeight = fontSize * 1.32;
    ctx.font = 'bold ' + fontSize + 'px system-ui, sans-serif';
    const words = caption.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const attempt = line ? line + ' ' + word : word;
      if (ctx.measureText(attempt).width > width - margin * 2 && line) {
        lines.push(line);
        line = word;
      } else {
        line = attempt;
      }
    }
    if (line) lines.push(line);
    if (lines.length > 5) throw new Error('O texto é demasiado longo para caber na fotografia');
    const blockHeight = lines.length * lineHeight + fontSize * .8;
    const centerY = position === 'top' ? margin + blockHeight / 2
      : position === 'bottom' ? height - margin - blockHeight / 2
      : height / 2;
    ctx.fillStyle = ink === 'black' ? 'rgba(255,255,255,.78)' : 'rgba(1,9,20,.68)';
    ctx.beginPath();
    const left = margin / 2;
    const top = centerY - blockHeight / 2;
    ctx.roundRect(left, top, width - margin, blockHeight, Math.max(8, fontSize / 3));
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink === 'yellow' ? '#fef08a' : ink === 'black' ? '#020617' : '#ffffff';
    lines.forEach((value, i) => ctx.fillText(value, width / 2,
      top + fontSize * .4 + lineHeight * (i + .55), width - margin * 1.8));
    const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(value => value ? resolve(value) : reject(new Error('Não foi possível guardar a fotografia')), mime, .88));
    if (blob.size > 5 * 1024 * 1024)
      throw new Error('A fotografia editada excede o limite de 5 MB');
    const stem = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], stem + '-jynlo.' + (mime === 'image/png' ? 'png' : 'jpg'),
      { type: mime, lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
