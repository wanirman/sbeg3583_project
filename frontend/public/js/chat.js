/* Real-time chat using Socket.io + offline queue */
const BioChat = (() => {
  let socket = null;
  let isOpen = false;

  function init() {
    document.getElementById('chat-fab').addEventListener('click', toggleChat);
    document.getElementById('chat-close').addEventListener('click', toggleChat);
    document.getElementById('chat-form').addEventListener('submit', onSend);
  }

  function connect() {
    const token = BioAPI.getToken();
    if (!token || socket) return;

    socket = io({ auth: { token } });

    socket.on('connect', () => {
      loadHistory();
    });

    socket.on('chat:message', msg => {
      appendMessage(msg);
    });

    socket.on('disconnect', () => {
      console.log('Chat disconnected');
    });
  }

  function toggleChat() {
    const panel = document.getElementById('chat-panel');
    isOpen = !isOpen;
    panel.classList.toggle('hidden', !isOpen);
    if (isOpen) {
      connect();
      document.getElementById('chat-input').focus();
    }
  }

  async function loadHistory() {
    try {
      const { messages } = await BioAPI.getChatMessages();
      const container = document.getElementById('chat-messages');
      container.innerHTML = '';
      messages.forEach(appendMessage);
      container.scrollTop = container.scrollHeight;
    } catch { /* offline */ }
  }

  async function onSend(e) {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    if (!navigator.onLine) {
      await BioDB.queueChatMessage({ message_text: text, timestamp: new Date().toISOString() });
      const user = BioAPI.getUser();
      appendMessage({ sender_name: user?.user_name || 'You', message_text: text, timestamp: new Date(), _offline: true });
      return;
    }

    try {
      await BioAPI.postChatMessage(text);
    } catch (ex) {
      await BioDB.queueChatMessage({ message_text: text, timestamp: new Date().toISOString() });
    }
  }

  function appendMessage(msg) {
    const user = BioAPI.getUser();
    const isOwn = msg.sender_id === user?.user_id || msg.sender_name === user?.user_name;
    const container = document.getElementById('chat-messages');

    const el = document.createElement('div');
    el.className = `chat-msg ${isOwn ? 'own' : ''}`;
    const time = new Date(msg.timestamp).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
    const offlineMark = msg._offline ? ' (offline)' : '';
    el.innerHTML = `
      <div class="bubble">${escapeHTML(msg.message_text)}</div>
      <div class="meta">${isOwn ? '' : escapeHTML(msg.sender_name) + ' · '}${time}${offlineMark}</div>
    `;
    container.appendChild(el);
    container.scrollTop = container.scrollHeight;
  }

  function escapeHTML(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  async function syncOfflineChat() {
    const queue = await BioDB.getAllChatQueue();
    if (queue.length === 0) return;
    try {
      for (const msg of queue) {
        await BioAPI.postChatMessage(msg.message_text);
      }
      await BioDB.clearChatQueue();
    } catch { /* will retry next time */ }
  }

  return { init, syncOfflineChat };
})();

window.BioChat = BioChat;
