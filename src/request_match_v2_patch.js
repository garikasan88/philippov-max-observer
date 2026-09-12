// PHILIPPOV SCOUT REQUEST/MATCH V2 — HIGH PRECISION PATCH
// Built from real realtor request syntax + observed false-positive MATCHes.
// Principle: hard constraints fail closed; soft preferences never widen geography.

const __v1_parseRequest = parseRequest;
const __v1_parseObjectMessage = parseObjectMessage;
const __v1_parserSelfTest = parserSelfTest;
const __v1_objectMatchSelfTest = objectMatchSelfTest;

function v2Compact(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

function v2LooseIncludes(haystack, needle) {
  const h = normalizeText(haystack);
  const n = normalizeText(needle);
  if (!n) return false;
  return h.includes(n) || v2Compact(h).includes(v2Compact(n));
}

const V2_COMPLEX_ALIASES = Object.freeze({
  'самолет': ['самолет', 'самолеты', 'самолёт', 'самолёты'],
  'парк победы': ['парк победы'],
  'светлоград': ['светлоград'],
  'губернский': ['губернский', 'губер'],
  'абрикосово': ['абрикосово', 'абрикос'],
  'свобода': ['жк свобода', 'свобода'],
  'московский': ['жк московский'],
  'панорама': ['панорама'],
  'перспектива': ['перспектива'],
  'флотилия': ['флотилия'],
  'таурус': ['таурус', 'таурас'],
  'любимый дом': ['любимый дом'],
  'три кита': ['три кита'],
  'образцово': ['образцово', 'образцова'],
  'хорошая погода': ['хорошая погода'],
  'краски': ['жк краски', 'краски'],
  'дыхание': ['жк дыхание', 'дыхание'],
  'лайм': ['жк лайм', 'лайм'],
  'элегант': ['жк элегант', 'элегант'],
  'дом у озера': ['дом у озера'],
  'кино альфа': ['кино альфа', 'жк кино', 'жк альфа'],
  'мега': ['жк мега', 'мега победа'],
  'облака': ['жк облака', 'облака'],
  'друзья': ['жк друзья', 'друзья'],
  'сармат': ['жк сармат', 'сармат'],
  'зеленый театр': ['зеленый театр', 'зелёный театр'],
  'грани': ['жк грани', 'грани'],
  'догма парк': ['догма парк'],
  'видный': ['жк видный', 'видный'],
  'плодородный': ['плодородный'],
  'все свои': ['жк все свои', 'все свои'],
  'фонтаны': ['жк фонтаны', 'фонтаны'],
  'большой': ['жк большой', 'жк большом'],
  'одесский': ['жк одесский', 'одесский'],
  'небо': ['жк небо'],
  'рекорд': ['жк рекорд'],
  'каскад': ['жк каскад'],
  'лучший': ['жк лучший'],
  'достояние': ['жк достояние', 'достояние'],
  'мозаика': ['мозаика', 'мозайка'],
  'парусная регата': ['парусная регата'],
  'премьера': ['премьера'],
  'новые сезоны': ['новые сезоны'],
  'архитектор': ['жк архитектор', 'архитектор'],
  'олимп': ['жк олимп'],
  'ливада': ['жк ливада'],
  'южане': ['жк южане', 'южане'],
  'европея': ['европея', 'европа сити'],
  'гарантия': ['жк гарантия', 'гарантия'],
  'притяжение': ['жк притяжение', 'притяжение'],
  '6 квартал': ['жк 6 квартал', '6 квартал'],
  'акварели 2': ['акварели 2', 'акварели-2'],
});

const V2_GEO_ALIASES = Object.freeze({
  'фестивальный': ['фмр', 'фестивальный'],
  'черемушки': ['чмр', 'черемушки', 'черёмушки'],
  'гидрострой': ['гмр', 'гидрострой'],
  'комсомольский': ['кмр', 'комсомольский'],
  'пашковский': ['пмр', 'пашковский', 'пашковка'],
  'юбилейный': ['юмр', 'юбилейный', 'юбик'],
  'восточно-кругликовский': ['восточно кругликовский', 'восточно кругликовская', 'восточка', '40 лет победы'],
  'губернский': ['губернский', 'губер'],
  'западный обход': ['западный обход', 'зап обход'],
  'ближний западный обход': ['ближний западный обход'],
  'энка': ['энка', 'авиагородок', 'красная площадь'],
  'музыкальный': ['музыкальный', 'музыка'],
  'петра метальникова': ['петра метальникова', 'метальникова'],
  'центр': ['цмр', 'центр', 'старый центр'],
  'дубинка': ['дубинка'],
  'северный': ['северный'],
  'южный': ['южный', 'поселок южный', 'п южный'],
  'березовый': ['березовый', 'берёзовый'],
  'елизаветинская': ['елизаветинская', 'елизаветка'],
  'новая адыгея': ['новая адыгея'],
  'яблоновский': ['яблоновка', 'яблоновский'],
  'динская': ['динская'],
  'российский': ['поселок российский', 'п российский', 'российский'],
  'краснодарский': ['краснодарский'],
  'кирилла россинского': ['кирилла россинского', 'россинского'],
  'знаменский': ['знаменский'],
  'новознаменский': ['новознаменский'],
  'ростовское шоссе': ['ростовское шоссе', 'ростовка'],
  'ейское шоссе': ['ейское шоссе'],
  'парк галицкого': ['парк галицкого'],
  'зип': ['зип', 'зиповская'],
  'ккб': ['ккб', 'краевая клиническая больница'],
  'московский': ['микрорайон московский', 'мкр московский', 'жк московский'],
  'репина': ['репина', 'мкр репина'],
  'славянский': ['славянский'],
  'сельхоз': ['сельхоз', 'кубгау'],
  'кубгу': ['кубгу'],
  'караcунский': ['карасунский'],
  'немецкая деревня': ['немецкая деревня'],
  'цветочный рынок': ['цветочный рынок'],
  'молодежный': ['молодежный', 'молодёжный'],
});

const V2_STREET_ALIASES = Object.freeze({
  'восточно кругликовская': ['восточно кругликовская', 'восточнокругликовская'],
  'черкасская': ['черкасская'],
  'героя яцкова': ['героя яцкова', 'яцкова'],
  'героя аверкиева': ['героя аверкиева', 'аверкиева'],
  'героев разведчиков': ['героев разведчиков'],
  '40 лет победы': ['40 лет победы'],
  'трошева': ['трошева'],
  'домбайская': ['домбайская'],
  'посадского': ['посадского'],
  'московская': ['московская'],
  'зиповская': ['зиповская'],
  'ставропольская': ['ставропольская'],
  'сормовская': ['сормовская'],
  'тургенева': ['тургенева'],
  'гаражная': ['гаражная'],
  'дальняя': ['дальняя'],
  'гаврилова': ['гаврилова'],
  'дзержинского': ['дзержинского'],
  'морская': ['морская'],
  'рашпилевская': ['рашпилевская'],
  'красная': ['красная'],
  'калинина': ['калинина'],
  'кожевенная': ['кожевенная'],
  'байбакова': ['байбакова'],
  'жигуленко': ['жигуленко'],
  'парусная': ['парусная'],
  'автолюбителей': ['автолюбителей'],
  'рахманинова': ['рахманинова'],
  'заполярная': ['заполярная'],
  'казбекская': ['казбекская', 'козбекская'],
  'селезнева': ['селезнева', 'селезнёва'],
  'коммунаров': ['коммунаров'],
  'красных партизан': ['красных партизан'],
  'солнечная': ['солнечная'],
});

function v2ExtractByAlias(raw, table) {
  const out = [];
  for (const [canon, aliases] of Object.entries(table)) {
    if (aliases.some(a => v2LooseIncludes(raw, a))) out.push(canon);
  }
  return [...new Set(out)];
}

function v2ExtractComplexes(raw) {
  return v2ExtractByAlias(raw, V2_COMPLEX_ALIASES);
}

function v2ExtractGeo(raw) {
  const out = new Set(Array.isArray(detectGeoTerms(raw)) ? detectGeoTerms(raw) : []);
  for (const x of v2ExtractByAlias(raw, V2_GEO_ALIASES)) out.add(x);
  for (const x of v2ExtractByAlias(raw, V2_STREET_ALIASES)) out.add(`street:${x}`);
  return [...out];
}

function v2ExtractExcludedGeo(raw) {
  const n = normalizeText(raw);
  const out = new Set();
  const candidates = [
    ...Object.keys(V2_GEO_ALIASES).map(x => ({kind:'geo', canon:x, aliases:V2_GEO_ALIASES[x]})),
    ...Object.keys(V2_COMPLEX_ALIASES).map(x => ({kind:'complex', canon:x, aliases:V2_COMPLEX_ALIASES[x]})),
  ];
  for (const row of candidates) {
    for (const a of row.aliases) {
      const aa = normalizeText(a);
      const re1 = new RegExp(`(?:не|кроме)\\s+(?:жк\\s+)?${aa.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\b`, 'iu');
      const re2 = new RegExp(`${aa.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\s+(?:нет|не\\s+смотрим|не\\s+предлаг)`, 'iu');
      if (re1.test(n) || re2.test(n)) out.add(`${row.kind}:${row.canon}`);
    }
  }
  return [...out];
}

function v2ExtractAddressConstraints(raw) {
  const norm = normalizeText(raw);
  const out = [];
  for (const [street, aliases] of Object.entries(V2_STREET_ALIASES)) {
    for (const a of aliases) {
      const aa = normalizeText(a);
      const pos = norm.indexOf(aa);
      if (pos < 0) continue;
      const tail = norm.slice(pos + aa.length, pos + aa.length + 55);
      const houses = [];
      for (const m of tail.matchAll(/(?:дом(?:а)?\s*)?(\d{1,3}[а-яa-z]?)(?!\s*(?:млн|тыс|тр|этаж|м2|кв))/giu)) {
        const num = normalizeText(m[1]);
        if (Number.parseInt(num, 10) <= 300) houses.push(num);
      }
      out.push({street, houses:[...new Set(houses)]});
      break;
    }
  }
  return out;
}

function v2HasGeoCue(raw) {
  return /(?:\bжк\b|район|р-?н\b|мкр|микрорайон|локац|улиц|\bул\.?\s|привязк|рядом|ближе|вблизи|радиус|кубик|квадрат|от\s+[^\n]{2,30}\s+до\s+)/iu.test(raw) ||
    v2ExtractGeo(raw).length > 0 || v2ExtractComplexes(raw).length > 0;
}

function v2GeoMode(raw, geos, complexes, addresses) {
  const n = normalizeText(raw);
  if (/(?:любой\s+район|район\s+не\s+важ|местоположение\s+не\s+важ|смотрим\s+по\s+всему\s+городу)/iu.test(n)) return 'ANY';
  if (addresses.some(a => a.houses.length > 0)) return 'STRICT_ADDRESS';
  if (/(?:только\s+(?:этот|эта|эту|данный|данную)?\s*(?:жк|район|локац)|другие\s+не\s+(?:смотрим|предлаг)|рядом\s+не\s+предлаг|только\s+комсомольск|только\s+черемуш|только\s+гидрострой|только\s+фмр|только\s+кмр)/iu.test(n)) return 'STRICT';
  if (/(?:и\s+рядом|все\s+что\s+рядом|что\s*[- ]?то\s+рядом|ближайш|ближе\s+к|вблизи|радиус|пеш(?:ком|ая\s+доступ)|трамва|кубик|квадрат|от\s+[^\n]{2,30}\s+до\s+)/iu.test(n)) return 'NEARBY';
  if (geos.length || complexes.length) return 'ZONE';
  return 'NONE';
}

function v2TypeExclusions(raw) {
  const n = normalizeText(raw);
  const out = new Set();
  if (/(?:не\s+студи|студи[^\n]{0,12}не\s+предлаг|полноценн[^\n]{0,20}не\s+студи)/iu.test(n)) out.add('studio');
  if (/(?:евро\s*2|евродв)[^\n]{0,20}(?:не\s+предлаг|не\s+рассматри)|(?:не\s+евро\s*2)/iu.test(n)) out.add('euro2');
  if (/(?:евро\s*3|евротр)[^\n]{0,20}(?:не\s+предлаг|не\s+рассматри)/iu.test(n)) out.add('euro3');
  if (/коммерц[^\n]{0,20}не\s+предлаг/iu.test(n)) out.add('commercial');
  return [...out];
}

function v2LooksMultiRequest(raw) {
  const n = String(raw || '');
  const explicit = (n.match(/(?:^|\n|[.;])\s*(?:\d+[.)]|[12]\s*запрос\b)/giu) || []).length;
  const repeated = (n.match(/\bзапрос\b/giu) || []).length;
  return explicit >= 2 || repeated >= 2;
}

