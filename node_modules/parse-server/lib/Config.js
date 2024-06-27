"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.Config = void 0;
var _lodash = require("lodash");
var _net = _interopRequireDefault(require("net"));
var _cache = _interopRequireDefault(require("./cache"));
var _DatabaseController = _interopRequireDefault(require("./Controllers/DatabaseController"));
var _LoggerController = require("./Controllers/LoggerController");
var _package = require("../package.json");
var _Definitions = require("./Options/Definitions");
var _Parse = _interopRequireDefault(require("./cloud-code/Parse.Server"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
// A Config object provides information about how a specific app is
// configured.
// mount is the URL for the root of the API; includes http, domain, etc.

function removeTrailingSlash(str) {
  if (!str) {
    return str;
  }
  if (str.endsWith('/')) {
    str = str.substring(0, str.length - 1);
  }
  return str;
}
class Config {
  static get(applicationId, mount) {
    const cacheInfo = _cache.default.get(applicationId);
    if (!cacheInfo) {
      return;
    }
    const config = new Config();
    config.applicationId = applicationId;
    Object.keys(cacheInfo).forEach(key => {
      if (key == 'databaseController') {
        config.database = new _DatabaseController.default(cacheInfo.databaseController.adapter, config);
      } else {
        config[key] = cacheInfo[key];
      }
    });
    config.mount = removeTrailingSlash(mount);
    config.generateSessionExpiresAt = config.generateSessionExpiresAt.bind(config);
    config.generateEmailVerifyTokenExpiresAt = config.generateEmailVerifyTokenExpiresAt.bind(config);
    config.version = _package.version;
    return config;
  }
  static put(serverConfiguration) {
    Config.validateOptions(serverConfiguration);
    Config.validateControllers(serverConfiguration);
    _cache.default.put(serverConfiguration.appId, serverConfiguration);
    Config.setupPasswordValidator(serverConfiguration.passwordPolicy);
    return serverConfiguration;
  }
  static validateOptions({
    publicServerURL,
    revokeSessionOnPasswordReset,
    expireInactiveSessions,
    sessionLength,
    defaultLimit,
    maxLimit,
    accountLockout,
    passwordPolicy,
    masterKeyIps,
    masterKey,
    maintenanceKey,
    maintenanceKeyIps,
    readOnlyMasterKey,
    allowHeaders,
    idempotencyOptions,
    fileUpload,
    pages,
    security,
    enforcePrivateUsers,
    schema,
    requestKeywordDenylist,
    allowExpiredAuthDataToken,
    logLevels,
    rateLimit,
    databaseOptions,
    extendSessionOnUse,
    allowClientClassCreation
  }) {
    if (masterKey === readOnlyMasterKey) {
      throw new Error('masterKey and readOnlyMasterKey should be different');
    }
    if (masterKey === maintenanceKey) {
      throw new Error('masterKey and maintenanceKey should be different');
    }
    this.validateAccountLockoutPolicy(accountLockout);
    this.validatePasswordPolicy(passwordPolicy);
    this.validateFileUploadOptions(fileUpload);
    if (typeof revokeSessionOnPasswordReset !== 'boolean') {
      throw 'revokeSessionOnPasswordReset must be a boolean value';
    }
    if (typeof extendSessionOnUse !== 'boolean') {
      throw 'extendSessionOnUse must be a boolean value';
    }
    if (publicServerURL) {
      if (!publicServerURL.startsWith('http://') && !publicServerURL.startsWith('https://')) {
        throw 'publicServerURL should be a valid HTTPS URL starting with https://';
      }
    }
    this.validateSessionConfiguration(sessionLength, expireInactiveSessions);
    this.validateIps('masterKeyIps', masterKeyIps);
    this.validateIps('maintenanceKeyIps', maintenanceKeyIps);
    this.validateDefaultLimit(defaultLimit);
    this.validateMaxLimit(maxLimit);
    this.validateAllowHeaders(allowHeaders);
    this.validateIdempotencyOptions(idempotencyOptions);
    this.validatePagesOptions(pages);
    this.validateSecurityOptions(security);
    this.validateSchemaOptions(schema);
    this.validateEnforcePrivateUsers(enforcePrivateUsers);
    this.validateAllowExpiredAuthDataToken(allowExpiredAuthDataToken);
    this.validateRequestKeywordDenylist(requestKeywordDenylist);
    this.validateRateLimit(rateLimit);
    this.validateLogLevels(logLevels);
    this.validateDatabaseOptions(databaseOptions);
    this.validateAllowClientClassCreation(allowClientClassCreation);
  }
  static validateControllers({
    verifyUserEmails,
    userController,
    appName,
    publicServerURL,
    emailVerifyTokenValidityDuration,
    emailVerifyTokenReuseIfValid
  }) {
    const emailAdapter = userController.adapter;
    if (verifyUserEmails) {
      this.validateEmailConfiguration({
        emailAdapter,
        appName,
        publicServerURL,
        emailVerifyTokenValidityDuration,
        emailVerifyTokenReuseIfValid
      });
    }
  }
  static validateRequestKeywordDenylist(requestKeywordDenylist) {
    if (requestKeywordDenylist === undefined) {
      requestKeywordDenylist = requestKeywordDenylist.default;
    } else if (!Array.isArray(requestKeywordDenylist)) {
      throw 'Parse Server option requestKeywordDenylist must be an array.';
    }
  }
  static validateEnforcePrivateUsers(enforcePrivateUsers) {
    if (typeof enforcePrivateUsers !== 'boolean') {
      throw 'Parse Server option enforcePrivateUsers must be a boolean.';
    }
  }
  static validateAllowExpiredAuthDataToken(allowExpiredAuthDataToken) {
    if (typeof allowExpiredAuthDataToken !== 'boolean') {
      throw 'Parse Server option allowExpiredAuthDataToken must be a boolean.';
    }
  }
  static validateAllowClientClassCreation(allowClientClassCreation) {
    if (typeof allowClientClassCreation !== 'boolean') {
      throw 'Parse Server option allowClientClassCreation must be a boolean.';
    }
  }
  static validateSecurityOptions(security) {
    if (Object.prototype.toString.call(security) !== '[object Object]') {
      throw 'Parse Server option security must be an object.';
    }
    if (security.enableCheck === undefined) {
      security.enableCheck = _Definitions.SecurityOptions.enableCheck.default;
    } else if (!(0, _lodash.isBoolean)(security.enableCheck)) {
      throw 'Parse Server option security.enableCheck must be a boolean.';
    }
    if (security.enableCheckLog === undefined) {
      security.enableCheckLog = _Definitions.SecurityOptions.enableCheckLog.default;
    } else if (!(0, _lodash.isBoolean)(security.enableCheckLog)) {
      throw 'Parse Server option security.enableCheckLog must be a boolean.';
    }
  }
  static validateSchemaOptions(schema) {
    if (!schema) return;
    if (Object.prototype.toString.call(schema) !== '[object Object]') {
      throw 'Parse Server option schema must be an object.';
    }
    if (schema.definitions === undefined) {
      schema.definitions = _Definitions.SchemaOptions.definitions.default;
    } else if (!Array.isArray(schema.definitions)) {
      throw 'Parse Server option schema.definitions must be an array.';
    }
    if (schema.strict === undefined) {
      schema.strict = _Definitions.SchemaOptions.strict.default;
    } else if (!(0, _lodash.isBoolean)(schema.strict)) {
      throw 'Parse Server option schema.strict must be a boolean.';
    }
    if (schema.deleteExtraFields === undefined) {
      schema.deleteExtraFields = _Definitions.SchemaOptions.deleteExtraFields.default;
    } else if (!(0, _lodash.isBoolean)(schema.deleteExtraFields)) {
      throw 'Parse Server option schema.deleteExtraFields must be a boolean.';
    }
    if (schema.recreateModifiedFields === undefined) {
      schema.recreateModifiedFields = _Definitions.SchemaOptions.recreateModifiedFields.default;
    } else if (!(0, _lodash.isBoolean)(schema.recreateModifiedFields)) {
      throw 'Parse Server option schema.recreateModifiedFields must be a boolean.';
    }
    if (schema.lockSchemas === undefined) {
      schema.lockSchemas = _Definitions.SchemaOptions.lockSchemas.default;
    } else if (!(0, _lodash.isBoolean)(schema.lockSchemas)) {
      throw 'Parse Server option schema.lockSchemas must be a boolean.';
    }
    if (schema.beforeMigration === undefined) {
      schema.beforeMigration = null;
    } else if (schema.beforeMigration !== null && typeof schema.beforeMigration !== 'function') {
      throw 'Parse Server option schema.beforeMigration must be a function.';
    }
    if (schema.afterMigration === undefined) {
      schema.afterMigration = null;
    } else if (schema.afterMigration !== null && typeof schema.afterMigration !== 'function') {
      throw 'Parse Server option schema.afterMigration must be a function.';
    }
  }
  static validatePagesOptions(pages) {
    if (Object.prototype.toString.call(pages) !== '[object Object]') {
      throw 'Parse Server option pages must be an object.';
    }
    if (pages.enableRouter === undefined) {
      pages.enableRouter = _Definitions.PagesOptions.enableRouter.default;
    } else if (!(0, _lodash.isBoolean)(pages.enableRouter)) {
      throw 'Parse Server option pages.enableRouter must be a boolean.';
    }
    if (pages.enableLocalization === undefined) {
      pages.enableLocalization = _Definitions.PagesOptions.enableLocalization.default;
    } else if (!(0, _lodash.isBoolean)(pages.enableLocalization)) {
      throw 'Parse Server option pages.enableLocalization must be a boolean.';
    }
    if (pages.localizationJsonPath === undefined) {
      pages.localizationJsonPath = _Definitions.PagesOptions.localizationJsonPath.default;
    } else if (!(0, _lodash.isString)(pages.localizationJsonPath)) {
      throw 'Parse Server option pages.localizationJsonPath must be a string.';
    }
    if (pages.localizationFallbackLocale === undefined) {
      pages.localizationFallbackLocale = _Definitions.PagesOptions.localizationFallbackLocale.default;
    } else if (!(0, _lodash.isString)(pages.localizationFallbackLocale)) {
      throw 'Parse Server option pages.localizationFallbackLocale must be a string.';
    }
    if (pages.placeholders === undefined) {
      pages.placeholders = _Definitions.PagesOptions.placeholders.default;
    } else if (Object.prototype.toString.call(pages.placeholders) !== '[object Object]' && typeof pages.placeholders !== 'function') {
      throw 'Parse Server option pages.placeholders must be an object or a function.';
    }
    if (pages.forceRedirect === undefined) {
      pages.forceRedirect = _Definitions.PagesOptions.forceRedirect.default;
    } else if (!(0, _lodash.isBoolean)(pages.forceRedirect)) {
      throw 'Parse Server option pages.forceRedirect must be a boolean.';
    }
    if (pages.pagesPath === undefined) {
      pages.pagesPath = _Definitions.PagesOptions.pagesPath.default;
    } else if (!(0, _lodash.isString)(pages.pagesPath)) {
      throw 'Parse Server option pages.pagesPath must be a string.';
    }
    if (pages.pagesEndpoint === undefined) {
      pages.pagesEndpoint = _Definitions.PagesOptions.pagesEndpoint.default;
    } else if (!(0, _lodash.isString)(pages.pagesEndpoint)) {
      throw 'Parse Server option pages.pagesEndpoint must be a string.';
    }
    if (pages.customUrls === undefined) {
      pages.customUrls = _Definitions.PagesOptions.customUrls.default;
    } else if (Object.prototype.toString.call(pages.customUrls) !== '[object Object]') {
      throw 'Parse Server option pages.customUrls must be an object.';
    }
    if (pages.customRoutes === undefined) {
      pages.customRoutes = _Definitions.PagesOptions.customRoutes.default;
    } else if (!(pages.customRoutes instanceof Array)) {
      throw 'Parse Server option pages.customRoutes must be an array.';
    }
  }
  static validateIdempotencyOptions(idempotencyOptions) {
    if (!idempotencyOptions) {
      return;
    }
    if (idempotencyOptions.ttl === undefined) {
      idempotencyOptions.ttl = _Definitions.IdempotencyOptions.ttl.default;
    } else if (!isNaN(idempotencyOptions.ttl) && idempotencyOptions.ttl <= 0) {
      throw 'idempotency TTL value must be greater than 0 seconds';
    } else if (isNaN(idempotencyOptions.ttl)) {
      throw 'idempotency TTL value must be a number';
    }
    if (!idempotencyOptions.paths) {
      idempotencyOptions.paths = _Definitions.IdempotencyOptions.paths.default;
    } else if (!(idempotencyOptions.paths instanceof Array)) {
      throw 'idempotency paths must be of an array of strings';
    }
  }
  static validateAccountLockoutPolicy(accountLockout) {
    if (accountLockout) {
      if (typeof accountLockout.duration !== 'number' || accountLockout.duration <= 0 || accountLockout.duration > 99999) {
        throw 'Account lockout duration should be greater than 0 and less than 100000';
      }
      if (!Number.isInteger(accountLockout.threshold) || accountLockout.threshold < 1 || accountLockout.threshold > 999) {
        throw 'Account lockout threshold should be an integer greater than 0 and less than 1000';
      }
      if (accountLockout.unlockOnPasswordReset === undefined) {
        accountLockout.unlockOnPasswordReset = _Definitions.AccountLockoutOptions.unlockOnPasswordReset.default;
      } else if (!(0, _lodash.isBoolean)(accountLockout.unlockOnPasswordReset)) {
        throw 'Parse Server option accountLockout.unlockOnPasswordReset must be a boolean.';
      }
    }
  }
  static validatePasswordPolicy(passwordPolicy) {
    if (passwordPolicy) {
      if (passwordPolicy.maxPasswordAge !== undefined && (typeof passwordPolicy.maxPasswordAge !== 'number' || passwordPolicy.maxPasswordAge < 0)) {
        throw 'passwordPolicy.maxPasswordAge must be a positive number';
      }
      if (passwordPolicy.resetTokenValidityDuration !== undefined && (typeof passwordPolicy.resetTokenValidityDuration !== 'number' || passwordPolicy.resetTokenValidityDuration <= 0)) {
        throw 'passwordPolicy.resetTokenValidityDuration must be a positive number';
      }
      if (passwordPolicy.validatorPattern) {
        if (typeof passwordPolicy.validatorPattern === 'string') {
          passwordPolicy.validatorPattern = new RegExp(passwordPolicy.validatorPattern);
        } else if (!(passwordPolicy.validatorPattern instanceof RegExp)) {
          throw 'passwordPolicy.validatorPattern must be a regex string or RegExp object.';
        }
      }
      if (passwordPolicy.validatorCallback && typeof passwordPolicy.validatorCallback !== 'function') {
        throw 'passwordPolicy.validatorCallback must be a function.';
      }
      if (passwordPolicy.doNotAllowUsername && typeof passwordPolicy.doNotAllowUsername !== 'boolean') {
        throw 'passwordPolicy.doNotAllowUsername must be a boolean value.';
      }
      if (passwordPolicy.maxPasswordHistory && (!Number.isInteger(passwordPolicy.maxPasswordHistory) || passwordPolicy.maxPasswordHistory <= 0 || passwordPolicy.maxPasswordHistory > 20)) {
        throw 'passwordPolicy.maxPasswordHistory must be an integer ranging 0 - 20';
      }
      if (passwordPolicy.resetTokenReuseIfValid && typeof passwordPolicy.resetTokenReuseIfValid !== 'boolean') {
        throw 'resetTokenReuseIfValid must be a boolean value';
      }
      if (passwordPolicy.resetTokenReuseIfValid && !passwordPolicy.resetTokenValidityDuration) {
        throw 'You cannot use resetTokenReuseIfValid without resetTokenValidityDuration';
      }
      if (passwordPolicy.resetPasswordSuccessOnInvalidEmail && typeof passwordPolicy.resetPasswordSuccessOnInvalidEmail !== 'boolean') {
        throw 'resetPasswordSuccessOnInvalidEmail must be a boolean value';
      }
    }
  }

  // if the passwordPolicy.validatorPattern is configured then setup a callback to process the pattern
  static setupPasswordValidator(passwordPolicy) {
    if (passwordPolicy && passwordPolicy.validatorPattern) {
      passwordPolicy.patternValidator = value => {
        return passwordPolicy.validatorPattern.test(value);
      };
    }
  }
  static validateEmailConfiguration({
    emailAdapter,
    appName,
    publicServerURL,
    emailVerifyTokenValidityDuration,
    emailVerifyTokenReuseIfValid
  }) {
    if (!emailAdapter) {
      throw 'An emailAdapter is required for e-mail verification and password resets.';
    }
    if (typeof appName !== 'string') {
      throw 'An app name is required for e-mail verification and password resets.';
    }
    if (typeof publicServerURL !== 'string') {
      throw 'A public server url is required for e-mail verification and password resets.';
    }
    if (emailVerifyTokenValidityDuration) {
      if (isNaN(emailVerifyTokenValidityDuration)) {
        throw 'Email verify token validity duration must be a valid number.';
      } else if (emailVerifyTokenValidityDuration <= 0) {
        throw 'Email verify token validity duration must be a value greater than 0.';
      }
    }
    if (emailVerifyTokenReuseIfValid && typeof emailVerifyTokenReuseIfValid !== 'boolean') {
      throw 'emailVerifyTokenReuseIfValid must be a boolean value';
    }
    if (emailVerifyTokenReuseIfValid && !emailVerifyTokenValidityDuration) {
      throw 'You cannot use emailVerifyTokenReuseIfValid without emailVerifyTokenValidityDuration';
    }
  }
  static validateFileUploadOptions(fileUpload) {
    try {
      if (fileUpload == null || typeof fileUpload !== 'object' || fileUpload instanceof Array) {
        throw 'fileUpload must be an object value.';
      }
    } catch (e) {
      if (e instanceof ReferenceError) {
        return;
      }
      throw e;
    }
    if (fileUpload.enableForAnonymousUser === undefined) {
      fileUpload.enableForAnonymousUser = _Definitions.FileUploadOptions.enableForAnonymousUser.default;
    } else if (typeof fileUpload.enableForAnonymousUser !== 'boolean') {
      throw 'fileUpload.enableForAnonymousUser must be a boolean value.';
    }
    if (fileUpload.enableForPublic === undefined) {
      fileUpload.enableForPublic = _Definitions.FileUploadOptions.enableForPublic.default;
    } else if (typeof fileUpload.enableForPublic !== 'boolean') {
      throw 'fileUpload.enableForPublic must be a boolean value.';
    }
    if (fileUpload.enableForAuthenticatedUser === undefined) {
      fileUpload.enableForAuthenticatedUser = _Definitions.FileUploadOptions.enableForAuthenticatedUser.default;
    } else if (typeof fileUpload.enableForAuthenticatedUser !== 'boolean') {
      throw 'fileUpload.enableForAuthenticatedUser must be a boolean value.';
    }
    if (fileUpload.fileExtensions === undefined) {
      fileUpload.fileExtensions = _Definitions.FileUploadOptions.fileExtensions.default;
    } else if (!Array.isArray(fileUpload.fileExtensions)) {
      throw 'fileUpload.fileExtensions must be an array.';
    }
  }
  static validateIps(field, masterKeyIps) {
    for (let ip of masterKeyIps) {
      if (ip.includes('/')) {
        ip = ip.split('/')[0];
      }
      if (!_net.default.isIP(ip)) {
        throw `The Parse Server option "${field}" contains an invalid IP address "${ip}".`;
      }
    }
  }
  get mount() {
    var mount = this._mount;
    if (this.publicServerURL) {
      mount = this.publicServerURL;
    }
    return mount;
  }
  set mount(newValue) {
    this._mount = newValue;
  }
  static validateSessionConfiguration(sessionLength, expireInactiveSessions) {
    if (expireInactiveSessions) {
      if (isNaN(sessionLength)) {
        throw 'Session length must be a valid number.';
      } else if (sessionLength <= 0) {
        throw 'Session length must be a value greater than 0.';
      }
    }
  }
  static validateDefaultLimit(defaultLimit) {
    if (defaultLimit == null) {
      defaultLimit = _Definitions.ParseServerOptions.defaultLimit.default;
    }
    if (typeof defaultLimit !== 'number') {
      throw 'Default limit must be a number.';
    }
    if (defaultLimit <= 0) {
      throw 'Default limit must be a value greater than 0.';
    }
  }
  static validateMaxLimit(maxLimit) {
    if (maxLimit <= 0) {
      throw 'Max limit must be a value greater than 0.';
    }
  }
  static validateAllowHeaders(allowHeaders) {
    if (![null, undefined].includes(allowHeaders)) {
      if (Array.isArray(allowHeaders)) {
        allowHeaders.forEach(header => {
          if (typeof header !== 'string') {
            throw 'Allow headers must only contain strings';
          } else if (!header.trim().length) {
            throw 'Allow headers must not contain empty strings';
          }
        });
      } else {
        throw 'Allow headers must be an array';
      }
    }
  }
  static validateLogLevels(logLevels) {
    for (const key of Object.keys(_Definitions.LogLevels)) {
      if (logLevels[key]) {
        if (_LoggerController.logLevels.indexOf(logLevels[key]) === -1) {
          throw `'${key}' must be one of ${JSON.stringify(_LoggerController.logLevels)}`;
        }
      } else {
        logLevels[key] = _Definitions.LogLevels[key].default;
      }
    }
  }
  static validateDatabaseOptions(databaseOptions) {
    if (databaseOptions == undefined) {
      return;
    }
    if (Object.prototype.toString.call(databaseOptions) !== '[object Object]') {
      throw `databaseOptions must be an object`;
    }
    if (databaseOptions.enableSchemaHooks === undefined) {
      databaseOptions.enableSchemaHooks = _Definitions.DatabaseOptions.enableSchemaHooks.default;
    } else if (typeof databaseOptions.enableSchemaHooks !== 'boolean') {
      throw `databaseOptions.enableSchemaHooks must be a boolean`;
    }
    if (databaseOptions.schemaCacheTtl === undefined) {
      databaseOptions.schemaCacheTtl = _Definitions.DatabaseOptions.schemaCacheTtl.default;
    } else if (typeof databaseOptions.schemaCacheTtl !== 'number') {
      throw `databaseOptions.schemaCacheTtl must be a number`;
    }
  }
  static validateRateLimit(rateLimit) {
    if (!rateLimit) {
      return;
    }
    if (Object.prototype.toString.call(rateLimit) !== '[object Object]' && !Array.isArray(rateLimit)) {
      throw `rateLimit must be an array or object`;
    }
    const options = Array.isArray(rateLimit) ? rateLimit : [rateLimit];
    for (const option of options) {
      if (Object.prototype.toString.call(option) !== '[object Object]') {
        throw `rateLimit must be an array of objects`;
      }
      if (option.requestPath == null) {
        throw `rateLimit.requestPath must be defined`;
      }
      if (typeof option.requestPath !== 'string') {
        throw `rateLimit.requestPath must be a string`;
      }
      if (option.requestTimeWindow == null) {
        throw `rateLimit.requestTimeWindow must be defined`;
      }
      if (typeof option.requestTimeWindow !== 'number') {
        throw `rateLimit.requestTimeWindow must be a number`;
      }
      if (option.includeInternalRequests && typeof option.includeInternalRequests !== 'boolean') {
        throw `rateLimit.includeInternalRequests must be a boolean`;
      }
      if (option.requestCount == null) {
        throw `rateLimit.requestCount must be defined`;
      }
      if (typeof option.requestCount !== 'number') {
        throw `rateLimit.requestCount must be a number`;
      }
      if (option.errorResponseMessage && typeof option.errorResponseMessage !== 'string') {
        throw `rateLimit.errorResponseMessage must be a string`;
      }
      const options = Object.keys(_Parse.default.RateLimitZone);
      if (option.zone && !options.includes(option.zone)) {
        const formatter = new Intl.ListFormat('en', {
          style: 'short',
          type: 'disjunction'
        });
        throw `rateLimit.zone must be one of ${formatter.format(options)}`;
      }
    }
  }
  generateEmailVerifyTokenExpiresAt() {
    if (!this.verifyUserEmails || !this.emailVerifyTokenValidityDuration) {
      return undefined;
    }
    var now = new Date();
    return new Date(now.getTime() + this.emailVerifyTokenValidityDuration * 1000);
  }
  generatePasswordResetTokenExpiresAt() {
    if (!this.passwordPolicy || !this.passwordPolicy.resetTokenValidityDuration) {
      return undefined;
    }
    const now = new Date();
    return new Date(now.getTime() + this.passwordPolicy.resetTokenValidityDuration * 1000);
  }
  generateSessionExpiresAt() {
    if (!this.expireInactiveSessions) {
      return undefined;
    }
    var now = new Date();
    return new Date(now.getTime() + this.sessionLength * 1000);
  }
  unregisterRateLimiters() {
    var _this$rateLimits;
    let i = (_this$rateLimits = this.rateLimits) === null || _this$rateLimits === void 0 ? void 0 : _this$rateLimits.length;
    while (i--) {
      const limit = this.rateLimits[i];
      if (limit.cloud) {
        this.rateLimits.splice(i, 1);
      }
    }
  }
  get invalidLinkURL() {
    return this.customPages.invalidLink || `${this.publicServerURL}/apps/invalid_link.html`;
  }
  get invalidVerificationLinkURL() {
    return this.customPages.invalidVerificationLink || `${this.publicServerURL}/apps/invalid_verification_link.html`;
  }
  get linkSendSuccessURL() {
    return this.customPages.linkSendSuccess || `${this.publicServerURL}/apps/link_send_success.html`;
  }
  get linkSendFailURL() {
    return this.customPages.linkSendFail || `${this.publicServerURL}/apps/link_send_fail.html`;
  }
  get verifyEmailSuccessURL() {
    return this.customPages.verifyEmailSuccess || `${this.publicServerURL}/apps/verify_email_success.html`;
  }
  get choosePasswordURL() {
    return this.customPages.choosePassword || `${this.publicServerURL}/apps/choose_password`;
  }
  get requestResetPasswordURL() {
    return `${this.publicServerURL}/${this.pagesEndpoint}/${this.applicationId}/request_password_reset`;
  }
  get passwordResetSuccessURL() {
    return this.customPages.passwordResetSuccess || `${this.publicServerURL}/apps/password_reset_success.html`;
  }
  get parseFrameURL() {
    return this.customPages.parseFrameURL;
  }
  get verifyEmailURL() {
    return `${this.publicServerURL}/${this.pagesEndpoint}/${this.applicationId}/verify_email`;
  }

  // TODO: Remove this function once PagesRouter replaces the PublicAPIRouter;
  // the (default) endpoint has to be defined in PagesRouter only.
  get pagesEndpoint() {
    return this.pages && this.pages.enableRouter && this.pages.pagesEndpoint ? this.pages.pagesEndpoint : 'apps';
  }
}
exports.Config = Config;
var _default = exports.default = Config;
module.exports = Config;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9kYXNoIiwicmVxdWlyZSIsIl9uZXQiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX2NhY2hlIiwiX0RhdGFiYXNlQ29udHJvbGxlciIsIl9Mb2dnZXJDb250cm9sbGVyIiwiX3BhY2thZ2UiLCJfRGVmaW5pdGlvbnMiLCJfUGFyc2UiLCJvYmoiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsInJlbW92ZVRyYWlsaW5nU2xhc2giLCJzdHIiLCJlbmRzV2l0aCIsInN1YnN0cmluZyIsImxlbmd0aCIsIkNvbmZpZyIsImdldCIsImFwcGxpY2F0aW9uSWQiLCJtb3VudCIsImNhY2hlSW5mbyIsIkFwcENhY2hlIiwiY29uZmlnIiwiT2JqZWN0Iiwia2V5cyIsImZvckVhY2giLCJrZXkiLCJkYXRhYmFzZSIsIkRhdGFiYXNlQ29udHJvbGxlciIsImRhdGFiYXNlQ29udHJvbGxlciIsImFkYXB0ZXIiLCJnZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQiLCJiaW5kIiwiZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0IiwidmVyc2lvbiIsInB1dCIsInNlcnZlckNvbmZpZ3VyYXRpb24iLCJ2YWxpZGF0ZU9wdGlvbnMiLCJ2YWxpZGF0ZUNvbnRyb2xsZXJzIiwiYXBwSWQiLCJzZXR1cFBhc3N3b3JkVmFsaWRhdG9yIiwicGFzc3dvcmRQb2xpY3kiLCJwdWJsaWNTZXJ2ZXJVUkwiLCJyZXZva2VTZXNzaW9uT25QYXNzd29yZFJlc2V0IiwiZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyIsInNlc3Npb25MZW5ndGgiLCJkZWZhdWx0TGltaXQiLCJtYXhMaW1pdCIsImFjY291bnRMb2Nrb3V0IiwibWFzdGVyS2V5SXBzIiwibWFzdGVyS2V5IiwibWFpbnRlbmFuY2VLZXkiLCJtYWludGVuYW5jZUtleUlwcyIsInJlYWRPbmx5TWFzdGVyS2V5IiwiYWxsb3dIZWFkZXJzIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwiZmlsZVVwbG9hZCIsInBhZ2VzIiwic2VjdXJpdHkiLCJlbmZvcmNlUHJpdmF0ZVVzZXJzIiwic2NoZW1hIiwicmVxdWVzdEtleXdvcmREZW55bGlzdCIsImFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4iLCJsb2dMZXZlbHMiLCJyYXRlTGltaXQiLCJkYXRhYmFzZU9wdGlvbnMiLCJleHRlbmRTZXNzaW9uT25Vc2UiLCJhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24iLCJFcnJvciIsInZhbGlkYXRlQWNjb3VudExvY2tvdXRQb2xpY3kiLCJ2YWxpZGF0ZVBhc3N3b3JkUG9saWN5IiwidmFsaWRhdGVGaWxlVXBsb2FkT3B0aW9ucyIsInN0YXJ0c1dpdGgiLCJ2YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uIiwidmFsaWRhdGVJcHMiLCJ2YWxpZGF0ZURlZmF1bHRMaW1pdCIsInZhbGlkYXRlTWF4TGltaXQiLCJ2YWxpZGF0ZUFsbG93SGVhZGVycyIsInZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zIiwidmFsaWRhdGVQYWdlc09wdGlvbnMiLCJ2YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyIsInZhbGlkYXRlU2NoZW1hT3B0aW9ucyIsInZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyIsInZhbGlkYXRlQWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiIsInZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdCIsInZhbGlkYXRlUmF0ZUxpbWl0IiwidmFsaWRhdGVMb2dMZXZlbHMiLCJ2YWxpZGF0ZURhdGFiYXNlT3B0aW9ucyIsInZhbGlkYXRlQWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uIiwidmVyaWZ5VXNlckVtYWlscyIsInVzZXJDb250cm9sbGVyIiwiYXBwTmFtZSIsImVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwiZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCIsImVtYWlsQWRhcHRlciIsInZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uIiwidW5kZWZpbmVkIiwiQXJyYXkiLCJpc0FycmF5IiwicHJvdG90eXBlIiwidG9TdHJpbmciLCJjYWxsIiwiZW5hYmxlQ2hlY2siLCJTZWN1cml0eU9wdGlvbnMiLCJpc0Jvb2xlYW4iLCJlbmFibGVDaGVja0xvZyIsImRlZmluaXRpb25zIiwiU2NoZW1hT3B0aW9ucyIsInN0cmljdCIsImRlbGV0ZUV4dHJhRmllbGRzIiwicmVjcmVhdGVNb2RpZmllZEZpZWxkcyIsImxvY2tTY2hlbWFzIiwiYmVmb3JlTWlncmF0aW9uIiwiYWZ0ZXJNaWdyYXRpb24iLCJlbmFibGVSb3V0ZXIiLCJQYWdlc09wdGlvbnMiLCJlbmFibGVMb2NhbGl6YXRpb24iLCJsb2NhbGl6YXRpb25Kc29uUGF0aCIsImlzU3RyaW5nIiwibG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUiLCJwbGFjZWhvbGRlcnMiLCJmb3JjZVJlZGlyZWN0IiwicGFnZXNQYXRoIiwicGFnZXNFbmRwb2ludCIsImN1c3RvbVVybHMiLCJjdXN0b21Sb3V0ZXMiLCJ0dGwiLCJJZGVtcG90ZW5jeU9wdGlvbnMiLCJpc05hTiIsInBhdGhzIiwiZHVyYXRpb24iLCJOdW1iZXIiLCJpc0ludGVnZXIiLCJ0aHJlc2hvbGQiLCJ1bmxvY2tPblBhc3N3b3JkUmVzZXQiLCJBY2NvdW50TG9ja291dE9wdGlvbnMiLCJtYXhQYXNzd29yZEFnZSIsInJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uIiwidmFsaWRhdG9yUGF0dGVybiIsIlJlZ0V4cCIsInZhbGlkYXRvckNhbGxiYWNrIiwiZG9Ob3RBbGxvd1VzZXJuYW1lIiwibWF4UGFzc3dvcmRIaXN0b3J5IiwicmVzZXRUb2tlblJldXNlSWZWYWxpZCIsInJlc2V0UGFzc3dvcmRTdWNjZXNzT25JbnZhbGlkRW1haWwiLCJwYXR0ZXJuVmFsaWRhdG9yIiwidmFsdWUiLCJ0ZXN0IiwiZSIsIlJlZmVyZW5jZUVycm9yIiwiZW5hYmxlRm9yQW5vbnltb3VzVXNlciIsIkZpbGVVcGxvYWRPcHRpb25zIiwiZW5hYmxlRm9yUHVibGljIiwiZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIiLCJmaWxlRXh0ZW5zaW9ucyIsImZpZWxkIiwiaXAiLCJpbmNsdWRlcyIsInNwbGl0IiwibmV0IiwiaXNJUCIsIl9tb3VudCIsIm5ld1ZhbHVlIiwiUGFyc2VTZXJ2ZXJPcHRpb25zIiwiaGVhZGVyIiwidHJpbSIsIkxvZ0xldmVscyIsInZhbGlkTG9nTGV2ZWxzIiwiaW5kZXhPZiIsIkpTT04iLCJzdHJpbmdpZnkiLCJlbmFibGVTY2hlbWFIb29rcyIsIkRhdGFiYXNlT3B0aW9ucyIsInNjaGVtYUNhY2hlVHRsIiwib3B0aW9ucyIsIm9wdGlvbiIsInJlcXVlc3RQYXRoIiwicmVxdWVzdFRpbWVXaW5kb3ciLCJpbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cyIsInJlcXVlc3RDb3VudCIsImVycm9yUmVzcG9uc2VNZXNzYWdlIiwiUGFyc2VTZXJ2ZXIiLCJSYXRlTGltaXRab25lIiwiem9uZSIsImZvcm1hdHRlciIsIkludGwiLCJMaXN0Rm9ybWF0Iiwic3R5bGUiLCJ0eXBlIiwiZm9ybWF0Iiwibm93IiwiRGF0ZSIsImdldFRpbWUiLCJnZW5lcmF0ZVBhc3N3b3JkUmVzZXRUb2tlbkV4cGlyZXNBdCIsInVucmVnaXN0ZXJSYXRlTGltaXRlcnMiLCJfdGhpcyRyYXRlTGltaXRzIiwiaSIsInJhdGVMaW1pdHMiLCJsaW1pdCIsImNsb3VkIiwic3BsaWNlIiwiaW52YWxpZExpbmtVUkwiLCJjdXN0b21QYWdlcyIsImludmFsaWRMaW5rIiwiaW52YWxpZFZlcmlmaWNhdGlvbkxpbmtVUkwiLCJpbnZhbGlkVmVyaWZpY2F0aW9uTGluayIsImxpbmtTZW5kU3VjY2Vzc1VSTCIsImxpbmtTZW5kU3VjY2VzcyIsImxpbmtTZW5kRmFpbFVSTCIsImxpbmtTZW5kRmFpbCIsInZlcmlmeUVtYWlsU3VjY2Vzc1VSTCIsInZlcmlmeUVtYWlsU3VjY2VzcyIsImNob29zZVBhc3N3b3JkVVJMIiwiY2hvb3NlUGFzc3dvcmQiLCJyZXF1ZXN0UmVzZXRQYXNzd29yZFVSTCIsInBhc3N3b3JkUmVzZXRTdWNjZXNzVVJMIiwicGFzc3dvcmRSZXNldFN1Y2Nlc3MiLCJwYXJzZUZyYW1lVVJMIiwidmVyaWZ5RW1haWxVUkwiLCJleHBvcnRzIiwiX2RlZmF1bHQiLCJtb2R1bGUiXSwic291cmNlcyI6WyIuLi9zcmMvQ29uZmlnLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEEgQ29uZmlnIG9iamVjdCBwcm92aWRlcyBpbmZvcm1hdGlvbiBhYm91dCBob3cgYSBzcGVjaWZpYyBhcHAgaXNcbi8vIGNvbmZpZ3VyZWQuXG4vLyBtb3VudCBpcyB0aGUgVVJMIGZvciB0aGUgcm9vdCBvZiB0aGUgQVBJOyBpbmNsdWRlcyBodHRwLCBkb21haW4sIGV0Yy5cblxuaW1wb3J0IHsgaXNCb29sZWFuLCBpc1N0cmluZyB9IGZyb20gJ2xvZGFzaCc7XG5pbXBvcnQgbmV0IGZyb20gJ25ldCc7XG5pbXBvcnQgQXBwQ2FjaGUgZnJvbSAnLi9jYWNoZSc7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4vQ29udHJvbGxlcnMvRGF0YWJhc2VDb250cm9sbGVyJztcbmltcG9ydCB7IGxvZ0xldmVscyBhcyB2YWxpZExvZ0xldmVscyB9IGZyb20gJy4vQ29udHJvbGxlcnMvTG9nZ2VyQ29udHJvbGxlcic7XG5pbXBvcnQgeyB2ZXJzaW9uIH0gZnJvbSAnLi4vcGFja2FnZS5qc29uJztcbmltcG9ydCB7XG4gIEFjY291bnRMb2Nrb3V0T3B0aW9ucyxcbiAgRGF0YWJhc2VPcHRpb25zLFxuICBGaWxlVXBsb2FkT3B0aW9ucyxcbiAgSWRlbXBvdGVuY3lPcHRpb25zLFxuICBMb2dMZXZlbHMsXG4gIFBhZ2VzT3B0aW9ucyxcbiAgUGFyc2VTZXJ2ZXJPcHRpb25zLFxuICBTY2hlbWFPcHRpb25zLFxuICBTZWN1cml0eU9wdGlvbnMsXG59IGZyb20gJy4vT3B0aW9ucy9EZWZpbml0aW9ucyc7XG5pbXBvcnQgUGFyc2VTZXJ2ZXIgZnJvbSAnLi9jbG91ZC1jb2RlL1BhcnNlLlNlcnZlcic7XG5cbmZ1bmN0aW9uIHJlbW92ZVRyYWlsaW5nU2xhc2goc3RyKSB7XG4gIGlmICghc3RyKSB7XG4gICAgcmV0dXJuIHN0cjtcbiAgfVxuICBpZiAoc3RyLmVuZHNXaXRoKCcvJykpIHtcbiAgICBzdHIgPSBzdHIuc3Vic3RyaW5nKDAsIHN0ci5sZW5ndGggLSAxKTtcbiAgfVxuICByZXR1cm4gc3RyO1xufVxuXG5leHBvcnQgY2xhc3MgQ29uZmlnIHtcbiAgc3RhdGljIGdldChhcHBsaWNhdGlvbklkOiBzdHJpbmcsIG1vdW50OiBzdHJpbmcpIHtcbiAgICBjb25zdCBjYWNoZUluZm8gPSBBcHBDYWNoZS5nZXQoYXBwbGljYXRpb25JZCk7XG4gICAgaWYgKCFjYWNoZUluZm8pIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgY29uZmlnID0gbmV3IENvbmZpZygpO1xuICAgIGNvbmZpZy5hcHBsaWNhdGlvbklkID0gYXBwbGljYXRpb25JZDtcbiAgICBPYmplY3Qua2V5cyhjYWNoZUluZm8pLmZvckVhY2goa2V5ID0+IHtcbiAgICAgIGlmIChrZXkgPT0gJ2RhdGFiYXNlQ29udHJvbGxlcicpIHtcbiAgICAgICAgY29uZmlnLmRhdGFiYXNlID0gbmV3IERhdGFiYXNlQ29udHJvbGxlcihjYWNoZUluZm8uZGF0YWJhc2VDb250cm9sbGVyLmFkYXB0ZXIsIGNvbmZpZyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25maWdba2V5XSA9IGNhY2hlSW5mb1trZXldO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGNvbmZpZy5tb3VudCA9IHJlbW92ZVRyYWlsaW5nU2xhc2gobW91bnQpO1xuICAgIGNvbmZpZy5nZW5lcmF0ZVNlc3Npb25FeHBpcmVzQXQgPSBjb25maWcuZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0LmJpbmQoY29uZmlnKTtcbiAgICBjb25maWcuZ2VuZXJhdGVFbWFpbFZlcmlmeVRva2VuRXhwaXJlc0F0ID0gY29uZmlnLmdlbmVyYXRlRW1haWxWZXJpZnlUb2tlbkV4cGlyZXNBdC5iaW5kKFxuICAgICAgY29uZmlnXG4gICAgKTtcbiAgICBjb25maWcudmVyc2lvbiA9IHZlcnNpb247XG4gICAgcmV0dXJuIGNvbmZpZztcbiAgfVxuXG4gIHN0YXRpYyBwdXQoc2VydmVyQ29uZmlndXJhdGlvbikge1xuICAgIENvbmZpZy52YWxpZGF0ZU9wdGlvbnMoc2VydmVyQ29uZmlndXJhdGlvbik7XG4gICAgQ29uZmlnLnZhbGlkYXRlQ29udHJvbGxlcnMoc2VydmVyQ29uZmlndXJhdGlvbik7XG4gICAgQXBwQ2FjaGUucHV0KHNlcnZlckNvbmZpZ3VyYXRpb24uYXBwSWQsIHNlcnZlckNvbmZpZ3VyYXRpb24pO1xuICAgIENvbmZpZy5zZXR1cFBhc3N3b3JkVmFsaWRhdG9yKHNlcnZlckNvbmZpZ3VyYXRpb24ucGFzc3dvcmRQb2xpY3kpO1xuICAgIHJldHVybiBzZXJ2ZXJDb25maWd1cmF0aW9uO1xuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlT3B0aW9ucyh7XG4gICAgcHVibGljU2VydmVyVVJMLFxuICAgIHJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQsXG4gICAgZXhwaXJlSW5hY3RpdmVTZXNzaW9ucyxcbiAgICBzZXNzaW9uTGVuZ3RoLFxuICAgIGRlZmF1bHRMaW1pdCxcbiAgICBtYXhMaW1pdCxcbiAgICBhY2NvdW50TG9ja291dCxcbiAgICBwYXNzd29yZFBvbGljeSxcbiAgICBtYXN0ZXJLZXlJcHMsXG4gICAgbWFzdGVyS2V5LFxuICAgIG1haW50ZW5hbmNlS2V5LFxuICAgIG1haW50ZW5hbmNlS2V5SXBzLFxuICAgIHJlYWRPbmx5TWFzdGVyS2V5LFxuICAgIGFsbG93SGVhZGVycyxcbiAgICBpZGVtcG90ZW5jeU9wdGlvbnMsXG4gICAgZmlsZVVwbG9hZCxcbiAgICBwYWdlcyxcbiAgICBzZWN1cml0eSxcbiAgICBlbmZvcmNlUHJpdmF0ZVVzZXJzLFxuICAgIHNjaGVtYSxcbiAgICByZXF1ZXN0S2V5d29yZERlbnlsaXN0LFxuICAgIGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4sXG4gICAgbG9nTGV2ZWxzLFxuICAgIHJhdGVMaW1pdCxcbiAgICBkYXRhYmFzZU9wdGlvbnMsXG4gICAgZXh0ZW5kU2Vzc2lvbk9uVXNlLFxuICAgIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbixcbiAgfSkge1xuICAgIGlmIChtYXN0ZXJLZXkgPT09IHJlYWRPbmx5TWFzdGVyS2V5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21hc3RlcktleSBhbmQgcmVhZE9ubHlNYXN0ZXJLZXkgc2hvdWxkIGJlIGRpZmZlcmVudCcpO1xuICAgIH1cblxuICAgIGlmIChtYXN0ZXJLZXkgPT09IG1haW50ZW5hbmNlS2V5KSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ21hc3RlcktleSBhbmQgbWFpbnRlbmFuY2VLZXkgc2hvdWxkIGJlIGRpZmZlcmVudCcpO1xuICAgIH1cblxuICAgIHRoaXMudmFsaWRhdGVBY2NvdW50TG9ja291dFBvbGljeShhY2NvdW50TG9ja291dCk7XG4gICAgdGhpcy52YWxpZGF0ZVBhc3N3b3JkUG9saWN5KHBhc3N3b3JkUG9saWN5KTtcbiAgICB0aGlzLnZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMoZmlsZVVwbG9hZCk7XG5cbiAgICBpZiAodHlwZW9mIHJldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ3Jldm9rZVNlc3Npb25PblBhc3N3b3JkUmVzZXQgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgIH1cblxuICAgIGlmICh0eXBlb2YgZXh0ZW5kU2Vzc2lvbk9uVXNlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdleHRlbmRTZXNzaW9uT25Vc2UgbXVzdCBiZSBhIGJvb2xlYW4gdmFsdWUnO1xuICAgIH1cblxuICAgIGlmIChwdWJsaWNTZXJ2ZXJVUkwpIHtcbiAgICAgIGlmICghcHVibGljU2VydmVyVVJMLnN0YXJ0c1dpdGgoJ2h0dHA6Ly8nKSAmJiAhcHVibGljU2VydmVyVVJMLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJykpIHtcbiAgICAgICAgdGhyb3cgJ3B1YmxpY1NlcnZlclVSTCBzaG91bGQgYmUgYSB2YWxpZCBIVFRQUyBVUkwgc3RhcnRpbmcgd2l0aCBodHRwczovLyc7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMudmFsaWRhdGVTZXNzaW9uQ29uZmlndXJhdGlvbihzZXNzaW9uTGVuZ3RoLCBleHBpcmVJbmFjdGl2ZVNlc3Npb25zKTtcbiAgICB0aGlzLnZhbGlkYXRlSXBzKCdtYXN0ZXJLZXlJcHMnLCBtYXN0ZXJLZXlJcHMpO1xuICAgIHRoaXMudmFsaWRhdGVJcHMoJ21haW50ZW5hbmNlS2V5SXBzJywgbWFpbnRlbmFuY2VLZXlJcHMpO1xuICAgIHRoaXMudmFsaWRhdGVEZWZhdWx0TGltaXQoZGVmYXVsdExpbWl0KTtcbiAgICB0aGlzLnZhbGlkYXRlTWF4TGltaXQobWF4TGltaXQpO1xuICAgIHRoaXMudmFsaWRhdGVBbGxvd0hlYWRlcnMoYWxsb3dIZWFkZXJzKTtcbiAgICB0aGlzLnZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zKGlkZW1wb3RlbmN5T3B0aW9ucyk7XG4gICAgdGhpcy52YWxpZGF0ZVBhZ2VzT3B0aW9ucyhwYWdlcyk7XG4gICAgdGhpcy52YWxpZGF0ZVNlY3VyaXR5T3B0aW9ucyhzZWN1cml0eSk7XG4gICAgdGhpcy52YWxpZGF0ZVNjaGVtYU9wdGlvbnMoc2NoZW1hKTtcbiAgICB0aGlzLnZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyhlbmZvcmNlUHJpdmF0ZVVzZXJzKTtcbiAgICB0aGlzLnZhbGlkYXRlQWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbihhbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKTtcbiAgICB0aGlzLnZhbGlkYXRlUmVxdWVzdEtleXdvcmREZW55bGlzdChyZXF1ZXN0S2V5d29yZERlbnlsaXN0KTtcbiAgICB0aGlzLnZhbGlkYXRlUmF0ZUxpbWl0KHJhdGVMaW1pdCk7XG4gICAgdGhpcy52YWxpZGF0ZUxvZ0xldmVscyhsb2dMZXZlbHMpO1xuICAgIHRoaXMudmFsaWRhdGVEYXRhYmFzZU9wdGlvbnMoZGF0YWJhc2VPcHRpb25zKTtcbiAgICB0aGlzLnZhbGlkYXRlQWxsb3dDbGllbnRDbGFzc0NyZWF0aW9uKGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbik7XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVDb250cm9sbGVycyh7XG4gICAgdmVyaWZ5VXNlckVtYWlscyxcbiAgICB1c2VyQ29udHJvbGxlcixcbiAgICBhcHBOYW1lLFxuICAgIHB1YmxpY1NlcnZlclVSTCxcbiAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICBlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkLFxuICB9KSB7XG4gICAgY29uc3QgZW1haWxBZGFwdGVyID0gdXNlckNvbnRyb2xsZXIuYWRhcHRlcjtcbiAgICBpZiAodmVyaWZ5VXNlckVtYWlscykge1xuICAgICAgdGhpcy52YWxpZGF0ZUVtYWlsQ29uZmlndXJhdGlvbih7XG4gICAgICAgIGVtYWlsQWRhcHRlcixcbiAgICAgICAgYXBwTmFtZSxcbiAgICAgICAgcHVibGljU2VydmVyVVJMLFxuICAgICAgICBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbixcbiAgICAgICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgICAgIH0pO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVJlcXVlc3RLZXl3b3JkRGVueWxpc3QocmVxdWVzdEtleXdvcmREZW55bGlzdCkge1xuICAgIGlmIChyZXF1ZXN0S2V5d29yZERlbnlsaXN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHJlcXVlc3RLZXl3b3JkRGVueWxpc3QgPSByZXF1ZXN0S2V5d29yZERlbnlsaXN0LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghQXJyYXkuaXNBcnJheShyZXF1ZXN0S2V5d29yZERlbnlsaXN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcmVxdWVzdEtleXdvcmREZW55bGlzdCBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRW5mb3JjZVByaXZhdGVVc2VycyhlbmZvcmNlUHJpdmF0ZVVzZXJzKSB7XG4gICAgaWYgKHR5cGVvZiBlbmZvcmNlUHJpdmF0ZVVzZXJzICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIGVuZm9yY2VQcml2YXRlVXNlcnMgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVBbGxvd0V4cGlyZWRBdXRoRGF0YVRva2VuKGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4pIHtcbiAgICBpZiAodHlwZW9mIGFsbG93RXhwaXJlZEF1dGhEYXRhVG9rZW4gIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gYWxsb3dFeHBpcmVkQXV0aERhdGFUb2tlbiBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbihhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24pIHtcbiAgICBpZiAodHlwZW9mIGFsbG93Q2xpZW50Q2xhc3NDcmVhdGlvbiAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBhbGxvd0NsaWVudENsYXNzQ3JlYXRpb24gbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVTZWN1cml0eU9wdGlvbnMoc2VjdXJpdHkpIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHNlY3VyaXR5KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNlY3VyaXR5IG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChzZWN1cml0eS5lbmFibGVDaGVjayA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzZWN1cml0eS5lbmFibGVDaGVjayA9IFNlY3VyaXR5T3B0aW9ucy5lbmFibGVDaGVjay5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzZWN1cml0eS5lbmFibGVDaGVjaykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNlY3VyaXR5LmVuYWJsZUNoZWNrIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzZWN1cml0eS5lbmFibGVDaGVja0xvZyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzZWN1cml0eS5lbmFibGVDaGVja0xvZyA9IFNlY3VyaXR5T3B0aW9ucy5lbmFibGVDaGVja0xvZy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzZWN1cml0eS5lbmFibGVDaGVja0xvZykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlU2NoZW1hT3B0aW9ucyhzY2hlbWE6IFNjaGVtYU9wdGlvbnMpIHtcbiAgICBpZiAoIXNjaGVtYSkgcmV0dXJuO1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc2NoZW1hKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYSBtdXN0IGJlIGFuIG9iamVjdC4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmRlZmluaXRpb25zID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5kZWZpbml0aW9ucyA9IFNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFBcnJheS5pc0FycmF5KHNjaGVtYS5kZWZpbml0aW9ucykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5kZWZpbml0aW9ucyBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEuc3RyaWN0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5zdHJpY3QgPSBTY2hlbWFPcHRpb25zLnN0cmljdC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEuc3RyaWN0KSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLnN0cmljdCBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5kZWxldGVFeHRyYUZpZWxkcyA9IFNjaGVtYU9wdGlvbnMuZGVsZXRlRXh0cmFGaWVsZHMuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4oc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmRlbGV0ZUV4dHJhRmllbGRzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcyA9IFNjaGVtYU9wdGlvbnMucmVjcmVhdGVNb2RpZmllZEZpZWxkcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEucmVjcmVhdGVNb2RpZmllZEZpZWxkcykpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHNjaGVtYS5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChzY2hlbWEubG9ja1NjaGVtYXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmxvY2tTY2hlbWFzID0gU2NoZW1hT3B0aW9ucy5sb2NrU2NoZW1hcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzQm9vbGVhbihzY2hlbWEubG9ja1NjaGVtYXMpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEubG9ja1NjaGVtYXMgbXVzdCBiZSBhIGJvb2xlYW4uJztcbiAgICB9XG4gICAgaWYgKHNjaGVtYS5iZWZvcmVNaWdyYXRpb24gPT09IHVuZGVmaW5lZCkge1xuICAgICAgc2NoZW1hLmJlZm9yZU1pZ3JhdGlvbiA9IG51bGw7XG4gICAgfSBlbHNlIGlmIChzY2hlbWEuYmVmb3JlTWlncmF0aW9uICE9PSBudWxsICYmIHR5cGVvZiBzY2hlbWEuYmVmb3JlTWlncmF0aW9uICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBzY2hlbWEuYmVmb3JlTWlncmF0aW9uIG11c3QgYmUgYSBmdW5jdGlvbi4nO1xuICAgIH1cbiAgICBpZiAoc2NoZW1hLmFmdGVyTWlncmF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiA9IG51bGw7XG4gICAgfSBlbHNlIGlmIChzY2hlbWEuYWZ0ZXJNaWdyYXRpb24gIT09IG51bGwgJiYgdHlwZW9mIHNjaGVtYS5hZnRlck1pZ3JhdGlvbiAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gc2NoZW1hLmFmdGVyTWlncmF0aW9uIG11c3QgYmUgYSBmdW5jdGlvbi4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVBhZ2VzT3B0aW9ucyhwYWdlcykge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMgbXVzdCBiZSBhbiBvYmplY3QuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmVuYWJsZVJvdXRlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5lbmFibGVSb3V0ZXIgPSBQYWdlc09wdGlvbnMuZW5hYmxlUm91dGVyLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmVuYWJsZVJvdXRlcikpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmVuYWJsZVJvdXRlciBtdXN0IGJlIGEgYm9vbGVhbi4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLmVuYWJsZUxvY2FsaXphdGlvbiA9IFBhZ2VzT3B0aW9ucy5lbmFibGVMb2NhbGl6YXRpb24uZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc0Jvb2xlYW4ocGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMuZW5hYmxlTG9jYWxpemF0aW9uIG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5sb2NhbGl6YXRpb25Kc29uUGF0aCA9IFBhZ2VzT3B0aW9ucy5sb2NhbGl6YXRpb25Kc29uUGF0aC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLmxvY2FsaXphdGlvbkpzb25QYXRoKSkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMubG9jYWxpemF0aW9uSnNvblBhdGggbXVzdCBiZSBhIHN0cmluZy4nO1xuICAgIH1cbiAgICBpZiAocGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUgPSBQYWdlc09wdGlvbnMubG9jYWxpemF0aW9uRmFsbGJhY2tMb2NhbGUuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKCFpc1N0cmluZyhwYWdlcy5sb2NhbGl6YXRpb25GYWxsYmFja0xvY2FsZSkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmxvY2FsaXphdGlvbkZhbGxiYWNrTG9jYWxlIG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLnBsYWNlaG9sZGVycyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBwYWdlcy5wbGFjZWhvbGRlcnMgPSBQYWdlc09wdGlvbnMucGxhY2Vob2xkZXJzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChwYWdlcy5wbGFjZWhvbGRlcnMpICE9PSAnW29iamVjdCBPYmplY3RdJyAmJlxuICAgICAgdHlwZW9mIHBhZ2VzLnBsYWNlaG9sZGVycyAhPT0gJ2Z1bmN0aW9uJ1xuICAgICkge1xuICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gcGFnZXMucGxhY2Vob2xkZXJzIG11c3QgYmUgYW4gb2JqZWN0IG9yIGEgZnVuY3Rpb24uJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmZvcmNlUmVkaXJlY3QgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuZm9yY2VSZWRpcmVjdCA9IFBhZ2VzT3B0aW9ucy5mb3JjZVJlZGlyZWN0LmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNCb29sZWFuKHBhZ2VzLmZvcmNlUmVkaXJlY3QpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5mb3JjZVJlZGlyZWN0IG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wYWdlc1BhdGggPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMucGFnZXNQYXRoID0gUGFnZXNPcHRpb25zLnBhZ2VzUGF0aC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLnBhZ2VzUGF0aCkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLnBhZ2VzUGF0aCBtdXN0IGJlIGEgc3RyaW5nLic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5wYWdlc0VuZHBvaW50ID09PSB1bmRlZmluZWQpIHtcbiAgICAgIHBhZ2VzLnBhZ2VzRW5kcG9pbnQgPSBQYWdlc09wdGlvbnMucGFnZXNFbmRwb2ludC5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIWlzU3RyaW5nKHBhZ2VzLnBhZ2VzRW5kcG9pbnQpKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5wYWdlc0VuZHBvaW50IG11c3QgYmUgYSBzdHJpbmcuJztcbiAgICB9XG4gICAgaWYgKHBhZ2VzLmN1c3RvbVVybHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuY3VzdG9tVXJscyA9IFBhZ2VzT3B0aW9ucy5jdXN0b21VcmxzLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwocGFnZXMuY3VzdG9tVXJscykgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyAnUGFyc2UgU2VydmVyIG9wdGlvbiBwYWdlcy5jdXN0b21VcmxzIG11c3QgYmUgYW4gb2JqZWN0Lic7XG4gICAgfVxuICAgIGlmIChwYWdlcy5jdXN0b21Sb3V0ZXMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcGFnZXMuY3VzdG9tUm91dGVzID0gUGFnZXNPcHRpb25zLmN1c3RvbVJvdXRlcy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIShwYWdlcy5jdXN0b21Sb3V0ZXMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93ICdQYXJzZSBTZXJ2ZXIgb3B0aW9uIHBhZ2VzLmN1c3RvbVJvdXRlcyBtdXN0IGJlIGFuIGFycmF5Lic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlSWRlbXBvdGVuY3lPcHRpb25zKGlkZW1wb3RlbmN5T3B0aW9ucykge1xuICAgIGlmICghaWRlbXBvdGVuY3lPcHRpb25zKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChpZGVtcG90ZW5jeU9wdGlvbnMudHRsID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGlkZW1wb3RlbmN5T3B0aW9ucy50dGwgPSBJZGVtcG90ZW5jeU9wdGlvbnMudHRsLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICghaXNOYU4oaWRlbXBvdGVuY3lPcHRpb25zLnR0bCkgJiYgaWRlbXBvdGVuY3lPcHRpb25zLnR0bCA8PSAwKSB7XG4gICAgICB0aHJvdyAnaWRlbXBvdGVuY3kgVFRMIHZhbHVlIG11c3QgYmUgZ3JlYXRlciB0aGFuIDAgc2Vjb25kcyc7XG4gICAgfSBlbHNlIGlmIChpc05hTihpZGVtcG90ZW5jeU9wdGlvbnMudHRsKSkge1xuICAgICAgdGhyb3cgJ2lkZW1wb3RlbmN5IFRUTCB2YWx1ZSBtdXN0IGJlIGEgbnVtYmVyJztcbiAgICB9XG4gICAgaWYgKCFpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMpIHtcbiAgICAgIGlkZW1wb3RlbmN5T3B0aW9ucy5wYXRocyA9IElkZW1wb3RlbmN5T3B0aW9ucy5wYXRocy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIShpZGVtcG90ZW5jeU9wdGlvbnMucGF0aHMgaW5zdGFuY2VvZiBBcnJheSkpIHtcbiAgICAgIHRocm93ICdpZGVtcG90ZW5jeSBwYXRocyBtdXN0IGJlIG9mIGFuIGFycmF5IG9mIHN0cmluZ3MnO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFjY291bnRMb2Nrb3V0UG9saWN5KGFjY291bnRMb2Nrb3V0KSB7XG4gICAgaWYgKGFjY291bnRMb2Nrb3V0KSB7XG4gICAgICBpZiAoXG4gICAgICAgIHR5cGVvZiBhY2NvdW50TG9ja291dC5kdXJhdGlvbiAhPT0gJ251bWJlcicgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQuZHVyYXRpb24gPD0gMCB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC5kdXJhdGlvbiA+IDk5OTk5XG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ0FjY291bnQgbG9ja291dCBkdXJhdGlvbiBzaG91bGQgYmUgZ3JlYXRlciB0aGFuIDAgYW5kIGxlc3MgdGhhbiAxMDAwMDAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgICFOdW1iZXIuaXNJbnRlZ2VyKGFjY291bnRMb2Nrb3V0LnRocmVzaG9sZCkgfHxcbiAgICAgICAgYWNjb3VudExvY2tvdXQudGhyZXNob2xkIDwgMSB8fFxuICAgICAgICBhY2NvdW50TG9ja291dC50aHJlc2hvbGQgPiA5OTlcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAnQWNjb3VudCBsb2Nrb3V0IHRocmVzaG9sZCBzaG91bGQgYmUgYW4gaW50ZWdlciBncmVhdGVyIHRoYW4gMCBhbmQgbGVzcyB0aGFuIDEwMDAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0ID0gQWNjb3VudExvY2tvdXRPcHRpb25zLnVubG9ja09uUGFzc3dvcmRSZXNldC5kZWZhdWx0O1xuICAgICAgfSBlbHNlIGlmICghaXNCb29sZWFuKGFjY291bnRMb2Nrb3V0LnVubG9ja09uUGFzc3dvcmRSZXNldCkpIHtcbiAgICAgICAgdGhyb3cgJ1BhcnNlIFNlcnZlciBvcHRpb24gYWNjb3VudExvY2tvdXQudW5sb2NrT25QYXNzd29yZFJlc2V0IG11c3QgYmUgYSBib29sZWFuLic7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlUGFzc3dvcmRQb2xpY3kocGFzc3dvcmRQb2xpY3kpIHtcbiAgICBpZiAocGFzc3dvcmRQb2xpY3kpIHtcbiAgICAgIGlmIChcbiAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRBZ2UgIT09IHVuZGVmaW5lZCAmJlxuICAgICAgICAodHlwZW9mIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlICE9PSAnbnVtYmVyJyB8fCBwYXNzd29yZFBvbGljeS5tYXhQYXNzd29yZEFnZSA8IDApXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkQWdlIG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXInO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uICE9PSB1bmRlZmluZWQgJiZcbiAgICAgICAgKHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAhPT0gJ251bWJlcicgfHxcbiAgICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiA8PSAwKVxuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJztcbiAgICAgIH1cblxuICAgICAgaWYgKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pIHtcbiAgICAgICAgaWYgKHR5cGVvZiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuID09PSAnc3RyaW5nJykge1xuICAgICAgICAgIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gPSBuZXcgUmVnRXhwKHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4pO1xuICAgICAgICB9IGVsc2UgaWYgKCEocGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBpbnN0YW5jZW9mIFJlZ0V4cCkpIHtcbiAgICAgICAgICB0aHJvdyAncGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybiBtdXN0IGJlIGEgcmVnZXggc3RyaW5nIG9yIFJlZ0V4cCBvYmplY3QuJztcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvckNhbGxiYWNrICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdwYXNzd29yZFBvbGljeS52YWxpZGF0b3JDYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb24uJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5kb05vdEFsbG93VXNlcm5hbWUgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSAhPT0gJ2Jvb2xlYW4nXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5LmRvTm90QWxsb3dVc2VybmFtZSBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSAmJlxuICAgICAgICAoIU51bWJlci5pc0ludGVnZXIocGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5KSB8fFxuICAgICAgICAgIHBhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSA8PSAwIHx8XG4gICAgICAgICAgcGFzc3dvcmRQb2xpY3kubWF4UGFzc3dvcmRIaXN0b3J5ID4gMjApXG4gICAgICApIHtcbiAgICAgICAgdGhyb3cgJ3Bhc3N3b3JkUG9saWN5Lm1heFBhc3N3b3JkSGlzdG9yeSBtdXN0IGJlIGFuIGludGVnZXIgcmFuZ2luZyAwIC0gMjAnO1xuICAgICAgfVxuXG4gICAgICBpZiAoXG4gICAgICAgIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgJiZcbiAgICAgICAgdHlwZW9mIHBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5SZXVzZUlmVmFsaWQgIT09ICdib29sZWFuJ1xuICAgICAgKSB7XG4gICAgICAgIHRocm93ICdyZXNldFRva2VuUmV1c2VJZlZhbGlkIG11c3QgYmUgYSBib29sZWFuIHZhbHVlJztcbiAgICAgIH1cbiAgICAgIGlmIChwYXNzd29yZFBvbGljeS5yZXNldFRva2VuUmV1c2VJZlZhbGlkICYmICFwYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgICB0aHJvdyAnWW91IGNhbm5vdCB1c2UgcmVzZXRUb2tlblJldXNlSWZWYWxpZCB3aXRob3V0IHJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uJztcbiAgICAgIH1cblxuICAgICAgaWYgKFxuICAgICAgICBwYXNzd29yZFBvbGljeS5yZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsICYmXG4gICAgICAgIHR5cGVvZiBwYXNzd29yZFBvbGljeS5yZXNldFBhc3N3b3JkU3VjY2Vzc09uSW52YWxpZEVtYWlsICE9PSAnYm9vbGVhbidcbiAgICAgICkge1xuICAgICAgICB0aHJvdyAncmVzZXRQYXNzd29yZFN1Y2Nlc3NPbkludmFsaWRFbWFpbCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhc3N3b3JkUG9saWN5LnZhbGlkYXRvclBhdHRlcm4gaXMgY29uZmlndXJlZCB0aGVuIHNldHVwIGEgY2FsbGJhY2sgdG8gcHJvY2VzcyB0aGUgcGF0dGVyblxuICBzdGF0aWMgc2V0dXBQYXNzd29yZFZhbGlkYXRvcihwYXNzd29yZFBvbGljeSkge1xuICAgIGlmIChwYXNzd29yZFBvbGljeSAmJiBwYXNzd29yZFBvbGljeS52YWxpZGF0b3JQYXR0ZXJuKSB7XG4gICAgICBwYXNzd29yZFBvbGljeS5wYXR0ZXJuVmFsaWRhdG9yID0gdmFsdWUgPT4ge1xuICAgICAgICByZXR1cm4gcGFzc3dvcmRQb2xpY3kudmFsaWRhdG9yUGF0dGVybi50ZXN0KHZhbHVlKTtcbiAgICAgIH07XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRW1haWxDb25maWd1cmF0aW9uKHtcbiAgICBlbWFpbEFkYXB0ZXIsXG4gICAgYXBwTmFtZSxcbiAgICBwdWJsaWNTZXJ2ZXJVUkwsXG4gICAgZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24sXG4gICAgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCxcbiAgfSkge1xuICAgIGlmICghZW1haWxBZGFwdGVyKSB7XG4gICAgICB0aHJvdyAnQW4gZW1haWxBZGFwdGVyIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBhcHBOYW1lICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgJ0FuIGFwcCBuYW1lIGlzIHJlcXVpcmVkIGZvciBlLW1haWwgdmVyaWZpY2F0aW9uIGFuZCBwYXNzd29yZCByZXNldHMuJztcbiAgICB9XG4gICAgaWYgKHR5cGVvZiBwdWJsaWNTZXJ2ZXJVUkwgIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyAnQSBwdWJsaWMgc2VydmVyIHVybCBpcyByZXF1aXJlZCBmb3IgZS1tYWlsIHZlcmlmaWNhdGlvbiBhbmQgcGFzc3dvcmQgcmVzZXRzLic7XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgaWYgKGlzTmFOKGVtYWlsVmVyaWZ5VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSkge1xuICAgICAgICB0aHJvdyAnRW1haWwgdmVyaWZ5IHRva2VuIHZhbGlkaXR5IGR1cmF0aW9uIG11c3QgYmUgYSB2YWxpZCBudW1iZXIuJztcbiAgICAgIH0gZWxzZSBpZiAoZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24gPD0gMCkge1xuICAgICAgICB0aHJvdyAnRW1haWwgdmVyaWZ5IHRva2VuIHZhbGlkaXR5IGR1cmF0aW9uIG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAmJiB0eXBlb2YgZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZW1haWxWZXJpZnlUb2tlblJldXNlSWZWYWxpZCBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZSc7XG4gICAgfVxuICAgIGlmIChlbWFpbFZlcmlmeVRva2VuUmV1c2VJZlZhbGlkICYmICFlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbikge1xuICAgICAgdGhyb3cgJ1lvdSBjYW5ub3QgdXNlIGVtYWlsVmVyaWZ5VG9rZW5SZXVzZUlmVmFsaWQgd2l0aG91dCBlbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbic7XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRmlsZVVwbG9hZE9wdGlvbnMoZmlsZVVwbG9hZCkge1xuICAgIHRyeSB7XG4gICAgICBpZiAoZmlsZVVwbG9hZCA9PSBudWxsIHx8IHR5cGVvZiBmaWxlVXBsb2FkICE9PSAnb2JqZWN0JyB8fCBmaWxlVXBsb2FkIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICAgICAgdGhyb3cgJ2ZpbGVVcGxvYWQgbXVzdCBiZSBhbiBvYmplY3QgdmFsdWUuJztcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoZSBpbnN0YW5jZW9mIFJlZmVyZW5jZUVycm9yKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHRocm93IGU7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvckFub255bW91c1VzZXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQW5vbnltb3VzVXNlci5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yQW5vbnltb3VzVXNlciAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICB0aHJvdyAnZmlsZVVwbG9hZC5lbmFibGVGb3JBbm9ueW1vdXNVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyA9IEZpbGVVcGxvYWRPcHRpb25zLmVuYWJsZUZvclB1YmxpYy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGZpbGVVcGxvYWQuZW5hYmxlRm9yUHVibGljICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvclB1YmxpYyBtdXN0IGJlIGEgYm9vbGVhbiB2YWx1ZS4nO1xuICAgIH1cbiAgICBpZiAoZmlsZVVwbG9hZC5lbmFibGVGb3JBdXRoZW50aWNhdGVkVXNlciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyID0gRmlsZVVwbG9hZE9wdGlvbnMuZW5hYmxlRm9yQXV0aGVudGljYXRlZFVzZXIuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyICE9PSAnYm9vbGVhbicpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmVuYWJsZUZvckF1dGhlbnRpY2F0ZWRVc2VyIG11c3QgYmUgYSBib29sZWFuIHZhbHVlLic7XG4gICAgfVxuICAgIGlmIChmaWxlVXBsb2FkLmZpbGVFeHRlbnNpb25zID09PSB1bmRlZmluZWQpIHtcbiAgICAgIGZpbGVVcGxvYWQuZmlsZUV4dGVuc2lvbnMgPSBGaWxlVXBsb2FkT3B0aW9ucy5maWxlRXh0ZW5zaW9ucy5kZWZhdWx0O1xuICAgIH0gZWxzZSBpZiAoIUFycmF5LmlzQXJyYXkoZmlsZVVwbG9hZC5maWxlRXh0ZW5zaW9ucykpIHtcbiAgICAgIHRocm93ICdmaWxlVXBsb2FkLmZpbGVFeHRlbnNpb25zIG11c3QgYmUgYW4gYXJyYXkuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVJcHMoZmllbGQsIG1hc3RlcktleUlwcykge1xuICAgIGZvciAobGV0IGlwIG9mIG1hc3RlcktleUlwcykge1xuICAgICAgaWYgKGlwLmluY2x1ZGVzKCcvJykpIHtcbiAgICAgICAgaXAgPSBpcC5zcGxpdCgnLycpWzBdO1xuICAgICAgfVxuICAgICAgaWYgKCFuZXQuaXNJUChpcCkpIHtcbiAgICAgICAgdGhyb3cgYFRoZSBQYXJzZSBTZXJ2ZXIgb3B0aW9uIFwiJHtmaWVsZH1cIiBjb250YWlucyBhbiBpbnZhbGlkIElQIGFkZHJlc3MgXCIke2lwfVwiLmA7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2V0IG1vdW50KCkge1xuICAgIHZhciBtb3VudCA9IHRoaXMuX21vdW50O1xuICAgIGlmICh0aGlzLnB1YmxpY1NlcnZlclVSTCkge1xuICAgICAgbW91bnQgPSB0aGlzLnB1YmxpY1NlcnZlclVSTDtcbiAgICB9XG4gICAgcmV0dXJuIG1vdW50O1xuICB9XG5cbiAgc2V0IG1vdW50KG5ld1ZhbHVlKSB7XG4gICAgdGhpcy5fbW91bnQgPSBuZXdWYWx1ZTtcbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZVNlc3Npb25Db25maWd1cmF0aW9uKHNlc3Npb25MZW5ndGgsIGV4cGlyZUluYWN0aXZlU2Vzc2lvbnMpIHtcbiAgICBpZiAoZXhwaXJlSW5hY3RpdmVTZXNzaW9ucykge1xuICAgICAgaWYgKGlzTmFOKHNlc3Npb25MZW5ndGgpKSB7XG4gICAgICAgIHRocm93ICdTZXNzaW9uIGxlbmd0aCBtdXN0IGJlIGEgdmFsaWQgbnVtYmVyLic7XG4gICAgICB9IGVsc2UgaWYgKHNlc3Npb25MZW5ndGggPD0gMCkge1xuICAgICAgICB0aHJvdyAnU2Vzc2lvbiBsZW5ndGggbXVzdCBiZSBhIHZhbHVlIGdyZWF0ZXIgdGhhbiAwLic7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgc3RhdGljIHZhbGlkYXRlRGVmYXVsdExpbWl0KGRlZmF1bHRMaW1pdCkge1xuICAgIGlmIChkZWZhdWx0TGltaXQgPT0gbnVsbCkge1xuICAgICAgZGVmYXVsdExpbWl0ID0gUGFyc2VTZXJ2ZXJPcHRpb25zLmRlZmF1bHRMaW1pdC5kZWZhdWx0O1xuICAgIH1cbiAgICBpZiAodHlwZW9mIGRlZmF1bHRMaW1pdCAhPT0gJ251bWJlcicpIHtcbiAgICAgIHRocm93ICdEZWZhdWx0IGxpbWl0IG11c3QgYmUgYSBudW1iZXIuJztcbiAgICB9XG4gICAgaWYgKGRlZmF1bHRMaW1pdCA8PSAwKSB7XG4gICAgICB0aHJvdyAnRGVmYXVsdCBsaW1pdCBtdXN0IGJlIGEgdmFsdWUgZ3JlYXRlciB0aGFuIDAuJztcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVNYXhMaW1pdChtYXhMaW1pdCkge1xuICAgIGlmIChtYXhMaW1pdCA8PSAwKSB7XG4gICAgICB0aHJvdyAnTWF4IGxpbWl0IG11c3QgYmUgYSB2YWx1ZSBncmVhdGVyIHRoYW4gMC4nO1xuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZUFsbG93SGVhZGVycyhhbGxvd0hlYWRlcnMpIHtcbiAgICBpZiAoIVtudWxsLCB1bmRlZmluZWRdLmluY2x1ZGVzKGFsbG93SGVhZGVycykpIHtcbiAgICAgIGlmIChBcnJheS5pc0FycmF5KGFsbG93SGVhZGVycykpIHtcbiAgICAgICAgYWxsb3dIZWFkZXJzLmZvckVhY2goaGVhZGVyID0+IHtcbiAgICAgICAgICBpZiAodHlwZW9mIGhlYWRlciAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHRocm93ICdBbGxvdyBoZWFkZXJzIG11c3Qgb25seSBjb250YWluIHN0cmluZ3MnO1xuICAgICAgICAgIH0gZWxzZSBpZiAoIWhlYWRlci50cmltKCkubGVuZ3RoKSB7XG4gICAgICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IG5vdCBjb250YWluIGVtcHR5IHN0cmluZ3MnO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyAnQWxsb3cgaGVhZGVycyBtdXN0IGJlIGFuIGFycmF5JztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVMb2dMZXZlbHMobG9nTGV2ZWxzKSB7XG4gICAgZm9yIChjb25zdCBrZXkgb2YgT2JqZWN0LmtleXMoTG9nTGV2ZWxzKSkge1xuICAgICAgaWYgKGxvZ0xldmVsc1trZXldKSB7XG4gICAgICAgIGlmICh2YWxpZExvZ0xldmVscy5pbmRleE9mKGxvZ0xldmVsc1trZXldKSA9PT0gLTEpIHtcbiAgICAgICAgICB0aHJvdyBgJyR7a2V5fScgbXVzdCBiZSBvbmUgb2YgJHtKU09OLnN0cmluZ2lmeSh2YWxpZExvZ0xldmVscyl9YDtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nTGV2ZWxzW2tleV0gPSBMb2dMZXZlbHNba2V5XS5kZWZhdWx0O1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHN0YXRpYyB2YWxpZGF0ZURhdGFiYXNlT3B0aW9ucyhkYXRhYmFzZU9wdGlvbnMpIHtcbiAgICBpZiAoZGF0YWJhc2VPcHRpb25zID09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGRhdGFiYXNlT3B0aW9ucykgIT09ICdbb2JqZWN0IE9iamVjdF0nKSB7XG4gICAgICB0aHJvdyBgZGF0YWJhc2VPcHRpb25zIG11c3QgYmUgYW4gb2JqZWN0YDtcbiAgICB9XG4gICAgaWYgKGRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICBkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3MgPSBEYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3MuZGVmYXVsdDtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBkYXRhYmFzZU9wdGlvbnMuZW5hYmxlU2NoZW1hSG9va3MgIT09ICdib29sZWFuJykge1xuICAgICAgdGhyb3cgYGRhdGFiYXNlT3B0aW9ucy5lbmFibGVTY2hlbWFIb29rcyBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgfVxuICAgIGlmIChkYXRhYmFzZU9wdGlvbnMuc2NoZW1hQ2FjaGVUdGwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgZGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsID0gRGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsLmRlZmF1bHQ7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZGF0YWJhc2VPcHRpb25zLnNjaGVtYUNhY2hlVHRsICE9PSAnbnVtYmVyJykge1xuICAgICAgdGhyb3cgYGRhdGFiYXNlT3B0aW9ucy5zY2hlbWFDYWNoZVR0bCBtdXN0IGJlIGEgbnVtYmVyYDtcbiAgICB9XG4gIH1cblxuICBzdGF0aWMgdmFsaWRhdGVSYXRlTGltaXQocmF0ZUxpbWl0KSB7XG4gICAgaWYgKCFyYXRlTGltaXQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKFxuICAgICAgT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHJhdGVMaW1pdCkgIT09ICdbb2JqZWN0IE9iamVjdF0nICYmXG4gICAgICAhQXJyYXkuaXNBcnJheShyYXRlTGltaXQpXG4gICAgKSB7XG4gICAgICB0aHJvdyBgcmF0ZUxpbWl0IG11c3QgYmUgYW4gYXJyYXkgb3Igb2JqZWN0YDtcbiAgICB9XG4gICAgY29uc3Qgb3B0aW9ucyA9IEFycmF5LmlzQXJyYXkocmF0ZUxpbWl0KSA/IHJhdGVMaW1pdCA6IFtyYXRlTGltaXRdO1xuICAgIGZvciAoY29uc3Qgb3B0aW9uIG9mIG9wdGlvbnMpIHtcbiAgICAgIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwob3B0aW9uKSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdCBtdXN0IGJlIGFuIGFycmF5IG9mIG9iamVjdHNgO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5yZXF1ZXN0UGF0aCA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdFBhdGggbXVzdCBiZSBkZWZpbmVkYDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9uLnJlcXVlc3RQYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RQYXRoIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5yZXF1ZXN0VGltZVdpbmRvdyA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdFRpbWVXaW5kb3cgbXVzdCBiZSBkZWZpbmVkYDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9uLnJlcXVlc3RUaW1lV2luZG93ICE9PSAnbnVtYmVyJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LnJlcXVlc3RUaW1lV2luZG93IG11c3QgYmUgYSBudW1iZXJgO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5pbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cyAmJiB0eXBlb2Ygb3B0aW9uLmluY2x1ZGVJbnRlcm5hbFJlcXVlc3RzICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgdGhyb3cgYHJhdGVMaW1pdC5pbmNsdWRlSW50ZXJuYWxSZXF1ZXN0cyBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgICB9XG4gICAgICBpZiAob3B0aW9uLnJlcXVlc3RDb3VudCA9PSBudWxsKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdENvdW50IG11c3QgYmUgZGVmaW5lZGA7XG4gICAgICB9XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbi5yZXF1ZXN0Q291bnQgIT09ICdudW1iZXInKSB7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQucmVxdWVzdENvdW50IG11c3QgYmUgYSBudW1iZXJgO1xuICAgICAgfVxuICAgICAgaWYgKG9wdGlvbi5lcnJvclJlc3BvbnNlTWVzc2FnZSAmJiB0eXBlb2Ygb3B0aW9uLmVycm9yUmVzcG9uc2VNZXNzYWdlICE9PSAnc3RyaW5nJykge1xuICAgICAgICB0aHJvdyBgcmF0ZUxpbWl0LmVycm9yUmVzcG9uc2VNZXNzYWdlIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgfVxuICAgICAgY29uc3Qgb3B0aW9ucyA9IE9iamVjdC5rZXlzKFBhcnNlU2VydmVyLlJhdGVMaW1pdFpvbmUpO1xuICAgICAgaWYgKG9wdGlvbi56b25lICYmICFvcHRpb25zLmluY2x1ZGVzKG9wdGlvbi56b25lKSkge1xuICAgICAgICBjb25zdCBmb3JtYXR0ZXIgPSBuZXcgSW50bC5MaXN0Rm9ybWF0KCdlbicsIHsgc3R5bGU6ICdzaG9ydCcsIHR5cGU6ICdkaXNqdW5jdGlvbicgfSk7XG4gICAgICAgIHRocm93IGByYXRlTGltaXQuem9uZSBtdXN0IGJlIG9uZSBvZiAke2Zvcm1hdHRlci5mb3JtYXQob3B0aW9ucyl9YDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBnZW5lcmF0ZUVtYWlsVmVyaWZ5VG9rZW5FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLnZlcmlmeVVzZXJFbWFpbHMgfHwgIXRoaXMuZW1haWxWZXJpZnlUb2tlblZhbGlkaXR5RHVyYXRpb24pIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIHZhciBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5lbWFpbFZlcmlmeVRva2VuVmFsaWRpdHlEdXJhdGlvbiAqIDEwMDApO1xuICB9XG5cbiAgZ2VuZXJhdGVQYXNzd29yZFJlc2V0VG9rZW5FeHBpcmVzQXQoKSB7XG4gICAgaWYgKCF0aGlzLnBhc3N3b3JkUG9saWN5IHx8ICF0aGlzLnBhc3N3b3JkUG9saWN5LnJlc2V0VG9rZW5WYWxpZGl0eUR1cmF0aW9uKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIHJldHVybiBuZXcgRGF0ZShub3cuZ2V0VGltZSgpICsgdGhpcy5wYXNzd29yZFBvbGljeS5yZXNldFRva2VuVmFsaWRpdHlEdXJhdGlvbiAqIDEwMDApO1xuICB9XG5cbiAgZ2VuZXJhdGVTZXNzaW9uRXhwaXJlc0F0KCkge1xuICAgIGlmICghdGhpcy5leHBpcmVJbmFjdGl2ZVNlc3Npb25zKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgICB2YXIgbm93ID0gbmV3IERhdGUoKTtcbiAgICByZXR1cm4gbmV3IERhdGUobm93LmdldFRpbWUoKSArIHRoaXMuc2Vzc2lvbkxlbmd0aCAqIDEwMDApO1xuICB9XG5cbiAgdW5yZWdpc3RlclJhdGVMaW1pdGVycygpIHtcbiAgICBsZXQgaSA9IHRoaXMucmF0ZUxpbWl0cz8ubGVuZ3RoO1xuICAgIHdoaWxlIChpLS0pIHtcbiAgICAgIGNvbnN0IGxpbWl0ID0gdGhpcy5yYXRlTGltaXRzW2ldO1xuICAgICAgaWYgKGxpbWl0LmNsb3VkKSB7XG4gICAgICAgIHRoaXMucmF0ZUxpbWl0cy5zcGxpY2UoaSwgMSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZ2V0IGludmFsaWRMaW5rVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLmludmFsaWRMaW5rIHx8IGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL2ludmFsaWRfbGluay5odG1sYDtcbiAgfVxuXG4gIGdldCBpbnZhbGlkVmVyaWZpY2F0aW9uTGlua1VSTCgpIHtcbiAgICByZXR1cm4gKFxuICAgICAgdGhpcy5jdXN0b21QYWdlcy5pbnZhbGlkVmVyaWZpY2F0aW9uTGluayB8fFxuICAgICAgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvaW52YWxpZF92ZXJpZmljYXRpb25fbGluay5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgbGlua1NlbmRTdWNjZXNzVVJMKCkge1xuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmN1c3RvbVBhZ2VzLmxpbmtTZW5kU3VjY2VzcyB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9saW5rX3NlbmRfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgbGlua1NlbmRGYWlsVVJMKCkge1xuICAgIHJldHVybiB0aGlzLmN1c3RvbVBhZ2VzLmxpbmtTZW5kRmFpbCB8fCBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy9saW5rX3NlbmRfZmFpbC5odG1sYDtcbiAgfVxuXG4gIGdldCB2ZXJpZnlFbWFpbFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMudmVyaWZ5RW1haWxTdWNjZXNzIHx8XG4gICAgICBgJHt0aGlzLnB1YmxpY1NlcnZlclVSTH0vYXBwcy92ZXJpZnlfZW1haWxfc3VjY2Vzcy5odG1sYFxuICAgICk7XG4gIH1cblxuICBnZXQgY2hvb3NlUGFzc3dvcmRVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMuY2hvb3NlUGFzc3dvcmQgfHwgYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9L2FwcHMvY2hvb3NlX3Bhc3N3b3JkYDtcbiAgfVxuXG4gIGdldCByZXF1ZXN0UmVzZXRQYXNzd29yZFVSTCgpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9LyR7dGhpcy5wYWdlc0VuZHBvaW50fS8ke3RoaXMuYXBwbGljYXRpb25JZH0vcmVxdWVzdF9wYXNzd29yZF9yZXNldGA7XG4gIH1cblxuICBnZXQgcGFzc3dvcmRSZXNldFN1Y2Nlc3NVUkwoKSB7XG4gICAgcmV0dXJuIChcbiAgICAgIHRoaXMuY3VzdG9tUGFnZXMucGFzc3dvcmRSZXNldFN1Y2Nlc3MgfHxcbiAgICAgIGAke3RoaXMucHVibGljU2VydmVyVVJMfS9hcHBzL3Bhc3N3b3JkX3Jlc2V0X3N1Y2Nlc3MuaHRtbGBcbiAgICApO1xuICB9XG5cbiAgZ2V0IHBhcnNlRnJhbWVVUkwoKSB7XG4gICAgcmV0dXJuIHRoaXMuY3VzdG9tUGFnZXMucGFyc2VGcmFtZVVSTDtcbiAgfVxuXG4gIGdldCB2ZXJpZnlFbWFpbFVSTCgpIHtcbiAgICByZXR1cm4gYCR7dGhpcy5wdWJsaWNTZXJ2ZXJVUkx9LyR7dGhpcy5wYWdlc0VuZHBvaW50fS8ke3RoaXMuYXBwbGljYXRpb25JZH0vdmVyaWZ5X2VtYWlsYDtcbiAgfVxuXG4gIC8vIFRPRE86IFJlbW92ZSB0aGlzIGZ1bmN0aW9uIG9uY2UgUGFnZXNSb3V0ZXIgcmVwbGFjZXMgdGhlIFB1YmxpY0FQSVJvdXRlcjtcbiAgLy8gdGhlIChkZWZhdWx0KSBlbmRwb2ludCBoYXMgdG8gYmUgZGVmaW5lZCBpbiBQYWdlc1JvdXRlciBvbmx5LlxuICBnZXQgcGFnZXNFbmRwb2ludCgpIHtcbiAgICByZXR1cm4gdGhpcy5wYWdlcyAmJiB0aGlzLnBhZ2VzLmVuYWJsZVJvdXRlciAmJiB0aGlzLnBhZ2VzLnBhZ2VzRW5kcG9pbnRcbiAgICAgID8gdGhpcy5wYWdlcy5wYWdlc0VuZHBvaW50XG4gICAgICA6ICdhcHBzJztcbiAgfVxufVxuXG5leHBvcnQgZGVmYXVsdCBDb25maWc7XG5tb2R1bGUuZXhwb3J0cyA9IENvbmZpZztcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBSUEsSUFBQUEsT0FBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsSUFBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUcsTUFBQSxHQUFBRCxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUksbUJBQUEsR0FBQUYsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFLLGlCQUFBLEdBQUFMLE9BQUE7QUFDQSxJQUFBTSxRQUFBLEdBQUFOLE9BQUE7QUFDQSxJQUFBTyxZQUFBLEdBQUFQLE9BQUE7QUFXQSxJQUFBUSxN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