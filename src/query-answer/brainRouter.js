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

  if ([
    "exercise","workout","training","routine","bench",
    "squat","deadlift","sets","reps","strength",
    "pull","pull-up","pullup","pullups",
    "push","pushup","push-up",
    "shoulder","knee","hip","back",
    "pain","pinching","form","technique","safe",
    "gym","bodyweight"
  ].some(w => q.includes(w))) return "training";

  if ([
    "protein","carbs","diet","nutrition","macros",
    "bulking","cutting","calories","food"
  ].some(w => q.includes(w))) return "nutrition";

  if ([
    "sleep","stress","recovery","walking","steps","routine","habits","lifestyle"
  ].some(w => q.includes(w))) return "lifestyle";

  return "unknown";
}

function isDangerousOrMedical(query) {
  const q = query.toLowerCase();
  return [
    "suicide","kill myself","self harm","overdose",
    "stop medication","replace my doctor"
  ].some(k => q.includes(k));
}

function routeQuery(query) {
  logger.info(`[ROUTER] smallTalk=${isSmallTalk(query)}, app=${isAppQuery(query)}, domain=${classifyDomain(query)}, query="${query}"`);
  if (isDangerousOrMedical(query)) return { type: "blocked" };
  if (isAppQuery(query)) return { type: "app" };
  if (isSmallTalk(query)) return { type: "smallTalk" };

  const domain = classifyDomain(query);
  if (domain === "unknown") {
    logger.info("unknown domain detected. no RAG.");
    return { type: "unsupported" };
  }

  logger.info(`[ROUTER] domain=${domain}, query="${query}"`);
  return { type: "domainQuestion", domain };
}

module.exports = { routeQuery };