/**
 * Jest Shim for Swagger UI tests.
 * This file is required by the Jest configuration.
 */
global.requestAnimationFrame = (callback) => {
  setTimeout(callback, 0);
};
