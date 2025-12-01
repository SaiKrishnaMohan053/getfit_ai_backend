// tests/mocks/redisClient.mock.js
module.exports = {
  redis: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
  }
};