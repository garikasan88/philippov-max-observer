// PHILIPPOV SCOUT REQUEST/MATCH V2.1 — real-request hardening.
// Evidence basis: real MAX realtor requests reviewed on 2026-09-14.
// Principle: explicit hard constraints fail closed; UNKNOWN never widens a request.

const V21_SMALL_STUDIO_MIN_AREA = 25;
const V21_PRIORITY_BUDGET_BUFFER_RUB = 300_000;

// Named locations that appeared in real requests but were absent from the frozen V2 taxonomy.
// They are treated as exact named complexes/settlements, not as permission to widen geography.
const V21_NAMED_COMPLEX_ALIASES = Object.freeze({
  'сказка град': ['сказка град', 'сказка-град'],
  'кп крепость': ['кп крепость', 'коттеджный поселок крепость', 'коттеджный посёлок крепость'],
});

const __v21RealExtractComplexesBase = v2ExtractComplexes;
v2ExtractComplexes = function v21RealExtractComplexes(raw) {
  const out = new Set(__v21RealExtractComplexesBase(raw));
  for (const [canon, aliases] of Object.entries(V21_NAMED_COMPLEX_ALIASES)) {
    if (aliases.some(a => v2LooseIncludes(raw, a))) out.add(canon);
  }
  return [...out];
};

const __v21RealObjectMatchesComplexBase = v2ObjectMatchesComplex;
v2ObjectMatchesComplex = function v21RealObjectMatchesComplex(obj, complex) {
  const aliases = V21_NAMED_COMPLEX_ALIASES[complex];
  if (!aliases) return __v21RealObjectMatchesComplexBase(obj, complex);
  const corpus = `${obj?.sourceText || ''} ${obj?.norm || ''}`;
  return aliases.some(a => v2LooseIncludes(corpus, a));
};

function v21HasNamedLocationCue(raw) {
  return /(?:^|\s)(?:жк|кп|коттеджн(?:ый|ого)\s+пос[её]лок|район|р-?н|мкр|микрорайон|локац(?:ия|ии))\b/iu.test(String(raw || ''));
}

function v21PriorityBudget(raw) {
  const text = String(raw || '');
  const m = text.match(/приоритет(?:ный)?(?:\s+бюджет)?\s*(?:до\s*)?(\d{1,3}(?:[.,]\d+)?|\d{4,8})\s*(млн|милл|миллион(?:а|ов)?|тыс|тр|руб(?:лей|ля|\.)?)?/iu);
  if (!m) return null;
  return moneyTokenToRub(m[1], m[2] || '');
}

function v21DesignerRepairRequested(raw) {
  const n = normalizeText(raw);
  return /дизайнерск(?:ий|ого|им|ая|ую)?\s+ремонт/iu.test(n) ||
    /ремонт\s+(?:по\s+)?дизайн\s*проект/iu.test(n) ||
    /авторск(?:ий|ого)\s+ремонт/iu.test(n) ||
    /адекватн(?:ый|ого)\s+ремонт/iu.test(n) ||
    /шикарн(?:ая|ый|ую|ое)|красива(?:я|ую)|красивый/iu.test(n);
}

function v21DesignerRepairObject(raw) {
  const n = normalizeText(raw);
  return /дизайнерск(?:ий|ого|им|ая|ую)?\s+ремонт/iu.test(n) ||
    /ремонт\s+(?:по\s+)?дизайн\s*проект/iu.test(n) ||
    /авторск(?:ий|ого)\s+ремонт/iu.test(n);
}

function v21ExtractBareLandArea(raw) {
  const vals = [];
  for (const m of String(raw || '').matchAll(/(?:^|[^\d])([1-9]\d?(?:[.,]\d+)?)\s*сот(?:ок|ки|ка)?\b/giu)) {
    const v = Number(String(m[1]).replace(',', '.'));
    if (Number.isFinite(v) && v >= 1 && v <= 100) vals.push(v);
  }
  return vals.length ? Math.max(...vals) : null;
}

