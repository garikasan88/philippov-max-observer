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

const __v2GeoModeBase = v2GeoMode;
v2GeoMode = function v2GeoModeHotfix(raw, geos, complexes, addresses) {
  const n = normalizeText(raw);
  if (/(?:любой\s+район|район\s+любой)/iu.test(n)) return 'ANY';
  return __v2GeoModeBase(raw, geos, complexes, addresses);
};

const __v2ParseRequestBase = parseRequest;
parseRequest = function v2ParseRequestHotfix(text) {
  const out = __v2ParseRequestBase(text);
  if (out?.kind === 'REQUEST' && /(?:любой\s+район|район\s+любой)/iu.test(normalizeText(text))) {
    out.geoModeV2 = 'ANY';
    out.geoMentionedV2 = true;
    out.geoUnresolvedV2 = false;
    if (out.hardV2) out.hardV2.strictGeo = false;
  }
  return out;
};

// -----------------------------------------------------------------------------
// V2.1 MULTI-REQUEST SPLITTER
// Realtor chats often contain two or more independent client requests in one
// message. V2 deliberately rejected such containers to prevent criteria from
// leaking between clients. V2.1 keeps that fail-closed principle, but splits
// only on strong explicit boundaries and matches every sub-request separately.
// -----------------------------------------------------------------------------

function v21CleanSegment(value) {
  return String(value || '')
    .replace(/^\s*(?:[-–—•*]+\s*)+/u, '')
    .replace(/^\s*\d{1,2}\s*[.)-]\s*/u, '')
    .replace(/^\s*(?:запрос)\s*(?:№\s*)?\d{0,2}\s*[:.)-]?\s*/iu, 'Запрос ')
    .trim();
}

function v21NumberedSplit(raw) {
  const src = String(raw || '').replace(/\r\n?/g, '\n');
  const marker = /(?:^|\n|[;]\s*)\s*(\d{1,2})\s*[.)-]\s*/gmu;
  const hits = [...src.matchAll(marker)];
  if (hits.length < 2) return [];

  const out = [];
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index + hits[i][0].length;
    const end = i + 1 < hits.length ? hits[i + 1].index : src.length;
    const seg = v21CleanSegment(src.slice(start, end));
    if (seg) out.push(seg);
  }
  return out;
}

function v21RequestAnchorSplit(raw) {
  const src = String(raw || '').replace(/\r\n?/g, '\n');
  // Strong boundary only: start of message/line, semicolon, or sentence boundary.
  // This avoids splitting ordinary prose merely because the word "запрос" repeats.
  const re = /(?:^|\n|;|[.!?]\s+)\s*(?:\d{1,2}\s*[.)-]\s*)?(запрос(?:\s*№?\s*\d{1,2})?\s*[:.)-]?)/gimu;
  const hits = [...src.matchAll(re)].map(m => ({
    start: m.index + m[0].indexOf(m[1]),
  }));
  if (hits.length < 2) return [];

  const out = [];
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].start;
    const end = i + 1 < hits.length ? hits[i + 1].start : src.length;
    const seg = v21CleanSegment(src.slice(start, end));
    if (seg) out.push(seg);
  }
  return out;
}

function v21SplitMultiRequest(raw) {
  const numbered = v21NumberedSplit(raw);
  const anchored = v21RequestAnchorSplit(raw);

  let parts = anchored.length >= 2 ? anchored : numbered;
  if (parts.length < 2 || parts.length > 10) return [];

  parts = parts
    .map(v21CleanSegment)
    .filter(x => x.length >= 8)
    .map(x => /запрос/iu.test(x) ? x : `Запрос ${x}`);

  return parts.length >= 2 ? parts : [];
}

const __v21ParseObservedMessageBase = parseObservedMessage;
parseObservedMessage = function requestMatchV21ParseObservedMessage(text) {
  const base = __v21ParseObservedMessageBase(text);
  const parts = v21SplitMultiRequest(text);

  // No strong split boundary: preserve V2 behavior exactly.
  if (parts.length < 2) return base;

  const parsedParts = parts.map((raw, index) => ({
    index: index + 1,
    raw,
    parsed: __v21ParseObservedMessageBase(raw),
  }));

  const valid = parsedParts.filter(x => x.parsed?.kind === 'REQUEST');
  if (!valid.length) return base;

  return {
    kind: 'REQUEST',
    reason: 'MULTI_REQUEST_SPLIT_V21',
    raw: String(text || ''),
    norm: normalizeText(text),
    multiRequestV21: true,
    subRequestsV21: valid,
    splitTotalV21: parsedParts.length,
    splitValidV21: valid.length,
    splitRejectedV21: parsedParts.length - valid.length,
  };
};

