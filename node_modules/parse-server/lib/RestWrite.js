"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _RestQuery = _interopRequireDefault(require("./RestQuery"));
var _lodash = _interopRequireDefault(require("lodash"));
var _logger = _interopRequireDefault(require("./logger"));
var _SchemaController = require("./Controllers/SchemaController");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
// A RestWrite encapsulates everything we need to run an operation
// that writes to the database.
// This could be either a "create" or an "update".

var SchemaController = require('./Controllers/SchemaController');
var deepcopy = require('deepcopy');
const Auth = require('./Auth');
const Utils = require('./Utils');
var cryptoUtils = require('./cryptoUtils');
var passwordCrypto = require('./password');
var Parse = require('parse/node');
var triggers = require('./triggers');
var ClientSDK = require('./ClientSDK');
const util = require('util');
// query and data are both provided in REST API format. So data
// types are encoded by plain old objects.
// If query is null, this is a "create" and the data in data should be
// created.
// Otherwise this is an "update" - the object matching the query
// should get updated with data.
// RestWrite will handle objectId, createdAt, and updatedAt for
// everything. It also knows to use triggers and special modifications
// for the _User class.
function RestWrite(config, auth, className, query, data, originalData, clientSDK, context, action) {
  if (auth.isReadOnly) {
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Cannot perform a write operation when using readOnlyMasterKey');
  }
  this.config = config;
  this.auth = auth;
  this.className = className;
  this.clientSDK = clientSDK;
  this.storage = {};
  this.runOptions = {};
  this.context = context || {};
  if (action) {
    this.runOptions.action = action;
  }
  if (!query) {
    if (this.config.allowCustomObjectId) {
      if (Object.prototype.hasOwnProperty.call(data, 'objectId') && !data.objectId) {
        throw new Parse.Error(Parse.Error.MISSING_OBJECT_ID, 'objectId must not be empty, null or undefined');
      }
    } else {
      if (data.objectId) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'objectId is an invalid field name.');
      }
      if (data.id) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'id is an invalid field name.');
      }
    }
  }

  // When the operation is complete, this.response may have several
  // fields.
  // response: the actual data to be returned
  // status: the http status code. if not present, treated like a 200
  // location: the location header. if not present, no location header
  this.response = null;

  // Processing this operation may mutate our data, so we operate on a
  // copy
  this.query = deepcopy(query);
  this.data = deepcopy(data);
  // We never change originalData, so we do not need a deep copy
  this.originalData = originalData;

  // The timestamp we'll use for this whole operation
  this.updatedAt = Parse._encode(new Date()).iso;

  // Shared SchemaController to be reused to reduce the number of loadSchema() calls per request
  // Once set the schemaData should be immutable
  this.validSchemaController = null;
  this.pendingOps = {
    operations: null,
    identifier: null
  };
}

// A convenient method to perform all the steps of processing the
// write, in order.
// Returns a promise for a {response, status, location} object.
// status and location are optional.
RestWrite.prototype.execute = function () {
  return Promise.resolve().then(() => {
    return this.getUserAndRoleACL();
  }).then(() => {
    return this.validateClientClassCreation();
  }).then(() => {
    return this.handleInstallation();
  }).then(() => {
    return this.handleSession();
  }).then(() => {
    return this.validateAuthData();
  }).then(() => {
    return this.checkRestrictedFields();
  }).then(() => {
    return this.runBeforeSaveTrigger();
  }).then(() => {
    return this.ensureUniqueAuthDataId();
  }).then(() => {
    return this.deleteEmailResetTokenIfNeeded();
  }).then(() => {
    return this.validateSchema();
  }).then(schemaController => {
    this.validSchemaController = schemaController;
    return this.setRequiredFieldsIfNeeded();
  }).then(() => {
    return this.transformUser();
  }).then(() => {
    return this.expandFilesForExistingObjects();
  }).then(() => {
    return this.destroyDuplicatedSessions();
  }).then(() => {
    return this.runDatabaseOperation();
  }).then(() => {
    return this.createSessionTokenIfNeeded();
  }).then(() => {
    return this.handleFollowup();
  }).then(() => {
    return this.runAfterSaveTrigger();
  }).then(() => {
    return this.cleanUserAuthData();
  }).then(() => {
    // Append the authDataResponse if exists
    if (this.authDataResponse) {
      if (this.response && this.response.response) {
        this.response.response.authDataResponse = this.authDataResponse;
      }
    }
    if (this.storage.rejectSignup && this.config.preventSignupWithUnverifiedEmail) {
      throw new Parse.Error(Parse.Error.EMAIL_NOT_FOUND, 'User email is not verified.');
    }
    return this.response;
  });
};

// Uses the Auth object to get the list of roles, adds the user id
RestWrite.prototype.getUserAndRoleACL = function () {
  if (this.auth.isMaster || this.auth.isMaintenance) {
    return Promise.resolve();
  }
  this.runOptions.acl = ['*'];
  if (this.auth.user) {
    return this.auth.getUserRoles().then(roles => {
      this.runOptions.acl = this.runOptions.acl.concat(roles, [this.auth.user.id]);
      return;
    });
  } else {
    return Promise.resolve();
  }
};

// Validates this operation against the allowClientClassCreation config.
RestWrite.prototype.validateClientClassCreation = function () {
  if (this.config.allowClientClassCreation === false && !this.auth.isMaster && !this.auth.isMaintenance && SchemaController.systemClasses.indexOf(this.className) === -1) {
    return this.config.database.loadSchema().then(schemaController => schemaController.hasClass(this.className)).then(hasClass => {
      if (hasClass !== true) {
        throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'This user is not allowed to access ' + 'non-existent class: ' + this.className);
      }
    });
  } else {
    return Promise.resolve();
  }
};

// Validates this operation against the schema.
RestWrite.prototype.validateSchema = function () {
  return this.config.database.validateObject(this.className, this.data, this.query, this.runOptions, this.auth.isMaintenance);
};

// Runs any beforeSave triggers against this operation.
// Any change leads to our data being mutated.
RestWrite.prototype.runBeforeSaveTrigger = function () {
  if (this.response || this.runOptions.many) {
    return;
  }

  // Avoid doing any setup for triggers if there is no 'beforeSave' trigger for this class.
  if (!triggers.triggerExists(this.className, triggers.Types.beforeSave, this.config.applicationId)) {
    return Promise.resolve();
  }
  const {
    originalObject,
    updatedObject
  } = this.buildParseObjects();
  const identifier = updatedObject._getStateIdentifier();
  const stateController = Parse.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(identifier);
  this.pendingOps = {
    operations: _objectSpread({}, pending),
    identifier
  };
  return Promise.resolve().then(() => {
    // Before calling the trigger, validate the permissions for the save operation
    let databasePromise = null;
    if (this.query) {
      // Validate for updating
      databasePromise = this.config.database.update(this.className, this.query, this.data, this.runOptions, true, true);
    } else {
      // Validate for creating
      databasePromise = this.config.database.create(this.className, this.data, this.runOptions, true);
    }
    // In the case that there is no permission for the operation, it throws an error
    return databasePromise.then(result => {
      if (!result || result.length <= 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
      }
    });
  }).then(() => {
    return triggers.maybeRunTrigger(triggers.Types.beforeSave, this.auth, updatedObject, originalObject, this.config, this.context);
  }).then(response => {
    if (response && response.object) {
      this.storage.fieldsChangedByTrigger = _lodash.default.reduce(response.object, (result, value, key) => {
        if (!_lodash.default.isEqual(this.data[key], value)) {
          result.push(key);
        }
        return result;
      }, []);
      this.data = response.object;
      // We should delete the objectId for an update write
      if (this.query && this.query.objectId) {
        delete this.data.objectId;
      }
    }
    try {
      Utils.checkProhibitedKeywords(this.config, this.data);
    } catch (error) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, error);
    }
  });
};
RestWrite.prototype.runBeforeLoginTrigger = async function (userData) {
  // Avoid doing any setup for triggers if there is no 'beforeLogin' trigger
  if (!triggers.triggerExists(this.className, triggers.Types.beforeLogin, this.config.applicationId)) {
    return;
  }

  // Cloud code gets a bit of extra data for its objects
  const extraData = {
    className: this.className
  };

  // Expand file objects
  this.config.filesController.expandFilesInObject(this.config, userData);
  const user = triggers.inflate(extraData, userData);

  // no need to return a response
  await triggers.maybeRunTrigger(triggers.Types.beforeLogin, this.auth, user, null, this.config, this.context);
};
RestWrite.prototype.setRequiredFieldsIfNeeded = function () {
  if (this.data) {
    return this.validSchemaController.getAllClasses().then(allClasses => {
      const schema = allClasses.find(oneClass => oneClass.className === this.className);
      const setRequiredFieldIfNeeded = (fieldName, setDefault) => {
        if (this.data[fieldName] === undefined || this.data[fieldName] === null || this.data[fieldName] === '' || typeof this.data[fieldName] === 'object' && this.data[fieldName].__op === 'Delete') {
          if (setDefault && schema.fields[fieldName] && schema.fields[fieldName].defaultValue !== null && schema.fields[fieldName].defaultValue !== undefined && (this.data[fieldName] === undefined || typeof this.data[fieldName] === 'object' && this.data[fieldName].__op === 'Delete')) {
            this.data[fieldName] = schema.fields[fieldName].defaultValue;
            this.storage.fieldsChangedByTrigger = this.storage.fieldsChangedByTrigger || [];
            if (this.storage.fieldsChangedByTrigger.indexOf(fieldName) < 0) {
              this.storage.fieldsChangedByTrigger.push(fieldName);
            }
          } else if (schema.fields[fieldName] && schema.fields[fieldName].required === true) {
            throw new Parse.Error(Parse.Error.VALIDATION_ERROR, `${fieldName} is required`);
          }
        }
      };

      // Add default fields
      if (!this.query) {
        // allow customizing createdAt and updatedAt when using maintenance key
        if (this.auth.isMaintenance && this.data.createdAt && this.data.createdAt.__type === 'Date') {
          this.data.createdAt = this.data.createdAt.iso;
          if (this.data.updatedAt && this.data.updatedAt.__type === 'Date') {
            const createdAt = new Date(this.data.createdAt);
            const updatedAt = new Date(this.data.updatedAt.iso);
            if (updatedAt < createdAt) {
              throw new Parse.Error(Parse.Error.VALIDATION_ERROR, 'updatedAt cannot occur before createdAt');
            }
            this.data.updatedAt = this.data.updatedAt.iso;
          }
          // if no updatedAt is provided, set it to createdAt to match default behavior
          else {
            this.data.updatedAt = this.data.createdAt;
          }
        } else {
          this.data.updatedAt = this.updatedAt;
          this.data.createdAt = this.updatedAt;
        }

        // Only assign new objectId if we are creating new object
        if (!this.data.objectId) {
          this.data.objectId = cryptoUtils.newObjectId(this.config.objectIdSize);
        }
        if (schema) {
          Object.keys(schema.fields).forEach(fieldName => {
            setRequiredFieldIfNeeded(fieldName, true);
          });
        }
      } else if (schema) {
        this.data.updatedAt = this.updatedAt;
        Object.keys(this.data).forEach(fieldName => {
          setRequiredFieldIfNeeded(fieldName, false);
        });
      }
    });
  }
  return Promise.resolve();
};

// Transforms auth data for a user object.
// Does nothing if this isn't a user object.
// Returns a promise for when we're done if it can't finish this tick.
RestWrite.prototype.validateAuthData = function () {
  if (this.className !== '_User') {
    return;
  }
  const authData = this.data.authData;
  const hasUsernameAndPassword = typeof this.data.username === 'string' && typeof this.data.password === 'string';
  if (!this.query && !authData) {
    if (typeof this.data.username !== 'string' || _lodash.default.isEmpty(this.data.username)) {
      throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'bad or missing username');
    }
    if (typeof this.data.password !== 'string' || _lodash.default.isEmpty(this.data.password)) {
      throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'password is required');
    }
  }
  if (authData && !Object.keys(authData).length || !Object.prototype.hasOwnProperty.call(this.data, 'authData')) {
    // Nothing to validate here
    return;
  } else if (Object.prototype.hasOwnProperty.call(this.data, 'authData') && !this.data.authData) {
    // Handle saving authData to null
    throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
  }
  var providers = Object.keys(authData);
  if (providers.length > 0) {
    const canHandleAuthData = providers.some(provider => {
      var providerAuthData = authData[provider];
      var hasToken = providerAuthData && providerAuthData.id;
      return hasToken || providerAuthData === null;
    });
    if (canHandleAuthData || hasUsernameAndPassword || this.auth.isMaster || this.getUserId()) {
      return this.handleAuthData(authData);
    }
  }
  throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
};
RestWrite.prototype.filteredObjectsByACL = function (objects) {
  if (this.auth.isMaster || this.auth.isMaintenance) {
    return objects;
  }
  return objects.filter(object => {
    if (!object.ACL) {
      return true; // legacy users that have no ACL field on them
    }
    // Regular users that have been locked out.
    return object.ACL && Object.keys(object.ACL).length > 0;
  });
};
RestWrite.prototype.getUserId = function () {
  if (this.query && this.query.objectId && this.className === '_User') {
    return this.query.objectId;
  } else if (this.auth && this.auth.user && this.auth.user.id) {
    return this.auth.user.id;
  }
};

// Developers are allowed to change authData via before save trigger
// we need after before save to ensure that the developer
// is not currently duplicating auth data ID
RestWrite.prototype.ensureUniqueAuthDataId = async function () {
  if (this.className !== '_User' || !this.data.authData) {
    return;
  }
  const hasAuthDataId = Object.keys(this.data.authData).some(key => this.data.authData[key] && this.data.authData[key].id);
  if (!hasAuthDataId) return;
  const r = await Auth.findUsersWithAuthData(this.config, this.data.authData);
  const results = this.filteredObjectsByACL(r);
  if (results.length > 1) {
    throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
  }
  // use data.objectId in case of login time and found user during handle validateAuthData
  const userId = this.getUserId() || this.data.objectId;
  if (results.length === 1 && userId !== results[0].objectId) {
    throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
  }
};
RestWrite.prototype.handleAuthData = async function (authData) {
  const r = await Auth.findUsersWithAuthData(this.config, authData);
  const results = this.filteredObjectsByACL(r);
  if (results.length > 1) {
    // To avoid https://github.com/parse-community/parse-server/security/advisories/GHSA-8w3j-g983-8jh5
    // Let's run some validation before throwing
    await Auth.handleAuthDataValidation(authData, this, results[0]);
    throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
  }

  // No user found with provided authData we need to validate
  if (!results.length) {
    const {
      authData: validatedAuthData,
      authDataResponse
    } = await Auth.handleAuthDataValidation(authData, this);
    this.authDataResponse = authDataResponse;
    // Replace current authData by the new validated one
    this.data.authData = validatedAuthData;
    return;
  }

  // User found with provided authData
  if (results.length === 1) {
    const userId = this.getUserId();
    const userResult = results[0];
    // Prevent duplicate authData id
    if (userId && userId !== userResult.objectId) {
      await Auth.handleAuthDataValidation(authData, this, results[0]);
      throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
    }
    this.storage.authProvider = Object.keys(authData).join(',');
    const {
      hasMutatedAuthData,
      mutatedAuthData
    } = Auth.hasMutatedAuthData(authData, userResult.authData);
    const isCurrentUserLoggedOrMaster = this.auth && this.auth.user && this.auth.user.id === userResult.objectId || this.auth.isMaster;
    const isLogin = !userId;
    if (isLogin || isCurrentUserLoggedOrMaster) {
      // no user making the call
      // OR the user making the call is the right one
      // Login with auth data
      delete results[0].password;

      // need to set the objectId first otherwise location has trailing undefined
      this.data.objectId = userResult.objectId;
      if (!this.query || !this.query.objectId) {
        this.response = {
          response: userResult,
          location: this.location()
        };
        // Run beforeLogin hook before storing any updates
        // to authData on the db; changes to userResult
        // will be ignored.
        await this.runBeforeLoginTrigger(deepcopy(userResult));

        // If we are in login operation via authData
        // we need to be sure that the user has provided
        // required authData
        Auth.checkIfUserHasProvidedConfiguredProvidersForLogin({
          config: this.config,
          auth: this.auth
        }, authData, userResult.authData, this.config);
      }

      // Prevent validating if no mutated data detected on update
      if (!hasMutatedAuthData && isCurrentUserLoggedOrMaster) {
        return;
      }

      // Force to validate all provided authData on login
      // on update only validate mutated ones
      if (hasMutatedAuthData || !this.config.allowExpiredAuthDataToken) {
        const res = await Auth.handleAuthDataValidation(isLogin ? authData : mutatedAuthData, this, userResult);
        this.data.authData = res.authData;
        this.authDataResponse = res.authDataResponse;
      }

      // IF we are in login we'll skip the database operation / beforeSave / afterSave etc...
      // we need to set it up there.
      // We are supposed to have a response only on LOGIN with authData, so we skip those
      // If we're not logging in, but just updating the current user, we can safely skip that part
      if (this.response) {
        // Assign the new authData in the response
        Object.keys(mutatedAuthData).forEach(provider => {
          this.response.response.authData[provider] = mutatedAuthData[provider];
        });

        // Run the DB update directly, as 'master' only if authData contains some keys
        // authData could not contains keys after validation if the authAdapter
        // uses the `doNotSave` option. Just update the authData part
        // Then we're good for the user, early exit of sorts
        if (Object.keys(this.data.authData).length) {
          await this.config.database.update(this.className, {
            objectId: this.data.objectId
          }, {
            authData: this.data.authData
          }, {});
        }
      }
    }
  }
};
RestWrite.prototype.checkRestrictedFields = async function () {
  if (this.className !== '_User') {
    return;
  }
  if (!this.auth.isMaintenance && !this.auth.isMaster && 'emailVerified' in this.data) {
    const error = `Clients aren't allowed to manually update email verification.`;
    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, error);
  }
};

// The non-third-party parts of User transformation
RestWrite.prototype.transformUser = async function () {
  var promise = Promise.resolve();
  if (this.className !== '_User') {
    return promise;
  }

  // Do not cleanup session if objectId is not set
  if (this.query && this.objectId()) {
    // If we're updating a _User object, we need to clear out the cache for that user. Find all their
    // session tokens, and remove them from the cache.
    const query = await (0, _RestQuery.default)({
      method: _RestQuery.default.Method.find,
      config: this.config,
      auth: Auth.master(this.config),
      className: '_Session',
      runBeforeFind: false,
      restWhere: {
        user: {
          __type: 'Pointer',
          className: '_User',
          objectId: this.objectId()
        }
      }
    });
    promise = query.execute().then(results => {
      results.results.forEach(session => this.config.cacheController.user.del(session.sessionToken));
    });
  }
  return promise.then(() => {
    // Transform the password
    if (this.data.password === undefined) {
      // ignore only if undefined. should proceed if empty ('')
      return Promise.resolve();
    }
    if (this.query) {
      this.storage['clearSessions'] = true;
      // Generate a new session only if the user requested
      if (!this.auth.isMaster && !this.auth.isMaintenance) {
        this.storage['generateNewSession'] = true;
      }
    }
    return this._validatePasswordPolicy().then(() => {
      return passwordCrypto.hash(this.data.password).then(hashedPassword => {
        this.data._hashed_password = hashedPassword;
        delete this.data.password;
      });
    });
  }).then(() => {
    return this._validateUserName();
  }).then(() => {
    return this._validateEmail();
  });
};
RestWrite.prototype._validateUserName = function () {
  // Check for username uniqueness
  if (!this.data.username) {
    if (!this.query) {
      this.data.username = cryptoUtils.randomString(25);
      this.responseShouldHaveUsername = true;
    }
    return Promise.resolve();
  }
  /*
    Usernames should be unique when compared case insensitively
     Users should be able to make case sensitive usernames and
    login using the case they entered.  I.e. 'Snoopy' should preclude
    'snoopy' as a valid username.
  */
  return this.config.database.find(this.className, {
    username: this.data.username,
    objectId: {
      $ne: this.objectId()
    }
  }, {
    limit: 1,
    caseInsensitive: true
  }, {}, this.validSchemaController).then(results => {
    if (results.length > 0) {
      throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
    }
    return;
  });
};

/*
  As with usernames, Parse should not allow case insensitive collisions of email.
  unlike with usernames (which can have case insensitive collisions in the case of
  auth adapters), emails should never have a case insensitive collision.

  This behavior can be enforced through a properly configured index see:
  https://docs.mongodb.com/manual/core/index-case-insensitive/#create-a-case-insensitive-index
  which could be implemented instead of this code based validation.

  Given that this lookup should be a relatively low use case and that the case sensitive
  unique index will be used by the db for the query, this is an adequate solution.
*/
RestWrite.prototype._validateEmail = function () {
  if (!this.data.email || this.data.email.__op === 'Delete') {
    return Promise.resolve();
  }
  // Validate basic email address format
  if (!this.data.email.match(/^.+@.+$/)) {
    return Promise.reject(new Parse.Error(Parse.Error.INVALID_EMAIL_ADDRESS, 'Email address format is invalid.'));
  }
  // Case insensitive match, see note above function.
  return this.config.database.find(this.className, {
    email: this.data.email,
    objectId: {
      $ne: this.objectId()
    }
  }, {
    limit: 1,
    caseInsensitive: true
  }, {}, this.validSchemaController).then(results => {
    if (results.length > 0) {
      throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
    }
    if (!this.data.authData || !Object.keys(this.data.authData).length || Object.keys(this.data.authData).length === 1 && Object.keys(this.data.authData)[0] === 'anonymous') {
      // We updated the email, send a new validation
      const {
        originalObject,
        updatedObject
      } = this.buildParseObjects();
      const request = {
        original: originalObject,
        object: updatedObject,
        master: this.auth.isMaster,
        ip: this.config.ip,
        installationId: this.auth.installationId
      };
      return this.config.userController.setEmailVerifyToken(this.data, request, this.storage);
    }
  });
};
RestWrite.prototype._validatePasswordPolicy = function () {
  if (!this.config.passwordPolicy) return Promise.resolve();
  return this._validatePasswordRequirements().then(() => {
    return this._validatePasswordHistory();
  });
};
RestWrite.prototype._validatePasswordRequirements = function () {
  // check if the password conforms to the defined password policy if configured
  // If we specified a custom error in our configuration use it.
  // Example: "Passwords must include a Capital Letter, Lowercase Letter, and a number."
  //
  // This is especially useful on the generic "password reset" page,
  // as it allows the programmer to communicate specific requirements instead of:
  // a. making the user guess whats wrong
  // b. making a custom password reset page that shows the requirements
  const policyError = this.config.passwordPolicy.validationError ? this.config.passwordPolicy.validationError : 'Password does not meet the Password Policy requirements.';
  const containsUsernameError = 'Password cannot contain your username.';

  // check whether the password meets the password strength requirements
  if (this.config.passwordPolicy.patternValidator && !this.config.passwordPolicy.patternValidator(this.data.password) || this.config.passwordPolicy.validatorCallback && !this.config.passwordPolicy.validatorCallback(this.data.password)) {
    return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, policyError));
  }

  // check whether password contain username
  if (this.config.passwordPolicy.doNotAllowUsername === true) {
    if (this.data.username) {
      // username is not passed during password reset
      if (this.data.password.indexOf(this.data.username) >= 0) return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, containsUsernameError));
    } else {
      // retrieve the User object using objectId during password reset
      return this.config.database.find('_User', {
        objectId: this.objectId()
      }).then(results => {
        if (results.length != 1) {
          throw undefined;
        }
        if (this.data.password.indexOf(results[0].username) >= 0) return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, containsUsernameError));
        return Promise.resolve();
      });
    }
  }
  return Promise.resolve();
};
RestWrite.prototype._validatePasswordHistory = function () {
  // check whether password is repeating from specified history
  if (this.query && this.config.passwordPolicy.maxPasswordHistory) {
    return this.config.database.find('_User', {
      objectId: this.objectId()
    }, {
      keys: ['_password_history', '_hashed_password']
    }, Auth.maintenance(this.config)).then(results => {
      if (results.length != 1) {
        throw undefined;
      }
      const user = results[0];
      let oldPasswords = [];
      if (user._password_history) oldPasswords = _lodash.default.take(user._password_history, this.config.passwordPolicy.maxPasswordHistory - 1);
      oldPasswords.push(user.password);
      const newPassword = this.data.password;
      // compare the new password hash with all old password hashes
      const promises = oldPasswords.map(function (hash) {
        return passwordCrypto.compare(newPassword, hash).then(result => {
          if (result)
            // reject if there is a match
            return Promise.reject('REPEAT_PASSWORD');
          return Promise.resolve();
        });
      });
      // wait for all comparisons to complete
      return Promise.all(promises).then(() => {
        return Promise.resolve();
      }).catch(err => {
        if (err === 'REPEAT_PASSWORD')
          // a match was found
          return Promise.reject(new Parse.Error(Parse.Error.VALIDATION_ERROR, `New password should not be the same as last ${this.config.passwordPolicy.maxPasswordHistory} passwords.`));
        throw err;
      });
    });
  }
  return Promise.resolve();
};
RestWrite.prototype.createSessionTokenIfNeeded = async function () {
  if (this.className !== '_User') {
    return;
  }
  // Don't generate session for updating user (this.query is set) unless authData exists
  if (this.query && !this.data.authData) {
    return;
  }
  // Don't generate new sessionToken if linking via sessionToken
  if (this.auth.user && this.data.authData) {
    return;
  }
  // If sign-up call
  if (!this.storage.authProvider) {
    // Create request object for verification functions
    const {
      originalObject,
      updatedObject
    } = this.buildParseObjects();
    const request = {
      original: originalObject,
      object: updatedObject,
      master: this.auth.isMaster,
      ip: this.config.ip,
      installationId: this.auth.installationId
    };
    // Get verification conditions which can be booleans or functions; the purpose of this async/await
    // structure is to avoid unnecessarily executing subsequent functions if previous ones fail in the
    // conditional statement below, as a developer may decide to execute expensive operations in them
    const verifyUserEmails = async () => this.config.verifyUserEmails === true || typeof this.config.verifyUserEmails === 'function' && (await Promise.resolve(this.config.verifyUserEmails(request))) === true;
    const preventLoginWithUnverifiedEmail = async () => this.config.preventLoginWithUnverifiedEmail === true || typeof this.config.preventLoginWithUnverifiedEmail === 'function' && (await Promise.resolve(this.config.preventLoginWithUnverifiedEmail(request))) === true;
    // If verification is required
    if ((await verifyUserEmails()) && (await preventLoginWithUnverifiedEmail())) {
      this.storage.rejectSignup = true;
      return;
    }
  }
  return this.createSessionToken();
};
RestWrite.prototype.createSessionToken = async function () {
  // cloud installationId from Cloud Code,
  // never create session tokens from there.
  if (this.auth.installationId && this.auth.installationId === 'cloud') {
    return;
  }
  if (this.storage.authProvider == null && this.data.authData) {
    this.storage.authProvider = Object.keys(this.data.authData).join(',');
  }
  const {
    sessionData,
    createSession
  } = RestWrite.createSession(this.config, {
    userId: this.objectId(),
    createdWith: {
      action: this.storage.authProvider ? 'login' : 'signup',
      authProvider: this.storage.authProvider || 'password'
    },
    installationId: this.auth.installationId
  });
  if (this.response && this.response.response) {
    this.response.response.sessionToken = sessionData.sessionToken;
  }
  return createSession();
};
RestWrite.createSession = function (config, {
  userId,
  createdWith,
  installationId,
  additionalSessionData
}) {
  const token = 'r:' + cryptoUtils.newToken();
  const expiresAt = config.generateSessionExpiresAt();
  const sessionData = {
    sessionToken: token,
    user: {
      __type: 'Pointer',
      className: '_User',
      objectId: userId
    },
    createdWith,
    expiresAt: Parse._encode(expiresAt)
  };
  if (installationId) {
    sessionData.installationId = installationId;
  }
  Object.assign(sessionData, additionalSessionData);
  return {
    sessionData,
    createSession: () => new RestWrite(config, Auth.master(config), '_Session', null, sessionData).execute()
  };
};

