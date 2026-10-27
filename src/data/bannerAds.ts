import { Environment, TossAds } from "@apps-in-toss/web-framework";

let initialization: Promise<boolean> | undefined;

export function initializeBannerAds(): Promise<boolean> {
  if (initialization) return initialization;
  try {
    const [major, minor] = Environment.tossAppVersion.split(".").map(Number);
    if (
      !(major > 5 || (major === 5 && minor >= 241)) ||
      !TossAds.initialize.isSupported() ||
      !TossAds.attachBanner.isSupported()
    )
      return Promise.resolve(false);
    initialization = new Promise((resolve) => {
      TossAds.initialize({
        callbacks: {
          onInitialized: () => resolve(true),
          onInitializationFailed: () => resolve(false),
        },
      });
    });
    return initialization;
  } catch {
    return Promise.resolve(false);
  }
}
