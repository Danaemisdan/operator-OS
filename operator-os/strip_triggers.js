const fs = require('fs');
const file = 'steps/linkedin.steps.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

// Delete 'triggers' from all steps
for (const step of data) {
  if (step.triggers) {
    delete step.triggers;
  }
}

fs.writeFileSync(file, JSON.stringify(data, null, 2));
console.log('Stripped triggers from all raw steps.');
