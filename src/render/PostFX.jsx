/**
 * BREACHPOINT — Post-processing stack.
 *
 * Per `breachpoint-mobile-optimization-prd.md` §3.5:
 *   bloom + colour grade  — kept on medium and high (cheap, big visual payoff)
 *   SSAO                  — high tier only
 *   motion blur           — never (mobile cost + motion sickness at FPS FOV)
 *
 * This is what actually separates the tiers visually. Before this, medium and
 * high differed only by shadow-map size, which is exactly why they looked the
 * same while costing different amounts.
 *
 * The viewmodel renders in its own pass after the composer, so the weapon is
 * intentionally not affected by depth-based effects.
 */
import React, { useMemo } from 'react';
import { EffectComposer, Bloom, SSAO, Vignette, HueSaturation, BrightnessContrast } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { getTier } from './quality.js';

export function PostFX({ quality }) {
  const tier = getTier(quality);

  // Low tier renders straight to the screen: no composer, no extra buffers.
  if (!tier.bloom && !tier.ssao && !tier.grade) return null;

  return (
    <EffectComposer
      multisampling={tier.ssao ? 4 : 0}
      enableNormalPass={tier.ssao}
      resolutionScale={1}
    >
      {tier.ssao ? (
        <SSAO
          blendFunction={BlendFunction.MULTIPLY}
          samples={16}
          rings={4}
          distanceThreshold={0.6}
          distanceFalloff={0.12}
          rangeThreshold={0.015}
          rangeFalloff={0.01}
          luminanceInfluence={0.6}
          radius={0.06}
          intensity={22}
          bias={0.03}
        />
      ) : null}

      {tier.bloom ? (
        <Bloom
          intensity={tier.ssao ? 0.55 : 0.4}
          luminanceThreshold={0.72}
          luminanceSmoothing={0.24}
          mipmapBlur
          radius={0.62}
        />
      ) : null}

      {tier.grade ? (
        <BrightnessContrast brightness={0.015} contrast={0.075} />
      ) : null}
      {tier.grade ? (
        <HueSaturation saturation={0.09} />
      ) : null}
      {tier.grade ? (
        <Vignette offset={0.28} darkness={0.42} blendFunction={BlendFunction.NORMAL} />
      ) : null}
    </EffectComposer>
  );
}

export default PostFX;
