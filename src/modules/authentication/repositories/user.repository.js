'use strict';

const BaseRepository = require('../../../core/BaseRepository');

/**
 * Data access for User documents. Tenant-agnostic: every method receives the
 * tenant-bound `User` model (resolved from req.db) so one repository instance
 * serves all schools.
 */
class UserRepository extends BaseRepository {
  /**
   * Find a user by email WITH the password field selected (for login).
   * @param {import('mongoose').Model} User
   * @param {string} email
   */
  findByEmailWithPassword(User, email) {
    return User.findOne({ email: String(email).toLowerCase() })
      .select('+password')
      .exec();
  }

  /**
   * Find by id including internal fields needed for refresh validation.
   * @param {import('mongoose').Model} User
   * @param {string} id
   */
  findByIdForAuth(User, id) {
    return User.findById(id).select('+password').exec();
  }
}

module.exports = new UserRepository();
