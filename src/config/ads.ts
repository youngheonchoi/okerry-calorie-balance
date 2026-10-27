export const bannerAdGroupId = import.meta.env.DEV
  ? "ait-ad-test-banner-id"
  : (import.meta.env.VITE_TOSS_BANNER_AD_GROUP_ID?.trim() ?? "");
