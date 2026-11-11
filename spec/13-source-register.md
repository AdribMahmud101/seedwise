# 13 · Source Register

## A. Blueprint register S1–S25 [BP §10] — links checked Nov 2026; recheck versions before production

| Key | Source | URL |
|---|---|---|
| S1 | NASA POWER methodology & hydrology (2026) | https://power.larc.nasa.gov/docs/methodology/data/sources_hydrology/ |
| S2 | NSIDC SMAP L4 SPL4SMGP v8 | https://nsidc.org/data/spl4smgp/versions/8 |
| S3 | NASA POWER IMERG & meteorology sources | https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/ |
| S4 | USGS Landsat C2 L2 science products | https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products |
| S5 | NASA NISAR mission, provisional 2026 release | https://science.nasa.gov/mission/nisar/ |
| S6 | NASA NISAR overview, 200 m soil-moisture target | https://science.nasa.gov/mission/nisar/mission-overview/ |
| S7 | NASA ECOSTRESS LST | https://gis.earthdata.nasa.gov/portal/home/item.html?id=5ab71de13c2d43dfb374187705944dc7 |
| S8 | NASA MODIS | https://www.earthdata.nasa.gov/data/instruments/modis |
| S9 | NASA GRACE-FO | https://science.nasa.gov/mission/grace-fo/ |
| S10 | NASA GEDI | https://gedi.umd.edu/ |
| S11 | NASA SRTM | https://www.earthdata.nasa.gov/data/instruments/srtm |
| S12 | NASA HLS | https://www.earthdata.nasa.gov/data/projects/hls |
| S13 | VIIRS 375 m active fire | https://access.earthdata.nasa.gov/collections/C1886251885-LANCEMODIS |
| S14 | NASA SWOT | https://science.nasa.gov/mission/swot/ |
| S15 | NASA GLDAS | https://ldas.gsfc.nasa.gov/gldas |
| S16 | ISRIC SoilGrids 250 m | https://isric.org/explore/soilgrids/ |
| S17 | BARC Crop Zoning / Khamari-DAP | https://cropzoning.gov.bd/ |
| S18 | BARC FRG 2024 | https://apps.barc.gov.bd/fertilizer_recommendation/FRG%20English%2030.10.2024.pdf |
| S19 | Bangladesh FFWC API | https://api.ffwc.gov.bd/?format=json |
| S20 | BARC Khamari advisory portal | https://portal.cropzoning.gov.bd/ |
| S21 | USGS Landsat C2 Surface Temperature | https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-temperature |
| S22 | FAO-56 methodology | https://www.fao.org/4/X0490E/x0490e08.htm |
| S23 | ESA Sentinel-2 overview | https://www.esa.int/Applications/Observing_the_Earth/Copernicus/Sentinel-2 |
| S24 | NASA POWER parameter dictionary | https://power.larc.nasa.gov/parameters/ |
| S25 | NASA Earthdata | https://www.earthdata.nasa.gov/ |
| S26 | NASA JPL GRACE / GRACE-FO mascons RL06.3Mv04; total water storage anomalies, 2004–2009 baseline, ~300 km effective resolution | https://grace.jpl.nasa.gov/data/get-data/jpl_global_mascons/ |

## B. Evidence shipped in the core app [CORE `public/data/*.json`]

`agronomy.json → sources[]` holds **33** records with `id, publisher, title, url, published, accessed, locator`. IDs:

- **Soil / fertilizer / planning:** `barc-frg2024`, `barc-khamari`, `fao56`, `bari-seed`
- **Local trials:** `hossain2022` (Int. J. Agronomy, Mithapukur & Pirganj, https://doi.org/10.1155/2022/6288494), `islam2014` (IJARIT, Paikan, Gangachara)
- **Clinic:** `irri-disease`, `rrdi-blast`, `icar-rice`, `brri-disease`, `brri-lcc`, `bamis-mustard`, `bamis-potato`, `ais-potato`, `ais-mung`, `janala-mung`
- **Advisories:** `bamis-bulletin`, `bamis-mango`
- **Trees / restoration:** `doe-haor2026`, `sohel-haor-nurseries`, `bari-teesta-chars2026`, `fao-fire-recovery`, `fao-regeneration`
- **Recovery calendars and safety:** `rr-dry`, `rr-mustard`, `rr-late`, `rr-aman`, `rr-green`, `rr-fire`, `rr-flood`, `rr-soil`, `rr-regrow`, `rr-ash`

`earth-data.json → sources`: `power`, `gpm`, `eto`, `landsat`, `landsat-qa`, `landsat-sr`, `sentinel2` (item `S2A_MSIL2A_20240309T043701_R033_T45RYJ_20240309T091652`).

Credits and licences: see CORE/CR. That covers geoBoundaries (CC BY 3.0 IGO), Leaflet (BSD-2), the fonts (OFL 1.1), and the project itself (Apache-2.0).

## C. Data-strategy and prototype references [DS, DS-H, 3D-R, 3D-F]

| Source | URL |
|---|---|
| IRRI Leaf Color Chart | https://www.knowledgebank.irri.org/step-by-step-production/growth/soil-fertility/leaf-color-chart |
| IRRI AWD fact sheet | https://www.knowledgebank.irri.org/training/fact-sheets/water-management/saving-water-alternate-wetting-drying-awd |
| FAO Visual Soil Assessment | https://www.fao.org/land-water/land/land-assessment/visual-soil-assessment-vsa/en/ · https://www.fao.org/3/i0007e/i0007e00.htm |
| FAO-56 Chapter 6 | https://www.fao.org/4/x0490e/x0490e0b.htm |
| Daraz BD soil pH meters (pricing) | https://www.daraz.com.bd/catalog/?q=soil+ph+meter |
| SRDI Upazila Nirdeshika (updated) | https://srdi.gov.bd/pages/static-pages/6922defa933eb65569e1edfe |
| ISRIC SoilGrids / REST | https://soilgrids.org/ · https://rest.isric.org/ |
| NASA POWER viewer / API | https://power.larc.nasa.gov/data-access-viewer/ · https://power.larc.nasa.gov/docs/services/api/ |
| GPM IMERG | https://gpm.nasa.gov/data/imerg |
| Copernicus Data Space | https://dataspace.copernicus.eu/ |
| Planetary Computer: Sentinel-2 L2A, Sentinel-1 RTC, NASADEM | https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a · …/sentinel-1-rtc · …/nasadem |
| FFWC / flood magnitude | https://ffwc.gov.bd/ · https://ffwc.gov.bd/app/flood-magnitude |
| BARC Crop Zoning (updated Khamari link) | http://cropzoning.barcapps.gov.bd/ |
| **Sarker et al. (2026)** RARS Rangpur trial — DOI verified from PDF 9 Nov 2026 (no "Burirhat" in paper; printed coordinates look wrong) | https://doi.org/10.1155/ioa/9089088 |
| Ropon Radar 18-Feature Spec Doc (Google Doc) | https://docs.google.com/document/d/1vlfe5dOtPcZaap785YjsoPi4sF3HY5x4QCFyhtxKLoo/edit — public; text identical to F18 (checked 9 Nov 2026) |

DS-H records the link migrations it made: Khamari `khamari.barcapps.gov.bd` → `cropzoning.barcapps.gov.bd`; SRDI old page → new static page; FFWC `http` → `https`.
