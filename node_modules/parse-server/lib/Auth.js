"use strict";

var _util = require("util");
var _triggers = require("./triggers");
var _logger = require("./logger");
var _RestQuery = _interopRequireDefault(require("./RestQuery"));
var _RestWrite = _interopRequireDefault(require("./RestWrite"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
const Parse = require('parse/node');
// An Auth object tells you who is requesting something and whether
// the master key was used.
// userObject is a Parse.User and can be null if there's no user.
function Auth({
  config,
  cacheController = undefined,
  isMaster = false,
  isMaintenance = false,
  isReadOnly = false,
  user,
  installationId
}) {
  this.config = config;
  this.cacheController = cacheController || config && config.cacheController;
  this.installationId = installationId;
  this.isMaster = isMaster;
  this.isMaintenance = isMaintenance;
  this.user = user;
  this.isReadOnly = isReadOnly;

  // Assuming a users roles won't change during a single request, we'll
  // only load them once.
  this.userRoles = [];
  this.fetchedRoles = false;
  this.rolePromise = null;
}

// Whether this auth could possibly modify the given user id.
// It still could be forbidden via ACLs even if this returns true.
Auth.prototype.isUnauthenticated = function () {
  if (this.isMaster) {
    return false;
  }
  if (this.isMaintenance) {
    return false;
  }
  if (this.user) {
    return false;
  }
  return true;
};

// A helper to get a master-level Auth object
function master(config) {
  return new Auth({
    config,
    isMaster: true
  });
}

// A helper to get a maintenance-level Auth object
function maintenance(config) {
  return new Auth({
    config,
    isMaintenance: true
  });
}

// A helper to get a master-level Auth object
function readOnly(config) {
  return new Auth({
    config,
    isMaster: true,
    isReadOnly: true
  });
}

// A helper to get a nobody-level Auth object
function nobody(config) {
  return new Auth({
    config,
    isMaster: false
  });
}
const throttle = {};
const renewSessionIfNeeded = async ({
  config,
  session,
  sessionToken
}) => {
  if (!(config !== null && config !== void 0 && config.extendSessionOnUse)) {
    return;
  }
  clearTimeout(throttle[sessionToken]);
  throttle[sessionToken] = setTimeout(async () => {
    try {
      var _session;
      if (!session) {
        const query = await (0, _RestQuery.default)({
          method: _RestQuery.default.Method.get,
          config,
          auth: master(config),
          runBeforeFind: false,
          className: '_Session',
          restWhere: {
            sessionToken
          },
          restOptions: {
            limit: 1
          }
        });
        const {
          results
        } = await query.execute();
        session = results[0];
      }
      const lastUpdated = new Date((_session = session) === null || _session === void 0 ? void 0 : _session.updatedAt);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      if (lastUpdated > yesterday || !session) {
        return;
      }
      const expiresAt = config.generateSessionExpiresAt();
      await new _RestWrite.default(config, master(config), '_Session', {
        objectId: session.objectId
      }, {
        expiresAt: Parse._encode(expiresAt)
      }).execute();
    } catch (e) {
      if ((e === null || e === void 0 ? void 0 : e.code) !== Parse.Error.OBJECT_NOT_FOUND) {
        _logger.logger.error('Could not update session expiry: ', e);
      }
    }
  }, 500);
};

// Returns a promise that resolves to an Auth object
const getAuthForSessionToken = async function ({
  config,
  cacheController,
  sessionToken,
  installationId
}) {
  cacheController = cacheController || config && config.cacheController;
  if (cacheController) {
    const userJSON = await cacheController.user.get(sessionToken);
    if (userJSON) {
      const cachedUser = Parse.Object.fromJSON(userJSON);
      renewSessionIfNeeded({
        config,
        sessionToken
      });
      return Promise.resolve(new Auth({
        config,
        cacheController,
        isMaster: false,
        installationId,
        user: cachedUser
      }));
    }
  }
  let results;
  if (config) {
    const restOptions = {
      limit: 1,
      include: 'user'
    };
    const RestQuery = require('./RestQuery');
    const query = await RestQuery({
      method: RestQuery.Method.get,
      config,
      runBeforeFind: false,
      auth: master(config),
      className: '_Session',
      restWhere: {
        sessionToken
      },
      restOptions
    });
    results = (await query.execute()).results;
  } else {
    results = (await new Parse.Query(Parse.Session).limit(1).include('user').equalTo('sessionToken', sessionToken).find({
      useMasterKey: true
    })).map(obj => obj.toJSON());
  }
  if (results.length !== 1 || !results[0]['user']) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
  }
  const session = results[0];
  const now = new Date(),
    expiresAt = session.expiresAt ? new Date(session.expiresAt.iso) : undefined;
  if (expiresAt < now) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token is expired.');
  }
  const obj = session.user;
  delete obj.password;
  obj['className'] = '_User';
  obj['sessionToken'] = sessionToken;
  if (cacheController) {
    cacheController.user.put(sessionToken, obj);
  }
  renewSessionIfNeeded({
    config,
    session,
    sessionToken
  });
  const userObject = Parse.Object.fromJSON(obj);
  return new Auth({
    config,
    cacheController,
    isMaster: false,
    installationId,
    user: userObject
  });
};
var getAuthForLegacySessionToken = async function ({
  config,
  sessionToken,
  installationId
}) {
  var restOptions = {
    limit: 1
  };
  const RestQuery = require('./RestQuery');
  var query = await RestQuery({
    method: RestQuery.Method.get,
    config,
    runBeforeFind: false,
    auth: master(config),
    className: '_User',
    restWhere: {
      _session_token: sessionToken
    },
    restOptions
  });
  return query.execute().then(response => {
    var results = response.results;
    if (results.length !== 1) {
      throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'invalid legacy session token');
    }
    const obj = results[0];
    obj.className = '_User';
    const userObject = Parse.Object.fromJSON(obj);
    return new Auth({
      config,
      isMaster: false,
      installationId,
      user: userObject
    });
  });
};

// Returns a promise that resolves to an array of role names
Auth.prototype.getUserRoles = function () {
  if (this.isMaster || this.isMaintenance || !this.user) {
    return Promise.resolve([]);
  }
  if (this.fetchedRoles) {
    return Promise.resolve(this.userRoles);
  }
  if (this.rolePromise) {
    return this.rolePromise;
  }
  this.rolePromise = this._loadRoles();
  return this.rolePromise;
};
Auth.prototype.getRolesForUser = async function () {
  //Stack all Parse.Role
  const results = [];
  if (this.config) {
    const restWhere = {
      users: {
        __type: 'Pointer',
        className: '_User',
        objectId: this.user.id
      }
    };
    const RestQuery = require('./RestQuery');
    const query = await RestQuery({
      method: RestQuery.Method.find,
      runBeforeFind: false,
      config: this.config,
      auth: master(this.config),
      className: '_Role',
      restWhere
    });
    await query.each(result => results.push(result));
  } else {
    await new Parse.Query(Parse.Role).equalTo('users', this.user).each(result => results.push(result.toJSON()), {
      useMasterKey: true
    });
  }
  return results;
};

// Iterates through the role tree and compiles a user's roles
Auth.prototype._loadRoles = async function () {
  if (this.cacheController) {
    const cachedRoles = await this.cacheController.role.get(this.user.id);
    if (cachedRoles != null) {
      this.fetchedRoles = true;
      this.userRoles = cachedRoles;
      return cachedRoles;
    }
  }

  // First get the role ids this user is directly a member of
  const results = await this.getRolesForUser();
  if (!results.length) {
    this.userRoles = [];
    this.fetchedRoles = true;
    this.rolePromise = null;
    this.cacheRoles();
    return this.userRoles;
  }
  const rolesMap = results.reduce((m, r) => {
    m.names.push(r.name);
    m.ids.push(r.objectId);
    return m;
  }, {
    ids: [],
    names: []
  });

  // run the recursive finding
  const roleNames = await this._getAllRolesNamesForRoleIds(rolesMap.ids, rolesMap.names);
  this.userRoles = roleNames.map(r => {
    return 'role:' + r;
  });
  this.fetchedRoles = true;
  this.rolePromise = null;
  this.cacheRoles();
  return this.userRoles;
};
Auth.prototype.cacheRoles = function () {
  if (!this.cacheController) {
    return false;
  }
  this.cacheController.role.put(this.user.id, Array(...this.userRoles));
  return true;
};
Auth.prototype.clearRoleCache = function (sessionToken) {
  if (!this.cacheController) {
    return false;
  }
  this.cacheController.role.del(this.user.id);
  this.cacheController.user.del(sessionToken);
  return true;
};
Auth.prototype.getRolesByIds = async function (ins) {
  const results = [];
  // Build an OR query across all parentRoles
  if (!this.config) {
    await new Parse.Query(Parse.Role).containedIn('roles', ins.map(id => {
      const role = new Parse.Object(Parse.Role);
      role.id = id;
      return role;
    })).each(result => results.push(result.toJSON()), {
      useMasterKey: true
    });
  } else {
    const roles = ins.map(id => {
      return {
        __type: 'Pointer',
        className: '_Role',
        objectId: id
      };
    });
    const restWhere = {
      roles: {
        $in: roles
      }
    };
    const RestQuery = require('./RestQuery');
    const query = await RestQuery({
      method: RestQuery.Method.find,
      config: this.config,
      runBeforeFind: false,
      auth: master(this.config),
      className: '_Role',
      restWhere
    });
    await query.each(result => results.push(result));
  }
  return results;
};

