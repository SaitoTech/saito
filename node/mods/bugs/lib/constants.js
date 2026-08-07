const BUG_STATUSES = Object.freeze([
  'open',
  'in_progress',
  'needs_information',
  'ready_to_deploy',
  'completed'
]);
const BUG_SEVERITIES = Object.freeze(['critical', 'high', 'medium', 'low']);
const BUG_PRIORITIES = Object.freeze(['urgent', 'high', 'normal', 'low']);
const BUG_ACTIONS = Object.freeze([
  'set-title',
  'set-status',
  'set-severity',
  'set-priority',
  'set-weight',
  'set-assignee',
  'untrack',
  'retrack'
]);

const DEFAULT_WEIGHT = 100;
const MIN_WEIGHT = -1_000_000_000;
const MAX_WEIGHT = 1_000_000_000;
const MAX_TITLE_LENGTH = 180;
const COMPLETED_RETENTION_MS = 183 * 24 * 60 * 60 * 1000;

const LABELS = Object.freeze({
  status: {
    open: 'Open',
    in_progress: 'In Progress',
    needs_information: 'Needs Information',
    ready_to_deploy: 'Ready to Deploy',
    completed: 'Completed'
  },
  severity: {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    low: 'Low'
  },
  priority: {
    urgent: 'Urgent',
    high: 'High',
    normal: 'Normal',
    low: 'Low'
  }
});

module.exports = {
  BUG_ACTIONS,
  BUG_PRIORITIES,
  BUG_SEVERITIES,
  BUG_STATUSES,
  COMPLETED_RETENTION_MS,
  DEFAULT_WEIGHT,
  LABELS,
  PRIORITY_LABELS: LABELS.priority,
  SEVERITY_LABELS: LABELS.severity,
  STATUS_LABELS: LABELS.status,
  MAX_TITLE_LENGTH,
  MAX_WEIGHT,
  MIN_WEIGHT
};
