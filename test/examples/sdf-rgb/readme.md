To see the idea in real conditions, I built a playground where you can configure the generation of these images, in this repo: https://github.com/lhapaipai/sdf-image-baker

And you can find an interactive example here: https://maplibre-sdf-halo.pentatrion.com/
where the halo only appears on hover. I deliberately picked complex shapes to see the behavior in action.

So far I've only modified a few lines of `symbol_sdf.fragment.glsl` (https://github.com/lhapaipai/maplibre-gl-js/pull/2/changes), replacing the current SDF behavior with this one, in order to surface whatever issues it might reveal.

I've noted at least two.

- Currently, raster textures are premultiplied in `tile`, whereas in our case we need our textures to NOT be premultiplied. Since this setting applies to the whole atlas, the cheapest solution I found was to reverse the alpha premultiplication when generating the SDF images. A small artifact remains, but it's minor.

- The halo renders with good quality at an `icon-size` of `0.5`. By default MapLibre uses a border of `8` for glyphs and a cutoff of `0.25`. To keep compatibility, I generated my SDFs with that same configuration. `8 * (1 - 0.25) * icon-size = 3px`, so we only have a range of `0 to 3px` for the halo — but in practice it's more like `0 to 2px`, because the closer you get to the edge, the less guaranteed the halo quality is, especially with pitch. If we want to allow halos with a larger radius, a few hardcoded options would need to change, such as:

- `#define SDF_PX 8.0`
- `highp float halo_edge = (6.0 - halo_width / fontScale) / SDF_PX;`, where `6.0` is `SDF_PX * cutoff`.

I haven't looked deeply into all the implications.

Looking forward to your feedback.
