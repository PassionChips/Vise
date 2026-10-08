// Reads text from a photo on the device. The native module (modules/vise-core) uses Google ML Kit on
// Android and Apple Vision on iOS; the photo never leaves the phone.

import { requireOptionalNativeModule } from 'expo';

import { ViseError } from './viseCore';
import type { OcrLine } from './types';

interface OcrNativeModule {
  recognizeText?(uri: string): Promise<string>;
}

/** The lines of text in the photo at `uri`, each with its box. Rejects with a readable `ViseError`. */
export async function recognizeLines(uri: string): Promise<OcrLine[]> {
  const native = requireOptionalNativeModule<OcrNativeModule>('ViseCore');
  if (!native?.recognizeText) {
    throw new ViseError({
      kind: 'bridge_unavailable',
      message: 'Reading receipts needs the latest version of the app. Rebuild and reinstall it.',
    });
  }
  try {
    return JSON.parse(await native.recognizeText(uri)) as OcrLine[];
  } catch (error) {
    throw new Error(error instanceof Error && error.message ? error.message : 'Could not read the photo.');
  }
}
