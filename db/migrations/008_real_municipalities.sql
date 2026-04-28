-- =============================================================================
-- Migration 008 — Real Catalan municipality data (Brúixola)
-- =============================================================================
-- UPSERTs reference data into public.comarques and public.cities. Safe to
-- re-apply. No schema changes.
--
-- Sources (all accessed 2026-04-28):
--   Generalitat — Llistat municipis ZMRT:
--     https://habitatge.gencat.cat/ca/ambits/preus-ingressos-i-zones/limit-preu-lloguer/llistat-municipis-zmrt/
--   BOE-A-2024-5214 (1st wave, 140 municipalities, in force 2024-03-16):
--     https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-5214
--   BOE-A-2024-20576 (2nd wave, +131 municipalities, in force 2024-10-10):
--     https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-20576
--   IDESCAT — Municipality codes & EMEX (per-municipality stats):
--     https://www.idescat.cat/codis/?id=33
--     https://www.idescat.cat/emex/
--   IDESCAT — Estimacions de població definitives 2023:
--     https://govern.cat/govern/docs/2024/02/19/09/07/48ad0d04-81b5-4d69-bfb7-5b0d67951594.pdf
--   Wikipedia — top municipalities by population (cross-checked vs IDESCAT):
--     https://es.wikipedia.org/wiki/Anexo:Municipios_de_Cataluña_por_población
--   Comarques de Catalunya (43 territorial units; we cover the 41 traditional
--   comarques — Aran has special status, Lluçanès is the newest, both included):
--     https://ca.wikipedia.org/wiki/Comarques_de_Catalunya
--
-- Conventions:
--   - slug: ASCII kebab-case, no diacritics, no leading articles
--     ("l'Hospitalet de Llobregat" → "l-hospitalet-de-llobregat" to keep
--     consistency with existing seed rows; "el Vendrell" → "el-vendrell").
--   - name: Catalan canonical form with diacritics and articles where
--     official.
--   - name_es: Castilian where it differs from the Catalan; otherwise NULL.
--   - location: ST_SetSRID(ST_MakePoint(lng, lat), 4326). Coordinates from
--     municipal centroid, accurate to ~3-4 decimals.
--   - in_zona_tensionada: TRUE iff the municipality appears in the BOE
--     consolidated list (140 + 131 = 271). Only set for municipalities
--     verified against the resolutions.
--   - rent_index_eur_m2_mo: NULL for now — we did not load SERPAVI per-
--     municipality ceilings here. The plan forbids fabricating these. To be
--     filled by an ETL job hitting SERPAVI / IDESCAT mercat de lloguer.
--   - has_hospital / has_university: only TRUE where a real public/major
--     facility exists (province capitals, university campuses, larger
--     comarcal hospitals — Manresa Althaia, Mataró Maresme, Vic UVic, etc.).
--   - transit_score: heuristic 0-100 (see CLAUDE.md instructions).
--   - hut_moratorium_status:
--       'active' = active moratorium / cap on new HUT licenses
--       'lifted' = moratorium expired post-2023 (most coastal towns)
--       'none'   = no relevant tourist-housing pressure / no moratorium
--       'unknown' = not researched
--     Only Barcelona currently has a hard active moratorium under
--     municipal PEUAT. Most coastal towns operate under per-zone caps,
--     coded here as 'lifted' where the cap is per-zone rather than
--     blanket. Inland small towns coded 'none'.
-- =============================================================================

BEGIN;

-- =============================================================================
-- Section 1 — Comarques (41 traditional + Aran)
-- =============================================================================
-- Population values are IDESCAT 2023 estimates rounded to nearest 100.
-- in_zona_tensionada = TRUE if at least one municipality of the comarca
-- is on the consolidated BOE list (271 municipalities). For comarques
-- with no municipality declared (rural Pyrenees/Terres de l'Ebre interior,
-- some Lleida comarques), it is FALSE.

INSERT INTO public.comarques (slug, name, province, population, in_zona_tensionada) VALUES
  ('alt-camp',          'Alt Camp',          'Tarragona',  46500, TRUE),   -- Valls, Alcover (ZMRT)
  ('alt-emporda',       'Alt Empordà',       'Girona',    142800, TRUE),   -- Figueres, Roses, Cadaqués, Castelló d''Empúries (ZMRT)
  ('alt-penedes',       'Alt Penedès',       'Barcelona', 110000, TRUE),   -- Vilafranca, Sant Sadurní, Gelida (ZMRT)
  ('alt-urgell',        'Alt Urgell',        'Lleida',     20800, TRUE),   -- la Seu d''Urgell (ZMRT)
  ('alta-ribagorca',    'Alta Ribagorça',    'Lleida',      4000, FALSE),
  ('anoia',             'Anoia',             'Barcelona', 124300, TRUE),   -- Igualada, Vilanova del Camí, Piera (ZMRT)
  ('aran',              'Aran',              'Lleida',     10300, FALSE),  -- special territorial status (Vall d''Aran)
  ('bages',             'Bages',             'Barcelona', 184600, TRUE),   -- Manresa, Sant Fruitós, Navàs (ZMRT)
  ('baix-camp',         'Baix Camp',         'Tarragona', 195700, TRUE),   -- Reus, Cambrils, Mont-roig (ZMRT)
  ('baix-ebre',         'Baix Ebre',         'Tarragona',  79100, TRUE),   -- Tortosa, Roquetes, l''Ametlla, Deltebre (ZMRT)
  ('baix-emporda',      'Baix Empordà',      'Girona',    136700, TRUE),   -- Palafrugell, Palamós, Sant Feliu de Guíxols, Begur (ZMRT)
  ('baix-llobregat',    'Baix Llobregat',    'Barcelona', 837800, TRUE),   -- broadly tensionada
  ('baix-penedes',      'Baix Penedès',      'Tarragona', 113200, TRUE),   -- el Vendrell, Calafell, Cunit (ZMRT)
  ('barcelones',        'Barcelonès',        'Barcelona',2308600, TRUE),   -- Barcelona, Hospitalet, Badalona, Sant Adrià, Santa Coloma de Gramenet
  ('bergueda',          'Berguedà',          'Barcelona',  39600, TRUE),   -- Berga, Bagà, Gironella (ZMRT)
  ('cerdanya',          'Cerdanya',          'Girona',     19500, TRUE),   -- Puigcerdà, Bellver de Cerdanya (ZMRT)
  ('conca-de-barbera',  'Conca de Barberà',  'Tarragona',  20300, TRUE),   -- Montblanc (ZMRT)
  ('garraf',            'Garraf',            'Barcelona', 153400, TRUE),   -- Vilanova i la Geltrú, Sitges, Cubelles, Sant Pere de Ribes
  ('garrigues',         'Garrigues',         'Lleida',     19000, TRUE),   -- les Borges Blanques (ZMRT)
  ('garrotxa',          'Garrotxa',          'Girona',     58200, TRUE),   -- Olot, Besalú (ZMRT)
  ('girones',           'Gironès',           'Girona',    202200, TRUE),   -- Girona, Salt, Sarrià de Ter, Celrà (ZMRT)
  ('llucanes',          'Lluçanès',          'Barcelona',   8200, FALSE),  -- newest comarca (2023), small rural
  ('maresme',           'Maresme',           'Barcelona', 466700, TRUE),   -- Mataró, Premià, Calella, Pineda, Arenys, Vilassar
  ('moianes',           'Moianès',           'Barcelona',  14800, TRUE),   -- Moià (ZMRT)
  ('montsia',           'Montsià',           'Tarragona',  68800, TRUE),   -- Amposta, Alcanar, Sant Carles de la Ràpita (ZMRT)
  ('noguera',           'Noguera',           'Lleida',     38900, TRUE),   -- Balaguer (ZMRT)
  ('osona',             'Osona',             'Barcelona', 165300, TRUE),   -- Vic, Manlleu, Torelló, Tona, Centelles (ZMRT)
  ('pallars-jussa',     'Pallars Jussà',     'Lleida',     13700, TRUE),   -- Tremp (ZMRT)
  ('pallars-sobira',    'Pallars Sobirà',    'Lleida',      7400, TRUE),   -- Sort (ZMRT)
  ('pla-d-urgell',      'Pla d''Urgell',     'Lleida',     38400, TRUE),   -- Mollerussa, Linyola (ZMRT)
  ('pla-de-l-estany',   'Pla de l''Estany',  'Girona',     34000, TRUE),   -- Banyoles, Porqueres, Fornells (ZMRT)
  ('priorat',           'Priorat',           'Tarragona',   9500, TRUE),   -- Falset (ZMRT)
  ('ribera-d-ebre',     'Ribera d''Ebre',    'Tarragona',  21800, TRUE),   -- Móra d''Ebre, Móra la Nova (ZMRT)
  ('ripolles',          'Ripollès',          'Girona',     24700, TRUE),   -- Ripoll (ZMRT)
  ('segarra',           'Segarra',           'Lleida',     22900, TRUE),   -- Cervera, Guissona (ZMRT)
  ('segria',            'Segrià',            'Lleida',    211700, TRUE),   -- Lleida, Alcarràs, Almacelles, Alpicat (ZMRT)
  ('selva',             'Selva',             'Girona',    180100, TRUE),   -- Blanes, Lloret, Tossa, Santa Coloma de Farners
  ('solsones',          'Solsonès',          'Lleida',     13500, TRUE),   -- Solsona (ZMRT)
  ('tarragones',        'Tarragonès',        'Tarragona', 263800, TRUE),   -- Tarragona, Salou, Vila-seca, Torredembarra
  ('terra-alta',        'Terra Alta',        'Tarragona',  11500, FALSE),  -- no ZMRT municipality
  ('urgell',            'Urgell',            'Lleida',     38200, TRUE),   -- Tàrrega, Bellpuig (ZMRT)
  ('valles-occidental', 'Vallès Occidental', 'Barcelona', 939300, TRUE),
  ('valles-oriental',   'Vallès Oriental',   'Barcelona', 421700, TRUE)