// Given a list of roleIds, find all the parent roles, returns a promise with all names
Auth.prototype._getAllRolesNamesForRoleIds = function (roleIDs, names = [], queriedRoles = {}) {
  const ins = roleIDs.filter(roleID => {
    const wasQueried = queriedRoles[roleID] !== true;
    queriedRoles[roleID] = true;
    return wasQueried;
  });

  // all roles are accounted for, return the names
  if (ins.length == 0) {
    return Promise.resolve([...new Set(names)]);
  }
  return this.getRolesByIds(ins).then(results => {
    // Nothing found
    if (!results.length) {
      return Promise.resolve(names);
    }
    // Map the results with all Ids and names
    const resultMap = results.reduce((memo, role) => {
      memo.names.push(role.name);
      memo.ids.push(role.objectId);
      return memo;
    }, {
      ids: [],
      names: []
    });
    // store the new found names
    names = names.concat(resultMap.names);
    // find the next ones, circular roles will be cut
    return this._getAllRolesNamesForRoleIds(resultMap.ids, names, queriedRoles);
  }).then(names => {
    return Promise.resolve([...new Set(names)]);
  });
};
const findUsersWithAuthData = (config, authData) => {
  const providers = Object.keys(authData);
  const query = providers.reduce((memo, provider) => {
    if (!authData[provider] || authData && !authData[provider].id) {
      return memo;
    }
    const queryKey = `authData.${provider}.id`;
    const query = {};
    query[queryKey] = authData[provider].id;
    memo.push(query);
    return memo;
  }, []).filter(q => {
    return typeof q !== 'undefined';
  });
  return query.length > 0 ? config.database.find('_User', {
    $or: query
  }, {
    limit: 2
  }) : Promise.resolve([]);
};
const hasMutatedAuthData = (authData, userAuthData) => {
  if (!userAuthData) return {
    hasMutatedAuthData: true,
    mutatedAuthData: authData
  };
  const mutatedAuthData = {};
  Object.keys(authData).forEach(provider => {
    // Anonymous provider is not handled this way
    if (provider === 'anonymous') return;
    const providerData = authData[provider];
    const userProviderAuthData = userAuthData[provider];
    if (!(0, _util.isDeepStrictEqual)(providerData, userProviderAuthData)) {
      mutatedAuthData[provider] = providerData;
    }
  });
  const hasMutatedAuthData = Object.keys(mutatedAuthData).length !== 0;
  return {
    hasMutatedAuthData,
    mutatedAuthData
  };
};
const checkIfUserHasProvidedConfiguredProvidersForLogin = (req = {}, authData = {}, userAuthData = {}, config) => {
  const savedUserProviders = Object.keys(userAuthData).map(provider => ({
    name: provider,
    adapter: config.authDataManager.getValidatorForProvider(provider).adapter
  }));
  const hasProvidedASoloProvider = savedUserProviders.some(provider => provider && provider.adapter && provider.adapter.policy === 'solo' && authData[provider.name]);

  // Solo providers can be considered as safe, so we do not have to check if the user needs
  // to provide an additional provider to login. An auth adapter with "solo" (like webauthn) means
  // no "additional" auth needs to be provided to login (like OTP, MFA)
  if (hasProvidedASoloProvider) {
    return;
  }
  const additionProvidersNotFound = [];
  const hasProvidedAtLeastOneAdditionalProvider = savedUserProviders.some(provider => {
    let policy = provider.adapter.policy;
    if (typeof policy === 'function') {
      const requestObject = {
        ip: req.config.ip,
        user: req.auth.user,
        master: req.auth.isMaster
      };
      policy = policy.call(provider.adapter, requestObject, userAuthData[provider.name]);
    }
    if (policy === 'additional') {
      if (authData[provider.name]) {
        return true;
      } else {
        // Push missing provider for error message
        additionProvidersNotFound.push(provider.name);
      }
    }
  });
  if (hasProvidedAtLeastOneAdditionalProvider || !additionProvidersNotFound.length) {
    return;
  }
  throw new Parse.Error(Parse.Error.OTHER_CAUSE, `Missing additional authData ${additionProvidersNotFound.join(',')}`);
};

