# PHILIPPOV SCOUT — REQUEST / MATCH CURRENT CHECKPOINT

DATE: 2026-09-14
STATUS: PASS for Request/MATCH V2.1 real-request hardening in self-test + isolated live shadow

## WHY THE 2026-09-12 PASS WAS REOPENED

Fresh production evidence on 2026-09-14 exposed false-positive MATCH behavior:

- unknown named geography could silently widen instead of failing closed;
- `Дом от 4 соток` was not reliably enforced as a land-area hard constraint;
- address corpus notation such as `92к2` could pollute room type and make a studio look like `2k`;
- the same realtor request reposted in multiple observed groups could create duplicate MATCH/NextAction identities.

This is valid new evidence, so the earlier PASS was reopened only for the defective Request/MATCH scope. Existing NextAction hardening and unrelated Observer architecture were preserved.

## CURRENT PRODUCTION SCOPE

Inbound chain:

Request Source → Request Ingestion → Parser → Request → MATCH → Candidate → Dedup → Notification → NextAction → Audit/Event

Current MAX request groups:

- ЗАПРОСЫ — chat_id `-70193851621530`
- Запросы Краснодар — chat_id `-69236834721964`

Object source:

- Мои объекты — stable chat_id `-75607874388089`
- latest confirmed isolated live-shadow source: 40 messages / 35 parsed objects

Sensor account checkpoint:

- user_id `140053596`

## REAL-REQUEST BUSINESS RULES CONFIRMED 2026-09-14

- `первая цена / первые цены` → IGNORE for now; these are treated as reseller/buyout demand outside the target workflow.
- `маленькие не предлагать` for studio → operational minimum `25 m²`; this is a working market-derived threshold, not a permanent ontology constant.
- `приоритет до X, дороже тоже рассмотрим` → temporary hard ceiling `X + 300 000 ₽`.
- `шикарная / красивая / адекватный ремонт` → interpreted as designer renovation; generic `ремонт / мебель / техника` does not prove this and therefore fails closed.
- same person can repost the same request in multiple request groups; cross-group semantic dedup is required. Current rule suppresses same-day semantic duplicates for the same object while allowing a repeat on a later day to become a new request.

## V2.1 REAL-REQUEST HARDENING

Current head used by the final verified self-test/live shadow:

`34bdeee3a523ea84603a5e702182c3a2257b727e`

Added/wired:

- `src/request_match_v21_real_requests_hotfix.js`
- `src/request_match_v21_regex_fix.js`
- `src/request_match_v21_production_overlay.py`

Implemented:

- exact named aliases for current real-request evidence: `Сказка Град`, `КП Крепость`;
- unknown named geography fails closed instead of becoming `GEO=NONE`;
- `Дом от 4 соток` parses and enforces `land.min=4`;
- object land area is extracted and checked as HARD; unknown land area cannot satisfy an explicit land minimum;
- `92к2` / corpus notation is removed from room-type classification so it cannot create a false `2k` type;
- studio `маленькие не предлагать` applies `area.min=25`;
- first-price requests are ignored with `FIRST_PRICE_RESELLER_IGNORE`;
- priority budget widening is limited to `+300 000 ₽`;
- designer-renovation language is HARD and generic repair does not satisfy it;
- `не первая очередь` is HARD and fails closed if phase is unconfirmed;
- explicit `214-ФЗ` is HARD and fails closed if the object does not confirm it;
- cross-group semantic MATCH key uses normalized matched request + phone/author identity + calendar day + object ID;
- legacy group/message/object dedup keys are retained alongside new semantic keys for backward compatibility.

## REGRESSION SELF-TEST

Workflow run: `34875610795`
Job: `104081922466`
Conclusion: SUCCESS

Confirmed:

- `61_CASE_RULESET_CORE_PASS`
- `PORT_PASS`
- `REQUEST_MATCH_V2_HIGH_PRECISION_PASS`
- `REQUEST_MATCH_V21_MULTI_SPLIT_PASS`
- `V21_MATCH_VIEW_PASS`
- `MVP_SCOPE_FILTER_PASS`
- `OBJECT_MATCH_DRY_PASS`
- `OBJECT_TYPE_BROAD_PASS`
- `REQUEST_MATCH_V21_REAL_REQUESTS_PASS`
- `NEXT_ACTION_LIFECYCLE_PASS`
- `REQUEST MATCH V2/V2.1 ONE-SHOT: PASS`
- `PRODUCTION MATCH + V2.1 REAL REQUEST + NEXT ACTION HARDENING: PASS`

