// Whether onboarding has been completed (or skipped to demo data).
//
// Kept in memory only, so onboarding shows again on every cold start. Persist
// it (e.g. a rust-core setting) once the native bridge exists.

let completed = false;

export const hasCompletedOnboarding = () => completed;

export function markOnboardingComplete() {
  completed = true;
}