// Validate each authData step-by-step and return the provider responses
const handleAuthDataValidation = async (authData, req, foundUser) => {
  let user;
  if (foundUser) {
    user = Parse.User.fromJSON(_objectSpread({
      className: '_User'
    }, foundUser));
    // Find user by session and current objectId; only pass user if it's the current user or master key is provided
  } else if (req.auth && req.auth.user && typeof req.getUserId === 'function' && req.getUserId() === req.auth.user.id || req.auth && req.auth.isMaster && typeof req.getUserId === 'function' && req.getUserId()) {
    user = new Parse.User();
    user.id = req.auth.isMaster ? req.getUserId() : req.auth.user.id;
    await user.fetch({
      useMasterKey: true
    });
  }
  const {
    updatedObject
  } = req.buildParseObjects();
  const requestObject = (0, _triggers.getRequestObject)(undefined, req.auth, updatedObject, user, req.config);
  // Perform validation as step-by-step pipeline for better error consistency
  // and also to avoid to trigger a provider (like OTP SMS) if another one fails
  const acc = {
    authData: {},
    authDataResponse: {}
  };
  const authKeys = Object.keys(authData).sort();
  for (const provider of authKeys) {
    let method = '';
    try {
      if (authData[provider] === null) {
        acc.authData[provider] = null;
        continue;
      }
      const {
        validator
      } = req.config.authDataManager.getValidatorForProvider(provider);
      const authProvider = (req.config.auth || {})[provider] || {};
      if (!validator || authProvider.enabled === false) {
        throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
      }
      let validationResult = await validator(authData[provider], req, user, requestObject);
      method = validationResult && validationResult.method;
      requestObject.triggerName = method;
      if (validationResult && validationResult.validator) {
        validationResult = await validationResult.validator();
      }
      if (!validationResult) {
        acc.authData[provider] = authData[provider];
        continue;
      }
      if (!Object.keys(validationResult).length) {
        acc.authData[provider] = authData[provider];
        continue;
      }
      if (validationResult.response) {
        acc.authDataResponse[provider] = validationResult.response;
      }
      // Some auth providers after initialization will avoid to replace authData already stored
      if (!validationResult.doNotSave) {
        acc.authData[provider] = validationResult.save || authData[provider];
      }
    } catch (err) {
      const e = (0, _triggers.resolveError)(err, {
        code: Parse.Error.SCRIPT_FAILED,
        message: 'Auth failed. Unknown error.'
      });
      const userString = req.auth && req.auth.user ? req.auth.user.id : req.data.objectId || undefined;
      _logger.logger.error(`Failed running auth step ${method} for ${provider} for user ${userString} with Error: ` + JSON.stringify(e), {
        authenticationStep: method,
        error: e,
        user: userString,
        provider
      });
      throw e;
    }
  }
  return acc;
};
module.exports = {
  Auth,
  master,
  maintenance,
  nobody,
  readOnly,
  getAuthForSessionToken,
  getAuthForLegacySessionToken,
  findUsersWithAuthData,
  hasMutatedAuthData,
  checkIfUserHasProvidedConfiguredProvidersForLogin,
  handleAuthDataValidation
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdXRpbCIsInJlcXVpcmUiLCJfdHJpZ2dlcnMiLCJfbG9nZ2VyIiwiX1Jlc3RRdWVyeSIsIl9pbnRlcm9wUmVxdWlyZURlZmF1bHQiLCJfUmVzdFdyaXRlIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwiZSIsInIiLCJ0IiwiT2JqZWN0Iiwia2V5cyIsImdldE93blByb3BlcnR5U3ltYm9scyIsIm8iLCJmaWx0ZXIiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsImFyZ3VtZW50cyIsImxlbmd0aCIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5Iiwia2V5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiaSIsIl90b1ByaW1pdGl2ZSIsIlN0cmluZyIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwiY2FsbCIsIlR5cGVFcnJvciIsIk51bWJlciIsIlBhcnNlIiwiQXV0aCIsImNvbmZpZyIsImNhY2hlQ29udHJvbGxlciIsInVuZGVmaW5lZCIsImlzTWFzdGVyIiwiaXNNYWludGVuYW5jZSIsImlzUmVhZE9ubHkiLCJ1c2VyIiwiaW5zdGFsbGF0aW9uSWQiLCJ1c2VyUm9sZXMiLCJmZXRjaGVkUm9sZXMiLCJyb2xlUHJvbWlzZSIsInByb3RvdHlwZSIsImlzVW5hdXRoZW50aWNhdGVkIiwibWFzdGVyIiwibWFpbnRlbmFuY2UiLCJyZWFkT25seSIsIm5vYm9keSIsInRocm90dGxlIiwicmVuZXdTZXNzaW9uSWZOZWVkZWQiLCJzZXNzaW9uIiwic2Vzc2lvblRva2VuIiwiZXh0ZW5kU2Vzc2lvbk9uVXNlIiwiY2xlYXJUaW1lb3V0Iiwic2V0VGltZW91dCIsIl9zZXNzaW9uIiwicXVlcnkiLCJSZXN0UXVlcnkiLCJtZXRob2QiLCJNZXRob2QiLCJnZXQiLCJhdXRoIiwicnVuQmVmb3JlRmluZCIsImNsYXNzTmFtZSIsInJlc3RXaGVyZSIsInJlc3RPcHRpb25zIiwibGltaXQiLCJyZXN1bHRzIiwiZXhlY3V0ZSIsImxhc3RVcGRhdGVkIiwiRGF0ZSIsInVwZGF0ZWRBdCIsInllc3RlcmRheSIsInNldERhdGUiLCJnZXREYXRlIiwiZXhwaXJlc0F0IiwiZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0IiwiUmVzdFdyaXRlIiwib2JqZWN0SWQiLCJfZW5jb2RlIiwiY29kZSIsIkVycm9yIiwiT0JKRUNUX05PVF9GT1VORCIsImxvZ2dlciIsImVycm9yIiwiZ2V0QXV0aEZvclNlc3Npb25Ub2tlbiIsInVzZXJKU09OIiwiY2FjaGVkVXNlciIsImZyb21KU09OIiwiUHJvbWlzZSIsInJlc29sdmUiLCJpbmNsdWRlIiwiUXVlcnkiLCJTZXNzaW9uIiwiZXF1YWxUbyIsImZpbmQiLCJ1c2VNYXN0ZXJLZXkiLCJtYXAiLCJ0b0pTT04iLCJJTlZBTElEX1NFU1NJT05fVE9LRU4iLCJub3ciLCJpc28iLCJwYXNzd29yZCIsInB1dCIsInVzZXJPYmplY3QiLCJnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuIiwiX3Nlc3Npb25fdG9rZW4iLCJ0aGVuIiwicmVzcG9uc2UiLCJnZXRVc2VyUm9sZXMiLCJfbG9hZFJvbGVzIiwiZ2V0Um9sZXNGb3JVc2VyIiwidXNlcnMiLCJfX3R5cGUiLCJpZCIsImVhY2giLCJyZXN1bHQiLCJSb2xlIiwiY2FjaGVkUm9sZXMiLCJyb2xlIiwiY2FjaGVSb2xlcyIsInJvbGVzTWFwIiwicmVkdWNlIiwibSIsIm5hbWVzIiwibmFtZSIsImlkcyIsInJvbGVOYW1lcyIsIl9nZXRBbGxSb2xlc05hbWVzRm9yUm9sZUlkcyIsIkFycmF5IiwiY2xlYXJSb2xlQ2FjaGUiLCJkZWwiLCJnZXRSb2xlc0J5SWRzIiwiaW5zIiwiY29udGFpbmVkSW4iLCJyb2xlcyIsIiRpbiIsInJvbGVJRHMiLCJxdWVyaWVkUm9sZXMiLCJyb2xlSUQiLCJ3YXNRdWVyaWVkIiwiU2V0IiwicmVzdWx0TWFwIiwibWVtbyIsImNvbmNhdCIsImZpbmRVc2Vyc1dpdGhBdXRoRGF0YSIsImF1dGhEYXRhIiwicHJvdmlkZXJzIiwicHJvdmlkZXIiLCJxdWVyeUtleSIsInEiLCJkYXRhYmFzZSIsIiRvciIsImhhc011dGF0ZWRBdXRoRGF0YSIsInVzZXJBdXRoRGF0YSIsIm11dGF0ZWRBdXRoRGF0YSIsInByb3ZpZGVyRGF0YSIsInVzZXJQcm92aWRlckF1dGhEYXRhIiwiaXNEZWVwU3RyaWN0RXF1YWwiLCJjaGVja0lmVXNlckhhc1Byb3ZpZGVkQ29uZmlndXJlZFByb3ZpZGVyc0ZvckxvZ2luIiwicmVxIiwic2F2ZWRVc2VyUHJvdmlkZXJzIiwiYWRhcHRlciIsImF1dGhEYXRhTWFuYWdlciIsImdldFZhbGlkYXRvckZvclByb3ZpZGVyIiwiaGFzUHJvdmlkZWRBU29sb1Byb3ZpZGVyIiwic29tZSIsInBvbGljeSIsImFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQiLCJoYXNQcm92aWRlZEF0TGVhc3RPbmVBZGRpdGlvbmFsUHJvdmlkZXIiLCJyZXF1ZXN0T2JqZWN0IiwiaXAiLCJPVEhFUl9DQVVTRSIsImpvaW4iLCJoYW5kbGVBdXRoRGF0YVZhbGlkYXRpb24iLCJmb3VuZFVzZXIiLCJVc2VyIiwiZ2V0VXNlcklkIiwiZmV0Y2giLCJ1cGRhdGVkT2JqZWN0IiwiYnVpbGRQYXJzZU9iamVjdHMiLCJnZXRSZXF1ZXN0T2JqZWN0IiwiYWNjIiwiYXV0aERhdGFSZXNwb25zZSIsImF1dGhLZXlzIiwic29ydCIsInZhbGlkYXRvciIsImF1dGhQcm92aWRlciIsImVuYWJsZWQiLCJVTlNVUFBPUlRFRF9TRVJWSUNFIiwidmFsaWRhdGlvblJlc3VsdCIsInRyaWdnZXJOYW1lIiwiZG9Ob3RTYXZlIiwic2F2ZSIsImVyciIsInJlc29sdmVFcnJvciIsIlNDUklQVF9GQUlMRUQiLCJtZXNzYWdlIiwidXNlclN0cmluZyIsImRhdGEiLCJKU09OIiwic3RyaW5naWZ5IiwiYXV0aGVudGljYXRpb25TdGVwIiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uL3NyYy9BdXRoLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImNvbnN0IFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xuaW1wb3J0IHsgaXNEZWVwU3RyaWN0RXF1YWwgfSBmcm9tICd1dGlsJztcbmltcG9ydCB7IGdldFJlcXVlc3RPYmplY3QsIHJlc29sdmVFcnJvciB9IGZyb20gJy4vdHJpZ2dlcnMnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IFJlc3RRdWVyeSBmcm9tICcuL1Jlc3RRdWVyeSc7XG5pbXBvcnQgUmVzdFdyaXRlIGZyb20gJy4vUmVzdFdyaXRlJztcblxuLy8gQW4gQXV0aCBvYmplY3QgdGVsbHMgeW91IHdobyBpcyByZXF1ZXN0aW5nIHNvbWV0aGluZyBhbmQgd2hldGhlclxuLy8gdGhlIG1hc3RlciBrZXkgd2FzIHVzZWQuXG4vLyB1c2VyT2JqZWN0IGlzIGEgUGFyc2UuVXNlciBhbmQgY2FuIGJlIG51bGwgaWYgdGhlcmUncyBubyB1c2VyLlxuZnVuY3Rpb24gQXV0aCh7XG4gIGNvbmZpZyxcbiAgY2FjaGVDb250cm9sbGVyID0gdW5kZWZpbmVkLFxuICBpc01hc3RlciA9IGZhbHNlLFxuICBpc01haW50ZW5hbmNlID0gZmFsc2UsXG4gIGlzUmVhZE9ubHkgPSBmYWxzZSxcbiAgdXNlcixcbiAgaW5zdGFsbGF0aW9uSWQsXG59KSB7XG4gIHRoaXMuY29uZmlnID0gY29uZmlnO1xuICB0aGlzLmNhY2hlQ29udHJvbGxlciA9IGNhY2hlQ29udHJvbGxlciB8fCAoY29uZmlnICYmIGNvbmZpZy5jYWNoZUNvbnRyb2xsZXIpO1xuICB0aGlzLmluc3RhbGxhdGlvbklkID0gaW5zdGFsbGF0aW9uSWQ7XG4gIHRoaXMuaXNNYXN0ZXIgPSBpc01hc3RlcjtcbiAgdGhpcy5pc01haW50ZW5hbmNlID0gaXNNYWludGVuYW5jZTtcbiAgdGhpcy51c2VyID0gdXNlcjtcbiAgdGhpcy5pc1JlYWRPbmx5ID0gaXNSZWFkT25seTtcblxuICAvLyBBc3N1bWluZyBhIHVzZXJzIHJvbGVzIHdvbid0IGNoYW5nZSBkdXJpbmcgYSBzaW5nbGUgcmVxdWVzdCwgd2UnbGxcbiAgLy8gb25seSBsb2FkIHRoZW0gb25jZS5cbiAgdGhpcy51c2VyUm9sZXMgPSBbXTtcbiAgdGhpcy5mZXRjaGVkUm9sZXMgPSBmYWxzZTtcbiAgdGhpcy5yb2xlUHJvbWlzZSA9IG51bGw7XG59XG5cbi8vIFdoZXRoZXIgdGhpcyBhdXRoIGNvdWxkIHBvc3NpYmx5IG1vZGlmeSB0aGUgZ2l2ZW4gdXNlciBpZC5cbi8vIEl0IHN0aWxsIGNvdWxkIGJlIGZvcmJpZGRlbiB2aWEgQUNMcyBldmVuIGlmIHRoaXMgcmV0dXJucyB0cnVlLlxuQXV0aC5wcm90b3R5cGUuaXNVbmF1dGhlbnRpY2F0ZWQgPSBmdW5jdGlvbiAoKSB7XG4gIGlmICh0aGlzLmlzTWFzdGVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmICh0aGlzLmlzTWFpbnRlbmFuY2UpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKHRoaXMudXNlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbi8vIEEgaGVscGVyIHRvIGdldCBhIG1hc3Rlci1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gbWFzdGVyKGNvbmZpZykge1xuICByZXR1cm4gbmV3IEF1dGgoeyBjb25maWcsIGlzTWFzdGVyOiB0cnVlIH0pO1xufVxuXG4vLyBBIGhlbHBlciB0byBnZXQgYSBtYWludGVuYW5jZS1sZXZlbCBBdXRoIG9iamVjdFxuZnVuY3Rpb24gbWFpbnRlbmFuY2UoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYWludGVuYW5jZTogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbWFzdGVyLWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiByZWFkT25seShjb25maWcpIHtcbiAgcmV0dXJuIG5ldyBBdXRoKHsgY29uZmlnLCBpc01hc3RlcjogdHJ1ZSwgaXNSZWFkT25seTogdHJ1ZSB9KTtcbn1cblxuLy8gQSBoZWxwZXIgdG8gZ2V0IGEgbm9ib2R5LWxldmVsIEF1dGggb2JqZWN0XG5mdW5jdGlvbiBub2JvZHkoY29uZmlnKSB7XG4gIHJldHVybiBuZXcgQXV0aCh7IGNvbmZpZywgaXNNYXN0ZXI6IGZhbHNlIH0pO1xufVxuXG5jb25zdCB0aHJvdHRsZSA9IHt9O1xuY29uc3QgcmVuZXdTZXNzaW9uSWZOZWVkZWQgPSBhc3luYyAoeyBjb25maWcsIHNlc3Npb24sIHNlc3Npb25Ub2tlbiB9KSA9PiB7XG4gIGlmICghY29uZmlnPy5leHRlbmRTZXNzaW9uT25Vc2UpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgY2xlYXJUaW1lb3V0KHRocm90dGxlW3Nlc3Npb25Ub2tlbl0pO1xuICB0aHJvdHRsZVtzZXNzaW9uVG9rZW5dID0gc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIGlmICghc2Vzc2lvbikge1xuICAgICAgICBjb25zdCBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICAgICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmdldCxcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgYXV0aDogbWFzdGVyKGNvbmZpZyksXG4gICAgICAgICAgcnVuQmVmb3JlRmluZDogZmFsc2UsXG4gICAgICAgICAgY2xhc3NOYW1lOiAnX1Nlc3Npb24nLFxuICAgICAgICAgIHJlc3RXaGVyZTogeyBzZXNzaW9uVG9rZW4gfSxcbiAgICAgICAgICByZXN0T3B0aW9uczogeyBsaW1pdDogMSB9LFxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgeyByZXN1bHRzIH0gPSBhd2FpdCBxdWVyeS5leGVjdXRlKCk7XG4gICAgICAgIHNlc3Npb24gPSByZXN1bHRzWzBdO1xuICAgICAgfVxuICAgICAgY29uc3QgbGFzdFVwZGF0ZWQgPSBuZXcgRGF0ZShzZXNzaW9uPy51cGRhdGVkQXQpO1xuICAgICAgY29uc3QgeWVzdGVyZGF5ID0gbmV3IERhdGUoKTtcbiAgICAgIHllc3RlcmRheS5zZXREYXRlKHllc3RlcmRheS5nZXREYXRlKCkgLSAxKTtcbiAgICAgIGlmIChsYXN0VXBkYXRlZCA+IHllc3RlcmRheSB8fCAhc2Vzc2lvbikge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCBleHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCk7XG4gICAgICBhd2FpdCBuZXcgUmVzdFdyaXRlKFxuICAgICAgICBjb25maWcsXG4gICAgICAgIG1hc3Rlcihjb25maWcpLFxuICAgICAgICAnX1Nlc3Npb24nLFxuICAgICAgICB7IG9iamVjdElkOiBzZXNzaW9uLm9iamVjdElkIH0sXG4gICAgICAgIHsgZXhwaXJlc0F0OiBQYXJzZS5fZW5jb2RlKGV4cGlyZXNBdCkgfVxuICAgICAgKS5leGVjdXRlKCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKGU/LmNvZGUgIT09IFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKCdDb3VsZCBub3QgdXBkYXRlIHNlc3Npb24gZXhwaXJ5OiAnLCBlKTtcbiAgICAgIH1cbiAgICB9XG4gIH0sIDUwMCk7XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIEF1dGggb2JqZWN0XG5jb25zdCBnZXRBdXRoRm9yU2Vzc2lvblRva2VuID0gYXN5bmMgZnVuY3Rpb24gKHtcbiAgY29uZmlnLFxuICBjYWNoZUNvbnRyb2xsZXIsXG4gIHNlc3Npb25Ub2tlbixcbiAgaW5zdGFsbGF0aW9uSWQsXG59KSB7XG4gIGNhY2hlQ29udHJvbGxlciA9IGNhY2hlQ29udHJvbGxlciB8fCAoY29uZmlnICYmIGNvbmZpZy5jYWNoZUNvbnRyb2xsZXIpO1xuICBpZiAoY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY29uc3QgdXNlckpTT04gPSBhd2FpdCBjYWNoZUNvbnRyb2xsZXIudXNlci5nZXQoc2Vzc2lvblRva2VuKTtcbiAgICBpZiAodXNlckpTT04pIHtcbiAgICAgIGNvbnN0IGNhY2hlZFVzZXIgPSBQYXJzZS5PYmplY3QuZnJvbUpTT04odXNlckpTT04pO1xuICAgICAgcmVuZXdTZXNzaW9uSWZOZWVkZWQoeyBjb25maWcsIHNlc3Npb25Ub2tlbiB9KTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoXG4gICAgICAgIG5ldyBBdXRoKHtcbiAgICAgICAgICBjb25maWcsXG4gICAgICAgICAgY2FjaGVDb250cm9sbGVyLFxuICAgICAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgICAgICBpbnN0YWxsYXRpb25JZCxcbiAgICAgICAgICB1c2VyOiBjYWNoZWRVc2VyLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICBsZXQgcmVzdWx0cztcbiAgaWYgKGNvbmZpZykge1xuICAgIGNvbnN0IHJlc3RPcHRpb25zID0ge1xuICAgICAgbGltaXQ6IDEsXG4gICAgICBpbmNsdWRlOiAndXNlcicsXG4gICAgfTtcbiAgICBjb25zdCBSZXN0UXVlcnkgPSByZXF1aXJlKCcuL1Jlc3RRdWVyeScpO1xuICAgIGNvbnN0IHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICAgIG1ldGhvZDogUmVzdFF1ZXJ5Lk1ldGhvZC5nZXQsXG4gICAgICBjb25maWcsXG4gICAgICBydW5CZWZvcmVGaW5kOiBmYWxzZSxcbiAgICAgIGF1dGg6IG1hc3Rlcihjb25maWcpLFxuICAgICAgY2xhc3NOYW1lOiAnX1Nlc3Npb24nLFxuICAgICAgcmVzdFdoZXJlOiB7IHNlc3Npb25Ub2tlbiB9LFxuICAgICAgcmVzdE9wdGlvbnMsXG4gICAgfSk7XG4gICAgcmVzdWx0cyA9IChhd2FpdCBxdWVyeS5leGVjdXRlKCkpLnJlc3VsdHM7XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0cyA9IChcbiAgICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5TZXNzaW9uKVxuICAgICAgICAubGltaXQoMSlcbiAgICAgICAgLmluY2x1ZGUoJ3VzZXInKVxuICAgICAgICAuZXF1YWxUbygnc2Vzc2lvblRva2VuJywgc2Vzc2lvblRva2VuKVxuICAgICAgICAuZmluZCh7IHVzZU1hc3RlcktleTogdHJ1ZSB9KVxuICAgICkubWFwKG9iaiA9PiBvYmoudG9KU09OKCkpO1xuICB9XG5cbiAgaWYgKHJlc3VsdHMubGVuZ3RoICE9PSAxIHx8ICFyZXN1bHRzWzBdWyd1c2VyJ10pIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9TRVNTSU9OX1RPS0VOLCAnSW52YWxpZCBzZXNzaW9uIHRva2VuJyk7XG4gIH1cbiAgY29uc3Qgc2Vzc2lvbiA9IHJlc3VsdHNbMF07XG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCksXG4gICAgZXhwaXJlc0F0ID0gc2Vzc2lvbi5leHBpcmVzQXQgPyBuZXcgRGF0ZShzZXNzaW9uLmV4cGlyZXNBdC5pc28pIDogdW5kZWZpbmVkO1xuICBpZiAoZXhwaXJlc0F0IDwgbm93KSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ1Nlc3Npb24gdG9rZW4gaXMgZXhwaXJlZC4nKTtcbiAgfVxuICBjb25zdCBvYmogPSBzZXNzaW9uLnVzZXI7XG4gIGRlbGV0ZSBvYmoucGFzc3dvcmQ7XG4gIG9ialsnY2xhc3NOYW1lJ10gPSAnX1VzZXInO1xuICBvYmpbJ3Nlc3Npb25Ub2tlbiddID0gc2Vzc2lvblRva2VuO1xuICBpZiAoY2FjaGVDb250cm9sbGVyKSB7XG4gICAgY2FjaGVDb250cm9sbGVyLnVzZXIucHV0KHNlc3Npb25Ub2tlbiwgb2JqKTtcbiAgfVxuICByZW5ld1Nlc3Npb25JZk5lZWRlZCh7IGNvbmZpZywgc2Vzc2lvbiwgc2Vzc2lvblRva2VuIH0pO1xuICBjb25zdCB1c2VyT2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKG9iaik7XG4gIHJldHVybiBuZXcgQXV0aCh7XG4gICAgY29uZmlnLFxuICAgIGNhY2hlQ29udHJvbGxlcixcbiAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgaW5zdGFsbGF0aW9uSWQsXG4gICAgdXNlcjogdXNlck9iamVjdCxcbiAgfSk7XG59O1xuXG52YXIgZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbiA9IGFzeW5jIGZ1bmN0aW9uICh7IGNvbmZpZywgc2Vzc2lvblRva2VuLCBpbnN0YWxsYXRpb25JZCB9KSB7XG4gIHZhciByZXN0T3B0aW9ucyA9IHtcbiAgICBsaW1pdDogMSxcbiAgfTtcbiAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgdmFyIHF1ZXJ5ID0gYXdhaXQgUmVzdFF1ZXJ5KHtcbiAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZ2V0LFxuICAgIGNvbmZpZyxcbiAgICBydW5CZWZvcmVGaW5kOiBmYWxzZSxcbiAgICBhdXRoOiBtYXN0ZXIoY29uZmlnKSxcbiAgICBjbGFzc05hbWU6ICdfVXNlcicsXG4gICAgcmVzdFdoZXJlOiB7IF9zZXNzaW9uX3Rva2VuOiBzZXNzaW9uVG9rZW4gfSxcbiAgICByZXN0T3B0aW9ucyxcbiAgfSk7XG4gIHJldHVybiBxdWVyeS5leGVjdXRlKCkudGhlbihyZXNwb25zZSA9PiB7XG4gICAgdmFyIHJlc3VsdHMgPSByZXNwb25zZS5yZXN1bHRzO1xuICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPT0gMSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfU0VTU0lPTl9UT0tFTiwgJ2ludmFsaWQgbGVnYWN5IHNlc3Npb24gdG9rZW4nKTtcbiAgICB9XG4gICAgY29uc3Qgb2JqID0gcmVzdWx0c1swXTtcbiAgICBvYmouY2xhc3NOYW1lID0gJ19Vc2VyJztcbiAgICBjb25zdCB1c2VyT2JqZWN0ID0gUGFyc2UuT2JqZWN0LmZyb21KU09OKG9iaik7XG4gICAgcmV0dXJuIG5ldyBBdXRoKHtcbiAgICAgIGNvbmZpZyxcbiAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgIGluc3RhbGxhdGlvbklkLFxuICAgICAgdXNlcjogdXNlck9iamVjdCxcbiAgICB9KTtcbiAgfSk7XG59O1xuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIGFuIGFycmF5IG9mIHJvbGUgbmFtZXNcbkF1dGgucHJvdG90eXBlLmdldFVzZXJSb2xlcyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHRoaXMuaXNNYXN0ZXIgfHwgdGhpcy5pc01haW50ZW5hbmNlIHx8ICF0aGlzLnVzZXIpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtdKTtcbiAgfVxuICBpZiAodGhpcy5mZXRjaGVkUm9sZXMpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMudXNlclJvbGVzKTtcbiAgfVxuICBpZiAodGhpcy5yb2xlUHJvbWlzZSkge1xuICAgIHJldHVybiB0aGlzLnJvbGVQcm9taXNlO1xuICB9XG4gIHRoaXMucm9sZVByb21pc2UgPSB0aGlzLl9sb2FkUm9sZXMoKTtcbiAgcmV0dXJuIHRoaXMucm9sZVByb21pc2U7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5nZXRSb2xlc0ZvclVzZXIgPSBhc3luYyBmdW5jdGlvbiAoKSB7XG4gIC8vU3RhY2sgYWxsIFBhcnNlLlJvbGVcbiAgY29uc3QgcmVzdWx0cyA9IFtdO1xuICBpZiAodGhpcy5jb25maWcpIHtcbiAgICBjb25zdCByZXN0V2hlcmUgPSB7XG4gICAgICB1c2Vyczoge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1VzZXInLFxuICAgICAgICBvYmplY3RJZDogdGhpcy51c2VyLmlkLFxuICAgICAgfSxcbiAgICB9O1xuICAgIGNvbnN0IFJlc3RRdWVyeSA9IHJlcXVpcmUoJy4vUmVzdFF1ZXJ5Jyk7XG4gICAgY29uc3QgcXVlcnkgPSBhd2FpdCBSZXN0UXVlcnkoe1xuICAgICAgbWV0aG9kOiBSZXN0UXVlcnkuTWV0aG9kLmZpbmQsXG4gICAgICBydW5CZWZvcmVGaW5kOiBmYWxzZSxcbiAgICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgICBhdXRoOiBtYXN0ZXIodGhpcy5jb25maWcpLFxuICAgICAgY2xhc3NOYW1lOiAnX1JvbGUnLFxuICAgICAgcmVzdFdoZXJlLFxuICAgIH0pO1xuICAgIGF3YWl0IHF1ZXJ5LmVhY2gocmVzdWx0ID0+IHJlc3VsdHMucHVzaChyZXN1bHQpKTtcbiAgfSBlbHNlIHtcbiAgICBhd2FpdCBuZXcgUGFyc2UuUXVlcnkoUGFyc2UuUm9sZSlcbiAgICAgIC5lcXVhbFRvKCd1c2VycycsIHRoaXMudXNlcilcbiAgICAgIC5lYWNoKHJlc3VsdCA9PiByZXN1bHRzLnB1c2gocmVzdWx0LnRvSlNPTigpKSwgeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH1cbiAgcmV0dXJuIHJlc3VsdHM7XG59O1xuXG4vLyBJdGVyYXRlcyB0aHJvdWdoIHRoZSByb2xlIHRyZWUgYW5kIGNvbXBpbGVzIGEgdXNlcidzIHJvbGVzXG5BdXRoLnByb3RvdHlwZS5fbG9hZFJvbGVzID0gYXN5bmMgZnVuY3Rpb24gKCkge1xuICBpZiAodGhpcy5jYWNoZUNvbnRyb2xsZXIpIHtcbiAgICBjb25zdCBjYWNoZWRSb2xlcyA9IGF3YWl0IHRoaXMuY2FjaGVDb250cm9sbGVyLnJvbGUuZ2V0KHRoaXMudXNlci5pZCk7XG4gICAgaWYgKGNhY2hlZFJvbGVzICE9IG51bGwpIHtcbiAgICAgIHRoaXMuZmV0Y2hlZFJvbGVzID0gdHJ1ZTtcbiAgICAgIHRoaXMudXNlclJvbGVzID0gY2FjaGVkUm9sZXM7XG4gICAgICByZXR1cm4gY2FjaGVkUm9sZXM7XG4gICAgfVxuICB9XG5cbiAgLy8gRmlyc3QgZ2V0IHRoZSByb2xlIGlkcyB0aGlzIHVzZXIgaXMgZGlyZWN0bHkgYSBtZW1iZXIgb2ZcbiAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuZ2V0Um9sZXNGb3JVc2VyKCk7XG4gIGlmICghcmVzdWx0cy5sZW5ndGgpIHtcbiAgICB0aGlzLnVzZXJSb2xlcyA9IFtdO1xuICAgIHRoaXMuZmV0Y2hlZFJvbGVzID0gdHJ1ZTtcbiAgICB0aGlzLnJvbGVQcm9taXNlID0gbnVsbDtcblxuICAgIHRoaXMuY2FjaGVSb2xlcygpO1xuICAgIHJldHVybiB0aGlzLnVzZXJSb2xlcztcbiAgfVxuXG4gIGNvbnN0IHJvbGVzTWFwID0gcmVzdWx0cy5yZWR1Y2UoXG4gICAgKG0sIHIpID0+IHtcbiAgICAgIG0ubmFtZXMucHVzaChyLm5hbWUpO1xuICAgICAgbS5pZHMucHVzaChyLm9iamVjdElkKTtcbiAgICAgIHJldHVybiBtO1xuICAgIH0sXG4gICAgeyBpZHM6IFtdLCBuYW1lczogW10gfVxuICApO1xuXG4gIC8vIHJ1biB0aGUgcmVjdXJzaXZlIGZpbmRpbmdcbiAgY29uc3Qgcm9sZU5hbWVzID0gYXdhaXQgdGhpcy5fZ2V0QWxsUm9sZXNOYW1lc0ZvclJvbGVJZHMocm9sZXNNYXAuaWRzLCByb2xlc01hcC5uYW1lcyk7XG4gIHRoaXMudXNlclJvbGVzID0gcm9sZU5hbWVzLm1hcChyID0+IHtcbiAgICByZXR1cm4gJ3JvbGU6JyArIHI7XG4gIH0pO1xuICB0aGlzLmZldGNoZWRSb2xlcyA9IHRydWU7XG4gIHRoaXMucm9sZVByb21pc2UgPSBudWxsO1xuICB0aGlzLmNhY2hlUm9sZXMoKTtcbiAgcmV0dXJuIHRoaXMudXNlclJvbGVzO1xufTtcblxuQXV0aC5wcm90b3R5cGUuY2FjaGVSb2xlcyA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKCF0aGlzLmNhY2hlQ29udHJvbGxlcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICB0aGlzLmNhY2hlQ29udHJvbGxlci5yb2xlLnB1dCh0aGlzLnVzZXIuaWQsIEFycmF5KC4uLnRoaXMudXNlclJvbGVzKSk7XG4gIHJldHVybiB0cnVlO1xufTtcblxuQXV0aC5wcm90b3R5cGUuY2xlYXJSb2xlQ2FjaGUgPSBmdW5jdGlvbiAoc2Vzc2lvblRva2VuKSB7XG4gIGlmICghdGhpcy5jYWNoZUNvbnRyb2xsZXIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIucm9sZS5kZWwodGhpcy51c2VyLmlkKTtcbiAgdGhpcy5jYWNoZUNvbnRyb2xsZXIudXNlci5kZWwoc2Vzc2lvblRva2VuKTtcbiAgcmV0dXJuIHRydWU7XG59O1xuXG5BdXRoLnByb3RvdHlwZS5nZXRSb2xlc0J5SWRzID0gYXN5bmMgZnVuY3Rpb24gKGlucykge1xuICBjb25zdCByZXN1bHRzID0gW107XG4gIC8vIEJ1aWxkIGFuIE9SIHF1ZXJ5IGFjcm9zcyBhbGwgcGFyZW50Um9sZXNcbiAgaWYgKCF0aGlzLmNvbmZpZykge1xuICAgIGF3YWl0IG5ldyBQYXJzZS5RdWVyeShQYXJzZS5Sb2xlKVxuICAgICAgLmNvbnRhaW5lZEluKFxuICAgICAgICAncm9sZXMnLFxuICAgICAgICBpbnMubWFwKGlkID0+IHtcbiAgICAgICAgICBjb25zdCByb2xlID0gbmV3IFBhcnNlLk9iamVjdChQYXJzZS5Sb2xlKTtcbiAgICAgICAgICByb2xlLmlkID0gaWQ7XG4gICAgICAgICAgcmV0dXJuIHJvbGU7XG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdC50b0pTT04oKSksIHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IHJvbGVzID0gaW5zLm1hcChpZCA9PiB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgY2xhc3NOYW1lOiAnX1JvbGUnLFxuICAgICAgICBvYmplY3RJZDogaWQsXG4gICAgICB9O1xuICAgIH0pO1xuICAgIGNvbnN0IHJlc3RXaGVyZSA9IHsgcm9sZXM6IHsgJGluOiByb2xlcyB9IH07XG4gICAgY29uc3QgUmVzdFF1ZXJ5ID0gcmVxdWlyZSgnLi9SZXN0UXVlcnknKTtcbiAgICBjb25zdCBxdWVyeSA9IGF3YWl0IFJlc3RRdWVyeSh7XG4gICAgICBtZXRob2Q6IFJlc3RRdWVyeS5NZXRob2QuZmluZCxcbiAgICAgIGNvbmZpZzogdGhpcy5jb25maWcsXG4gICAgICBydW5CZWZvcmVGaW5kOiBmYWxzZSxcbiAgICAgIGF1dGg6IG1hc3Rlcih0aGlzLmNvbmZpZyksXG4gICAgICBjbGFzc05hbWU6ICdfUm9sZScsXG4gICAgICByZXN0V2hlcmUsXG4gICAgfSk7XG4gICAgYXdhaXQgcXVlcnkuZWFjaChyZXN1bHQgPT4gcmVzdWx0cy5wdXNoKHJlc3VsdCkpO1xuICB9XG4gIHJldHVybiByZXN1bHRzO1xufTtcblxuLy8gR2l2ZW4gYSBsaXN0IG9mIHJvbGVJZHMsIGZpbmQgYWxsIHRoZSBwYXJlbnQgcm9sZXMsIHJldHVybnMgYSBwcm9taXNlIHdpdGggYWxsIG5hbWVzXG5BdXRoLnByb3RvdHlwZS5fZ2V0QWxsUm9sZXNOYW1lc0ZvclJvbGVJZHMgPSBmdW5jdGlvbiAocm9sZUlEcywgbmFtZXMgPSBbXSwgcXVlcmllZFJvbGVzID0ge30pIHtcbiAgY29uc3QgaW5zID0gcm9sZUlEcy5maWx0ZXIocm9sZUlEID0+IHtcbiAgICBjb25zdCB3YXNRdWVyaWVkID0gcXVlcmllZFJvbGVzW3JvbGVJRF0gIT09IHRydWU7XG4gICAgcXVlcmllZFJvbGVzW3JvbGVJRF0gPSB0cnVlO1xuICAgIHJldHVybiB3YXNRdWVyaWVkO1xuICB9KTtcblxuICAvLyBhbGwgcm9sZXMgYXJlIGFjY291bnRlZCBmb3IsIHJldHVybiB0aGUgbmFtZXNcbiAgaWYgKGlucy5sZW5ndGggPT0gMCkge1xuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoWy4uLm5ldyBTZXQobmFtZXMpXSk7XG4gIH1cblxuICByZXR1cm4gdGhpcy5nZXRSb2xlc0J5SWRzKGlucylcbiAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgIC8vIE5vdGhpbmcgZm91bmRcbiAgICAgIGlmICghcmVzdWx0cy5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShuYW1lcyk7XG4gICAgICB9XG4gICAgICAvLyBNYXAgdGhlIHJlc3VsdHMgd2l0aCBhbGwgSWRzIGFuZCBuYW1lc1xuICAgICAgY29uc3QgcmVzdWx0TWFwID0gcmVzdWx0cy5yZWR1Y2UoXG4gICAgICAgIChtZW1vLCByb2xlKSA9PiB7XG4gICAgICAgICAgbWVtby5uYW1lcy5wdXNoKHJvbGUubmFtZSk7XG4gICAgICAgICAgbWVtby5pZHMucHVzaChyb2xlLm9iamVjdElkKTtcbiAgICAgICAgICByZXR1cm4gbWVtbztcbiAgICAgICAgfSxcbiAgICAgICAgeyBpZHM6IFtdLCBuYW1lczogW10gfVxuICAgICAgKTtcbiAgICAgIC8vIHN0b3JlIHRoZSBuZXcgZm91bmQgbmFtZXNcbiAgICAgIG5hbWVzID0gbmFtZXMuY29uY2F0KHJlc3VsdE1hcC5uYW1lcyk7XG4gICAgICAvLyBmaW5kIHRoZSBuZXh0IG9uZXMsIGNpcmN1bGFyIHJvbGVzIHdpbGwgYmUgY3V0XG4gICAgICByZXR1cm4gdGhpcy5fZ2V0QWxsUm9sZXNOYW1lc0ZvclJvbGVJZHMocmVzdWx0TWFwLmlkcywgbmFtZXMsIHF1ZXJpZWRSb2xlcyk7XG4gICAgfSlcbiAgICAudGhlbihuYW1lcyA9PiB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFsuLi5uZXcgU2V0KG5hbWVzKV0pO1xuICAgIH0pO1xufTtcblxuY29uc3QgZmluZFVzZXJzV2l0aEF1dGhEYXRhID0gKGNvbmZpZywgYXV0aERhdGEpID0+IHtcbiAgY29uc3QgcHJvdmlkZXJzID0gT2JqZWN0LmtleXMoYXV0aERhdGEpO1xuICBjb25zdCBxdWVyeSA9IHByb3ZpZGVyc1xuICAgIC5yZWR1Y2UoKG1lbW8sIHByb3ZpZGVyKSA9PiB7XG4gICAgICBpZiAoIWF1dGhEYXRhW3Byb3ZpZGVyXSB8fCAoYXV0aERhdGEgJiYgIWF1dGhEYXRhW3Byb3ZpZGVyXS5pZCkpIHtcbiAgICAgICAgcmV0dXJuIG1lbW87XG4gICAgICB9XG4gICAgICBjb25zdCBxdWVyeUtleSA9IGBhdXRoRGF0YS4ke3Byb3ZpZGVyfS5pZGA7XG4gICAgICBjb25zdCBxdWVyeSA9IHt9O1xuICAgICAgcXVlcnlbcXVlcnlLZXldID0gYXV0aERhdGFbcHJvdmlkZXJdLmlkO1xuICAgICAgbWVtby5wdXNoKHF1ZXJ5KTtcbiAgICAgIHJldHVybiBtZW1vO1xuICAgIH0sIFtdKVxuICAgIC5maWx0ZXIocSA9PiB7XG4gICAgICByZXR1cm4gdHlwZW9mIHEgIT09ICd1bmRlZmluZWQnO1xuICAgIH0pO1xuXG4gIHJldHVybiBxdWVyeS5sZW5ndGggPiAwXG4gICAgPyBjb25maWcuZGF0YWJhc2UuZmluZCgnX1VzZXInLCB7ICRvcjogcXVlcnkgfSwgeyBsaW1pdDogMiB9KVxuICAgIDogUHJvbWlzZS5yZXNvbHZlKFtdKTtcbn07XG5cbmNvbnN0IGhhc011dGF0ZWRBdXRoRGF0YSA9IChhdXRoRGF0YSwgdXNlckF1dGhEYXRhKSA9PiB7XG4gIGlmICghdXNlckF1dGhEYXRhKSByZXR1cm4geyBoYXNNdXRhdGVkQXV0aERhdGE6IHRydWUsIG11dGF0ZWRBdXRoRGF0YTogYXV0aERhdGEgfTtcbiAgY29uc3QgbXV0YXRlZEF1dGhEYXRhID0ge307XG4gIE9iamVjdC5rZXlzKGF1dGhEYXRhKS5mb3JFYWNoKHByb3ZpZGVyID0+IHtcbiAgICAvLyBBbm9ueW1vdXMgcHJvdmlkZXIgaXMgbm90IGhhbmRsZWQgdGhpcyB3YXlcbiAgICBpZiAocHJvdmlkZXIgPT09ICdhbm9ueW1vdXMnKSByZXR1cm47XG4gICAgY29uc3QgcHJvdmlkZXJEYXRhID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgIGNvbnN0IHVzZXJQcm92aWRlckF1dGhEYXRhID0gdXNlckF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICBpZiAoIWlzRGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyRGF0YSwgdXNlclByb3ZpZGVyQXV0aERhdGEpKSB7XG4gICAgICBtdXRhdGVkQXV0aERhdGFbcHJvdmlkZXJdID0gcHJvdmlkZXJEYXRhO1xuICAgIH1cbiAgfSk7XG4gIGNvbnN0IGhhc011dGF0ZWRBdXRoRGF0YSA9IE9iamVjdC5rZXlzKG11dGF0ZWRBdXRoRGF0YSkubGVuZ3RoICE9PSAwO1xuICByZXR1cm4geyBoYXNNdXRhdGVkQXV0aERhdGEsIG11dGF0ZWRBdXRoRGF0YSB9O1xufTtcblxuY29uc3QgY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbiA9IChcbiAgcmVxID0ge30sXG4gIGF1dGhEYXRhID0ge30sXG4gIHVzZXJBdXRoRGF0YSA9IHt9LFxuICBjb25maWdcbikgPT4ge1xuICBjb25zdCBzYXZlZFVzZXJQcm92aWRlcnMgPSBPYmplY3Qua2V5cyh1c2VyQXV0aERhdGEpLm1hcChwcm92aWRlciA9PiAoe1xuICAgIG5hbWU6IHByb3ZpZGVyLFxuICAgIGFkYXB0ZXI6IGNvbmZpZy5hdXRoRGF0YU1hbmFnZXIuZ2V0VmFsaWRhdG9yRm9yUHJvdmlkZXIocHJvdmlkZXIpLmFkYXB0ZXIsXG4gIH0pKTtcblxuICBjb25zdCBoYXNQcm92aWRlZEFTb2xvUHJvdmlkZXIgPSBzYXZlZFVzZXJQcm92aWRlcnMuc29tZShcbiAgICBwcm92aWRlciA9PlxuICAgICAgcHJvdmlkZXIgJiYgcHJvdmlkZXIuYWRhcHRlciAmJiBwcm92aWRlci5hZGFwdGVyLnBvbGljeSA9PT0gJ3NvbG8nICYmIGF1dGhEYXRhW3Byb3ZpZGVyLm5hbWVdXG4gICk7XG5cbiAgLy8gU29sbyBwcm92aWRlcnMgY2FuIGJlIGNvbnNpZGVyZWQgYXMgc2FmZSwgc28gd2UgZG8gbm90IGhhdmUgdG8gY2hlY2sgaWYgdGhlIHVzZXIgbmVlZHNcbiAgLy8gdG8gcHJvdmlkZSBhbiBhZGRpdGlvbmFsIHByb3ZpZGVyIHRvIGxvZ2luLiBBbiBhdXRoIGFkYXB0ZXIgd2l0aCBcInNvbG9cIiAobGlrZSB3ZWJhdXRobikgbWVhbnNcbiAgLy8gbm8gXCJhZGRpdGlvbmFsXCIgYXV0aCBuZWVkcyB0byBiZSBwcm92aWRlZCB0byBsb2dpbiAobGlrZSBPVFAsIE1GQSlcbiAgaWYgKGhhc1Byb3ZpZGVkQVNvbG9Qcm92aWRlcikge1xuICAgIHJldHVybjtcbiAgfVxuXG4gIGNvbnN0IGFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQgPSBbXTtcbiAgY29uc3QgaGFzUHJvdmlkZWRBdExlYXN0T25lQWRkaXRpb25hbFByb3ZpZGVyID0gc2F2ZWRVc2VyUHJvdmlkZXJzLnNvbWUocHJvdmlkZXIgPT4ge1xuICAgIGxldCBwb2xpY3kgPSBwcm92aWRlci5hZGFwdGVyLnBvbGljeTtcbiAgICBpZiAodHlwZW9mIHBvbGljeSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgY29uc3QgcmVxdWVzdE9iamVjdCA9IHtcbiAgICAgICAgaXA6IHJlcS5jb25maWcuaXAsXG4gICAgICAgIHVzZXI6IHJlcS5hdXRoLnVzZXIsXG4gICAgICAgIG1hc3RlcjogcmVxLmF1dGguaXNNYXN0ZXIsXG4gICAgICB9O1xuICAgICAgcG9saWN5ID0gcG9saWN5LmNhbGwocHJvdmlkZXIuYWRhcHRlciwgcmVxdWVzdE9iamVjdCwgdXNlckF1dGhEYXRhW3Byb3ZpZGVyLm5hbWVdKTtcbiAgICB9XG4gICAgaWYgKHBvbGljeSA9PT0gJ2FkZGl0aW9uYWwnKSB7XG4gICAgICBpZiAoYXV0aERhdGFbcHJvdmlkZXIubmFtZV0pIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICAvLyBQdXNoIG1pc3NpbmcgcHJvdmlkZXIgZm9yIGVycm9yIG1lc3NhZ2VcbiAgICAgICAgYWRkaXRpb25Qcm92aWRlcnNOb3RGb3VuZC5wdXNoKHByb3ZpZGVyLm5hbWUpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG4gIGlmIChoYXNQcm92aWRlZEF0TGVhc3RPbmVBZGRpdGlvbmFsUHJvdmlkZXIgfHwgIWFkZGl0aW9uUHJvdmlkZXJzTm90Rm91bmQubGVuZ3RoKSB7XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgIFBhcnNlLkVycm9yLk9USEVSX0NBVVNFLFxuICAgIGBNaXNzaW5nIGFkZGl0aW9uYWwgYXV0aERhdGEgJHthZGRpdGlvblByb3ZpZGVyc05vdEZvdW5kLmpvaW4oJywnKX1gXG4gICk7XG59O1xuXG4vLyBWYWxpZGF0ZSBlYWNoIGF1dGhEYXRhIHN0ZXAtYnktc3RlcCBhbmQgcmV0dXJuIHRoZSBwcm92aWRlciByZXNwb25zZXNcbmNvbnN0IGhhbmRsZUF1dGhEYXRhVmFsaWRhdGlvbiA9IGFzeW5jIChhdXRoRGF0YSwgcmVxLCBmb3VuZFVzZXIpID0+IHtcbiAgbGV0IHVzZXI7XG4gIGlmIChmb3VuZFVzZXIpIHtcbiAgICB1c2VyID0gUGFyc2UuVXNlci5mcm9tSlNPTih7IGNsYXNzTmFtZTogJ19Vc2VyJywgLi4uZm91bmRVc2VyIH0pO1xuICAgIC8vIEZpbmQgdXNlciBieSBzZXNzaW9uIGFuZCBjdXJyZW50IG9iamVjdElkOyBvbmx5IHBhc3MgdXNlciBpZiBpdCdzIHRoZSBjdXJyZW50IHVzZXIgb3IgbWFzdGVyIGtleSBpcyBwcm92aWRlZFxuICB9IGVsc2UgaWYgKFxuICAgIChyZXEuYXV0aCAmJlxuICAgICAgcmVxLmF1dGgudXNlciAmJlxuICAgICAgdHlwZW9mIHJlcS5nZXRVc2VySWQgPT09ICdmdW5jdGlvbicgJiZcbiAgICAgIHJlcS5nZXRVc2VySWQoKSA9PT0gcmVxLmF1dGgudXNlci5pZCkgfHxcbiAgICAocmVxLmF1dGggJiYgcmVxLmF1dGguaXNNYXN0ZXIgJiYgdHlwZW9mIHJlcS5nZXRVc2VySWQgPT09ICdmdW5jdGlvbicgJiYgcmVxLmdldFVzZXJJZCgpKVxuICApIHtcbiAgICB1c2VyID0gbmV3IFBhcnNlLlVzZXIoKTtcbiAgICB1c2VyLmlkID0gcmVxLmF1dGguaXNNYXN0ZXIgPyByZXEuZ2V0VXNlcklkKCkgOiByZXEuYXV0aC51c2VyLmlkO1xuICAgIGF3YWl0IHVzZXIuZmV0Y2goeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH1cblxuICBjb25zdCB7IHVwZGF0ZWRPYmplY3QgfSA9IHJlcS5idWlsZFBhcnNlT2JqZWN0cygpO1xuICBjb25zdCByZXF1ZXN0T2JqZWN0ID0gZ2V0UmVxdWVzdE9iamVjdCh1bmRlZmluZWQsIHJlcS5hdXRoLCB1cGRhdGVkT2JqZWN0LCB1c2VyLCByZXEuY29uZmlnKTtcbiAgLy8gUGVyZm9ybSB2YWxpZGF0aW9uIGFzIHN0ZXAtYnktc3RlcCBwaXBlbGluZSBmb3IgYmV0dGVyIGVycm9yIGNvbnNpc3RlbmN5XG4gIC8vIGFuZCBhbHNvIHRvIGF2b2lkIHRvIHRyaWdnZXIgYSBwcm92aWRlciAobGlrZSBPVFAgU01TKSBpZiBhbm90aGVyIG9uZSBmYWlsc1xuICBjb25zdCBhY2MgPSB7IGF1dGhEYXRhOiB7fSwgYXV0aERhdGFSZXNwb25zZToge30gfTtcbiAgY29uc3QgYXV0aEtleXMgPSBPYmplY3Qua2V5cyhhdXRoRGF0YSkuc29ydCgpO1xuICBmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIGF1dGhLZXlzKSB7XG4gICAgbGV0IG1ldGhvZCA9ICcnO1xuICAgIHRyeSB7XG4gICAgICBpZiAoYXV0aERhdGFbcHJvdmlkZXJdID09PSBudWxsKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSBudWxsO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHsgdmFsaWRhdG9yIH0gPSByZXEuY29uZmlnLmF1dGhEYXRhTWFuYWdlci5nZXRWYWxpZGF0b3JGb3JQcm92aWRlcihwcm92aWRlcik7XG4gICAgICBjb25zdCBhdXRoUHJvdmlkZXIgPSAocmVxLmNvbmZpZy5hdXRoIHx8IHt9KVtwcm92aWRlcl0gfHwge307XG4gICAgICBpZiAoIXZhbGlkYXRvciB8fCBhdXRoUHJvdmlkZXIuZW5hYmxlZCA9PT0gZmFsc2UpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLlVOU1VQUE9SVEVEX1NFUlZJQ0UsXG4gICAgICAgICAgJ1RoaXMgYXV0aGVudGljYXRpb24gbWV0aG9kIGlzIHVuc3VwcG9ydGVkLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIGxldCB2YWxpZGF0aW9uUmVzdWx0ID0gYXdhaXQgdmFsaWRhdG9yKGF1dGhEYXRhW3Byb3ZpZGVyXSwgcmVxLCB1c2VyLCByZXF1ZXN0T2JqZWN0KTtcbiAgICAgIG1ldGhvZCA9IHZhbGlkYXRpb25SZXN1bHQgJiYgdmFsaWRhdGlvblJlc3VsdC5tZXRob2Q7XG4gICAgICByZXF1ZXN0T2JqZWN0LnRyaWdnZXJOYW1lID0gbWV0aG9kO1xuICAgICAgaWYgKHZhbGlkYXRpb25SZXN1bHQgJiYgdmFsaWRhdGlvblJlc3VsdC52YWxpZGF0b3IpIHtcbiAgICAgICAgdmFsaWRhdGlvblJlc3VsdCA9IGF3YWl0IHZhbGlkYXRpb25SZXN1bHQudmFsaWRhdG9yKCk7XG4gICAgICB9XG4gICAgICBpZiAoIXZhbGlkYXRpb25SZXN1bHQpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhW3Byb3ZpZGVyXSA9IGF1dGhEYXRhW3Byb3ZpZGVyXTtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoIU9iamVjdC5rZXlzKHZhbGlkYXRpb25SZXN1bHQpLmxlbmd0aCkge1xuICAgICAgICBhY2MuYXV0aERhdGFbcHJvdmlkZXJdID0gYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgaWYgKHZhbGlkYXRpb25SZXN1bHQucmVzcG9uc2UpIHtcbiAgICAgICAgYWNjLmF1dGhEYXRhUmVzcG9uc2VbcHJvdmlkZXJdID0gdmFsaWRhdGlvblJlc3VsdC5yZXNwb25zZTtcbiAgICAgIH1cbiAgICAgIC8vIFNvbWUgYXV0aCBwcm92aWRlcnMgYWZ0ZXIgaW5pdGlhbGl6YXRpb24gd2lsbCBhdm9pZCB0byByZXBsYWNlIGF1dGhEYXRhIGFscmVhZHkgc3RvcmVkXG4gICAgICBpZiAoIXZhbGlkYXRpb25SZXN1bHQuZG9Ob3RTYXZlKSB7XG4gICAgICAgIGFjYy5hdXRoRGF0YVtwcm92aWRlcl0gPSB2YWxpZGF0aW9uUmVzdWx0LnNhdmUgfHwgYXV0aERhdGFbcHJvdmlkZXJdO1xuICAgICAgfVxuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgY29uc3QgZSA9IHJlc29sdmVFcnJvcihlcnIsIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuU0NSSVBUX0ZBSUxFRCxcbiAgICAgICAgbWVzc2FnZTogJ0F1dGggZmFpbGVkLiBVbmtub3duIGVycm9yLicsXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IHVzZXJTdHJpbmcgPVxuICAgICAgICByZXEuYXV0aCAmJiByZXEuYXV0aC51c2VyID8gcmVxLmF1dGgudXNlci5pZCA6IHJlcS5kYXRhLm9iamVjdElkIHx8IHVuZGVmaW5lZDtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYEZhaWxlZCBydW5uaW5nIGF1dGggc3RlcCAke21ldGhvZH0gZm9yICR7cHJvdmlkZXJ9IGZvciB1c2VyICR7dXNlclN0cmluZ30gd2l0aCBFcnJvcjogYCArXG4gICAgICAgICAgSlNPTi5zdHJpbmdpZnkoZSksXG4gICAgICAgIHtcbiAgICAgICAgICBhdXRoZW50aWNhdGlvblN0ZXA6IG1ldGhvZCxcbiAgICAgICAgICBlcnJvcjogZSxcbiAgICAgICAgICB1c2VyOiB1c2VyU3RyaW5nLFxuICAgICAgICAgIHByb3ZpZGVyLFxuICAgICAgICB9XG4gICAgICApO1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFjYztcbn07XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBBdXRoLFxuICBtYXN0ZXIsXG4gIG1haW50ZW5hbmNlLFxuICBub2JvZHksXG4gIHJlYWRPbmx5LFxuICBnZXRBdXRoRm9yU2Vzc2lvblRva2VuLFxuICBnZXRBdXRoRm9yTGVnYWN5U2Vzc2lvblRva2VuLFxuICBmaW5kVXNlcnNXaXRoQXV0aERhdGEsXG4gIGhhc011dGF0ZWRBdXRoRGF0YSxcbiAgY2hlY2tJZlVzZXJIYXNQcm92aWRlZENvbmZpZ3VyZWRQcm92aWRlcnNGb3JMb2dpbixcbiAgaGFuZGxlQXV0aERhdGFWYWxpZGF0aW9uLFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFDQSxJQUFBQSxLQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxTQUFBLEdBQUFELE9BQUE7QUFDQSxJQUFBRSxPQUFBLEdBQUFGLE9BQUE7QUFDQSxJQUFBRyxVQUFBLEdBQUFDLHNCQUFBLENBQUFKLE9BQUE7QUFDQSxJQUFBSyxVQUFBLEdBQUFELHNCQUFBLENBQUFKLE9BQUE7QUFBb0MsU0FBQUksdUJBQUFFLEdBQUEsV0FBQUEsR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQUEsR0FBQUQsR0FBQSxLQUFBRSxPQUFBLEVBQUFGLEdBQUE7QUFBQSxTQUFBRyxRQUFBQyxDQUFBLEVBQUFDLENBQUEsUUFBQUMsQ0FBQSxHQUFBQyxNQUFBLENBQUFDLElBQUEsQ0FBQUosQ0FBQSxPQUFBRyxNQUFBLENBQUFFLHFCQUFBLFFBQUFDLENBQUEsR0FBQUgsTUFBQSxDQUFBRSxxQkFBQSxDQUFBTCxDQUFBLEdBQUFDLENBQUEsS0FBQUssQ0FBQSxHQUFBQSxDQUFBLENBQUFDLE1BQUEsV0FBQU4sQ0FBQSxXQUFBRSxNQUFBLENBQUFLLHdCQUFBLENBQUFSLENBQUEsRUFBQUMsQ0FBQSxFQUFBUSxVQUFBLE9BQUFQLENBQUEsQ0FBQVEsSUFBQSxDQUFBQyxLQUFBLENBQUFULENBQUEsRUFBQUksQ0FBQSxZQUFBSixDQUFBO0FBQUEsU0FBQVUsY0FBQVosQ0FBQSxhQUFBQyxDQUFBLE1BQUFBLENBQUEsR0FBQVksU0FBQSxDQUFBQyxNQUFBLEVBQUFiLENBQUEsVUFBQUMsQ0FBQSxXQUFBVyxTQUFBLENBQUFaLENBQUEsSUFBQVksU0FBQSxDQUFB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