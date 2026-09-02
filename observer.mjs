import { MaxClient } from 'max-account-api';
const c=new MaxClient({sessionFile:'./.max-session.json',printCredentialsAfterLogin:false,autoRead:false});
c.on('qr',()=>{console.log('СЕССИЯ МАКСИМА НЕДЕЙСТВИТЕЛЬНА');process.exit(2)});
c.on('ready',()=>console.log('МАКСИМ ГОТОВ. ЧАТОВ:',c.getChats().length));
c.on('message',m=>console.log('ПОЛУЧЕНО:',m.chatId,m.fromId,m.text));
c.on('error',e=>console.log('ОШИБКА:',e.message));
await c.start();
setTimeout(()=>process.exit(0),240000);
