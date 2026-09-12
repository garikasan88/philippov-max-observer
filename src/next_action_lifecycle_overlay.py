from __future__ import annotations


def _replace_once(src: str, old: str, new: str, label: str) -> str:
    count = src.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one marker, got {count}")
    return src.replace(old, new, 1)


def apply_next_action_lifecycle_overlay(src: str) -> str:
    """Overlay persistent NextAction lifecycle onto the frozen production builder.

    The frozen observer and V2/V2.1 matcher remain unchanged. This overlay:
    - persists NextAction records in the existing state cursor without realtor names;
    - accepts lifecycle commands only from the other participant in Igor's direct MAX chat;
    - applies OPEN / IN_PROGRESS / DONE / REJECTED transitions;
    - keeps compact NextAction and Audit/Event logs;
    - exposes the action ID and command syntax in new MATCH notifications;
    - checkpoints every successful MATCH notification to reduce duplicate risk after partial failure;
    - blocks abnormal notification floods fail-closed.
    """

    cursor_marker = r'''              "              }\n\n"
              "              const cursor = initialCursor;"'''
    cursor_repl = r'''              "              }\n\n"
              "              const cursor = initialCursor;\n"
              "              cursor.nextActions = cursor.nextActions && typeof cursor.nextActions === 'object' && !Array.isArray(cursor.nextActions) ? cursor.nextActions : {};\n"
              "              cursor.nextActionEvents = Array.isArray(cursor.nextActionEvents) ? cursor.nextActionEvents : [];\n"
              "              cursor.auditEvents = Array.isArray(cursor.auditEvents) ? cursor.auditEvents : [];\n"
              "              cursor.nextActionControlSeenIds = Array.isArray(cursor.nextActionControlSeenIds) ? cursor.nextActionControlSeenIds.map(String) : [];\n"
              "              cursor.matchFloodGuardSignatures = cursor.matchFloodGuardSignatures && typeof cursor.matchFloodGuardSignatures === 'object' && !Array.isArray(cursor.matchFloodGuardSignatures) ? cursor.matchFloodGuardSignatures : {};\n"
              "              try {\n"
              "                const seenControl = new Set(cursor.nextActionControlSeenIds);\n"
              "                const controlHistory = await client.getHistory(Number(NOTIFY_CHAT_ID), Date.now(), 200, 0);\n"
              "                const controlRows = Array.isArray(controlHistory) ? [...controlHistory].sort((a, b) => messageTime(a) - messageTime(b)) : [];\n"
              "                let controlTouched = false;\n"
              "                for (const cm of controlRows) {\n"
              "                  const mid = messageId(cm);\n"
              "                  if (!mid || seenControl.has(mid)) continue;\n"
              "                  const controlSenderId = senderId(cm);\n"
              "                  if (!controlSenderId || controlSenderId === 'UNKNOWN' || controlSenderId === EXPECTED_USER_ID) continue;\n"
              "                  const controlText = messageText(cm);\n"
              "                  const command = nextActionParseCommand(controlText);\n"
              "                  if (!command) continue;\n"
              "                  seenControl.add(mid);\n"
              "                  controlTouched = true;\n"
              "                  const before = cursor.nextActions?.[command.id]?.status || null;\n"
              "                  const controlIso = iso(messageTime(cm));\n"
              "                  const result = nextActionApplyCommand(cursor.nextActions, controlText, controlIso === 'UNKNOWN' ? new Date().toISOString() : controlIso);\n"
              "                  if (result.changed) {\n"
              "                    const action = result.action;\n"
              "                    cursor.nextActionEvents.push({type:'STATUS_CHANGED', actionId:action.id, from:before, to:action.status, at:action.updatedAt, sourceMessageId:mid});\n"
              "                    cursor.nextActionEvents = cursor.nextActionEvents.slice(-2000);\n"
              "                    cursor.auditEvents.push({type:'NEXT_ACTION_STATUS_CHANGED', actionId:action.id, from:before, to:action.status, at:action.updatedAt, sourceMessageId:mid, channel:'MAX'});\n"
              "                    cursor.auditEvents = cursor.auditEvents.slice(-5000);\n"
              "                    await client.sendMessage({chatId:Number(NOTIFY_CHAT_ID), text:['PHILIPPOV NEXTACTION', `${action.id} → ${action.status}`, action.text].join('\\n')});\n"
              "                    console.log(`NEXTACTION CONTROL: PASS id=${action.id} from=${before || 'UNKNOWN'} to=${action.status}`);\n"
              "                  } else if (result.reason === 'ACTION_NOT_FOUND') {\n"
              "                    await client.sendMessage({chatId:Number(NOTIFY_CHAT_ID), text:`PHILIPPOV NEXTACTION\\nКоманда не применена: ${command.id} не найден.`});\n"
              "                    console.log(`NEXTACTION CONTROL: ACTION_NOT_FOUND id=${command.id}`);\n"
              "                  } else {\n"
              "                    console.log(`NEXTACTION CONTROL: ${result.reason} id=${command.id || 'UNKNOWN'}`);\n"
              "                  }\n"
              "                }\n"
              "                cursor.nextActionControlSeenIds = [...seenControl].slice(-500);\n"
              "                if (controlTouched) {\n"
              "                  cursor.updatedAt = new Date().toISOString();\n"
              "                  persistentSession = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));\n"
              "                  await saveState(stateIssue.number, cursor, persistentSession);\n"
              "                  console.log(`NEXTACTION CONTROL STATE: PASS actions=${Object.keys(cursor.nextActions).length} events=${cursor.nextActionEvents.length} audits=${cursor.auditEvents.length}`);\n"
              "                }\n"
              "              } catch (e) {\n"
              "                console.log(`NEXTACTION CONTROL: SOFT_FAIL ${String(e?.message || e).slice(0, 300)}`);\n"
              "              }"'''
    src = _replace_once(src, cursor_marker, cursor_repl, "NEXTACTION_CURSOR_CONTROL_INSERT")

    dedup_old = r'''              const notifyMatches = liveMatches.filter(m => {
                const key = `${cid}|${m.requestMessageId}|${m.objectId}`;
                return !notifiedKeys.has(key);
              });

              console.log(
                `MATCH NOTIFY DEDUP: live=${liveMatches.length} new=${notifyMatches.length} remembered=${notifiedKeys.size}`
              );'''
    dedup_new = r'''              const notifyCandidates = liveMatches.filter(m => {
                const key = `${cid}|${m.requestMessageId}|${m.objectId}`;
                return !notifiedKeys.has(key);
              });

              const MAX_NEW_MATCH_NOTIFICATIONS_PER_RUN = 20;
              const notifyMatches = notifyCandidates.length <= MAX_NEW_MATCH_NOTIFICATIONS_PER_RUN
                ? notifyCandidates
                : [];

              if (notifyCandidates.length > MAX_NEW_MATCH_NOTIFICATIONS_PER_RUN) {
                const floodSignature = crypto
                  .createHash('sha256')
                  .update(
                    notifyCandidates
                      .map(m => `${cid}|${m.requestMessageId}|${m.objectId}`)
                      .sort()
                      .join('\n')
                  )
                  .digest('hex')
                  .slice(0, 16);

                if (cursor.matchFloodGuardSignatures[cid] !== floodSignature) {
                  cursor.matchFloodGuardSignatures[cid] = floodSignature;
                  cursor.auditEvents.push({
                    type:'MATCH_NOTIFY_FLOOD_BLOCKED',
                    chatId:cid,
                    candidateCount:notifyCandidates.length,
                    limit:MAX_NEW_MATCH_NOTIFICATIONS_PER_RUN,
                    signature:floodSignature,
                    at:new Date().toISOString(),
                    channel:'MAX',
                  });
                  cursor.auditEvents = cursor.auditEvents.slice(-5000);
                  cursor.updatedAt = new Date().toISOString();
                  persistentSession = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
                  await saveState(stateIssue.number, cursor, persistentSession);
                }

                console.log(
                  `MATCH NOTIFY FLOOD GUARD: BLOCKED candidates=${notifyCandidates.length} limit=${MAX_NEW_MATCH_NOTIFICATIONS_PER_RUN}`
                );
              }

              console.log(
                `MATCH NOTIFY DEDUP: live=${liveMatches.length} new=${notifyCandidates.length} send=${notifyMatches.length} remembered=${notifiedKeys.size}`
              );'''
    src = _replace_once(src, dedup_old, dedup_new, "NEXTACTION_FLOOD_GUARD")

    create_old = r'''                  const requestAuthor = String(m.requestSender || '').trim();
                  const matchKey = `${cid}|${m.requestMessageId}|${m.objectId}`;
                  const nextAction = {
                    kind: 'NEXT_ACTION',
                    code: 'VERIFY_OBJECT_AND_CONTACT_REQUEST_AUTHOR',
                    status: 'OPEN',
                    priority: 'HIGH',
                    sourceMatchKey: matchKey,
                    text: requestAuthor
                      ? `Проверить актуальность объекта → связаться с ${requestAuthor} и предложить этот объект.`
                      : 'Проверить актуальность объекта → связаться с автором запроса и предложить этот объект.',
                  };
                  m.nextAction = nextAction;'''

    create_new = r'''                  const requestAuthor = String(m.requestSender || '').trim();
                  const matchKey = `${cid}|${m.requestMessageId}|${m.objectId}`;
                  cursor.nextActions = cursor.nextActions && typeof cursor.nextActions === 'object' && !Array.isArray(cursor.nextActions) ? cursor.nextActions : {};
                  cursor.nextActionEvents = Array.isArray(cursor.nextActionEvents) ? cursor.nextActionEvents : [];
                  cursor.auditEvents = Array.isArray(cursor.auditEvents) ? cursor.auditEvents : [];
                  let nextAction = nextActionCreate({sourceMatchKey: matchKey});
                  const existingAction = cursor.nextActions[nextAction.id];
                  if (existingAction && existingAction.sourceMatchKey !== matchKey) {
                    throw new Error(`NEXT_ACTION_ID_COLLISION id=${nextAction.id}`);
                  }
                  if (existingAction) {
                    nextAction = existingAction;
                  } else {
                    cursor.nextActions[nextAction.id] = nextAction;
                    cursor.nextActionEvents.push({type:'CREATED', actionId:nextAction.id, from:null, to:'OPEN', at:nextAction.createdAt, sourceMatchKey:matchKey});
                    cursor.nextActionEvents = cursor.nextActionEvents.slice(-2000);
                    cursor.auditEvents.push({type:'NEXT_ACTION_CREATED', actionId:nextAction.id, sourceMatchKey:matchKey, at:nextAction.createdAt, channel:'MAX'});
                    cursor.auditEvents = cursor.auditEvents.slice(-5000);
                    const actionIds = Object.keys(cursor.nextActions);
                    if (actionIds.length > 1000) {
                      actionIds
                        .sort((a, b) => String(cursor.nextActions[a]?.updatedAt || '').localeCompare(String(cursor.nextActions[b]?.updatedAt || '')))
                        .slice(0, actionIds.length - 1000)
                        .forEach(id => delete cursor.nextActions[id]);
                    }
                  }
                  const nextActionDisplayText = requestAuthor
                    ? `Проверить актуальность объекта → связаться с ${requestAuthor} и предложить этот объект.`
                    : nextAction.text;
                  m.nextAction = nextAction;'''
    src = _replace_once(src, create_old, create_new, "NEXTACTION_CREATE_PERSIST")

    status_old = r'''                    'СЛЕДУЮЩЕЕ ДЕЙСТВИЕ:',
                    nextAction.text,
                    `Статус: ${nextAction.status}`,'''
    status_new = r'''                    'СЛЕДУЮЩЕЕ ДЕЙСТВИЕ:',
                    nextActionDisplayText,
                    `ID: ${nextAction.id}`,
                    `Статус: ${nextAction.status}`,
                    `Управление: СКАУТ ${nextAction.id} В РАБОТУ / ГОТОВО / ОТКЛОНИТЬ`,'''
    src = _replace_once(src, status_old, status_new, "NEXTACTION_NOTIFICATION_CONTROL")

    delivery_old = r'''                  // Keep the historical dedup key stable: changing its shape would
                  // make remembered matches look new and could resend old notifications.
                  const key = matchKey;
                  notifiedKeys.add(key);
                  console.log(`MATCH NOTIFY: PASS key=${key}`);
                  console.log(`NEXT ACTION: OPEN code=${nextAction.code} key=${nextAction.sourceMatchKey}`);'''
    delivery_new = r'''                  // Keep the historical dedup key stable: changing its shape would
                  // make remembered matches look new and could resend old notifications.
                  const key = matchKey;
                  notifiedKeys.add(key);
                  cursor.notifiedMatchKeys = [...notifiedKeys].slice(-MAX_NOTIFIED_MATCH_KEYS);
                  cursor.auditEvents.push({
                    type:'MATCH_NOTIFIED',
                    actionId:nextAction.id,
                    sourceMatchKey:key,
                    chatId:cid,
                    requestMessageId:String(m.requestMessageId || ''),
                    objectId:String(m.objectId || ''),
                    at:new Date().toISOString(),
                    channel:'MAX',
                  });
                  cursor.auditEvents = cursor.auditEvents.slice(-5000);
                  cursor.updatedAt = new Date().toISOString();

                  // Checkpoint after every successful send. If a later send in the same
                  // batch fails, already delivered matches remain deduplicated.
                  persistentSession = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
                  await saveState(stateIssue.number, cursor, persistentSession);

                  console.log(`MATCH NOTIFY CHECKPOINT: PASS key=${key} remembered=${cursor.notifiedMatchKeys.length}`);
                  console.log(`NEXT ACTION: ${nextAction.status} id=${nextAction.id} code=${nextAction.code} key=${nextAction.sourceMatchKey}`);'''
    src = _replace_once(src, delivery_old, delivery_new, "NEXTACTION_PER_DELIVERY_CHECKPOINT")

    batch_state_old = r'''                cursor.notifiedMatchKeys = [...notifiedKeys].slice(-MAX_NOTIFIED_MATCH_KEYS);
                cursor.updatedAt = new Date().toISOString();

                persistentSession = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
                await saveState(stateIssue.number, cursor, persistentSession);
                console.log(`MATCH NOTIFY STATE: PASS remembered=${cursor.notifiedMatchKeys.length}`);'''
    batch_state_new = r'''                console.log(`MATCH NOTIFY STATE: PASS remembered=${cursor.notifiedMatchKeys.length} audits=${cursor.auditEvents.length}`);'''
    src = _replace_once(src, batch_state_old, batch_state_new, "NEXTACTION_REMOVE_BATCH_ONLY_CHECKPOINT")

    return src
