export const TIER_CODES = {
  OPUS: 'O',
  SONNET: 'S',
  HAIKU: 'H',
  FABLE: 'FB',
  MUSE_SPARK: 'MS',
  COMPOSER: 'C',
  PRO: 'P',
  FLASH: 'F',
  SOL: 'SL',
  TERRA: 'TR',
  LUNA: 'LN',
  SMALL: 'SM',
  LARGE: 'LG',
} as const;

export type StandardTierCode = (typeof TIER_CODES)[keyof typeof TIER_CODES];
