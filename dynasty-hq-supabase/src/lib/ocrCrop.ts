/**
 * ============================== OCR AUTO-CROP ==============================
 * Crops each uploaded screenshot down to just the region the OCR guide needs,
 * then downsizes it, before it goes to the model. Cuts image tokens ~70%.
 *
 * Why crop AND resize: the API downscales anything over ~1568px on the long
 * edge, so a native-resolution crop of a wide region can cost as much as (or
 * more than) the full frame. The savings come from resizing the crop to the
 * same effective scale the full frame already gets (~0.41x of a 3840x2160
 * frame), so text is no harder to read than it is today.
 *
 * Boxes are fractions of the full frame (left/top/width/height), measured by
 * template-matching the user's hand-cropped samples against the originals
 * (match scores 0.9996-1.0000, i.e. pixel-exact). Fractions rather than pixels
 * so a different export resolution from the PS app still works.
 *
 * Safe by design: any problem (no rule for the slot, unexpected aspect ratio,
 * sharp error, kill-switch env var) returns the ORIGINAL image untouched.
 */

import sharp from 'sharp';

export interface CropBox {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Resize factor applied after the crop. Defaults to DEFAULT_SCALE. */
  scale?: number;
}

// 1568 / 3840 — what a full 4K frame is effectively downscaled to by the API.
const DEFAULT_SCALE = 0.41;

// Reference frame the boxes were measured on (PS5 4K screenshot).
const EXPECTED_ASPECT = 3840 / 2160;
const ASPECT_TOLERANCE = 0.02; // 2% — anything else isn't a PS5 16:9 frame

const BEST_MATCHUP: CropBox = { left: 0.7589, top: 0.1519, width: 0.2115, height: 0.7282 };
const STATS_DEFENSE_2: CropBox = { left: 0.0367, top: 0.1662, width: 0.694, height: 0.4718 };

// Keyed by the exact upload slot (SCREEN_TYPES in ocrShared.ts), NOT by guide
// screen type — variants of the same screen have different boxes.
export const CROP_RULES: Record<string, CropBox> = {
  // Right-hand featured matchup card. All five best_matchup slots look alike.
  best_matchup_1: BEST_MATCHUP,
  best_matchup_2: BEST_MATCHUP,
  best_matchup_3: BEST_MATCHUP,
  best_matchup_4: BEST_MATCHUP,
  best_matchup_5: BEST_MATCHUP,

  conference_standings: { left: 0.3573, top: 0.1843, width: 0.5633, height: 0.619 },
  heisman: { left: 0.0365, top: 0.1583, width: 0.5505, height: 0.3995 },
  hot_seats: { left: 0.0357, top: 0.0356, width: 0.4747, height: 0.4995 },
  last_week_results: { left: 0.0372, top: 0.162, width: 0.5318, height: 0.7361 },

  stats_defense_1: { left: 0.0375, top: 0.163, width: 0.6917, height: 0.3713 },
  stats_defense_2: STATS_DEFENSE_2,
  stats_offense_1: { left: 0.0357, top: 0.1602, width: 0.6932, height: 0.3741 },
  // Per the user: offense part 2 crops the same as defense part 2.
  stats_offense_2: STATS_DEFENSE_2,

  team_schedule_1: { left: 0.0406, top: 0.3088, width: 0.5966, height: 0.5722 },
  team_schedule_2: { left: 0.0372, top: 0.3014, width: 0.613, height: 0.575 },
  top25: { left: 0.3385, top: 0.1958, width: 0.5953, height: 0.6139 },
};

export interface CropResult {
  buffer: Buffer;
  mediaType: 'image/png' | 'image/jpeg';
  cropped: boolean;
  /** Why the original was returned, when cropped is false. */
  reason?: string;
}

/**
 * Returns the cropped+resized image for a slot, or the original if anything
 * is off. Never throws.
 */
export async function cropForOcr(
  original: Buffer,
  originalMediaType: 'image/png' | 'image/jpeg',
  slot: string,
): Promise<CropResult> {
  const passthrough = (reason: string): CropResult => ({
    buffer: original,
    mediaType: originalMediaType,
    cropped: false,
    reason,
  });

  if (process.env.OCR_CROP_DISABLED === '1') return passthrough('OCR_CROP_DISABLED=1');

  const rule = CROP_RULES[slot];
  if (!rule) return passthrough(`no crop rule for slot "${slot}"`);

  try {
    const meta = await sharp(original).metadata();
    const W = meta.width;
    const H = meta.height;
    if (!W || !H) return passthrough('could not read image dimensions');

    if (Math.abs(W / H - EXPECTED_ASPECT) / EXPECTED_ASPECT > ASPECT_TOLERANCE) {
      return passthrough(`unexpected aspect ratio ${W}x${H}`);
    }

    const left = Math.max(0, Math.round(rule.left * W));
    const top = Math.max(0, Math.round(rule.top * H));
    const width = Math.min(W - left, Math.round(rule.width * W));
    const height = Math.min(H - top, Math.round(rule.height * H));
    if (width < 50 || height < 50) return passthrough('crop box collapsed');

    const scale = rule.scale ?? DEFAULT_SCALE;
    const out = await sharp(original)
      .extract({ left, top, width, height })
      .resize({ width: Math.max(1, Math.round(width * scale)), kernel: 'lanczos3' })
      .png({ compressionLevel: 9 })
      .toBuffer();

    return { buffer: out, mediaType: 'image/png', cropped: true };
  } catch (err: any) {
    return passthrough(`sharp error: ${err?.message || err}`);
  }
}