const __v21MatchRequestToLiveObjectBase = matchRequestToLiveObject;
matchRequestToLiveObject = function requestMatchV21Match(req, obj) {
  if (!req?.multiRequestV21 || !Array.isArray(req.subRequestsV21)) {
    return __v21MatchRequestToLiveObjectBase(req, obj);
  }

  const rejectCounts = {};
  for (const row of req.subRequestsV21) {
    const verdict = __v21MatchRequestToLiveObjectBase(row.parsed, obj);
    if (verdict.match) {
      return {
        ...verdict,
        reason: 'MATCH_V21_SUBREQUEST',
        reasons: [`SUBREQUEST:${row.index}`, ...(verdict.reasons || [])],
        matchedSubRequestIndexV21: row.index,
        matchedSubRequestV21: row.parsed,
      };
    }
    const key = verdict.reason || 'UNKNOWN';
    rejectCounts[key] = (rejectCounts[key] || 0) + 1;
  }

  return {
    match: false,
    reason: 'MULTI_REQUEST_NO_MATCH',
    reasons: [],
    subRejectCountsV21: rejectCounts,
  };
};

function requestMatchV21SelfTest() {
  const fail = (name, detail = '') => {
    throw new Error(`REQUEST MATCH V2.1 SELFTEST ${name}${detail ? ': ' + detail : ''}`);
  };
  const fake = text => ({id:'v21', timestamp:Date.now(), text});

  let r = parseObservedMessage(
    '1) Запрос студия Губернский до 4 млн.\n2) Запрос студия Западный обход до 3,6 млн.'
  );
  if (r.kind !== 'REQUEST' || !r.multiRequestV21 || r.subRequestsV21.length !== 2) {
    fail('numbered-split', JSON.stringify(r));
  }

  let o = parseObjectMessage(fake('Студия. Губернский. 28 м2. 3 900 000 руб. ремонт.'));
  let v = matchRequestToLiveObject(r, o);
  if (!v.match || v.matchedSubRequestIndexV21 !== 1) fail('numbered-first-match', JSON.stringify(v));

  o = parseObjectMessage(fake('Студия. Западный обход. 28 м2. 3 500 000 руб. ремонт.'));
  v = matchRequestToLiveObject(r, o);
  if (!v.match || v.matchedSubRequestIndexV21 !== 2) fail('numbered-second-match', JSON.stringify(v));

  o = parseObjectMessage(fake('Студия. ЧМР. 28 м2. 3 500 000 руб. ремонт.'));
  if (matchRequestToLiveObject(r, o).match) fail('numbered-foreign-geo');

  r = parseObservedMessage(
    'Запрос: 1к ФМР до 6 млн\nЗапрос: 2к ГМР до 8 млн'
  );
  if (r.kind !== 'REQUEST' || !r.multiRequestV21 || r.subRequestsV21.length !== 2) {
    fail('anchor-split', JSON.stringify(r));
  }

  o = parseObjectMessage(fake('2к квартира. ГМР. 55 м2. 7 700 000 руб. ремонт.'));
  v = matchRequestToLiveObject(r, o);
  if (!v.match || v.matchedSubRequestIndexV21 !== 2) fail('anchor-second-match', JSON.stringify(v));

  const single = parseObservedMessage('Запрос 1к ФМР до 6 млн');
  if (single.kind !== 'REQUEST' || single.multiRequestV21) fail('single-regression', JSON.stringify(single));

  return 'REQUEST_MATCH_V21_MULTI_SPLIT_PASS';
}

const __v21ParserSelfTestBase = parserSelfTest;
parserSelfTest = function parserSelfTestV21Wrapper() {
  // Preserve the frozen V2 regression contract while running its own tests.
  // V2.1 behavior is verified immediately afterwards by its dedicated tests.
  const activeParseObservedMessage = parseObservedMessage;
  let base;
  try {
    parseObservedMessage = __v21ParseObservedMessageBase;
    base = __v21ParserSelfTestBase();
  } finally {
    parseObservedMessage = activeParseObservedMessage;
  }
  const v21 = requestMatchV21SelfTest();
  return `${base} / ${v21}`;
};
