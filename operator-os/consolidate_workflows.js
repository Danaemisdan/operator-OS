const fs = require('fs');
const file = 'skills/linkedin.workflow.skill.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const keepIds = [
  'workflow.linkedin.search_and_review_connection_candidates',
  'workflow.linkedin.send_single_dm_after_approval',
  'workflow.linkedin.publish_exact_text_post_after_approval',
  'workflow.linkedin.profile_research_report',
  'workflow.linkedin.inbox_review_and_reply'
];

const newSkills = data.skills.filter(s => keepIds.includes(s.id));

// Update triggers to be broad and robust
for (const s of newSkills) {
  if (s.id === 'workflow.linkedin.search_and_review_connection_candidates') {
    s.name = "Search & Prospecting";
    s.triggers = ["search", "find", "prospect", "leads", "people", "connect", "connection request", "network"];
  }
  if (s.id === 'workflow.linkedin.send_single_dm_after_approval') {
    s.name = "Outreach & Messaging";
    s.triggers = ["message", "dm", "send a message", "reach out", "inmail", "text"];
  }
  if (s.id === 'workflow.linkedin.publish_exact_text_post_after_approval') {
    s.name = "Content & Publishing";
    s.triggers = ["post", "publish", "write", "share", "tweet", "status update"];
  }
  if (s.id === 'workflow.linkedin.profile_research_report') {
    s.name = "Profile & Auditing";
    s.triggers = ["research", "audit", "profile", "review", "analyze", "check out"];
  }
  if (s.id === 'workflow.linkedin.inbox_review_and_reply') {
    s.name = "Inbox Management";
    s.triggers = ["reply", "inbox", "check messages", "respond"];
  }
}

data.skills = newSkills;
fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log(`Consolidated 107 workflows into ${newSkills.length} Mega Workflows.`);