function v2YearConstraint(raw) {
  const n = normalizeText(raw);
  let minYear = null;
  let m = n.match(/(?:дом(?:а|е)?\s+)?от\s+(19\d{2}|20\d{2})/iu);
  if (m) minYear = Number(m[1]);
  m = n.match(/(?:не\s+старше|дом\s+не\s+старше)\s+(\d{1,2})\s+лет/iu);
  const maxAgeYears = m ? Number(m[1]) : null;
  const noOldFund = /(?:не\s+старый\s+фонд|старый\s+фонд\s+нет|хрущ[^\n]{0,10}(?:нет|не\s+предлаг)|свеж(?:ий|ие)\s+дом|современн(?:ый|ые)\s+дом)/iu.test(n);
  return {minYear,maxAgeYears,noOldFund};
}

parseRequest = function requestMatchV2ParseRequest(text) {
  const base = __v1_parseRequest(text);
  if (!base || base.kind !== 'REQUEST') return base;
  const raw = String(text || '');

  if (v2LooksMultiRequest(raw)) {
    return {kind:'IGNORE', reason:'MULTI_REQUEST_UNSPLIT', raw, norm:normalizeText(raw)};
  }

  const excludedTypes = v2TypeExclusions(raw);
  base.types = (base.types || []).filter(t => !excludedTypes.includes(t));
  base.excludedTypesV2 = excludedTypes;

  const geos = v2ExtractGeo(raw);
  const complexes = v2ExtractComplexes(raw);
  const addresses = v2ExtractAddressConstraints(raw);
  const mode = v2GeoMode(raw, geos, complexes, addresses);
  const geoCue = v2HasGeoCue(raw);

  base.geoV2 = geos;
  base.complexesV2 = complexes;
  base.addressesV2 = addresses;
  base.excludedGeoV2 = v2ExtractExcludedGeo(raw);
  base.geoModeV2 = mode;
  base.geoMentionedV2 = geoCue;
  base.geoUnresolvedV2 = geoCue && mode !== 'ANY' && !geos.length && !complexes.length && !addresses.length;
  base.yearV2 = v2YearConstraint(raw);
  base.hardV2 = {
    strictGeo: ['STRICT','STRICT_ADDRESS'].includes(mode),
    exactComplex: base.exactJkOnly === true || /(?:только\s+(?:этот\s+)?жк|только\s+жк|другие\s+жк\s+не|рядом\s+не\s+предлаг)/iu.test(raw),
    noAdvertising: base.noAdvertising === true,
    exclusiveOnly: base.exclusiveOnly === true,
  };
  return base;
};

