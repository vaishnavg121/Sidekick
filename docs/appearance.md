# Appearance Studio — 0.3.0 beta

Open Settings → Appearance Studio in the sidebar, dashboard or secure settings tab. Changes preview within Sidekick; websites' content styles remain unchanged. **Apply appearance** saves one validated configuration. Color-wheel and slider movements update local editor state and scoped CSS variables through requestAnimationFrame, without storage writes on every movement.

## Colors and presets

Seven presets: Minimal Dark, Minimal Light, Graphite, Warm Neutral, Deep Ocean, Soft Lavender and Frosted Glass. Defaults are understated. Presets prepare a preview; Apply saves it. Reset preview prepares Minimal Dark/Light defaults; Discard preview restores saved values. Closing the editor restores the stored appearance.

Choose Base color, Accent color or Secondary accent, then use the hue ring, Saturation/Brightness sliders, six-digit hex entry or swatches. The hue ring supports pointer capture, arrows (Shift for larger steps), Home and End. It retains hue intent for white/black/gray colors. Invalid hex input is rejected. Foreground colors and effects adjust for legibility; raw accent color still drives native control accents.

Color mode Light/Dark chooses a matching starting base; custom base colors then determine readable foregrounds. System mode follows the device's standard base while retaining custom accents/effects.

## Gradients and effects

Choose Solid, Linear or Radial. Gradients accept **2–5 editable stops**, individual color/position, angle (linear), center X/Y (radial) and intensity. The preview shows the generated fill; stop order is sorted for rendering without losing editor values.

| Control             | Range / behavior                              |
| ------------------- | --------------------------------------------- |
| Text contrast       | 85–100; readable foreground guard             |
| Surface strength    | 0–100; dark-surface whitening is bounded      |
| Border opacity      | 0–40                                          |
| Shadow depth        | 0–80; panel/menu/palette shadow               |
| Sidebar opacity     | 85–100; may become more opaque for legibility |
| Backdrop blur       | 0–24 px, scoped to Sidekick                   |
| Grain               | 0–6; static tiled texture, no animation       |
| Surface softness    | 0–8 px, editor/form corners                   |
| Corner radius       | 2–16 px                                       |
| Row density         | 85–115; changes row height/spacing            |
| Animation intensity | 0–150; scales bounded hover/panel durations   |
| Gradient intensity  | 0–40; bounded further if needed for contrast  |

Contrast safeguards consider opaque fields, light/dark underlying pages, gradient stops, surface overlay and grain. Decoration can be reduced and foreground colors adjusted instead of accepting unreadable configurations. This is a targeted safeguard, not a full WCAG certification. Forced colors removes decorative backgrounds/blur; reduced motion suppresses animation and smooth scrolling. Unsupported backdrop-filter falls back to an opaque panel. No full-page filter is applied to websites.

## Workspace scope and data

Precedence is **workspace appearance override → global appearance → existing workspace light/dark/system setting**. Choose All workspaces or This workspace before applying. Global edits preserve workspace overrides. Use inherited appearance removes the selected scope's override. Workspace changes do not animate individual rows or navigate other tabs.

Appearance is additive under the existing metadata version 1. Older installations need no reset; IDs/resources/preferences remain intact. Backups carry validated appearance; imported workspace copies receive remapped overrides without overwriting the current global preference.

Export theme creates a separate `sidekick-theme` JSON file containing appearance only—no key, browsing resources or account data. Import theme accepts at most 20 KB, validates every supported field/range, then previews before Apply. Arbitrary CSS, URLs, scripts, unknown fields and invalid colors are rejected. No executable CSS is accepted.

## Verification

Chrome tests exercise the presets, hue pointer/keyboard/achromatic behavior, hex/SV controls, scope, gradients/stops, effects, no-write preview, apply/discard/reset/inheritance, export/import, persistence, light/dark/system and 520/1366/1920 layouts. Three reviewed pixel baselines cover the hue ring, gradient preview and compact AI row on Windows/Chrome for Testing; other platforms need their own visual baselines.
