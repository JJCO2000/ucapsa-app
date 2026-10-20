const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Web: direct browser download, no uploads or copies of attendance data.
export async function downloadTrainingReport(bytes: Uint8Array, fileName: string) {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    throw new Error('La descarga sólo está disponible en el navegador.');
  }

  // A fresh Uint8Array owns a non-shared ArrayBuffer supported by Blob.
  const blob = new Blob([Uint8Array.from(bytes)], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    try {
      link.click();
    } finally {
      link.remove();
    }
  } finally {
    // Give the browser sufficient time to begin handling the download.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return fileName;
}