ON CONFLICT (slug) DO UPDATE SET
  name               = EXCLUDED.name,
  province           = EXCLUDED.province,
  population         = EXCLUDED.population,
  in_zona_tensionada = EXCLUDED.in_zona_tensionada;

-- =============================================================================
-- Section 2 — Cities (~110 municipalities)
-- =============================================================================
-- Coverage:
--   * All municipalities with population > 20,000 (~62 of them)
--   * All declared coastal HUT-relevant towns (Sitges, Cambrils, Salou,
--     Calafell, Castelldefels, Lloret, Tossa, Roses, Cadaqués, Begur,
--     Sant Pol, Calella, Pineda, Mont-roig, l''Escala, Llançà, Pals, Palamós,
--     Sant Feliu de Guíxols, Calonge, Castell-Platja d''Aro, Sant Carles de la
--     Ràpita, l''Ametlla de Mar, l''Ampolla, Alcanar)
--   * Province capitals (Barcelona, Tarragona, Girona, Lleida) + comarcal
--     hospital towns (Manresa, Mataró, Reus, Vic, Vilafranca, Igualada,
--     Tortosa, Figueres, Olot, Granollers, Mollet, Sant Cugat)
--   * University campuses (Barcelona-UB/UPC, Cerdanyola/Bellaterra-UAB,
--     Tarragona/Reus-URV, Girona-UdG, Lleida-UdL, Vic-UVic)
--
-- ZMRT (in_zona_tensionada) verified against:
--   - BOE-A-2024-5214 alphabetical list of 140 (2024-03-16)
--   - BOE-A-2024-20576 alphabetical list of 131 (2024-10-10)

-- ----- Barcelonès (province: Barcelona) -----
INSERT INTO public.cities (slug, name, name_es, comarca_slug, province, population, location,
  in_zona_tensionada, rent_index_eur_m2_mo, has_hospital, has_university, transit_score, hut_moratorium_status) VALUES
  ('barcelona',                 'Barcelona',                 'Barcelona',                 'barcelones',        'Barcelona', 1660122,
    ST_SetSRID(ST_MakePoint(2.1734, 41.3851), 4326), TRUE, NULL, TRUE,  TRUE,  95, 'active'),
  ('l-hospitalet-de-llobregat', 'l''Hospitalet de Llobregat','Hospitalet de Llobregat',   'barcelones',        'Barcelona',  271128,
    ST_SetSRID(ST_MakePoint(2.0995, 41.3596), 4326), TRUE, NULL, TRUE,  FALSE, 90, 'active'),
  ('badalona',                  'Badalona',                  'Badalona',                  'barcelones',        'Barcelona',  226152,
    ST_SetSRID(ST_MakePoint(2.2470, 41.4501), 4326), TRUE, NULL, TRUE,  FALSE, 85, 'active'),
  ('santa-coloma-de-gramenet',  'Santa Coloma de Gramenet',  'Santa Coloma de Gramanet',  'barcelones',        'Barcelona',  119215,
    ST_SetSRID(ST_MakePoint(2.2079, 41.4517), 4326), TRUE, NULL, FALSE, FALSE, 80, 'lifted'),
  ('sant-adria-de-besos',       'Sant Adrià de Besòs',       'San Adrián de Besós',       'barcelones',        'Barcelona',   38426,
    ST_SetSRID(ST_MakePoint(2.2207, 41.4297), 4326), TRUE, NULL, FALSE, FALSE, 80, 'lifted'),

-- ----- Vallès Occidental -----
  ('terrassa',                  'Terrassa',                  'Tarrasa',                   'valles-occidental', 'Barcelona',  226908,
    ST_SetSRID(ST_MakePoint(2.0089, 41.5639), 4326), TRUE, NULL, TRUE,  TRUE,  75, 'lifted'),
  ('sabadell',                  'Sabadell',                  'Sabadell',                  'valles-occidental', 'Barcelona',  216520,
    ST_SetSRID(ST_MakePoint(2.1093, 41.5483), 4326), TRUE, NULL, TRUE,  FALSE, 78, 'lifted'),
  ('sant-cugat-del-valles',     'Sant Cugat del Vallès',     'San Cugat del Vallés',      'valles-occidental', 'Barcelona',   93302,
    ST_SetSRID(ST_MakePoint(2.0866, 41.4727), 4326), TRUE, NULL, TRUE,  FALSE, 80, 'lifted'),
  ('rubi',                      'Rubí',                      'Rubí',                      'valles-occidental', 'Barcelona',   78591,
    ST_SetSRID(ST_MakePoint(2.0327, 41.4923), 4326), TRUE, NULL, FALSE, FALSE, 70, 'lifted'),
  ('cerdanyola-del-valles',     'Cerdanyola del Vallès',     'Cerdañola del Vallés',      'valles-occidental', 'Barcelona',   58004,
    ST_SetSRID(ST_MakePoint(2.1411, 41.4912), 4326), TRUE, NULL, FALSE, TRUE,  78, 'lifted'),
  ('ripollet',                  'Ripollet',                   NULL,                       'valles-occidental', 'Barcelona',   38851,
    ST_SetSRID(ST_MakePoint(2.1574, 41.4974), 4326), TRUE, NULL, FALSE, FALSE, 70, 'lifted'),
  ('montcada-i-reixac',         'Montcada i Reixac',         'Moncada y Reixach',         'valles-occidental', 'Barcelona',   35500,
    ST_SetSRID(ST_MakePoint(2.1881, 41.4842), 4326), TRUE, NULL, FALSE, FALSE, 72, 'lifted'),
  ('barbera-del-valles',        'Barberà del Vallès',        'Barberá del Vallés',        'valles-occidental', 'Barcelona',   33252,
    ST_SetSRID(ST_MakePoint(2.1255, 41.5169), 4326), TRUE, NULL, FALSE, FALSE, 70, 'lifted'),
  ('castellar-del-valles',      'Castellar del Vallès',      'Castellar del Vallés',      'valles-occidental', 'Barcelona',   24420,
    ST_SetSRID(ST_MakePoint(2.0888, 41.6181), 4326), TRUE, NULL, FALSE, FALSE, 50, 'none'),
  ('santa-perpetua-de-mogoda',  'Santa Perpètua de Mogoda',  'Santa Perpetua de Moguda',  'valles-occidental', 'Barcelona',   26143,
    ST_SetSRID(ST_MakePoint(2.1814, 41.5345), 4326), TRUE, NULL, FALSE, FALSE, 65, 'lifted'),
  ('sant-quirze-del-valles',    'Sant Quirze del Vallès',    'San Quirico del Vallés',    'valles-occidental', 'Barcelona',   20554,
    ST_SetSRID(ST_MakePoint(2.0833, 41.5331), 4326), TRUE, NULL, FALSE, FALSE, 65, 'lifted'),
  ('badia-del-valles',          'Badia del Vallès',           NULL,                       'valles-occidental', 'Barcelona',   13294,
    ST_SetSRID(ST_MakePoint(2.1156, 41.5085), 4326), TRUE, NULL, FALSE, FALSE, 65, 'none'),
  ('matadepera',                'Matadepera',                 NULL,                       'valles-occidental', 'Barcelona',    9685,
    ST_SetSRID(ST_MakePoint(2.0264, 41.6021), 4326), TRUE, NULL, FALSE, FALSE, 40, 'none'),
  ('palau-solita-i-plegamans',  'Palau-solità i Plegamans',   NULL,                       'valles-occidental', 'Barcelona',   15047,
    ST_SetSRID(ST_MakePoint(2.1828, 41.5779), 4326), TRUE, NULL, FALSE, FALSE, 55, 'none'),
  ('castellbisbal',             'Castellbisbal',              NULL,                       'valles-occidental', 'Barcelona',   12780,
    ST_SetSRID(ST_MakePoint(1.9786, 41.4751), 4326), TRUE, NULL, FALSE, FALSE, 55, 'none'),
  ('polinya',                   'Polinyà',                   'Poliñá del Vallés',         'valles-occidental', 'Barcelona',    8500,
    ST_SetSRID(ST_MakePoint(2.1486, 41.5544), 4326), TRUE, NULL, FALSE, FALSE, 55, 'none'),

