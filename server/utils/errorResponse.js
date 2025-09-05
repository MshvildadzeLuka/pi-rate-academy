/**
 * A custom error class to create standardized error responses
 * with an associated HTTP status code.
 */
class ErrorResponse extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

module.exports = ErrorResponse;