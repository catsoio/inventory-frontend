/**
 * Sparar en fil som skapats i appen (en zip till revisorn). På dator blir det en vanlig nedladdning.
 * På mobil fungerar inte en nedladdningslänk i appens webbvy, så filen delas i stället: man väljer
 * Filer, Mejl eller Drive i delningsbladet. Avbryter man delningen är det inget fel.
 */
export async function saveFile(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  const phone = window.matchMedia('(max-width: 767px)').matches;
  if (phone && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
    } catch (e) {
      if ((e as DOMException).name !== 'AbortError') throw e;
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
