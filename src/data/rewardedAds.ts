import {
  loadFullScreenAd,
  showFullScreenAd,
} from "@apps-in-toss/web-framework";

type AdEvent = { type: string };
type AdFunction = ((params: {
  options: { adGroupId: string };
  onEvent: (event: AdEvent) => void;
  onError: (error: unknown) => void;
}) => () => void) & { isSupported: () => boolean };
export type RewardedAdController = ReturnType<
  typeof createRewardedAdController
>;

// Injectable SDK surface for lifecycle/earned-vs-dismissed verification.
export function createRewardedAdController(
  sdk: { load: AdFunction; show: AdFunction } = {
    load: loadFullScreenAd,
    show: showFullScreenAd,
  },
) {
  let id = "";
  let ready = false;
  let loading: Promise<void> | undefined;
  let loadCleanup = () => {};
  let showCleanup = () => {};
  let stopLoading: (() => void) | undefined;
  let stopShowing: (() => void) | undefined;
  let disposed = false;
  let loadGeneration = 0;
  function supported() {
    try {
      return sdk.load.isSupported() && sdk.show.isSupported();
    } catch {
      return false;
    }
  }
  function preload(adGroupId: string): Promise<void> {
    if (disposed || !adGroupId || !supported())
      return Promise.reject(new Error("Ad unavailable"));
    if (id === adGroupId && ready) return Promise.resolve();
    if (id === adGroupId && loading) return loading;
    const generation = ++loadGeneration;
    stopLoading?.();
    loadCleanup();
    id = adGroupId;
    ready = false;
    loading = new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => finish(false), 65000);
      const finish = (loaded: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ready = loaded;
        if (loaded) resolve();
        else reject(new Error("Ad not loaded"));
      };
      stopLoading = () => finish(false);
      try {
        loadCleanup = sdk.load({
          options: { adGroupId },
          onEvent: (event) => {
            if (event.type === "loaded") finish(true);
          },
          onError: () => finish(false),
        });
      } catch {
        finish(false);
      }
    });
    const result = loading;
    const cleanup = loadCleanup;
    void result
      .finally(() => {
        if (generation === loadGeneration) {
          loading = undefined;
          stopLoading = undefined;
        }
        cleanup();
      })
      .catch(() => undefined);
    return result;
  }
  async function show(): Promise<boolean> {
    if (disposed || !ready || !supported()) throw new Error("Ad not ready");
    ready = false;
    return new Promise<boolean>((resolve, reject) => {
      let settled = false;
      const finish = (earned: boolean, failed = false) => {
        if (settled) return;
        settled = true;
        stopShowing = undefined;
        // SDK may call back synchronously; cleanup after its return value exists.
        queueMicrotask(() => showCleanup());
        if (failed) reject(new Error("Ad show failed"));
        else resolve(earned);
      };
      stopShowing = () => finish(false);
      try {
        showCleanup = sdk.show({
          options: { adGroupId: id },
          onEvent: (event) => {
            if (event.type === "userEarnedReward") finish(true);
            else if (event.type === "dismissed") finish(false);
            else if (event.type === "failedToShow") finish(false, true);
          },
          onError: () => finish(false, true),
        });
      } catch {
        finish(false, true);
      }
    });
  }
  return {
    supported,
    preload,
    show,
    dispose() {
      disposed = true;
      stopLoading?.();
      stopShowing?.();
      loadCleanup();
      showCleanup();
      ready = false;
    },
  };
}
