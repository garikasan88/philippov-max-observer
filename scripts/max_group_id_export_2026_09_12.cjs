'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const sourcePath = path.join(process.cwd(), 'src', 'observer_base.yml');
const runtimePath = path.join(process.cwd(), '.max-group-export-runtime.cjs');
const exportDir = path.join(process.cwd(), '.export');
const exportPath = path.join(exportDir, 'max-groups.envelope.json');

let src = fs.readFileSync(sourcePath, 'utf8');
const startMarker = "          cat > observer.cjs <<'JS'\n";
const endMarker = "\n          JS\n";
if (!src.includes(startMarker) || !src.includes(endMarker)) {
  throw new Error('OBSERVER_JS_BLOCK_NOT_FOUND');
}
const start = src.indexOf(startMarker) + startMarker.length;
const end = src.indexOf(endMarker, start);
let js = src.slice(start, end);

const oldUid = "const EXPECTED_USER_ID = '402668979';";
const newUid = "const EXPECTED_USER_ID = '140053596';";
if (!js.includes(oldUid)) throw new Error('EXPECTED_USER_PATCH_MARKER_NOT_FOUND');
js = js.replace(oldUid, newUid);

const checkpoint = "              console.log('SESSION CHECKPOINT AFTER LOGIN: PASS');";
if (!js.includes(checkpoint)) throw new Error('SESSION_CHECKPOINT_MARKER_NOT_FOUND');

const publicKey = [
  '-----BEGIN PUBLIC KEY-----',
  'MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAuQ0xnMgPvRZMqfvrr2/b',
  'nNr9+vt1rKSO03G+AGDsWuC5sHY8TtqMmXnnz0l/f3N4IXySqrLCF1CiJHWQS0jK',
  'MyI3bBAzTNJzHyuDYEzHVbxMJYtOnQZujZWCCott/hySYcqFcNPoGg/yW2RIL5n8',
  'wpU80t7BZSfwFhAXq31izH+Ltd2M45Kv6chNeySRaDvbacuBQ8tLJvR+DdmxeALL',
  'mpQBfkASOBbFRBsu1Rulf/i1HPAPtEWUREqtY6jJ98imilrfpSIA4w3QgfacG4g+',
  'aYQyDxcH9VQjEtQwZavoQHr/Nt1Ud9CUHZ7h2IPM2/kH7aIDvsuNy/XdISnsw3Le',
  '+egffzAx7dn3KBeQWaT+THJ7coCdJdrXobsD5f/rXhiLdxYoSEvqvgHfxms4nvN3',
  'rLjHREUM2M8VOS2y/VhlckyYYvQirSuUJYMvaIva4j07eIS5L1DJLIGcyO0VKEYi',
  'fYqqASmFiFKQZ9AB3VDgRsdRJhIIlgkPghvF8iGUeiXNAgMBAAE=',
  '-----END PUBLIC KEY-----',
].join('\n');

const injection = `

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

              addRows(Array.isArray(client?.lastSyncPayload?.chats) ? client.lastSyncPayload.chats : [], 'sync');

              let exportOffset = 0;
              for (let exportPage = 0; exportPage < 20; exportPage++) {
                const got = await client.getChats(200, exportOffset);
                let rows = [];
                if (Array.isArray(got)) rows = got;
                else if (Array.isArray(got?.chats)) rows = got.chats;
                else if (Array.isArray(got?.payload?.chats)) rows = got.payload.chats;
                const before = collected.size;
                const added = addRows(rows, 'getChats');
                console.log('GROUP EXPORT PAGE ' + (exportPage + 1) + ': rows=' + rows.length + ' added=' + added + ' total=' + collected.size);
                if (!rows.length || rows.length < 200) break;
                if (collected.size === before) break;
                exportOffset += rows.length;
              }

              const allChats = [...collected.values()].sort((a, b) =>
                a.title.localeCompare(b.title, 'ru') || a.id.localeCompare(b.id)
              );
              const groups = allChats.filter(x => /^-\\d+$/.test(x.id));
              const exportPayload = {
                schema: 'PHILIPPOV_MAX_GROUP_EXPORT_V1',
                exportedAt: new Date().toISOString(),
                accountUserId: String(actualUserId),
                accountName: String(actualName || ''),
                allChatsCount: allChats.length,
                groupCandidatesCount: groups.length,
                groupCandidateRule: 'negative native MAX chat id',
                groups,
              };

              const exportPublicKey = ${JSON.stringify(publicKey)};
              const plain = Buffer.from(JSON.stringify(exportPayload), 'utf8');
              const aesKey = crypto.randomBytes(32);
              const exportIv = crypto.randomBytes(12);
              const exportCipher = crypto.createCipheriv('aes-256-gcm', aesKey, exportIv);
              const ciphertext = Buffer.concat([exportCipher.update(plain), exportCipher.final()]);
              const exportTag = exportCipher.getAuthTag();
              const wrappedKey = crypto.publicEncrypt({
                key: exportPublicKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256',
              }, aesKey);

              fs.mkdirSync(${JSON.stringify(exportDir)}, { recursive: true });
              fs.writeFileSync(${JSON.stringify(exportPath)}, JSON.stringify({
                schema: 'PHILIPPOV_ENCRYPTED_EXPORT_V1',
                algorithm: 'RSA-OAEP-SHA256 + AES-256-GCM',
                wrappedKey: wrappedKey.toString('base64'),
                iv: exportIv.toString('base64'),
                tag: exportTag.toString('base64'),
                ciphertext: ciphertext.toString('base64'),
                counts: { allChats: allChats.length, groupCandidates: groups.length },
              }), 'utf8');
              console.log('GROUP EXPORT COMPLETE: allChats=' + allChats.length + ' groupCandidates=' + groups.length);
              process.exit(0);
`;

js = js.replace(checkpoint, checkpoint + injection);
fs.writeFileSync(runtimePath, js, 'utf8');
console.log('ENCRYPTED GROUP EXPORT PATCH: PASS');

const child = spawnSync(process.execPath, [runtimePath], {
  stdio: 'inherit',
  env: process.env,
});

try { fs.unlinkSync(runtimePath); } catch {}
if (child.error) throw child.error;
process.exit(typeof child.status === 'number' ? child.status : 1);
