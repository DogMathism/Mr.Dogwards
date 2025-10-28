// worker.js
const db = require('./db');
const { v4: uuidv4 } = require('uuid');
const { evaluateAll } = require('./rule_engine');

const WINDOW_SEC = 20; // window size for feature aggregation

async function computeForAllActiveUsers() {
  // Получаем уникальных пользователей с событиями за последние WINDOW_SEC*2
  const { rows: users } = await db.query(`
    SELECT DISTINCT user_id 
    FROM raw_events 
    WHERE ts >= now() - interval '${WINDOW_SEC*2} seconds'
  `);

  for (const u of users) {
    const userId = u.user_id;
    const windowStart = new Date(Date.now() - WINDOW_SEC*1000).toISOString();

    const { rows: events } = await db.query(`
      SELECT * 
      FROM raw_events 
      WHERE user_id = $1 
        AND ts >= now() - interval '${WINDOW_SEC} seconds' 
      ORDER BY ts
    `, [userId]);

    // Считаем базовые фичи
    const clicks = events.filter(e => e.event_type === 'click').length;
    const keypress = events.filter(e => e.event_type === 'keypress').length;
    const answers = events.filter(e => e.event_type === 'answer_submit');
    const interactionCount = clicks + keypress + answers.length;

    // attention_span_index: среднее время между answer_submit событиями
    let attention_span_index = null;
    const answerTimes = answers.map(a => new Date(a.ts).getTime()).sort((a,b)=>a-b);
    if (answerTimes.length >= 2) {
      let diffs = [];
      for (let i = 1; i < answerTimes.length; i++) diffs.push(answerTimes[i] - answerTimes[i-1]);
      attention_span_index = diffs.reduce((s,x)=>s+x,0)/diffs.length;
    } else {
      attention_span_index = WINDOW_SEC*1000 * (interactionCount > 0 ? 1/interactionCount : 1);
    }

    // engagement_slope: изменение активности за окно
    const half = Math.floor(events.length / 2);
    const first = events.slice(0, half).length;
    const second = events.slice(half).length;
    const engagement_slope = (second - first) / Math.max(1, WINDOW_SEC);

    // cognitive_switch_rate: tab_change + proxy cursor chaos
    const tabChanges = events.filter(e => e.event_type === 'tab_change').length;
    const cursorMoves = events.filter(e => e.event_type === 'cursor_move').length;
    const cognitive_switch_rate = tabChanges + (cursorMoves > 30 ? 2 : 0);

    // error_consistency_score: временный placeholder
    const error_consistency_score = Math.random(); // TODO: вычислить по событиям

    // Сохраняем окно
    await db.query(`
      INSERT INTO feature_windows 
      (id, user_id, window_start, window_end, attention_span_index, engagement_slope, cognitive_switch_rate, error_consistency_score, metadata)
      VALUES ($1, $2, $3, now(), $4, $5, $6, $7, $8)
    `, [uuidv4(), userId, windowStart, attention_span_index, engagement_slope, cognitive_switch_rate, error_consistency_score, JSON.stringify({sample_count: events.length})]);

    // Строим контекст для rule engine
    const context = {
      engagement_slope,
      cognitive_switch_rate,
      consecutive_wrong: events.filter(e => e.event_type === 'answer_submit' && e.event_payload && e.event_payload.correct === false).length,
      decreasing_time_to_answer: checkDecreasingTimes(answers),
      percentile_thresholds: { "75": 5 } // placeholder
    };

    const actions = evaluateAll(context);

    if (actions.length > 0) {
      for (const a of actions) {
        await db.query(`
          INSERT INTO raw_events (id,user_id,session_id,event_type,event_payload)
          VALUES ($1,$2,$3,$4,$5)
        `, [uuidv4(), userId, null, 'action_suggested', JSON.stringify(a)]);
      }
    }
  }
}

function checkDecreasingTimes(answers) {
  if (!answers || answers.length < 3) return false;

  const last3 = answers.slice(-3);
  const times = last3
    .map(a => a.event_payload ? a.event_payload.timeToAnswer : null)
    .filter(Boolean);

  if (times.length < 3) return false;
  return times[0] > times[1] && times[1] > times[2];
}

module.exports = { computeForAllActiveUsers };

