'use strict';
// Profile has no schema of its own — it operates on the existing User and
// Teacher models registered by the authentication/principal modules.
module.exports = require('./routes');