function v2ObjectYear(raw) {
  const n = normalizeText(raw);
  const years = [...n.matchAll(/\b((?:19|20)\d{2})\b/gu)].map(m => Number(m[1])).filter(y => y >= 1950 && y <= new Date().getFullYear()+2);
  return years.length ? Math.max(...years) : null;
}

parseObjectMessage = function requestMatchV2ParseObject(m) {
  const obj = __v1_parseObjectMessage(m);
  if (!obj) return obj;
  const raw = obj.sourceText || '';
  obj.geoV2 = v2ExtractGeo(raw);
  obj.complexesV2 = v2ExtractComplexes(raw);
  obj.addressesV2 = v2ExtractAddressConstraints(raw);
  obj.buildYearV2 = v2ObjectYear(raw);
  obj.oldFundV2 = /(?:старый\s+фонд|хрущ|сталин)/iu.test(raw) ? true :
    (obj.buildYearV2 != null ? obj.buildYearV2 < 2000 : null);
  obj.brickV2 = /(?:монолит\s*[- ]?кирпич|кирпич)/iu.test(raw);
  obj.panelV2 = /панел/iu.test(raw);
  obj.balconyV2 = /балкон|лоджи/iu.test(raw);
  obj.separateBathroomV2 = /раздельн[^\n]{0,12}(?:сануз|с\/у)/iu.test(raw);
  obj.elevatorV2 = /лифт/iu.test(raw) ? !/без\s+лифт/iu.test(raw) : null;
  obj.exclusiveV2 = /(?:эксклюзив|\bэкс\b|эксы)/iu.test(raw) ? true : null;
  return obj;
};