-- ----- Vallès Oriental -----
  ('granollers',                'Granollers',                 NULL,                       'valles-oriental',   'Barcelona',   62065,
    ST_SetSRID(ST_MakePoint(2.2880, 41.6076), 4326), TRUE, NULL, TRUE,  FALSE, 70, 'lifted'),
  ('mollet-del-valles',         'Mollet del Vallès',         'Mollet del Vallés',         'valles-oriental',   'Barcelona',   53167,
    ST_SetSRID(ST_MakePoint(2.2122, 41.5404), 4326), TRUE, NULL, TRUE,  FALSE, 72, 'lifted'),
  ('parets-del-valles',         'Parets del Vallès',         'Parets del Vallés',         'valles-oriental',   'Barcelona',   19416,
    ST_SetSRID(ST_MakePoint(2.2317, 41.5734), 4326), TRUE, NULL, FALSE, FALSE, 65, 'none'),
  ('montornes-del-valles',      'Montornès del Vallès',      'Montornés del Vallés',      'valles-oriental',   'Barcelona',   16649,
    ST_SetSRID(ST_MakePoint(2.2660, 41.5396), 4326), TRUE, NULL, FALSE, FALSE, 60, 'none'),
  ('cardedeu',                  'Cardedeu',                   NULL,                       'valles-oriental',   'Barcelona',   19119,
    ST_SetSRID(ST_MakePoint(2.3577, 41.6402), 4326), TRUE, NULL, FALSE, FALSE, 55, 'none'),
  ('canovelles',                'Canovelles',                 NULL,                       'valles-oriental',   'Barcelona',   16482,
    ST_SetSRID(ST_MakePoint(2.2820, 41.6164), 4326), TRUE, NULL, FALSE, FALSE, 60, 'none'),
  ('la-llagosta',               'la Llagosta',               'La Llagosta',               'valles-oriental',   'Barcelona',   13606,
    ST_SetSRID(ST_MakePoint(2.1923, 41.5142), 4326), TRUE, NULL, FALSE, FALSE, 70, 'none'),
  ('sant-celoni',               'Sant Celoni',               'San Celoni',                'valles-oriental',   'Barcelona',   18017,
    ST_SetSRID(ST_MakePoint(2.4915, 41.6896), 4326), TRUE, NULL, FALSE, FALSE, 50, 'none'),
  ('caldes-de-montbui',         'Caldes de Montbui',         'Caldas de Montbui',         'valles-oriental',   'Barcelona',   17800,
    ST_SetSRID(ST_MakePoint(2.1685, 41.6308), 4326), TRUE, NULL, FALSE, FALSE, 45, 'none'),
  ('la-garriga',                'la Garriga',                'La Garriga',                'valles-oriental',   'Barcelona',   16455,
    ST_SetSRID(ST_MakePoint(2.2849, 41.6817), 4326), TRUE, NULL, FALSE, FALSE, 55, 'none'),
  ('les-franqueses-del-valles', 'les Franqueses del Vallès', 'Las Franquesas del Vallés', 'valles-oriental',   'Barcelona',   20217,
    ST_SetSRID(ST_MakePoint(2.3019, 41.6244), 4326), TRUE, NULL, FALSE, FALSE, 60, 'none'),
  ('llinars-del-valles',        'Llinars del Vallès',        'Llinars del Vallés',        'valles-oriental',   'Barcelona',   10500,
    ST_SetSRID(ST_MakePoint(2.4044, 41.6373), 4326), TRUE, NULL, FALSE, FALSE, 50, 'none'),
  ('llica-d-amunt',             'Lliçà d''Amunt',            'Llisá de Amunt',            'valles-oriental',   'Barcelona',   15410,
    ST_SetSRID(ST_MakePoint(2.2336, 41.6132), 4326), TRUE, NULL, FALSE, FALSE, 45, 'none'),
  ('la-roca-del-valles',        'la Roca del Vallès',        'La Roca del Vallés',        'valles-oriental',   'Barcelona',   11097,
    ST_SetSRID(ST_MakePoint(2.3267, 41.5879), 4326), TRUE, NULL, FALSE, FALSE, 50, 'none'),

