const { logger } = require("../utils/logger");

function isSmallTalk(query) {
  const q = query.toLowerCase().trim();

  if (q.length > 40) return false;

  const smallTalkPatterns = [
    /^hi$/,
    /^hello$/,
    /^hey$/,
    /^how are you$/,
    /^what's up$/,
    /^good morning$/,
    /^good night$/,
    /^who are you$/
  ];

  return smallTalkPatterns.some(p => p.test(q));
}

function isAppQuery(query) {
  const q = query.toLowerCase();
  return [
    "my plan", "my workout", "my workouts",
    "my history", "my logs", "show progress",
    "export", "dashboard", "show my sessions", "styku",
  ].some(k => q.includes(k));
}

function classifyDomain(query) {
  const q = query.toLowerCase();

  const trainingHits = [
    "exercise","workout","training","routine","bench",
    "squat","deadlift","sets","reps","strength",
    "pull","pull-up","pullup","pullups",
    "push","pushup","push-up",
    "shoulder","knee","hip","back",
    "pain","pinching","form","technique","safe",
    "gym","bodyweight"
  ].filter(w => q.includes(w)).length;

  const nutritionHits = [
    "protein","carbs","diet","nutrition","macros",
    "bulking","cutting","calories","food"
  ].filter(w => q.includes(w)).length;

  const lifestyleHits = [
    "sleep","stress","recovery","walking","steps","habits","lifestyle"
  ].filter(w => q.includes(w)).length;

  const max = Math.max(trainingHits, nutritionHits, lifestyleHits);

  if (max === 0) return "unknown";
  if (nutritionHits === max) return "nutrition";
  if (trainingHits === max) return "training";
  if (lifestyleHits === max) return "lifestyle";
  return "training";
}

function isDangerousOrMedical(query) {
  const q = query.toLowerCase();
  return [
    "suicide","kill myself","self harm","overdose",
    "stop medication","replace my doctor","acl","tear","injury","surgery","hernia",
    "disc","slip disc","ligament","meniscus",
    "rehab","physio","diagnosis"
  ].some(k => q.includes(k));
}

function routeQuery(query) {
  logger.info(`[ROUTER] smallTalk=${isSmallTalk(query)}, app=${isAppQuery(query)}, domain=${classifyDomain(query)}, query="${query}"`);
  if (isDangerousOrMedical(query)) return { type: "blocked" };
  if (isSmallTalk(query)) return { type: "smallTalk" };
  if (isAppQuery(query)) return { type: "app" };

  const domain = classifyDomain(query);
  if (domain === "unknown") {
    logger.info("unknown domain detected. no RAG.");
    return { type: "unsupported" };
  }

  return { type: "domainQuestion", domain };
}

module.exports = { routeQuery };