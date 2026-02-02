// src/query-answer/handlers/smallTalk.responder.js

function handleSmallTalk() {
  const replies = [
    "Hey there — good to see you.",
    "Hi, I’m here with you.",
    "Hello. How’s your day going?",
    "Hey! Let me know how I can help.",
  ];

  const answer = replies[Math.floor(Math.random() * replies.length)];

  return {
    ok: true,
    mode: "small-talk",
    answer,
    contextCount: 0,
    sources: [],
  };
}

module.exports = { handleSmallTalk };