// Delete email reset tokens if user is changing password or email.
RestWrite.prototype.deleteEmailResetTokenIfNeeded = function () {
  if (this.className !== '_User' || this.query === null) {
    // null query means create
    return;
  }
  if ('password' in this.data || 'email' in this.data) {
    const addOps = {
      _perishable_token: {
        __op: 'Delete'
      },
      _perishable_token_expires_at: {
        __op: 'Delete'
      }
    };
    this.data = Object.assign(this.data, addOps);
  }
};
RestWrite.prototype.destroyDuplicatedSessions = function () {
  // Only for _Session, and at creation time
  if (this.className != '_Session' || this.query) {
    return;
  }
  // Destroy the sessions in 'Background'
  const {
    user,
    installationId,
    sessionToken
  } = this.data;
  if (!user || !installationId) {
    return;
  }
  if (!user.objectId) {
    return;
  }
  this.config.database.destroy('_Session', {
    user,
    installationId,
    sessionToken: {
      $ne: sessionToken
    }
  }, {}, this.validSchemaController);
};

// Handles any followup logic
RestWrite.prototype.handleFollowup = function () {
  if (this.storage && this.storage['clearSessions'] && this.config.revokeSessionOnPasswordReset) {
    var sessionQuery = {
      user: {
        __type: 'Pointer',
        className: '_User',
        objectId: this.objectId()
      }
    };
    delete this.storage['clearSessions'];
    return this.config.database.destroy('_Session', sessionQuery).then(this.handleFollowup.bind(this));
  }
  if (this.storage && this.storage['generateNewSession']) {
    delete this.storage['generateNewSession'];
    return this.createSessionToken().then(this.handleFollowup.bind(this));
  }
  if (this.storage && this.storage['sendVerificationEmail']) {
    delete this.storage['sendVerificationEmail'];
    // Fire and forget!
    this.config.userController.sendVerificationEmail(this.data, {
      auth: this.auth
    });
    return this.handleFollowup.bind(this);
  }
};

// Handles the _Session class specialness.
// Does nothing if this isn't an _Session object.
RestWrite.prototype.handleSession = function () {
  if (this.response || this.className !== '_Session') {
    return;
  }
  if (!this.auth.user && !this.auth.isMaster && !this.auth.isMaintenance) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token required.');
  }

  // TODO: Verify proper error to throw
  if (this.data.ACL) {
    throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'Cannot set ' + 'ACL on a Session.');
  }
  if (this.query) {
    if (this.data.user && !this.auth.isMaster && this.data.user.objectId != this.auth.user.id) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    } else if (this.data.installationId) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    } else if (this.data.sessionToken) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME);
    }
    if (!this.auth.isMaster) {
      this.query = {
        $and: [this.query, {
          user: {
            __type: 'Pointer',
            className: '_User',
            objectId: this.auth.user.id
          }
        }]
      };
    }
  }
  if (!this.query && !this.auth.isMaster && !this.auth.isMaintenance) {
    const additionalSessionData = {};
    for (var key in this.data) {
      if (key === 'objectId' || key === 'user') {
        continue;
      }
      additionalSessionData[key] = this.data[key];
    }
    const {
      sessionData,
      createSession
    } = RestWrite.createSession(this.config, {
      userId: this.auth.user.id,
      createdWith: {
        action: 'create'
      },
      additionalSessionData
    });
    return createSession().then(results => {
      if (!results.response) {
        throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Error creating session.');
      }
      sessionData['objectId'] = results.response['objectId'];
      this.response = {
        status: 201,
        location: results.location,
        response: sessionData
      };
    });
  }
};

// Handles the _Installation class specialness.
// Does nothing if this isn't an installation object.
// If an installation is found, this can mutate this.query and turn a create
// into an update.
// Returns a promise for when we're done if it can't finish this tick.
RestWrite.prototype.handleInstallation = function () {
  if (this.response || this.className !== '_Installation') {
    return;
  }
  if (!this.query && !this.data.deviceToken && !this.data.installationId && !this.auth.installationId) {
    throw new Parse.Error(135, 'at least one ID field (deviceToken, installationId) ' + 'must be specified in this operation');
  }

  // If the device token is 64 characters long, we assume it is for iOS
  // and lowercase it.
  if (this.data.deviceToken && this.data.deviceToken.length == 64) {
    this.data.deviceToken = this.data.deviceToken.toLowerCase();
  }

  // We lowercase the installationId if present
  if (this.data.installationId) {
    this.data.installationId = this.data.installationId.toLowerCase();
  }
  let installationId = this.data.installationId;

  // If data.installationId is not set and we're not master, we can lookup in auth
  if (!installationId && !this.auth.isMaster && !this.auth.isMaintenance) {
    installationId = this.auth.installationId;
  }
  if (installationId) {
    installationId = installationId.toLowerCase();
  }

  // Updating _Installation but not updating anything critical
  if (this.query && !this.data.deviceToken && !installationId && !this.data.deviceType) {
    return;
  }
  var promise = Promise.resolve();
  var idMatch; // Will be a match on either objectId or installationId
  var objectIdMatch;
  var installationIdMatch;
  var deviceTokenMatches = [];

  // Instead of issuing 3 reads, let's do it with one OR.
  const orQueries = [];
  if (this.query && this.query.objectId) {
    orQueries.push({
      objectId: this.query.objectId
    });
  }
  if (installationId) {
    orQueries.push({
      installationId: installationId
    });
  }
  if (this.data.deviceToken) {
    orQueries.push({
      deviceToken: this.data.deviceToken
    });
  }
  if (orQueries.length == 0) {
    return;
  }
  promise = promise.then(() => {
    return this.config.database.find('_Installation', {
      $or: orQueries
    }, {});
  }).then(results => {
    results.forEach(result => {
      if (this.query && this.query.objectId && result.objectId == this.query.objectId) {
        objectIdMatch = result;
      }
      if (result.installationId == installationId) {
        installationIdMatch = result;
      }
      if (result.deviceToken == this.data.deviceToken) {
        deviceTokenMatches.push(result);
      }
    });

    // Sanity checks when running a query
    if (this.query && this.query.objectId) {
      if (!objectIdMatch) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found for update.');
      }
      if (this.data.installationId && objectIdMatch.installationId && this.data.installationId !== objectIdMatch.installationId) {
        throw new Parse.Error(136, 'installationId may not be changed in this ' + 'operation');
      }
      if (this.data.deviceToken && objectIdMatch.deviceToken && this.data.deviceToken !== objectIdMatch.deviceToken && !this.data.installationId && !objectIdMatch.installationId) {
        throw new Parse.Error(136, 'deviceToken may not be changed in this ' + 'operation');
      }
      if (this.data.deviceType && this.data.deviceType && this.data.deviceType !== objectIdMatch.deviceType) {
        throw new Parse.Error(136, 'deviceType may not be changed in this ' + 'operation');
      }
    }
    if (this.query && this.query.objectId && objectIdMatch) {
      idMatch = objectIdMatch;
    }
    if (installationId && installationIdMatch) {
      idMatch = installationIdMatch;
    }
    // need to specify deviceType only if it's new
    if (!this.query && !this.data.deviceType && !idMatch) {
      throw new Parse.Error(135, 'deviceType must be specified in this operation');
    }
  }).then(() => {
    if (!idMatch) {
      if (!deviceTokenMatches.length) {
        return;
      } else if (deviceTokenMatches.length == 1 && (!deviceTokenMatches[0]['installationId'] || !installationId)) {
        // Single match on device token but none on installationId, and either
        // the passed object or the match is missing an installationId, so we
        // can just return the match.
        return deviceTokenMatches[0]['objectId'];
      } else if (!this.data.installationId) {
        throw new Parse.Error(132, 'Must specify installationId when deviceToken ' + 'matches multiple Installation objects');
      } else {
        // Multiple device token matches and we specified an installation ID,
        // or a single match where both the passed and matching objects have
        // an installation ID. Try cleaning out old installations that match
        // the deviceToken, and return nil to signal that a new object should
        // be created.
        var delQuery = {
          deviceToken: this.data.deviceToken,
          installationId: {
            $ne: installationId
          }
        };
        if (this.data.appIdentifier) {
          delQuery['appIdentifier'] = this.data.appIdentifier;
        }
        this.config.database.destroy('_Installation', delQuery).catch(err => {
          if (err.code == Parse.Error.OBJECT_NOT_FOUND) {
            // no deletions were made. Can be ignored.
            return;
          }
          // rethrow the error
          throw err;
        });
        return;
      }
    } else {
      if (deviceTokenMatches.length == 1 && !deviceTokenMatches[0]['installationId']) {
        // Exactly one device token match and it doesn't have an installation
        // ID. This is the one case where we want to merge with the existing
        // object.
        const delQuery = {
          objectId: idMatch.objectId
        };
        return this.config.database.destroy('_Installation', delQuery).then(() => {
          return deviceTokenMatches[0]['objectId'];
        }).catch(err => {
          if (err.code == Parse.Error.OBJECT_NOT_FOUND) {
            // no deletions were made. Can be ignored
            return;
          }
          // rethrow the error
          throw err;
        });
      } else {
        if (this.data.deviceToken && idMatch.deviceToken != this.data.deviceToken) {
          // We're setting the device token on an existing installation, so
          // we should try cleaning out old installations that match this
          // device token.
          const delQuery = {
            deviceToken: this.data.deviceToken
          };
          // We have a unique install Id, use that to preserve
          // the interesting installation
          if (this.data.installationId) {
            delQuery['installationId'] = {
              $ne: this.data.installationId
            };
          } else if (idMatch.objectId && this.data.objectId && idMatch.objectId == this.data.objectId) {
            // we passed an objectId, preserve that instalation
            delQuery['objectId'] = {
              $ne: idMatch.objectId
            };
          } else {
            // What to do here? can't really clean up everything...
            return idMatch.objectId;
          }
          if (this.data.appIdentifier) {
            delQuery['appIdentifier'] = this.data.appIdentifier;
          }
          this.config.database.destroy('_Installation', delQuery).catch(err => {
            if (err.code == Parse.Error.OBJECT_NOT_FOUND) {
              // no deletions were made. Can be ignored.
              return;
            }
            // rethrow the error
            throw err;
          });
        }
        // In non-merge scenarios, just return the installation match id
        return idMatch.objectId;
      }
    }
  }).then(objId => {
    if (objId) {
      this.query = {
        objectId: objId
      };
      delete this.data.objectId;
      delete this.data.createdAt;
    }
    // TODO: Validate ops (add/remove on channels, $inc on badge, etc.)
  });
  return promise;
};

// If we short-circuited the object response - then we need to make sure we expand all the files,
// since this might not have a query, meaning it won't return the full result back.
// TODO: (nlutsenko) This should die when we move to per-class based controllers on _Session/_User
RestWrite.prototype.expandFilesForExistingObjects = function () {
  // Check whether we have a short-circuited response - only then run expansion.
  if (this.response && this.response.response) {
    this.config.filesController.expandFilesInObject(this.config, this.response.response);
  }
};
RestWrite.prototype.runDatabaseOperation = function () {
  if (this.response) {
    return;
  }
  if (this.className === '_Role') {
    this.config.cacheController.role.clear();
    if (this.config.liveQueryController) {
      this.config.liveQueryController.clearCachedRoles(this.auth.user);
    }
  }
  if (this.className === '_User' && this.query && this.auth.isUnauthenticated()) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, `Cannot modify user ${this.query.objectId}.`);
  }
  if (this.className === '_Product' && this.data.download) {
    this.data.downloadName = this.data.download.name;
  }

  // TODO: Add better detection for ACL, ensuring a user can't be locked from
  //       their own user record.
  if (this.data.ACL && this.data.ACL['*unresolved']) {
    throw new Parse.Error(Parse.Error.INVALID_ACL, 'Invalid ACL.');
  }
  if (this.query) {
    // Force the user to not lockout
    // Matched with parse.com
    if (this.className === '_User' && this.data.ACL && this.auth.isMaster !== true && this.auth.isMaintenance !== true) {
      this.data.ACL[this.query.objectId] = {
        read: true,
        write: true
      };
    }
    // update password timestamp if user password is being changed
    if (this.className === '_User' && this.data._hashed_password && this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordAge) {
      this.data._password_changed_at = Parse._encode(new Date());
    }
    // Ignore createdAt when update
    delete this.data.createdAt;
    let defer = Promise.resolve();
    // if password history is enabled then save the current password to history
    if (this.className === '_User' && this.data._hashed_password && this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordHistory) {
      defer = this.config.database.find('_User', {
        objectId: this.objectId()
      }, {
        keys: ['_password_history', '_hashed_password']
      }, Auth.maintenance(this.config)).then(results => {
        if (results.length != 1) {
          throw undefined;
        }
        const user = results[0];
        let oldPasswords = [];
        if (user._password_history) {
          oldPasswords = _lodash.default.take(user._password_history, this.config.passwordPolicy.maxPasswordHistory);
        }
        //n-1 passwords go into history including last password
        while (oldPasswords.length > Math.max(0, this.config.passwordPolicy.maxPasswordHistory - 2)) {
          oldPasswords.shift();
        }
        oldPasswords.push(user.password);
        this.data._password_history = oldPasswords;
      });
    }
    return defer.then(() => {
      // Run an update
      return this.config.database.update(this.className, this.query, this.data, this.runOptions, false, false, this.validSchemaController).then(response => {
        response.updatedAt = this.updatedAt;
        this._updateResponseWithData(response, this.data);
        this.response = {
          response
        };
      });
    });
  } else {
    // Set the default ACL and password timestamp for the new _User
    if (this.className === '_User') {
      var ACL = this.data.ACL;
      // default public r/w ACL
      if (!ACL) {
        ACL = {};
        if (!this.config.enforcePrivateUsers) {
          ACL['*'] = {
            read: true,
            write: false
          };
        }
      }
      // make sure the user is not locked down
      ACL[this.data.objectId] = {
        read: true,
        write: true
      };
      this.data.ACL = ACL;
      // password timestamp to be used when password expiry policy is enforced
      if (this.config.passwordPolicy && this.config.passwordPolicy.maxPasswordAge) {
        this.data._password_changed_at = Parse._encode(new Date());
      }
    }

    // Run a create
    return this.config.database.create(this.className, this.data, this.runOptions, false, this.validSchemaController).catch(error => {
      if (this.className !== '_User' || error.code !== Parse.Error.DUPLICATE_VALUE) {
        throw error;
      }

      // Quick check, if we were able to infer the duplicated field name
      if (error && error.userInfo && error.userInfo.duplicated_field === 'username') {
        throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
      }
      if (error && error.userInfo && error.userInfo.duplicated_field === 'email') {
        throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
      }

      // If this was a failed user creation due to username or email already taken, we need to
      // check whether it was username or email and return the appropriate error.
      // Fallback to the original method
      // TODO: See if we can later do this without additional queries by using named indexes.
      return this.config.database.find(this.className, {
        username: this.data.username,
        objectId: {
          $ne: this.objectId()
        }
      }, {
        limit: 1
      }).then(results => {
        if (results.length > 0) {
          throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username.');
        }
        return this.config.database.find(this.className, {
          email: this.data.email,
          objectId: {
            $ne: this.objectId()
          }
        }, {
          limit: 1
        });
      }).then(results => {
        if (results.length > 0) {
          throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email address.');
        }
        throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, 'A duplicate value for a field with unique values was provided');
      });
    }).then(response => {
      response.objectId = this.data.objectId;
      response.createdAt = this.data.createdAt;
      if (this.responseShouldHaveUsername) {
        response.username = this.data.username;
      }
      this._updateResponseWithData(response, this.data);
      this.response = {
        status: 201,
        response,
        location: this.location()
      };
    });
  }
};

// Returns nothing - doesn't wait for the trigger.
RestWrite.prototype.runAfterSaveTrigger = function () {
  if (!this.response || !this.response.response || this.runOptions.many) {
    return;
  }

  // Avoid doing any setup for triggers if there is no 'afterSave' trigger for this class.
  const hasAfterSaveHook = triggers.triggerExists(this.className, triggers.Types.afterSave, this.config.applicationId);
  const hasLiveQuery = this.config.liveQueryController.hasLiveQuery(this.className);
  if (!hasAfterSaveHook && !hasLiveQuery) {
    return Promise.resolve();
  }
  const {
    originalObject,
    updatedObject
  } = this.buildParseObjects();
  updatedObject._handleSaveResponse(this.response.response, this.response.status || 200);
  if (hasLiveQuery) {
    this.config.database.loadSchema().then(schemaController => {
      // Notify LiveQueryServer if possible
      const perms = schemaController.getClassLevelPermissions(updatedObject.className);
      this.config.liveQueryController.onAfterSave(updatedObject.className, updatedObject, originalObject, perms);
    });
  }
  if (!hasAfterSaveHook) {
    return Promise.resolve();
  }
  // Run afterSave trigger
  return triggers.maybeRunTrigger(triggers.Types.afterSave, this.auth, updatedObject, originalObject, this.config, this.context).then(result => {
    const jsonReturned = result && !result._toFullJSON;
    if (jsonReturned) {
      this.pendingOps.operations = {};
      this.response.response = result;
    } else {
      this.response.response = this._updateResponseWithData((result || updatedObject).toJSON(), this.data);
    }
  }).catch(function (err) {
    _logger.default.warn('afterSave caught an error', err);
  });
};

// A helper to figure out what location this operation happens at.
RestWrite.prototype.location = function () {
  var middle = this.className === '_User' ? '/users/' : '/classes/' + this.className + '/';
  const mount = this.config.mount || this.config.serverURL;
  return mount + middle + this.data.objectId;
};

// A helper to get the object id for this operation.
// Because it could be either on the query or on the data
RestWrite.prototype.objectId = function () {
  return this.data.objectId || this.query.objectId;
};

// Returns a copy of the data and delete bad keys (_auth_data, _hashed_password...)
RestWrite.prototype.sanitizedData = function () {
  const data = Object.keys(this.data).reduce((data, key) => {
    // Regexp comes from Parse.Object.prototype.validate
    if (!/^[A-Za-z][0-9A-Za-z_]*$/.test(key)) {
      delete data[key];
    }
    return data;
  }, deepcopy(this.data));
  return Parse._decode(undefined, data);
};

