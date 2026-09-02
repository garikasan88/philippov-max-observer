import { MaxClient } from 'max-account-api';

const client = new MaxClient({
  sessionFile: './.max-session.json',
  printCredentialsAfterLogin: false,
  autoRead: false,
});

client.on('qr', () => {
  console.log('СЕССИЯ МАКСИМА НЕДЕЙСТВИТЕЛЬНА');
  process.exit(2);
});

client.on('error', e => console.log('ОШИБКА:', e?.message ?? e));

await client.start();

const chats = client.getChats().filter(
  chat => chat?.status !== 'REMOVED' && !chat?.options?.SERVICE_CHAT
);

console.log('МАКСИМ ГОТОВ. ЧАТОВ:', client.getChats().length);

const rawLookback = Number(process.env.LOOKBACK_MINUTES ?? 40);
const lookbackMinutes =
  Number.isFinite(rawLookback) && rawLookback > 0
    ? Math.floor(rawLookback)
    : 40;

const now = Date.now();
const since = now - lookbackMinutes * 60 * 1000;
let found = 0;

for (const chat of chats) {
  try {
    const history = await client.getHistory(chat.id, {
      from: now,
      backward: 100
    });

    for (const message of history ?? []) {
      if (!message?.id) continue;
      if (message?.status) continue;
      if (message?.type !== 'USER') continue;
      if ((message?.time ?? 0) < since) continue;

      found++;

      console.log('ПОЛУЧЕНО:', JSON.stringify({
        chatId: chat.id,
        group: chat.title ?? ('chat:' + chat.id),
        fromId: message.sender,
        messageId: message.id,
        time: message.time,
        text: message.text ?? ''
      }));
    }
  } catch (e) {
    console.log('ОШИБКА ИСТОРИИ:', chat.id, e?.message ?? e);
  }
}

console.log(
  `ПРОВЕРКА ЗАВЕРШЕНА. СООБЩЕНИЙ ЗА ${lookbackMinutes} МИНУТ:`,
  found
);

process.exit(0);
