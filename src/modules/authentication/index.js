'use strict';

/**
 * Module entry point. Requiring a module's models here (for their registration
 * side-effect) guarantees every tenant-scoped schema is in the model registry
 * before any tenant connection is bound — regardless of whether a controller
 * happens to import the model directly.
 *
 * Convention for every future module: import its models here, export its router.
 */
require('./models/user.model'); // registers 'User'

module.exports = {
  routes: require('./routes'),
};
