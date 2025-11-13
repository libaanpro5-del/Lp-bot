export const pingCommand = async (sock, message, jid, userNumber) => {
  const startTime = Date.now();
  await sock.sendMessage(jid, { 
    text: `🏓 Pong! ${Date.now() - startTime}ms\n\n🤖 Powered by LP WhatsApp Bot` 
  });
};