function v2ObjectMatchesToken(obj, token) {
  const corpus = `${obj.sourceText || ''} ${obj.norm || ''} ${obj.routeCorpus || ''}`;
  if (token.startsWith('street:')) return v2LooseIncludes(corpus, token.slice(7));
  const aliases = V2_GEO_ALIASES[token] || GEO_ALIASES[token] || [token];
  return aliases.some(a => v2LooseIncludes(corpus, a));
}

function v2ObjectMatchesComplex(obj, complex) {
  const corpus = `${obj.sourceText || ''} ${obj.norm || ''}`;
  return (V2_COMPLEX_ALIASES[complex] || [complex]).some(a => v2LooseIncludes(corpus, a));
}

function v2AddressMatches(req, obj) {
  if (!req.addressesV2?.length) return true;
  for (const ra of req.addressesV2) {
    const candidates = obj.addressesV2 || [];
    for (const oa of candidates) {
      if (oa.street !== ra.street) continue;
      if (!ra.houses.length) return true;
      if (oa.houses.some(h => ra.houses.includes(h))) return true;
    }
    if (!ra.houses.length && v2LooseIncludes(obj.sourceText || '', ra.street)) return true;
  }
  return false;
}

function v2ExcludedGeoHit(req, obj) {
  for (const token of req.excludedGeoV2 || []) {
    const [kind, canon] = token.split(':');
    if (kind === 'geo' && v2ObjectMatchesToken(obj, canon)) return token;
    if (kind === 'complex' && v2ObjectMatchesComplex(obj, canon)) return token;
  }
  return null;
}

