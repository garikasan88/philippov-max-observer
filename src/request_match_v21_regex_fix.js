// V2.1 targeted regex correction.
// JavaScript \b uses ASCII-style word boundaries and is unsafe around Cyrillic words.

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

v21MaskCorpusNumbers = function v21MaskCorpusNumbersSafe(raw) {
  return String(raw || '').replace(/(\d{1,3})\s*к\s*(\d{1,3})(?=\s|[.,;:/]|$)/giu, '$1 корпус $2');
};
