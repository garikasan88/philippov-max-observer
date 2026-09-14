// V2.1 targeted regex correction.
// JavaScript \b / \w are ASCII-oriented and are unsafe around Cyrillic words.

v21ExtractBareLandArea = function v21ExtractBareLandAreaCyrillicSafe(raw) {
  const vals = [];
  for (const m of String(raw || '').matchAll(/(?:^|[^\d])([1-9]\d?(?:[.,]\d+)?)\s*сот(?:ок|ки|ка)?(?=\s|[.,;:/]|$)/giu)) {
    const v = Number(String(m[1]).replace(',', '.'));
    if (Number.isFinite(v) && v >= 1 && v <= 100) vals.push(v);
  }
  return vals.length ? Math.max(...vals) : null;
};

v21LandFromHousePhrase = function v21LandFromHousePhraseCyrillicSafe(raw) {
  const m = String(raw || '').match(/(?:дом|коттедж|дуплекс|таунхаус)[^\n]{0,45}?\sот\s*([1-9]\d?(?:[.,]\d+)?)\s*сот(?:ок|ки|ка)?(?=\s|[.,;:/]|$)/iu);
  if (!m) return null;
  const v = Number(String(m[1]).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
};

// For room-type classification only, erase address corpus tokens completely.
// Keeping "92 корпус 2" is unsafe because the frozen request regex can read
// the trailing 2 in 92 + the first letter of "корпус" as shorthand "2к".
v21MaskCorpusNumbers = function v21MaskCorpusNumbersSafe(raw) {
  return String(raw || '').replace(/\d{1,3}\s*к\s*\d{1,3}(?=\s|[.,;:/]|$)/giu, ' АДРЕС_КОРПУС ');
};

// The original V2.1 phrase used \w* after "маленьк", which does not consume
// Cyrillic endings in JavaScript. Apply the intended >=25 m² rule safely here.
const __v21RegexFixParseRequestBase = parseRequest;
parseRequest = function v21RegexFixParseRequest(text) {
  const out = __v21RegexFixParseRequestBase(text);
  if (!out || out.kind !== 'REQUEST') return out;
  const n = normalizeText(text);
  if ((out.types || []).includes('studio') && /маленьк[а-яё]*\s+не\s+предлаг/iu.test(n)) {
    out.area = out.area && typeof out.area === 'object' ? out.area : {min:null,max:null,preferred:null};
    if (out.area.min == null) out.area.min = V21_SMALL_STUDIO_MIN_AREA;
    out.smallStudioMinAppliedV21 = V21_SMALL_STUDIO_MIN_AREA;
  }
  return out;
};