function matchRequestToLiveObject(req, obj) {
  const reasons = [];
  const fail = reason => ({match:false, reason, reasons});

  if (!req || req.kind !== 'REQUEST') return fail('NOT_REQUEST');
  if (req.geoUnresolvedV2) return fail('GEO_UNRESOLVED_FAIL_CLOSED');

  if (req.excludedTypesV2?.some(t => obj.types?.includes(t))) return fail('TYPE_EXCLUDED');
  if (req.types?.length && !req.types.some(t => obj.types.includes(t) || (t === 'ground-format' && obj.types.includes('house')))) return fail('TYPE_MISS');
  reasons.push('TYPE:HARD');

  const excludedGeo = v2ExcludedGeoHit(req, obj);
  if (excludedGeo) return fail(`GEO_EXCLUDED:${excludedGeo}`);

  if (req.complexesV2?.length) {
    const complexHit = req.complexesV2.some(c => v2ObjectMatchesComplex(obj, c));
    if (!complexHit) return fail('COMPLEX_MISS');
    reasons.push(req.hardV2?.exactComplex ? 'COMPLEX:EXACT' : 'COMPLEX');
  }

  if (req.geoModeV2 === 'STRICT_ADDRESS') {
    if (!v2AddressMatches(req, obj)) return fail('ADDRESS_MISS');
    reasons.push('GEO:STRICT_ADDRESS');
  } else if (req.geoModeV2 !== 'ANY' && req.geoV2?.length) {
    if (!req.geoV2.some(g => v2ObjectMatchesToken(obj, g))) return fail('GEO_MISS');
    reasons.push(`GEO:${req.geoModeV2 || 'ZONE'}`);
  } else if (req.geoModeV2 === 'ANY') {
    reasons.push('GEO:ANY');
  }

  let budget = req.budgetMax;
  const tb = obj.types.map(t => req.typeBudgets?.[t]).filter(Number.isFinite);
  if (tb.length) budget = Math.max(...tb);
  if (budget != null && req.commission?.inside && req.commission?.amount) budget -= req.commission.amount;
  if (budget != null && obj.price > budget) return fail('PRICE_MISS');
  if (budget != null) reasons.push('PRICE:HARD');

  if (req.area?.min != null && (obj.area == null || obj.area < req.area.min)) return fail('AREA_MIN_MISS');
  if (req.area?.max != null && (obj.area == null || obj.area > req.area.max)) return fail('AREA_MAX_MISS');
  if (req.area?.min != null || req.area?.max != null) reasons.push('AREA:HARD');

  if (req.floor?.min != null && (obj.floor == null || obj.floor < req.floor.min)) return fail('FLOOR_MIN_MISS');
  if (req.floor?.max != null && (obj.floor == null || obj.floor > req.floor.max)) return fail('FLOOR_MAX_MISS');
  if (req.floor?.excludeFirst && obj.floor === 1) return fail('FIRST_FLOOR_EXCLUDED');
  if (req.floor?.excludeLast && obj.floor != null && obj.totalFloors != null && obj.floor === obj.totalFloors) return fail('LAST_FLOOR_EXCLUDED');

  const c = req.conditions || {};
  if (c.pchoRequired && !obj.pcho) return fail('PCHO_REQUIRED');
  if (c.pchoExcluded && obj.pcho) return fail('PCHO_EXCLUDED');
  if (c.repairRequired && !obj.repair) return fail('REPAIR_REQUIRED');
  if (c.goodRepair && !obj.repair) return fail('GOOD_REPAIR_REQUIRED');
  if (c.freshRepair && !obj.freshRepair) return fail('FRESH_REPAIR_REQUIRED');
  if (c.furnitureRequired && !obj.furniture) return fail('FURNITURE_REQUIRED');
  if (c.appliancesRequired && !obj.appliances) return fail('APPLIANCES_REQUIRED');
  if (c.gasRequired && !obj.gas) return fail('GAS_REQUIRED');
  if (c.courtyardWindows && !obj.courtyardWindows) return fail('COURTYARD_WINDOWS_REQUIRED');
  if (c.centralHeating && !obj.centralHeating) return fail('CENTRAL_HEATING_REQUIRED');

  const y = req.yearV2 || {};
  if (y.minYear != null) {
    if (obj.buildYearV2 == null) return fail('BUILD_YEAR_UNCONFIRMED');
    if (obj.buildYearV2 < y.minYear) return fail('BUILD_YEAR_MISS');
  }
  if (y.maxAgeYears != null) {
    if (obj.buildYearV2 == null) return fail('BUILD_YEAR_UNCONFIRMED');
    if (new Date().getFullYear() - obj.buildYearV2 > y.maxAgeYears) return fail('BUILD_AGE_MISS');
  }
  if (y.noOldFund) {
    if (obj.oldFundV2 == null) return fail('OLD_FUND_STATUS_UNCONFIRMED');
    if (obj.oldFundV2) return fail('OLD_FUND_EXCLUDED');
  }

  if (req.noAdvertising && !obj.offMarket) return fail('OFF_MARKET_UNCONFIRMED');
  if (req.exclusiveOnly && obj.exclusiveV2 !== true) return fail('EXCLUSIVE_UNCONFIRMED');

  return {match:true, reason:'MATCH_V2', reasons, matchClass:'A'};
}