The real-request regression set explicitly checks:

- first-price ignore;
- exact `Сказка Град` without citywide widening;
- `КП Крепость` + land minimum 4 sot;
- 3-sot rejection and 4.5-sot acceptance;
- `92к2` studio does not become `2k`;
- studio 21 m² rejected and 26 m² accepted for `маленькие не предлагать`;
- generic repair rejected where designer repair was requested;
- explicit designer repair accepted;
- priority 3.5m allows 3.75m but rejects 3.85m under the temporary +300k rule;
- same-day same semantic request across different groups deduplicates;
- next-day repeat remains a new request.

## ISOLATED LIVE SHADOW

Workflow run: `34875610798`
Job: `104081923311`
Conclusion: SUCCESS

### Group ЗАПРОСЫ

- MAX login PASS as Светлана, user_id `140053596`;
- object source: 40 messages / 35 parsed objects;
- within 24h: 6 current requests;
- `FIRST_PRICE_RESELLER_IGNORE`: 2;
- `BUYOUT_MESSAGE`: 1;
- live MATCH: 0;
- reject counts: `COMPLEX_MISS=32`, `TYPE_MISS=163`, `PRICE_MISS=2`, `GEO_MISS=13`.

### Group Запросы Краснодар

- MAX login PASS as Светлана, user_id `140053596`;
- object source: 40 messages / 35 parsed objects;
- within 24h: 15 current requests;
- `FIRST_PRICE_RESELLER_IGNORE`: 2;
- `MULTI_REQUEST_SPLIT_V21`: 1;
- live MATCH: 0;
- reject counts include:
  - `TYPE_MISS=383`;
  - `GEO_UNRESOLVED_FAIL_CLOSED=35`;
  - `MULTI_REQUEST_NO_MATCH=35`;
  - `COMPLEX_MISS=32`;
  - `PRICE_MISS=7`;
  - `AREA_MIN_MISS=1`;
  - `GEO_MISS=32`.

Both groups completed successfully. Shadow mode made no MATCH notifications.

## PRODUCTION SAFETY DURING HARDENING

A production run occurred during development before the final regex fixes:

- run `34875191619`;
- job `104080525673`;
- conclusion SUCCESS;
- both request groups produced `live=0`, `new=0`, `send=0`;
- remembered dedup keys: 121.

Therefore the intermediate defective revisions did not emit a false MATCH notification during that run.

Production workflow is wired to apply:

1. existing NextAction lifecycle overlay;
2. V2.1 real-request production overlay;
3. real-request JS hardening + Cyrillic-safe regex fixes.

Static production-wiring verification is PASS.

## EXISTING NEXTACTION HARDENING PRESERVED

Still preserved without regression:

- stable NextAction IDs (`NA-XXXXXXXX`);
- lifecycle: OPEN → IN_PROGRESS → DONE / REJECTED, explicit reopen to OPEN;
- strict control-command parsing;
- control self-filter;
- persisted privacy rule: realtor/request-author name remains display-only and is not stored inside persisted NextAction state;
- Audit/Event creation/status-change records;
- notification flood guard;
- per-delivery state checkpointing.

## LIMITS / UNKNOWN

Final production execution at head `34bdeee3a523ea84603a5e702182c3a2257b727e` is NOT YET ESTABLISHED.

Therefore do not claim a final natural production-event PASS for this head until the production sensor actually runs that revision.

Also still NOT YET ESTABLISHED end-to-end on a genuine new natural MATCH:

Real new MATCH → real NextAction → Igor sends lifecycle command in MAX → state transition → confirmation back in MAX.

Delivery is not claimed to be mathematically exactly-once.

`25 m²` for `маленькие не предлагать` is an operational working threshold and may be revised from future realtor feedback/evidence.

## CURRENT VERDICT

REQUEST/MATCH V2.1 REAL-REQUEST HARDENING:

PASS — REGRESSION SELF-TEST
PASS — ISOLATED LIVE SHADOW
PASS — PRODUCTION WIRING

FINAL NATURAL PRODUCTION EVENT ON CURRENT HEAD:

НЕ УСТАНОВЛЕНО

Do not reopen the passed hardening scope without new evidence, a detected defect, an external change, or an explicit decision.