// Returns an updated copy of the object
RestWrite.prototype.buildParseObjects = function () {
  var _this$query;
  const extraData = {
    className: this.className,
    objectId: (_this$query = this.query) === null || _this$query === void 0 ? void 0 : _this$query.objectId
  };
  let originalObject;
  if (this.query && this.query.objectId) {
    originalObject = triggers.inflate(extraData, this.originalData);
  }
  const className = Parse.Object.fromJSON(extraData);
  const readOnlyAttributes = className.constructor.readOnlyAttributes ? className.constructor.readOnlyAttributes() : [];
  if (!this.originalData) {
    for (const attribute of readOnlyAttributes) {
      extraData[attribute] = this.data[attribute];
    }
  }
  const updatedObject = triggers.inflate(extraData, this.originalData);
  Object.keys(this.data).reduce(function (data, key) {
    if (key.indexOf('.') > 0) {
      if (typeof data[key].__op === 'string') {
        if (!readOnlyAttributes.includes(key)) {
          updatedObject.set(key, data[key]);
        }
      } else {
        // subdocument key with dot notation { 'x.y': v } => { 'x': { 'y' : v } })
        const splittedKey = key.split('.');
        const parentProp = splittedKey[0];
        let parentVal = updatedObject.get(parentProp);
        if (typeof parentVal !== 'object') {
          parentVal = {};
        }
        parentVal[splittedKey[1]] = data[key];
        updatedObject.set(parentProp, parentVal);
      }
      delete data[key];
    }
    return data;
  }, deepcopy(this.data));
  const sanitized = this.sanitizedData();
  for (const attribute of readOnlyAttributes) {
    delete sanitized[attribute];
  }
  updatedObject.set(sanitized);
  return {
    updatedObject,
    originalObject
  };
};
RestWrite.prototype.cleanUserAuthData = function () {
  if (this.response && this.response.response && this.className === '_User') {
    const user = this.response.response;
    if (user.authData) {
      Object.keys(user.authData).forEach(provider => {
        if (user.authData[provider] === null) {
          delete user.authData[provider];
        }
      });
      if (Object.keys(user.authData).length == 0) {
        delete user.authData;
      }
    }
  }
};
RestWrite.prototype._updateResponseWithData = function (response, data) {
  const stateController = Parse.CoreManager.getObjectStateController();
  const [pending] = stateController.getPendingOps(this.pendingOps.identifier);
  for (const key in this.pendingOps.operations) {
    if (!pending[key]) {
      data[key] = this.originalData ? this.originalData[key] : {
        __op: 'Delete'
      };
      this.storage.fieldsChangedByTrigger.push(key);
    }
  }
  const skipKeys = [...(_SchemaController.requiredColumns.read[this.className] || [])];
  if (!this.query) {
    skipKeys.push('objectId', 'createdAt');
  } else {
    skipKeys.push('updatedAt');
    delete response.objectId;
  }
  for (const key in response) {
    if (skipKeys.includes(key)) {
      continue;
    }
    const value = response[key];
    if (value == null || value.__type && value.__type === 'Pointer' || util.isDeepStrictEqual(data[key], value) || util.isDeepStrictEqual((this.originalData || {})[key], value)) {
      delete response[key];
    }
  }
  if (_lodash.default.isEmpty(this.storage.fieldsChangedByTrigger)) {
    return response;
  }
  const clientSupportsDelete = ClientSDK.supportsForwardDelete(this.clientSDK);
  this.storage.fieldsChangedByTrigger.forEach(fieldName => {
    const dataValue = data[fieldName];
    if (!Object.prototype.hasOwnProperty.call(response, fieldName)) {
      response[fieldName] = dataValue;
    }

    // Strips operations from responses
    if (response[fieldName] && response[fieldName].__op) {
      delete response[fieldName];
      if (clientSupportsDelete && dataValue.__op == 'Delete') {
        response[fieldName] = dataValue;
      }
    }
  });
  return response;
};
var _default = exports.default = RestWrite;
module.exports = RestWrite;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfUmVzdFF1ZXJ5IiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsInJlcXVpcmUiLCJfbG9kYXNoIiwiX2xvZ2dlciIsIl9TY2hlbWFDb250cm9sbGVyIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwiZSIsInIiLCJ0IiwiT2JqZWN0Iiwia2V5cyIsImdldE93blByb3BlcnR5U3ltYm9scyIsIm8iLCJmaWx0ZXIiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsImFyZ3VtZW50cyIsImxlbmd0aCIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5Iiwia2V5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiaSIsIl90b1ByaW1pdGl2ZSIsIlN0cmluZyIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwiY2FsbCIsIlR5cGVFcnJvciIsIk51bWJlciIsIlNjaGVtYUNvbnRyb2xsZXIiLCJkZWVwY29weSIsIkF1dGgiLCJVdGlscyIsImNyeXB0b1V0aWxzIiwicGFzc3dvcmRDcnlwdG8iLCJQYXJzZSIsInRyaWdnZXJzIiwiQ2xpZW50U0RLIiwidXRpbCIsIlJlc3RXcml0ZSIsImNvbmZpZyIsImF1dGgiLCJjbGFzc05hbWUiLCJxdWVyeSIsImRhdGEiLCJvcmlnaW5hbERhdGEiLCJjbGllbnRTREsiLCJjb250ZXh0IiwiYWN0aW9uIiwiaXNSZWFkT25seSIsIkVycm9yIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsInN0b3JhZ2UiLCJydW5PcHRpb25zIiwiYWxsb3dDdXN0b21PYmplY3RJZCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5Iiwib2JqZWN0SWQiLCJNSVNTSU5HX09CSkVDVF9JRCIsIklOVkFMSURfS0VZX05BTUUiLCJpZCIsInJlc3BvbnNlIiwidXBkYXRlZEF0IiwiX2VuY29kZSIsIkRhdGUiLCJpc28iLCJ2YWxpZFNjaGVtYUNvbnRyb2xsZXIiLCJwZW5kaW5nT3BzIiwib3BlcmF0aW9ucyIsImlkZW50aWZpZXIiLCJleGVjdXRlIiwiUHJvbWlzZSIsInJlc29sdmUiLCJ0aGVuIiwiZ2V0VXNlckFuZFJvbGVBQ0wiLCJ2YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24iLCJoYW5kbGVJbnN0YWxsYXRpb24iLCJoYW5kbGVTZXNzaW9uIiwidmFsaWRhdGVBdXRoRGF0YSIsImNoZWNrUmVzdHJpY3RlZEZpZWxkcyIsInJ1bkJlZm9yZVNhdmVUcmlnZ2VyIiwiZW5zdXJlVW5pcXVlQXV0aERhdGFJZCIsImRlbGV0ZUVtYWlsUmVzZXRUb2tlbklmTmVlZGVkIiwidmFsaWRhdGVTY2hlbWEiLCJzY2hlbWFDb250cm9sbGVyIiwic2V0UmVxdWlyZWRGaWVsZHNJZk5lZWRlZCIsInRyYW5zZm9ybVVzZXIiLCJleHBhbmRGaWxlc0ZvckV4aXN0aW5nT2JqZWN0cyIsImRlc3Ryb3lEdXBsaWNhdGVkU2Vzc2lvbnMiLCJydW5EYXRhYmFzZU9wZXJhdGlvbiIsImNyZWF0ZVNlc3Npb25Ub2tlbklmTmVlZGVkIiwiaGFuZGxlRm9sbG93dXAiLCJydW5BZnRlclNhdmVUcmlnZ2VyIiwiY2xlYW5Vc2VyQXV0aERhdGEiLCJhdXRoRGF0YVJlc3BvbnNlIiwicmVqZWN0U2lnbnVwIiwicHJldmVudFNpZ251cFdpdGhVbnZlcmlmaWVkRW1haWwiLCJFTUFJTF9OT1RfRk9VTkQiLCJpc01hc3RlciIsImlzTWFpbnRlbmFuY2UiLCJhY2wiLCJ1c2VyIiwiZ2V0VXNlclJvbGVzIiwicm9sZXMiLCJjb25jYXQiLCJhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJzeXN0ZW1DbGFzc2VzIiwiaW5kZXhPZiIsImRhdGFiYXNlIiwibG9hZFNjaGVtYSIsImhhc0NsYXNzIiwidmFsaWRhdGVPYmplY3QiLCJtYW55IiwidHJpZ2dlckV4aXN0cyIsIlR5cGVzIiwiYmVmb3JlU2F2ZSIsImFwcGxpY2F0aW9uSWQiLCJvcmlnaW5hbE9iamVjdCIsInVwZGF0ZWRPYmplY3QiLCJidWlsZFBhcnNlT2JqZWN0cyIsIl9nZXRTdGF0ZUlkZW50aWZpZXIiLCJzdGF0ZUNvbnRyb2xsZXIiLCJDb3JlTWFuYWdlciIsImdldE9iamVjdFN0YXRlQ29udHJvbGxlciIsInBlbmRpbmciLCJnZXRQZW5kaW5nT3BzIiwiZGF0YWJhc2VQcm9taXNlIiwidXBkYXRlIiwiY3JlYXRlIiwicmVzdWx0IiwiT0JKRUNUX05PVF9GT1VORCIsIm1heWJlUnVuVHJpZ2dlciIsIm9iamVjdCIsImZpZWxkc0NoYW5nZWRCeVRyaWdnZXIiLCJfIiwicmVkdWNlIiwiaXNFcXVhbCIsImNoZWNrUHJvaGliaXRlZEtleXdvcmRzIiwiZXJyb3IiLCJydW5CZWZvcmVMb2dpblRyaWdnZXIiLCJ1c2VyRGF0YSIsImJlZm9yZUxvZ2luIiwiZXh0cmFEYXRhIiwiZmlsZXNDb250cm9sbGVyIiwiZXhwYW5kRmlsZXNJbk9iamVjdCIsImluZmxhdGUiLCJnZXRBbGxDbGFzc2VzIiwiYWxsQ2xhc3NlcyIsInNjaGVtYSIsImZpbmQiLCJvbmVDbGFzcyIsInNldFJlcXVpcmVkRmllbGRJZk5lZWRlZCIsImZpZWxkTmFtZSIsInNldERlZmF1bHQiLCJ1bmRlZmluZWQiLCJfX29wIiwiZmllbGRzIiwiZGVmYXVsdFZhbHVlIiwicmVxdWlyZWQiLCJWQUxJREFUSU9OX0VSUk9SIiwiY3JlYXRlZEF0IiwiX190eXBlIiwibmV3T2JqZWN0SWQiLCJvYmplY3RJZFNpemUiLCJhdXRoRGF0YSIsImhhc1VzZXJuYW1lQW5kUGFzc3dvcmQiLCJ1c2VybmFtZSIsInBhc3N3b3JkIiwiaXNFbXB0eSIsIlVTRVJOQU1FX01JU1NJTkciLCJQQVNTV09SRF9NSVNTSU5HIiwiVU5TVVBQT1JURURfU0VSVklDRSIsInByb3ZpZGVycyIsImNhbkhhbmRsZUF1dGhEYXRhIiwic29tZSIsInByb3ZpZGVyIiwicHJvdmlkZXJBdXRoRGF0YSIsImhhc1Rva2VuIiwiZ2V0VXNlcklkIiwiaGFuZGxlQXV0aERhdGEiLCJmaWx0ZXJlZE9iamVjdHNCeUFDTCIsIm9iamVjdHMiLCJBQ0wiLCJoYXNBdXRoRGF0YUlkIiwiZmluZFVzZXJzV2l0aEF1dGhEYXRhIiwicmVzdWx0cyIsIkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQiLCJ1c2VySWQiLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJ2YWxpZGF0ZWRBdXRoRGF0YSIsInVzZXJSZXN1bHQiLCJhdXRoUHJvdmlkZXIiLCJqb2luIiwiaGFzTXV0YXRlZEF1dGhEYXRhIiwibXV0YXRlZEF1dGhEYXRhIiwiaXNDdXJyZW50VXNlckxvZ2dlZE9yTWFzdGVyIiwiaXNMb2dpbiIsImxvY2F0aW9uIiwiY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiIsImFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4iLCJyZXMiLCJwcm9taXNlIiwiUmVzdFF1ZXJ5IiwibWV0aG9kIiwiTWV0aG9kIiwibWFzdGVyIiwicnVuQmVmb3JlRmluZCIsInJlc3RXaGVyZSIsInNlc3Npb24iLCJjYWNoZUNvbnRyb2xsZXIiLCJkZWwiLCJzZXNzaW9uVG9rZW4iLCJfdmFsaWRhdGVQYXNzd29yZFBvbGljeSIsImhhc2giLCJoYXNoZWRQYXNzd29yZCIsIl9oYXNoZWRfcGFzc3dvcmQiLCJfdmFsaWRhdGVVc2VyTmFtZSIsIl92YWxpZGF0ZUVtYWlsIiwicmFuZG9tU3RyaW5nIiwicmVzcG9uc2VTaG91bGRIYXZlVXNlcm5hbWUiLCIkbmUiLCJsaW1pdCIsImNhc2VJbnNlbnNpdGl2ZSIsIlVTRVJOQU1FX1RBS0VOIiwiZW1haWwiLCJtYXRjaCIsInJlamVjdCIsIklOVkFMSURfRU1BSUxfQUREUkVTUyIsIkVNQUlMX1RBS0VOIiwicmVxdWVzdCIsIm9yaWdpbmFsIiwiaXAiLCJpbnN0YWxsYXRpb25JZCIsInVzZXJDb250cm9sbGVyIiwic2V0RW1haWxWZXJpZnlUb2tlbiIsInBhc3N3b3JkUG9saWN5IiwiX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMiLCJfdmFsaWRhdGVQYXNzd29yZEhpc3RvcnkiLCJwb2xpY3lFcnJvciIsInZhbGlkYXRpb25FcnJvciIsImNvbnRhaW5zVXNlcm5hbWVFcnJvciIsInBhdHRlcm5WYWxpZGF0b3IiLCJ2YWxpZGF0b3JDYWxsYmFjayIsImRvTm90QWxsb3dVc2VybmFtZSIsIm1heFBhc3N3b3JkSGlzdG9yeSIsIm1haW50ZW5hbmNlIiwib2xkUGFzc3dvcmRzIiwiX3Bhc3N3b3JkX2hpc3RvcnkiLCJ0YWtlIiwibmV3UGFzc3dvcmQiLCJwcm9taXNlcyIsIm1hcCIsImNvbXBhcmUiLCJhbGwiLCJjYXRjaCIsImVyciIsInZlcmlmeVVzZXJFbWFpbHMiLCJwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsIiwiY3JlYXRlU2Vzc2lvblRva2VuIiwic2Vzc2lvbkRhdGEiLCJjcmVhdGVTZXNzaW9uIiwiY3JlYXRlZFdpdGgiLCJhZGRpdGlvbmFsU2Vzc2lvbkRhdGEiLCJ0b2tlbiIsIm5ld1Rva2VuIiwiZXhwaXJlc0F0IiwiZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0IiwiYXNzaWduIiwiYWRkT3BzIiwiX3BlcmlzaGFibGVfdG9rZW4iLCJfcGVyaXNoYWJsZV90b2tlbl9leHBpcmVzX2F0IiwiZGVzdHJveSIsInJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQiLCJzZXNzaW9uUXVlcnkiLCJiaW5kIiwic2VuZFZlcmlmaWNhdGlvbkVtYWlsIiwiSU5WQUxJRF9TRVNTSU9OX1RPS0VOIiwiJGFuZCIsIklOVEVSTkFMX1NFUlZFUl9FUlJPUiIsInN0YXR1cyIsImRldmljZVRva2VuIiwidG9Mb3dlckNhc2UiLCJkZXZpY2VUeXBlIiwiaWRNYXRjaCIsIm9iamVjdElkTWF0Y2giLCJpbnN0YWxsYXRpb25JZE1hdGNoIiwiZGV2aWNlVG9rZW5NYXRjaGVzIiwib3JRdWVyaWVzIiwiJG9yIiwiZGVsUXVlcnkiLCJhcHBJZGVudGlmaWVyIiwiY29kZSIsIm9iaklkIiwicm9sZSIsImNsZWFyIiwibGl2ZVF1ZXJ5Q29udHJvbGxlciIsImNsZWFyQ2FjaGVkUm9sZXMiLCJpc1VuYXV0aGVudGljYXRlZCIsIlNFU1NJT05fTUlTU0lORyIsImRvd25sb2FkIiwiZG93bmxvYWROYW1lIiwibmFtZSIsIklOVkFMSURfQUNMIiwicmVhZCIsIndyaXRlIiwibWF4UGFzc3dvcmRBZ2UiLCJfcGFzc3dvcmRfY2hhbmdlZF9hdCIsImRlZmVyIiwiTWF0aCIsIm1heCIsInNoaWZ0IiwiX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEiLCJlbmZvcmNlUHJpdmF0ZVVzZXJzIiwiRFVQTElDQVRFX1ZBTFVFIiwidXNlckluZm8iLCJkdXBsaWNhdGVkX2ZpZWxkIiwiaGFzQWZ0ZXJTYXZlSG9vayIsImFmdGVyU2F2ZSIsImhhc0xpdmVRdWVyeSIsIl9oYW5kbGVTYXZlUmVzcG9uc2UiLCJwZXJtcyIsImdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIm9uQWZ0ZXJTYXZlIiwianNvblJldHVybmVkIiwiX3RvRnVsbEpTT04iLCJ0b0pTT04iLCJsb2dnZXIiLCJ3YXJuIiwibWlkZGxlIiwibW91bnQiLCJzZXJ2ZXJVUkwiLCJzYW5pdGl6ZWREYXRhIiwidGVzdCIsIl9kZWNvZGUiLCJfdGhpcyRxdWVyeSIsImZyb21KU09OIiwicmVhZE9ubHlBdHRyaWJ1dGVzIiwiY29uc3RydWN0b3IiLCJhdHRyaWJ1dGUiLCJpbmNsdWRlcyIsInNldCIsInNwbGl0dGVkS2V5Iiwic3BsaXQiLCJwYXJlbnRQcm9wIiwicGFyZW50VmFsIiwiZ2V0Iiwic2FuaXRpemVkIiwic2tpcEtleXMiLCJyZXF1aXJlZENvbHVtbnMiLCJpc0RlZXBTdHJpY3RFcXVhbCIsImNsaWVudFN1cHBvcnRzRGVsZXRlIiwic3VwcG9ydHNGb3J3YXJkRGVsZXRlIiwiZGF0YVZhbHVlIiwiX2RlZmF1bHQiLCJleHBvcnRzIiwibW9kdWxlIl0sInNvdXJjZXMiOlsiLi4vc3JjL1Jlc3RXcml0ZS5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBBIFJlc3RXcml0ZSBlbmNhcHN1bGF0ZXMgZXZlcnl0aGluZyB3ZSBuZWVkIHRvIHJ1biBhbiBvcGVyYXRpb25cbi8vIHRoYXQgd3JpdGVzIHRvIHRoZSBkYXRhYmFzZS5cbi8vIFRoaXMgY291bGQgYmUgZWl0aGVyIGEgXCJjcmVhdGVcIiBvciBhbiBcInVwZGF0ZVwiLlxuXG52YXIgU2NoZW1hQ29udHJvbGxlciA9IHJlcXVpcmUoJy4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcicpO1xudmFyIGRlZXBjb3B5ID0gcmVxdWlyZSgnZGVlcGNvcHknKTtcblxuY29uc3QgQXV0aCA9IHJlcXVpcmUoJy4vQXV0aCcpO1xuY29uc3QgVXRpbHMgPSByZXF1aXJlKCcuL1V0aWxzJyk7XG52YXIgY3J5cHRvVXRpbHMgPSByZXF1aXJlKCcuL2NyeXB0b1V0aWxzJyk7XG52YXIgcGFzc3dvcmRDcnlwdG8gPSByZXF1aXJlKCcuL3Bhc3N3b3JkJyk7XG52YXIgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG52YXIgdHJpZ2dlcnMgPSByZXF1aXJlKCcuL3RyaWdnZXJzJyk7XG52YXIgQ2xpZW50U0RLID0gcmVxdWlyZSgnLi9DbGllbnRTREsnKTtcbmNvbnN0IHV0aWwgPSByZXF1aXJlKCd1dGlsJyk7XG5pbXBvcnQgUmVzdFF1ZXJ5IGZyb20gJy4vUmVzdFF1ZXJ5JztcbmltcG9ydCBfIGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCB7IHJlcXVpcmVkQ29sdW1ucyB9IGZyb20gJy4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcic7XG5cbi8vIHF1ZXJ5IGFuZCBkYXRhIGFyZSBib3RoIHByb3ZpZGVkIGluIFJFU1QgQVBJIGZvcm1hdC4gU28gZGF0YVxuLy8gdHlwZXMgYXJlIGVuY29kZWQgYnkgcGxhaW4gb2xkIG9iamVjdHMuXG4vLyBJZiBxdWVyeSBpcyBudWxsLCB0aGlzIGlzIGEgXCJjcmVhdGVcIiBhbmQgdGhlIGRhdGEgaW4gZGF0YSBzaG91bGQgYmVcbi8vIGNyZWF0ZWQuXG4vLyBPdGhlcndpc2UgdGhpcyBpcyBhbiBcInVwZGF0ZVwiIC0gdGhlIG9iamVjdCBtYXRjaGluZyB0aGUgcXVlcnlcbi8vIHNob3VsZCBnZXQgdXBkYXRlZCB3aXRoIGRhdGEuXG4vLyBSZXN0V3JpdGUgd2lsbCBoYW5kbGUgb2JqZWN0SWQsIGNyZWF0ZWRBdCwgYW5kIHVwZGF0ZWRBdCBmb3Jcbi8vIGV2ZXJ5dGhpbmcuIEl0IGFsc28ga25vd3MgdG8gdXNlIHRyaWdnZXJzIGFuZCBzcGVjaWFsIG1vZGlmaWNhdGlvbnNcbi8vIGZvciB0aGUgX1VzZXIgY2xhc3MuXG5mdW5jdGlvbiBSZXN0V3JpdGUoY29uZmlnLCBhdXRoLCBjbGFzc05hbWUsIHF1ZXJ5LCBkYXRhLCBvcmlnaW5hbERhdGEsIGNsaWVudFNESywgY29udGV4dCwgYWN0aW9uKSB7XG4gIGlmIChhdXRoLmlzUmVhZE9ubHkpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgJ0Nhbm5vdCBwZXJmb3JtIGEgd3JpdGUgb3BlcmF0aW9uIHdoZW4gdXNpbmcgcmVhZE9ubHlNYXN0ZXJLZXknXG4gICAgKTtcbiAgfVxuICB0aGlzLmNvbmZpZyA9IGNvbmZpZztcbiAgdGhpcy5hdXRoID0gYXV0aDtcbiAgdGhpcy5jbGFzc05hbWUgPSBjbGFzc05hbWU7XG4gIHRoaXMuY2xpZW50U0RLID0gY2xpZW50U0RLO1xuICB0aGlzLnN0b3JhZ2UgPSB7fTtcbiAgdGhpcy5ydW5PcHRpb25zID0ge307XG4gIHRoaXMuY29udGV4dCA9IGNvbnRleHQgfHwge307XG5cbiAgaWYgKGFjdGlvbikge1xuICAgIHRoaXMucnVuT3B0aW9ucy5hY3Rpb24gPSBhY3Rpb247XG4gIH1cblxuICBpZiAoIXF1ZXJ5KSB7XG4gICAgaWYgKHRoaXMuY29uZmlnLmFsbG93Q3VzdG9tT2JqZWN0SWQpIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZGF0YSwgJ29iamVjdElkJykgJiYgIWRhdGEub2JqZWN0SWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk1JU1NJTkdfT0JKRUNUX0lELFxuICAgICAgICAgICdvYmplY3RJZCBtdXN0IG5vdCBiZSBlbXB0eSwgbnVsbCBvciB1bmRlZmluZWQnXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGlmIChkYXRhLm9iamVjdElkKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCAnb2JqZWN0SWQgaXMgYW4gaW52YWxpZCBmaWVsZCBuYW1lLicpO1xuICAgICAgfVxuICAgICAgaWYgKGRhdGEuaWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdpZCBpcyBhbiBpbnZhbGlkIGZpZWxkIG5hbWUuJyk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gV2hlbiB0aGUgb3BlcmF0aW9uIGlzIGNvbXBsZXRlLCB0aGlzLnJlc3BvbnNlIG1heSBoYXZlIHNldmVyYWxcbiAgLy8gZmllbGRzLlxuICAvLyByZXNwb25zZTogdGhlIGFjdHVhbCBkYXRhIHRvIGJlIHJldHVybmVkXG4gIC8vIHN0YXR1czogdGhlIGh0dHAgc3RhdHVzIGNvZGUuIGlmIG5vdCBwcmVzZW50LCB0cmVhdGVkIGxpa2UgYSAyMDBcbiAgLy8gbG9jYXRpb246IHRoZSBsb2NhdGlvbiBoZWFkZXIuIGlmIG5vdCBwcmVzZW50LCBubyBsb2NhdGlvbiBoZWFkZXJcbiAgdGhpcy5yZXNwb25zZSA9IG51bGw7XG5cbiAgLy8gUHJvY2Vzc2luZyB0aGlzIG9wZXJhdGlvbiBtYXkgbXV0YXRlIG91ciBkYXRhLCBzbyB3ZSBvcGVyYXRlIG9uIGFcbiAgLy8gY29weVxuICB0aGlzLnF1ZXJ5ID0gZGVlcGNvcHkocXVlcnkpO1xuICB0aGlzLmRhdGEgPSBkZWVwY29weShkYXRhKTtcbiAgLy8gV2UgbmV2ZXIgY2hhbmdlIG9yaWdpbmFsRGF0YSwgc28gd2UgZG8gbm90IG5lZWQgYSBkZWVwIGNvcHlcbiAgdGhpcy5vcmlnaW5hbERhdGEgPSBvcmlnaW5hbERhdGE7XG5cbiAgLy8gVGhlIHRpbWVzdGFtcCB3ZSdsbCB1c2UgZm9yIHRoaXMgd2hvbGUgb3BlcmF0aW9uXG4gIHRoaXMudXBkYXRlZEF0ID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKS5pc287XG5cbiAgLy8gU2hhcmVkIFNjaGVtYUNvbnRyb2xsZXIgdG8gYmUgcmV1c2VkIHRvIHJlZHVjZSB0aGUgbnVtYmVyIG9mIGxvYWRTY2hlbWEoKSBjYWxscyBwZXIgcmVxdWVzdFxuICAvLyBPbmNlIHNldCB0aGUgc2NoZW1hRGF0YSBzaG91bGQgYmUgaW1tdXRhYmxlXG4gIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyID0gbnVsbDtcbiAgdGhpcy5wZW5kaW5nT3BzID0ge1xuICAgIG9wZXJhdGlvbnM6IG51bGwsXG4gICAgaWRlbnRpZmllcjogbnVsbCxcbiAgfTtcbn1cblxuLy8gQSBjb252ZW5pZW50IG1ldGhvZCB0byBwZXJmb3JtIGFsbCB0aGUgc3RlcHMgb2YgcHJvY2Vzc2luZyB0aGVcbi8vIHdyaXRlLCBpbiBvcmRlci5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIHtyZXNwb25zZSwgc3RhdHVzLCBsb2NhdGlvbn0gb2JqZWN0LlxuLy8gc3RhdHVzIGFuZCBsb2NhdGlvbiBhcmUgb3B0aW9uYWwuXG5SZXN0V3JpdGUucHJvdG90eXBlLmV4ZWN1dGUgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmdldFVzZXJBbmRSb2xlQUNMKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24oKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUluc3RhbGxhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuaGFuZGxlU2Vzc2lvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMudmFsaWRhdGVBdXRoRGF0YSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY2hlY2tSZXN0cmljdGVkRmllbGRzKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5CZWZvcmVTYXZlVHJpZ2dlcigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZW5zdXJlVW5pcXVlQXV0aERhdGFJZCgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnZhbGlkYXRlU2NoZW1hKCk7XG4gICAgfSlcbiAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHtcbiAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyID0gc2NoZW1hQ29udHJvbGxlcjtcbiAgICAgIHJldHVybiB0aGlzLnNldFJlcXVpcmVkRmllbGRzSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLnRyYW5zZm9ybVVzZXIoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmV4cGFuZEZpbGVzRm9yRXhpc3RpbmdPYmplY3RzKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5kZXN0cm95RHVwbGljYXRlZFNlc3Npb25zKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5EYXRhYmFzZU9wZXJhdGlvbigpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQoKTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLmhhbmRsZUZvbGxvd3VwKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5ydW5BZnRlclNhdmVUcmlnZ2VyKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5jbGVhblVzZXJBdXRoRGF0YSgpO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gQXBwZW5kIHRoZSBhdXRoRGF0YVJlc3BvbnNlIGlmIGV4aXN0c1xuICAgICAgaWYgKHRoaXMuYXV0aERhdGFSZXNwb25zZSkge1xuICAgICAgICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZS5hdXRoRGF0YVJlc3BvbnNlID0gdGhpcy5hdXRoRGF0YVJlc3BvbnNlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAodGhpcy5zdG9yYWdlLnJlamVjdFNpZ251cCAmJiB0aGlzLmNvbmZpZy5wcmV2ZW50U2lnbnVwV2l0aFVudmVyaWZpZWRFbWFpbCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuRU1BSUxfTk9UX0ZPVU5ELCAnVXNlciBlbWFpbCBpcyBub3QgdmVyaWZpZWQuJyk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5yZXNwb25zZTtcbiAgICB9KTtcbn07XG5cbi8vIFVzZXMgdGhlIEF1dGggb2JqZWN0IHRvIGdldCB0aGUgbGlzdCBvZiByb2xlcywgYWRkcyB0aGUgdXNlciBpZFxuUmVzdFdyaXRlLnByb3RvdHlwZS5nZXRVc2VyQW5kUm9sZUFDTCA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuYXV0aC5pc01hc3RlciB8fCB0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIHRoaXMucnVuT3B0aW9ucy5hY2wgPSBbJyonXTtcblxuICBpZiAodGhpcy5hdXRoLnVzZXIpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoLmdldFVzZXJSb2xlcygpLnRoZW4ocm9sZXMgPT4ge1xuICAgICAgdGhpcy5ydW5PcHRpb25zLmFjbCA9IHRoaXMucnVuT3B0aW9ucy5hY2wuY29uY2F0KHJvbGVzLCBbdGhpcy5hdXRoLnVzZXIuaWRdKTtcbiAgICAgIHJldHVybjtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn07XG5cbi8vIFZhbGlkYXRlcyB0aGlzIG9wZXJhdGlvbiBhZ2FpbnN0IHRoZSBhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gY29uZmlnLlxuUmVzdFdyaXRlLnByb3RvdHlwZS52YWxpZGF0ZUNsaWVudENsYXNzQ3JlYXRpb24gPSBmdW5jdGlvbiAoKSB7XG4gIGlmIChcbiAgICB0aGlzLmNvbmZpZy5hbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gPT09IGZhbHNlICYmXG4gICAgIXRoaXMuYXV0aC5pc01hc3RlciAmJlxuICAgICF0aGlzLmF1dGguaXNNYWludGVuYW5jZSAmJlxuICAgIFNjaGVtYUNvbnRyb2xsZXIuc3lzdGVtQ2xhc3Nlcy5pbmRleE9mKHRoaXMuY2xhc3NOYW1lKSA9PT0gLTFcbiAgKSB7XG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAubG9hZFNjaGVtYSgpXG4gICAgICAudGhlbihzY2hlbWFDb250cm9sbGVyID0+IHNjaGVtYUNvbnRyb2xsZXIuaGFzQ2xhc3ModGhpcy5jbGFzc05hbWUpKVxuICAgICAgLnRoZW4oaGFzQ2xhc3MgPT4ge1xuICAgICAgICBpZiAoaGFzQ2xhc3MgIT09IHRydWUpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICAgICAgJ1RoaXMgdXNlciBpcyBub3QgYWxsb3dlZCB0byBhY2Nlc3MgJyArICdub24tZXhpc3RlbnQgY2xhc3M6ICcgKyB0aGlzLmNsYXNzTmFtZVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxufTtcblxuLy8gVmFsaWRhdGVzIHRoaXMgb3BlcmF0aW9uIGFnYWluc3QgdGhlIHNjaGVtYS5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVTY2hlbWEgPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS52YWxpZGF0ZU9iamVjdChcbiAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICB0aGlzLmRhdGEsXG4gICAgdGhpcy5xdWVyeSxcbiAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2VcbiAgKTtcbn07XG5cbi8vIFJ1bnMgYW55IGJlZm9yZVNhdmUgdHJpZ2dlcnMgYWdhaW5zdCB0aGlzIG9wZXJhdGlvbi5cbi8vIEFueSBjaGFuZ2UgbGVhZHMgdG8gb3VyIGRhdGEgYmVpbmcgbXV0YXRlZC5cblJlc3RXcml0ZS5wcm90b3R5cGUucnVuQmVmb3JlU2F2ZVRyaWdnZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlIHx8IHRoaXMucnVuT3B0aW9ucy5tYW55KSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYmVmb3JlU2F2ZScgdHJpZ2dlciBmb3IgdGhpcyBjbGFzcy5cbiAgaWYgKFxuICAgICF0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKHRoaXMuY2xhc3NOYW1lLCB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVTYXZlLCB0aGlzLmNvbmZpZy5hcHBsaWNhdGlvbklkKVxuICApIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cblxuICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSB0aGlzLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gIGNvbnN0IGlkZW50aWZpZXIgPSB1cGRhdGVkT2JqZWN0Ll9nZXRTdGF0ZUlkZW50aWZpZXIoKTtcbiAgY29uc3Qgc3RhdGVDb250cm9sbGVyID0gUGFyc2UuQ29yZU1hbmFnZXIuZ2V0T2JqZWN0U3RhdGVDb250cm9sbGVyKCk7XG4gIGNvbnN0IFtwZW5kaW5nXSA9IHN0YXRlQ29udHJvbGxlci5nZXRQZW5kaW5nT3BzKGlkZW50aWZpZXIpO1xuICB0aGlzLnBlbmRpbmdPcHMgPSB7XG4gICAgb3BlcmF0aW9uczogeyAuLi5wZW5kaW5nIH0sXG4gICAgaWRlbnRpZmllcixcbiAgfTtcblxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICAvLyBCZWZvcmUgY2FsbGluZyB0aGUgdHJpZ2dlciwgdmFsaWRhdGUgdGhlIHBlcm1pc3Npb25zIGZvciB0aGUgc2F2ZSBvcGVyYXRpb25cbiAgICAgIGxldCBkYXRhYmFzZVByb21pc2UgPSBudWxsO1xuICAgICAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAgICAgLy8gVmFsaWRhdGUgZm9yIHVwZGF0aW5nXG4gICAgICAgIGRhdGFiYXNlUHJvbWlzZSA9IHRoaXMuY29uZmlnLmRhdGFiYXNlLnVwZGF0ZShcbiAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICB0aGlzLnF1ZXJ5LFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgdHJ1ZSxcbiAgICAgICAgICB0cnVlXG4gICAgICAgICk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBWYWxpZGF0ZSBmb3IgY3JlYXRpbmdcbiAgICAgICAgZGF0YWJhc2VQcm9taXNlID0gdGhpcy5jb25maWcuZGF0YWJhc2UuY3JlYXRlKFxuICAgICAgICAgIHRoaXMuY2xhc3NOYW1lLFxuICAgICAgICAgIHRoaXMuZGF0YSxcbiAgICAgICAgICB0aGlzLnJ1bk9wdGlvbnMsXG4gICAgICAgICAgdHJ1ZVxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gSW4gdGhlIGNhc2UgdGhhdCB0aGVyZSBpcyBubyBwZXJtaXNzaW9uIGZvciB0aGUgb3BlcmF0aW9uLCBpdCB0aHJvd3MgYW4gZXJyb3JcbiAgICAgIHJldHVybiBkYXRhYmFzZVByb21pc2UudGhlbihyZXN1bHQgPT4ge1xuICAgICAgICBpZiAoIXJlc3VsdCB8fCByZXN1bHQubGVuZ3RoIDw9IDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCwgJ09iamVjdCBub3QgZm91bmQuJyk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRyaWdnZXJzLm1heWJlUnVuVHJpZ2dlcihcbiAgICAgICAgdHJpZ2dlcnMuVHlwZXMuYmVmb3JlU2F2ZSxcbiAgICAgICAgdGhpcy5hdXRoLFxuICAgICAgICB1cGRhdGVkT2JqZWN0LFxuICAgICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgICAgdGhpcy5jb25maWcsXG4gICAgICAgIHRoaXMuY29udGV4dFxuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKHJlc3BvbnNlID0+IHtcbiAgICAgIGlmIChyZXNwb25zZSAmJiByZXNwb25zZS5vYmplY3QpIHtcbiAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIgPSBfLnJlZHVjZShcbiAgICAgICAgICByZXNwb25zZS5vYmplY3QsXG4gICAgICAgICAgKHJlc3VsdCwgdmFsdWUsIGtleSkgPT4ge1xuICAgICAgICAgICAgaWYgKCFfLmlzRXF1YWwodGhpcy5kYXRhW2tleV0sIHZhbHVlKSkge1xuICAgICAgICAgICAgICByZXN1bHQucHVzaChrZXkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICB9LFxuICAgICAgICAgIFtdXG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuZGF0YSA9IHJlc3BvbnNlLm9iamVjdDtcbiAgICAgICAgLy8gV2Ugc2hvdWxkIGRlbGV0ZSB0aGUgb2JqZWN0SWQgZm9yIGFuIHVwZGF0ZSB3cml0ZVxuICAgICAgICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLnF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgdHJ5IHtcbiAgICAgICAgVXRpbHMuY2hlY2tQcm9oaWJpdGVkS2V5d29yZHModGhpcy5jb25maWcsIHRoaXMuZGF0YSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgZXJyb3IpO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5ydW5CZWZvcmVMb2dpblRyaWdnZXIgPSBhc3luYyBmdW5jdGlvbiAodXNlckRhdGEpIHtcbiAgLy8gQXZvaWQgZG9pbmcgYW55IHNldHVwIGZvciB0cmlnZ2VycyBpZiB0aGVyZSBpcyBubyAnYmVmb3JlTG9naW4nIHRyaWdnZXJcbiAgaWYgKFxuICAgICF0cmlnZ2Vycy50cmlnZ2VyRXhpc3RzKHRoaXMuY2xhc3NOYW1lLCB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVMb2dpbiwgdGhpcy5jb25maWcuYXBwbGljYXRpb25JZClcbiAgKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gQ2xvdWQgY29kZSBnZXRzIGEgYml0IG9mIGV4dHJhIGRhdGEgZm9yIGl0cyBvYmplY3RzXG4gIGNvbnN0IGV4dHJhRGF0YSA9IHsgY2xhc3NOYW1lOiB0aGlzLmNsYXNzTmFtZSB9O1xuXG4gIC8vIEV4cGFuZCBmaWxlIG9iamVjdHNcbiAgdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QodGhpcy5jb25maWcsIHVzZXJEYXRhKTtcblxuICBjb25zdCB1c2VyID0gdHJpZ2dlcnMuaW5mbGF0ZShleHRyYURhdGEsIHVzZXJEYXRhKTtcblxuICAvLyBubyBuZWVkIHRvIHJldHVybiBhIHJlc3BvbnNlXG4gIGF3YWl0IHRyaWdnZXJzLm1heWJlUnVuVHJpZ2dlcihcbiAgICB0cmlnZ2Vycy5UeXBlcy5iZWZvcmVMb2dpbixcbiAgICB0aGlzLmF1dGgsXG4gICAgdXNlcixcbiAgICBudWxsLFxuICAgIHRoaXMuY29uZmlnLFxuICAgIHRoaXMuY29udGV4dFxuICApO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5zZXRSZXF1aXJlZEZpZWxkc0lmTmVlZGVkID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5kYXRhKSB7XG4gICAgcmV0dXJuIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyLmdldEFsbENsYXNzZXMoKS50aGVuKGFsbENsYXNzZXMgPT4ge1xuICAgICAgY29uc3Qgc2NoZW1hID0gYWxsQ2xhc3Nlcy5maW5kKG9uZUNsYXNzID0+IG9uZUNsYXNzLmNsYXNzTmFtZSA9PT0gdGhpcy5jbGFzc05hbWUpO1xuICAgICAgY29uc3Qgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkID0gKGZpZWxkTmFtZSwgc2V0RGVmYXVsdCkgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSBudWxsIHx8XG4gICAgICAgICAgdGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09ICcnIHx8XG4gICAgICAgICAgKHR5cGVvZiB0aGlzLmRhdGFbZmllbGROYW1lXSA9PT0gJ29iamVjdCcgJiYgdGhpcy5kYXRhW2ZpZWxkTmFtZV0uX19vcCA9PT0gJ0RlbGV0ZScpXG4gICAgICAgICkge1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIHNldERlZmF1bHQgJiZcbiAgICAgICAgICAgIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmRlZmF1bHRWYWx1ZSAhPT0gbnVsbCAmJlxuICAgICAgICAgICAgc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdLmRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgICAgICAgICAodGhpcy5kYXRhW2ZpZWxkTmFtZV0gPT09IHVuZGVmaW5lZCB8fFxuICAgICAgICAgICAgICAodHlwZW9mIHRoaXMuZGF0YVtmaWVsZE5hbWVdID09PSAnb2JqZWN0JyAmJiB0aGlzLmRhdGFbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJykpXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aGlzLmRhdGFbZmllbGROYW1lXSA9IHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5kZWZhdWx0VmFsdWU7XG4gICAgICAgICAgICB0aGlzLnN0b3JhZ2UuZmllbGRzQ2hhbmdlZEJ5VHJpZ2dlciA9IHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyIHx8IFtdO1xuICAgICAgICAgICAgaWYgKHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLmluZGV4T2YoZmllbGROYW1lKSA8IDApIHtcbiAgICAgICAgICAgICAgdGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSBpZiAoc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdICYmIHNjaGVtYS5maWVsZHNbZmllbGROYW1lXS5yZXF1aXJlZCA9PT0gdHJ1ZSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlZBTElEQVRJT05fRVJST1IsIGAke2ZpZWxkTmFtZX0gaXMgcmVxdWlyZWRgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH07XG5cbiAgICAgIC8vIEFkZCBkZWZhdWx0IGZpZWxkc1xuICAgICAgaWYgKCF0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIC8vIGFsbG93IGN1c3RvbWl6aW5nIGNyZWF0ZWRBdCBhbmQgdXBkYXRlZEF0IHdoZW4gdXNpbmcgbWFpbnRlbmFuY2Uga2V5XG4gICAgICAgIGlmIChcbiAgICAgICAgICB0aGlzLmF1dGguaXNNYWludGVuYW5jZSAmJlxuICAgICAgICAgIHRoaXMuZGF0YS5jcmVhdGVkQXQgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuY3JlYXRlZEF0Ll9fdHlwZSA9PT0gJ0RhdGUnXG4gICAgICAgICkge1xuICAgICAgICAgIHRoaXMuZGF0YS5jcmVhdGVkQXQgPSB0aGlzLmRhdGEuY3JlYXRlZEF0LmlzbztcblxuICAgICAgICAgIGlmICh0aGlzLmRhdGEudXBkYXRlZEF0ICYmIHRoaXMuZGF0YS51cGRhdGVkQXQuX190eXBlID09PSAnRGF0ZScpIHtcbiAgICAgICAgICAgIGNvbnN0IGNyZWF0ZWRBdCA9IG5ldyBEYXRlKHRoaXMuZGF0YS5jcmVhdGVkQXQpO1xuICAgICAgICAgICAgY29uc3QgdXBkYXRlZEF0ID0gbmV3IERhdGUodGhpcy5kYXRhLnVwZGF0ZWRBdC5pc28pO1xuXG4gICAgICAgICAgICBpZiAodXBkYXRlZEF0IDwgY3JlYXRlZEF0KSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5WQUxJREFUSU9OX0VSUk9SLFxuICAgICAgICAgICAgICAgICd1cGRhdGVkQXQgY2Fubm90IG9jY3VyIGJlZm9yZSBjcmVhdGVkQXQnXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuZGF0YS51cGRhdGVkQXQgPSB0aGlzLmRhdGEudXBkYXRlZEF0LmlzbztcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gaWYgbm8gdXBkYXRlZEF0IGlzIHByb3ZpZGVkLCBzZXQgaXQgdG8gY3JlYXRlZEF0IHRvIG1hdGNoIGRlZmF1bHQgYmVoYXZpb3JcbiAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZGF0YS51cGRhdGVkQXQgPSB0aGlzLmRhdGEuY3JlYXRlZEF0O1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLmRhdGEudXBkYXRlZEF0ID0gdGhpcy51cGRhdGVkQXQ7XG4gICAgICAgICAgdGhpcy5kYXRhLmNyZWF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gT25seSBhc3NpZ24gbmV3IG9iamVjdElkIGlmIHdlIGFyZSBjcmVhdGluZyBuZXcgb2JqZWN0XG4gICAgICAgIGlmICghdGhpcy5kYXRhLm9iamVjdElkKSB7XG4gICAgICAgICAgdGhpcy5kYXRhLm9iamVjdElkID0gY3J5cHRvVXRpbHMubmV3T2JqZWN0SWQodGhpcy5jb25maWcub2JqZWN0SWRTaXplKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoc2NoZW1hKSB7XG4gICAgICAgICAgT2JqZWN0LmtleXMoc2NoZW1hLmZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgc2V0UmVxdWlyZWRGaWVsZElmTmVlZGVkKGZpZWxkTmFtZSwgdHJ1ZSk7XG4gICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoc2NoZW1hKSB7XG4gICAgICAgIHRoaXMuZGF0YS51cGRhdGVkQXQgPSB0aGlzLnVwZGF0ZWRBdDtcblxuICAgICAgICBPYmplY3Qua2V5cyh0aGlzLmRhdGEpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBzZXRSZXF1aXJlZEZpZWxkSWZOZWVkZWQoZmllbGROYW1lLCBmYWxzZSk7XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn07XG5cbi8vIFRyYW5zZm9ybXMgYXV0aCBkYXRhIGZvciBhIHVzZXIgb2JqZWN0LlxuLy8gRG9lcyBub3RoaW5nIGlmIHRoaXMgaXNuJ3QgYSB1c2VyIG9iamVjdC5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciB3aGVuIHdlJ3JlIGRvbmUgaWYgaXQgY2FuJ3QgZmluaXNoIHRoaXMgdGljay5cblJlc3RXcml0ZS5wcm90b3R5cGUudmFsaWRhdGVBdXRoRGF0YSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgYXV0aERhdGEgPSB0aGlzLmRhdGEuYXV0aERhdGE7XG4gIGNvbnN0IGhhc1VzZXJuYW1lQW5kUGFzc3dvcmQgPVxuICAgIHR5cGVvZiB0aGlzLmRhdGEudXNlcm5hbWUgPT09ICdzdHJpbmcnICYmIHR5cGVvZiB0aGlzLmRhdGEucGFzc3dvcmQgPT09ICdzdHJpbmcnO1xuXG4gIGlmICghdGhpcy5xdWVyeSAmJiAhYXV0aERhdGEpIHtcbiAgICBpZiAodHlwZW9mIHRoaXMuZGF0YS51c2VybmFtZSAhPT0gJ3N0cmluZycgfHwgXy5pc0VtcHR5KHRoaXMuZGF0YS51c2VybmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5VU0VSTkFNRV9NSVNTSU5HLCAnYmFkIG9yIG1pc3NpbmcgdXNlcm5hbWUnKTtcbiAgICB9XG4gICAgaWYgKHR5cGVvZiB0aGlzLmRhdGEucGFzc3dvcmQgIT09ICdzdHJpbmcnIHx8IF8uaXNFbXB0eSh0aGlzLmRhdGEucGFzc3dvcmQpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuUEFTU1dPUkRfTUlTU0lORywgJ3Bhc3N3b3JkIGlzIHJlcXVpcmVkJyk7XG4gICAgfVxuICB9XG5cbiAgaWYgKFxuICAgIChhdXRoRGF0YSAmJiAhT2JqZWN0LmtleXMoYXV0aERhdGEpLmxlbmd0aCkgfHxcbiAgICAhT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKHRoaXMuZGF0YSwgJ2F1dGhEYXRhJylcbiAgKSB7XG4gICAgLy8gTm90aGluZyB0byB2YWxpZGF0ZSBoZXJlXG4gICAgcmV0dXJuO1xuICB9IGVsc2UgaWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCh0aGlzLmRhdGEsICdhdXRoRGF0YScpICYmICF0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICAvLyBIYW5kbGUgc2F2aW5nIGF1dGhEYXRhIHRvIG51bGxcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5VTlNVUFBPUlRFRF9TRVJWSUNFLFxuICAgICAgJ1RoaXMgYXV0aGVudGljYXRpb24gbWV0aG9kIGlzIHVuc3VwcG9ydGVkLidcbiAgICApO1xuICB9XG5cbiAgdmFyIHByb3ZpZGVycyA9IE9iamVjdC5rZXlzKGF1dGhEYXRhKTtcbiAgaWYgKHByb3ZpZGVycy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3QgY2FuSGFuZGxlQXV0aERhdGEgPSBwcm92aWRlcnMuc29tZShwcm92aWRlciA9PiB7XG4gICAgICB2YXIgcHJvdmlkZXJBdXRoRGF0YSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgIHZhciBoYXNUb2tlbiA9IHByb3ZpZGVyQXV0aERhdGEgJiYgcHJvdmlkZXJBdXRoRGF0YS5pZDtcbiAgICAgIHJldHVybiBoYXNUb2tlbiB8fCBwcm92aWRlckF1dGhEYXRhID09PSBudWxsO1xuICAgIH0pO1xuICAgIGlmIChjYW5IYW5kbGVBdXRoRGF0YSB8fCBoYXNVc2VybmFtZUFuZFBhc3N3b3JkIHx8IHRoaXMuYXV0aC5pc01hc3RlciB8fCB0aGlzLmdldFVzZXJJZCgpKSB7XG4gICAgICByZXR1cm4gdGhpcy5oYW5kbGVBdXRoRGF0YShhdXRoRGF0YSk7XG4gICAgfVxuICB9XG4gIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICBQYXJzZS5FcnJvci5VTlNVUFBPUlRFRF9TRVJWSUNFLFxuICAgICdUaGlzIGF1dGhlbnRpY2F0aW9uIG1ldGhvZCBpcyB1bnN1cHBvcnRlZC4nXG4gICk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmZpbHRlcmVkT2JqZWN0c0J5QUNMID0gZnVuY3Rpb24gKG9iamVjdHMpIHtcbiAgaWYgKHRoaXMuYXV0aC5pc01hc3RlciB8fCB0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgIHJldHVybiBvYmplY3RzO1xuICB9XG4gIHJldHVybiBvYmplY3RzLmZpbHRlcihvYmplY3QgPT4ge1xuICAgIGlmICghb2JqZWN0LkFDTCkge1xuICAgICAgcmV0dXJuIHRydWU7IC8vIGxlZ2FjeSB1c2VycyB0aGF0IGhhdmUgbm8gQUNMIGZpZWxkIG9uIHRoZW1cbiAgICB9XG4gICAgLy8gUmVndWxhciB1c2VycyB0aGF0IGhhdmUgYmVlbiBsb2NrZWQgb3V0LlxuICAgIHJldHVybiBvYmplY3QuQUNMICYmIE9iamVjdC5rZXlzKG9iamVjdC5BQ0wpLmxlbmd0aCA+IDA7XG4gIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5nZXRVc2VySWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQgJiYgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICByZXR1cm4gdGhpcy5xdWVyeS5vYmplY3RJZDtcbiAgfSBlbHNlIGlmICh0aGlzLmF1dGggJiYgdGhpcy5hdXRoLnVzZXIgJiYgdGhpcy5hdXRoLnVzZXIuaWQpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoLnVzZXIuaWQ7XG4gIH1cbn07XG5cbi8vIERldmVsb3BlcnMgYXJlIGFsbG93ZWQgdG8gY2hhbmdlIGF1dGhEYXRhIHZpYSBiZWZvcmUgc2F2ZSB0cmlnZ2VyXG4vLyB3ZSBuZWVkIGFmdGVyIGJlZm9yZSBzYXZlIHRvIGVuc3VyZSB0aGF0IHRoZSBkZXZlbG9wZXJcbi8vIGlzIG5vdCBjdXJyZW50bHkgZHVwbGljYXRpbmcgYXV0aCBkYXRhIElEXG5SZXN0V3JpdGUucHJvdG90eXBlLmVuc3VyZVVuaXF1ZUF1dGhEYXRhSWQgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCAhdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgaGFzQXV0aERhdGFJZCA9IE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkuc29tZShcbiAgICBrZXkgPT4gdGhpcy5kYXRhLmF1dGhEYXRhW2tleV0gJiYgdGhpcy5kYXRhLmF1dGhEYXRhW2tleV0uaWRcbiAgKTtcblxuICBpZiAoIWhhc0F1dGhEYXRhSWQpIHJldHVybjtcblxuICBjb25zdCByID0gYXdhaXQgQXV0aC5maW5kVXNlcnNXaXRoQXV0aERhdGEodGhpcy5jb25maWcsIHRoaXMuZGF0YS5hdXRoRGF0YSk7XG4gIGNvbnN0IHJlc3VsdHMgPSB0aGlzLmZpbHRlcmVkT2JqZWN0c0J5QUNMKHIpO1xuICBpZiAocmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJyk7XG4gIH1cbiAgLy8gdXNlIGRhdGEub2JqZWN0SWQgaW4gY2FzZSBvZiBsb2dpbiB0aW1lIGFuZCBmb3VuZCB1c2VyIGR1cmluZyBoYW5kbGUgdmFsaWRhdGVBdXRoRGF0YVxuICBjb25zdCB1c2VySWQgPSB0aGlzLmdldFVzZXJJZCgpIHx8IHRoaXMuZGF0YS5vYmplY3RJZDtcbiAgaWYgKHJlc3VsdHMubGVuZ3RoID09PSAxICYmIHVzZXJJZCAhPT0gcmVzdWx0c1swXS5vYmplY3RJZCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5BQ0NPVU5UX0FMUkVBRFlfTElOS0VELCAndGhpcyBhdXRoIGlzIGFscmVhZHkgdXNlZCcpO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUF1dGhEYXRhID0gYXN5bmMgZnVuY3Rpb24gKGF1dGhEYXRhKSB7XG4gIGNvbnN0IHIgPSBhd2FpdCBBdXRoLmZpbmRVc2Vyc1dpdGhBdXRoRGF0YSh0aGlzLmNvbmZpZywgYXV0aERhdGEpO1xuICBjb25zdCByZXN1bHRzID0gdGhpcy5maWx0ZXJlZE9iamVjdHNCeUFDTChyKTtcblxuICBpZiAocmVzdWx0cy5sZW5ndGggPiAxKSB7XG4gICAgLy8gVG8gYXZvaWQgaHR0cHM6Ly9naXRodWIuY29tL3BhcnNlLWNvbW11bml0eS9wYXJzZS1zZXJ2ZXIvc2VjdXJpdHkvYWR2aXNvcmllcy9HSFNBLTh3M2otZzk4My04amg1XG4gICAgLy8gTGV0J3MgcnVuIHNvbWUgdmFsaWRhdGlvbiBiZWZvcmUgdGhyb3dpbmdcbiAgICBhd2FpdCBBdXRoLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihhdXRoRGF0YSwgdGhpcywgcmVzdWx0c1swXSk7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLkFDQ09VTlRfQUxSRUFEWV9MSU5LRUQsICd0aGlzIGF1dGggaXMgYWxyZWFkeSB1c2VkJyk7XG4gIH1cblxuICAvLyBObyB1c2VyIGZvdW5kIHdpdGggcHJvdmlkZWQgYXV0aERhdGEgd2UgbmVlZCB0byB2YWxpZGF0ZVxuICBpZiAoIXJlc3VsdHMubGVuZ3RoKSB7XG4gICAgY29uc3QgeyBhdXRoRGF0YTogdmFsaWRhdGVkQXV0aERhdGEsIGF1dGhEYXRhUmVzcG9uc2UgfSA9IGF3YWl0IEF1dGguaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uKFxuICAgICAgYXV0aERhdGEsXG4gICAgICB0aGlzXG4gICAgKTtcbiAgICB0aGlzLmF1dGhEYXRhUmVzcG9uc2UgPSBhdXRoRGF0YVJlc3BvbnNlO1xuICAgIC8vIFJlcGxhY2UgY3VycmVudCBhdXRoRGF0YSBieSB0aGUgbmV3IHZhbGlkYXRlZCBvbmVcbiAgICB0aGlzLmRhdGEuYXV0aERhdGEgPSB2YWxpZGF0ZWRBdXRoRGF0YTtcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBVc2VyIGZvdW5kIHdpdGggcHJvdmlkZWQgYXV0aERhdGFcbiAgaWYgKHJlc3VsdHMubGVuZ3RoID09PSAxKSB7XG4gICAgY29uc3QgdXNlcklkID0gdGhpcy5nZXRVc2VySWQoKTtcbiAgICBjb25zdCB1c2VyUmVzdWx0ID0gcmVzdWx0c1swXTtcbiAgICAvLyBQcmV2ZW50IGR1cGxpY2F0ZSBhdXRoRGF0YSBpZFxuICAgIGlmICh1c2VySWQgJiYgdXNlcklkICE9PSB1c2VyUmVzdWx0Lm9iamVjdElkKSB7XG4gICAgICBhd2FpdCBBdXRoLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihhdXRoRGF0YSwgdGhpcywgcmVzdWx0c1swXSk7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuQUNDT1VOVF9BTFJFQURZX0xJTktFRCwgJ3RoaXMgYXV0aCBpcyBhbHJlYWR5IHVzZWQnKTtcbiAgICB9XG5cbiAgICB0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyID0gT2JqZWN0LmtleXMoYXV0aERhdGEpLmpvaW4oJywnKTtcblxuICAgIGNvbnN0IHsgaGFzTXV0YXRlZEF1dGhEYXRhLCBtdXRhdGVkQXV0aERhdGEgfSA9IEF1dGguaGFzTXV0YXRlZEF1dGhEYXRhKFxuICAgICAgYXV0aERhdGEsXG4gICAgICB1c2VyUmVzdWx0LmF1dGhEYXRhXG4gICAgKTtcblxuICAgIGNvbnN0IGlzQ3VycmVudFVzZXJMb2dnZWRPck1hc3RlciA9XG4gICAgICAodGhpcy5hdXRoICYmIHRoaXMuYXV0aC51c2VyICYmIHRoaXMuYXV0aC51c2VyLmlkID09PSB1c2VyUmVzdWx0Lm9iamVjdElkKSB8fFxuICAgICAgdGhpcy5hdXRoLmlzTWFzdGVyO1xuXG4gICAgY29uc3QgaXNMb2dpbiA9ICF1c2VySWQ7XG5cbiAgICBpZiAoaXNMb2dpbiB8fCBpc0N1cnJlbnRVc2VyTG9nZ2VkT3JNYXN0ZXIpIHtcbiAgICAgIC8vIG5vIHVzZXIgbWFraW5nIHRoZSBjYWxsXG4gICAgICAvLyBPUiB0aGUgdXNlciBtYWtpbmcgdGhlIGNhbGwgaXMgdGhlIHJpZ2h0IG9uZVxuICAgICAgLy8gTG9naW4gd2l0aCBhdXRoIGRhdGFcbiAgICAgIGRlbGV0ZSByZXN1bHRzWzBdLnBhc3N3b3JkO1xuXG4gICAgICAvLyBuZWVkIHRvIHNldCB0aGUgb2JqZWN0SWQgZmlyc3Qgb3RoZXJ3aXNlIGxvY2F0aW9uIGhhcyB0cmFpbGluZyB1bmRlZmluZWRcbiAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCA9IHVzZXJSZXN1bHQub2JqZWN0SWQ7XG5cbiAgICAgIGlmICghdGhpcy5xdWVyeSB8fCAhdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgICAgICB0aGlzLnJlc3BvbnNlID0ge1xuICAgICAgICAgIHJlc3BvbnNlOiB1c2VyUmVzdWx0LFxuICAgICAgICAgIGxvY2F0aW9uOiB0aGlzLmxvY2F0aW9uKCksXG4gICAgICAgIH07XG4gICAgICAgIC8vIFJ1biBiZWZvcmVMb2dpbiBob29rIGJlZm9yZSBzdG9yaW5nIGFueSB1cGRhdGVzXG4gICAgICAgIC8vIHRvIGF1dGhEYXRhIG9uIHRoZSBkYjsgY2hhbmdlcyB0byB1c2VyUmVzdWx0XG4gICAgICAgIC8vIHdpbGwgYmUgaWdub3JlZC5cbiAgICAgICAgYXdhaXQgdGhpcy5ydW5CZWZvcmVMb2dpblRyaWdnZXIoZGVlcGNvcHkodXNlclJlc3VsdCkpO1xuXG4gICAgICAgIC8vIElmIHdlIGFyZSBpbiBsb2dpbiBvcGVyYXRpb24gdmlhIGF1dGhEYXRhXG4gICAgICAgIC8vIHdlIG5lZWQgdG8gYmUgc3VyZSB0aGF0IHRoZSB1c2VyIGhhcyBwcm92aWRlZFxuICAgICAgICAvLyByZXF1aXJlZCBhdXRoRGF0YVxuICAgICAgICBBdXRoLmNoZWNrSWZVc2VySGFzUHJvdmlkZWRDb25maWd1cmVkUHJvdmlkZXJzRm9yTG9naW4oXG4gICAgICAgICAgeyBjb25maWc6IHRoaXMuY29uZmlnLCBhdXRoOiB0aGlzLmF1dGggfSxcbiAgICAgICAgICBhdXRoRGF0YSxcbiAgICAgICAgICB1c2VyUmVzdWx0LmF1dGhEYXRhLFxuICAgICAgICAgIHRoaXMuY29uZmlnXG4gICAgICAgICk7XG4gICAgICB9XG5cbiAgICAgIC8vIFByZXZlbnQgdmFsaWRhdGluZyBpZiBubyBtdXRhdGVkIGRhdGEgZGV0ZWN0ZWQgb24gdXBkYXRlXG4gICAgICBpZiAoIWhhc011dGF0ZWRBdXRoRGF0YSAmJiBpc0N1cnJlbnRVc2VyTG9nZ2VkT3JNYXN0ZXIpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICAvLyBGb3JjZSB0byB2YWxpZGF0ZSBhbGwgcHJvdmlkZWQgYXV0aERhdGEgb24gbG9naW5cbiAgICAgIC8vIG9uIHVwZGF0ZSBvbmx5IHZhbGlkYXRlIG11dGF0ZWQgb25lc1xuICAgICAgaWYgKGhhc011dGF0ZWRBdXRoRGF0YSB8fCAhdGhpcy5jb25maWcuYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbikge1xuICAgICAgICBjb25zdCByZXMgPSBhd2FpdCBBdXRoLmhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbihcbiAgICAgICAgICBpc0xvZ2luID8gYXV0aERhdGEgOiBtdXRhdGVkQXV0aERhdGEsXG4gICAgICAgICAgdGhpcyxcbiAgICAgICAgICB1c2VyUmVzdWx0XG4gICAgICAgICk7XG4gICAgICAgIHRoaXMuZGF0YS5hdXRoRGF0YSA9IHJlcy5hdXRoRGF0YTtcbiAgICAgICAgdGhpcy5hdXRoRGF0YVJlc3BvbnNlID0gcmVzLmF1dGhEYXRhUmVzcG9uc2U7XG4gICAgICB9XG5cbiAgICAgIC8vIElGIHdlIGFyZSBpbiBsb2dpbiB3ZSdsbCBza2lwIHRoZSBkYXRhYmFzZSBvcGVyYXRpb24gLyBiZWZvcmVTYXZlIC8gYWZ0ZXJTYXZlIGV0Yy4uLlxuICAgICAgLy8gd2UgbmVlZCB0byBzZXQgaXQgdXAgdGhlcmUuXG4gICAgICAvLyBXZSBhcmUgc3VwcG9zZWQgdG8gaGF2ZSBhIHJlc3BvbnNlIG9ubHkgb24gTE9HSU4gd2l0aCBhdXRoRGF0YSwgc28gd2Ugc2tpcCB0aG9zZVxuICAgICAgLy8gSWYgd2UncmUgbm90IGxvZ2dpbmcgaW4sIGJ1dCBqdXN0IHVwZGF0aW5nIHRoZSBjdXJyZW50IHVzZXIsIHdlIGNhbiBzYWZlbHkgc2tpcCB0aGF0IHBhcnRcbiAgICAgIGlmICh0aGlzLnJlc3BvbnNlKSB7XG4gICAgICAgIC8vIEFzc2lnbiB0aGUgbmV3IGF1dGhEYXRhIGluIHRoZSByZXNwb25zZVxuICAgICAgICBPYmplY3Qua2V5cyhtdXRhdGVkQXV0aERhdGEpLmZvckVhY2gocHJvdmlkZXIgPT4ge1xuICAgICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UuYXV0aERhdGFbcHJvdmlkZXJdID0gbXV0YXRlZEF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gUnVuIHRoZSBEQiB1cGRhdGUgZGlyZWN0bHksIGFzICdtYXN0ZXInIG9ubHkgaWYgYXV0aERhdGEgY29udGFpbnMgc29tZSBrZXlzXG4gICAgICAgIC8vIGF1dGhEYXRhIGNvdWxkIG5vdCBjb250YWlucyBrZXlzIGFmdGVyIHZhbGlkYXRpb24gaWYgdGhlIGF1dGhBZGFwdGVyXG4gICAgICAgIC8vIHVzZXMgdGhlIGBkb05vdFNhdmVgIG9wdGlvbi4gSnVzdCB1cGRhdGUgdGhlIGF1dGhEYXRhIHBhcnRcbiAgICAgICAgLy8gVGhlbiB3ZSdyZSBnb29kIGZvciB0aGUgdXNlciwgZWFybHkgZXhpdCBvZiBzb3J0c1xuICAgICAgICBpZiAoT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGgpIHtcbiAgICAgICAgICBhd2FpdCB0aGlzLmNvbmZpZy5kYXRhYmFzZS51cGRhdGUoXG4gICAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHsgb2JqZWN0SWQ6IHRoaXMuZGF0YS5vYmplY3RJZCB9LFxuICAgICAgICAgICAgeyBhdXRoRGF0YTogdGhpcy5kYXRhLmF1dGhEYXRhIH0sXG4gICAgICAgICAgICB7fVxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY2hlY2tSZXN0cmljdGVkRmllbGRzID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoIXRoaXMuYXV0aC5pc01haW50ZW5hbmNlICYmICF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgJ2VtYWlsVmVyaWZpZWQnIGluIHRoaXMuZGF0YSkge1xuICAgIGNvbnN0IGVycm9yID0gYENsaWVudHMgYXJlbid0IGFsbG93ZWQgdG8gbWFudWFsbHkgdXBkYXRlIGVtYWlsIHZlcmlmaWNhdGlvbi5gO1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLCBlcnJvcik7XG4gIH1cbn07XG5cbi8vIFRoZSBub24tdGhpcmQtcGFydHkgcGFydHMgb2YgVXNlciB0cmFuc2Zvcm1hdGlvblxuUmVzdFdyaXRlLnByb3RvdHlwZS50cmFuc2Zvcm1Vc2VyID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICB2YXIgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICBpZiAodGhpcy5jbGFzc05hbWUgIT09ICdfVXNlcicpIHtcbiAgICByZXR1cm4gcHJvbWlzZTtcbiAgfVxuXG4gIC8vIERvIG5vdCBjbGVhbnVwIHNlc3Npb24gaWYgb2JqZWN0SWQgaXMgbm90IHNldFxuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLm9iamVjdElkKCkpIHtcbiAgICAvLyBJZiB3ZSdyZSB1cGRhdGluZyBhIF9Vc2VyIG9iamVjdCwgd2UgbmVlZCB0byBjbGVhciBvdXQgdGhlIGNhY2hlIGZvciB0aGF0IHVzZXIuIEZpbmQgYWxsIHRoZWlyXG4gICAgLy8gc2Vzc2lvbiB0b2tlbnMsIGFuZCByZW1vdmUgdGhlbSBmcm9tIHRoZSBjYWNoZS5cbiAgICBjb25zdCBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZmluZCxcbiAgICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgICBhdXRoOiBBdXRoLm1hc3Rlcih0aGlzLmNvbmZpZyksXG4gICAgICBjbGFzc05hbWU6ICdfU2Vzc2lvbicsXG4gICAgICBydW5CZWZvcmVGaW5kOiBmYWxzZSxcbiAgICAgIHJlc3RXaGVyZToge1xuICAgICAgICB1c2VyOiB7XG4gICAgICAgICAgX190eXBlOiAnUG9pbnRlcicsXG4gICAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICAgIG9iamVjdElkOiB0aGlzLm9iamVjdElkKCksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuICAgIHByb21pc2UgPSBxdWVyeS5leGVjdXRlKCkudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIHJlc3VsdHMucmVzdWx0cy5mb3JFYWNoKHNlc3Npb24gPT5cbiAgICAgICAgdGhpcy5jb25maWcuY2FjaGVDb250cm9sbGVyLnVzZXIuZGVsKHNlc3Npb24uc2Vzc2lvblRva2VuKVxuICAgICAgKTtcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiBwcm9taXNlXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gVHJhbnNmb3JtIHRoZSBwYXNzd29yZFxuICAgICAgaWYgKHRoaXMuZGF0YS5wYXNzd29yZCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIC8vIGlnbm9yZSBvbmx5IGlmIHVuZGVmaW5lZC4gc2hvdWxkIHByb2NlZWQgaWYgZW1wdHkgKCcnKVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgICAgIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddID0gdHJ1ZTtcbiAgICAgICAgLy8gR2VuZXJhdGUgYSBuZXcgc2Vzc2lvbiBvbmx5IGlmIHRoZSB1c2VyIHJlcXVlc3RlZFxuICAgICAgICBpZiAoIXRoaXMuYXV0aC5pc01hc3RlciAmJiAhdGhpcy5hdXRoLmlzTWFpbnRlbmFuY2UpIHtcbiAgICAgICAgICB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZFBvbGljeSgpLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4gcGFzc3dvcmRDcnlwdG8uaGFzaCh0aGlzLmRhdGEucGFzc3dvcmQpLnRoZW4oaGFzaGVkUGFzc3dvcmQgPT4ge1xuICAgICAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkID0gaGFzaGVkUGFzc3dvcmQ7XG4gICAgICAgICAgZGVsZXRlIHRoaXMuZGF0YS5wYXNzd29yZDtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVVzZXJOYW1lKCk7XG4gICAgfSlcbiAgICAudGhlbigoKSA9PiB7XG4gICAgICByZXR1cm4gdGhpcy5fdmFsaWRhdGVFbWFpbCgpO1xuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVVc2VyTmFtZSA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gQ2hlY2sgZm9yIHVzZXJuYW1lIHVuaXF1ZW5lc3NcbiAgaWYgKCF0aGlzLmRhdGEudXNlcm5hbWUpIHtcbiAgICBpZiAoIXRoaXMucXVlcnkpIHtcbiAgICAgIHRoaXMuZGF0YS51c2VybmFtZSA9IGNyeXB0b1V0aWxzLnJhbmRvbVN0cmluZygyNSk7XG4gICAgICB0aGlzLnJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lID0gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8qXG4gICAgVXNlcm5hbWVzIHNob3VsZCBiZSB1bmlxdWUgd2hlbiBjb21wYXJlZCBjYXNlIGluc2Vuc2l0aXZlbHlcblxuICAgIFVzZXJzIHNob3VsZCBiZSBhYmxlIHRvIG1ha2UgY2FzZSBzZW5zaXRpdmUgdXNlcm5hbWVzIGFuZFxuICAgIGxvZ2luIHVzaW5nIHRoZSBjYXNlIHRoZXkgZW50ZXJlZC4gIEkuZS4gJ1Nub29weScgc2hvdWxkIHByZWNsdWRlXG4gICAgJ3Nub29weScgYXMgYSB2YWxpZCB1c2VybmFtZS5cbiAgKi9cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmZpbmQoXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHtcbiAgICAgICAgdXNlcm5hbWU6IHRoaXMuZGF0YS51c2VybmFtZSxcbiAgICAgICAgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgIH0sXG4gICAgICB7IGxpbWl0OiAxLCBjYXNlSW5zZW5zaXRpdmU6IHRydWUgfSxcbiAgICAgIHt9LFxuICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICApXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyB1c2VybmFtZS4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICByZXR1cm47XG4gICAgfSk7XG59O1xuXG4vKlxuICBBcyB3aXRoIHVzZXJuYW1lcywgUGFyc2Ugc2hvdWxkIG5vdCBhbGxvdyBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbnMgb2YgZW1haWwuXG4gIHVubGlrZSB3aXRoIHVzZXJuYW1lcyAod2hpY2ggY2FuIGhhdmUgY2FzZSBpbnNlbnNpdGl2ZSBjb2xsaXNpb25zIGluIHRoZSBjYXNlIG9mXG4gIGF1dGggYWRhcHRlcnMpLCBlbWFpbHMgc2hvdWxkIG5ldmVyIGhhdmUgYSBjYXNlIGluc2Vuc2l0aXZlIGNvbGxpc2lvbi5cblxuICBUaGlzIGJlaGF2aW9yIGNhbiBiZSBlbmZvcmNlZCB0aHJvdWdoIGEgcHJvcGVybHkgY29uZmlndXJlZCBpbmRleCBzZWU6XG4gIGh0dHBzOi8vZG9jcy5tb25nb2RiLmNvbS9tYW51YWwvY29yZS9pbmRleC1jYXNlLWluc2Vuc2l0aXZlLyNjcmVhdGUtYS1jYXNlLWluc2Vuc2l0aXZlLWluZGV4XG4gIHdoaWNoIGNvdWxkIGJlIGltcGxlbWVudGVkIGluc3RlYWQgb2YgdGhpcyBjb2RlIGJhc2VkIHZhbGlkYXRpb24uXG5cbiAgR2l2ZW4gdGhhdCB0aGlzIGxvb2t1cCBzaG91bGQgYmUgYSByZWxhdGl2ZWx5IGxvdyB1c2UgY2FzZSBhbmQgdGhhdCB0aGUgY2FzZSBzZW5zaXRpdmVcbiAgdW5pcXVlIGluZGV4IHdpbGwgYmUgdXNlZCBieSB0aGUgZGIgZm9yIHRoZSBxdWVyeSwgdGhpcyBpcyBhbiBhZGVxdWF0ZSBzb2x1dGlvbi5cbiovXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZUVtYWlsID0gZnVuY3Rpb24gKCkge1xuICBpZiAoIXRoaXMuZGF0YS5lbWFpbCB8fCB0aGlzLmRhdGEuZW1haWwuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gVmFsaWRhdGUgYmFzaWMgZW1haWwgYWRkcmVzcyBmb3JtYXRcbiAgaWYgKCF0aGlzLmRhdGEuZW1haWwubWF0Y2goL14uK0AuKyQvKSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0VNQUlMX0FERFJFU1MsICdFbWFpbCBhZGRyZXNzIGZvcm1hdCBpcyBpbnZhbGlkLicpXG4gICAgKTtcbiAgfVxuICAvLyBDYXNlIGluc2Vuc2l0aXZlIG1hdGNoLCBzZWUgbm90ZSBhYm92ZSBmdW5jdGlvbi5cbiAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgLmZpbmQoXG4gICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgIHtcbiAgICAgICAgZW1haWw6IHRoaXMuZGF0YS5lbWFpbCxcbiAgICAgICAgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgIH0sXG4gICAgICB7IGxpbWl0OiAxLCBjYXNlSW5zZW5zaXRpdmU6IHRydWUgfSxcbiAgICAgIHt9LFxuICAgICAgdGhpcy52YWxpZFNjaGVtYUNvbnRyb2xsZXJcbiAgICApXG4gICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5FTUFJTF9UQUtFTixcbiAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGlmIChcbiAgICAgICAgIXRoaXMuZGF0YS5hdXRoRGF0YSB8fFxuICAgICAgICAhT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5sZW5ndGggfHxcbiAgICAgICAgKE9iamVjdC5rZXlzKHRoaXMuZGF0YS5hdXRoRGF0YSkubGVuZ3RoID09PSAxICYmXG4gICAgICAgICAgT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKVswXSA9PT0gJ2Fub255bW91cycpXG4gICAgICApIHtcbiAgICAgICAgLy8gV2UgdXBkYXRlZCB0aGUgZW1haWwsIHNlbmQgYSBuZXcgdmFsaWRhdGlvblxuICAgICAgICBjb25zdCB7IG9yaWdpbmFsT2JqZWN0LCB1cGRhdGVkT2JqZWN0IH0gPSB0aGlzLmJ1aWxkUGFyc2VPYmplY3RzKCk7XG4gICAgICAgIGNvbnN0IHJlcXVlc3QgPSB7XG4gICAgICAgICAgb3JpZ2luYWw6IG9yaWdpbmFsT2JqZWN0LFxuICAgICAgICAgIG9iamVjdDogdXBkYXRlZE9iamVjdCxcbiAgICAgICAgICBtYXN0ZXI6IHRoaXMuYXV0aC5pc01hc3RlcixcbiAgICAgICAgICBpcDogdGhpcy5jb25maWcuaXAsXG4gICAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IHRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLnVzZXJDb250cm9sbGVyLnNldEVtYWlsVmVyaWZ5VG9rZW4odGhpcy5kYXRhLCByZXF1ZXN0LCB0aGlzLnN0b3JhZ2UpO1xuICAgICAgfVxuICAgIH0pO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5fdmFsaWRhdGVQYXNzd29yZFBvbGljeSA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSkgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICByZXR1cm4gdGhpcy5fdmFsaWRhdGVQYXNzd29yZFJlcXVpcmVtZW50cygpLnRoZW4oKCkgPT4ge1xuICAgIHJldHVybiB0aGlzLl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSgpO1xuICB9KTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuX3ZhbGlkYXRlUGFzc3dvcmRSZXF1aXJlbWVudHMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIGNoZWNrIGlmIHRoZSBwYXNzd29yZCBjb25mb3JtcyB0byB0aGUgZGVmaW5lZCBwYXNzd29yZCBwb2xpY3kgaWYgY29uZmlndXJlZFxuICAvLyBJZiB3ZSBzcGVjaWZpZWQgYSBjdXN0b20gZXJyb3IgaW4gb3VyIGNvbmZpZ3VyYXRpb24gdXNlIGl0LlxuICAvLyBFeGFtcGxlOiBcIlBhc3N3b3JkcyBtdXN0IGluY2x1ZGUgYSBDYXBpdGFsIExldHRlciwgTG93ZXJjYXNlIExldHRlciwgYW5kIGEgbnVtYmVyLlwiXG4gIC8vXG4gIC8vIFRoaXMgaXMgZXNwZWNpYWxseSB1c2VmdWwgb24gdGhlIGdlbmVyaWMgXCJwYXNzd29yZCByZXNldFwiIHBhZ2UsXG4gIC8vIGFzIGl0IGFsbG93cyB0aGUgcHJvZ3JhbW1lciB0byBjb21tdW5pY2F0ZSBzcGVjaWZpYyByZXF1aXJlbWVudHMgaW5zdGVhZCBvZjpcbiAgLy8gYS4gbWFraW5nIHRoZSB1c2VyIGd1ZXNzIHdoYXRzIHdyb25nXG4gIC8vIGIuIG1ha2luZyBhIGN1c3RvbSBwYXNzd29yZCByZXNldCBwYWdlIHRoYXQgc2hvd3MgdGhlIHJlcXVpcmVtZW50c1xuICBjb25zdCBwb2xpY3lFcnJvciA9IHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRpb25FcnJvclxuICAgID8gdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kudmFsaWRhdGlvbkVycm9yXG4gICAgOiAnUGFzc3dvcmQgZG9lcyBub3QgbWVldCB0aGUgUGFzc3dvcmQgUG9saWN5IHJlcXVpcmVtZW50cy4nO1xuICBjb25zdCBjb250YWluc1VzZXJuYW1lRXJyb3IgPSAnUGFzc3dvcmQgY2Fubm90IGNvbnRhaW4geW91ciB1c2VybmFtZS4nO1xuXG4gIC8vIGNoZWNrIHdoZXRoZXIgdGhlIHBhc3N3b3JkIG1lZXRzIHRoZSBwYXNzd29yZCBzdHJlbmd0aCByZXF1aXJlbWVudHNcbiAgaWYgKFxuICAgICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yICYmXG4gICAgICAhdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kucGF0dGVyblZhbGlkYXRvcih0aGlzLmRhdGEucGFzc3dvcmQpKSB8fFxuICAgICh0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAmJlxuICAgICAgIXRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrKHRoaXMuZGF0YS5wYXNzd29yZCkpXG4gICkge1xuICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgcG9saWN5RXJyb3IpKTtcbiAgfVxuXG4gIC8vIGNoZWNrIHdoZXRoZXIgcGFzc3dvcmQgY29udGFpbiB1c2VybmFtZVxuICBpZiAodGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kuZG9Ob3RBbGxvd1VzZXJuYW1lID09PSB0cnVlKSB7XG4gICAgaWYgKHRoaXMuZGF0YS51c2VybmFtZSkge1xuICAgICAgLy8gdXNlcm5hbWUgaXMgbm90IHBhc3NlZCBkdXJpbmcgcGFzc3dvcmQgcmVzZXRcbiAgICAgIGlmICh0aGlzLmRhdGEucGFzc3dvcmQuaW5kZXhPZih0aGlzLmRhdGEudXNlcm5hbWUpID49IDApXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgY29udGFpbnNVc2VybmFtZUVycm9yKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIHJldHJpZXZlIHRoZSBVc2VyIG9iamVjdCB1c2luZyBvYmplY3RJZCBkdXJpbmcgcGFzc3dvcmQgcmVzZXRcbiAgICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZS5maW5kKCdfVXNlcicsIHsgb2JqZWN0SWQ6IHRoaXMub2JqZWN0SWQoKSB9KS50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggIT0gMSkge1xuICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICBpZiAodGhpcy5kYXRhLnBhc3N3b3JkLmluZGV4T2YocmVzdWx0c1swXS51c2VybmFtZSkgPj0gMClcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUiwgY29udGFpbnNVc2VybmFtZUVycm9yKVxuICAgICAgICAgICk7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl92YWxpZGF0ZVBhc3N3b3JkSGlzdG9yeSA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gY2hlY2sgd2hldGhlciBwYXNzd29yZCBpcyByZXBlYXRpbmcgZnJvbSBzcGVjaWZpZWQgaGlzdG9yeVxuICBpZiAodGhpcy5xdWVyeSAmJiB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkpIHtcbiAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2VcbiAgICAgIC5maW5kKFxuICAgICAgICAnX1VzZXInLFxuICAgICAgICB7IG9iamVjdElkOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgeyBrZXlzOiBbJ19wYXNzd29yZF9oaXN0b3J5JywgJ19oYXNoZWRfcGFzc3dvcmQnXSB9LFxuICAgICAgICBBdXRoLm1haW50ZW5hbmNlKHRoaXMuY29uZmlnKVxuICAgICAgKVxuICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAgICAgdGhyb3cgdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHVzZXIgPSByZXN1bHRzWzBdO1xuICAgICAgICBsZXQgb2xkUGFzc3dvcmRzID0gW107XG4gICAgICAgIGlmICh1c2VyLl9wYXNzd29yZF9oaXN0b3J5KVxuICAgICAgICAgIG9sZFBhc3N3b3JkcyA9IF8udGFrZShcbiAgICAgICAgICAgIHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnksXG4gICAgICAgICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgLSAxXG4gICAgICAgICAgKTtcbiAgICAgICAgb2xkUGFzc3dvcmRzLnB1c2godXNlci5wYXNzd29yZCk7XG4gICAgICAgIGNvbnN0IG5ld1Bhc3N3b3JkID0gdGhpcy5kYXRhLnBhc3N3b3JkO1xuICAgICAgICAvLyBjb21wYXJlIHRoZSBuZXcgcGFzc3dvcmQgaGFzaCB3aXRoIGFsbCBvbGQgcGFzc3dvcmQgaGFzaGVzXG4gICAgICAgIGNvbnN0IHByb21pc2VzID0gb2xkUGFzc3dvcmRzLm1hcChmdW5jdGlvbiAoaGFzaCkge1xuICAgICAgICAgIHJldHVybiBwYXNzd29yZENyeXB0by5jb21wYXJlKG5ld1Bhc3N3b3JkLCBoYXNoKS50aGVuKHJlc3VsdCA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0KVxuICAgICAgICAgICAgICAvLyByZWplY3QgaWYgdGhlcmUgaXMgYSBtYXRjaFxuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoJ1JFUEVBVF9QQVNTV09SRCcpO1xuICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICAgICAgLy8gd2FpdCBmb3IgYWxsIGNvbXBhcmlzb25zIHRvIGNvbXBsZXRlXG4gICAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcylcbiAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIgPT09ICdSRVBFQVRfUEFTU1dPUkQnKVxuICAgICAgICAgICAgICAvLyBhIG1hdGNoIHdhcyBmb3VuZFxuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QoXG4gICAgICAgICAgICAgICAgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuVkFMSURBVElPTl9FUlJPUixcbiAgICAgICAgICAgICAgICAgIGBOZXcgcGFzc3dvcmQgc2hvdWxkIG5vdCBiZSB0aGUgc2FtZSBhcyBsYXN0ICR7dGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5fSBwYXNzd29yZHMuYFxuICAgICAgICAgICAgICAgIClcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pO1xuICB9XG4gIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY3JlYXRlU2Vzc2lvblRva2VuSWZOZWVkZWQgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJykge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBEb24ndCBnZW5lcmF0ZSBzZXNzaW9uIGZvciB1cGRhdGluZyB1c2VyICh0aGlzLnF1ZXJ5IGlzIHNldCkgdW5sZXNzIGF1dGhEYXRhIGV4aXN0c1xuICBpZiAodGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmF1dGhEYXRhKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIERvbid0IGdlbmVyYXRlIG5ldyBzZXNzaW9uVG9rZW4gaWYgbGlua2luZyB2aWEgc2Vzc2lvblRva2VuXG4gIGlmICh0aGlzLmF1dGgudXNlciAmJiB0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gSWYgc2lnbi11cCBjYWxsXG4gIGlmICghdGhpcy5zdG9yYWdlLmF1dGhQcm92aWRlcikge1xuICAgIC8vIENyZWF0ZSByZXF1ZXN0IG9iamVjdCBmb3IgdmVyaWZpY2F0aW9uIGZ1bmN0aW9uc1xuICAgIGNvbnN0IHsgb3JpZ2luYWxPYmplY3QsIHVwZGF0ZWRPYmplY3QgfSA9IHRoaXMuYnVpbGRQYXJzZU9iamVjdHMoKTtcbiAgICBjb25zdCByZXF1ZXN0ID0ge1xuICAgICAgb3JpZ2luYWw6IG9yaWdpbmFsT2JqZWN0LFxuICAgICAgb2JqZWN0OiB1cGRhdGVkT2JqZWN0LFxuICAgICAgbWFzdGVyOiB0aGlzLmF1dGguaXNNYXN0ZXIsXG4gICAgICBpcDogdGhpcy5jb25maWcuaXAsXG4gICAgICBpbnN0YWxsYXRpb25JZDogdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkLFxuICAgIH07XG4gICAgLy8gR2V0IHZlcmlmaWNhdGlvbiBjb25kaXRpb25zIHdoaWNoIGNhbiBiZSBib29sZWFucyBvciBmdW5jdGlvbnM7IHRoZSBwdXJwb3NlIG9mIHRoaXMgYXN5bmMvYXdhaXRcbiAgICAvLyBzdHJ1Y3R1cmUgaXMgdG8gYXZvaWQgdW5uZWNlc3NhcmlseSBleGVjdXRpbmcgc3Vic2VxdWVudCBmdW5jdGlvbnMgaWYgcHJldmlvdXMgb25lcyBmYWlsIGluIHRoZVxuICAgIC8vIGNvbmRpdGlvbmFsIHN0YXRlbWVudCBiZWxvdywgYXMgYSBkZXZlbG9wZXIgbWF5IGRlY2lkZSB0byBleGVjdXRlIGV4cGVuc2l2ZSBvcGVyYXRpb25zIGluIHRoZW1cbiAgICBjb25zdCB2ZXJpZnlVc2VyRW1haWxzID0gYXN5bmMgKCkgPT4gdGhpcy5jb25maWcudmVyaWZ5VXNlckVtYWlscyA9PT0gdHJ1ZSB8fCAodHlwZW9mIHRoaXMuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMgPT09ICdmdW5jdGlvbicgJiYgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuY29uZmlnLnZlcmlmeVVzZXJFbWFpbHMocmVxdWVzdCkpID09PSB0cnVlKTtcbiAgICBjb25zdCBwcmV2ZW50TG9naW5XaXRoVW52ZXJpZmllZEVtYWlsID0gYXN5bmMgKCkgPT4gdGhpcy5jb25maWcucHJldmVudExvZ2luV2l0aFVudmVyaWZpZWRFbWFpbCA9PT0gdHJ1ZSB8fCAodHlwZW9mIHRoaXMuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwgPT09ICdmdW5jdGlvbicgJiYgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuY29uZmlnLnByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwocmVxdWVzdCkpID09PSB0cnVlKTtcbiAgICAvLyBJZiB2ZXJpZmljYXRpb24gaXMgcmVxdWlyZWRcbiAgICBpZiAoYXdhaXQgdmVyaWZ5VXNlckVtYWlscygpICYmIGF3YWl0IHByZXZlbnRMb2dpbldpdGhVbnZlcmlmaWVkRW1haWwoKSkge1xuICAgICAgdGhpcy5zdG9yYWdlLnJlamVjdFNpZ251cCA9IHRydWU7XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9XG4gIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbigpO1xufTtcblxuUmVzdFdyaXRlLnByb3RvdHlwZS5jcmVhdGVTZXNzaW9uVG9rZW4gPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIC8vIGNsb3VkIGluc3RhbGxhdGlvbklkIGZyb20gQ2xvdWQgQ29kZSxcbiAgLy8gbmV2ZXIgY3JlYXRlIHNlc3Npb24gdG9rZW5zIGZyb20gdGhlcmUuXG4gIGlmICh0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQgJiYgdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkID09PSAnY2xvdWQnKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgaWYgKHRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIgPT0gbnVsbCAmJiB0aGlzLmRhdGEuYXV0aERhdGEpIHtcbiAgICB0aGlzLnN0b3JhZ2UuYXV0aFByb3ZpZGVyID0gT2JqZWN0LmtleXModGhpcy5kYXRhLmF1dGhEYXRhKS5qb2luKCcsJyk7XG4gIH1cblxuICBjb25zdCB7IHNlc3Npb25EYXRhLCBjcmVhdGVTZXNzaW9uIH0gPSBSZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbih0aGlzLmNvbmZpZywge1xuICAgIHVzZXJJZDogdGhpcy5vYmplY3RJZCgpLFxuICAgIGNyZWF0ZWRXaXRoOiB7XG4gICAgICBhY3Rpb246IHRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIgPyAnbG9naW4nIDogJ3NpZ251cCcsXG4gICAgICBhdXRoUHJvdmlkZXI6IHRoaXMuc3RvcmFnZS5hdXRoUHJvdmlkZXIgfHwgJ3Bhc3N3b3JkJyxcbiAgICB9LFxuICAgIGluc3RhbGxhdGlvbklkOiB0aGlzLmF1dGguaW5zdGFsbGF0aW9uSWQsXG4gIH0pO1xuXG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpIHtcbiAgICB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlLnNlc3Npb25Ub2tlbiA9IHNlc3Npb25EYXRhLnNlc3Npb25Ub2tlbjtcbiAgfVxuXG4gIHJldHVybiBjcmVhdGVTZXNzaW9uKCk7XG59O1xuXG5SZXN0V3JpdGUuY3JlYXRlU2Vzc2lvbiA9IGZ1bmN0aW9uIChcbiAgY29uZmlnLFxuICB7IHVzZXJJZCwgY3JlYXRlZFdpdGgsIGluc3RhbGxhdGlvbklkLCBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEgfVxuKSB7XG4gIGNvbnN0IHRva2VuID0gJ3I6JyArIGNyeXB0b1V0aWxzLm5ld1Rva2VuKCk7XG4gIGNvbnN0IGV4cGlyZXNBdCA9IGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQoKTtcbiAgY29uc3Qgc2Vzc2lvbkRhdGEgPSB7XG4gICAgc2Vzc2lvblRva2VuOiB0b2tlbixcbiAgICB1c2VyOiB7XG4gICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgIGNsYXNzTmFtZTogJ19Vc2VyJyxcbiAgICAgIG9iamVjdElkOiB1c2VySWQsXG4gICAgfSxcbiAgICBjcmVhdGVkV2l0aCxcbiAgICBleHBpcmVzQXQ6IFBhcnNlLl9lbmNvZGUoZXhwaXJlc0F0KSxcbiAgfTtcblxuICBpZiAoaW5zdGFsbGF0aW9uSWQpIHtcbiAgICBzZXNzaW9uRGF0YS5pbnN0YWxsYXRpb25JZCA9IGluc3RhbGxhdGlvbklkO1xuICB9XG5cbiAgT2JqZWN0LmFzc2lnbihzZXNzaW9uRGF0YSwgYWRkaXRpb25hbFNlc3Npb25EYXRhKTtcblxuICByZXR1cm4ge1xuICAgIHNlc3Npb25EYXRhLFxuICAgIGNyZWF0ZVNlc3Npb246ICgpID0+XG4gICAgICBuZXcgUmVzdFdyaXRlKGNvbmZpZywgQXV0aC5tYXN0ZXIoY29uZmlnKSwgJ19TZXNzaW9uJywgbnVsbCwgc2Vzc2lvbkRhdGEpLmV4ZWN1dGUoKSxcbiAgfTtcbn07XG5cbi8vIERlbGV0ZSBlbWFpbCByZXNldCB0b2tlbnMgaWYgdXNlciBpcyBjaGFuZ2luZyBwYXNzd29yZCBvciBlbWFpbC5cblJlc3RXcml0ZS5wcm90b3R5cGUuZGVsZXRlRW1haWxSZXNldFRva2VuSWZOZWVkZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPT0gJ19Vc2VyJyB8fCB0aGlzLnF1ZXJ5ID09PSBudWxsKSB7XG4gICAgLy8gbnVsbCBxdWVyeSBtZWFucyBjcmVhdGVcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoJ3Bhc3N3b3JkJyBpbiB0aGlzLmRhdGEgfHwgJ2VtYWlsJyBpbiB0aGlzLmRhdGEpIHtcbiAgICBjb25zdCBhZGRPcHMgPSB7XG4gICAgICBfcGVyaXNoYWJsZV90b2tlbjogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgICAgX3BlcmlzaGFibGVfdG9rZW5fZXhwaXJlc19hdDogeyBfX29wOiAnRGVsZXRlJyB9LFxuICAgIH07XG4gICAgdGhpcy5kYXRhID0gT2JqZWN0LmFzc2lnbih0aGlzLmRhdGEsIGFkZE9wcyk7XG4gIH1cbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuZGVzdHJveUR1cGxpY2F0ZWRTZXNzaW9ucyA9IGZ1bmN0aW9uICgpIHtcbiAgLy8gT25seSBmb3IgX1Nlc3Npb24sIGFuZCBhdCBjcmVhdGlvbiB0aW1lXG4gIGlmICh0aGlzLmNsYXNzTmFtZSAhPSAnX1Nlc3Npb24nIHx8IHRoaXMucXVlcnkpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gRGVzdHJveSB0aGUgc2Vzc2lvbnMgaW4gJ0JhY2tncm91bmQnXG4gIGNvbnN0IHsgdXNlciwgaW5zdGFsbGF0aW9uSWQsIHNlc3Npb25Ub2tlbiB9ID0gdGhpcy5kYXRhO1xuICBpZiAoIXVzZXIgfHwgIWluc3RhbGxhdGlvbklkKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGlmICghdXNlci5vYmplY3RJZCkge1xuICAgIHJldHVybjtcbiAgfVxuICB0aGlzLmNvbmZpZy5kYXRhYmFzZS5kZXN0cm95KFxuICAgICdfU2Vzc2lvbicsXG4gICAge1xuICAgICAgdXNlcixcbiAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgc2Vzc2lvblRva2VuOiB7ICRuZTogc2Vzc2lvblRva2VuIH0sXG4gICAgfSxcbiAgICB7fSxcbiAgICB0aGlzLnZhbGlkU2NoZW1hQ29udHJvbGxlclxuICApO1xufTtcblxuLy8gSGFuZGxlcyBhbnkgZm9sbG93dXAgbG9naWNcblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlRm9sbG93dXAgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydjbGVhclNlc3Npb25zJ10gJiYgdGhpcy5jb25maWcucmV2b2tlU2Vzc2lvbk9uUGFzc3dvcmRSZXNldCkge1xuICAgIHZhciBzZXNzaW9uUXVlcnkgPSB7XG4gICAgICB1c2VyOiB7XG4gICAgICAgIF9fdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgICAgIG9iamVjdElkOiB0aGlzLm9iamVjdElkKCksXG4gICAgICB9LFxuICAgIH07XG4gICAgZGVsZXRlIHRoaXMuc3RvcmFnZVsnY2xlYXJTZXNzaW9ucyddO1xuICAgIHJldHVybiB0aGlzLmNvbmZpZy5kYXRhYmFzZVxuICAgICAgLmRlc3Ryb3koJ19TZXNzaW9uJywgc2Vzc2lvblF1ZXJ5KVxuICAgICAgLnRoZW4odGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydnZW5lcmF0ZU5ld1Nlc3Npb24nXSkge1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ2dlbmVyYXRlTmV3U2Vzc2lvbiddO1xuICAgIHJldHVybiB0aGlzLmNyZWF0ZVNlc3Npb25Ub2tlbigpLnRoZW4odGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpKTtcbiAgfVxuXG4gIGlmICh0aGlzLnN0b3JhZ2UgJiYgdGhpcy5zdG9yYWdlWydzZW5kVmVyaWZpY2F0aW9uRW1haWwnXSkge1xuICAgIGRlbGV0ZSB0aGlzLnN0b3JhZ2VbJ3NlbmRWZXJpZmljYXRpb25FbWFpbCddO1xuICAgIC8vIEZpcmUgYW5kIGZvcmdldCFcbiAgICB0aGlzLmNvbmZpZy51c2VyQ29udHJvbGxlci5zZW5kVmVyaWZpY2F0aW9uRW1haWwodGhpcy5kYXRhLCB7IGF1dGg6IHRoaXMuYXV0aCB9KTtcbiAgICByZXR1cm4gdGhpcy5oYW5kbGVGb2xsb3d1cC5iaW5kKHRoaXMpO1xuICB9XG59O1xuXG4vLyBIYW5kbGVzIHRoZSBfU2Vzc2lvbiBjbGFzcyBzcGVjaWFsbmVzcy5cbi8vIERvZXMgbm90aGluZyBpZiB0aGlzIGlzbid0IGFuIF9TZXNzaW9uIG9iamVjdC5cblJlc3RXcml0ZS5wcm90b3R5cGUuaGFuZGxlU2Vzc2lvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UgfHwgdGhpcy5jbGFzc05hbWUgIT09ICdfU2Vzc2lvbicpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBpZiAoIXRoaXMuYXV0aC51c2VyICYmICF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgIXRoaXMuYXV0aC5pc01haW50ZW5hbmNlKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ1Nlc3Npb24gdG9rZW4gcmVxdWlyZWQuJyk7XG4gIH1cblxuICAvLyBUT0RPOiBWZXJpZnkgcHJvcGVyIGVycm9yIHRvIHRocm93XG4gIGlmICh0aGlzLmRhdGEuQUNMKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsICdDYW5ub3Qgc2V0ICcgKyAnQUNMIG9uIGEgU2Vzc2lvbi4nKTtcbiAgfVxuXG4gIGlmICh0aGlzLnF1ZXJ5KSB7XG4gICAgaWYgKHRoaXMuZGF0YS51c2VyICYmICF0aGlzLmF1dGguaXNNYXN0ZXIgJiYgdGhpcy5kYXRhLnVzZXIub2JqZWN0SWQgIT0gdGhpcy5hdXRoLnVzZXIuaWQpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5kYXRhLnNlc3Npb25Ub2tlbikge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUpO1xuICAgIH1cbiAgICBpZiAoIXRoaXMuYXV0aC5pc01hc3Rlcikge1xuICAgICAgdGhpcy5xdWVyeSA9IHtcbiAgICAgICAgJGFuZDogW1xuICAgICAgICAgIHRoaXMucXVlcnksXG4gICAgICAgICAge1xuICAgICAgICAgICAgdXNlcjoge1xuICAgICAgICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICAgICAgICBvYmplY3RJZDogdGhpcy5hdXRoLnVzZXIuaWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9O1xuICAgIH1cbiAgfVxuXG4gIGlmICghdGhpcy5xdWVyeSAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmICF0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgIGNvbnN0IGFkZGl0aW9uYWxTZXNzaW9uRGF0YSA9IHt9O1xuICAgIGZvciAodmFyIGtleSBpbiB0aGlzLmRhdGEpIHtcbiAgICAgIGlmIChrZXkgPT09ICdvYmplY3RJZCcgfHwga2V5ID09PSAndXNlcicpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBhZGRpdGlvbmFsU2Vzc2lvbkRhdGFba2V5XSA9IHRoaXMuZGF0YVtrZXldO1xuICAgIH1cblxuICAgIGNvbnN0IHsgc2Vzc2lvbkRhdGEsIGNyZWF0ZVNlc3Npb24gfSA9IFJlc3RXcml0ZS5jcmVhdGVTZXNzaW9uKHRoaXMuY29uZmlnLCB7XG4gICAgICB1c2VySWQ6IHRoaXMuYXV0aC51c2VyLmlkLFxuICAgICAgY3JlYXRlZFdpdGg6IHtcbiAgICAgICAgYWN0aW9uOiAnY3JlYXRlJyxcbiAgICAgIH0sXG4gICAgICBhZGRpdGlvbmFsU2Vzc2lvbkRhdGEsXG4gICAgfSk7XG5cbiAgICByZXR1cm4gY3JlYXRlU2Vzc2lvbigpLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICBpZiAoIXJlc3VsdHMucmVzcG9uc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUiwgJ0Vycm9yIGNyZWF0aW5nIHNlc3Npb24uJyk7XG4gICAgICB9XG4gICAgICBzZXNzaW9uRGF0YVsnb2JqZWN0SWQnXSA9IHJlc3VsdHMucmVzcG9uc2VbJ29iamVjdElkJ107XG4gICAgICB0aGlzLnJlc3BvbnNlID0ge1xuICAgICAgICBzdGF0dXM6IDIwMSxcbiAgICAgICAgbG9jYXRpb246IHJlc3VsdHMubG9jYXRpb24sXG4gICAgICAgIHJlc3BvbnNlOiBzZXNzaW9uRGF0YSxcbiAgICAgIH07XG4gICAgfSk7XG4gIH1cbn07XG5cbi8vIEhhbmRsZXMgdGhlIF9JbnN0YWxsYXRpb24gY2xhc3Mgc3BlY2lhbG5lc3MuXG4vLyBEb2VzIG5vdGhpbmcgaWYgdGhpcyBpc24ndCBhbiBpbnN0YWxsYXRpb24gb2JqZWN0LlxuLy8gSWYgYW4gaW5zdGFsbGF0aW9uIGlzIGZvdW5kLCB0aGlzIGNhbiBtdXRhdGUgdGhpcy5xdWVyeSBhbmQgdHVybiBhIGNyZWF0ZVxuLy8gaW50byBhbiB1cGRhdGUuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3Igd2hlbiB3ZSdyZSBkb25lIGlmIGl0IGNhbid0IGZpbmlzaCB0aGlzIHRpY2suXG5SZXN0V3JpdGUucHJvdG90eXBlLmhhbmRsZUluc3RhbGxhdGlvbiA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMucmVzcG9uc2UgfHwgdGhpcy5jbGFzc05hbWUgIT09ICdfSW5zdGFsbGF0aW9uJykge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmIChcbiAgICAhdGhpcy5xdWVyeSAmJlxuICAgICF0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiZcbiAgICAhdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgIXRoaXMuYXV0aC5pbnN0YWxsYXRpb25JZFxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAxMzUsXG4gICAgICAnYXQgbGVhc3Qgb25lIElEIGZpZWxkIChkZXZpY2VUb2tlbiwgaW5zdGFsbGF0aW9uSWQpICcgKyAnbXVzdCBiZSBzcGVjaWZpZWQgaW4gdGhpcyBvcGVyYXRpb24nXG4gICAgKTtcbiAgfVxuXG4gIC8vIElmIHRoZSBkZXZpY2UgdG9rZW4gaXMgNjQgY2hhcmFjdGVycyBsb25nLCB3ZSBhc3N1bWUgaXQgaXMgZm9yIGlPU1xuICAvLyBhbmQgbG93ZXJjYXNlIGl0LlxuICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuICYmIHRoaXMuZGF0YS5kZXZpY2VUb2tlbi5sZW5ndGggPT0gNjQpIHtcbiAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gPSB0aGlzLmRhdGEuZGV2aWNlVG9rZW4udG9Mb3dlckNhc2UoKTtcbiAgfVxuXG4gIC8vIFdlIGxvd2VyY2FzZSB0aGUgaW5zdGFsbGF0aW9uSWQgaWYgcHJlc2VudFxuICBpZiAodGhpcy5kYXRhLmluc3RhbGxhdGlvbklkKSB7XG4gICAgdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkID0gdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkLnRvTG93ZXJDYXNlKCk7XG4gIH1cblxuICBsZXQgaW5zdGFsbGF0aW9uSWQgPSB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQ7XG5cbiAgLy8gSWYgZGF0YS5pbnN0YWxsYXRpb25JZCBpcyBub3Qgc2V0IGFuZCB3ZSdyZSBub3QgbWFzdGVyLCB3ZSBjYW4gbG9va3VwIGluIGF1dGhcbiAgaWYgKCFpbnN0YWxsYXRpb25JZCAmJiAhdGhpcy5hdXRoLmlzTWFzdGVyICYmICF0aGlzLmF1dGguaXNNYWludGVuYW5jZSkge1xuICAgIGluc3RhbGxhdGlvbklkID0gdGhpcy5hdXRoLmluc3RhbGxhdGlvbklkO1xuICB9XG5cbiAgaWYgKGluc3RhbGxhdGlvbklkKSB7XG4gICAgaW5zdGFsbGF0aW9uSWQgPSBpbnN0YWxsYXRpb25JZC50b0xvd2VyQ2FzZSgpO1xuICB9XG5cbiAgLy8gVXBkYXRpbmcgX0luc3RhbGxhdGlvbiBidXQgbm90IHVwZGF0aW5nIGFueXRoaW5nIGNyaXRpY2FsXG4gIGlmICh0aGlzLnF1ZXJ5ICYmICF0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgIWluc3RhbGxhdGlvbklkICYmICF0aGlzLmRhdGEuZGV2aWNlVHlwZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHZhciBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG5cbiAgdmFyIGlkTWF0Y2g7IC8vIFdpbGwgYmUgYSBtYXRjaCBvbiBlaXRoZXIgb2JqZWN0SWQgb3IgaW5zdGFsbGF0aW9uSWRcbiAgdmFyIG9iamVjdElkTWF0Y2g7XG4gIHZhciBpbnN0YWxsYXRpb25JZE1hdGNoO1xuICB2YXIgZGV2aWNlVG9rZW5NYXRjaGVzID0gW107XG5cbiAgLy8gSW5zdGVhZCBvZiBpc3N1aW5nIDMgcmVhZHMsIGxldCdzIGRvIGl0IHdpdGggb25lIE9SLlxuICBjb25zdCBvclF1ZXJpZXMgPSBbXTtcbiAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCkge1xuICAgIG9yUXVlcmllcy5wdXNoKHtcbiAgICAgIG9iamVjdElkOiB0aGlzLnF1ZXJ5Lm9iamVjdElkLFxuICAgIH0pO1xuICB9XG4gIGlmIChpbnN0YWxsYXRpb25JZCkge1xuICAgIG9yUXVlcmllcy5wdXNoKHtcbiAgICAgIGluc3RhbGxhdGlvbklkOiBpbnN0YWxsYXRpb25JZCxcbiAgICB9KTtcbiAgfVxuICBpZiAodGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgb3JRdWVyaWVzLnB1c2goeyBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuIH0pO1xuICB9XG5cbiAgaWYgKG9yUXVlcmllcy5sZW5ndGggPT0gMCkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIHByb21pc2UgPSBwcm9taXNlXG4gICAgLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlLmZpbmQoXG4gICAgICAgICdfSW5zdGFsbGF0aW9uJyxcbiAgICAgICAge1xuICAgICAgICAgICRvcjogb3JRdWVyaWVzLFxuICAgICAgICB9LFxuICAgICAgICB7fVxuICAgICAgKTtcbiAgICB9KVxuICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgcmVzdWx0cy5mb3JFYWNoKHJlc3VsdCA9PiB7XG4gICAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQgJiYgcmVzdWx0Lm9iamVjdElkID09IHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgICBvYmplY3RJZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuaW5zdGFsbGF0aW9uSWQgPT0gaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZE1hdGNoID0gcmVzdWx0O1xuICAgICAgICB9XG4gICAgICAgIGlmIChyZXN1bHQuZGV2aWNlVG9rZW4gPT0gdGhpcy5kYXRhLmRldmljZVRva2VuKSB7XG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLnB1c2gocmVzdWx0KTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICAgIC8vIFNhbml0eSBjaGVja3Mgd2hlbiBydW5uaW5nIGEgcXVlcnlcbiAgICAgIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgaWYgKCFvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsICdPYmplY3Qgbm90IGZvdW5kIGZvciB1cGRhdGUuJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5pbnN0YWxsYXRpb25JZCAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWQgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQgIT09IG9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2luc3RhbGxhdGlvbklkIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUb2tlbiAmJlxuICAgICAgICAgIG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVG9rZW4gIT09IG9iamVjdElkTWF0Y2guZGV2aWNlVG9rZW4gJiZcbiAgICAgICAgICAhdGhpcy5kYXRhLmluc3RhbGxhdGlvbklkICYmXG4gICAgICAgICAgIW9iamVjdElkTWF0Y2guaW5zdGFsbGF0aW9uSWRcbiAgICAgICAgKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgJ2RldmljZVRva2VuIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKFxuICAgICAgICAgIHRoaXMuZGF0YS5kZXZpY2VUeXBlICYmXG4gICAgICAgICAgdGhpcy5kYXRhLmRldmljZVR5cGUgJiZcbiAgICAgICAgICB0aGlzLmRhdGEuZGV2aWNlVHlwZSAhPT0gb2JqZWN0SWRNYXRjaC5kZXZpY2VUeXBlXG4gICAgICAgICkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsICdkZXZpY2VUeXBlIG1heSBub3QgYmUgY2hhbmdlZCBpbiB0aGlzICcgKyAnb3BlcmF0aW9uJyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMucXVlcnkgJiYgdGhpcy5xdWVyeS5vYmplY3RJZCAmJiBvYmplY3RJZE1hdGNoKSB7XG4gICAgICAgIGlkTWF0Y2ggPSBvYmplY3RJZE1hdGNoO1xuICAgICAgfVxuXG4gICAgICBpZiAoaW5zdGFsbGF0aW9uSWQgJiYgaW5zdGFsbGF0aW9uSWRNYXRjaCkge1xuICAgICAgICBpZE1hdGNoID0gaW5zdGFsbGF0aW9uSWRNYXRjaDtcbiAgICAgIH1cbiAgICAgIC8vIG5lZWQgdG8gc3BlY2lmeSBkZXZpY2VUeXBlIG9ubHkgaWYgaXQncyBuZXdcbiAgICAgIGlmICghdGhpcy5xdWVyeSAmJiAhdGhpcy5kYXRhLmRldmljZVR5cGUgJiYgIWlkTWF0Y2gpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNSwgJ2RldmljZVR5cGUgbXVzdCBiZSBzcGVjaWZpZWQgaW4gdGhpcyBvcGVyYXRpb24nKTtcbiAgICAgIH1cbiAgICB9KVxuICAgIC50aGVuKCgpID0+IHtcbiAgICAgIGlmICghaWRNYXRjaCkge1xuICAgICAgICBpZiAoIWRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGgpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgZGV2aWNlVG9rZW5NYXRjaGVzLmxlbmd0aCA9PSAxICYmXG4gICAgICAgICAgKCFkZXZpY2VUb2tlbk1hdGNoZXNbMF1bJ2luc3RhbGxhdGlvbklkJ10gfHwgIWluc3RhbGxhdGlvbklkKVxuICAgICAgICApIHtcbiAgICAgICAgICAvLyBTaW5nbGUgbWF0Y2ggb24gZGV2aWNlIHRva2VuIGJ1dCBub25lIG9uIGluc3RhbGxhdGlvbklkLCBhbmQgZWl0aGVyXG4gICAgICAgICAgLy8gdGhlIHBhc3NlZCBvYmplY3Qgb3IgdGhlIG1hdGNoIGlzIG1pc3NpbmcgYW4gaW5zdGFsbGF0aW9uSWQsIHNvIHdlXG4gICAgICAgICAgLy8gY2FuIGp1c3QgcmV0dXJuIHRoZSBtYXRjaC5cbiAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICB9IGVsc2UgaWYgKCF0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAxMzIsXG4gICAgICAgICAgICAnTXVzdCBzcGVjaWZ5IGluc3RhbGxhdGlvbklkIHdoZW4gZGV2aWNlVG9rZW4gJyArXG4gICAgICAgICAgICAgICdtYXRjaGVzIG11bHRpcGxlIEluc3RhbGxhdGlvbiBvYmplY3RzJ1xuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gTXVsdGlwbGUgZGV2aWNlIHRva2VuIG1hdGNoZXMgYW5kIHdlIHNwZWNpZmllZCBhbiBpbnN0YWxsYXRpb24gSUQsXG4gICAgICAgICAgLy8gb3IgYSBzaW5nbGUgbWF0Y2ggd2hlcmUgYm90aCB0aGUgcGFzc2VkIGFuZCBtYXRjaGluZyBvYmplY3RzIGhhdmVcbiAgICAgICAgICAvLyBhbiBpbnN0YWxsYXRpb24gSUQuIFRyeSBjbGVhbmluZyBvdXQgb2xkIGluc3RhbGxhdGlvbnMgdGhhdCBtYXRjaFxuICAgICAgICAgIC8vIHRoZSBkZXZpY2VUb2tlbiwgYW5kIHJldHVybiBuaWwgdG8gc2lnbmFsIHRoYXQgYSBuZXcgb2JqZWN0IHNob3VsZFxuICAgICAgICAgIC8vIGJlIGNyZWF0ZWQuXG4gICAgICAgICAgdmFyIGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgZGV2aWNlVG9rZW46IHRoaXMuZGF0YS5kZXZpY2VUb2tlbixcbiAgICAgICAgICAgIGluc3RhbGxhdGlvbklkOiB7XG4gICAgICAgICAgICAgICRuZTogaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH07XG4gICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICBkZWxRdWVyeVsnYXBwSWRlbnRpZmllciddID0gdGhpcy5kYXRhLmFwcElkZW50aWZpZXI7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIuY29kZSA9PSBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5EKSB7XG4gICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkLlxuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyByZXRocm93IHRoZSBlcnJvclxuICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGRldmljZVRva2VuTWF0Y2hlcy5sZW5ndGggPT0gMSAmJiAhZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydpbnN0YWxsYXRpb25JZCddKSB7XG4gICAgICAgICAgLy8gRXhhY3RseSBvbmUgZGV2aWNlIHRva2VuIG1hdGNoIGFuZCBpdCBkb2Vzbid0IGhhdmUgYW4gaW5zdGFsbGF0aW9uXG4gICAgICAgICAgLy8gSUQuIFRoaXMgaXMgdGhlIG9uZSBjYXNlIHdoZXJlIHdlIHdhbnQgdG8gbWVyZ2Ugd2l0aCB0aGUgZXhpc3RpbmdcbiAgICAgICAgICAvLyBvYmplY3QuXG4gICAgICAgICAgY29uc3QgZGVsUXVlcnkgPSB7IG9iamVjdElkOiBpZE1hdGNoLm9iamVjdElkIH07XG4gICAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgICAgICAuZGVzdHJveSgnX0luc3RhbGxhdGlvbicsIGRlbFF1ZXJ5KVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICByZXR1cm4gZGV2aWNlVG9rZW5NYXRjaGVzWzBdWydvYmplY3RJZCddO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5jYXRjaChlcnIgPT4ge1xuICAgICAgICAgICAgICBpZiAoZXJyLmNvZGUgPT0gUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCkge1xuICAgICAgICAgICAgICAgIC8vIG5vIGRlbGV0aW9ucyB3ZXJlIG1hZGUuIENhbiBiZSBpZ25vcmVkXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIC8vIHJldGhyb3cgdGhlIGVycm9yXG4gICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGlmICh0aGlzLmRhdGEuZGV2aWNlVG9rZW4gJiYgaWRNYXRjaC5kZXZpY2VUb2tlbiAhPSB0aGlzLmRhdGEuZGV2aWNlVG9rZW4pIHtcbiAgICAgICAgICAgIC8vIFdlJ3JlIHNldHRpbmcgdGhlIGRldmljZSB0b2tlbiBvbiBhbiBleGlzdGluZyBpbnN0YWxsYXRpb24sIHNvXG4gICAgICAgICAgICAvLyB3ZSBzaG91bGQgdHJ5IGNsZWFuaW5nIG91dCBvbGQgaW5zdGFsbGF0aW9ucyB0aGF0IG1hdGNoIHRoaXNcbiAgICAgICAgICAgIC8vIGRldmljZSB0b2tlbi5cbiAgICAgICAgICAgIGNvbnN0IGRlbFF1ZXJ5ID0ge1xuICAgICAgICAgICAgICBkZXZpY2VUb2tlbjogdGhpcy5kYXRhLmRldmljZVRva2VuLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIC8vIFdlIGhhdmUgYSB1bmlxdWUgaW5zdGFsbCBJZCwgdXNlIHRoYXQgdG8gcHJlc2VydmVcbiAgICAgICAgICAgIC8vIHRoZSBpbnRlcmVzdGluZyBpbnN0YWxsYXRpb25cbiAgICAgICAgICAgIGlmICh0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQpIHtcbiAgICAgICAgICAgICAgZGVsUXVlcnlbJ2luc3RhbGxhdGlvbklkJ10gPSB7XG4gICAgICAgICAgICAgICAgJG5lOiB0aGlzLmRhdGEuaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgICBpZE1hdGNoLm9iamVjdElkICYmXG4gICAgICAgICAgICAgIHRoaXMuZGF0YS5vYmplY3RJZCAmJlxuICAgICAgICAgICAgICBpZE1hdGNoLm9iamVjdElkID09IHRoaXMuZGF0YS5vYmplY3RJZFxuICAgICAgICAgICAgKSB7XG4gICAgICAgICAgICAgIC8vIHdlIHBhc3NlZCBhbiBvYmplY3RJZCwgcHJlc2VydmUgdGhhdCBpbnN0YWxhdGlvblxuICAgICAgICAgICAgICBkZWxRdWVyeVsnb2JqZWN0SWQnXSA9IHtcbiAgICAgICAgICAgICAgICAkbmU6IGlkTWF0Y2gub2JqZWN0SWQsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAvLyBXaGF0IHRvIGRvIGhlcmU/IGNhbid0IHJlYWxseSBjbGVhbiB1cCBldmVyeXRoaW5nLi4uXG4gICAgICAgICAgICAgIHJldHVybiBpZE1hdGNoLm9iamVjdElkO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMuZGF0YS5hcHBJZGVudGlmaWVyKSB7XG4gICAgICAgICAgICAgIGRlbFF1ZXJ5WydhcHBJZGVudGlmaWVyJ10gPSB0aGlzLmRhdGEuYXBwSWRlbnRpZmllcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmRlc3Ryb3koJ19JbnN0YWxsYXRpb24nLCBkZWxRdWVyeSkuY2F0Y2goZXJyID0+IHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgICAgICAgICAvLyBubyBkZWxldGlvbnMgd2VyZSBtYWRlLiBDYW4gYmUgaWdub3JlZC5cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgLy8gcmV0aHJvdyB0aGUgZXJyb3JcbiAgICAgICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEluIG5vbi1tZXJnZSBzY2VuYXJpb3MsIGp1c3QgcmV0dXJuIHRoZSBpbnN0YWxsYXRpb24gbWF0Y2ggaWRcbiAgICAgICAgICByZXR1cm4gaWRNYXRjaC5vYmplY3RJZDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0pXG4gICAgLnRoZW4ob2JqSWQgPT4ge1xuICAgICAgaWYgKG9iaklkKSB7XG4gICAgICAgIHRoaXMucXVlcnkgPSB7IG9iamVjdElkOiBvYmpJZCB9O1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICBkZWxldGUgdGhpcy5kYXRhLmNyZWF0ZWRBdDtcbiAgICAgIH1cbiAgICAgIC8vIFRPRE86IFZhbGlkYXRlIG9wcyAoYWRkL3JlbW92ZSBvbiBjaGFubmVscywgJGluYyBvbiBiYWRnZSwgZXRjLilcbiAgICB9KTtcbiAgcmV0dXJuIHByb21pc2U7XG59O1xuXG4vLyBJZiB3ZSBzaG9ydC1jaXJjdWl0ZWQgdGhlIG9iamVjdCByZXNwb25zZSAtIHRoZW4gd2UgbmVlZCB0byBtYWtlIHN1cmUgd2UgZXhwYW5kIGFsbCB0aGUgZmlsZXMsXG4vLyBzaW5jZSB0aGlzIG1pZ2h0IG5vdCBoYXZlIGEgcXVlcnksIG1lYW5pbmcgaXQgd29uJ3QgcmV0dXJuIHRoZSBmdWxsIHJlc3VsdCBiYWNrLlxuLy8gVE9ETzogKG5sdXRzZW5rbykgVGhpcyBzaG91bGQgZGllIHdoZW4gd2UgbW92ZSB0byBwZXItY2xhc3MgYmFzZWQgY29udHJvbGxlcnMgb24gX1Nlc3Npb24vX1VzZXJcblJlc3RXcml0ZS5wcm90b3R5cGUuZXhwYW5kRmlsZXNGb3JFeGlzdGluZ09iamVjdHMgPSBmdW5jdGlvbiAoKSB7XG4gIC8vIENoZWNrIHdoZXRoZXIgd2UgaGF2ZSBhIHNob3J0LWNpcmN1aXRlZCByZXNwb25zZSAtIG9ubHkgdGhlbiBydW4gZXhwYW5zaW9uLlxuICBpZiAodGhpcy5yZXNwb25zZSAmJiB0aGlzLnJlc3BvbnNlLnJlc3BvbnNlKSB7XG4gICAgdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyLmV4cGFuZEZpbGVzSW5PYmplY3QodGhpcy5jb25maWcsIHRoaXMucmVzcG9uc2UucmVzcG9uc2UpO1xuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkRhdGFiYXNlT3BlcmF0aW9uID0gZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5yZXNwb25zZSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGlmICh0aGlzLmNsYXNzTmFtZSA9PT0gJ19Sb2xlJykge1xuICAgIHRoaXMuY29uZmlnLmNhY2hlQ29udHJvbGxlci5yb2xlLmNsZWFyKCk7XG4gICAgaWYgKHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIpIHtcbiAgICAgIHRoaXMuY29uZmlnLmxpdmVRdWVyeUNvbnRyb2xsZXIuY2xlYXJDYWNoZWRSb2xlcyh0aGlzLmF1dGgudXNlcik7XG4gICAgfVxuICB9XG5cbiAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInICYmIHRoaXMucXVlcnkgJiYgdGhpcy5hdXRoLmlzVW5hdXRoZW50aWNhdGVkKCkpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5TRVNTSU9OX01JU1NJTkcsXG4gICAgICBgQ2Fubm90IG1vZGlmeSB1c2VyICR7dGhpcy5xdWVyeS5vYmplY3RJZH0uYFxuICAgICk7XG4gIH1cblxuICBpZiAodGhpcy5jbGFzc05hbWUgPT09ICdfUHJvZHVjdCcgJiYgdGhpcy5kYXRhLmRvd25sb2FkKSB7XG4gICAgdGhpcy5kYXRhLmRvd25sb2FkTmFtZSA9IHRoaXMuZGF0YS5kb3dubG9hZC5uYW1lO1xuICB9XG5cbiAgLy8gVE9ETzogQWRkIGJldHRlciBkZXRlY3Rpb24gZm9yIEFDTCwgZW5zdXJpbmcgYSB1c2VyIGNhbid0IGJlIGxvY2tlZCBmcm9tXG4gIC8vICAgICAgIHRoZWlyIG93biB1c2VyIHJlY29yZC5cbiAgaWYgKHRoaXMuZGF0YS5BQ0wgJiYgdGhpcy5kYXRhLkFDTFsnKnVucmVzb2x2ZWQnXSkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0FDTCwgJ0ludmFsaWQgQUNMLicpO1xuICB9XG5cbiAgaWYgKHRoaXMucXVlcnkpIHtcbiAgICAvLyBGb3JjZSB0aGUgdXNlciB0byBub3QgbG9ja291dFxuICAgIC8vIE1hdGNoZWQgd2l0aCBwYXJzZS5jb21cbiAgICBpZiAoXG4gICAgICB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJlxuICAgICAgdGhpcy5kYXRhLkFDTCAmJlxuICAgICAgdGhpcy5hdXRoLmlzTWFzdGVyICE9PSB0cnVlICYmXG4gICAgICB0aGlzLmF1dGguaXNNYWludGVuYW5jZSAhPT0gdHJ1ZVxuICAgICkge1xuICAgICAgdGhpcy5kYXRhLkFDTFt0aGlzLnF1ZXJ5Lm9iamVjdElkXSA9IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfTtcbiAgICB9XG4gICAgLy8gdXBkYXRlIHBhc3N3b3JkIHRpbWVzdGFtcCBpZiB1c2VyIHBhc3N3b3JkIGlzIGJlaW5nIGNoYW5nZWRcbiAgICBpZiAoXG4gICAgICB0aGlzLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJyAmJlxuICAgICAgdGhpcy5kYXRhLl9oYXNoZWRfcGFzc3dvcmQgJiZcbiAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZVxuICAgICkge1xuICAgICAgdGhpcy5kYXRhLl9wYXNzd29yZF9jaGFuZ2VkX2F0ID0gUGFyc2UuX2VuY29kZShuZXcgRGF0ZSgpKTtcbiAgICB9XG4gICAgLy8gSWdub3JlIGNyZWF0ZWRBdCB3aGVuIHVwZGF0ZVxuICAgIGRlbGV0ZSB0aGlzLmRhdGEuY3JlYXRlZEF0O1xuXG4gICAgbGV0IGRlZmVyID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgLy8gaWYgcGFzc3dvcmQgaGlzdG9yeSBpcyBlbmFibGVkIHRoZW4gc2F2ZSB0aGUgY3VycmVudCBwYXNzd29yZCB0byBoaXN0b3J5XG4gICAgaWYgKFxuICAgICAgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgJiZcbiAgICAgIHRoaXMuZGF0YS5faGFzaGVkX3Bhc3N3b3JkICYmXG4gICAgICB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeSAmJlxuICAgICAgdGhpcy5jb25maWcucGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5XG4gICAgKSB7XG4gICAgICBkZWZlciA9IHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC5maW5kKFxuICAgICAgICAgICdfVXNlcicsXG4gICAgICAgICAgeyBvYmplY3RJZDogdGhpcy5vYmplY3RJZCgpIH0sXG4gICAgICAgICAgeyBrZXlzOiBbJ19wYXNzd29yZF9oaXN0b3J5JywgJ19oYXNoZWRfcGFzc3dvcmQnXSB9LFxuICAgICAgICAgIEF1dGgubWFpbnRlbmFuY2UodGhpcy5jb25maWcpXG4gICAgICAgIClcbiAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoICE9IDEpIHtcbiAgICAgICAgICAgIHRocm93IHVuZGVmaW5lZDtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgdXNlciA9IHJlc3VsdHNbMF07XG4gICAgICAgICAgbGV0IG9sZFBhc3N3b3JkcyA9IFtdO1xuICAgICAgICAgIGlmICh1c2VyLl9wYXNzd29yZF9oaXN0b3J5KSB7XG4gICAgICAgICAgICBvbGRQYXNzd29yZHMgPSBfLnRha2UoXG4gICAgICAgICAgICAgIHVzZXIuX3Bhc3N3b3JkX2hpc3RvcnksXG4gICAgICAgICAgICAgIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeVxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy9uLTEgcGFzc3dvcmRzIGdvIGludG8gaGlzdG9yeSBpbmNsdWRpbmcgbGFzdCBwYXNzd29yZFxuICAgICAgICAgIHdoaWxlIChcbiAgICAgICAgICAgIG9sZFBhc3N3b3Jkcy5sZW5ndGggPiBNYXRoLm1heCgwLCB0aGlzLmNvbmZpZy5wYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEhpc3RvcnkgLSAyKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgb2xkUGFzc3dvcmRzLnNoaWZ0KCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIG9sZFBhc3N3b3Jkcy5wdXNoKHVzZXIucGFzc3dvcmQpO1xuICAgICAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfaGlzdG9yeSA9IG9sZFBhc3N3b3JkcztcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlZmVyLnRoZW4oKCkgPT4ge1xuICAgICAgLy8gUnVuIGFuIHVwZGF0ZVxuICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgIC51cGRhdGUoXG4gICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgdGhpcy5xdWVyeSxcbiAgICAgICAgICB0aGlzLmRhdGEsXG4gICAgICAgICAgdGhpcy5ydW5PcHRpb25zLFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyXG4gICAgICAgIClcbiAgICAgICAgLnRoZW4ocmVzcG9uc2UgPT4ge1xuICAgICAgICAgIHJlc3BvbnNlLnVwZGF0ZWRBdCA9IHRoaXMudXBkYXRlZEF0O1xuICAgICAgICAgIHRoaXMuX3VwZGF0ZVJlc3BvbnNlV2l0aERhdGEocmVzcG9uc2UsIHRoaXMuZGF0YSk7XG4gICAgICAgICAgdGhpcy5yZXNwb25zZSA9IHsgcmVzcG9uc2UgfTtcbiAgICAgICAgfSk7XG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgLy8gU2V0IHRoZSBkZWZhdWx0IEFDTCBhbmQgcGFzc3dvcmQgdGltZXN0YW1wIGZvciB0aGUgbmV3IF9Vc2VyXG4gICAgaWYgKHRoaXMuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgICB2YXIgQUNMID0gdGhpcy5kYXRhLkFDTDtcbiAgICAgIC8vIGRlZmF1bHQgcHVibGljIHIvdyBBQ0xcbiAgICAgIGlmICghQUNMKSB7XG4gICAgICAgIEFDTCA9IHt9O1xuICAgICAgICBpZiAoIXRoaXMuY29uZmlnLmVuZm9yY2VQcml2YXRlVXNlcnMpIHtcbiAgICAgICAgICBBQ0xbJyonXSA9IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IGZhbHNlIH07XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIG1ha2Ugc3VyZSB0aGUgdXNlciBpcyBub3QgbG9ja2VkIGRvd25cbiAgICAgIEFDTFt0aGlzLmRhdGEub2JqZWN0SWRdID0geyByZWFkOiB0cnVlLCB3cml0ZTogdHJ1ZSB9O1xuICAgICAgdGhpcy5kYXRhLkFDTCA9IEFDTDtcbiAgICAgIC8vIHBhc3N3b3JkIHRpbWVzdGFtcCB0byBiZSB1c2VkIHdoZW4gcGFzc3dvcmQgZXhwaXJ5IHBvbGljeSBpcyBlbmZvcmNlZFxuICAgICAgaWYgKHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5ICYmIHRoaXMuY29uZmlnLnBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlKSB7XG4gICAgICAgIHRoaXMuZGF0YS5fcGFzc3dvcmRfY2hhbmdlZF9hdCA9IFBhcnNlLl9lbmNvZGUobmV3IERhdGUoKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gUnVuIGEgY3JlYXRlXG4gICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAuY3JlYXRlKHRoaXMuY2xhc3NOYW1lLCB0aGlzLmRhdGEsIHRoaXMucnVuT3B0aW9ucywgZmFsc2UsIHRoaXMudmFsaWRTY2hlbWFDb250cm9sbGVyKVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKHRoaXMuY2xhc3NOYW1lICE9PSAnX1VzZXInIHx8IGVycm9yLmNvZGUgIT09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUXVpY2sgY2hlY2ssIGlmIHdlIHdlcmUgYWJsZSB0byBpbmZlciB0aGUgZHVwbGljYXRlZCBmaWVsZCBuYW1lXG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci51c2VySW5mbyAmJiBlcnJvci51c2VySW5mby5kdXBsaWNhdGVkX2ZpZWxkID09PSAndXNlcm5hbWUnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuVVNFUk5BTUVfVEFLRU4sXG4gICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyB1c2VybmFtZS4nXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChlcnJvciAmJiBlcnJvci51c2VySW5mbyAmJiBlcnJvci51c2VySW5mby5kdXBsaWNhdGVkX2ZpZWxkID09PSAnZW1haWwnKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuRU1BSUxfVEFLRU4sXG4gICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyBlbWFpbCBhZGRyZXNzLidcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgdGhpcyB3YXMgYSBmYWlsZWQgdXNlciBjcmVhdGlvbiBkdWUgdG8gdXNlcm5hbWUgb3IgZW1haWwgYWxyZWFkeSB0YWtlbiwgd2UgbmVlZCB0b1xuICAgICAgICAvLyBjaGVjayB3aGV0aGVyIGl0IHdhcyB1c2VybmFtZSBvciBlbWFpbCBhbmQgcmV0dXJuIHRoZSBhcHByb3ByaWF0ZSBlcnJvci5cbiAgICAgICAgLy8gRmFsbGJhY2sgdG8gdGhlIG9yaWdpbmFsIG1ldGhvZFxuICAgICAgICAvLyBUT0RPOiBTZWUgaWYgd2UgY2FuIGxhdGVyIGRvIHRoaXMgd2l0aG91dCBhZGRpdGlvbmFsIHF1ZXJpZXMgYnkgdXNpbmcgbmFtZWQgaW5kZXhlcy5cbiAgICAgICAgcmV0dXJuIHRoaXMuY29uZmlnLmRhdGFiYXNlXG4gICAgICAgICAgLmZpbmQoXG4gICAgICAgICAgICB0aGlzLmNsYXNzTmFtZSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgdXNlcm5hbWU6IHRoaXMuZGF0YS51c2VybmFtZSxcbiAgICAgICAgICAgICAgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7IGxpbWl0OiAxIH1cbiAgICAgICAgICApXG4gICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICBpZiAocmVzdWx0cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgICBQYXJzZS5FcnJvci5VU0VSTkFNRV9UQUtFTixcbiAgICAgICAgICAgICAgICAnQWNjb3VudCBhbHJlYWR5IGV4aXN0cyBmb3IgdGhpcyB1c2VybmFtZS4nXG4gICAgICAgICAgICAgICk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5jb25maWcuZGF0YWJhc2UuZmluZChcbiAgICAgICAgICAgICAgdGhpcy5jbGFzc05hbWUsXG4gICAgICAgICAgICAgIHsgZW1haWw6IHRoaXMuZGF0YS5lbWFpbCwgb2JqZWN0SWQ6IHsgJG5lOiB0aGlzLm9iamVjdElkKCkgfSB9LFxuICAgICAgICAgICAgICB7IGxpbWl0OiAxIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfSlcbiAgICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICAgIGlmIChyZXN1bHRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICAgIFBhcnNlLkVycm9yLkVNQUlMX1RBS0VOLFxuICAgICAgICAgICAgICAgICdBY2NvdW50IGFscmVhZHkgZXhpc3RzIGZvciB0aGlzIGVtYWlsIGFkZHJlc3MuJ1xuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUsXG4gICAgICAgICAgICAgICdBIGR1cGxpY2F0ZSB2YWx1ZSBmb3IgYSBmaWVsZCB3aXRoIHVuaXF1ZSB2YWx1ZXMgd2FzIHByb3ZpZGVkJ1xuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbihyZXNwb25zZSA9PiB7XG4gICAgICAgIHJlc3BvbnNlLm9iamVjdElkID0gdGhpcy5kYXRhLm9iamVjdElkO1xuICAgICAgICByZXNwb25zZS5jcmVhdGVkQXQgPSB0aGlzLmRhdGEuY3JlYXRlZEF0O1xuXG4gICAgICAgIGlmICh0aGlzLnJlc3BvbnNlU2hvdWxkSGF2ZVVzZXJuYW1lKSB7XG4gICAgICAgICAgcmVzcG9uc2UudXNlcm5hbWUgPSB0aGlzLmRhdGEudXNlcm5hbWU7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5fdXBkYXRlUmVzcG9uc2VXaXRoRGF0YShyZXNwb25zZSwgdGhpcy5kYXRhKTtcbiAgICAgICAgdGhpcy5yZXNwb25zZSA9IHtcbiAgICAgICAgICBzdGF0dXM6IDIwMSxcbiAgICAgICAgICByZXNwb25zZSxcbiAgICAgICAgICBsb2NhdGlvbjogdGhpcy5sb2NhdGlvbigpLFxuICAgICAgICB9O1xuICAgICAgfSk7XG4gIH1cbn07XG5cbi8vIFJldHVybnMgbm90aGluZyAtIGRvZXNuJ3Qgd2FpdCBmb3IgdGhlIHRyaWdnZXIuXG5SZXN0V3JpdGUucHJvdG90eXBlLnJ1bkFmdGVyU2F2ZVRyaWdnZXIgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICghdGhpcy5yZXNwb25zZSB8fCAhdGhpcy5yZXNwb25zZS5yZXNwb25zZSB8fCB0aGlzLnJ1bk9wdGlvbnMubWFueSkge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIC8vIEF2b2lkIGRvaW5nIGFueSBzZXR1cCBmb3IgdHJpZ2dlcnMgaWYgdGhlcmUgaXMgbm8gJ2FmdGVyU2F2ZScgdHJpZ2dlciBmb3IgdGhpcyBjbGFzcy5cbiAgY29uc3QgaGFzQWZ0ZXJTYXZlSG9vayA9IHRyaWdnZXJzLnRyaWdnZXJFeGlzdHMoXG4gICAgdGhpcy5jbGFzc05hbWUsXG4gICAgdHJpZ2dlcnMuVHlwZXMuYWZ0ZXJTYXZlLFxuICAgIHRoaXMuY29uZmlnLmFwcGxpY2F0aW9uSWRcbiAgKTtcbiAgY29uc3QgaGFzTGl2ZVF1ZXJ5ID0gdGhpcy5jb25maWcubGl2ZVF1ZXJ5Q29udHJvbGxlci5oYXNMaXZlUXVlcnkodGhpcy5jbGFzc05hbWUpO1xuICBpZiAoIWhhc0FmdGVyU2F2ZUhvb2sgJiYgIWhhc0xpdmVRdWVyeSkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuXG4gIGNvbnN0IHsgb3JpZ2luYWxPYmplY3QsIHVwZGF0ZWRPYmplY3QgfSA9IHRoaXMuYnVpbGRQYXJzZU9iamVjdHMoKTtcbiAgdXBkYXRlZE9iamVjdC5faGFuZGxlU2F2ZVJlc3BvbnNlKHRoaXMucmVzcG9uc2UucmVzcG9uc2UsIHRoaXMucmVzcG9uc2Uuc3RhdHVzIHx8IDIwMCk7XG5cbiAgaWYgKGhhc0xpdmVRdWVyeSkge1xuICAgIHRoaXMuY29uZmlnLmRhdGFiYXNlLmxvYWRTY2hlbWEoKS50aGVuKHNjaGVtYUNvbnRyb2xsZXIgPT4ge1xuICAgICAgLy8gTm90aWZ5IExpdmVRdWVyeVNlcnZlciBpZiBwb3NzaWJsZVxuICAgICAgY29uc3QgcGVybXMgPSBzY2hlbWFDb250cm9sbGVyLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyh1cGRhdGVkT2JqZWN0LmNsYXNzTmFtZSk7XG4gICAgICB0aGlzLmNvbmZpZy5saXZlUXVlcnlDb250cm9sbGVyLm9uQWZ0ZXJTYXZlKFxuICAgICAgICB1cGRhdGVkT2JqZWN0LmNsYXNzTmFtZSxcbiAgICAgICAgdXBkYXRlZE9iamVjdCxcbiAgICAgICAgb3JpZ2luYWxPYmplY3QsXG4gICAgICAgIHBlcm1zXG4gICAgICApO1xuICAgIH0pO1xuICB9XG4gIGlmICghaGFzQWZ0ZXJTYXZlSG9vaykge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgfVxuICAvLyBSdW4gYWZ0ZXJTYXZlIHRyaWdnZXJcbiAgcmV0dXJuIHRyaWdnZXJzXG4gICAgLm1heWJlUnVuVHJpZ2dlcihcbiAgICAgIHRyaWdnZXJzLlR5cGVzLmFmdGVyU2F2ZSxcbiAgICAgIHRoaXMuYXV0aCxcbiAgICAgIHVwZGF0ZWRPYmplY3QsXG4gICAgICBvcmlnaW5hbE9iamVjdCxcbiAgICAgIHRoaXMuY29uZmlnLFxuICAgICAgdGhpcy5jb250ZXh0XG4gICAgKVxuICAgIC50aGVuKHJlc3VsdCA9PiB7XG4gICAgICBjb25zdCBqc29uUmV0dXJuZWQgPSByZXN1bHQgJiYgIXJlc3VsdC5fdG9GdWxsSlNPTjtcbiAgICAgIGlmIChqc29uUmV0dXJuZWQpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nT3BzLm9wZXJhdGlvbnMgPSB7fTtcbiAgICAgICAgdGhpcy5yZXNwb25zZS5yZXNwb25zZSA9IHJlc3VsdDtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgPSB0aGlzLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhKFxuICAgICAgICAgIChyZXN1bHQgfHwgdXBkYXRlZE9iamVjdCkudG9KU09OKCksXG4gICAgICAgICAgdGhpcy5kYXRhXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSlcbiAgICAuY2F0Y2goZnVuY3Rpb24gKGVycikge1xuICAgICAgbG9nZ2VyLndhcm4oJ2FmdGVyU2F2ZSBjYXVnaHQgYW4gZXJyb3InLCBlcnIpO1xuICAgIH0pO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZmlndXJlIG91dCB3aGF0IGxvY2F0aW9uIHRoaXMgb3BlcmF0aW9uIGhhcHBlbnMgYXQuXG5SZXN0V3JpdGUucHJvdG90eXBlLmxvY2F0aW9uID0gZnVuY3Rpb24gKCkge1xuICB2YXIgbWlkZGxlID0gdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicgPyAnL3VzZXJzLycgOiAnL2NsYXNzZXMvJyArIHRoaXMuY2xhc3NOYW1lICsgJy8nO1xuICBjb25zdCBtb3VudCA9IHRoaXMuY29uZmlnLm1vdW50IHx8IHRoaXMuY29uZmlnLnNlcnZlclVSTDtcbiAgcmV0dXJuIG1vdW50ICsgbWlkZGxlICsgdGhpcy5kYXRhLm9iamVjdElkO1xufTtcblxuLy8gQSBoZWxwZXIgdG8gZ2V0IHRoZSBvYmplY3QgaWQgZm9yIHRoaXMgb3BlcmF0aW9uLlxuLy8gQmVjYXVzZSBpdCBjb3VsZCBiZSBlaXRoZXIgb24gdGhlIHF1ZXJ5IG9yIG9uIHRoZSBkYXRhXG5SZXN0V3JpdGUucHJvdG90eXBlLm9iamVjdElkID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4gdGhpcy5kYXRhLm9iamVjdElkIHx8IHRoaXMucXVlcnkub2JqZWN0SWQ7XG59O1xuXG4vLyBSZXR1cm5zIGEgY29weSBvZiB0aGUgZGF0YSBhbmQgZGVsZXRlIGJhZCBrZXlzIChfYXV0aF9kYXRhLCBfaGFzaGVkX3Bhc3N3b3JkLi4uKVxuUmVzdFdyaXRlLnByb3RvdHlwZS5zYW5pdGl6ZWREYXRhID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCBkYXRhID0gT2JqZWN0LmtleXModGhpcy5kYXRhKS5yZWR1Y2UoKGRhdGEsIGtleSkgPT4ge1xuICAgIC8vIFJlZ2V4cCBjb21lcyBmcm9tIFBhcnNlLk9iamVjdC5wcm90b3R5cGUudmFsaWRhdGVcbiAgICBpZiAoIS9eW0EtWmEtel1bMC05QS1aYS16X10qJC8udGVzdChrZXkpKSB7XG4gICAgICBkZWxldGUgZGF0YVtrZXldO1xuICAgIH1cbiAgICByZXR1cm4gZGF0YTtcbiAgfSwgZGVlcGNvcHkodGhpcy5kYXRhKSk7XG4gIHJldHVybiBQYXJzZS5fZGVjb2RlKHVuZGVmaW5lZCwgZGF0YSk7XG59O1xuXG4vLyBSZXR1cm5zIGFuIHVwZGF0ZWQgY29weSBvZiB0aGUgb2JqZWN0XG5SZXN0V3JpdGUucHJvdG90eXBlLmJ1aWxkUGFyc2VPYmplY3RzID0gZnVuY3Rpb24gKCkge1xuICBjb25zdCBleHRyYURhdGEgPSB7IGNsYXNzTmFtZTogdGhpcy5jbGFzc05hbWUsIG9iamVjdElkOiB0aGlzLnF1ZXJ5Py5vYmplY3RJZCB9O1xuICBsZXQgb3JpZ2luYWxPYmplY3Q7XG4gIGlmICh0aGlzLnF1ZXJ5ICYmIHRoaXMucXVlcnkub2JqZWN0SWQpIHtcbiAgICBvcmlnaW5hbE9iamVjdCA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB0aGlzLm9yaWdpbmFsRGF0YSk7XG4gIH1cblxuICBjb25zdCBjbGFzc05hbWUgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04oZXh0cmFEYXRhKTtcbiAgY29uc3QgcmVhZE9ubHlBdHRyaWJ1dGVzID0gY2xhc3NOYW1lLmNvbnN0cnVjdG9yLnJlYWRPbmx5QXR0cmlidXRlc1xuICAgID8gY2xhc3NOYW1lLmNvbnN0cnVjdG9yLnJlYWRPbmx5QXR0cmlidXRlcygpXG4gICAgOiBbXTtcbiAgaWYgKCF0aGlzLm9yaWdpbmFsRGF0YSkge1xuICAgIGZvciAoY29uc3QgYXR0cmlidXRlIG9mIHJlYWRPbmx5QXR0cmlidXRlcykge1xuICAgICAgZXh0cmFEYXRhW2F0dHJpYnV0ZV0gPSB0aGlzLmRhdGFbYXR0cmlidXRlXTtcbiAgICB9XG4gIH1cbiAgY29uc3QgdXBkYXRlZE9iamVjdCA9IHRyaWdnZXJzLmluZmxhdGUoZXh0cmFEYXRhLCB0aGlzLm9yaWdpbmFsRGF0YSk7XG4gIE9iamVjdC5rZXlzKHRoaXMuZGF0YSkucmVkdWNlKGZ1bmN0aW9uIChkYXRhLCBrZXkpIHtcbiAgICBpZiAoa2V5LmluZGV4T2YoJy4nKSA+IDApIHtcbiAgICAgIGlmICh0eXBlb2YgZGF0YVtrZXldLl9fb3AgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGlmICghcmVhZE9ubHlBdHRyaWJ1dGVzLmluY2x1ZGVzKGtleSkpIHtcbiAgICAgICAgICB1cGRhdGVkT2JqZWN0LnNldChrZXksIGRhdGFba2V5XSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIHN1YmRvY3VtZW50IGtleSB3aXRoIGRvdCBub3RhdGlvbiB7ICd4LnknOiB2IH0gPT4geyAneCc6IHsgJ3knIDogdiB9IH0pXG4gICAgICAgIGNvbnN0IHNwbGl0dGVkS2V5ID0ga2V5LnNwbGl0KCcuJyk7XG4gICAgICAgIGNvbnN0IHBhcmVudFByb3AgPSBzcGxpdHRlZEtleVswXTtcbiAgICAgICAgbGV0IHBhcmVudFZhbCA9IHVwZGF0ZWRPYmplY3QuZ2V0KHBhcmVudFByb3ApO1xuICAgICAgICBpZiAodHlwZW9mIHBhcmVudFZhbCAhPT0gJ29iamVjdCcpIHtcbiAgICAgICAgICBwYXJlbnRWYWwgPSB7fTtcbiAgICAgICAgfVxuICAgICAgICBwYXJlbnRWYWxbc3BsaXR0ZWRLZXlbMV1dID0gZGF0YVtrZXldO1xuICAgICAgICB1cGRhdGVkT2JqZWN0LnNldChwYXJlbnRQcm9wLCBwYXJlbnRWYWwpO1xuICAgICAgfVxuICAgICAgZGVsZXRlIGRhdGFba2V5XTtcbiAgICB9XG4gICAgcmV0dXJuIGRhdGE7XG4gIH0sIGRlZXBjb3B5KHRoaXMuZGF0YSkpO1xuXG4gIGNvbnN0IHNhbml0aXplZCA9IHRoaXMuc2FuaXRpemVkRGF0YSgpO1xuICBmb3IgKGNvbnN0IGF0dHJpYnV0ZSBvZiByZWFkT25seUF0dHJpYnV0ZXMpIHtcbiAgICBkZWxldGUgc2FuaXRpemVkW2F0dHJpYnV0ZV07XG4gIH1cbiAgdXBkYXRlZE9iamVjdC5zZXQoc2FuaXRpemVkKTtcbiAgcmV0dXJuIHsgdXBkYXRlZE9iamVjdCwgb3JpZ2luYWxPYmplY3QgfTtcbn07XG5cblJlc3RXcml0ZS5wcm90b3R5cGUuY2xlYW5Vc2VyQXV0aERhdGEgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLnJlc3BvbnNlICYmIHRoaXMucmVzcG9uc2UucmVzcG9uc2UgJiYgdGhpcy5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBjb25zdCB1c2VyID0gdGhpcy5yZXNwb25zZS5yZXNwb25zZTtcbiAgICBpZiAodXNlci5hdXRoRGF0YSkge1xuICAgICAgT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkuZm9yRWFjaChwcm92aWRlciA9PiB7XG4gICAgICAgIGlmICh1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXSA9PT0gbnVsbCkge1xuICAgICAgICAgIGRlbGV0ZSB1c2VyLmF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICBpZiAoT2JqZWN0LmtleXModXNlci5hdXRoRGF0YSkubGVuZ3RoID09IDApIHtcbiAgICAgICAgZGVsZXRlIHVzZXIuYXV0aERhdGE7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG5SZXN0V3JpdGUucHJvdG90eXBlLl91cGRhdGVSZXNwb25zZVdpdGhEYXRhID0gZnVuY3Rpb24gKHJlc3BvbnNlLCBkYXRhKSB7XG4gIGNvbnN0IHN0YXRlQ29udHJvbGxlciA9IFBhcnNlLkNvcmVNYW5hZ2VyLmdldE9iamVjdFN0YXRlQ29udHJvbGxlcigpO1xuICBjb25zdCBbcGVuZGluZ10gPSBzdGF0ZUNvbnRyb2xsZXIuZ2V0UGVuZGluZ09wcyh0aGlzLnBlbmRpbmdPcHMuaWRlbnRpZmllcik7XG4gIGZvciAoY29uc3Qga2V5IGluIHRoaXMucGVuZGluZ09wcy5vcGVyYXRpb25zKSB7XG4gICAgaWYgKCFwZW5kaW5nW2tleV0pIHtcbiAgICAgIGRhdGFba2V5XSA9IHRoaXMub3JpZ2luYWxEYXRhID8gdGhpcy5vcmlnaW5hbERhdGFba2V5XSA6IHsgX19vcDogJ0RlbGV0ZScgfTtcbiAgICAgIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLnB1c2goa2V5KTtcbiAgICB9XG4gIH1cbiAgY29uc3Qgc2tpcEtleXMgPSBbLi4uKHJlcXVpcmVkQ29sdW1ucy5yZWFkW3RoaXMuY2xhc3NOYW1lXSB8fCBbXSldO1xuICBpZiAoIXRoaXMucXVlcnkpIHtcbiAgICBza2lwS2V5cy5wdXNoKCdvYmplY3RJZCcsICdjcmVhdGVkQXQnKTtcbiAgfSBlbHNlIHtcbiAgICBza2lwS2V5cy5wdXNoKCd1cGRhdGVkQXQnKTtcbiAgICBkZWxldGUgcmVzcG9uc2Uub2JqZWN0SWQ7XG4gIH1cbiAgZm9yIChjb25zdCBrZXkgaW4gcmVzcG9uc2UpIHtcbiAgICBpZiAoc2tpcEtleXMuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgY29udGludWU7XG4gICAgfVxuICAgIGNvbnN0IHZhbHVlID0gcmVzcG9uc2Vba2V5XTtcbiAgICBpZiAoXG4gICAgICB2YWx1ZSA9PSBudWxsIHx8XG4gICAgICAodmFsdWUuX190eXBlICYmIHZhbHVlLl9fdHlwZSA9PT0gJ1BvaW50ZXInKSB8fFxuICAgICAgdXRpbC5pc0RlZXBTdHJpY3RFcXVhbChkYXRhW2tleV0sIHZhbHVlKSB8fFxuICAgICAgdXRpbC5pc0RlZXBTdHJpY3RFcXVhbCgodGhpcy5vcmlnaW5hbERhdGEgfHwge30pW2tleV0sIHZhbHVlKVxuICAgICkge1xuICAgICAgZGVsZXRlIHJlc3BvbnNlW2tleV07XG4gICAgfVxuICB9XG4gIGlmIChfLmlzRW1wdHkodGhpcy5zdG9yYWdlLmZpZWxkc0NoYW5nZWRCeVRyaWdnZXIpKSB7XG4gICAgcmV0dXJuIHJlc3BvbnNlO1xuICB9XG4gIGNvbnN0IGNsaWVudFN1cHBvcnRzRGVsZXRlID0gQ2xpZW50U0RLLnN1cHBvcnRzRm9yd2FyZERlbGV0ZSh0aGlzLmNsaWVudFNESyk7XG4gIHRoaXMuc3RvcmFnZS5maWVsZHNDaGFuZ2VkQnlUcmlnZ2VyLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICBjb25zdCBkYXRhVmFsdWUgPSBkYXRhW2ZpZWxkTmFtZV07XG5cbiAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChyZXNwb25zZSwgZmllbGROYW1lKSkge1xuICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICB9XG5cbiAgICAvLyBTdHJpcHMgb3BlcmF0aW9ucyBmcm9tIHJlc3BvbnNlc1xuICAgIGlmIChyZXNwb25zZVtmaWVsZE5hbWVdICYmIHJlc3BvbnNlW2ZpZWxkTmFtZV0uX19vcCkge1xuICAgICAgZGVsZXRlIHJlc3BvbnNlW2ZpZWxkTmFtZV07XG4gICAgICBpZiAoY2xpZW50U3VwcG9ydHNEZWxldGUgJiYgZGF0YVZhbHVlLl9fb3AgPT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgcmVzcG9uc2VbZmllbGROYW1lXSA9IGRhdGFWYWx1ZTtcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xuICByZXR1cm4gcmVzcG9uc2U7XG59O1xuXG5leHBvcnQgZGVmYXVsdCBSZXN0V3JpdGU7XG5tb2R1bGUuZXhwb3J0cyA9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