function v21LandFromHousePhrase(raw) {
  const m = String(raw || '').match(/(?:дом|коттедж|дуплекс|таунхаус)[^\n]{0,45}?\bот\s*([1-9]\d?(?:[.,]\d+)?)\s*сот(?:ок|ки|ка)?\b/iu);
  if (!m) return null;
  const v = Number(String(m[1]).replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

function v21MaskCorpusNumbers(raw) {
  return String(raw || '').replace(/\b(\d{1,3}[а-яa-z]?)\s*к\s*(\d{1,3})\b/giu, '$1 корпус $2');
}

// Prevent address corpus notation such as "92к2" / "2 к3" from becoming a false 2k room type.
const __v21RealParseObjectTypesBase = parseObjectTypes;
parseObjectTypes = function v21RealParseObjectTypes(raw) {
  return __v21RealParseObjectTypesBase(v21MaskCorpusNumbers(raw));
};

const __v21RealParseRequestBase = parseRequest;
parseRequest = function v21RealParseRequest(text) {
  const raw = String(text || '');
  const n = normalizeText(raw);

  // Igor's decision: "первая цена / первые цены" are reseller/buyout requests and are not our target.
  if (/(?:первая\s+цена|первые\s+цены|первую\s+цену)/iu.test(n)) {
    return {kind:'IGNORE', reason:'FIRST_PRICE_RESELLER_IGNORE', raw, norm:n};
  }

  const out = __v21RealParseRequestBase(text);
  if (!out || out.kind !== 'REQUEST') return out;

  // Unknown named geography must fail closed instead of silently becoming GEO=NONE.
  const namedCue = v21HasNamedLocationCue(raw);
  const hasResolvedGeo = Boolean(
    (out.geoV2 && out.geoV2.length) ||
    (out.complexesV2 && out.complexesV2.length) ||
    (out.addressesV2 && out.addressesV2.length) ||
    out.geoModeV2 === 'ANY'
  );
  if (namedCue && !hasResolvedGeo) {
    out.geoMentionedV2 = true;
    out.geoUnresolvedV2 = true;
  }

  // Real shorthand: "Дом от 4 соток" means minimum plot area, even without the word "участок".
  if ((out.types || []).some(t => t === 'house' || t === 'ground-format')) {
    out.land = out.land && typeof out.land === 'object' ? out.land : {min:null};
    if (out.land.min == null) {
      const landMin = v21LandFromHousePhrase(raw);
      if (landMin != null) out.land.min = landMin;
    }
  }

  // Operational interpretation from current Krasnodar stock: "маленькие не предлагать" => >=25 m².
  if ((out.types || []).includes('studio') && /маленьк\w*\s+не\s+предлаг/iu.test(n)) {
    out.area = out.area && typeof out.area === 'object' ? out.area : {min:null,max:null,preferred:null};
    if (out.area.min == null) out.area.min = V21_SMALL_STUDIO_MIN_AREA;
    out.smallStudioMinAppliedV21 = V21_SMALL_STUDIO_MIN_AREA;
  }

  // Igor's temporary operating rule: "priority X, more expensive considered" => X + 300k hard ceiling.
  const preferredBudget = v21PriorityBudget(raw);
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

  out.conditions = out.conditions && typeof out.conditions === 'object' ? out.conditions : {};
  if (v21DesignerRepairRequested(raw)) out.conditions.designerRepairRequiredV21 = true;
  if (/не\s+первая\s+очеред|кроме\s+первой\s+очеред|только\s+не\s+первая\s+очеред/iu.test(n)) {
    out.conditions.excludeFirstPhaseV21 = true;
  }
  if (/214\s*фз/iu.test(n)) out.conditions.law214RequiredV21 = true;

  return out;
};

const __v21RealParseObjectMessageBase = parseObjectMessage;
parseObjectMessage = function v21RealParseObjectMessage(m) {
  const obj = __v21RealParseObjectMessageBase(m);
  if (!obj) return obj;
  const raw = String(obj.sourceText || '');

  if (obj.land == null) obj.land = v21ExtractBareLandArea(raw);
  obj.designerRepairV21 = v21DesignerRepairObject(raw);
  obj.firstPhaseV21 = /(?:^|\s)(?:1|первая)\s*(?:очеред|этап)/iu.test(normalizeText(raw)) ? true :
    (/(?:^|\s)(?:2|3|4|5|вторая|третья|четвертая|пятая)\s*(?:очеред|этап)/iu.test(normalizeText(raw)) ? false : null);
  obj.law214V21 = /214\s*фз/iu.test(normalizeText(raw)) ? true : null;

  return obj;
};

function v21ApplyExtraHardConstraints(req, obj, verdict) {
  if (!verdict?.match) return verdict;
  const reasons = [...(verdict.reasons || [])];

  if (req?.land?.min != null) {
    if (obj?.land == null) return {match:false, reason:'LAND_UNCONFIRMED', reasons};
    if (Number(obj.land) < Number(req.land.min)) return {match:false, reason:'LAND_MIN_MISS', reasons};
    reasons.push('LAND:HARD');
  }

  const c = req?.conditions || {};
  if (c.designerRepairRequiredV21) {
    if (obj?.designerRepairV21 !== true) return {match:false, reason:'DESIGNER_REPAIR_UNCONFIRMED', reasons};
    reasons.push('DESIGNER_REPAIR:HARD');
  }
  if (c.excludeFirstPhaseV21) {
    if (obj?.firstPhaseV21 == null) return {match:false, reason:'PHASE_UNCONFIRMED', reasons};
    if (obj.firstPhaseV21 === true) return {match:false, reason:'FIRST_PHASE_EXCLUDED', reasons};
    reasons.push('PHASE:HARD');
  }
  if (c.law214RequiredV21) {
    if (obj?.law214V21 !== true) return {match:false, reason:'LAW214_UNCONFIRMED', reasons};
    reasons.push('214FZ:HARD');
  }

  return {...verdict, reasons};
}

const __v21RealMatchRequestToLiveObjectBase = matchRequestToLiveObject;
matchRequestToLiveObject = function v21RealMatchRequestToLiveObject(req, obj) {
  const verdict = __v21RealMatchRequestToLiveObjectBase(req, obj);
  if (!verdict?.match) return verdict;
  const effectiveReq = verdict.matchedSubRequestV21 || req;
  return v21ApplyExtraHardConstraints(effectiveReq, obj, verdict);
};

function v21CanonicalPhone(raw) {
  const m = String(raw || '').match(/(?:\+?7|8)[\s()\-]*\d{3}[\s()\-]*\d{3}[\s\-]*\d{2}[\s\-]*\d{2}/u);
  if (!m) return '';
  let d = m[0].replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('8')) d = '7' + d.slice(1);
  if (d.length === 10) d = '7' + d;
  return d;
}

function v21LegacyMatchKey(m, cid) {
  return `${cid}|${m?.requestMessageId || ''}|${m?.objectId || ''}`;
}

function v21CrossGroupMatchKey(m, cid = '') {
  const view = v21MatchedRequestView(m?.request || {}, m?.reasons || []);
  const raw = String(view.raw || m?.request?.raw || '').trim();
  const phone = v21CanonicalPhone(raw);
  const author = normalizeText(m?.requestSender || '');
  const requestTime = String(m?.requestTime || '');
  const dateMatch = requestTime.match(/^\d{4}-\d{2}-\d{2}/u);

  // If time is unknown, keep legacy identity to avoid over-deduplicating unrelated requests.
  if (!dateMatch) return v21LegacyMatchKey(m, cid);

  const day = dateMatch[0];
  const semantic = normalizeText(raw);
  const identity = phone || author || 'UNKNOWN';
  const digest = crypto
    .createHash('sha256')
    .update(`${day}|${identity}|${semantic}`)
    .digest('hex')
    .slice(0, 20);
  return `V21|${day}|${digest}|${m?.objectId || ''}`;
}

function requestMatchV21RealRequestsSelfTest() {
  const fail = (name, detail = '') => {
    throw new Error(`REQUEST MATCH V2.1 REAL SELFTEST ${name}${detail ? ': ' + detail : ''}`);
  };
  const fake = text => ({id:'v21-real', timestamp:Date.now(), text});

  let r = parseObservedMessage('Запрос 1к 2к пчо первая цена 89287783090');
  if (r.kind !== 'IGNORE' || r.reason !== 'FIRST_PRICE_RESELLER_IGNORE') fail('first-price-ignore', JSON.stringify(r));

  r = parseObservedMessage('Запрос студия Сказка Град до 3900. Ремонт');
  if (r.kind !== 'REQUEST' || !r.complexesV2?.includes('сказка град') || r.geoUnresolvedV2) fail('skazka-grad-parse', JSON.stringify(r));
  let o = parseObjectMessage(fake('Студия. ЧМР. 26 м2. 3 300 000 руб. ремонт.'));
  if (matchRequestToLiveObject(r, o).match) fail('skazka-grad-no-citywide-widen');
  o = parseObjectMessage(fake('Студия. ЖК Сказка Град. 26 м2. 3 300 000 руб. ремонт.'));
  if (!matchRequestToLiveObject(r, o).match) fail('skazka-grad-exact');

  r = parseObservedMessage('Запрос КП Крепость Дом от 4 соток. Павел 89050639449');
  if (r.kind !== 'REQUEST' || !r.complexesV2?.includes('кп крепость') || r.land?.min !== 4) fail('krepost-land-parse', JSON.stringify(r));
  o = parseObjectMessage(fake('КП Крепость. Дом 193 м2 / 3 сот. 5 200 000 руб.'));
  let v = matchRequestToLiveObject(r, o);
  if (v.match || v.reason !== 'LAND_MIN_MISS') fail('land-3-reject', JSON.stringify(v));
  o = parseObjectMessage(fake('КП Крепость. Дом 120 м2 / 4.5 сот. 5 200 000 руб.'));
  if (!matchRequestToLiveObject(r, o).match) fail('land-4_5-match');

  o = parseObjectMessage(fake('ЖК Самолет 6, Беличенко, 92к2. Студия. 22,4 м2. ПЧО. 3 250 000 руб.'));
  if (!o.types.includes('studio') || o.types.includes('2k')) fail('corpus-room-pollution', JSON.stringify(o.types));

  r = parseObservedMessage('Запрос студия музыкалка маленькие не предлагать до 3300 ремонт');
  if (r.kind !== 'REQUEST' || r.area?.min !== 25) fail('small-studio-min-25', JSON.stringify(r));
  o = parseObjectMessage(fake('Студия. Музыкальный. 21 м2. ремонт. 3 000 000 руб.'));
  if (matchRequestToLiveObject(r, o).match) fail('small-studio-21-reject');
  o = parseObjectMessage(fake('Студия. Музыкальный. 26 м2. ремонт. 3 000 000 руб.'));
  if (!matchRequestToLiveObject(r, o).match) fail('small-studio-26-match');

  r = parseObservedMessage('Запрос 3к ЖК Галактика с ремонтом мебелью техникой красивая 19 млн');
  if (r.kind !== 'REQUEST' || !r.conditions?.designerRepairRequiredV21) fail('designer-request', JSON.stringify(r));
  o = parseObjectMessage(fake('3к. ЖК Галактика. ремонт / мебель / техника. 100 м2. 18 000 000 руб.'));
  v = matchRequestToLiveObject(r, o);
  if (v.match || v.reason !== 'DESIGNER_REPAIR_UNCONFIRMED') fail('generic-repair-reject', JSON.stringify(v));
  o = parseObjectMessage(fake('3к. ЖК Галактика. дизайнерский ремонт, мебель, техника. 100 м2. 18 000 000 руб.'));
  if (!matchRequestToLiveObject(r, o).match) fail('designer-repair-match');

  r = parseObservedMessage('Запрос 1к любой район. Бюджет приоритет до 3500. Дороже тоже рассмотрим.');
  if (r.kind !== 'REQUEST' || r.preferredBudgetMaxV21 !== 3_500_000 || r.budgetMax !== 3_800_000) fail('priority-plus-300', JSON.stringify(r));
  o = parseObjectMessage(fake('1к квартира. 35 м2. 3 750 000 руб. ремонт.'));
  if (!matchRequestToLiveObject(r, o).match) fail('priority-3750-match');
  o = parseObjectMessage(fake('1к квартира. 35 м2. 3 850 000 руб. ремонт.'));
  if (matchRequestToLiveObject(r, o).match) fail('priority-3850-reject');

  const m1 = {
    request:{raw:'Запрос 2к ЖК Губернский ремонт до 7млн 89287783090'},
    reasons:['TYPE:HARD','COMPLEX'],
    requestSender:'Павел', requestTime:'2026-09-14T09:00:00.000Z', requestMessageId:'100', objectId:'obj-1',
  };
  const m2 = {...m1, requestMessageId:'900'};
  if (v21CrossGroupMatchKey(m1, '-group-1') !== v21CrossGroupMatchKey(m2, '-group-2')) fail('cross-group-same-day-dedup');
  const m3 = {...m2, requestTime:'2026-09-15T09:00:00.000Z'};
  if (v21CrossGroupMatchKey(m1, '-group-1') === v21CrossGroupMatchKey(m3, '-group-2')) fail('next-day-new-request');

  return 'REQUEST_MATCH_V21_REAL_REQUESTS_PASS';
}