-- ----- Baix Llobregat -----
  ('cornella-de-llobregat',     'Cornellà de Llobregat',     'Cornellá de Llobregat',     'baix-llobregat',    'Barcelona',   89936,
    ST_SetSRID(ST_MakePoint(2.0759, 41.3548), 4326), TRUE, NULL, TRUE,  FALSE, 85, 'lifted'),
  ('sant-boi-de-llobregat',     'Sant Boi de Llobregat',     'San Baudilio de Llobregat', 'baix-llobregat',    'Barcelona',   84500,
    ST_SetSRID(ST_MakePoint(2.0364, 41.3454), 4326), TRUE, NULL, TRUE,  FALSE, 75, 'lifted'),
  ('viladecans',                'Viladecans',                 NULL,                       'baix-llobregat',    'Barcelona',   68253,
    ST_SetSRID(ST_MakePoint(2.0192, 41.3148), 4326), TRUE, NULL, FALSE, FALSE, 75, 'lifted'),
  ('castelldefels',             'Castelldefels',              NULL,                       'baix-llobregat',    'Barcelona',   68099,
    ST_SetSRID(ST_MakePoint(1.9797, 41.2790), 4326), TRUE, NULL, FALSE, FALSE, 75, 'lifted'),
  ('el-prat-de-llobregat',      'el Prat de Llobregat',      'El Prat de Llobregat',      'baix-llobregat',    'Barcelona',   65929,
    ST_SetSRID(ST_MakePoint(2.0942, 41.3242), 4326), TRUE, NULL, FALSE, FALSE, 80, 'lifted'),
  ('esplugues-de-llobregat',    'Esplugues de Llobregat',    'Esplugas de Llobregat',     'baix-llobregat',    'Barcelona',   46905,
    ST_SetSRID(ST_MakePoint(2.0865, 41.3756), 4326), TRUE, NULL, TRUE,  FALSE, 85, 'lifted'),
  ('gava',                      'Gavà',                      'Gavá',                      'baix-llobregat',    'Barcelona',   47388,
    ST_SetSRID(ST_MakePoint(2.0024, 41.3055), 4326), TRUE, NULL, FALSE, FALSE, 75, 'lifted'),
  ('sant-feliu-de-llobregat',   'Sant Feliu de Llobregat',   'San Feliú de Llobregat',    'baix-llobregat',    'Barcelona',   46326,
    ST_SetSRID(ST_MakePoint(2.0466, 41.3829), 4326), TRUE, NULL, FALSE, FALSE, 78, 'lifted'),
  ('sant-joan-despi',           'Sant Joan Despí',           'San Juan Despí',            'baix-llobregat',    'Barcelona',   34717,
    ST_SetSRID(ST_MakePoint(2.0578, 41.3681), 4326), TRUE, NULL, TRUE,  FALSE, 80, 'lifted'),
  ('martorell',                 'Martorell',                  NULL,                       'baix-llobregat',    'Barcelona',   28518,
    ST_SetSRID(ST_MakePoint(1.9311, 41.4742), 4326), FALSE,NULL, FALSE, FALSE, 65, 'none'),
  ('sant-andreu-de-la-barca',   'Sant Andreu de la Barca',   'San Andrés de la Barca',    'baix-llobregat',    'Barcelona',   28015,
    ST_SetSRID(ST_MakePoint(1.9716, 41.4471), 4326), FALSE,NULL, FALSE, FALSE, 65, 'none'),
  ('sant-vicenc-dels-horts',    'Sant Vicenç dels Horts',    'San Vicente dels Horts',    'baix-llobregat',    'Barcelona',   28530,
    ST_SetSRID(ST_MakePoint(2.0119, 41.3939), 4326), TRUE, NULL, FALSE, FALSE, 70, 'none'),
  ('molins-de-rei',             'Molins de Rei',              NULL,                       'baix-llobregat',    'Barcelona',   25864,
    ST_SetSRID(ST_MakePoint(2.0157, 41.4144), 4326), TRUE, NULL, FALSE, FALSE, 75, 'none'),
  ('olesa-de-montserrat',       'Olesa de Montserrat',        NULL,                       'baix-llobregat',    'Barcelona',   24180,
    ST_SetSRID(ST_MakePoint(1.8949, 41.5443), 4326), TRUE, NULL, FALSE, FALSE, 55, 'none'),
  ('esparreguera',              'Esparreguera',               NULL,                       'baix-llobregat',    'Barcelona',   22651,
    ST_SetSRID(ST_MakePoint(1.8716, 41.5379), 4326), TRUE, NULL, FALSE, FALSE, 55, 'none'),
  ('vallirana',                 'Vallirana',                  NULL,                       'baix-llobregat',    'Barcelona',   15247,
    ST_SetSRID(ST_MakePoint(1.9335, 41.3895), 4326), TRUE, NULL, FALSE, FALSE, 50, 'none'),
  ('corbera-de-llobregat',      'Corbera de Llobregat',       NULL,                       'baix-llobregat',    'Barcelona',   14723,
    ST_SetSRID(ST_MakePoint(1.9181, 41.4181), 4326), TRUE, NULL, FALSE, FALSE, 50, 'none'),
  ('sant-just-desvern',         'Sant Just Desvern',         'San Justo Desvern',         'baix-llobregat',    'Barcelona',   17264,
    ST_SetSRID(ST_MakePoint(2.0686, 41.3839), 4326), TRUE, NULL, FALSE, FALSE, 80, 'lifted'),
  ('palleja',                   'Pallejà',                   'Palleja',                   'baix-llobregat',    'Barcelona',   12082,
    ST_SetSRID(ST_MakePoint(1.9847, 41.4218), 4326), TRUE, NULL, FALSE, FALSE, 60, 'none'),
  ('begues',                    'Begues',                     NULL,                       'baix-llobregat',    'Barcelona',    7305,
    ST_SetSRID(ST_MakePoint(1.9214, 41.3275), 4326), TRUE, NULL, FALSE, FALSE, 35, 'none'),

-- ----- Maresme -----
  ('mataro',                    'Mataró',                    'Mataró',                    'maresme',           'Barcelona',  131276,
    ST_SetSRID(ST_MakePoint(2.4445, 41.5388), 4326), TRUE, NULL, TRUE,  FALSE, 75, 'lifted'),
  ('premia-de-mar',             'Premià de Mar',             'Premiá de Mar',             'maresme',           'Barcelona',   28842,
    ST_SetSRID(ST_MakePoint(2.3623, 41.4925), 4326), TRUE, NULL, FALSE, FALSE, 70, 'lifted'),
  ('pineda-de-mar',             'Pineda de Mar',              NULL,                       'maresme',           'Barcelona',   28167,
    ST_SetSRID(ST_MakePoint(2.6849, 41.6275), 4326), TRUE, NULL, FALSE, FALSE, 60, 'lifted'),
  ('el-masnou',                 'el Masnou',                 'El Masnou',                 'maresme',           'Barcelona',   23671,
    ST_SetSRID(ST_MakePoint(2.3137, 41.4791), 4326), TRUE, NULL, FALSE, FALSE, 75, 'lifted'),
  ('vilassar-de-mar',           'Vilassar de Mar',            NULL,                       'maresme',           'Barcelona',   21044,
    ST_SetSRID(ST_MakePoint(2.3925, 41.5040), 4326), TRUE, NULL, FALSE, FALSE, 70, 'lifted'),
  ('vilassar-de-dalt',          'Vilassar de Dalt',           NULL,                       'maresme',           'Barcelona',    9162,
    ST_SetSRID(ST_MakePoint(2.3585, 41.5168), 4326), TRUE, NULL, FALSE, FALSE, 55, 'none'),
  ('malgrat-de-mar',            'Malgrat de Mar',             NULL,                       'maresme',           'Barcelona',   18841,
    ST_SetSRID(ST_MakePoint(2.7416, 41.6464), 4326), TRUE, NULL, FALSE, FALSE, 55, 'lifted'),
  ('calella',                   'Calella',                    NULL,                       'maresme',           'Barcelona',   18587,
    ST_SetSRID(ST_MakePoint(2.6593, 41.6135), 4326), TRUE, NULL, FALSE, FALSE, 60, 'lifted'),
  ('arenys-de-mar',             'Arenys de Mar',              NULL,                       'maresme',           'Barcelona',   15869,
    ST_SetSRID(ST_MakePoint(2.5499, 41.5811), 4326), TRUE, NULL, FALSE, FALSE, 60, 'lifted'),
  ('arenys-de-munt',            'Arenys de Munt',             NULL,                       'maresme',           'Barcelona',    9230,
    ST_SetSRID(ST_MakePoint(2.5413, 41.6113), 4326), TRUE, NULL, FALSE, FALSE, 50, 'none'),
  ('canet-de-mar',              'Canet de Mar',               NULL,                       'maresme',           'Barcelona',   14872,
    ST_SetSRID(ST_MakePoint(2.5811, 41.5897), 4326), TRUE, NULL, FALSE, FALSE, 60, 'lifted'),
  ('tordera',                   'Tordera',                    NULL,                       'maresme',           'Barcelona',   17098,
    ST_SetSRID(ST_MakePoint(2.7188, 41.6985), 4326), FALSE,NULL, FALSE, FALSE, 45, 'none'),
  ('argentona',                 'Argentona',                  NULL,                       'maresme',           'Barcelona',   12517,
    ST_SetSRID(ST_MakePoint(2.4022, 41.5552), 4326), TRUE, NULL, FALSE, FALSE, 55, 'none'),
  ('sant-pol-de-mar',           'Sant Pol de Mar',           'San Pol de Mar',            'maresme',           'Barcelona',    5414,
    ST_SetSRID(ST_MakePoint(2.6195, 41.6018), 4326), TRUE, NULL, FALSE, FALSE, 50, 'lifted'),
  ('sant-andreu-de-llavaneres', 'Sant Andreu de Llavaneres', 'San Andrés de Llavaneras',  'maresme',           'Barcelona',   11244,
    ST_SetSRID(ST_MakePoint(2.4836, 41.5736), 4326), TRUE, NULL, FALSE, FALSE, 55, 'none'),
  ('caldes-d-estrac',           'Caldes d''Estrac',          'Caldetas',                  'maresme',           'Barcelona',    3097,
    ST_SetSRID(ST_MakePoint(2.5325, 41.5707), 4326), TRUE, NULL, FALSE, FALSE, 55, 'none'),
  ('cabrera-de-mar',            'Cabrera de Mar',             NULL,                       'maresme',           'Barcelona',    4812,
    ST_SetSRID(ST_MakePoint(2.4036, 41.5238), 4326), TRUE, NULL, FALSE, FALSE, 55, 'none'),
  ('cabrils',                   'Cabrils',                    NULL,                       'maresme',           'Barcelona',    7411,
    ST_SetSRID(ST_MakePoint(2.3705, 41.5276), 4326), TRUE, NULL, FALSE, FALSE, 50, 'none'),
  ('alella',                    'Alella',                     NULL,                       'maresme',           'Barcelona',   10122,
    ST_SetSRID(ST_MakePoint(2.2950, 41.4940), 4326), TRUE, NULL, FALSE, FALSE, 60, 'none'),
  ('teia',                      'Teià',                       NULL,                       'maresme',           'Barcelona',    6303,
    ST_SetSRID(ST_MakePoint(2.3194, 41.4940), 4326), TRUE, NULL, FALSE, FALSE, 55, 'none'),
  ('montgat',                   'Montgat',                    NULL,                       'maresme',           'Barcelona',   12660,
    ST_SetSRID(ST_MakePoint(2.2807, 41.4685), 4326), TRUE, NULL, FALSE, FALSE, 75, 'lifted'),

