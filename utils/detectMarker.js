import * as FileSystem from 'expo-file-system';

export default async function detectMarker(uri) {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  let black = 0;

  for (let i = 0; i < base64.length; i += 10) {
    if (base64.charCodeAt(i) < 80) {
      black++;
    }
  }

  const ratio = black / base64.length;

  return ratio > 0.05 && ratio < 0.4;
}