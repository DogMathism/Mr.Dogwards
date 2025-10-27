/ telemetry.js - minimal telemetry collector
const Telemetry = (function(){
  const buffer = [];
  const BATCH_MS = 15000;
  let questionStart = Date.now();
  let userId = localStorage.getItem('adaptive_user') || null;

  function sendBatch() {
    if (buffer.length === 0) return;
    const payload = { events: buffer.splice(0), user_id: userId || undefined };
    fetch('http://' + location.hostname + ':3000/api/events/batch', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    }).catch(e => {
      console.error('batch send error', e);
    });
  }
  setInterval(sendBatch, BATCH_MS);

  function pushEvent(type, payload){
    buffer.push({ type, payload, ts: new Date().toISOString() });
  }

  // basic listeners
  document.addEventListener('visibilitychange', ()=> {
    pushEvent('tab_change', {visible: document.visibilityState});
  });

  document.addEventListener('click', e => {
    pushEvent('click', {x: e.clientX, y: e.clientY, tag: e.target.tagName});
  });

  let lastCursor = 0;
  document.addEventListener('mousemove', e => {
    const now = Date.now();
    if (now - lastCursor > 200) {
      pushEvent('cursor_move', {x:e.clientX,y:e.clientY});
      lastCursor = now;
    }
  });

  return {
    pushEvent,
    setUserId: (id) => { userId = id; localStorage.setItem('adaptive_user', id); },
    getQuestionTime: () => Date.now() - questionStart,
    resetQuestionTime: () => { questionStart = Date.now(); },
    _internal_buffer: buffer
  };
})();

// expose to window
window.Telemetry = Telemetry;
