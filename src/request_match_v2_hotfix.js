// PHILIPPOV SCOUT REQUEST/MATCH V2 — targeted regression hotfixes.
// Loaded after request_match_v2_patch.js.

const __v2ExtractExcludedGeoBase = v2ExtractExcludedGeo;
v2ExtractExcludedGeo = function v2ExtractExcludedGeoHotfix(raw) {
  const out = new Set(__v2ExtractExcludedGeoBase(raw));
  const n = normalizeText(raw);

  // Realtors often write the regional exclusion as "не Адыгея", while
  // the positive target in our working taxonomy is "Новая Адыгея".
  // Keep the broad word out of positive GEO extraction, but make it a
  // hard exclusion for objects tagged as Новая Адыгея.
  if (/(?:не|кроме)\s+адыге[яи]|адыгея\s+(?:нет|не\s+смотрим|не\s+предлаг)/iu.test(n)) {
    out.add('geo:новая адыгея');
  }

  return [...out];
};
