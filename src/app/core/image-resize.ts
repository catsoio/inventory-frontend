/**
 * Krymper ett foto före uppladdning: en mobilbild är ofta 4–8 MB och 4000 px bred, men en
 * annonsbild behöver bara ~1800 px. Ger en JPEG. Går det inte (okänt format, gammal webbläsare)
 * returneras filen oförändrad och servern avgör.
 */
export async function shrinkImage(file: File, maxEdge = 1800, quality = 0.85): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    // Redan liten nog: behåll originalet så ingenting komprimeras i onödan.
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    return blob
      ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
      : file;
  } catch {
    return file;
  }
}
