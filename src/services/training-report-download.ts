import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Android/iOS: keep the existing local file and native share behavior.
export async function downloadTrainingReport(bytes: Uint8Array, fileName: string) {
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  await file.write(bytes);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      dialogTitle: 'Exportar estadísticas UCAPSA',
      mimeType: XLSX_MIME,
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });
  }

  return file.uri;
}
