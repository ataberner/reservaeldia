const emailNames = require("../functionOwnership.json").endpoints.filter(e => e.codebase === "email").map(e => e.name).sort();
const smokeNames = ["testTransactionalEmail", "testWelcomeEmail"];
module.exports = { emailNames, smokeNames };
