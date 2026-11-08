# Data and software credits

| Material | Origin and attribution |
| --- | --- |
| Weather, wetness and rainfall | NASA POWER, MERRA-2 and GPM IMERG. Per-field original API requests, parameter units and source headers are in earth-data.json. |
| Landsat images and QA | Landsat 8/9 Collection 2 Level 2, NASA/USGS, accessed through Microsoft Planetary Computer. Scene identifiers, window requests, USGS band references and acquisition dates are preserved with each record. |
| NASADEM elevation | NASADEM Merged DEM Global 1 arc second NC, NASA JPL, accessed via Microsoft Planetary Computer. Height grids for field 3D terrain models preserved with acquisition notes and bounds in public/terrain/. |
| Sentinel-2 image | Contains modified Copernicus Sentinel data (2024). ESA Sentinel-2 Level-2A true-colour asset delivered via Microsoft Planetary Computer. Original item and rendering request are in contextImage for each field. |
| Offline Sentinel-2 tiles and NDVI | Contains modified Copernicus Sentinel data (2024), ESA, accessed anonymously through [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a). Scene IDs, processing baselines, product metadata, request patterns and fetch receipts are preserved in map-layers.json, ndvi-grid.json and data-raw/map-tiles/. NDVI uses offset-corrected BOA reflectance and the 20 m scene classification mask; [ESA processing documentation](https://sentiwiki.copernicus.eu/web/s2-processing). Native spectral detail is 10 m; zooms above 14 enlarge those pixels. |
| Offline roads, waterways and place names | © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the [Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Extracted through the [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API), clipped to the three prepared site boxes. context-osm.geojson is a derivative database distributed under ODbL 1.0; retain this attribution and the license link when displaying or redistributing it. Original requests, response timestamps and OSM element IDs are preserved. |
| NASA SMAP soil moisture | NASA SMAP L4 Global 3-hourly and Daily Soil Moisture and Temperature at ~9 km resolution, accessed through NASA POWER public cloud store. SMAP L4 is a model-assimilated product combining SMAP radiometer observations with land surface model simulations. Grid point coordinates, source store path, and retrieval date are preserved in smap.json. |
| Agronomy | Bangladesh Agricultural Research Council FRG 2024, Bangladesh rice and agricultural research sources, FAO-56 and published Rangpur trials. Individual source URLs and locators are included in agronomy.json. |
| Administrative boundaries | geoBoundaries gbOpen BGD ADM3, release 9469f09, BBS / OCHA ROAP. CC BY 3.0 IGO. Rangpur geometry was supplied in the original Ropon Radar package. |
| Map engine | Leaflet 1.9.4, BSD 2-Clause. Copyright Vladimir Agafonkin and contributors. |
| Fonts | IBM Plex Sans and Mono, Fraunces and Noto Sans Bengali. SIL Open Font License 1.1. Self-hosted files supplied with the original project. |
| Original Ropon Radar | Apache-2.0. Original color and type direction, fonts and district geometry were retained. The synthetic environmental demo generator is excluded. |


