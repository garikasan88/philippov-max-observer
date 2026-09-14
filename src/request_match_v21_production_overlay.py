from __future__ import annotations


def _replace_once(src: str, old: str, new: str, label: str) -> str:
    count = src.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one marker, got {count}")
    return src.replace(old, new, 1)


def apply_request_match_v21_production_overlay(src: str) -> str:
    """Wire real-request V2.1 hardening into the frozen production builder.

    This overlay runs after next_action_lifecycle_overlay and deliberately changes only:
    - loading the V2.1 real-request JS hardening layers;
    - cross-group same-day semantic MATCH dedup, while retaining legacy keys for compatibility.
    """

    cmd_old = '''          python3 - "$SRC" "$WORKDIR" "$GITHUB_WORKSPACE/src/request_match_v2_patch.js" "$GITHUB_WORKSPACE/src/request_match_v2_hotfix.js" <<'PY' '''.rstrip()
    cmd_new = '''          python3 - "$SRC" "$WORKDIR" "$GITHUB_WORKSPACE/src/request_match_v2_patch.js" "$GITHUB_WORKSPACE/src/request_match_v2_hotfix.js" "$GITHUB_WORKSPACE/src/request_match_v21_real_requests_hotfix.js" "$GITHUB_WORKSPACE/src/request_match_v21_regex_fix.js" <<'PY' '''.rstrip()
    src = _replace_once(src, cmd_old, cmd_new, "V21_REAL_JS_ARG")

    paths_old = '''          patch_path = Path(sys.argv[3])
          hotfix_path = Path(sys.argv[4])
          src = src_path.read_text(encoding="utf-8")
          patch = patch_path.read_text(encoding="utf-8")
          hotfix = hotfix_path.read_text(encoding="utf-8")'''
    paths_new = '''          patch_path = Path(sys.argv[3])
          hotfix_path = Path(sys.argv[4])
          real_hotfix_path = Path(sys.argv[5])
          regex_fix_path = Path(sys.argv[6])
          src = src_path.read_text(encoding="utf-8")
          patch = patch_path.read_text(encoding="utf-8")
          hotfix = hotfix_path.read_text(encoding="utf-8")
          real_hotfix = real_hotfix_path.read_text(encoding="utf-8")
          regex_fix = regex_fix_path.read_text(encoding="utf-8")'''
    src = _replace_once(src, paths_old, paths_new, "V21_REAL_JS_READ")

    inject_old = '''          base = base.replace(main_marker, "\\n" + patch + "\\n" + hotfix + "\\n" + main_marker, 1)'''
    inject_new = '''          base = base.replace(main_marker, "\\n" + patch + "\\n" + hotfix + "\\n" + real_hotfix + "\\n" + regex_fix + "\\n" + main_marker, 1)'''
    src = _replace_once(src, inject_old, inject_new, "V21_REAL_JS_INJECT")

    dedup_old = r'''              const notifyCandidates = liveMatches.filter(m => {
                const key = `${cid}|${m.requestMessageId}|${m.objectId}`;
                return !notifiedKeys.has(key);
              });'''
    dedup_new = r'''              const notifyCandidates = liveMatches.filter(m => {
                const legacyKey = v21LegacyMatchKey(m, cid);
                const semanticKey = v21CrossGroupMatchKey(m, cid);
                return !notifiedKeys.has(legacyKey) && !notifiedKeys.has(semanticKey);
              });'''
    src = _replace_once(src, dedup_old, dedup_new, "V21_CROSS_GROUP_DEDUP_FILTER")

    match_key_old = r'''                  const requestAuthor = String(m.requestSender || '').trim();
                  const matchKey = `${cid}|${m.requestMessageId}|${m.objectId}`;'''
    match_key_new = r'''                  const requestAuthor = String(m.requestSender || '').trim();
                  const legacyMatchKey = v21LegacyMatchKey(m, cid);
                  const matchKey = v21CrossGroupMatchKey(m, cid);'''
    src = _replace_once(src, match_key_old, match_key_new, "V21_SEMANTIC_MATCH_KEY")

    checkpoint_old = r'''                  const key = matchKey;
                  notifiedKeys.add(key);
                  cursor.notifiedMatchKeys = [...notifiedKeys].slice(-MAX_NOTIFIED_MATCH_KEYS);'''
    checkpoint_new = r'''                  const key = matchKey;
                  notifiedKeys.add(key);
                  notifiedKeys.add(legacyMatchKey);
                  cursor.notifiedMatchKeys = [...notifiedKeys].slice(-MAX_NOTIFIED_MATCH_KEYS);'''
    src = _replace_once(src, checkpoint_old, checkpoint_new, "V21_LEGACY_KEY_COMPAT")

    return src
