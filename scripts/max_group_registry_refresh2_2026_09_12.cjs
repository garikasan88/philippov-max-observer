'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const sourcePath = path.join(process.cwd(), 'src', 'observer_base.yml');
const runtimePath = path.join(process.cwd(), '.max-group-registry-refresh2-runtime.cjs');
const exportDir = path.join(process.cwd(), '.export');
const exportPath = path.join(exportDir, 'max-groups-current2.envelope.json');

let src = fs.readFileSync(sourcePath, 'utf8');
const startMarker = "          cat > observer.cjs <<'JS'\n";
const endMarker = "\n          JS\n";
if (!src.includes(startMarker) || !src.includes(endMarker)) throw new Error('OBSERVER_JS_BLOCK_NOT_FOUND');
const start = src.indexOf(startMarker) + startMarker.length;
const end = src.indexOf(endMarker, start);
let js = src.slice(start, end);

const oldUid = "const EXPECTED_USER_ID = '402668979';";
if (!js.includes(oldUid)) throw new Error('EXPECTED_USER_PATCH_MARKER_NOT_FOUND');
js = js.replace(oldUid, "const EXPECTED_USER_ID = '140053596';", 1);
const checkpoint = "              console.log('SESSION CHECKPOINT AFTER LOGIN: PASS');";
if (!js.includes(checkpoint)) throw new Error('SESSION_CHECKPOINT_MARKER_NOT_FOUND');

const publicKey = `-----BEGIN PUBLIC KEY-----
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEApjYukkBQI2+WYeMTVLRh
npG4WFUc+1fL8c25NGM/7DAX/Zb2m0OU4KzYfJhCQhlowH4oFWYT2UQCAfIiTCQz
VWcbitouLDedevwgwdO5FSI2LWsNEtGX+fePf79AdVnGG3aKDYBVGts08tOxrsMv
vmAVQ4gZVnpTRSzoNaSTZlyocpdlXGRJbOCBjZlN/4k4Jz6wDt7V1CaewG7wLIe6
PBEZnfWkC7GHUmlwQFy+QR5JSnO0Q2NzCuzJrPj8TB65579nHvwpPhC8qD+FpG16
0gU6FdfN6S4LrnTjxwMY49shf9rY0wu1EaEUlrKJbhu6/3SOpk+tT7zFZud1fjYt
+1iZUgeYQa482FksriXD2Y6O0HFKGRlFmFz/NyMA2vQBkIClweiw8jcWmqvKcogy
eQC5ULm7CLKmbhr2XShAIMuGFSAGaYP38zWpbtDW1EtzwshspLOnYzMqlhG9LYfI
Sft5hfGkxgtgYUwpqvUD3NGIcgeRA9OnIfPLIB6iwunzAgMBAAE=
-----END PUBLIC KEY-----`;

const injection = `
              const { Opcode: ExportOpcode } = require('webmaxsocket/lib/opcodes');
              const collected = new Map();
              const addRows = (rows, source) => {
                if (!Array.isArray(rows)) return 0;
                let added = 0;
                for (const c of rows) {
                  const idRaw = c?.id ?? c?.chat_id ?? c?.chatId ?? null;
                  if (idRaw == null) continue;
                  const id = String(idRaw);
                  if (collected.has(id)) continue;
                  collected.set(id, {
                    id,
                    title: String(c?.title ?? c?.name ?? c?.displayName ?? '').trim(),
                    type: String(c?.type ?? c?.chatType ?? c?.chat_type ?? '').trim(),
                    status: String(c?.status ?? c?.membershipStatus ?? c?.membership_status ?? '').trim(),
                    participantsCount: Number(c?.participantsCount ?? c?.participants_count ?? c?.membersCount ?? c?.members_count ?? 0) || null,
                    source,
                  });
                  added++;
                }
                return added;
              };
              const syncPayload = client?.lastSyncPayload && typeof client.lastSyncPayload === 'object' ? client.lastSyncPayload : {};
              addRows(Array.isArray(syncPayload.chats) ? syncPayload.chats : [], 'sync');
              let marker = syncPayload?.chatMarker ?? syncPayload?.chat_marker ?? null;
              const seenMarkers = new Set();
              for (let page = 0; marker != null && page < 30; page++) {
                const markerKey = typeof marker + ':' + String(marker);
                if (seenMarkers.has(markerKey)) break;
                seenMarkers.add(markerKey);
                const response = await client.sendAndWait(ExportOpcode.CHATS_LIST, {marker});
                const payload = response?.payload && typeof response.payload === 'object' ? response.payload : {};
                const rows = Array.isArray(payload?.chats) ? payload.chats : [];
                const added = addRows(rows, 'raw_chats_list');
                console.log('RAW CHATS PAGE ' + (page + 1) + ': rows=' + rows.length + ' added=' + added + ' total=' + collected.size);
                if (!rows.length) break;
                const next = payload?.marker;
                if ((typeof next !== 'number' && typeof next !== 'string') || String(next) === String(marker)) break;
                marker = next;
              }
              const allChats = [...collected.values()].sort((a,b)=>a.title.localeCompare(b.title,'ru') || a.id.localeCompare(b.id));
              const groups = allChats.filter(x => /^-\\d+$/.test(x.id));
              const exportPayload = {
                schema:'PHILIPPOV_MAX_GROUP_EXPORT_V1',
                exportedAt:new Date().toISOString(),
                accountUserId:String(actualUserId),
                accountName:String(actualName || ''),
                allChatsCount:allChats.length,
                groupCandidatesCount:groups.length,
                groupCandidateRule:'negative native MAX chat id',
                groups,
              };
              const plain = Buffer.from(JSON.stringify(exportPayload), 'utf8');
              const aesKey = crypto.randomBytes(32);
              const iv = crypto.randomBytes(12);
              const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
              const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
              const tag = cipher.getAuthTag();
              const wrappedKey = crypto.publicEncrypt({key:${JSON.stringify(publicKey)},padding:crypto.constants.RSA_PKCS1_OAEP_PADDING,oaepHash:'sha256'}, aesKey);
              fs.mkdirSync(${JSON.stringify(exportDir)}, {recursive:true});
              fs.writeFileSync(${JSON.stringify(exportPath)}, JSON.stringify({
                schema:'PHILIPPOV_ENCRYPTED_EXPORT_V1',algorithm:'RSA-OAEP-SHA256 + AES-256-GCM',
                wrappedKey:wrappedKey.toString('base64'),iv:iv.toString('base64'),tag:tag.toString('base64'),ciphertext:ciphertext.toString('base64'),
                counts:{allChats:allChats.length,groupCandidates:groups.length}
              }), 'utf8');
              console.log('GROUP EXPORT COMPLETE: allChats=' + allChats.length + ' groupCandidates=' + groups.length);
              process.exit(0);
`;
js = js.replace(checkpoint, checkpoint + injection, 1);
fs.writeFileSync(runtimePath, js, 'utf8');
console.log('ENCRYPTED GROUP EXPORT V2 PATCH: PASS');
const child = spawnSync(process.execPath, [runtimePath], {stdio:'inherit', env:process.env});
try { fs.unlinkSync(runtimePath); } catch {}
if (child.error) throw child.error;
process.exit(typeof child.status === 'number' ? child.status : 1);