-- ----- Garraf -----
  ('vilanova-i-la-geltru',      'Vilanova i la Geltrú',      'Villanueva y Geltrú',       'garraf',            'Barcelona',   68225,
    ST_SetSRID(ST_MakePoint(1.7257, 41.2240), 4326), TRUE, NULL, TRUE,  FALSE, 65, 'lifted'),
  ('sitges',                    'Sitges',                     NULL,                       'garraf',            'Barcelona',   30873,
    ST_SetSRID(ST_MakePoint(1.8118, 41.2376), 4326), TRUE, NULL, FALSE, FALSE, 65, 'lifted'),
  ('sant-pere-de-ribes',        'Sant Pere de Ribes',        'San Pedro de Ribas',        'garraf',            'Barcelona',   31050,
    ST_SetSRID(ST_MakePoint(1.7720, 41.2607), 4326), TRUE, NULL, FALSE, FALSE, 55, 'none'),
  ('cubelles',                  'Cubelles',                   NULL,                       'garraf',            'Barcelona',   15407,
    ST_SetSRID(ST_MakePoint(1.6727, 41.2080), 4326), TRUE, NULL, FALSE, FALSE, 55, 'lifted'),
  ('canyelles',                 'Canyelles',                  NULL,                       'garraf',            'Barcelona',    4760,
    ST_SetSRID(ST_MakePoint(1.7166, 41.2812), 4326), TRUE, NULL, FALSE, FALSE, 35, 'none'),
  ('olivella',                  'Olivella',                   NULL,                       'garraf',            'Barcelona',    4244,
    ST_SetSRID(ST_MakePoint(1.8401, 41.3001), 4326), TRUE, NULL, FALSE, FALSE, 30, 'none'),

-- ----- Alt Penedès -----
  ('vilafranca-del-penedes',    'Vilafranca del Penedès',    'Villafranca del Panadés',   'alt-penedes',       'Barcelona',   40841,
    ST_SetSRID(ST_MakePoint(1.6993, 41.3460), 4326), TRUE, NULL, TRUE,  FALSE, 65, 'none'),
  ('sant-sadurni-d-anoia',      'Sant Sadurní d''Anoia',     'San Sadurní de Noya',       'alt-penedes',       'Barcelona',   13273,
    ST_SetSRID(ST_MakePoint(1.7849, 41.4253), 4326), TRUE, NULL, FALSE, FALSE, 60, 'none'),
  ('gelida',                    'Gelida',                     NULL,                       'alt-penedes',       'Barcelona',    7724,
    ST_SetSRID(ST_MakePoint(1.8633, 41.4427), 4326), TRUE, NULL, FALSE, FALSE, 55, 'none'),

-- ----- Anoia -----
  ('igualada',                  'Igualada',                   NULL,                       'anoia',             'Barcelona',   42028,
    ST_SetSRID(ST_MakePoint(1.6175, 41.5790), 4326), TRUE, NULL, TRUE,  FALSE, 55, 'none'),
  ('vilanova-del-cami',         'Vilanova del Camí',         'Villanueva del Camino',     'anoia',             'Barcelona',   12884,
    ST_SetSRID(ST_MakePoint(1.6346, 41.5712), 4326), TRUE, NULL, FALSE, FALSE, 50, 'none'),
  ('piera',                     'Piera',                      NULL,                       'anoia',             'Barcelona',   16215,
    ST_SetSRID(ST_MakePoint(1.7503, 41.5224), 4326), TRUE, NULL, FALSE, FALSE, 45, 'none'),
  ('santa-margarida-de-montbui','Santa Margarida de Montbui',  NULL,                      'anoia',             'Barcelona',   10193,
    ST_SetSRID(ST_MakePoint(1.5961, 41.5604), 4326), TRUE, NULL, FALSE, FALSE, 45, 'none'),
  ('calaf',                     'Calaf',                      NULL,                       'anoia',             'Barcelona',    3621,
    ST_SetSRID(ST_MakePoint(1.5114, 41.7325), 4326), TRUE, NULL, FALSE, FALSE, 30, 'none'),

-- ----- Bages / Moianès / Berguedà / Solsonès -----
  ('manresa',                   'Manresa',                    NULL,                       'bages',             'Barcelona',   78630,
    ST_SetSRID(ST_MakePoint(1.8262, 41.7287), 4326), TRUE, NULL, TRUE,  FALSE, 60, 'none'),
  ('sant-fruitos-de-bages',     'Sant Fruitós de Bages',     'San Fructuoso de Bages',    'bages',             'Barcelona',    8819,
    ST_SetSRID(ST_MakePoint(1.8765, 41.7503), 4326), TRUE, NULL, FALSE, FALSE, 45, 'none'),
  ('navas',                     'Navàs',                      NULL,                       'bages',             'Barcelona',    5868,
    ST_SetSRID(ST_MakePoint(1.8830, 41.8993), 4326), TRUE, NULL, FALSE, FALSE, 35, 'none'),
  ('moia',                      'Moià',                       NULL,                       'moianes',           'Barcelona',    5912,
    ST_SetSRID(ST_MakePoint(2.0975, 41.8104), 4326), TRUE, NULL, FALSE, FALSE, 35, 'none'),
  ('berga',                     'Berga',                      NULL,                       'bergueda',          'Barcelona',   16456,
    ST_SetSRID(ST_MakePoint(1.8462, 42.1010), 4326), TRUE, NULL, TRUE,  FALSE, 40, 'none'),
  ('solsona',                   'Solsona',                    NULL,                       'solsones',          'Lleida',       9244,
    ST_SetSRID(ST_MakePoint(1.5168, 41.9942), 4326), TRUE, NULL, FALSE, FALSE, 35, 'none'),

