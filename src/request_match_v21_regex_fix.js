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

// Prefer 4-8 digit shorthand before short decimal millions so "3500" is
// consumed as one token and normalized by the frozen money parser to 3.5m.
v21PriorityBudget = function v21PriorityBudgetSafe(raw) {
  const text = String(raw || '');
  const m = text.match(/(?:бюджет\s+)?приоритет(?:ный)?(?:\s+бюджет)?\s*(?:до\s*)?(\d{4,8}|\d{1,3}(?:[.,]\d+)?)(?=\s|[.,;:/]|$)\s*(млн|милл|миллион(?:а|ов)?|тыс|тр|руб(?:лей|ля|\.)?)?/iu);
  if (!m) return null;
  return moneyTokenToRub(m[1], m[2] || '');
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

  // Re-apply the +300k operating rule with the Cyrillic-safe/full-token parser.
  const preferredBudget = v21PriorityBudget(text);
  if (preferredBudget != null && /дороже[^\n]{0,30}(?:тоже\s+)?рассмотр|выше[^\n]{0,30}рассмотр/iu.test(n)) {
    out.preferredBudgetMaxV21 = preferredBudget;
    out.budgetFlexV21 = V21_PRIORITY_BUDGET_BUFFER_RUB;
    out.budgetMax = preferredBudget + V21_PRIORITY_BUDGET_BUFFER_RUB;
    if (out.typeBudgets && typeof out.typeBudgets === 'object') {
      for (const t of out.types || []) {
        if (Number.isFinite(out.typeBudgets[t]) && out.typeBudgets[t] <= preferredBudget) {
          out.typeBudgets[t] = out.budgetMax;
        }
      }
    }
  }
  return out;
};
