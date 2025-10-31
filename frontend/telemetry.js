// telemetry-hybrid.js
(function() {
  const USER_ID = localStorage.getItem('user_id') || crypto.randomUUID();
  localStorage.setItem('user_id', USER_ID);

  // =====================
  // WebSocket для live событий
  // =====================
  const ws = new WebSocket(`ws://${window.location.hostname}:3000`);
  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'register', user_id: USER_ID }));
  });

  ws.addEventListener('message', event => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'action') {
        addActionToUI(data.data);
      }
    } catch (e) {
      console.error('WS parse error', e);
    }
  });

  // =====================
  // Буфер событий и отправка на сервер
  // =====================
  const buffer = [];

  async function flushBuffer() {
    if (buffer.length === 0) return;
    try {
      await fetch('/api/events/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': USER_ID
        },
        body: JSON.stringify({ events: buffer.splice(0) })
      });
    } catch (e) {
      console.error('Telemetry flush error', e);
    }
  }

  setInterval(flushBuffer, 5000);

  // =====================
  // Отслеживание действий
  // =====================
  const mouseTrail = [];
  const clickHeat = [];
  let lastMouseTime = 0;

  document.addEventListener('click', e => {
    buffer.push({ type: 'click', payload: { x: e.clientX, y: e.clientY }, ts: new Date().toISOString() });
    clickHeat.push({ x: e.clientX, y: e.clientY, ts: Date.now() });
    updateUI();
  });

  document.addEventListener('mousemove', e => {
    const now = Date.now();
    if (now - lastMouseTime > 100) {
      buffer.push({ type: 'mousemove', payload: { x: e.clientX, y: e.clientY }, ts: new Date().toISOString() });
      mouseTrail.push({ x: e.clientX, y: e.clientY });
      if (mouseTrail.length > 1000) mouseTrail.shift();
      lastMouseTime = now;
      updateUI();
    }
  });

  document.addEventListener('input', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      buffer.push({ type: 'input', payload: { id: e.target.id, value: e.target.value }, ts: new Date().toISOString() });
      updateUI();
    }
  });

  // =====================
  // Панель метрик и графика
  // =====================
  const panel = document.createElement('div');
  panel.style.position = 'fixed';
  panel.style.bottom = '10px';
  panel.style.right = '10px';
  panel.style.width = '320px';
  panel.style.height = '350px';
  panel.style.background = 'rgba(0,0,0,0.85)';
  panel.style.color = 'white';
  panel.style.fontSize = '12px';
  panel.style.padding = '10px';
  panel.style.overflow = 'hidden';
  panel.style.zIndex = 9999;
  panel.innerHTML = `
    <b>Telemetry</b>
    <div id="telemetry-stats"></div>
    <canvas id="mouse-canvas" width="300" height="150" style="background:#222;margin-top:5px;"></canvas>
    <hr>
    <div id="telemetry-actions"></div>
  `;
  document.body.appendChild(panel);

  const statsDiv = panel.querySelector('#telemetry-stats');
  const actionsDiv = panel.querySelector('#telemetry-actions');
  const canvas = panel.querySelector('#mouse-canvas');
  const ctx = canvas.getContext('2d');

  function updateUI() {
    const clicks = buffer.filter(e => e.type === 'click').length;
    const moves = buffer.filter(e => e.type === 'mousemove').length;
    const inputs = buffer.filter(e => e.type === 'input').length;
    statsDiv.innerHTML = Clicks: ${clicks}<br>Mouse moves: ${moves}<br>Inputs: ${inputs};

    // Рисуем мышь
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Траектория мыши
    ctx.strokeStyle = 'lime';
    ctx.beginPath();
    mouseTrail.forEach((p, i) => {
      const x = (p.x / window.innerWidth) * canvas.width;
      const y = (p.y / window.innerHeight) * canvas.height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Тепловая карта кликов
    clickHeat.forEach(c => {
      const x = (c.x / window.innerWidth) * canvas.


width;
      const y = (c.y / window.innerHeight) * canvas.height;
      ctx.fillStyle = 'rgba(255,0,0,0.5)';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI*2);
      ctx.fill();
    });
  }

  function addActionToUI(action) {
    const p = document.createElement('div');
    p.textContent = Action suggested: ${JSON.stringify(action)};
    actionsDiv.prepend(p);
  }
})();