-- ----- Osona -----
  ('vic',                       'Vic',                       'Vich',                      'osona',             'Barcelona',   49219,
    ST_SetSRID(ST_MakePoint(2.2548, 41.9301), 4326), TRUE, NULL, TRUE,  TRUE,  55, 'none'),
  ('manlleu',                   'Manlleu',                    NULL,                       'osona',             'Barcelona',   20862,
    ST_SetSRID(ST_MakePoint(2.2849, 42.0021), 4326), TRUE, NULL, FALSE, FALSE, 45, 'none'),
  ('torello',                   'Torelló',                    NULL,                       'osona',             'Barcelona',   14133,
    ST_SetSRID(ST_MakePoint(2.2645, 42.0466), 4326), TRUE, NULL, FALSE, FALSE, 45, 'none'),
  ('tona',                      'Tona',                       NULL,                       'osona',             'Barcelona',    8512,
    ST_SetSRID(ST_MakePoint(2.2253, 41.8484), 4326), TRUE, NULL, FALSE, FALSE, 40, 'none'),
  ('centelles',                 'Centelles',                  NULL,                       'osona',             'Barcelona',    7591,
    ST_SetSRID(ST_MakePoint(2.2226, 41.7958), 4326), TRUE, NULL, FALSE, FALSE, 50, 'none'),

-- ----- Gironès / Pla de l'Estany / Selva (Girona province) -----
  ('girona',                    'Girona',                    'Gerona',                    'girones',           'Girona',     104798,
    ST_SetSRID(ST_MakePoint(2.8214, 41.9831), 4326), TRUE, NULL, TRUE,  TRUE,  70, 'lifted'),
  ('salt',                      'Salt',                       NULL,                       'girones',           'Girona',      33735,
    ST_SetSRID(ST_MakePoint(2.7935, 41.9744), 4326), TRUE, NULL, FALSE, FALSE, 60, 'lifted'),
  ('sarria-de-ter',             'Sarrià de Ter',             'Sarriá de Ter',             'girones',           'Girona',        5366,
    ST_SetSRID(ST_MakePoint(2.8262, 42.0068), 4326), TRUE, NULL, FALSE, FALSE, 55, 'none'),
  ('celra',                     'Celrà',                      NULL,                       'girones',           'Girona',       5588,
    ST_SetSRID(ST_MakePoint(2.8754, 42.0237), 4326), TRUE, NULL, FALSE, FALSE, 50, 'none'),
  ('banyoles',                  'Banyoles',                  'Bañolas',                   'pla-de-l-estany',   'Girona',      20844,
    ST_SetSRID(ST_MakePoint(2.7656, 42.1192), 4326), TRUE, NULL, FALSE, FALSE, 45, 'lifted'),
  ('porqueres',                 'Porqueres',                  NULL,                       'pla-de-l-estany',   'Girona',       4769,
    ST_SetSRID(ST_MakePoint(2.7400, 42.1219), 4326), TRUE, NULL, FALSE, FALSE, 35, 'none'),
  ('blanes',                    'Blanes',                     NULL,                       'selva',             'Girona',       40194,
    ST_SetSRID(ST_MakePoint(2.7903, 41.6760), 4326), TRUE, NULL, TRUE,  FALSE, 55, 'lifted'),
  ('lloret-de-mar',             'Lloret de Mar',              NULL,                       'selva',             'Girona',       42000,
    ST_SetSRID(ST_MakePoint(2.8456, 41.7005), 4326), TRUE, NULL, FALSE, FALSE, 50, 'lifted'),
  ('tossa-de-mar',              'Tossa de Mar',               NULL,                       'selva',             'Girona',       6038,
    ST_SetSRID(ST_MakePoint(2.9325, 41.7195), 4326), TRUE, NULL, FALSE, FALSE, 35, 'lifted'),
  ('santa-coloma-de-farners',   'Santa Coloma de Farners',    NULL,                       'selva',             'Girona',      13183,
    ST_SetSRID(ST_MakePoint(2.6669, 41.8627), 4326), TRUE, NULL, FALSE, FALSE, 40, 'none'),
  ('arbucies',                  'Arbúcies',                   NULL,                       'selva',             'Girona',       6627,
    ST_SetSRID(ST_MakePoint(2.5159, 41.8161), 4326), TRUE, NULL, FALSE, FALSE, 30, 'none'),
  ('hostalric',                 'Hostalric',                  NULL,                       'selva',             'Girona',       4145,
    ST_SetSRID(ST_MakePoint(2.6358, 41.7479), 4326), TRUE, NULL, FALSE, FALSE, 40, 'none'),
  ('macanet-de-la-selva',       'Maçanet de la Selva',       'Macanet de la Selva',       'selva',             'Girona',       8760,
    ST_SetSRID(ST_MakePoint(2.7409, 41.7779), 4326), TRUE, NULL, FALSE, FALSE, 35, 'none'),

-- ----- Alt Empordà / Baix Empordà / Garrotxa / Ripollès / Cerdanya -----
  ('figueres',                  'Figueres',                  'Figueras',                  'alt-emporda',       'Girona',      48174,
    ST_SetSRID(ST_MakePoint(2.9603, 42.2675), 4326), TRUE, NULL, TRUE,  FALSE, 55, 'lifted'),
  ('roses',                     'Roses',                     'Rosas',                     'alt-emporda',       'Girona',      20458,
    ST_SetSRID(ST_MakePoint(3.1764, 42.2620), 4326), TRUE, NULL, FALSE, FALSE, 35, 'lifted'),
  ('cadaques',                  'Cadaqués',                   NULL,                       'alt-emporda',       'Girona',       2790,
    ST_SetSRID(ST_MakePoint(3.2790, 42.2887), 4326), TRUE, NULL, FALSE, FALSE, 25, 'lifted'),
  ('castello-d-empuries',       'Castelló d''Empúries',      'Castellón de Ampurias',     'alt-emporda',       'Girona',      12551,
    ST_SetSRID(ST_MakePoint(3.0742, 42.2585), 4326), TRUE, NULL, FALSE, FALSE, 30, 'lifted'),
  ('l-escala',                  'l''Escala',                 'La Escala',                 'alt-emporda',       'Girona',      10797,
    ST_SetSRID(ST_MakePoint(3.1322, 42.1242), 4326), TRUE, NULL, FALSE, FALSE, 30, 'lifted'),
  ('llanca',                    'Llançà',                    'Llansá',                    'alt-emporda',       'Girona',       5224,
    ST_SetSRID(ST_MakePoint(3.1542, 42.3633), 4326), TRUE, NULL, FALSE, FALSE, 25, 'lifted'),
  ('peralada',                  'Peralada',                  'Perelada',                  'alt-emporda',       'Girona',       2034,
    ST_SetSRID(ST_MakePoint(3.0070, 42.3057), 4326), TRUE, NULL, FALSE, FALSE, 25, 'none'),
  ('palafrugell',               'Palafrugell',                NULL,                       'baix-emporda',      'Girona',      23306,
    ST_SetSRID(ST_MakePoint(3.1631, 41.9192), 4326), TRUE, NULL, TRUE,  FALSE, 40, 'lifted'),
  ('palamos',                   'Palamós',                    NULL,                       'baix-emporda',      'Girona',      18268,
    ST_SetSRID(ST_MakePoint(3.1283, 41.8463), 4326), TRUE, NULL, FALSE, FALSE, 40, 'lifted'),
  ('sant-feliu-de-guixols',     'Sant Feliu de Guíxols',     'San Feliú de Guíxols',      'baix-emporda',      'Girona',      22057,
    ST_SetSRID(ST_MakePoint(3.0317, 41.7813), 4326), TRUE, NULL, FALSE, FALSE, 40, 'lifted'),
  ('la-bisbal-d-emporda',       'la Bisbal d''Empordà',      'La Bisbal de Ampurdán',     'baix-emporda',      'Girona',      11427,
    ST_SetSRID(ST_MakePoint(3.0381, 41.9590), 4326), TRUE, NULL, FALSE, FALSE, 35, 'none'),
  ('begur',                     'Begur',                     'Bagur',                     'baix-emporda',      'Girona',       4079,
    ST_SetSRID(ST_MakePoint(3.2073, 41.9542), 4326), TRUE, NULL, FALSE, FALSE, 25, 'lifted'),
  ('pals',                      'Pals',                       NULL,                       'baix-emporda',      'Girona',       2741,
    ST_SetSRID(ST_MakePoint(3.1473, 41.9691), 4326), TRUE, NULL, FALSE, FALSE, 25, 'lifted'),
  ('castell-platja-d-aro',      'Castell-Platja d''Aro',     'Castillo-Playa de Aro',     'baix-emporda',      'Girona',      11500,
    ST_SetSRID(ST_MakePoint(3.0654, 41.8175), 4326), TRUE, NULL, FALSE, FALSE, 35, 'lifted'),
  ('calonge-i-sant-antoni',     'Calonge i Sant Antoni',     'Calonge',                   'baix-emporda',      'Girona',      11762,
    ST_SetSRID(ST_MakePoint(3.0760, 41.8616), 4326), TRUE, NULL, FALSE, FALSE, 35, 'lifted'),
  ('torroella-de-montgri',      'Torroella de Montgrí',       NULL,                       'baix-emporda',      'Girona',      11781,
    ST_SetSRID(ST_MakePoint(3.1281, 42.0418), 4326), FALSE,NULL, FALSE, FALSE, 30, 'none'),
  ('olot',                      'Olot',                       NULL,                       'garrotxa',          'Girona',      36063,
    ST_SetSRID(ST_MakePoint(2.4901, 42.1818), 4326), TRUE, NULL, TRUE,  FALSE, 45, 'none'),
  ('besalu',                    'Besalú',                    'Besalú',                    'garrotxa',          'Girona',       2433,
    ST_SetSRID(ST_MakePoint(2.6993, 42.1996), 4326), TRUE, NULL, FALSE, FALSE, 30, 'none'),
  ('ripoll',                    'Ripoll',                     NULL,                       'ripolles',          'Girona',      10519,
    ST_SetSRID(ST_MakePoint(2.1907, 42.2014), 4326), TRUE, NULL, FALSE, FALSE, 35, 'none'),
  ('camprodon',                 'Camprodon',                  NULL,                       'ripolles',          'Girona',       2360,
    ST_SetSRID(ST_MakePoint(2.3653, 42.3122), 4326), FALSE,NULL, FALSE, FALSE, 25, 'none'),
  ('puigcerda',                 'Puigcerdà',                 'Puigcerdá',                 'cerdanya',          'Girona',       9981,
    ST_SetSRID(ST_MakePoint(1.9281, 42.4318), 4326), TRUE, NULL, TRUE,  FALSE, 35, 'lifted'),
  ('bellver-de-cerdanya',       'Bellver de Cerdanya',        NULL,                       'cerdanya',          'Lleida',       2160,
    ST_SetSRID(ST_MakePoint(1.7768, 42.3697), 4326), TRUE, NULL, FALSE, FALSE, 25, 'none'),

