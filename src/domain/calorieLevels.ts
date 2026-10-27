export const calorieLevelTiers = [
  { key: "bronze", label: "브론즈", min: 0, max: 1 },
  { key: "silver", label: "실버", min: 2, max: 3 },
  { key: "gold", label: "골드", min: 4, max: 6 },
  { key: "emerald", label: "에메랄드", min: 7, max: 9 },
  { key: "diamond", label: "다이아", min: 10, max: 14 },
  { key: "ruby", label: "루비", min: 15, max: null },
] as const;

export function getCalorieLevelTier(level: number) {
  return (
    calorieLevelTiers.find(
      (tier) => level >= tier.min && (tier.max === null || level <= tier.max),
    ) ?? calorieLevelTiers[0]
  );
}
