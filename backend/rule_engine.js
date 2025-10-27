// rule_engine.js
const rules = require('./rules.json');

function evaluateConditions(rule, context) {
  // context: computed features + counters
  const c = rule.condition;
  // example checks (expand as needed)
  if (c.engagement_slope_lt !== undefined) {
    if (!(context.engagement_slope < c.engagement_slope_lt)) return false;
  }
  if (c.cognitive_switch_rate_gt_percentile !== undefined) {
    // We don't have percentile history here; approximate by threshold in context
    if (!(context.cognitive_switch_rate > context.percentile_thresholds[c.cognitive_switch_rate_gt_percentile])) return false;
  }
  if (c.consecutive_wrong !== undefined) {
    if (!(context.consecutive_wrong >= c.consecutive_wrong)) return false;
  }
  if (c.decreasing_time_to_answer) {
    if (!context.decreasing_time_to_answer) return false;
  }
  return true;
}

function evaluateAll(context) {
  const actions = [];
  for (const r of rules) {
    if (evaluateConditions(r, context)) {
      actions.push({rule_id: r.id, priority: r.priority, action: r.action});
    }
  }
  // sort by priority desc
  actions.sort((a,b)=>b.priority - a.priority);
  return actions;
}

module.exports = { evaluateAll };