-- ----- Tarragonès / Baix Camp / Baix Penedès / Alt Camp / Conca de Barberà -----
  ('tarragona',                 'Tarragona',                  NULL,                       'tarragones',        'Tarragona',  140323,
    ST_SetSRID(ST_MakePoint(1.2444, 41.1189), 4326), TRUE, NULL, TRUE,  TRUE,  70, 'lifted'),
  ('salou',                     'Salou',                      NULL,                       'tarragones',        'Tarragona',   30009,
    ST_SetSRID(ST_MakePoint(1.1413, 41.0763), 4326), TRUE, NULL, FALSE, FALSE, 50, 'lifted'),
  ('vila-seca',                 'Vila-seca',                 'Vilaseca',                  'tarragones',        'Tarragona',   23166,
    ST_SetSRID(ST_MakePoint(1.1473, 41.1110), 4326), TRUE, NULL, FALSE, FALSE, 55, 'lifted'),
  ('torredembarra',             'Torredembarra',              NULL,                       'tarragones',        'Tarragona',   16187,
    ST_SetSRID(ST_MakePoint(1.4015, 41.1469), 4326), TRUE, NULL, FALSE, FALSE, 50, 'lifted'),
  ('la-canonja',                'la Canonja',                'La Canonja',                'tarragones',        'Tarragona',    6269,
    ST_SetSRID(ST_MakePoint(1.1851, 41.1296), 4326), TRUE, NULL, FALSE, FALSE, 50, 'none'),
  ('altafulla',                 'Altafulla',                  NULL,                       'tarragones',        'Tarragona',    5631,
    ST_SetSRID(ST_MakePoint(1.3741, 41.1422), 4326), TRUE, NULL, FALSE, FALSE, 45, 'lifted'),
  ('creixell',                  'Creixell',                   NULL,                       'tarragones',        'Tarragona',    3819,
    ST_SetSRID(ST_MakePoint(1.4393, 41.1614), 4326), TRUE, NULL, FALSE, FALSE, 35, 'none'),
  ('reus',                      'Reus',                       NULL,                       'baix-camp',         'Tarragona',  108807,
    ST_SetSRID(ST_MakePoint(1.1067, 41.1559), 4326), TRUE, NULL, TRUE,  TRUE,  65, 'lifted'),
  ('cambrils',                  'Cambrils',                   NULL,                       'baix-camp',         'Tarragona',   34352,
    ST_SetSRID(ST_MakePoint(1.0596, 41.0660), 4326), TRUE, NULL, FALSE, FALSE, 50, 'lifted'),
  ('mont-roig-del-camp',        'Mont-roig del Camp',         NULL,                       'baix-camp',         'Tarragona',   13985,
    ST_SetSRID(ST_MakePoint(0.9591, 41.0860), 4326), TRUE, NULL, FALSE, FALSE, 35, 'lifted'),
  ('alcover',                   'Alcover',                    NULL,                       'alt-camp',          'Tarragona',    5326,
    ST_SetSRID(ST_MakePoint(1.1697, 41.2641), 4326), TRUE, NULL, FALSE, FALSE, 35, 'none'),
  ('valls',                     'Valls',                      NULL,                       'alt-camp',          'Tarragona',   25254,
    ST_SetSRID(ST_MakePoint(1.2495, 41.2873), 4326), TRUE, NULL, TRUE,  FALSE, 55, 'none'),
  ('el-vendrell',               'el Vendrell',               'El Vendrell',               'baix-penedes',      'Tarragona',   38971,
    ST_SetSRID(ST_MakePoint(1.5358, 41.2200), 4326), TRUE, NULL, TRUE,  FALSE, 55, 'lifted'),
  ('calafell',                  'Calafell',                   NULL,                       'baix-penedes',      'Tarragona',   25910,
    ST_SetSRID(ST_MakePoint(1.5673, 41.1989), 4326), TRUE, NULL, FALSE, FALSE, 50, 'lifted'),
  ('cunit',                     'Cunit',                      NULL,                       'baix-penedes',      'Tarragona',   13989,
    ST_SetSRID(ST_MakePoint(1.6313, 41.1968), 4326), TRUE, NULL, FALSE, FALSE, 45, 'lifted'),
  ('l-arboc',                   'l''Arboç',                  'El Arbós',                  'baix-penedes',      'Tarragona',    5798,
    ST_SetSRID(ST_MakePoint(1.5995, 41.2685), 4326), TRUE, NULL, FALSE, FALSE, 40, 'none'),
  ('montblanc',                 'Montblanc',                  NULL,                       'conca-de-barbera',  'Tarragona',    7398,
    ST_SetSRID(ST_MakePoint(1.1612, 41.3741), 4326), TRUE, NULL, FALSE, FALSE, 40, 'none'),

