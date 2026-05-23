const { Orchestrator } = require('./out/main/skills/orchestrator.js');
const o = new Orchestrator();
o.planWithLLM("Can you find me some leads on linkedin? probably follow them or connect them too")
  .then(res => console.log(JSON.stringify(res, null, 2)))
  .catch(err => console.error(err));