function requestMatchV2SelfTest() {
  const fail = (name, detail='') => { throw new Error(`REQUEST MATCH V2 SELFTEST ${name}${detail ? ': '+detail : ''}`); };
  const fake = text => ({id:'x', timestamp:Date.now(), text});

  let r = parseObservedMessage('Запрос 1к ул. ВосточноКругликовская, 46А, 46Б. До 6 млн.');
  if (r.kind !== 'REQUEST' || r.geoModeV2 !== 'STRICT_ADDRESS') fail('glued-east-parse', JSON.stringify(r));
  let o = parseObjectMessage(fake('1к квартира. ЖК Самолет. Западный обход. 45 м2. 5 500 000 руб. ремонт.'));
  if (matchRequestToLiveObject(r,o).match) fail('glued-east-vs-samolet');

  o = parseObjectMessage(fake('1к квартира. ул. Восточно-Кругликовская 46А. 45 м2. 5 500 000 руб. ремонт.'));
  if (!matchRequestToLiveObject(r,o).match) fail('glued-east-exact-house');

  r = parseObservedMessage('Запрос студия Западный обход ЖК Светлоград до 4 млн');
  o = parseObjectMessage(fake('Студия. ЧМР. 28 м2. 3 900 000 руб. ремонт.'));
  if (matchRequestToLiveObject(r,o).match) fail('west-vs-chmr');
  o = parseObjectMessage(fake('Студия. ЖК Светлоград. Западный обход. 28 м2. 3 900 000 руб. ремонт.'));
  if (!matchRequestToLiveObject(r,o).match) fail('west-svetlograd-good');

  r = parseObservedMessage('Запрос 1к до 5,5 млн. Не Адыгея, не Знаменский, не Российский.');
  o = parseObjectMessage(fake('1к квартира. Новая Адыгея. 35 м2. 5 000 000 руб.'));
  if (matchRequestToLiveObject(r,o).match) fail('excluded-adygea');

  r = parseObservedMessage('Запрос 2 комнатная Метальникова до 7 млн. Евро 2 не предлагать.');
  o = parseObjectMessage(fake('Евро-2. Петра Метальникова. 50 м2. 6 500 000 руб. ремонт.'));
  if (matchRequestToLiveObject(r,o).match) fail('euro2-excluded');

  r = parseObservedMessage('ЗАПРОС ЯБЛОНОВКА ДОМ от 100 м2, до 12 млн, с ремонтом.');
  o = parseObjectMessage(fake('Дом Яблоновский. 34 м2. 3 800 000 руб. ремонт.'));
  if (matchRequestToLiveObject(r,o).match) fail('house-area-34');

  r = parseObservedMessage('1) Запрос студия Губернский до 4 млн. 2) Запрос студия Западный обход до 3,6 млн.');
  if (r.kind !== 'IGNORE' || r.reason !== 'MULTI_REQUEST_UNSPLIT') fail('multi-request');

  r = parseObservedMessage('Запрос 1к с ремонтом, район любой, до 4 млн.');
  if (r.kind !== 'REQUEST' || r.geoModeV2 !== 'ANY') fail('any-area');

  r = parseObservedMessage('Запрос 2к ЖК Абрикос, без ремонта, только этот ЖК, до 7 млн.');
  o = parseObjectMessage(fake('2к квартира ЖК Губернский 60 м2 6 500 000 руб. без ремонта'));
  if (matchRequestToLiveObject(r,o).match) fail('exact-complex-miss');

  return 'REQUEST_MATCH_V2_HIGH_PRECISION_PASS';
}

parserSelfTest = function parserSelfTestV2Wrapper() {
  const base = __v1_parserSelfTest();
  const v2 = requestMatchV2SelfTest();
  return `${base} / ${v2}`;
};

objectMatchSelfTest = function objectMatchSelfTestV2Wrapper() {
  const base = __v1_objectMatchSelfTest();
  return `${base} / V2_PATCH_ACTIVE`;
};