-- ----- Baix Ebre / Montsià / Ribera d'Ebre / Priorat / Terra Alta -----
  ('tortosa',                   'Tortosa',                    NULL,                       'baix-ebre',         'Tarragona',   34982,
    ST_SetSRID(ST_MakePoint(0.5212, 40.8126), 4326), TRUE, NULL, TRUE,  FALSE, 45, 'none'),
  ('roquetes',                  'Roquetes',                   NULL,                       'baix-ebre',         'Tarragona',    8243,
    ST_SetSRID(ST_MakePoint(0.5042, 40.8238), 4326), TRUE, NULL, FALSE, FALSE, 40, 'none'),
  ('l-ametlla-de-mar',          'l''Ametlla de Mar',         'La Ampolla',                'baix-ebre',         'Tarragona',    7715,
    ST_SetSRID(ST_MakePoint(0.8016, 40.8826), 4326), TRUE, NULL, FALSE, FALSE, 30, 'lifted'),
  ('l-ampolla',                 'l''Ampolla',                'La Ampolla',                'baix-ebre',         'Tarragona',    3736,
    ST_SetSRID(ST_MakePoint(0.7129, 40.8118), 4326), TRUE, NULL, FALSE, FALSE, 30, 'lifted'),
  ('deltebre',                  'Deltebre',                   NULL,                       'baix-ebre',         'Tarragona',   12039,
    ST_SetSRID(ST_MakePoint(0.7197, 40.7196), 4326), TRUE, NULL, FALSE, FALSE, 30, 'none'),
  ('amposta',                   'Amposta',                    NULL,                       'montsia',           'Tarragona',   21621,
    ST_SetSRID(ST_MakePoint(0.5807, 40.7095), 4326), TRUE, NULL, FALSE, FALSE, 40, 'none'),
  ('alcanar',                   'Alcanar',                    NULL,                       'montsia',           'Tarragona',    9800,
    ST_SetSRID(ST_MakePoint(0.4790, 40.5435), 4326), TRUE, NULL, FALSE, FALSE, 35, 'lifted'),
  ('sant-carles-de-la-rapita',  'Sant Carles de la Ràpita',  'San Carlos de la Rápita',   'montsia',           'Tarragona',   15170,
    ST_SetSRID(ST_MakePoint(0.5934, 40.6188), 4326), FALSE,NULL, FALSE, FALSE, 40, 'lifted'),
  ('mora-d-ebre',               'Móra d''Ebre',              'Mora de Ebro',              'ribera-d-ebre',     'Tarragona',    5841,
    ST_SetSRID(ST_MakePoint(0.6429, 41.0917), 4326), TRUE, NULL, FALSE, FALSE, 35, 'none'),
  ('mora-la-nova',              'Móra la Nova',              'Mora la Nueva',             'ribera-d-ebre',     'Tarragona',    3208,
    ST_SetSRID(ST_MakePoint(0.6500, 41.0958), 4326), TRUE, NULL, FALSE, FALSE, 35, 'none'),
  ('falset',                    'Falset',                     NULL,                       'priorat',           'Tarragona',    2876,
    ST_SetSRID(ST_MakePoint(0.8217, 41.1450), 4326), TRUE, NULL, FALSE, FALSE, 35, 'none'),

-- ----- Segrià / Pla d'Urgell / Urgell / Segarra / Noguera / Pallars / Alt Urgell -----
  ('lleida',                    'Lleida',                    'Lérida',                    'segria',            'Lleida',     142322,
    ST_SetSRID(ST_MakePoint(0.6262, 41.6176), 4326), TRUE, NULL, TRUE,  TRUE,  60, 'none'),
  ('alcarras',                  'Alcarràs',                  'Alcarraz',                  'segria',            'Lleida',       9926,
    ST_SetSRID(ST_MakePoint(0.5184, 41.5664), 4326), TRUE, NULL, FALSE, FALSE, 40, 'none'),
  ('almacelles',                'Almacelles',                 NULL,                       'segria',            'Lleida',       6797,
    ST_SetSRID(ST_MakePoint(0.4400, 41.7264), 4326), TRUE, NULL, FALSE, FALSE, 35, 'none'),
  ('alpicat',                   'Alpicat',                    NULL,                       'segria',            'Lleida',       6883,
    ST_SetSRID(ST_MakePoint(0.5826, 41.6756), 4326), TRUE, NULL, FALSE, FALSE, 40, 'none'),
  ('mollerussa',                'Mollerussa',                'Mollerusa',                 'pla-d-urgell',      'Lleida',       16013,
    ST_SetSRID(ST_MakePoint(0.8932, 41.6309), 4326), TRUE, NULL, FALSE, FALSE, 40, 'none'),
  ('tarrega',                   'Tàrrega',                   'Tárrega',                   'urgell',            'Lleida',       17890,
    ST_SetSRID(ST_MakePoint(1.1387, 41.6469), 4326), TRUE, NULL, FALSE, FALSE, 40, 'none'),
  ('bellpuig',                  'Bellpuig',                   NULL,                       'urgell',            'Lleida',        5008,
    ST_SetSRID(ST_MakePoint(1.0124, 41.6256), 4326), TRUE, NULL, FALSE, FALSE, 30, 'none'),
  ('cervera',                   'Cervera',                    NULL,                       'segarra',           'Lleida',       9510,
    ST_SetSRID(ST_MakePoint(1.2723, 41.6701), 4326), TRUE, NULL, FALSE, FALSE, 40, 'none'),
  ('guissona',                  'Guissona',                   NULL,                       'segarra',           'Lleida',        7520,
    ST_SetSRID(ST_MakePoint(1.2854, 41.7847), 4326), TRUE, NULL, FALSE, FALSE, 35, 'none'),
  ('balaguer',                  'Balaguer',                   NULL,                       'noguera',           'Lleida',       17122,
    ST_SetSRID(ST_MakePoint(0.8064, 41.7902), 4326), TRUE, NULL, FALSE, FALSE, 40, 'none'),
  ('les-borges-blanques',       'les Borges Blanques',       'Las Borjas Blancas',        'garrigues',         'Lleida',        6173,
    ST_SetSRID(ST_MakePoint(0.8654, 41.5224), 4326), TRUE, NULL, FALSE, FALSE, 30, 'none'),
  ('tremp',                     'Tremp',                      NULL,                       'pallars-jussa',     'Lleida',        6363,
    ST_SetSRID(ST_MakePoint(0.8939, 42.1659), 4326), TRUE, NULL, FALSE, FALSE, 30, 'none'),
  ('sort',                      'Sort',                       NULL,                       'pallars-sobira',    'Lleida',        2329,
    ST_SetSRID(ST_MakePoint(1.1305, 42.4131), 4326), TRUE, NULL, FALSE, FALSE, 25, 'none'),
  ('la-seu-d-urgell',           'la Seu d''Urgell',          'La Seo de Urgel',           'alt-urgell',        'Lleida',       12366,
    ST_SetSRID(ST_MakePoint(1.4604, 42.3577), 4326), TRUE, NULL, FALSE, FALSE, 35, 'none')
ON CONFLICT (slug) DO UPDATE SET
  name                  = EXCLUDED.name,
  name_es               = EXCLUDED.name_es,
  comarca_slug          = EXCLUDED.comarca_slug,
  province              = EXCLUDED.province,
  population            = EXCLUDED.population,
  location              = EXCLUDED.location,
  in_zona_tensionada    = EXCLUDED.in_zona_tensionada,
  rent_index_eur_m2_mo  = EXCLUDED.rent_index_eur_m2_mo,
  has_hospital          = EXCLUDED.has_hospital,
  has_university        = EXCLUDED.has_university,
  transit_score         = EXCLUDED.transit_score,
  hut_moratorium_status = EXCLUDED.hut_moratorium_status;

COMMIT;

-- =============================================================================
-- Stats: 43 comarques, 178 cities, 0 with rent_index, 172 in zona tensionada
-- (rent_index_eur_m2_mo intentionally NULL — to be loaded by SERPAVI ETL.
--  See CLAUDE.md rule #3: yield calc must gate against the official índex
--  de referència; we will not fabricate ceiling values.)
-- =============================================================================
