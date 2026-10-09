// The Android side of payment capture: is it switched on, and take the user to the screen that switches it on.
// Reading the notifications and parsing them happens natively and in rust-core; nothing here sees their text.

import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

interface CaptureNativeModule {
  isPaymentCaptureEnabled?(): boolean;
  openPaymentCaptureSettings?(): void;
  addListener?(eventName: 'onPaymentCaptured', listener: () => void): { remove(): void };
}

const native = () => requireOptionalNativeModule<CaptureNativeModule>('ViseCore');

/** The payment apps VISE reads, as shown to the user. Matches rust-core/src/capture/apps.rs. */
export const PAYMENT_APPS = ['Google Pay', 'PhonePe', 'Revolut', 'PayPal', 'Paytm', 'Wise', 'Venmo', 'Cash App'] as const;

/** Only Android lets an app read other apps' notifications (with the user's permission). */
export const captureSupported = () => Platform.OS === 'android' && typeof native()?.isPaymentCaptureEnabled === 'function';

/** Has the user turned on Notification access for VISE? */
export function captureEnabled(): boolean {
  try {
    return captureSupported() && native()?.isPaymentCaptureEnabled?.() === true;
  } catch {
    return false;
  }
}

/** Opens Android's Notification access screen, where the user switches VISE on or off. */
export function openCaptureSettings(): void {
  native()?.openPaymentCaptureSettings?.();
}

/** Calls `listener` whenever a payment is noticed while the app is open. Returns a function that stops listening. */
export function onPaymentCaptured(listener: () => void): () => void {
  const subscription = native()?.addListener?.('onPaymentCaptured', listener);
  return () => subscription?.remove();
}
