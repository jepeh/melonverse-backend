"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.addRateLimit = exports.DEFAULT_ALLOWED_HEADERS = void 0;
exports.allowCrossDomain = allowCrossDomain;
exports.allowMethodOverride = allowMethodOverride;
exports.checkIp = void 0;
exports.enforceMasterKeyAccess = enforceMasterKeyAccess;
exports.handleParseErrors = handleParseErrors;
exports.handleParseHeaders = handleParseHeaders;
exports.handleParseSession = void 0;
exports.promiseEnforceMasterKeyAccess = promiseEnforceMasterKeyAccess;
exports.promiseEnsureIdempotency = promiseEnsureIdempotency;
var _cache = _interopRequireDefault(require("./cache"));
var _node = _interopRequireDefault(require("parse/node"));
var _Auth = _interopRequireDefault(require("./Auth"));
var _Config = _interopRequireDefault(require("./Config"));
var _ClientSDK = _interopRequireDefault(require("./ClientSDK"));
var _logger = _interopRequireDefault(require("./logger"));
var _rest = _interopRequireDefault(require("./rest"));
var _MongoStorageAdapter = _interopRequireDefault(require("./Adapters/Storage/Mongo/MongoStorageAdapter"));
var _PostgresStorageAdapter = _interopRequireDefault(require("./Adapters/Storage/Postgres/PostgresStorageAdapter"));
var _expressRateLimit = _interopRequireDefault(require("express-rate-limit"));
var _Definitions = require("./Options/Definitions");
var _pathToRegexp = require("path-to-regexp");
var _rateLimitRedis = _interopRequireDefault(require("rate-limit-redis"));
var _redis = require("redis");
var _net = require("net");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
const DEFAULT_ALLOWED_HEADERS = exports.DEFAULT_ALLOWED_HEADERS = 'X-Parse-Master-Key, X-Parse-REST-API-Key, X-Parse-Javascript-Key, X-Parse-Application-Id, X-Parse-Client-Version, X-Parse-Session-Token, X-Requested-With, X-Parse-Revocable-Session, X-Parse-Request-Id, Content-Type, Pragma, Cache-Control';
const getMountForRequest = function (req) {
  const mountPathLength = req.originalUrl.length - req.url.length;
  const mountPath = req.originalUrl.slice(0, mountPathLength);
  return req.protocol + '://' + req.get('host') + mountPath;
};
const getBlockList = (ipRangeList, store) => {
  if (store.get('blockList')) return store.get('blockList');
  const blockList = new _net.BlockList();
  ipRangeList.forEach(fullIp => {
    if (fullIp === '::/0' || fullIp === '::') {
      store.set('allowAllIpv6', true);
      return;
    }
    if (fullIp === '0.0.0.0/0' || fullIp === '0.0.0.0') {
      store.set('allowAllIpv4', true);
      return;
    }
    const [ip, mask] = fullIp.split('/');
    if (!mask) {
      blockList.addAddress(ip, (0, _net.isIPv4)(ip) ? 'ipv4' : 'ipv6');
    } else {
      blockList.addSubnet(ip, Number(mask), (0, _net.isIPv4)(ip) ? 'ipv4' : 'ipv6');
    }
  });
  store.set('blockList', blockList);
  return blockList;
};
const checkIp = (ip, ipRangeList, store) => {
  const incomingIpIsV4 = (0, _net.isIPv4)(ip);
  const blockList = getBlockList(ipRangeList, store);
  if (store.get(ip)) return true;
  if (store.get('allowAllIpv4') && incomingIpIsV4) return true;
  if (store.get('allowAllIpv6') && !incomingIpIsV4) return true;
  const result = blockList.check(ip, incomingIpIsV4 ? 'ipv4' : 'ipv6');

  // If the ip is in the list, we store the result in the store
  // so we have a optimized path for the next request
  if (ipRangeList.includes(ip) && result) {
    store.set(ip, result);
  }
  return result;
};

// Checks that the request is authorized for this app and checks user
// auth too.
// The bodyparser should run before this middleware.
// Adds info to the request:
// req.config - the Config for this app
// req.auth - the Auth for this request
exports.checkIp = checkIp;
function handleParseHeaders(req, res, next) {
  var mount = getMountForRequest(req);
  let context = {};
  if (req.get('X-Parse-Cloud-Context') != null) {
    try {
      context = JSON.parse(req.get('X-Parse-Cloud-Context'));
      if (Object.prototype.toString.call(context) !== '[object Object]') {
        throw 'Context is not an object';
      }
    } catch (e) {
      return malformedContext(req, res);
    }
  }
  var info = {
    appId: req.get('X-Parse-Application-Id'),
    sessionToken: req.get('X-Parse-Session-Token'),
    masterKey: req.get('X-Parse-Master-Key'),
    maintenanceKey: req.get('X-Parse-Maintenance-Key'),
    installationId: req.get('X-Parse-Installation-Id'),
    clientKey: req.get('X-Parse-Client-Key'),
    javascriptKey: req.get('X-Parse-Javascript-Key'),
    dotNetKey: req.get('X-Parse-Windows-Key'),
    restAPIKey: req.get('X-Parse-REST-API-Key'),
    clientVersion: req.get('X-Parse-Client-Version'),
    context: context
  };
  var basicAuth = httpAuth(req);
  if (basicAuth) {
    var basicAuthAppId = basicAuth.appId;
    if (_cache.default.get(basicAuthAppId)) {
      info.appId = basicAuthAppId;
      info.masterKey = basicAuth.masterKey || info.masterKey;
      info.javascriptKey = basicAuth.javascriptKey || info.javascriptKey;
    }
  }
  if (req.body) {
    // Unity SDK sends a _noBody key which needs to be removed.
    // Unclear at this point if action needs to be taken.
    delete req.body._noBody;
  }
  var fileViaJSON = false;
  if (!info.appId || !_cache.default.get(info.appId)) {
    // See if we can find the app id on the body.
    if (req.body instanceof Buffer) {
      // The only chance to find the app id is if this is a file
      // upload that actually is a JSON body. So try to parse it.
      // https://github.com/parse-community/parse-server/issues/6589
      // It is also possible that the client is trying to upload a file but forgot
      // to provide x-parse-app-id in header and parse a binary file will fail
      try {
        req.body = JSON.parse(req.body);
      } catch (e) {
        return invalidRequest(req, res);
      }
      fileViaJSON = true;
    }
    if (req.body) {
      delete req.body._RevocableSession;
    }
    if (req.body && req.body._ApplicationId && _cache.default.get(req.body._ApplicationId) && (!info.masterKey || _cache.default.get(req.body._ApplicationId).masterKey === info.masterKey)) {
      info.appId = req.body._ApplicationId;
      info.javascriptKey = req.body._JavaScriptKey || '';
      delete req.body._ApplicationId;
      delete req.body._JavaScriptKey;
      // TODO: test that the REST API formats generated by the other
      // SDKs are handled ok
      if (req.body._ClientVersion) {
        info.clientVersion = req.body._ClientVersion;
        delete req.body._ClientVersion;
      }
      if (req.body._InstallationId) {
        info.installationId = req.body._InstallationId;
        delete req.body._InstallationId;
      }
      if (req.body._SessionToken) {
        info.sessionToken = req.body._SessionToken;
        delete req.body._SessionToken;
      }
      if (req.body._MasterKey) {
        info.masterKey = req.body._MasterKey;
        delete req.body._MasterKey;
      }
      if (req.body._context) {
        if (req.body._context instanceof Object) {
          info.context = req.body._context;
        } else {
          try {
            info.context = JSON.parse(req.body._context);
            if (Object.prototype.toString.call(info.context) !== '[object Object]') {
              throw 'Context is not an object';
            }
          } catch (e) {
            return malformedContext(req, res);
          }
        }
        delete req.body._context;
      }
      if (req.body._ContentType) {
        req.headers['content-type'] = req.body._ContentType;
        delete req.body._ContentType;
      }
    } else {
      return invalidRequest(req, res);
    }
  }
  if (info.sessionToken && typeof info.sessionToken !== 'string') {
    info.sessionToken = info.sessionToken.toString();
  }
  if (info.clientVersion) {
    info.clientSDK = _ClientSDK.default.fromString(info.clientVersion);
  }
  if (fileViaJSON) {
    req.fileData = req.body.fileData;
    // We need to repopulate req.body with a buffer
    var base64 = req.body.base64;
    req.body = Buffer.from(base64, 'base64');
  }
  const clientIp = getClientIp(req);
  const config = _Config.default.get(info.appId, mount);
  if (config.state && config.state !== 'ok') {
    res.status(500);
    res.json({
      code: _node.default.Error.INTERNAL_SERVER_ERROR,
      error: `Invalid server state: ${config.state}`
    });
    return;
  }
  info.app = _cache.default.get(info.appId);
  req.config = config;
  req.config.headers = req.headers || {};
  req.config.ip = clientIp;
  req.info = info;
  const isMaintenance = req.config.maintenanceKey && info.maintenanceKey === req.config.maintenanceKey;
  if (isMaintenance) {
    var _req$config;
    if (checkIp(clientIp, req.config.maintenanceKeyIps || [], req.config.maintenanceKeyIpsStore)) {
      req.auth = new _Auth.default.Auth({
        config: req.config,
        installationId: info.installationId,
        isMaintenance: true
      });
      next();
      return;
    }
    const log = ((_req$config = req.config) === null || _req$config === void 0 ? void 0 : _req$config.loggerController) || _logger.default;
    log.error(`Request using maintenance key rejected as the request IP address '${clientIp}' is not set in Parse Server option 'maintenanceKeyIps'.`);
  }
  let isMaster = info.masterKey === req.config.masterKey;
  if (isMaster && !checkIp(clientIp, req.config.masterKeyIps || [], req.config.masterKeyIpsStore)) {
    var _req$config2;
    const log = ((_req$config2 = req.config) === null || _req$config2 === void 0 ? void 0 : _req$config2.loggerController) || _logger.default;
    log.error(`Request using master key rejected as the request IP address '${clientIp}' is not set in Parse Server option 'masterKeyIps'.`);
    isMaster = false;
    const error = new Error();
    error.status = 403;
    error.message = `unauthorized`;
    throw error;
  }
  if (isMaster) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: true
    });
    return handleRateLimit(req, res, next);
  }
  var isReadOnlyMaster = info.masterKey === req.config.readOnlyMasterKey;
  if (typeof req.config.readOnlyMasterKey != 'undefined' && req.config.readOnlyMasterKey && isReadOnlyMaster) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: true,
      isReadOnly: true
    });
    return handleRateLimit(req, res, next);
  }

  // Client keys are not required in parse-server, but if any have been configured in the server, validate them
  //  to preserve original behavior.
  const keys = ['clientKey', 'javascriptKey', 'dotNetKey', 'restAPIKey'];
  const oneKeyConfigured = keys.some(function (key) {
    return req.config[key] !== undefined;
  });
  const oneKeyMatches = keys.some(function (key) {
    return req.config[key] !== undefined && info[key] === req.config[key];
  });
  if (oneKeyConfigured && !oneKeyMatches) {
    return invalidRequest(req, res);
  }
  if (req.url == '/login') {
    delete info.sessionToken;
  }
  if (req.userFromJWT) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: false,
      user: req.userFromJWT
    });
    return handleRateLimit(req, res, next);
  }
  if (!info.sessionToken) {
    req.auth = new _Auth.default.Auth({
      config: req.config,
      installationId: info.installationId,
      isMaster: false
    });
  }
  handleRateLimit(req, res, next);
}
const handleRateLimit = async (req, res, next) => {
  const rateLimits = req.config.rateLimits || [];
  try {
    await Promise.all(rateLimits.map(async limit => {
      const pathExp = new RegExp(limit.path);
      if (pathExp.test(req.url)) {
        await limit.handler(req, res, err => {
          if (err) {
            if (err.code === _node.default.Error.CONNECTION_FAILED) {
              throw err;
            }
            req.config.loggerController.error('An unknown error occured when attempting to apply the rate limiter: ', err);
          }
        });
      }
    }));
  } catch (error) {
    res.status(429);
    res.json({
      code: _node.default.Error.CONNECTION_FAILED,
      error: error.message
    });
    return;
  }
  next();
};
const handleParseSession = async (req, res, next) => {
  try {
    const info = req.info;
    if (req.auth || req.url === '/sessions/me') {
      next();
      return;
    }
    let requestAuth = null;
    if (info.sessionToken && req.url === '/upgradeToRevocableSession' && info.sessionToken.indexOf('r:') != 0) {
      requestAuth = await _Auth.default.getAuthForLegacySessionToken({
        config: req.config,
        installationId: info.installationId,
        sessionToken: info.sessionToken
      });
    } else {
      requestAuth = await _Auth.default.getAuthForSessionToken({
        config: req.config,
        installationId: info.installationId,
        sessionToken: info.sessionToken
      });
    }
    req.auth = requestAuth;
    next();
  } catch (error) {
    if (error instanceof _node.default.Error) {
      next(error);
      return;
    }
    // TODO: Determine the correct error scenario.
    req.config.loggerController.error('error getting auth for sessionToken', error);
    throw new _node.default.Error(_node.default.Error.UNKNOWN_ERROR, error);
  }
};
exports.handleParseSession = handleParseSession;
function getClientIp(req) {
  return req.ip;
}
function httpAuth(req) {
  if (!(req.req || req).headers.authorization) return;
  var header = (req.req || req).headers.authorization;
  var appId, masterKey, javascriptKey;

  // parse header
  var authPrefix = 'basic ';
  var match = header.toLowerCase().indexOf(authPrefix);
  if (match == 0) {
    var encodedAuth = header.substring(authPrefix.length, header.length);
    var credentials = decodeBase64(encodedAuth).split(':');
    if (credentials.length == 2) {
      appId = credentials[0];
      var key = credentials[1];
      var jsKeyPrefix = 'javascript-key=';
      var matchKey = key.indexOf(jsKeyPrefix);
      if (matchKey == 0) {
        javascriptKey = key.substring(jsKeyPrefix.length, key.length);
      } else {
        masterKey = key;
      }
    }
  }
  return {
    appId: appId,
    masterKey: masterKey,
    javascriptKey: javascriptKey
  };
}
function decodeBase64(str) {
  return Buffer.from(str, 'base64').toString();
}
function allowCrossDomain(appId) {
  return (req, res, next) => {
    const config = _Config.default.get(appId, getMountForRequest(req));
    let allowHeaders = DEFAULT_ALLOWED_HEADERS;
    if (config && config.allowHeaders) {
      allowHeaders += `, ${config.allowHeaders.join(', ')}`;
    }
    const baseOrigins = typeof (config === null || config === void 0 ? void 0 : config.allowOrigin) === 'string' ? [config.allowOrigin] : (config === null || config === void 0 ? void 0 : config.allowOrigin) ?? ['*'];
    const requestOrigin = req.headers.origin;
    const allowOrigins = requestOrigin && baseOrigins.includes(requestOrigin) ? requestOrigin : baseOrigins[0];
    res.header('Access-Control-Allow-Origin', allowOrigins);
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', allowHeaders);
    res.header('Access-Control-Expose-Headers', 'X-Parse-Job-Status-Id, X-Parse-Push-Status-Id');
    // intercept OPTIONS method
    if ('OPTIONS' == req.method) {
      res.sendStatus(200);
    } else {
      next();
    }
  };
}
function allowMethodOverride(req, res, next) {
  if (req.method === 'POST' && req.body._method) {
    req.originalMethod = req.method;
    req.method = req.body._method;
    delete req.body._method;
  }
  next();
}
function handleParseErrors(err, req, res, next) {
  const log = req.config && req.config.loggerController || _logger.default;
  if (err instanceof _node.default.Error) {
    if (req.config && req.config.enableExpressErrorHandler) {
      return next(err);
    }
    let httpStatus;
    // TODO: fill out this mapping
    switch (err.code) {
      case _node.default.Error.INTERNAL_SERVER_ERROR:
        httpStatus = 500;
        break;
      case _node.default.Error.OBJECT_NOT_FOUND:
        httpStatus = 404;
        break;
      default:
        httpStatus = 400;
    }
    res.status(httpStatus);
    res.json({
      code: err.code,
      error: err.message
    });
    log.error('Parse error: ', err);
  } else if (err.status && err.message) {
    res.status(err.status);
    res.json({
      error: err.message
    });
    if (!(process && process.env.TESTING)) {
      next(err);
    }
  } else {
    log.error('Uncaught internal server error.', err, err.stack);
    res.status(500);
    res.json({
      code: _node.default.Error.INTERNAL_SERVER_ERROR,
      message: 'Internal server error.'
    });
    if (!(process && process.env.TESTING)) {
      next(err);
    }
  }
}
function enforceMasterKeyAccess(req, res, next) {
  if (!req.auth.isMaster) {
    res.status(403);
    res.end('{"error":"unauthorized: master key is required"}');
    return;
  }
  next();
}
function promiseEnforceMasterKeyAccess(request) {
  if (!request.auth.isMaster) {
    const error = new Error();
    error.status = 403;
    error.message = 'unauthorized: master key is required';
    throw error;
  }
  return Promise.resolve();
}
const addRateLimit = (route, config, cloud) => {
  if (typeof config === 'string') {
    config = _Config.default.get(config);
  }
  for (const key in route) {
    if (!_Definitions.RateLimitOptions[key]) {
      throw `Invalid rate limit option "${key}"`;
    }
  }
  if (!config.rateLimits) {
    config.rateLimits = [];
  }
  const redisStore = {
    connectionPromise: Promise.resolve(),
    store: null,
    connected: false
  };
  if (route.redisUrl) {
    const client = (0, _redis.createClient)({
      url: route.redisUrl
    });
    redisStore.connectionPromise = async () => {
      if (redisStore.connected) {
        return;
      }
      try {
        await client.connect();
        redisStore.connected = true;
      } catch (e) {
        var _config;
        const log = ((_config = config) === null || _config === void 0 ? void 0 : _config.loggerController) || _logger.default;
        log.error(`Could not connect to redisURL in rate limit: ${e}`);
      }
    };
    redisStore.connectionPromise();
    redisStore.store = new _rateLimitRedis.default({
      sendCommand: async (...args) => {
        await redisStore.connectionPromise();
        return client.sendCommand(args);
      }
    });
  }
  let transformPath = route.requestPath.split('/*').join('/(.*)');
  if (transformPath === '*') {
    transformPath = '(.*)';
  }
  config.rateLimits.push({
    path: (0, _pathToRegexp.pathToRegexp)(transformPath),
    handler: (0, _expressRateLimit.default)({
      windowMs: route.requestTimeWindow,
      max: route.requestCount,
      message: route.errorResponseMessage || _Definitions.RateLimitOptions.errorResponseMessage.default,
      handler: (request, response, next, options) => {
        throw {
          code: _node.default.Error.CONNECTION_FAILED,
          message: options.message
        };
      },
      skip: request => {
        var _request$auth;
        if (request.ip === '127.0.0.1' && !route.includeInternalRequests) {
          return true;
        }
        if (route.includeMasterKey) {
          return false;
        }
        if (route.requestMethods) {
          if (Array.isArray(route.requestMethods)) {
            if (!route.requestMethods.includes(request.method)) {
              return true;
            }
          } else {
            const regExp = new RegExp(route.requestMethods);
            if (!regExp.test(request.method)) {
              return true;
            }
          }
        }
        return (_request$auth = request.auth) === null || _request$auth === void 0 ? void 0 : _request$auth.isMaster;
      },
      keyGenerator: async request => {
        if (route.zone === _node.default.Server.RateLimitZone.global) {
          return request.config.appId;
        }
        const token = request.info.sessionToken;
        if (route.zone === _node.default.Server.RateLimitZone.session && token) {
          return token;
        }
        if (route.zone === _node.default.Server.RateLimitZone.user && token) {
          var _request$auth2;
          if (!request.auth) {
            await new Promise(resolve => handleParseSession(request, null, resolve));
          }
          if ((_request$auth2 = request.auth) !== null && _request$auth2 !== void 0 && (_request$auth2 = _request$auth2.user) !== null && _request$auth2 !== void 0 && _request$auth2.id && request.zone === 'user') {
            return request.auth.user.id;
          }
        }
        return request.config.ip;
      },
      store: redisStore.store
    }),
    cloud
  });
  _Config.default.put(config);
};

/**
 * Deduplicates a request to ensure idempotency. Duplicates are determined by the request ID
 * in the request header. If a request has no request ID, it is executed anyway.
 * @param {*} req The request to evaluate.
 * @returns Promise<{}>
 */
exports.addRateLimit = addRateLimit;
function promiseEnsureIdempotency(req) {
  // Enable feature only for MongoDB
  if (!(req.config.database.adapter instanceof _MongoStorageAdapter.default || req.config.database.adapter instanceof _PostgresStorageAdapter.default)) {
    return Promise.resolve();
  }
  // Get parameters
  const config = req.config;
  const requestId = ((req || {}).headers || {})['x-parse-request-id'];
  const {
    paths,
    ttl
  } = config.idempotencyOptions;
  if (!requestId || !config.idempotencyOptions) {
    return Promise.resolve();
  }
  // Request path may contain trailing slashes, depending on the original request, so remove
  // leading and trailing slashes to make it easier to specify paths in the configuration
  const reqPath = req.path.replace(/^\/|\/$/, '');
  // Determine whether idempotency is enabled for current request path
  let match = false;
  for (const path of paths) {
    // Assume one wants a path to always match from the beginning to prevent any mistakes
    const regex = new RegExp(path.charAt(0) === '^' ? path : '^' + path);
    if (reqPath.match(regex)) {
      match = true;
      break;
    }
  }
  if (!match) {
    return Promise.resolve();
  }
  // Try to store request
  const expiryDate = new Date(new Date().setSeconds(new Date().getSeconds() + ttl));
  return _rest.default.create(config, _Auth.default.master(config), '_Idempotency', {
    reqId: requestId,
    expire: _node.default._encode(expiryDate)
  }).catch(e => {
    if (e.code == _node.default.Error.DUPLICATE_VALUE) {
      throw new _node.default.Error(_node.default.Error.DUPLICATE_REQUEST, 'Duplicate request');
    }
    throw e;
  });
}
function invalidRequest(req, res) {
  res.status(403);
  res.end('{"error":"unauthorized"}');
}
function malformedContext(req, res) {
  res.status(400);
  res.json({
    code: _node.default.Error.INVALID_JSON,
    error: 'Invalid object for context.'
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfY2FjaGUiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9ub2RlIiwiX0F1dGgiLCJfQ29uZmlnIiwiX0NsaWVudFNESyIsIl9sb2dnZXIiLCJfcmVzdCIsIl9Nb25nb1N0b3JhZ2VBZGFwdGVyIiwiX1Bvc3RncmVzU3RvcmFnZUFkYXB0ZXIiLCJfZXhwcmVzc1JhdGVMaW1pdCIsIl9EZWZpbml0aW9ucyIsIl9wYXRoVG9SZWdleHAiLCJfcmF0ZUxpbWl0UmVkaXMiLCJfcmVkaXMiLCJfbmV0Iiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJERUZBVUxUX0FMTE9XRURfSEVBREVSUyIsImV4cG9ydHMiLCJnZXRNb3VudEZvclJlcXVlc3QiLCJyZXEiLCJtb3VudFBhdGhMZW5ndGgiLCJvcmlnaW5hbFVybCIsImxlbmd0aCIsInVybCIsIm1vdW50UGF0aCIsInNsaWNlIiwicHJvdG9jb2wiLCJnZXQiLCJnZXRCbG9ja0xpc3QiLCJpcFJhbmdlTGlzdCIsInN0b3JlIiwiYmxvY2tMaXN0IiwiQmxvY2tMaXN0IiwiZm9yRWFjaCIsImZ1bGxJcCIsInNldCIsImlwIiwibWFzayIsInNwbGl0IiwiYWRkQWRkcmVzcyIsImlzSVB2NCIsImFkZFN1Ym5ldCIsIk51bWJlciIsImNoZWNrSXAiLCJpbmNvbWluZ0lwSXNWNCIsInJlc3VsdCIsImNoZWNrIiwiaW5jbHVkZXMiLCJoYW5kbGVQYXJzZUhlYWRlcnMiLCJyZXMiLCJuZXh0IiwibW91bnQiLCJjb250ZXh0IiwiSlNPTiIsInBhcnNlIiwiT2JqZWN0IiwicHJvdG90eXBlIiwidG9TdHJpbmciLCJjYWxsIiwiZSIsIm1hbGZvcm1lZENvbnRleHQiLCJpbmZvIiwiYXBwSWQiLCJzZXNzaW9uVG9rZW4iLCJtYXN0ZXJLZXkiLCJtYWludGVuYW5jZUtleSIsImluc3RhbGxhdGlvbklkIiwiY2xpZW50S2V5IiwiamF2YXNjcmlwdEtleSIsImRvdE5ldEtleSIsInJlc3RBUElLZXkiLCJjbGllbnRWZXJzaW9uIiwiYmFzaWNBdXRoIiwiaHR0cEF1dGgiLCJiYXNpY0F1dGhBcHBJZCIsIkFwcENhY2hlIiwiYm9keSIsIl9ub0JvZHkiLCJmaWxlVmlhSlNPTiIsIkJ1ZmZlciIsImludmFsaWRSZXF1ZXN0IiwiX1Jldm9jYWJsZVNlc3Npb24iLCJfQXBwbGljYXRpb25JZCIsIl9KYXZhU2NyaXB0S2V5IiwiX0NsaWVudFZlcnNpb24iLCJfSW5zdGFsbGF0aW9uSWQiLCJfU2Vzc2lvblRva2VuIiwiX01hc3RlcktleSIsIl9jb250ZXh0IiwiX0NvbnRlbnRUeXBlIiwiaGVhZGVycyIsImNsaWVudFNESyIsIkNsaWVudFNESyIsImZyb21TdHJpbmciLCJmaWxlRGF0YSIsImJhc2U2NCIsImZyb20iLCJjbGllbnRJcCIsImdldENsaWVudElwIiwiY29uZmlnIiwiQ29uZmlnIiwic3RhdGUiLCJzdGF0dXMiLCJqc29uIiwiY29kZSIsIlBhcnNlIiwiRXJyb3IiLCJJTlRFUk5BTF9TRVJWRVJfRVJST1IiLCJlcnJvciIsImFwcCIsImlzTWFpbnRlbmFuY2UiLCJfcmVxJGNvbmZpZyIsIm1haW50ZW5hbmNlS2V5SXBzIiwibWFpbnRlbmFuY2VLZXlJcHNTdG9yZSIsImF1dGgiLCJBdXRoIiwibG9nIiwibG9nZ2VyQ29udHJvbGxlciIsImRlZmF1bHRMb2dnZXIiLCJpc01hc3RlciIsIm1hc3RlcktleUlwcyIsIm1hc3RlcktleUlwc1N0b3JlIiwiX3JlcSRjb25maWcyIiwibWVzc2FnZSIsImhhbmRsZVJhdGVMaW1pdCIsImlzUmVhZE9ubHlNYXN0ZXIiLCJyZWFkT25seU1hc3RlcktleSIsImlzUmVhZE9ubHkiLCJrZXlzIiwib25lS2V5Q29uZmlndXJlZCIsInNvbWUiLCJrZXkiLCJ1bmRlZmluZWQiLCJvbmVLZXlNYXRjaGVzIiwidXNlckZyb21KV1QiLCJ1c2VyIiwicmF0ZUxpbWl0cyIsIlByb21pc2UiLCJhbGwiLCJtYXAiLCJsaW1pdCIsInBhdGhFeHAiLCJSZWdFeHAiLCJwYXRoIiwidGVzdCIsImhhbmRsZXIiLCJlcnIiLCJDT05ORUNUSU9OX0ZBSUxFRCIsImhhbmRsZVBhcnNlU2Vzc2lvbiIsInJlcXVlc3RBdXRoIiwiaW5kZXhPZiIsImdldEF1dGhGb3JMZWdhY3lTZXNzaW9uVG9rZW4iLCJnZXRBdXRoRm9yU2Vzc2lvblRva2VuIiwiVU5LTk9XTl9FUlJPUiIsImF1dGhvcml6YXRpb24iLCJoZWFkZXIiLCJhdXRoUHJlZml4IiwibWF0Y2giLCJ0b0xvd2VyQ2FzZSIsImVuY29kZWRBdXRoIiwic3Vic3RyaW5nIiwiY3JlZGVudGlhbHMiLCJkZWNvZGVCYXNlNjQiLCJqc0tleVByZWZpeCIsIm1hdGNoS2V5Iiwic3RyIiwiYWxsb3dDcm9zc0RvbWFpbiIsImFsbG93SGVhZGVycyIsImpvaW4iLCJiYXNlT3JpZ2lucyIsImFsbG93T3JpZ2luIiwicmVxdWVzdE9yaWdpbiIsIm9yaWdpbiIsImFsbG93T3JpZ2lucyIsIm1ldGhvZCIsInNlbmRTdGF0dXMiLCJhbGxvd01ldGhvZE92ZXJyaWRlIiwiX21ldGhvZCIsIm9yaWdpbmFsTWV0aG9kIiwiaGFuZGxlUGFyc2VFcnJvcnMiLCJlbmFibGVFeHByZXNzRXJyb3JIYW5kbGVyIiwiaHR0cFN0YXR1cyIsIk9CSkVDVF9OT1RfRk9VTkQiLCJwcm9jZXNzIiwiZW52IiwiVEVTVElORyIsInN0YWNrIiwiZW5mb3JjZU1hc3RlcktleUFjY2VzcyIsImVuZCIsInByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzIiwicmVxdWVzdCIsInJlc29sdmUiLCJhZGRSYXRlTGltaXQiLCJyb3V0ZSIsImNsb3VkIiwiUmF0ZUxpbWl0T3B0aW9ucyIsInJlZGlzU3RvcmUiLCJjb25uZWN0aW9uUHJvbWlzZSIsImNvbm5lY3RlZCIsInJlZGlzVXJsIiwiY2xpZW50IiwiY3JlYXRlQ2xpZW50IiwiY29ubmVjdCIsIl9jb25maWciLCJSZWRpc1N0b3JlIiwic2VuZENvbW1hbmQiLCJhcmdzIiwidHJhbnNmb3JtUGF0aCIsInJlcXVlc3RQYXRoIiwicHVzaCIsInBhdGhUb1JlZ2V4cCIsInJhdGVMaW1pdCIsIndpbmRvd01zIiwicmVxdWVzdFRpbWVXaW5kb3ciLCJtYXgiLCJyZXF1ZXN0Q291bnQiLCJlcnJvclJlc3BvbnNlTWVzc2FnZSIsInJlc3BvbnNlIiwib3B0aW9ucyIsInNraXAiLCJfcmVxdWVzdCRhdXRoIiwiaW5jbHVkZUludGVybmFsUmVxdWVzdHMiLCJpbmNsdWRlTWFzdGVyS2V5IiwicmVxdWVzdE1ldGhvZHMiLCJBcnJheSIsImlzQXJyYXkiLCJyZWdFeHAiLCJrZXlHZW5lcmF0b3IiLCJ6b25lIiwiU2VydmVyIiwiUmF0ZUxpbWl0Wm9uZSIsImdsb2JhbCIsInRva2VuIiwic2Vzc2lvbiIsIl9yZXF1ZXN0JGF1dGgyIiwiaWQiLCJwdXQiLCJwcm9taXNlRW5zdXJlSWRlbXBvdGVuY3kiLCJkYXRhYmFzZSIsImFkYXB0ZXIiLCJNb25nb1N0b3JhZ2VBZGFwdGVyIiwiUG9zdGdyZXNTdG9yYWdlQWRhcHRlciIsInJlcXVlc3RJZCIsInBhdGhzIiwidHRsIiwiaWRlbXBvdGVuY3lPcHRpb25zIiwicmVxUGF0aCIsInJlcGxhY2UiLCJyZWdleCIsImNoYXJBdCIsImV4cGlyeURhdGUiLCJEYXRlIiwic2V0U2Vjb25kcyIsImdldFNlY29uZHMiLCJyZXN0IiwiY3JlYXRlIiwibWFzdGVyIiwicmVxSWQiLCJleHBpcmUiLCJfZW5jb2RlIiwiY2F0Y2giLCJEVVBMSUNBVEVfVkFMVUUiLCJEVVBMSUNBVEVfUkVRVUVTVCIsIklOVkFMSURfSlNPTiJdLCJzb3VyY2VzIjpbIi4uL3NyYy9taWRkbGV3YXJlcy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgQXBwQ2FjaGUgZnJvbSAnLi9jYWNoZSc7XG5pbXBvcnQgUGFyc2UgZnJvbSAncGFyc2Uvbm9kZSc7XG5pbXBvcnQgYXV0aCBmcm9tICcuL0F1dGgnO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuL0NvbmZpZyc7XG5pbXBvcnQgQ2xpZW50U0RLIGZyb20gJy4vQ2xpZW50U0RLJztcbmltcG9ydCBkZWZhdWx0TG9nZ2VyIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCByZXN0IGZyb20gJy4vcmVzdCc7XG5pbXBvcnQgTW9uZ29TdG9yYWdlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL1N0b3JhZ2UvTW9uZ28vTW9uZ29TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgUG9zdGdyZXNTdG9yYWdlQWRhcHRlciBmcm9tICcuL0FkYXB0ZXJzL1N0b3JhZ2UvUG9zdGdyZXMvUG9zdGdyZXNTdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgcmF0ZUxpbWl0IGZyb20gJ2V4cHJlc3MtcmF0ZS1saW1pdCc7XG5pbXBvcnQgeyBSYXRlTGltaXRPcHRpb25zIH0gZnJvbSAnLi9PcHRpb25zL0RlZmluaXRpb25zJztcbmltcG9ydCB7IHBhdGhUb1JlZ2V4cCB9IGZyb20gJ3BhdGgtdG8tcmVnZXhwJztcbmltcG9ydCBSZWRpc1N0b3JlIGZyb20gJ3JhdGUtbGltaXQtcmVkaXMnO1xuaW1wb3J0IHsgY3JlYXRlQ2xpZW50IH0gZnJvbSAncmVkaXMnO1xuaW1wb3J0IHsgQmxvY2tMaXN0LCBpc0lQdjQgfSBmcm9tICduZXQnO1xuXG5leHBvcnQgY29uc3QgREVGQVVMVF9BTExPV0VEX0hFQURFUlMgPVxuICAnWC1QYXJzZS1NYXN0ZXItS2V5LCBYLVBhcnNlLVJFU1QtQVBJLUtleSwgWC1QYXJzZS1KYXZhc2NyaXB0LUtleSwgWC1QYXJzZS1BcHBsaWNhdGlvbi1JZCwgWC1QYXJzZS1DbGllbnQtVmVyc2lvbiwgWC1QYXJzZS1TZXNzaW9uLVRva2VuLCBYLVJlcXVlc3RlZC1XaXRoLCBYLVBhcnNlLVJldm9jYWJsZS1TZXNzaW9uLCBYLVBhcnNlLVJlcXVlc3QtSWQsIENvbnRlbnQtVHlwZSwgUHJhZ21hLCBDYWNoZS1Db250cm9sJztcblxuY29uc3QgZ2V0TW91bnRGb3JSZXF1ZXN0ID0gZnVuY3Rpb24gKHJlcSkge1xuICBjb25zdCBtb3VudFBhdGhMZW5ndGggPSByZXEub3JpZ2luYWxVcmwubGVuZ3RoIC0gcmVxLnVybC5sZW5ndGg7XG4gIGNvbnN0IG1vdW50UGF0aCA9IHJlcS5vcmlnaW5hbFVybC5zbGljZSgwLCBtb3VudFBhdGhMZW5ndGgpO1xuICByZXR1cm4gcmVxLnByb3RvY29sICsgJzovLycgKyByZXEuZ2V0KCdob3N0JykgKyBtb3VudFBhdGg7XG59O1xuXG5jb25zdCBnZXRCbG9ja0xpc3QgPSAoaXBSYW5nZUxpc3QsIHN0b3JlKSA9PiB7XG4gIGlmIChzdG9yZS5nZXQoJ2Jsb2NrTGlzdCcpKSByZXR1cm4gc3RvcmUuZ2V0KCdibG9ja0xpc3QnKTtcbiAgY29uc3QgYmxvY2tMaXN0ID0gbmV3IEJsb2NrTGlzdCgpO1xuICBpcFJhbmdlTGlzdC5mb3JFYWNoKGZ1bGxJcCA9PiB7XG4gICAgaWYgKGZ1bGxJcCA9PT0gJzo6LzAnIHx8IGZ1bGxJcCA9PT0gJzo6Jykge1xuICAgICAgc3RvcmUuc2V0KCdhbGxvd0FsbElwdjYnLCB0cnVlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgaWYgKGZ1bGxJcCA9PT0gJzAuMC4wLjAvMCcgfHwgZnVsbElwID09PSAnMC4wLjAuMCcpIHtcbiAgICAgIHN0b3JlLnNldCgnYWxsb3dBbGxJcHY0JywgdHJ1ZSk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IFtpcCwgbWFza10gPSBmdWxsSXAuc3BsaXQoJy8nKTtcbiAgICBpZiAoIW1hc2spIHtcbiAgICAgIGJsb2NrTGlzdC5hZGRBZGRyZXNzKGlwLCBpc0lQdjQoaXApID8gJ2lwdjQnIDogJ2lwdjYnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgYmxvY2tMaXN0LmFkZFN1Ym5ldChpcCwgTnVtYmVyKG1hc2spLCBpc0lQdjQoaXApID8gJ2lwdjQnIDogJ2lwdjYnKTtcbiAgICB9XG4gIH0pO1xuICBzdG9yZS5zZXQoJ2Jsb2NrTGlzdCcsIGJsb2NrTGlzdCk7XG4gIHJldHVybiBibG9ja0xpc3Q7XG59O1xuXG5leHBvcnQgY29uc3QgY2hlY2tJcCA9IChpcCwgaXBSYW5nZUxpc3QsIHN0b3JlKSA9PiB7XG4gIGNvbnN0IGluY29taW5nSXBJc1Y0ID0gaXNJUHY0KGlwKTtcbiAgY29uc3QgYmxvY2tMaXN0ID0gZ2V0QmxvY2tMaXN0KGlwUmFuZ2VMaXN0LCBzdG9yZSk7XG5cbiAgaWYgKHN0b3JlLmdldChpcCkpIHJldHVybiB0cnVlO1xuICBpZiAoc3RvcmUuZ2V0KCdhbGxvd0FsbElwdjQnKSAmJiBpbmNvbWluZ0lwSXNWNCkgcmV0dXJuIHRydWU7XG4gIGlmIChzdG9yZS5nZXQoJ2FsbG93QWxsSXB2NicpICYmICFpbmNvbWluZ0lwSXNWNCkgcmV0dXJuIHRydWU7XG4gIGNvbnN0IHJlc3VsdCA9IGJsb2NrTGlzdC5jaGVjayhpcCwgaW5jb21pbmdJcElzVjQgPyAnaXB2NCcgOiAnaXB2NicpO1xuXG4gIC8vIElmIHRoZSBpcCBpcyBpbiB0aGUgbGlzdCwgd2Ugc3RvcmUgdGhlIHJlc3VsdCBpbiB0aGUgc3RvcmVcbiAgLy8gc28gd2UgaGF2ZSBhIG9wdGltaXplZCBwYXRoIGZvciB0aGUgbmV4dCByZXF1ZXN0XG4gIGlmIChpcFJhbmdlTGlzdC5pbmNsdWRlcyhpcCkgJiYgcmVzdWx0KSB7XG4gICAgc3RvcmUuc2V0KGlwLCByZXN1bHQpO1xuICB9XG4gIHJldHVybiByZXN1bHQ7XG59O1xuXG4vLyBDaGVja3MgdGhhdCB0aGUgcmVxdWVzdCBpcyBhdXRob3JpemVkIGZvciB0aGlzIGFwcCBhbmQgY2hlY2tzIHVzZXJcbi8vIGF1dGggdG9vLlxuLy8gVGhlIGJvZHlwYXJzZXIgc2hvdWxkIHJ1biBiZWZvcmUgdGhpcyBtaWRkbGV3YXJlLlxuLy8gQWRkcyBpbmZvIHRvIHRoZSByZXF1ZXN0OlxuLy8gcmVxLmNvbmZpZyAtIHRoZSBDb25maWcgZm9yIHRoaXMgYXBwXG4vLyByZXEuYXV0aCAtIHRoZSBBdXRoIGZvciB0aGlzIHJlcXVlc3RcbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVQYXJzZUhlYWRlcnMocmVxLCByZXMsIG5leHQpIHtcbiAgdmFyIG1vdW50ID0gZ2V0TW91bnRGb3JSZXF1ZXN0KHJlcSk7XG5cbiAgbGV0IGNvbnRleHQgPSB7fTtcbiAgaWYgKHJlcS5nZXQoJ1gtUGFyc2UtQ2xvdWQtQ29udGV4dCcpICE9IG51bGwpIHtcbiAgICB0cnkge1xuICAgICAgY29udGV4dCA9IEpTT04ucGFyc2UocmVxLmdldCgnWC1QYXJzZS1DbG91ZC1Db250ZXh0JykpO1xuICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChjb250ZXh0KSAhPT0gJ1tvYmplY3QgT2JqZWN0XScpIHtcbiAgICAgICAgdGhyb3cgJ0NvbnRleHQgaXMgbm90IGFuIG9iamVjdCc7XG4gICAgICB9XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcmV0dXJuIG1hbGZvcm1lZENvbnRleHQocmVxLCByZXMpO1xuICAgIH1cbiAgfVxuICB2YXIgaW5mbyA9IHtcbiAgICBhcHBJZDogcmVxLmdldCgnWC1QYXJzZS1BcHBsaWNhdGlvbi1JZCcpLFxuICAgIHNlc3Npb25Ub2tlbjogcmVxLmdldCgnWC1QYXJzZS1TZXNzaW9uLVRva2VuJyksXG4gICAgbWFzdGVyS2V5OiByZXEuZ2V0KCdYLVBhcnNlLU1hc3Rlci1LZXknKSxcbiAgICBtYWludGVuYW5jZUtleTogcmVxLmdldCgnWC1QYXJzZS1NYWludGVuYW5jZS1LZXknKSxcbiAgICBpbnN0YWxsYXRpb25JZDogcmVxLmdldCgnWC1QYXJzZS1JbnN0YWxsYXRpb24tSWQnKSxcbiAgICBjbGllbnRLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtQ2xpZW50LUtleScpLFxuICAgIGphdmFzY3JpcHRLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtSmF2YXNjcmlwdC1LZXknKSxcbiAgICBkb3ROZXRLZXk6IHJlcS5nZXQoJ1gtUGFyc2UtV2luZG93cy1LZXknKSxcbiAgICByZXN0QVBJS2V5OiByZXEuZ2V0KCdYLVBhcnNlLVJFU1QtQVBJLUtleScpLFxuICAgIGNsaWVudFZlcnNpb246IHJlcS5nZXQoJ1gtUGFyc2UtQ2xpZW50LVZlcnNpb24nKSxcbiAgICBjb250ZXh0OiBjb250ZXh0LFxuICB9O1xuXG4gIHZhciBiYXNpY0F1dGggPSBodHRwQXV0aChyZXEpO1xuXG4gIGlmIChiYXNpY0F1dGgpIHtcbiAgICB2YXIgYmFzaWNBdXRoQXBwSWQgPSBiYXNpY0F1dGguYXBwSWQ7XG4gICAgaWYgKEFwcENhY2hlLmdldChiYXNpY0F1dGhBcHBJZCkpIHtcbiAgICAgIGluZm8uYXBwSWQgPSBiYXNpY0F1dGhBcHBJZDtcbiAgICAgIGluZm8ubWFzdGVyS2V5ID0gYmFzaWNBdXRoLm1hc3RlcktleSB8fCBpbmZvLm1hc3RlcktleTtcbiAgICAgIGluZm8uamF2YXNjcmlwdEtleSA9IGJhc2ljQXV0aC5qYXZhc2NyaXB0S2V5IHx8IGluZm8uamF2YXNjcmlwdEtleTtcbiAgICB9XG4gIH1cblxuICBpZiAocmVxLmJvZHkpIHtcbiAgICAvLyBVbml0eSBTREsgc2VuZHMgYSBfbm9Cb2R5IGtleSB3aGljaCBuZWVkcyB0byBiZSByZW1vdmVkLlxuICAgIC8vIFVuY2xlYXIgYXQgdGhpcyBwb2ludCBpZiBhY3Rpb24gbmVlZHMgdG8gYmUgdGFrZW4uXG4gICAgZGVsZXRlIHJlcS5ib2R5Ll9ub0JvZHk7XG4gIH1cblxuICB2YXIgZmlsZVZpYUpTT04gPSBmYWxzZTtcblxuICBpZiAoIWluZm8uYXBwSWQgfHwgIUFwcENhY2hlLmdldChpbmZvLmFwcElkKSkge1xuICAgIC8vIFNlZSBpZiB3ZSBjYW4gZmluZCB0aGUgYXBwIGlkIG9uIHRoZSBib2R5LlxuICAgIGlmIChyZXEuYm9keSBpbnN0YW5jZW9mIEJ1ZmZlcikge1xuICAgICAgLy8gVGhlIG9ubHkgY2hhbmNlIHRvIGZpbmQgdGhlIGFwcCBpZCBpcyBpZiB0aGlzIGlzIGEgZmlsZVxuICAgICAgLy8gdXBsb2FkIHRoYXQgYWN0dWFsbHkgaXMgYSBKU09OIGJvZHkuIFNvIHRyeSB0byBwYXJzZSBpdC5cbiAgICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9wYXJzZS1jb21tdW5pdHkvcGFyc2Utc2VydmVyL2lzc3Vlcy82NTg5XG4gICAgICAvLyBJdCBpcyBhbHNvIHBvc3NpYmxlIHRoYXQgdGhlIGNsaWVudCBpcyB0cnlpbmcgdG8gdXBsb2FkIGEgZmlsZSBidXQgZm9yZ290XG4gICAgICAvLyB0byBwcm92aWRlIHgtcGFyc2UtYXBwLWlkIGluIGhlYWRlciBhbmQgcGFyc2UgYSBiaW5hcnkgZmlsZSB3aWxsIGZhaWxcbiAgICAgIHRyeSB7XG4gICAgICAgIHJlcS5ib2R5ID0gSlNPTi5wYXJzZShyZXEuYm9keSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiBpbnZhbGlkUmVxdWVzdChyZXEsIHJlcyk7XG4gICAgICB9XG4gICAgICBmaWxlVmlhSlNPTiA9IHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHJlcS5ib2R5KSB7XG4gICAgICBkZWxldGUgcmVxLmJvZHkuX1Jldm9jYWJsZVNlc3Npb247XG4gICAgfVxuXG4gICAgaWYgKFxuICAgICAgcmVxLmJvZHkgJiZcbiAgICAgIHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkICYmXG4gICAgICBBcHBDYWNoZS5nZXQocmVxLmJvZHkuX0FwcGxpY2F0aW9uSWQpICYmXG4gICAgICAoIWluZm8ubWFzdGVyS2V5IHx8IEFwcENhY2hlLmdldChyZXEuYm9keS5fQXBwbGljYXRpb25JZCkubWFzdGVyS2V5ID09PSBpbmZvLm1hc3RlcktleSlcbiAgICApIHtcbiAgICAgIGluZm8uYXBwSWQgPSByZXEuYm9keS5fQXBwbGljYXRpb25JZDtcbiAgICAgIGluZm8uamF2YXNjcmlwdEtleSA9IHJlcS5ib2R5Ll9KYXZhU2NyaXB0S2V5IHx8ICcnO1xuICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9BcHBsaWNhdGlvbklkO1xuICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9KYXZhU2NyaXB0S2V5O1xuICAgICAgLy8gVE9ETzogdGVzdCB0aGF0IHRoZSBSRVNUIEFQSSBmb3JtYXRzIGdlbmVyYXRlZCBieSB0aGUgb3RoZXJcbiAgICAgIC8vIFNES3MgYXJlIGhhbmRsZWQgb2tcbiAgICAgIGlmIChyZXEuYm9keS5fQ2xpZW50VmVyc2lvbikge1xuICAgICAgICBpbmZvLmNsaWVudFZlcnNpb24gPSByZXEuYm9keS5fQ2xpZW50VmVyc2lvbjtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9DbGllbnRWZXJzaW9uO1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9JbnN0YWxsYXRpb25JZCkge1xuICAgICAgICBpbmZvLmluc3RhbGxhdGlvbklkID0gcmVxLmJvZHkuX0luc3RhbGxhdGlvbklkO1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX0luc3RhbGxhdGlvbklkO1xuICAgICAgfVxuICAgICAgaWYgKHJlcS5ib2R5Ll9TZXNzaW9uVG9rZW4pIHtcbiAgICAgICAgaW5mby5zZXNzaW9uVG9rZW4gPSByZXEuYm9keS5fU2Vzc2lvblRva2VuO1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX1Nlc3Npb25Ub2tlbjtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fTWFzdGVyS2V5KSB7XG4gICAgICAgIGluZm8ubWFzdGVyS2V5ID0gcmVxLmJvZHkuX01hc3RlcktleTtcbiAgICAgICAgZGVsZXRlIHJlcS5ib2R5Ll9NYXN0ZXJLZXk7XG4gICAgICB9XG4gICAgICBpZiAocmVxLmJvZHkuX2NvbnRleHQpIHtcbiAgICAgICAgaWYgKHJlcS5ib2R5Ll9jb250ZXh0IGluc3RhbmNlb2YgT2JqZWN0KSB7XG4gICAgICAgICAgaW5mby5jb250ZXh0ID0gcmVxLmJvZHkuX2NvbnRleHQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGluZm8uY29udGV4dCA9IEpTT04ucGFyc2UocmVxLmJvZHkuX2NvbnRleHQpO1xuICAgICAgICAgICAgaWYgKE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChpbmZvLmNvbnRleHQpICE9PSAnW29iamVjdCBPYmplY3RdJykge1xuICAgICAgICAgICAgICB0aHJvdyAnQ29udGV4dCBpcyBub3QgYW4gb2JqZWN0JztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgICAgICByZXR1cm4gbWFsZm9ybWVkQ29udGV4dChyZXEsIHJlcyk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGRlbGV0ZSByZXEuYm9keS5fY29udGV4dDtcbiAgICAgIH1cbiAgICAgIGlmIChyZXEuYm9keS5fQ29udGVudFR5cGUpIHtcbiAgICAgICAgcmVxLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gcmVxLmJvZHkuX0NvbnRlbnRUeXBlO1xuICAgICAgICBkZWxldGUgcmVxLmJvZHkuX0NvbnRlbnRUeXBlO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gaW52YWxpZFJlcXVlc3QocmVxLCByZXMpO1xuICAgIH1cbiAgfVxuXG4gIGlmIChpbmZvLnNlc3Npb25Ub2tlbiAmJiB0eXBlb2YgaW5mby5zZXNzaW9uVG9rZW4gIT09ICdzdHJpbmcnKSB7XG4gICAgaW5mby5zZXNzaW9uVG9rZW4gPSBpbmZvLnNlc3Npb25Ub2tlbi50b1N0cmluZygpO1xuICB9XG5cbiAgaWYgKGluZm8uY2xpZW50VmVyc2lvbikge1xuICAgIGluZm8uY2xpZW50U0RLID0gQ2xpZW50U0RLLmZyb21TdHJpbmcoaW5mby5jbGllbnRWZXJzaW9uKTtcbiAgfVxuXG4gIGlmIChmaWxlVmlhSlNPTikge1xuICAgIHJlcS5maWxlRGF0YSA9IHJlcS5ib2R5LmZpbGVEYXRhO1xuICAgIC8vIFdlIG5lZWQgdG8gcmVwb3B1bGF0ZSByZXEuYm9keSB3aXRoIGEgYnVmZmVyXG4gICAgdmFyIGJhc2U2NCA9IHJlcS5ib2R5LmJhc2U2NDtcbiAgICByZXEuYm9keSA9IEJ1ZmZlci5mcm9tKGJhc2U2NCwgJ2Jhc2U2NCcpO1xuICB9XG5cbiAgY29uc3QgY2xpZW50SXAgPSBnZXRDbGllbnRJcChyZXEpO1xuICBjb25zdCBjb25maWcgPSBDb25maWcuZ2V0KGluZm8uYXBwSWQsIG1vdW50KTtcbiAgaWYgKGNvbmZpZy5zdGF0ZSAmJiBjb25maWcuc3RhdGUgIT09ICdvaycpIHtcbiAgICByZXMuc3RhdHVzKDUwMCk7XG4gICAgcmVzLmpzb24oe1xuICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgZXJyb3I6IGBJbnZhbGlkIHNlcnZlciBzdGF0ZTogJHtjb25maWcuc3RhdGV9YCxcbiAgICB9KTtcbiAgICByZXR1cm47XG4gIH1cblxuICBpbmZvLmFwcCA9IEFwcENhY2hlLmdldChpbmZvLmFwcElkKTtcbiAgcmVxLmNvbmZpZyA9IGNvbmZpZztcbiAgcmVxLmNvbmZpZy5oZWFkZXJzID0gcmVxLmhlYWRlcnMgfHwge307XG4gIHJlcS5jb25maWcuaXAgPSBjbGllbnRJcDtcbiAgcmVxLmluZm8gPSBpbmZvO1xuXG4gIGNvbnN0IGlzTWFpbnRlbmFuY2UgPVxuICAgIHJlcS5jb25maWcubWFpbnRlbmFuY2VLZXkgJiYgaW5mby5tYWludGVuYW5jZUtleSA9PT0gcmVxLmNvbmZpZy5tYWludGVuYW5jZUtleTtcbiAgaWYgKGlzTWFpbnRlbmFuY2UpIHtcbiAgICBpZiAoY2hlY2tJcChjbGllbnRJcCwgcmVxLmNvbmZpZy5tYWludGVuYW5jZUtleUlwcyB8fCBbXSwgcmVxLmNvbmZpZy5tYWludGVuYW5jZUtleUlwc1N0b3JlKSkge1xuICAgICAgcmVxLmF1dGggPSBuZXcgYXV0aC5BdXRoKHtcbiAgICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgICAgaXNNYWludGVuYW5jZTogdHJ1ZSxcbiAgICAgIH0pO1xuICAgICAgbmV4dCgpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBsb2cgPSByZXEuY29uZmlnPy5sb2dnZXJDb250cm9sbGVyIHx8IGRlZmF1bHRMb2dnZXI7XG4gICAgbG9nLmVycm9yKFxuICAgICAgYFJlcXVlc3QgdXNpbmcgbWFpbnRlbmFuY2Uga2V5IHJlamVjdGVkIGFzIHRoZSByZXF1ZXN0IElQIGFkZHJlc3MgJyR7Y2xpZW50SXB9JyBpcyBub3Qgc2V0IGluIFBhcnNlIFNlcnZlciBvcHRpb24gJ21haW50ZW5hbmNlS2V5SXBzJy5gXG4gICAgKTtcbiAgfVxuXG4gIGxldCBpc01hc3RlciA9IGluZm8ubWFzdGVyS2V5ID09PSByZXEuY29uZmlnLm1hc3RlcktleTtcblxuICBpZiAoaXNNYXN0ZXIgJiYgIWNoZWNrSXAoY2xpZW50SXAsIHJlcS5jb25maWcubWFzdGVyS2V5SXBzIHx8IFtdLCByZXEuY29uZmlnLm1hc3RlcktleUlwc1N0b3JlKSkge1xuICAgIGNvbnN0IGxvZyA9IHJlcS5jb25maWc/LmxvZ2dlckNvbnRyb2xsZXIgfHwgZGVmYXVsdExvZ2dlcjtcbiAgICBsb2cuZXJyb3IoXG4gICAgICBgUmVxdWVzdCB1c2luZyBtYXN0ZXIga2V5IHJlamVjdGVkIGFzIHRoZSByZXF1ZXN0IElQIGFkZHJlc3MgJyR7Y2xpZW50SXB9JyBpcyBub3Qgc2V0IGluIFBhcnNlIFNlcnZlciBvcHRpb24gJ21hc3RlcktleUlwcycuYFxuICAgICk7XG4gICAgaXNNYXN0ZXIgPSBmYWxzZTtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcigpO1xuICAgIGVycm9yLnN0YXR1cyA9IDQwMztcbiAgICBlcnJvci5tZXNzYWdlID0gYHVuYXV0aG9yaXplZGA7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cblxuICBpZiAoaXNNYXN0ZXIpIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogdHJ1ZSxcbiAgICB9KTtcbiAgICByZXR1cm4gaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbiAgfVxuXG4gIHZhciBpc1JlYWRPbmx5TWFzdGVyID0gaW5mby5tYXN0ZXJLZXkgPT09IHJlcS5jb25maWcucmVhZE9ubHlNYXN0ZXJLZXk7XG4gIGlmIChcbiAgICB0eXBlb2YgcmVxLmNvbmZpZy5yZWFkT25seU1hc3RlcktleSAhPSAndW5kZWZpbmVkJyAmJlxuICAgIHJlcS5jb25maWcucmVhZE9ubHlNYXN0ZXJLZXkgJiZcbiAgICBpc1JlYWRPbmx5TWFzdGVyXG4gICkge1xuICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgIGlzTWFzdGVyOiB0cnVlLFxuICAgICAgaXNSZWFkT25seTogdHJ1ZSxcbiAgICB9KTtcbiAgICByZXR1cm4gaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbiAgfVxuXG4gIC8vIENsaWVudCBrZXlzIGFyZSBub3QgcmVxdWlyZWQgaW4gcGFyc2Utc2VydmVyLCBidXQgaWYgYW55IGhhdmUgYmVlbiBjb25maWd1cmVkIGluIHRoZSBzZXJ2ZXIsIHZhbGlkYXRlIHRoZW1cbiAgLy8gIHRvIHByZXNlcnZlIG9yaWdpbmFsIGJlaGF2aW9yLlxuICBjb25zdCBrZXlzID0gWydjbGllbnRLZXknLCAnamF2YXNjcmlwdEtleScsICdkb3ROZXRLZXknLCAncmVzdEFQSUtleSddO1xuICBjb25zdCBvbmVLZXlDb25maWd1cmVkID0ga2V5cy5zb21lKGZ1bmN0aW9uIChrZXkpIHtcbiAgICByZXR1cm4gcmVxLmNvbmZpZ1trZXldICE9PSB1bmRlZmluZWQ7XG4gIH0pO1xuICBjb25zdCBvbmVLZXlNYXRjaGVzID0ga2V5cy5zb21lKGZ1bmN0aW9uIChrZXkpIHtcbiAgICByZXR1cm4gcmVxLmNvbmZpZ1trZXldICE9PSB1bmRlZmluZWQgJiYgaW5mb1trZXldID09PSByZXEuY29uZmlnW2tleV07XG4gIH0pO1xuXG4gIGlmIChvbmVLZXlDb25maWd1cmVkICYmICFvbmVLZXlNYXRjaGVzKSB7XG4gICAgcmV0dXJuIGludmFsaWRSZXF1ZXN0KHJlcSwgcmVzKTtcbiAgfVxuXG4gIGlmIChyZXEudXJsID09ICcvbG9naW4nKSB7XG4gICAgZGVsZXRlIGluZm8uc2Vzc2lvblRva2VuO1xuICB9XG5cbiAgaWYgKHJlcS51c2VyRnJvbUpXVCkge1xuICAgIHJlcS5hdXRoID0gbmV3IGF1dGguQXV0aCh7XG4gICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICBpbnN0YWxsYXRpb25JZDogaW5mby5pbnN0YWxsYXRpb25JZCxcbiAgICAgIGlzTWFzdGVyOiBmYWxzZSxcbiAgICAgIHVzZXI6IHJlcS51c2VyRnJvbUpXVCxcbiAgICB9KTtcbiAgICByZXR1cm4gaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbiAgfVxuXG4gIGlmICghaW5mby5zZXNzaW9uVG9rZW4pIHtcbiAgICByZXEuYXV0aCA9IG5ldyBhdXRoLkF1dGgoe1xuICAgICAgY29uZmlnOiByZXEuY29uZmlnLFxuICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICBpc01hc3RlcjogZmFsc2UsXG4gICAgfSk7XG4gIH1cbiAgaGFuZGxlUmF0ZUxpbWl0KHJlcSwgcmVzLCBuZXh0KTtcbn1cblxuY29uc3QgaGFuZGxlUmF0ZUxpbWl0ID0gYXN5bmMgKHJlcSwgcmVzLCBuZXh0KSA9PiB7XG4gIGNvbnN0IHJhdGVMaW1pdHMgPSByZXEuY29uZmlnLnJhdGVMaW1pdHMgfHwgW107XG4gIHRyeSB7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICByYXRlTGltaXRzLm1hcChhc3luYyBsaW1pdCA9PiB7XG4gICAgICAgIGNvbnN0IHBhdGhFeHAgPSBuZXcgUmVnRXhwKGxpbWl0LnBhdGgpO1xuICAgICAgICBpZiAocGF0aEV4cC50ZXN0KHJlcS51cmwpKSB7XG4gICAgICAgICAgYXdhaXQgbGltaXQuaGFuZGxlcihyZXEsIHJlcywgZXJyID0+IHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgaWYgKGVyci5jb2RlID09PSBQYXJzZS5FcnJvci5DT05ORUNUSU9OX0ZBSUxFRCkge1xuICAgICAgICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXEuY29uZmlnLmxvZ2dlckNvbnRyb2xsZXIuZXJyb3IoXG4gICAgICAgICAgICAgICAgJ0FuIHVua25vd24gZXJyb3Igb2NjdXJlZCB3aGVuIGF0dGVtcHRpbmcgdG8gYXBwbHkgdGhlIHJhdGUgbGltaXRlcjogJyxcbiAgICAgICAgICAgICAgICBlcnJcbiAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIHJlcy5zdGF0dXMoNDI5KTtcbiAgICByZXMuanNvbih7IGNvZGU6IFBhcnNlLkVycm9yLkNPTk5FQ1RJT05fRkFJTEVELCBlcnJvcjogZXJyb3IubWVzc2FnZSB9KTtcbiAgICByZXR1cm47XG4gIH1cbiAgbmV4dCgpO1xufTtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZVBhcnNlU2Vzc2lvbiA9IGFzeW5jIChyZXEsIHJlcywgbmV4dCkgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IGluZm8gPSByZXEuaW5mbztcbiAgICBpZiAocmVxLmF1dGggfHwgcmVxLnVybCA9PT0gJy9zZXNzaW9ucy9tZScpIHtcbiAgICAgIG5leHQoKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgbGV0IHJlcXVlc3RBdXRoID0gbnVsbDtcbiAgICBpZiAoXG4gICAgICBpbmZvLnNlc3Npb25Ub2tlbiAmJlxuICAgICAgcmVxLnVybCA9PT0gJy91cGdyYWRlVG9SZXZvY2FibGVTZXNzaW9uJyAmJlxuICAgICAgaW5mby5zZXNzaW9uVG9rZW4uaW5kZXhPZigncjonKSAhPSAwXG4gICAgKSB7XG4gICAgICByZXF1ZXN0QXV0aCA9IGF3YWl0IGF1dGguZ2V0QXV0aEZvckxlZ2FjeVNlc3Npb25Ub2tlbih7XG4gICAgICAgIGNvbmZpZzogcmVxLmNvbmZpZyxcbiAgICAgICAgaW5zdGFsbGF0aW9uSWQ6IGluZm8uaW5zdGFsbGF0aW9uSWQsXG4gICAgICAgIHNlc3Npb25Ub2tlbjogaW5mby5zZXNzaW9uVG9rZW4sXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVxdWVzdEF1dGggPSBhd2FpdCBhdXRoLmdldEF1dGhGb3JTZXNzaW9uVG9rZW4oe1xuICAgICAgICBjb25maWc6IHJlcS5jb25maWcsXG4gICAgICAgIGluc3RhbGxhdGlvbklkOiBpbmZvLmluc3RhbGxhdGlvbklkLFxuICAgICAgICBzZXNzaW9uVG9rZW46IGluZm8uc2Vzc2lvblRva2VuLFxuICAgICAgfSk7XG4gICAgfVxuICAgIHJlcS5hdXRoID0gcmVxdWVzdEF1dGg7XG4gICAgbmV4dCgpO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGlmIChlcnJvciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgICBuZXh0KGVycm9yKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgLy8gVE9ETzogRGV0ZXJtaW5lIHRoZSBjb3JyZWN0IGVycm9yIHNjZW5hcmlvLlxuICAgIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlci5lcnJvcignZXJyb3IgZ2V0dGluZyBhdXRoIGZvciBzZXNzaW9uVG9rZW4nLCBlcnJvcik7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLlVOS05PV05fRVJST1IsIGVycm9yKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gZ2V0Q2xpZW50SXAocmVxKSB7XG4gIHJldHVybiByZXEuaXA7XG59XG5cbmZ1bmN0aW9uIGh0dHBBdXRoKHJlcSkge1xuICBpZiAoIShyZXEucmVxIHx8IHJlcSkuaGVhZGVycy5hdXRob3JpemF0aW9uKSByZXR1cm47XG5cbiAgdmFyIGhlYWRlciA9IChyZXEucmVxIHx8IHJlcSkuaGVhZGVycy5hdXRob3JpemF0aW9uO1xuICB2YXIgYXBwSWQsIG1hc3RlcktleSwgamF2YXNjcmlwdEtleTtcblxuICAvLyBwYXJzZSBoZWFkZXJcbiAgdmFyIGF1dGhQcmVmaXggPSAnYmFzaWMgJztcblxuICB2YXIgbWF0Y2ggPSBoZWFkZXIudG9Mb3dlckNhc2UoKS5pbmRleE9mKGF1dGhQcmVmaXgpO1xuXG4gIGlmIChtYXRjaCA9PSAwKSB7XG4gICAgdmFyIGVuY29kZWRBdXRoID0gaGVhZGVyLnN1YnN0cmluZyhhdXRoUHJlZml4Lmxlbmd0aCwgaGVhZGVyLmxlbmd0aCk7XG4gICAgdmFyIGNyZWRlbnRpYWxzID0gZGVjb2RlQmFzZTY0KGVuY29kZWRBdXRoKS5zcGxpdCgnOicpO1xuXG4gICAgaWYgKGNyZWRlbnRpYWxzLmxlbmd0aCA9PSAyKSB7XG4gICAgICBhcHBJZCA9IGNyZWRlbnRpYWxzWzBdO1xuICAgICAgdmFyIGtleSA9IGNyZWRlbnRpYWxzWzFdO1xuXG4gICAgICB2YXIganNLZXlQcmVmaXggPSAnamF2YXNjcmlwdC1rZXk9JztcblxuICAgICAgdmFyIG1hdGNoS2V5ID0ga2V5LmluZGV4T2YoanNLZXlQcmVmaXgpO1xuICAgICAgaWYgKG1hdGNoS2V5ID09IDApIHtcbiAgICAgICAgamF2YXNjcmlwdEtleSA9IGtleS5zdWJzdHJpbmcoanNLZXlQcmVmaXgubGVuZ3RoLCBrZXkubGVuZ3RoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1hc3RlcktleSA9IGtleTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4geyBhcHBJZDogYXBwSWQsIG1hc3RlcktleTogbWFzdGVyS2V5LCBqYXZhc2NyaXB0S2V5OiBqYXZhc2NyaXB0S2V5IH07XG59XG5cbmZ1bmN0aW9uIGRlY29kZUJhc2U2NChzdHIpIHtcbiAgcmV0dXJuIEJ1ZmZlci5mcm9tKHN0ciwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhbGxvd0Nyb3NzRG9tYWluKGFwcElkKSB7XG4gIHJldHVybiAocmVxLCByZXMsIG5leHQpID0+IHtcbiAgICBjb25zdCBjb25maWcgPSBDb25maWcuZ2V0KGFwcElkLCBnZXRNb3VudEZvclJlcXVlc3QocmVxKSk7XG4gICAgbGV0IGFsbG93SGVhZGVycyA9IERFRkFVTFRfQUxMT1dFRF9IRUFERVJTO1xuICAgIGlmIChjb25maWcgJiYgY29uZmlnLmFsbG93SGVhZGVycykge1xuICAgICAgYWxsb3dIZWFkZXJzICs9IGAsICR7Y29uZmlnLmFsbG93SGVhZGVycy5qb2luKCcsICcpfWA7XG4gICAgfVxuXG4gICAgY29uc3QgYmFzZU9yaWdpbnMgPVxuICAgICAgdHlwZW9mIGNvbmZpZz8uYWxsb3dPcmlnaW4gPT09ICdzdHJpbmcnID8gW2NvbmZpZy5hbGxvd09yaWdpbl0gOiBjb25maWc/LmFsbG93T3JpZ2luID8/IFsnKiddO1xuICAgIGNvbnN0IHJlcXVlc3RPcmlnaW4gPSByZXEuaGVhZGVycy5vcmlnaW47XG4gICAgY29uc3QgYWxsb3dPcmlnaW5zID1cbiAgICAgIHJlcXVlc3RPcmlnaW4gJiYgYmFzZU9yaWdpbnMuaW5jbHVkZXMocmVxdWVzdE9yaWdpbikgPyByZXF1ZXN0T3JpZ2luIDogYmFzZU9yaWdpbnNbMF07XG4gICAgcmVzLmhlYWRlcignQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJywgYWxsb3dPcmlnaW5zKTtcbiAgICByZXMuaGVhZGVyKCdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJywgJ0dFVCxQVVQsUE9TVCxERUxFVEUsT1BUSU9OUycpO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnLCBhbGxvd0hlYWRlcnMpO1xuICAgIHJlcy5oZWFkZXIoJ0FjY2Vzcy1Db250cm9sLUV4cG9zZS1IZWFkZXJzJywgJ1gtUGFyc2UtSm9iLVN0YXR1cy1JZCwgWC1QYXJzZS1QdXNoLVN0YXR1cy1JZCcpO1xuICAgIC8vIGludGVyY2VwdCBPUFRJT05TIG1ldGhvZFxuICAgIGlmICgnT1BUSU9OUycgPT0gcmVxLm1ldGhvZCkge1xuICAgICAgcmVzLnNlbmRTdGF0dXMoMjAwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV4dCgpO1xuICAgIH1cbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFsbG93TWV0aG9kT3ZlcnJpZGUocmVxLCByZXMsIG5leHQpIHtcbiAgaWYgKHJlcS5tZXRob2QgPT09ICdQT1NUJyAmJiByZXEuYm9keS5fbWV0aG9kKSB7XG4gICAgcmVxLm9yaWdpbmFsTWV0aG9kID0gcmVxLm1ldGhvZDtcbiAgICByZXEubWV0aG9kID0gcmVxLmJvZHkuX21ldGhvZDtcbiAgICBkZWxldGUgcmVxLmJvZHkuX21ldGhvZDtcbiAgfVxuICBuZXh0KCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBoYW5kbGVQYXJzZUVycm9ycyhlcnIsIHJlcSwgcmVzLCBuZXh0KSB7XG4gIGNvbnN0IGxvZyA9IChyZXEuY29uZmlnICYmIHJlcS5jb25maWcubG9nZ2VyQ29udHJvbGxlcikgfHwgZGVmYXVsdExvZ2dlcjtcbiAgaWYgKGVyciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgaWYgKHJlcS5jb25maWcgJiYgcmVxLmNvbmZpZy5lbmFibGVFeHByZXNzRXJyb3JIYW5kbGVyKSB7XG4gICAgICByZXR1cm4gbmV4dChlcnIpO1xuICAgIH1cbiAgICBsZXQgaHR0cFN0YXR1cztcbiAgICAvLyBUT0RPOiBmaWxsIG91dCB0aGlzIG1hcHBpbmdcbiAgICBzd2l0Y2ggKGVyci5jb2RlKSB7XG4gICAgICBjYXNlIFBhcnNlLkVycm9yLklOVEVSTkFMX1NFUlZFUl9FUlJPUjpcbiAgICAgICAgaHR0cFN0YXR1cyA9IDUwMDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQ6XG4gICAgICAgIGh0dHBTdGF0dXMgPSA0MDQ7XG4gICAgICAgIGJyZWFrO1xuICAgICAgZGVmYXVsdDpcbiAgICAgICAgaHR0cFN0YXR1cyA9IDQwMDtcbiAgICB9XG4gICAgcmVzLnN0YXR1cyhodHRwU3RhdHVzKTtcbiAgICByZXMuanNvbih7IGNvZGU6IGVyci5jb2RlLCBlcnJvcjogZXJyLm1lc3NhZ2UgfSk7XG4gICAgbG9nLmVycm9yKCdQYXJzZSBlcnJvcjogJywgZXJyKTtcbiAgfSBlbHNlIGlmIChlcnIuc3RhdHVzICYmIGVyci5tZXNzYWdlKSB7XG4gICAgcmVzLnN0YXR1cyhlcnIuc3RhdHVzKTtcbiAgICByZXMuanNvbih7IGVycm9yOiBlcnIubWVzc2FnZSB9KTtcbiAgICBpZiAoIShwcm9jZXNzICYmIHByb2Nlc3MuZW52LlRFU1RJTkcpKSB7XG4gICAgICBuZXh0KGVycik7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGxvZy5lcnJvcignVW5jYXVnaHQgaW50ZXJuYWwgc2VydmVyIGVycm9yLicsIGVyciwgZXJyLnN0YWNrKTtcbiAgICByZXMuc3RhdHVzKDUwMCk7XG4gICAgcmVzLmpzb24oe1xuICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5URVJOQUxfU0VSVkVSX0VSUk9SLFxuICAgICAgbWVzc2FnZTogJ0ludGVybmFsIHNlcnZlciBlcnJvci4nLFxuICAgIH0pO1xuICAgIGlmICghKHByb2Nlc3MgJiYgcHJvY2Vzcy5lbnYuVEVTVElORykpIHtcbiAgICAgIG5leHQoZXJyKTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVuZm9yY2VNYXN0ZXJLZXlBY2Nlc3MocmVxLCByZXMsIG5leHQpIHtcbiAgaWYgKCFyZXEuYXV0aC5pc01hc3Rlcikge1xuICAgIHJlcy5zdGF0dXMoNDAzKTtcbiAgICByZXMuZW5kKCd7XCJlcnJvclwiOlwidW5hdXRob3JpemVkOiBtYXN0ZXIga2V5IGlzIHJlcXVpcmVkXCJ9Jyk7XG4gICAgcmV0dXJuO1xuICB9XG4gIG5leHQoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb21pc2VFbmZvcmNlTWFzdGVyS2V5QWNjZXNzKHJlcXVlc3QpIHtcbiAgaWYgKCFyZXF1ZXN0LmF1dGguaXNNYXN0ZXIpIHtcbiAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcigpO1xuICAgIGVycm9yLnN0YXR1cyA9IDQwMztcbiAgICBlcnJvci5tZXNzYWdlID0gJ3VuYXV0aG9yaXplZDogbWFzdGVyIGtleSBpcyByZXF1aXJlZCc7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufVxuXG5leHBvcnQgY29uc3QgYWRkUmF0ZUxpbWl0ID0gKHJvdXRlLCBjb25maWcsIGNsb3VkKSA9PiB7XG4gIGlmICh0eXBlb2YgY29uZmlnID09PSAnc3RyaW5nJykge1xuICAgIGNvbmZpZyA9IENvbmZpZy5nZXQoY29uZmlnKTtcbiAgfVxuICBmb3IgKGNvbnN0IGtleSBpbiByb3V0ZSkge1xuICAgIGlmICghUmF0ZUxpbWl0T3B0aW9uc1trZXldKSB7XG4gICAgICB0aHJvdyBgSW52YWxpZCByYXRlIGxpbWl0IG9wdGlvbiBcIiR7a2V5fVwiYDtcbiAgICB9XG4gIH1cbiAgaWYgKCFjb25maWcucmF0ZUxpbWl0cykge1xuICAgIGNvbmZpZy5yYXRlTGltaXRzID0gW107XG4gIH1cbiAgY29uc3QgcmVkaXNTdG9yZSA9IHtcbiAgICBjb25uZWN0aW9uUHJvbWlzZTogUHJvbWlzZS5yZXNvbHZlKCksXG4gICAgc3RvcmU6IG51bGwsXG4gICAgY29ubmVjdGVkOiBmYWxzZSxcbiAgfTtcbiAgaWYgKHJvdXRlLnJlZGlzVXJsKSB7XG4gICAgY29uc3QgY2xpZW50ID0gY3JlYXRlQ2xpZW50KHtcbiAgICAgIHVybDogcm91dGUucmVkaXNVcmwsXG4gICAgfSk7XG4gICAgcmVkaXNTdG9yZS5jb25uZWN0aW9uUHJvbWlzZSA9IGFzeW5jICgpID0+IHtcbiAgICAgIGlmIChyZWRpc1N0b3JlLmNvbm5lY3RlZCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCBjbGllbnQuY29ubmVjdCgpO1xuICAgICAgICByZWRpc1N0b3JlLmNvbm5lY3RlZCA9IHRydWU7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGNvbnN0IGxvZyA9IGNvbmZpZz8ubG9nZ2VyQ29udHJvbGxlciB8fCBkZWZhdWx0TG9nZ2VyO1xuICAgICAgICBsb2cuZXJyb3IoYENvdWxkIG5vdCBjb25uZWN0IHRvIHJlZGlzVVJMIGluIHJhdGUgbGltaXQ6ICR7ZX1gKTtcbiAgICAgIH1cbiAgICB9O1xuICAgIHJlZGlzU3RvcmUuY29ubmVjdGlvblByb21pc2UoKTtcbiAgICByZWRpc1N0b3JlLnN0b3JlID0gbmV3IFJlZGlzU3RvcmUoe1xuICAgICAgc2VuZENvbW1hbmQ6IGFzeW5jICguLi5hcmdzKSA9PiB7XG4gICAgICAgIGF3YWl0IHJlZGlzU3RvcmUuY29ubmVjdGlvblByb21pc2UoKTtcbiAgICAgICAgcmV0dXJuIGNsaWVudC5zZW5kQ29tbWFuZChhcmdzKTtcbiAgICAgIH0sXG4gICAgfSk7XG4gIH1cbiAgbGV0IHRyYW5zZm9ybVBhdGggPSByb3V0ZS5yZXF1ZXN0UGF0aC5zcGxpdCgnLyonKS5qb2luKCcvKC4qKScpO1xuICBpZiAodHJhbnNmb3JtUGF0aCA9PT0gJyonKSB7XG4gICAgdHJhbnNmb3JtUGF0aCA9ICcoLiopJztcbiAgfVxuICBjb25maWcucmF0ZUxpbWl0cy5wdXNoKHtcbiAgICBwYXRoOiBwYXRoVG9SZWdleHAodHJhbnNmb3JtUGF0aCksXG4gICAgaGFuZGxlcjogcmF0ZUxpbWl0KHtcbiAgICAgIHdpbmRvd01zOiByb3V0ZS5yZXF1ZXN0VGltZVdpbmRvdyxcbiAgICAgIG1heDogcm91dGUucmVxdWVzdENvdW50LFxuICAgICAgbWVzc2FnZTogcm91dGUuZXJyb3JSZXNwb25zZU1lc3NhZ2UgfHwgUmF0ZUxpbWl0T3B0aW9ucy5lcnJvclJlc3BvbnNlTWVzc2FnZS5kZWZhdWx0LFxuICAgICAgaGFuZGxlcjogKHJlcXVlc3QsIHJlc3BvbnNlLCBuZXh0LCBvcHRpb25zKSA9PiB7XG4gICAgICAgIHRocm93IHtcbiAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5DT05ORUNUSU9OX0ZBSUxFRCxcbiAgICAgICAgICBtZXNzYWdlOiBvcHRpb25zLm1lc3NhZ2UsXG4gICAgICAgIH07XG4gICAgICB9LFxuICAgICAgc2tpcDogcmVxdWVzdCA9PiB7XG4gICAgICAgIGlmIChyZXF1ZXN0LmlwID09PSAnMTI3LjAuMC4xJyAmJiAhcm91dGUuaW5jbHVkZUludGVybmFsUmVxdWVzdHMpIHtcbiAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocm91dGUuaW5jbHVkZU1hc3RlcktleSkge1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZiAocm91dGUucmVxdWVzdE1ldGhvZHMpIHtcbiAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyb3V0ZS5yZXF1ZXN0TWV0aG9kcykpIHtcbiAgICAgICAgICAgIGlmICghcm91dGUucmVxdWVzdE1ldGhvZHMuaW5jbHVkZXMocmVxdWVzdC5tZXRob2QpKSB7XG4gICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCByZWdFeHAgPSBuZXcgUmVnRXhwKHJvdXRlLnJlcXVlc3RNZXRob2RzKTtcbiAgICAgICAgICAgIGlmICghcmVnRXhwLnRlc3QocmVxdWVzdC5tZXRob2QpKSB7XG4gICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVxdWVzdC5hdXRoPy5pc01hc3RlcjtcbiAgICAgIH0sXG4gICAgICBrZXlHZW5lcmF0b3I6IGFzeW5jIHJlcXVlc3QgPT4ge1xuICAgICAgICBpZiAocm91dGUuem9uZSA9PT0gUGFyc2UuU2VydmVyLlJhdGVMaW1pdFpvbmUuZ2xvYmFsKSB7XG4gICAgICAgICAgcmV0dXJuIHJlcXVlc3QuY29uZmlnLmFwcElkO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHRva2VuID0gcmVxdWVzdC5pbmZvLnNlc3Npb25Ub2tlbjtcbiAgICAgICAgaWYgKHJvdXRlLnpvbmUgPT09IFBhcnNlLlNlcnZlci5SYXRlTGltaXRab25lLnNlc3Npb24gJiYgdG9rZW4pIHtcbiAgICAgICAgICByZXR1cm4gdG9rZW47XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHJvdXRlLnpvbmUgPT09IFBhcnNlLlNlcnZlci5SYXRlTGltaXRab25lLnVzZXIgJiYgdG9rZW4pIHtcbiAgICAgICAgICBpZiAoIXJlcXVlc3QuYXV0aCkge1xuICAgICAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBoYW5kbGVQYXJzZVNlc3Npb24ocmVxdWVzdCwgbnVsbCwgcmVzb2x2ZSkpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAocmVxdWVzdC5hdXRoPy51c2VyPy5pZCAmJiByZXF1ZXN0LnpvbmUgPT09ICd1c2VyJykge1xuICAgICAgICAgICAgcmV0dXJuIHJlcXVlc3QuYXV0aC51c2VyLmlkO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVxdWVzdC5jb25maWcuaXA7XG4gICAgICB9LFxuICAgICAgc3RvcmU6IHJlZGlzU3RvcmUuc3RvcmUsXG4gICAgfSksXG4gICAgY2xvdWQsXG4gIH0pO1xuICBDb25maWcucHV0KGNvbmZpZyk7XG59O1xuXG4vKipcbiAqIERlZHVwbGljYXRlcyBhIHJlcXVlc3QgdG8gZW5zdXJlIGlkZW1wb3RlbmN5LiBEdXBsaWNhdGVzIGFyZSBkZXRlcm1pbmVkIGJ5IHRoZSByZXF1ZXN0IElEXG4gKiBpbiB0aGUgcmVxdWVzdCBoZWFkZXIuIElmIGEgcmVxdWVzdCBoYXMgbm8gcmVxdWVzdCBJRCwgaXQgaXMgZXhlY3V0ZWQgYW55d2F5LlxuICogQHBhcmFtIHsqfSByZXEgVGhlIHJlcXVlc3QgdG8gZXZhbHVhdGUuXG4gKiBAcmV0dXJucyBQcm9taXNlPHt9PlxuICovXG5leHBvcnQgZnVuY3Rpb24gcHJvbWlzZUVuc3VyZUlkZW1wb3RlbmN5KHJlcSkge1xuICAvLyBFbmFibGUgZmVhdHVyZSBvbmx5IGZvciBNb25nb0RCXG4gIGlmIChcbiAgICAhKFxuICAgICAgcmVxLmNvbmZpZy5kYXRhYmFzZS5hZGFwdGVyIGluc3RhbmNlb2YgTW9uZ29TdG9yYWdlQWRhcHRlciB8fFxuICAgICAgcmVxLmNvbmZpZy5kYXRhYmFzZS5hZGFwdGVyIGluc3RhbmNlb2YgUG9zdGdyZXNTdG9yYWdlQWRhcHRlclxuICAgIClcbiAgKSB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG4gIC8vIEdldCBwYXJhbWV0ZXJzXG4gIGNvbnN0IGNvbmZpZyA9IHJlcS5jb25maWc7XG4gIGNvbnN0IHJlcXVlc3RJZCA9ICgocmVxIHx8IHt9KS5oZWFkZXJzIHx8IHt9KVsneC1wYXJzZS1yZXF1ZXN0LWlkJ107XG4gIGNvbnN0IHsgcGF0aHMsIHR0bCB9ID0gY29uZmlnLmlkZW1wb3RlbmN5T3B0aW9ucztcbiAgaWYgKCFyZXF1ZXN0SWQgfHwgIWNvbmZpZy5pZGVtcG90ZW5jeU9wdGlvbnMpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gUmVxdWVzdCBwYXRoIG1heSBjb250YWluIHRyYWlsaW5nIHNsYXNoZXMsIGRlcGVuZGluZyBvbiB0aGUgb3JpZ2luYWwgcmVxdWVzdCwgc28gcmVtb3ZlXG4gIC8vIGxlYWRpbmcgYW5kIHRyYWlsaW5nIHNsYXNoZXMgdG8gbWFrZSBpdCBlYXNpZXIgdG8gc3BlY2lmeSBwYXRocyBpbiB0aGUgY29uZmlndXJhdGlvblxuICBjb25zdCByZXFQYXRoID0gcmVxLnBhdGgucmVwbGFjZSgvXlxcL3xcXC8kLywgJycpO1xuICAvLyBEZXRlcm1pbmUgd2hldGhlciBpZGVtcG90ZW5jeSBpcyBlbmFibGVkIGZvciBjdXJyZW50IHJlcXVlc3QgcGF0aFxuICBsZXQgbWF0Y2ggPSBmYWxzZTtcbiAgZm9yIChjb25zdCBwYXRoIG9mIHBhdGhzKSB7XG4gICAgLy8gQXNzdW1lIG9uZSB3YW50cyBhIHBhdGggdG8gYWx3YXlzIG1hdGNoIGZyb20gdGhlIGJlZ2lubmluZyB0byBwcmV2ZW50IGFueSBtaXN0YWtlc1xuICAgIGNvbnN0IHJlZ2V4ID0gbmV3IFJlZ0V4cChwYXRoLmNoYXJBdCgwKSA9PT0gJ14nID8gcGF0aCA6ICdeJyArIHBhdGgpO1xuICAgIGlmIChyZXFQYXRoLm1hdGNoKHJlZ2V4KSkge1xuICAgICAgbWF0Y2ggPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG4gIGlmICghbWF0Y2gpIHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbiAgLy8gVHJ5IHRvIHN0b3JlIHJlcXVlc3RcbiAgY29uc3QgZXhwaXJ5RGF0ZSA9IG5ldyBEYXRlKG5ldyBEYXRlKCkuc2V0U2Vjb25kcyhuZXcgRGF0ZSgpLmdldFNlY29uZHMoKSArIHR0bCkpO1xuICByZXR1cm4gcmVzdFxuICAgIC5jcmVhdGUoY29uZmlnLCBhdXRoLm1hc3Rlcihjb25maWcpLCAnX0lkZW1wb3RlbmN5Jywge1xuICAgICAgcmVxSWQ6IHJlcXVlc3RJZCxcbiAgICAgIGV4cGlyZTogUGFyc2UuX2VuY29kZShleHBpcnlEYXRlKSxcbiAgICB9KVxuICAgIC5jYXRjaChlID0+IHtcbiAgICAgIGlmIChlLmNvZGUgPT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5EVVBMSUNBVEVfUkVRVUVTVCwgJ0R1cGxpY2F0ZSByZXF1ZXN0Jyk7XG4gICAgICB9XG4gICAgICB0aHJvdyBlO1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBpbnZhbGlkUmVxdWVzdChyZXEsIHJlcykge1xuICByZXMuc3RhdHVzKDQwMyk7XG4gIHJlcy5lbmQoJ3tcImVycm9yXCI6XCJ1bmF1dGhvcml6ZWRcIn0nKTtcbn1cblxuZnVuY3Rpb24gbWFsZm9ybWVkQ29udGV4dChyZXEsIHJlcykge1xuICByZXMuc3RhdHVzKDQwMCk7XG4gIHJlcy5qc29uKHsgY29kZTogUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBlcnJvcjogJ0ludmFsaWQgb2JqZWN0IGZvciBjb250ZXh0LicgfSk7XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7OztBQUFBLElBQUFBLE1BQUEsR0FBQUMsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFDLEtBQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFFLEtBQUEsR0FBQUgsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFHLE9BQUEsR0FBQUosc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFJLFVBQUEsR0FBQUwsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFLLE9BQUEsR0FBQU4sc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFNLEtBQUEsR0FBQVAsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFPLG9CQUFBLEdBQUFSLHNCQUFBLENBQUFDLE9BQUE7QUFDQSxJQUFBUSx1QkFBQSxHQUFBVCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQVMsaUJBQUEsR0FBQVYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFVLFlBQUEsR0FBQVYsT0FBQTtBQUNBLElBQUFXLGFBQUEsR0FBQVgsT0FBQTtBQUNBLElBQUFZLGVBQUEsR0FBQWIsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFhLE1BQUEsR0FBQWIsT0FBQTtBQUNBLElBQUFjLElBQUEsR0FBQWQsT0FBQTtBQUF3QyxTQUFBRCx1QkFBQWdCLEdBQUEsV0FBQUEsR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQUEsR0FBQUQsR0FBQSxLQUFBRSxPQUFBLEVBQUFGLEdBQUE7QUFFakMsTUFBTUcsdUJBQXVCLEdBQUFDLE9BQUEsQ0FBQUQsdUJBQUEsR0FDbEMsK09BQStPO0FBRWpQLE1BQU1FLGtCQUFrQixHQUFHLFNBQUFBLENBQVVDLEdBQUcsRUFBRTtFQUN4QyxNQUFNQyxlQUFlLEdBQUdELEdBQUcsQ0FBQ0UsV0FBVyxDQUFDQyxNQUFNLEdBQUdILEdBQUcsQ0FBQ0ksR0FBRyxDQUFDRCxNQUFNO0VBQy9ELE1BQU1FLFNBQVMsR0FBR0wsR0FBRyxDQUFDRSxXQUFXLENBQUNJLEtBQUssQ0FBQyxDQUFDLEVBQUVMLGVBQWUsQ0FBQztFQUMzRCxPQUFPRCxHQUFHLENBQUNPLFFBQVEsR0FBRyxLQUFLLEdBQUdQLEdBQUcsQ0FBQ1EsR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHSCxTQUFTO0FBQzNELENBQUM7QUFFRCxNQUFNSSxZQUFZLEdBQUdBLENBQUNDLFdBQVcsRUFBRUMsS0FBSyxLQUFLO0VBQzNDLElBQUlBLEtBQUssQ0FBQ0gsR0FBRyxDQUFDLFdBQVcsQ0FBQyxFQUFFLE9BQU9HLEtBQUssQ0FBQ0gsR0FBRyxDQUFDLFdBQVcsQ0FBQztFQUN6RCxNQUFNSSxTQUFTLEdBQUcsSUFBSUMsY0FBUyxDQUFDLENBQUM7RUFDakNILFdBQVcsQ0FBQ0ksT0FBTyxDQUFDQyxNQUFNLElBQUk7SUFDNUIsSUFBSUEsTUFBTSxLQUFLLE1BQU0sSUFBSUEsTUFBTSxLQUFLLElBQUksRUFBRTtNQUN4Q0osS0FBSyxDQUFDSyxHQUFHLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQztNQUMvQjtJQUNGO0lBQ0EsSUFBSUQsTUFBTSxLQUFLLFdBQVcsSUFBSUEsTUFBTSxLQUFLLFNBQVMsRUFBRTtNQUNsREosS0FBSyxDQUFDSyxHQUFHLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQztNQUMvQjtJQUNGO0lBQ0EsTUFBTSxDQUFDQyxFQUFFLEVBQUVDLElBQUksQ0FBQyxHQUFHSCxNQUFNLENBQUNJLEtBQUssQ0FBQyxHQUFHLENBQUM7SUFDcEMsSUFBSSxDQUFDRCxJQUFJLEVBQUU7TUFDVE4sU0FBUyxDQUFDUSxVQUFVLENBQUNILEVBQUUsRUFBRSxJQUFBSSxXQUFNLEVBQUNKLEVBQUUsQ0FBQyxHQUFHLE1BQU0sR0FBRyxNQUFNLENBQUM7SUFDeEQsQ0FBQyxNQUFNO01BQ0xMLFNBQVMsQ0FBQ1UsU0FBUyxDQUFDTCxFQUFFLEVBQUVNLE1BQU0sQ0FBQ0wsSUFBSSxDQUFDLEVBQUUsSUFBQUcsV0FBTSxFQUFDSixFQUFFLENBQUMsR0FBRyxNQUFNLEdBQUcsTUFBTSxDQUFDO0lBQ3JFO0VBQ0YsQ0FBQyxDQUFDO0VBQ0ZOLEtBQUssQ0FBQ0ssR0FBRyxDQUFDLFdBQVcsRUFBRUosU0FBUyxDQUFDO0VBQ2pDLE9BQU9BLFNBQVM7QUFDbEIsQ0FBQztBQUVNLE1BQU1ZLE9BQU8sR0FBR0EsQ0FBQ1AsRUFBRSxFQUFFUCxXQUFXLEVBQUVDLEtBQUssS0FBSztFQUNqRCxNQUFNYyxjQUFjLEdBQUcsSUFBQUosV0FBTSxFQUFDSixFQUFFLENBQUM7RUFDakMsTUFBTUwsU0FBUyxHQUFHSCxZQUFZLENBQUNDLFdBQVcsRUFBRUMsS0FBSyxDQUFDO0VBRWxELElBQUlBLEtBQUssQ0FBQ0gsR0FBRyxDQUFDUyxFQUFFLENBQUMsRUFBRSxPQUFPLElBQUk7RUFDOUIsSUFBSU4sS0FBSyxDQUFDSCxHQUFHLENBQUMsY0FBYyxDQUFDLElBQUlpQixjQUFjLEVBQUUsT0FBTyxJQUFJO0VBQzVELElBQUlkLEtBQUssQ0FBQ0gsR0FBRyxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUNpQixjQUFjLEVBQUUsT0FBTyxJQUFJO0VBQzdELE1BQU1DLE1BQU0sR0FBR2QsU0FBUyxDQUFDZSxLQUFLLENBQUNWLEVBQUUsRUFBRVEsY0FBYyxHQUFHLE1BQU0sR0FBRyxNQUFNLENBQUM7O0VBRXBFO0VBQ0E7RUFDQSxJQUFJZixXQUFXLENBQUNrQixRQUFRLENBQUNYLEVBQUUsQ0FBQyxJQUFJUyxNQUFNLEVBQUU7SUFDdENmLEtBQUssQ0FBQ0ssR0FBRyxDQUFDQyxFQUFFLEVBQUVTLE1BQU0sQ0FBQztFQUN2QjtFQUNBLE9BQU9BLE1BQU07QUFDZixDQUFDOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUFBNUIsT0FBQSxDQUFBMEIsT0FBQSxHQUFBQSxPQUFBO0FBQ08sU0FBU0ssa0JBQWtCQSxDQUFDN0IsR0FBRyxFQUFFOEIsR0FBRyxFQUFFQyxJQUFJLEVBQUU7RUFDakQsSUFBSUMsS0FBSyxHQUFHakMsa0JBQWtCLENBQUNDLEdBQUcsQ0FBQztFQUVuQyxJQUFJaUMsT0FBTyxHQUFHLENBQUMsQ0FBQztFQUNoQixJQUFJakMsR0FBRyxDQUFDUSxHQUFHLENBQUMsdUJBQXVCLENBQUMsSUFBSSxJQUFJLEVBQUU7SUFDNUMsSUFBSTtNQUNGeUIsT0FBTyxHQUFHQyxJQUFJLENBQUNDLEtBQUssQ0FBQ25DLEdBQUcsQ0FBQ1EsR0FBRyxDQUFDLHVCQUF1QixDQUFDLENBQUM7TUFDdEQsSUFBSTRCLE1BQU0sQ0FBQ0MsU0FBUyxDQUFDQyxRQUFRLENBQUNDLElBQUksQ0FBQ04sT0FBTyxDQUFDLEtBQUssaUJBQWlCLEVBQUU7UUFDakUsTUFBTSwwQkFBMEI7TUFDbEM7SUFDRixDQUFDLENBQUMsT0FBT08sQ0FBQyxFQUFFO01BQ1YsT0FBT0MsZ0JBQWdCLENBQUN6QyxHQUFHLEVBQUU4QixHQUFHLENBQUM7SUFDbkM7RUFDRjtFQUNBLElBQUlZLElBQUksR0FBRztJQUNUQyxLQUFLLEVBQUUzQyxHQUFHLENBQUNRLEdBQUcsQ0FBQyx3QkFBd0IsQ0FBQztJQUN4Q29DLFlBQVksRUFBRTVDLEdBQUcsQ0FBQ1EsR0FBRyxDQUFDLHVCQUF1QixDQUFDO0lBQzlDcUMsU0FBUyxFQUFFN0MsR0FBRyxDQUFDUSxHQUFHLENBQUMsb0JBQW9CLENBQUM7SUFDeENzQyxjQUFjLEVBQUU5QyxHQUFHLENBQUNRLEdBQUcsQ0FBQyx5QkFBeUIsQ0FBQztJQUNsRHVDLGNBQWMsRUFBRS9DLEdBQUcsQ0FBQ1EsR0FBRyxDQUFDLHlCQUF5QixDQUFDO0lBQ2xEd0MsU0FBUyxFQUFFaEQsR0FBRyxDQUFDUSxHQUFHLENBQUMsb0JBQW9CLENBQUM7SUFDeEN5QyxhQUFhLEVBQUVqRCxHQUFHLENBQUNRLEdBQUcsQ0FBQyx3QkFBd0IsQ0FBQztJQUNoRDBDLFNBQVMsRUFBRWxELEdBQUcsQ0FBQ1EsR0FBRyxDQUFDLHFCQUFxQixDQUFDO0lBQ3pDMkMsVUFBVSxFQUFFbkQsR0FBRyxDQUFDUSxHQUFHLENBQUMsc0JBQXNCLENBQUM7SUFDM0M0QyxhQUFhLEVBQUVwRCxHQUFHLENBQUNRLEdBQUcsQ0FBQyx3QkFBd0IsQ0FBQztJQUNoRHlCLE9BQU8sRUFBRUE7RUFDWCxDQUFDO0VBRUQsSUFBSW9CLFNBQVMsR0FBR0MsUUFBUSxDQUFDdEQsR0FBRyxDQUFDO0VBRTdCLElBQUlxRCxTQUFTLEVBQUU7SUFDYixJQUFJRSxjQUFjLEdBQUdGLFNBQVMsQ0FBQ1YsS0FBSztJQUNwQyxJQUFJYSxjQUFRLENBQUNoRCxHQUFHLENBQUMrQyxjQUFjLENBQUMsRUFBRTtNQUNoQ2IsSUFBSSxDQUFDQyxLQUFLLEdBQUdZLGNBQWM7TUFDM0JiLElBQUksQ0FBQ0csU0FBUyxHQUFHUSxTQUFTLENBQUNSLFNBQVMsSUFBSUgsSUFBSSxDQUFDRyxTQUFTO01BQ3RESCxJQUFJLENBQUNPLGFBQWEsR0FBR0ksU0FBUyxDQUFDSixhQUFhLElBQUlQLElBQUksQ0FBQ08sYUFBYTtJQUNwRTtFQUNGO0VBRUEsSUFBSWpELEdBQUcsQ0FBQ3lELElBQUksRUFBRTtJQUNaO0lBQ0E7SUFDQSxPQUFPekQsR0FBRyxDQUFDeUQsSUFBSSxDQUFDQyxPQUFPO0VBQ3pCO0VBRUEsSUFBSUMsV0FBVyxHQUFHLEtBQUs7RUFFdkIsSUFBSSxDQUFDakIsSUFBSSxDQUFDQyxLQUFLLElBQUksQ0FBQ2EsY0FBUSxDQUFDaEQsR0FBRyxDQUFDa0MsSUFBSSxDQUFDQyxLQUFLLENBQUMsRUFBRTtJQUM1QztJQUNBLElBQUkzQyxHQUFHLENBQUN5RCxJQUFJLFlBQVlHLE1BQU0sRUFBRTtNQUM5QjtNQUNBO01BQ0E7TUFDQTtNQUNBO01BQ0EsSUFBSTtRQUNGNUQsR0FBRyxDQUFDeUQsSUFBSSxHQUFHdkIsSUFBSSxDQUFDQyxLQUFLLENBQUNuQyxHQUFHLENBQUN5RCxJQUFJLENBQUM7TUFDakMsQ0FBQyxDQUFDLE9BQU9qQixDQUFDLEVBQUU7UUFDVixPQUFPcUIsY0FBYyxDQUFDN0QsR0FBRyxFQUFFOEIsR0FBRyxDQUFDO01BQ2pDO01BQ0E2QixXQUFXLEdBQUcsSUFBSTtJQUNwQjtJQUVBLElBQUkzRCxHQUFHLENBQUN5RCxJQUFJLEVBQUU7TUFDWixPQUFPekQsR0FBRyxDQUFDeUQsSUFBSSxDQUFDSyxpQkFBaUI7SUFDbkM7SUFFQSxJQUNFOUQsR0FBRyxDQUFDeUQsSUFBSSxJQUNSekQsR0FBRyxDQUFDeUQsSUFBSSxDQUFDTSxjQUFjLElBQ3ZCUCxjQUFRLENBQUNoRCxHQUFHLENBQUNSLEdBQUcsQ0FBQ3lELElBQUksQ0FBQ00sY0FBYyxDQUFDLEtBQ3BDLENBQUNyQixJQUFJLENBQUNHLFNBQVMsSUFBSVcsY0FBUSxDQUFDaEQsR0FBRyxDQUFDUixHQUFHLENBQUN5RCxJQUFJLENBQUNNLGNBQWMsQ0FBQyxDQUFDbEIsU0FBUyxLQUFLSCxJQUFJLENBQUNHLFNBQVMsQ0FBQyxFQUN2RjtNQUNBSCxJQUFJLENBQUNDLEtBQUssR0FBRzNDLEdBQUcsQ0FBQ3lELElBQUksQ0FBQ00sY0FBYztNQUNwQ3JCLElBQUksQ0FBQ08sYUFBYSxHQUFHakQsR0FBRyxDQUFDeUQsSUFBSSxDQUFDTyxjQUFjLElBQUksRUFBRTtNQUNsRCxPQUFPaEUsR0FBRyxDQUFDeUQsSUFBSSxDQUFDTSxjQUFjO01BQzlCLE9BQU8vRCxHQUFHLENBQUN5RCxJQUFJLENBQUNPLGNBQWM7TUFDOUI7TUFDQTtNQUNBLElBQUloRSxHQUFHLENBQUN5RCxJQUFJLENBQUNRLGNBQWMsRUFBRTtRQUMzQnZCLElBQUksQ0FBQ1UsYUFBYSxHQUFHcEQsR0FBRyxDQUFDeUQsSUFBSSxDQUFDUSxjQUFjO1FBQzVDLE9BQU9qRSxHQUFHLENBQUN5RCxJQUFJLENBQUNRLGNBQWM7TUFDaEM7TUFDQSxJQUFJakUsR0FBRyxDQUFDeUQsSUFBSSxDQUFDUyxlQUFlLEVBQUU7UUFDNUJ4QixJQUFJLENBQUNLLGNBQWMsR0FBRy9DLEdBQUcsQ0FBQ3lELElBQUksQ0FBQ1MsZUFBZTtRQUM5QyxPQUFPbEUsR0FBRyxDQUFDeUQsSUFBSSxDQUFDUyxlQUFlO01BQ2pDO01BQ0EsSUFBSWxFLEdBQUcsQ0FBQ3lELElBQUksQ0FBQ1UsYUFBYSxFQUFFO1FBQzFCekIsSUFBSSxDQUFDRSxZQUFZLEdBQUc1QyxHQUFHLENBQUN5RCxJQUFJLENBQUNVLGFBQWE7UUFDMUMsT0FBT25FLEdBQUcsQ0FBQ3lELElBQUksQ0FBQ1UsYUFBYTtNQUMvQjtNQUNBLElBQUluRSxHQUFHLENBQUN5RCxJQUFJLENBQUNXLFVBQVUsRUFBRTtRQUN2QjFCLElBQUksQ0FBQ0csU0FBUyxHQUFHN0MsR0FBRyxDQUFDeUQsSUFBSSxDQUFDVyxVQUFVO1FBQ3BDLE9BQU9wRSxHQUFHLENBQUN5RCxJQUFJLENBQUNXLFVBQVU7TUFDNUI7TUFDQSxJQUFJcEUsR0FBRyxDQUFDeUQsSUFBSSxDQUFDWSxRQUFRLEVBQUU7UUFDckIsSUFBSXJFLEdBQUcsQ0FBQ3lELElBQUksQ0FBQ1ksUUFBUSxZQUFZakMsTUFBTSxFQUFFO1VBQ3ZDTSxJQUFJLENBQUNULE9BQU8sR0FBR2pDLEdBQUcsQ0FBQ3lELElBQUksQ0FBQ1ksUUFBUTtRQUNsQyxDQUFDLE1BQU07VUFDTCxJQUFJO1lBQ0YzQixJQUFJLENBQUNULE9BQU8sR0FBR0MsSUFBSSxDQUFDQyxLQUFLLENBQUNuQyxHQUFHLENBQUN5RCxJQUFJLENBQUNZLFFBQVEsQ0FBQztZQUM1QyxJQUFJakMsTUFBTSxDQUFDQyxTQUFTLENBQUNDLFFBQVEsQ0FBQ0MsSUFBSSxDQUFDRyxJQUFJLENBQUNULE9BQU8sQ0FBQyxLQUFLLGlCQUFpQixFQUFFO2NBQ3RFLE1BQU0sMEJBQTBCO1lBQ2xDO1VBQ0YsQ0FBQyxDQUFDLE9BQU9PLENBQUMsRUFBRTtZQUNWLE9BQU9DLGdCQUFnQixDQUFDekMsR0FBRyxFQUFFOEIsR0FBRyxDQUFDO1VBQ25DO1FBQ0Y7UUFDQSxPQUFPOUIsR0FBRyxDQUFDeUQsSUFBSSxDQUFDWSxRQUFRO01BQzFCO01BQ0EsSUFBSXJFLEdBQUcsQ0FBQ3lELElBQUksQ0FBQ2EsWUFBWSxFQUFFO1FBQ3pCdEUsR0FBRyxDQUFDdUUsT0FBTyxDQUFDLGNBQWMsQ0FBQyxHQUFHdkUsR0FBRyxDQUFDeUQsSUFBSSxDQUFDYSxZQUFZO1FBQ25ELE9BQU90RSxHQUFHLENBQUN5RCxJQUFJLENBQUNhLFlBQVk7TUFDOUI7SUFDRixDQUFDLE1BQU07TUFDTCxPQUFPVCxjQUFjLENBQUM3RCxHQUFHLEVBQUU4QixHQUFHLENBQUM7SUFDakM7RUFDRjtFQUVBLElBQUlZLElBQUksQ0FBQ0UsWUFBWSxJQUFJLE9BQU9GLElBQUksQ0FBQ0UsWUFBWSxLQUFLLFFBQVEsRUFBRTtJQUM5REYsSUFBSSxDQUFDRSxZQUFZLEdBQUdGLElBQUksQ0FBQ0UsWUFBWSxDQUFDTixRQUFRLENBQUMsQ0FBQztFQUNsRDtFQUVBLElBQUlJLElBQUksQ0FBQ1UsYUFBYSxFQUFFO0lBQ3RCVixJQUFJLENBQUM4QixTQUFTLEdBQUdDLGtCQUFTLENBQUNDLFVBQVUsQ0FBQ2hDLElBQUksQ0FBQ1UsYUFBYSxDQUFDO0VBQzNEO0VBRUEsSUFBSU8sV0FBVyxFQUFFO0lBQ2YzRCxHQUFHLENBQUMyRSxRQUFRLEdBQUczRSxHQUFHLENBQUN5RCxJQUFJLENBQUNrQixRQUFRO0lBQ2hDO0lBQ0EsSUFBSUMsTUFBTSxHQUFHNUUsR0FBRyxDQUFDeUQsSUFBSSxDQUFDbUIsTUFBTTtJQUM1QjVFLEdBQUcsQ0FBQ3lELElBQUksR0FBR0csTUFBTSxDQUFDaUIsSUFBSSxDQUFDRCxNQUFNLEVBQUUsUUFBUSxDQUFDO0VBQzFDO0VBRUEsTUFBTUUsUUFBUSxHQUFHQyxXQUFXLENBQUMvRSxHQUFHLENBQUM7RUFDakMsTUFBTWdGLE1BQU0sR0FBR0MsZUFBTSxDQUFDekUsR0FBRyxDQUFDa0MsSUFBSSxDQUFDQyxLQUFLLEVBQUVYLEtBQUssQ0FBQztFQUM1QyxJQUFJZ0QsTUFBTSxDQUFDRSxLQUFLLElBQUlGLE1BQU0sQ0FBQ0UsS0FBSyxLQUFLLElBQUksRUFBRTtJQUN6Q3BELEdBQUcsQ0FBQ3FELE1BQU0sQ0FBQyxHQUFHLENBQUM7SUFDZnJELEdBQUcsQ0FBQ3NELElBQUksQ0FBQztNQUNQQyxJQUFJLEVBQUVDLGFBQUssQ0FBQ0MsS0FBSyxDQUFDQyxxQkFBcUI7TUFDdkNDLEtBQUssRUFBRyx5QkFBd0JULE1BQU0sQ0FBQ0UsS0FBTTtJQUMvQyxDQUFDLENBQUM7SUFDRjtFQUNGO0VBRUF4QyxJQUFJLENBQUNnRCxHQUFHLEdBQUdsQyxjQUFRLENBQUNoRCxHQUFHLENBQUNrQyxJQUFJLENBQUNDLEtBQUssQ0FBQztFQUNuQzNDLEdBQUcsQ0FBQ2dGLE1BQU0sR0FBR0EsTUFBTTtFQUNuQmhGLEdBQUcsQ0FBQ2dGLE1BQU0sQ0FBQ1QsT0FBTyxHQUFHdkUsR0FBRyxDQUFDdUUsT0FBTyxJQUFJLENBQUMsQ0FBQztFQUN0Q3ZFLEdBQUcsQ0FBQ2dGLE1BQU0sQ0FBQy9ELEVBQUUsR0FBRzZELFFBQVE7RUFDeEI5RSxHQUFHLENBQUMwQyxJQUFJLEdBQUdBLElBQUk7RUFFZixNQUFNaUQsYUFBYSxHQUNqQjNGLEdBQUcsQ0FBQ2dGLE1BQU0sQ0FBQ2xDLGNBQWMsSUFBSUosSUFBSSxDQUFDSSxjQUFjLEtBQUs5QyxHQUFHLENBQUNnRixNQUFNLENBQUNsQyxjQUFjO0VBQ2hGLElBQUk2QyxhQUFhLEVBQUU7SUFBQSxJQUFBQyxXQUFBO0lBQ2pCLElBQUlwRSxPQUFPLENBQUNzRCxRQUFRLEVBQUU5RSxHQUFHLENBQUNnRixNQUFNLENBQUNhLGlCQUFpQixJQUFJLEVBQUUsRUFBRTdGLEdBQUcsQ0FBQ2dGLE1BQU0sQ0FBQ2Msc0JBQXNCLENBQUMsRUFBRTtNQUM1RjlGLEdBQUcsQ0FBQytGLElBQUksR0FBRyxJQUFJQSxhQUFJLENBQUNDLElBQUksQ0FBQztRQUN2QmhCLE1BQU0sRUFBRWhGLEdBQUcsQ0FBQ2dGLE1BQU07UUFDbEJqQyxjQUFjLEVBQUVMLElBQUksQ0FBQ0ssY0FBYztRQUNuQzRDLGFBQWEsRUFBRTtNQUNqQixDQUFDLENBQUM7TUFDRjVELElBQUksQ0FBQyxDQUFDO01BQ047SUFDRjtJQUNBLE1BQU1rRSxHQUFHLEdBQUcsRUFBQUwsV0FBQSxHQUFBNUYsR0FBRyxDQUFDZ0YsTUFBTSxjQUFBWSxXQUFBLHVCQUFWQSxXQUFBLENBQVlNLGdCQUFnQixLQUFJQyxlQUFhO0lBQ3pERixHQUFHLENBQUNSLEtBQUssQ0FDTixxRUFBb0VYLFFBQVMsMERBQ2hGLENBQUM7RUFDSDtFQUVBLElBQUlzQixRQUFRLEdBQUcxRCxJQUFJLENBQUNHLFNBQVMsS0FBSzdDLEdBQUcsQ0FBQ2dGLE1BQU0sQ0FBQ25DLFNBQVM7RUFFdEQsSUFBSXVELFFBQVEsSUFBSSxDQUFDNUUsT0FBTyxDQUFDc0QsUUFBUSxFQUFFOUUsR0FBRyxDQUFDZ0YsTUFBTSxDQUFDcUIsWUFBWSxJQUFJLEVBQUUsRUFBRXJHLEdBQUcsQ0FBQ2dGLE1BQU0sQ0FBQ3NCLGlCQUFpQixDQUFDLEVBQUU7SUFBQSxJQUFBQyxZQUFBO0lBQy9GLE1BQU1OLEdBQUcsR0FBRyxFQUFBTSxZQUFBLEdBQUF2RyxHQUFHLENBQUNnRixNQUFNLGNBQUF1QixZQUFBLHVCQUFWQSxZQUFBLENBQVlMLGdCQUFnQixLQUFJQyxlQUFhO0lBQ3pERixHQUFHLENBQUNSLEtBQUssQ0FDTixnRUFBK0RYLFFBQVMscURBQzNFLENBQUM7SUFDRHNCLFFBQVEsR0FBRyxLQUFLO0lBQ2hCLE1BQU1YLEtBQUssR0FBRyxJQUFJRixLQUFLLENBQUMsQ0FBQztJQUN6QkUsS0FBSyxDQUFDTixNQUFNLEdBQUcsR0FBRztJQUNsQk0sS0FBSyxDQUFDZSxPQUFPLEdBQUksY0FBYTtJQUM5QixNQUFNZixLQUFLO0VBQ2I7RUFFQSxJQUFJVyxRQUFRLEVBQUU7SUFDWnBHLEdBQUcsQ0FBQytGLElBQUksR0FBRyxJQUFJQSxhQUFJLENBQUNDLElBQUksQ0FBQztNQUN2QmhCLE1BQU0sRUFBRWhGLEdBQUcsQ0FBQ2dGLE1BQU07TUFDbEJqQyxjQUFjLEVBQUVMLElBQUksQ0FBQ0ssY0FBYztNQUNuQ3FELFFBQVEsRUFBRTtJQUNaLENBQUMsQ0FBQztJQUNGLE9BQU9LLGVBQWUsQ0FBQ3pHLEdBQUcsRUFBRThCLEdBQUcsRUFBRUMsSUFBSSxDQUFDO0VBQ3hDO0VBRUEsSUFBSTJFLGdCQUFnQixHQUFHaEUsSUFBSSxDQUFDRyxTQUFTLEtBQUs3QyxHQUFHLENBQUNnRixNQUFNLENBQUMyQixpQkFBaUI7RUFDdEUsSUFDRSxPQUFPM0csR0FBRyxDQUFDZ0YsTUFBTSxDQUFDMkIsaUJBQWlCLElBQUksV0FBVyxJQUNsRDNHLEdBQUcsQ0FBQ2dGLE1BQU0sQ0FBQzJCLGlCQUFpQixJQUM1QkQsZ0JBQWdCLEVBQ2hCO0lBQ0ExRyxHQUFHLENBQUMrRixJQUFJLEdBQUcsSUFBSUEsYUFBSSxDQUFDQyxJQUFJLENBQUM7TUFDdkJoQixNQUFNLEVBQUVoRixHQUFHLENBQUNnRixNQUFNO01BQ2xCakMsY0FBYyxFQUFFTCxJQUFJLENBQUNLLGNBQWM7TUFDbkNxRCxRQUFRLEVBQUUsSUFBSTtNQUNkUSxVQUFVLEVBQUU7SUFDZCxDQUFDLENBQUM7SUFDRixPQUFPSCxlQUFlLENBQUN6RyxHQUFHLEVBQUU4QixHQUFHLEVBQUVDLElBQUksQ0FBQztFQUN4Qzs7RUFFQTtFQUNBO0VBQ0EsTUFBTThFLElBQUksR0FBRyxDQUFDLFdBQVcsRUFBRSxlQUFlLEVBQUUsV0FBVyxFQUFFLFlBQVksQ0FBQztFQUN0RSxNQUFNQyxnQkFBZ0IsR0FBR0QsSUFBSSxDQUFDRSxJQUFJLENBQUMsVUFBVUMsR0FBRyxFQUFFO0lBQ2hELE9BQU9oSCxHQUFHLENBQUNnRixNQUFNLENBQUNnQyxHQUFHLENBQUMsS0FBS0MsU0FBUztFQUN0QyxDQUFDLENBQUM7RUFDRixNQUFNQyxhQUFhLEdBQUdMLElBQUksQ0FBQ0UsSUFBSSxDQUFDLFVBQVVDLEdBQUcsRUFBRTtJQUM3QyxPQUFPaEgsR0FBRyxDQUFDZ0YsTUFBTSxDQUFDZ0MsR0FBRyxDQUFDLEtBQUtDLFNBQVMsSUFBSXZFLElBQUksQ0FBQ3NFLEdBQUcsQ0FBQyxLQUFLaEgsR0FBRyxDQUFDZ0YsTUFBTSxDQUFDZ0MsR0FBRyxDQUFDO0VBQ3ZFLENBQUMsQ0FBQztFQUVGLElBQUlGLGdCQUFnQixJQUFJLENBQUNJLGFBQWEsRUFBRTtJQUN0QyxPQUFPckQsY0FBYyxDQUFDN0QsR0FBRyxFQUFFOEIsR0FBRyxDQUFDO0VBQ2pDO0VBRUEsSUFBSTlCLEdBQUcsQ0FBQ0ksR0FBRyxJQUFJLFFBQVEsRUFBRTtJQUN2QixPQUFPc0MsSUFBSSxDQUFDRSxZQUFZO0VBQzFCO0VBRUEsSUFBSTVDLEdBQUcsQ0FBQ21ILFdBQVcsRUFBRTtJQUNuQm5ILEdBQUcsQ0FBQytGLElBQUksR0FBRyxJQUFJQSxhQUFJLENBQUNDLElBQUksQ0FBQztNQUN2QmhCLE1BQU0sRUFBRWhGLEdBQUcsQ0FBQ2dGLE1BQU07TUFDbEJqQyxjQUFjLEVBQUVMLElBQUksQ0FBQ0ssY0FBYztNQUNuQ3FELFFBQVEsRUFBRSxLQUFLO01BQ2ZnQixJQUFJLEVBQUVwSCxHQUFHLENBQUNtSDtJQUNaLENBQUMsQ0FBQztJQUNGLE9BQU9WLGVBQWUsQ0FBQ3pHLEdBQUcsRUFBRThCLEdBQUcsRUFBRUMsSUFBSSxDQUFDO0VBQ3hDO0VBRUEsSUFBSSxDQUFDVyxJQUFJLENBQUNFLFlBQVksRUFBRTtJQUN0QjVDLEdBQUcsQ0FBQytGLElBQUksR0FBRyxJQUFJQSxhQUFJLENBQUNDLElBQUksQ0FBQztNQUN2QmhCLE1BQU0sRUFBRWhGLEdBQUcsQ0FBQ2dGLE1BQU07TUFDbEJqQyxjQUFjLEVBQUVMLElBQUksQ0FBQ0ssY0FBYztNQUNuQ3FELFFBQVEsRUFBRTtJQUNaLENBQUMsQ0FBQztFQUNKO0VBQ0FLLGVBQWUsQ0FBQ3pHLEdBQUcsRUFBRThCLEdBQUcsRUFBRUMsSUFBSSxDQUFDO0FBQ2pDO0FBRUEsTUFBTTBFLGVBQWUsR0FBRyxNQUFBQSxDQUFPekcsR0FBRyxFQUFFOEIsR0FBRyxFQUFFQyxJQUFJLEtBQUs7RUFDaEQsTUFBTXNGLFVBQVUsR0FBR3JILEdBQUcsQ0FBQ2dGLE1BQU0sQ0FBQ3FDLFVBQVUsSUFBSSxFQUFFO0VBQzlDLElBQUk7SUFDRixNQUFNQyxPQUFPLENBQUNDLEdBQUcsQ0FDZkYsVUFBVSxDQUFDRyxHQUFHLENBQUMsTUFBTUMsS0FBSyxJQUFJO01BQzVCLE1BQU1DLE9BQU8sR0FBRyxJQUFJQyxNQUFNLENBQUNGLEtBQUssQ0FBQ0csSUFBSSxDQUFDO01BQ3RDLElBQUlGLE9BQU8sQ0FBQ0csSUFBSSxDQUFDN0gsR0FBRyxDQUFDSSxHQUFHLENBQUMsRUFBRTtRQUN6QixNQUFNcUgsS0FBSyxDQUFDSyxPQUFPLENBQUM5SCxHQUFHLEVBQUU4QixHQUFHLEVBQUVpRyxHQUFHLElBQUk7VUFDbkMsSUFBSUEsR0FBRyxFQUFFO1lBQ1AsSUFBSUEsR0FBRyxDQUFDMUMsSUFBSSxLQUFLQyxhQUFLLENBQUNDLEtBQUssQ0FBQ3lDLGlCQUFpQixFQUFFO2NBQzlDLE1BQU1ELEdBQUc7WUFDWDtZQUNBL0gsR0FBRyxDQUFDZ0YsTUFBTSxDQUFDa0IsZ0JBQWdCLENBQUNULEtBQUssQ0FDL0Isc0VBQXNFLEVBQ3RFc0MsR0FDRixDQUFDO1VBQ0g7UUFDRixDQUFDLENBQUM7TUFDSjtJQUNGLENBQUMsQ0FDSCxDQUFDO0VBQ0gsQ0FBQyxDQUFDLE9BQU90QyxLQUFLLEVBQUU7SUFDZDNELEdBQUcsQ0FBQ3FELE1BQU0sQ0FBQyxHQUFHLENBQUM7SUFDZnJELEdBQUcsQ0FBQ3NELElBQUksQ0FBQztNQUFFQyxJQUFJLEVBQUVDLGFBQUssQ0FBQ0MsS0FBSyxDQUFDeUMsaUJBQWlCO01BQUV2QyxLQUFLLEVBQUVBLEtBQUssQ0FBQ2U7SUFBUSxDQUFDLENBQUM7SUFDdkU7RUFDRjtFQUNBekUsSUFBSSxDQUFDLENBQUM7QUFDUixDQUFDO0FBRU0sTUFBTWtHLGtCQUFrQixHQUFHLE1BQUFBLENBQU9qSSxHQUFHLEVBQUU4QixHQUFHLEVBQUVDLElBQUksS0FBSztFQUMxRCxJQUFJO0lBQ0YsTUFBTVcsSUFBSSxHQUFHMUMsR0FBRyxDQUFDMEMsSUFBSTtJQUNyQixJQUFJMUMsR0FBRyxDQUFDK0YsSUFBSSxJQUFJL0YsR0FBRyxDQUFDSSxHQUFHLEtBQUssY0FBYyxFQUFFO01BQzFDMkIsSUFBSSxDQUFDLENBQUM7TUFDTjtJQUNGO0lBQ0EsSUFBSW1HLFdBQVcsR0FBRyxJQUFJO0lBQ3RCLElBQ0V4RixJQUFJLENBQUNFLFlBQVksSUFDakI1QyxHQUFHLENBQUNJLEdBQUcsS0FBSyw0QkFBNEIsSUFDeENzQyxJQUFJLENBQUNFLFlBQVksQ0FBQ3VGLE9BQU8sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQ3BDO01BQ0FELFdBQVcsR0FBRyxNQUFNbkMsYUFBSSxDQUFDcUMsNEJBQTRCLENBQUM7UUFDcERwRCxNQUFNLEVBQUVoRixHQUFHLENBQUNnRixNQUFNO1FBQ2xCakMsY0FBYyxFQUFFTCxJQUFJLENBQUNLLGNBQWM7UUFDbkNILFlBQVksRUFBRUYsSUFBSSxDQUFDRTtNQUNyQixDQUFDLENBQUM7SUFDSixDQUFDLE1BQU07TUFDTHNGLFdBQVcsR0FBRyxNQUFNbkMsYUFBSSxDQUFDc0Msc0JBQXNCLENBQUM7UUFDOUNyRCxNQUFNLEVBQUVoRixHQUFHLENBQUNnRixNQUFNO1FBQ2xCakMsY0FBYyxFQUFFTCxJQUFJLENBQUNLLGNBQWM7UUFDbkNILFlBQVksRUFBRUYsSUFBSSxDQUFDRTtNQUNyQixDQUFDLENBQUM7SUFDSjtJQUNBNUMsR0FBRyxDQUFDK0YsSUFBSSxHQUFHbUMsV0FBVztJQUN0Qm5HLElBQUksQ0FBQyxDQUFDO0VBQ1IsQ0FBQyxDQUFDLE9BQU8wRCxLQUFLLEVBQUU7SUFDZCxJQUFJQSxLQUFLLFlBQVlILGFBQUssQ0FBQ0MsS0FBSyxFQUFFO01BQ2hDeEQsSUFBSSxDQUFDMEQsS0FBSyxDQUFDO01BQ1g7SUFDRjtJQUNBO0lBQ0F6RixHQUFHLENBQUNnRixNQUFNLENBQUNrQixnQkFBZ0IsQ0FBQ1QsS0FBSyxDQUFDLHFDQUFxQyxFQUFFQSxLQUFLLENBQUM7SUFDL0UsTUFBTSxJQUFJSCxhQUFLLENBQUNDLEtBQUssQ0FBQ0QsYUFBSyxDQUFDQyxLQUFLLENBQUMrQyxhQUFhLEVBQUU3QyxLQUFLLENBQUM7RUFDekQ7QUFDRixDQUFDO0FBQUMzRixPQUFBLENBQUFtSSxrQkFBQSxHQUFBQSxrQkFBQTtBQUVGLFNBQVNsRCxXQUFXQSxDQUFDL0UsR0FBRyxFQUFFO0VBQ3hCLE9BQU9BLEdBQUcsQ0FBQ2lCLEVBQUU7QUFDZjtBQUVBLFNBQVNxQyxRQUFRQSxDQUFDdEQsR0FBRyxFQUFFO0VBQ3JCLElBQUksQ0FBQyxDQUFDQSxHQUFHLENBQUNBLEdBQUcsSUFBSUEsR0FBRyxFQUFFdUUsT0FBTyxDQUFDZ0UsYUFBYSxFQUFFO0VBRTdDLElBQUlDLE1BQU0sR0FBRyxDQUFDeEksR0FBRyxDQUFDQSxHQUFHLElBQUlBLEdBQUcsRUFBRXVFLE9BQU8sQ0FBQ2dFLGFBQWE7RUFDbkQsSUFBSTVGLEtBQUssRUFBRUUsU0FBUyxFQUFFSSxhQUFhOztFQUVuQztFQUNBLElBQUl3RixVQUFVLEdBQUcsUUFBUTtFQUV6QixJQUFJQyxLQUFLLEdBQUdGLE1BQU0sQ0FBQ0csV0FBVyxDQUFDLENBQUMsQ0FBQ1IsT0FBTyxDQUFDTSxVQUFVLENBQUM7RUFFcEQsSUFBSUMsS0FBSyxJQUFJLENBQUMsRUFBRTtJQUNkLElBQUlFLFdBQVcsR0FBR0osTUFBTSxDQUFDSyxTQUFTLENBQUNKLFVBQVUsQ0FBQ3RJLE1BQU0sRUFBRXFJLE1BQU0sQ0FBQ3JJLE1BQU0sQ0FBQztJQUNwRSxJQUFJMkksV0FBVyxHQUFHQyxZQUFZLENBQUNILFdBQVcsQ0FBQyxDQUFDekgsS0FBSyxDQUFDLEdBQUcsQ0FBQztJQUV0RCxJQUFJMkgsV0FBVyxDQUFDM0ksTUFBTSxJQUFJLENBQUMsRUFBRTtNQUMzQndDLEtBQUssR0FBR21HLFdBQVcsQ0FBQyxDQUFDLENBQUM7TUFDdEIsSUFBSTlCLEdBQUcsR0FBRzhCLFdBQVcsQ0FBQyxDQUFDLENBQUM7TUFFeEIsSUFBSUUsV0FBVyxHQUFHLGlCQUFpQjtNQUVuQyxJQUFJQyxRQUFRLEdBQUdqQyxHQUFHLENBQUNtQixPQUFPLENBQUNhLFdBQVcsQ0FBQztNQUN2QyxJQUFJQyxRQUFRLElBQUksQ0FBQyxFQUFFO1FBQ2pCaEcsYUFBYSxHQUFHK0QsR0FBRyxDQUFDNkIsU0FBUyxDQUFDRyxXQUFXLENBQUM3SSxNQUFNLEVBQUU2RyxHQUFHLENBQUM3RyxNQUFNLENBQUM7TUFDL0QsQ0FBQyxNQUFNO1FBQ0wwQyxTQUFTLEdBQUdtRSxHQUFHO01BQ2pCO0lBQ0Y7RUFDRjtFQUVBLE9BQU87SUFBRXJFLEtBQUssRUFBRUEsS0FBSztJQUFFRSxTQUFTLEVBQUVBLFNBQVM7SUFBRUksYUFBYSxFQUFFQTtFQUFjLENBQUM7QUFDN0U7QUFFQSxTQUFTOEYsWUFBWUEsQ0FBQ0csR0FBRyxFQUFFO0VBQ3pCLE9BQU90RixNQUFNLENBQUNpQixJQUFJLENBQUNxRSxHQUFHLEVBQUUsUUFBUSxDQUFDLENBQUM1RyxRQUFRLENBQUMsQ0FBQztBQUM5QztBQUVPLFNBQVM2RyxnQkFBZ0JBLENBQUN4RyxLQUFLLEVBQUU7RUFDdEMsT0FBTyxDQUFDM0MsR0FBRyxFQUFFOEIsR0FBRyxFQUFFQyxJQUFJLEtBQUs7SUFDekIsTUFBTWlELE1BQU0sR0FBR0MsZUFBTSxDQUFDekUsR0FBRyxDQUFDbUMsS0FBSyxFQUFFNUMsa0JBQWtCLENBQUNDLEdBQUcsQ0FBQyxDQUFDO0lBQ3pELElBQUlvSixZQUFZLEdBQUd2Six1QkFBdUI7SUFDMUMsSUFBSW1GLE1BQU0sSUFBSUEsTUFBTSxDQUFDb0UsWUFBWSxFQUFFO01BQ2pDQSxZQUFZLElBQUssS0FBSXBFLE1BQU0sQ0FBQ29FLFlBQVksQ0FBQ0MsSUFBSSxDQUFDLElBQUksQ0FBRSxFQUFDO0lBQ3ZEO0lBRUEsTUFBTUMsV0FBVyxHQUNmLFFBQU90RSxNQUFNLGFBQU5BLE1BQU0sdUJBQU5BLE1BQU0sQ0FBRXVFLFdBQVcsTUFBSyxRQUFRLEdBQUcsQ0FBQ3ZFLE1BQU0sQ0FBQ3VFLFdBQVcsQ0FBQyxHQUFHLENBQUF2RSxNQUFNLGFBQU5BLE1BQU0sdUJBQU5BLE1BQU0sQ0FBRXVFLFdBQVcsS0FBSSxDQUFDLEdBQUcsQ0FBQztJQUMvRixNQUFNQyxhQUFhLEdBQUd4SixHQUFHLENBQUN1RSxPQUFPLENBQUNrRixNQUFNO0lBQ3hDLE1BQU1DLFlBQVksR0FDaEJGLGFBQWEsSUFBSUYsV0FBVyxDQUFDMUgsUUFBUSxDQUFDNEgsYUFBYSxDQUFDLEdBQUdBLGFBQWEsR0FBR0YsV0FBVyxDQUFDLENBQUMsQ0FBQztJQUN2RnhILEdBQUcsQ0FBQzBHLE1BQU0sQ0FBQyw2QkFBNkIsRUFBRWtCLFlBQVksQ0FBQztJQUN2RDVILEdBQUcsQ0FBQzBHLE1BQU0sQ0FBQyw4QkFBOEIsRUFBRSw2QkFBNkIsQ0FBQztJQUN6RTFHLEdBQUcsQ0FBQzBHLE1BQU0sQ0FBQyw4QkFBOEIsRUFBRVksWUFBWSxDQUFDO0lBQ3hEdEgsR0FBRyxDQUFDMEcsTUFBTSxDQUFDLCtCQUErQixFQUFFLCtDQUErQyxDQUFDO0lBQzVGO0lBQ0EsSUFBSSxTQUFTLElBQUl4SSxHQUFHLENBQUMySixNQUFNLEVBQUU7TUFDM0I3SCxHQUFHLENBQUM4SCxVQUFVLENBQUMsR0FBRyxDQUFDO0lBQ3JCLENBQUMsTUFBTTtNQUNMN0gsSUFBSSxDQUFDLENBQUM7SUFDUjtFQUNGLENBQUM7QUFDSDtBQUVPLFNBQVM4SCxtQkFBbUJBLENBQUM3SixHQUFHLEVBQUU4QixHQUFHLEVBQUVDLElBQUksRUFBRTtFQUNsRCxJQUFJL0IsR0FBRyxDQUFDMkosTUFBTSxLQUFLLE1BQU0sSUFBSTNKLEdBQUcsQ0FBQ3lELElBQUksQ0FBQ3FHLE9BQU8sRUFBRTtJQUM3QzlKLEdBQUcsQ0FBQytKLGNBQWMsR0FBRy9KLEdBQUcsQ0FBQzJKLE1BQU07SUFDL0IzSixHQUFHLENBQUMySixNQUFNLEdBQUczSixHQUFHLENBQUN5RCxJQUFJLENBQUNxRyxPQUFPO0lBQzdCLE9BQU85SixHQUFHLENBQUN5RCxJQUFJLENBQUNxRyxPQUFPO0VBQ3pCO0VBQ0EvSCxJQUFJLENBQUMsQ0FBQztBQUNSO0FBRU8sU0FBU2lJLGlCQUFpQkEsQ0FBQ2pDLEdBQUcsRUFBRS9ILEdBQUcsRUFBRThCLEdBQUcsRUFBRUMsSUFBSSxFQUFFO0VBQ3JELE1BQU1rRSxHQUFHLEdBQUlqRyxHQUFHLENBQUNnRixNQUFNLElBQUloRixHQUFHLENBQUNnRixNQUFNLENBQUNrQixnQkFBZ0IsSUFBS0MsZUFBYTtFQUN4RSxJQUFJNEIsR0FBRyxZQUFZekMsYUFBSyxDQUFDQyxLQUFLLEVBQUU7SUFDOUIsSUFBSXZGLEdBQUcsQ0FBQ2dGLE1BQU0sSUFBSWhGLEdBQUcsQ0FBQ2dGLE1BQU0sQ0FBQ2lGLHlCQUF5QixFQUFFO01BQ3RELE9BQU9sSSxJQUFJLENBQUNnRyxHQUFHLENBQUM7SUFDbEI7SUFDQSxJQUFJbUMsVUFBVTtJQUNkO0lBQ0EsUUFBUW5DLEdBQUcsQ0FBQzFDLElBQUk7TUFDZCxLQUFLQyxhQUFLLENBQUNDLEtBQUssQ0FBQ0MscUJBQXFCO1FBQ3BDMEUsVUFBVSxHQUFHLEdBQUc7UUFDaEI7TUFDRixLQUFLNUUsYUFBSyxDQUFDQyxLQUFLLENBQUM0RSxnQkFBZ0I7UUFDL0JELFVBQVUsR0FBRyxHQUFHO1FBQ2hCO01BQ0Y7UUFDRUEsVUFBVSxHQUFHLEdBQUc7SUFDcEI7SUFDQXBJLEdBQUcsQ0FBQ3FELE1BQU0sQ0FBQytFLFVBQVUsQ0FBQztJQUN0QnBJLEdBQUcsQ0FBQ3NELElBQUksQ0FBQztNQUFFQyxJQUFJLEVBQUUwQyxHQUFHLENBQUMxQyxJQUFJO01BQUVJLEtBQUssRUFBRXNDLEdBQUcsQ0FBQ3ZCO0lBQVEsQ0FBQyxDQUFDO0lBQ2hEUCxHQUFHLENBQUNSLEtBQUssQ0FBQyxlQUFlLEVBQUVzQyxHQUFHLENBQUM7RUFDakMsQ0FBQyxNQUFNLElBQUlBLEdBQUcsQ0FBQzVDLE1BQU0sSUFBSTRDLEdBQUcsQ0FBQ3ZCLE9BQU8sRUFBRTtJQUNwQzFFLEdBQUcsQ0FBQ3FELE1BQU0sQ0FBQzRDLEdBQUcsQ0FBQzVDLE1BQU0sQ0FBQztJQUN0QnJELEdBQUcsQ0FBQ3NELElBQUksQ0FBQztNQUFFSyxLQUFLLEVBQUVzQyxHQUFHLENBQUN2QjtJQUFRLENBQUMsQ0FBQztJQUNoQyxJQUFJLEVBQUU0RCxPQUFPLElBQUlBLE9BQU8sQ0FBQ0MsR0FBRyxDQUFDQyxPQUFPLENBQUMsRUFBRTtNQUNyQ3ZJLElBQUksQ0FBQ2dHLEdBQUcsQ0FBQztJQUNYO0VBQ0YsQ0FBQyxNQUFNO0lBQ0w5QixHQUFHLENBQUNSLEtBQUssQ0FBQyxpQ0FBaUMsRUFBRXNDLEdBQUcsRUFBRUEsR0FBRyxDQUFDd0MsS0FBSyxDQUFDO0lBQzVEekksR0FBRyxDQUFDcUQsTUFBTSxDQUFDLEdBQUcsQ0FBQztJQUNmckQsR0FBRyxDQUFDc0QsSUFBSSxDQUFDO01BQ1BDLElBQUksRUFBRUMsYUFBSyxDQUFDQyxLQUFLLENBQUNDLHFCQUFxQjtNQUN2Q2dCLE9BQU8sRUFBRTtJQUNYLENBQUMsQ0FBQztJQUNGLElBQUksRUFBRTRELE9BQU8sSUFBSUEsT0FBTyxDQUFDQyxHQUFHLENBQUNDLE9BQU8sQ0FBQyxFQUFFO01BQ3JDdkksSUFBSSxDQUFDZ0csR0FBRyxDQUFDO0lBQ1g7RUFDRjtBQUNGO0FBRU8sU0FBU3lDLHNCQUFzQkEsQ0FBQ3hLLEdBQUcsRUFBRThCLEdBQUcsRUFBRUMsSUFBSSxFQUFFO0VBQ3JELElBQUksQ0FBQy9CLEdBQUcsQ0FBQytGLElBQUksQ0FBQ0ssUUFBUSxFQUFFO0lBQ3RCdEUsR0FBRyxDQUFDcUQsTUFBTSxDQUFDLEdBQUcsQ0FBQztJQUNmckQsR0FBRyxDQUFDMkksR0FBRyxDQUFDLGtEQUFrRCxDQUFDO0lBQzNEO0VBQ0Y7RUFDQTFJLElBQUksQ0FBQyxDQUFDO0FBQ1I7QUFFTyxTQUFTMkksNkJBQTZCQSxDQUFDQyxPQUFPLEVBQUU7RUFDckQsSUFBSSxDQUFDQSxPQUFPLENBQUM1RSxJQUFJLENBQUNLLFFBQVEsRUFBRTtJQUMxQixNQUFNWCxLQUFLLEdBQUcsSUFBSUYsS0FBSyxDQUFDLENBQUM7SUFDekJFLEtBQUssQ0FBQ04sTUFBTSxHQUFHLEdBQUc7SUFDbEJNLEtBQUssQ0FBQ2UsT0FBTyxHQUFHLHNDQUFzQztJQUN0RCxNQUFNZixLQUFLO0VBQ2I7RUFDQSxPQUFPNkIsT0FBTyxDQUFDc0QsT0FBTyxDQUFDLENBQUM7QUFDMUI7QUFFTyxNQUFNQyxZQUFZLEdBQUdBLENBQUNDLEtBQUssRUFBRTlGLE1BQU0sRUFBRStGLEtBQUssS0FBSztFQUNwRCxJQUFJLE9BQU8vRixNQUFNLEtBQUssUUFBUSxFQUFFO0lBQzlCQSxNQUFNLEdBQUdDLGVBQU0sQ0FBQ3pFLEdBQUcsQ0FBQ3dFLE1BQU0sQ0FBQztFQUM3QjtFQUNBLEtBQUssTUFBTWdDLEdBQUcsSUFBSThELEtBQUssRUFBRTtJQUN2QixJQUFJLENBQUNFLDZCQUFnQixDQUFDaEUsR0FBRyxDQUFDLEVBQUU7TUFDMUIsTUFBTyw4QkFBNkJBLEdBQUksR0FBRTtJQUM1QztFQUNGO0VBQ0EsSUFBSSxDQUFDaEMsTUFBTSxDQUFDcUMsVUFBVSxFQUFFO0lBQ3RCckMsTUFBTSxDQUFDcUMsVUFBVSxHQUFHLEVBQUU7RUFDeEI7RUFDQSxNQUFNNEQsVUFBVSxHQUFHO0lBQ2pCQyxpQkFBaUIsRUFBRTVELE9BQU8sQ0FBQ3NELE9BQU8sQ0FBQyxDQUFDO0lBQ3BDakssS0FBSyxFQUFFLElBQUk7SUFDWHdLLFNBQVMsRUFBRTtFQUNiLENBQUM7RUFDRCxJQUFJTCxLQUFLLENBQUNNLFFBQVEsRUFBRTtJQUNsQixNQUFNQyxNQUFNLEdBQUcsSUFBQUMsbUJBQVksRUFBQztNQUMxQmxMLEdBQUcsRUFBRTBLLEtBQUssQ0FBQ007SUFDYixDQUFDLENBQUM7SUFDRkgsVUFBVSxDQUFDQyxpQkFBaUIsR0FBRyxZQUFZO01BQ3pDLElBQUlELFVBQVUsQ0FBQ0UsU0FBUyxFQUFFO1FBQ3hCO01BQ0Y7TUFDQSxJQUFJO1FBQ0YsTUFBTUUsTUFBTSxDQUFDRSxPQUFPLENBQUMsQ0FBQztRQUN0Qk4sVUFBVSxDQUFDRSxTQUFTLEdBQUcsSUFBSTtNQUM3QixDQUFDLENBQUMsT0FBTzNJLENBQUMsRUFBRTtRQUFBLElBQUFnSixPQUFBO1FBQ1YsTUFBTXZGLEdBQUcsR0FBRyxFQUFBdUYsT0FBQSxHQUFBeEcsTUFBTSxjQUFBd0csT0FBQSx1QkFBTkEsT0FBQSxDQUFRdEYsZ0JBQWdCLEtBQUlDLGVBQWE7UUFDckRGLEdBQUcsQ0FBQ1IsS0FBSyxDQUFFLGdEQUErQ2pELENBQUUsRUFBQyxDQUFDO01BQ2hFO0lBQ0YsQ0FBQztJQUNEeUksVUFBVSxDQUFDQyxpQkFBaUIsQ0FBQyxDQUFDO0lBQzlCRCxVQUFVLENBQUN0SyxLQUFLLEdBQUcsSUFBSThLLHVCQUFVLENBQUM7TUFDaENDLFdBQVcsRUFBRSxNQUFBQSxDQUFPLEdBQUdDLElBQUksS0FBSztRQUM5QixNQUFNVixVQUFVLENBQUNDLGlCQUFpQixDQUFDLENBQUM7UUFDcEMsT0FBT0csTUFBTSxDQUFDSyxXQUFXLENBQUNDLElBQUksQ0FBQztNQUNqQztJQUNGLENBQUMsQ0FBQztFQUNKO0VBQ0EsSUFBSUMsYUFBYSxHQUFHZCxLQUFLLENBQUNlLFdBQVcsQ0FBQzFLLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQ2tJLElBQUksQ0FBQyxPQUFPLENBQUM7RUFDL0QsSUFBSXVDLGFBQWEsS0FBSyxHQUFHLEVBQUU7SUFDekJBLGFBQWEsR0FBRyxNQUFNO0VBQ3hCO0VBQ0E1RyxNQUFNLENBQUNxQyxVQUFVLENBQUN5RSxJQUFJLENBQUM7SUFDckJsRSxJQUFJLEVBQUUsSUFBQW1FLDBCQUFZLEVBQUNILGFBQWEsQ0FBQztJQUNqQzlELE9BQU8sRUFBRSxJQUFBa0UseUJBQVMsRUFBQztNQUNqQkMsUUFBUSxFQUFFbkIsS0FBSyxDQUFDb0IsaUJBQWlCO01BQ2pDQyxHQUFHLEVBQUVyQixLQUFLLENBQUNzQixZQUFZO01BQ3ZCNUYsT0FBTyxFQUFFc0UsS0FBSyxDQUFDdUIsb0JBQW9CLElBQUlyQiw2QkFBZ0IsQ0FBQ3FCLG9CQUFvQixDQUFDek0sT0FBTztNQUNwRmtJLE9BQU8sRUFBRUEsQ0FBQzZDLE9BQU8sRUFBRTJCLFFBQVEsRUFBRXZLLElBQUksRUFBRXdLLE9BQU8sS0FBSztRQUM3QyxNQUFNO1VBQ0psSCxJQUFJLEVBQUVDLGFBQUssQ0FBQ0MsS0FBSyxDQUFDeUMsaUJBQWlCO1VBQ25DeEIsT0FBTyxFQUFFK0YsT0FBTyxDQUFDL0Y7UUFDbkIsQ0FBQztNQUNILENBQUM7TUFDRGdHLElBQUksRUFBRTdCLE9BQU8sSUFBSTtRQUFBLElBQUE4QixhQUFBO1FBQ2YsSUFBSTlCLE9BQU8sQ0FBQzFKLEVBQUUsS0FBSyxXQUFXLElBQUksQ0FBQzZKLEtBQUssQ0FBQzRCLHVCQUF1QixFQUFFO1VBQ2hFLE9BQU8sSUFBSTtRQUNiO1FBQ0EsSUFBSTVCLEtBQUssQ0FBQzZCLGdCQUFnQixFQUFFO1VBQzFCLE9BQU8sS0FBSztRQUNkO1FBQ0EsSUFBSTdCLEtBQUssQ0FBQzhCLGNBQWMsRUFBRTtVQUN4QixJQUFJQyxLQUFLLENBQUNDLE9BQU8sQ0FBQ2hDLEtBQUssQ0FBQzhCLGNBQWMsQ0FBQyxFQUFFO1lBQ3ZDLElBQUksQ0FBQzlCLEtBQUssQ0FBQzhCLGNBQWMsQ0FBQ2hMLFFBQVEsQ0FBQytJLE9BQU8sQ0FBQ2hCLE1BQU0sQ0FBQyxFQUFFO2NBQ2xELE9BQU8sSUFBSTtZQUNiO1VBQ0YsQ0FBQyxNQUFNO1lBQ0wsTUFBTW9ELE1BQU0sR0FBRyxJQUFJcEYsTUFBTSxDQUFDbUQsS0FBSyxDQUFDOEIsY0FBYyxDQUFDO1lBQy9DLElBQUksQ0FBQ0csTUFBTSxDQUFDbEYsSUFBSSxDQUFDOEMsT0FBTyxDQUFDaEIsTUFBTSxDQUFDLEVBQUU7Y0FDaEMsT0FBTyxJQUFJO1lBQ2I7VUFDRjtRQUNGO1FBQ0EsUUFBQThDLGFBQUEsR0FBTzlCLE9BQU8sQ0FBQzVFLElBQUksY0FBQTBHLGFBQUEsdUJBQVpBLGFBQUEsQ0FBY3JHLFFBQVE7TUFDL0IsQ0FBQztNQUNENEcsWUFBWSxFQUFFLE1BQU1yQyxPQUFPLElBQUk7UUFDN0IsSUFBSUcsS0FBSyxDQUFDbUMsSUFBSSxLQUFLM0gsYUFBSyxDQUFDNEgsTUFBTSxDQUFDQyxhQUFhLENBQUNDLE1BQU0sRUFBRTtVQUNwRCxPQUFPekMsT0FBTyxDQUFDM0YsTUFBTSxDQUFDckMsS0FBSztRQUM3QjtRQUNBLE1BQU0wSyxLQUFLLEdBQUcxQyxPQUFPLENBQUNqSSxJQUFJLENBQUNFLFlBQVk7UUFDdkMsSUFBSWtJLEtBQUssQ0FBQ21DLElBQUksS0FBSzNILGFBQUssQ0FBQzRILE1BQU0sQ0FBQ0MsYUFBYSxDQUFDRyxPQUFPLElBQUlELEtBQUssRUFBRTtVQUM5RCxPQUFPQSxLQUFLO1FBQ2Q7UUFDQSxJQUFJdkMsS0FBSyxDQUFDbUMsSUFBSSxLQUFLM0gsYUFBSyxDQUFDNEgsTUFBTSxDQUFDQyxhQUFhLENBQUMvRixJQUFJLElBQUlpRyxLQUFLLEVBQUU7VUFBQSxJQUFBRSxjQUFBO1VBQzNELElBQUksQ0FBQzVDLE9BQU8sQ0FBQzVFLElBQUksRUFBRTtZQUNqQixNQUFNLElBQUl1QixPQUFPLENBQUNzRCxPQUFPLElBQUkzQyxrQkFBa0IsQ0FBQzBDLE9BQU8sRUFBRSxJQUFJLEVBQUVDLE9BQU8sQ0FBQyxDQUFDO1VBQzFFO1VBQ0EsSUFBSSxDQUFBMkMsY0FBQSxHQUFBNUMsT0FBTyxDQUFDNUUsSUFBSSxjQUFBd0gsY0FBQSxnQkFBQUEsY0FBQSxHQUFaQSxjQUFBLENBQWNuRyxJQUFJLGNBQUFtRyxjQUFBLGVBQWxCQSxjQUFBLENBQW9CQyxFQUFFLElBQUk3QyxPQUFPLENBQUNzQyxJQUFJLEtBQUssTUFBTSxFQUFFO1lBQ3JELE9BQU90QyxPQUFPLENBQUM1RSxJQUFJLENBQUNxQixJQUFJLENBQUNvRyxFQUFFO1VBQzdCO1FBQ0Y7UUFDQSxPQUFPN0MsT0FBTyxDQUFDM0YsTUFBTSxDQUFDL0QsRUFBRTtNQUMxQixDQUFDO01BQ0ROLEtBQUssRUFBRXNLLFVBQVUsQ0FBQ3RLO0lBQ3BCLENBQUMsQ0FBQztJQUNGb0s7RUFDRixDQUFDLENBQUM7RUFDRjlGLGVBQU0sQ0FBQ3dJLEdBQUcsQ0FBQ3pJLE1BQU0sQ0FBQztBQUNwQixDQUFDOztBQUVEO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUxBbEYsT0FBQSxDQUFBK0ssWUFBQSxHQUFBQSxZQUFBO0FBTU8sU0FBUzZDLHdCQUF3QkEsQ0FBQzFOLEdBQUcsRUFBRTtFQUM1QztFQUNBLElBQ0UsRUFDRUEsR0FBRyxDQUFDZ0YsTUFBTSxDQUFDMkksUUFBUSxDQUFDQyxPQUFPLFlBQVlDLDRCQUFtQixJQUMxRDdOLEdBQUcsQ0FBQ2dGLE1BQU0sQ0FBQzJJLFFBQVEsQ0FBQ0MsT0FBTyxZQUFZRSwrQkFBc0IsQ0FDOUQsRUFDRDtJQUNBLE9BQU94RyxPQUFPLENBQUNzRCxPQUFPLENBQUMsQ0FBQztFQUMxQjtFQUNBO0VBQ0EsTUFBTTVGLE1BQU0sR0FBR2hGLEdBQUcsQ0FBQ2dGLE1BQU07RUFDekIsTUFBTStJLFNBQVMsR0FBRyxDQUFDLENBQUMvTixHQUFHLElBQUksQ0FBQyxDQUFDLEVBQUV1RSxPQUFPLElBQUksQ0FBQyxDQUFDLEVBQUUsb0JBQW9CLENBQUM7RUFDbkUsTUFBTTtJQUFFeUosS0FBSztJQUFFQztFQUFJLENBQUMsR0FBR2pKLE1BQU0sQ0FBQ2tKLGtCQUFrQjtFQUNoRCxJQUFJLENBQUNILFNBQVMsSUFBSSxDQUFDL0ksTUFBTSxDQUFDa0osa0JBQWtCLEVBQUU7SUFDNUMsT0FBTzVHLE9BQU8sQ0FBQ3NELE9BQU8sQ0FBQyxDQUFDO0VBQzFCO0VBQ0E7RUFDQTtFQUNBLE1BQU11RCxPQUFPLEdBQUduTyxHQUFHLENBQUM0SCxJQUFJLENBQUN3RyxPQUFPLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQztFQUMvQztFQUNBLElBQUkxRixLQUFLLEdBQUcsS0FBSztFQUNqQixLQUFLLE1BQU1kLElBQUksSUFBSW9HLEtBQUssRUFBRTtJQUN4QjtJQUNBLE1BQU1LLEtBQUssR0FBRyxJQUFJMUcsTUFBTSxDQUFDQyxJQUFJLENBQUMwRyxNQUFNLENBQUMsQ0FBQyxDQUFDLEtBQUssR0FBRyxHQUFHMUcsSUFBSSxHQUFHLEdBQUcsR0FBR0EsSUFBSSxDQUFDO0lBQ3BFLElBQUl1RyxPQUFPLENBQUN6RixLQUFLLENBQUMyRixLQUFLLENBQUMsRUFBRTtNQUN4QjNGLEtBQUssR0FBRyxJQUFJO01BQ1o7SUFDRjtFQUNGO0VBQ0EsSUFBSSxDQUFDQSxLQUFLLEVBQUU7SUFDVixPQUFPcEIsT0FBTyxDQUFDc0QsT0FBTyxDQUFDLENBQUM7RUFDMUI7RUFDQTtFQUNBLE1BQU0yRCxVQUFVLEdBQUcsSUFBSUMsSUFBSSxDQUFDLElBQUlBLElBQUksQ0FBQyxDQUFDLENBQUNDLFVBQVUsQ0FBQyxJQUFJRCxJQUFJLENBQUMsQ0FBQyxDQUFDRSxVQUFVLENBQUMsQ0FBQyxHQUFHVCxHQUFHLENBQUMsQ0FBQztFQUNqRixPQUFPVSxhQUFJLENBQ1JDLE1BQU0sQ0FBQzVKLE1BQU0sRUFBRWUsYUFBSSxDQUFDOEksTUFBTSxDQUFDN0osTUFBTSxDQUFDLEVBQUUsY0FBYyxFQUFFO0lBQ25EOEosS0FBSyxFQUFFZixTQUFTO0lBQ2hCZ0IsTUFBTSxFQUFFekosYUFBSyxDQUFDMEosT0FBTyxDQUFDVCxVQUFVO0VBQ2xDLENBQUMsQ0FBQyxDQUNEVSxLQUFLLENBQUN6TSxDQUFDLElBQUk7SUFDVixJQUFJQSxDQUFDLENBQUM2QyxJQUFJLElBQUlDLGFBQUssQ0FBQ0MsS0FBSyxDQUFDMkosZUFBZSxFQUFFO01BQ3pDLE1BQU0sSUFBSTVKLGFBQUssQ0FBQ0MsS0FBSyxDQUFDRCxhQUFLLENBQUNDLEtBQUssQ0FBQzRKLGlCQUFpQixFQUFFLG1CQUFtQixDQUFDO0lBQzNFO0lBQ0EsTUFBTTNNLENBQUM7RUFDVCxDQUFDLENBQUM7QUFDTjtBQUVBLFNBQVNxQixjQUFjQSxDQUFDN0QsR0FBRyxFQUFFOEIsR0FBRyxFQUFFO0VBQ2hDQSxHQUFHLENBQUNxRCxNQUFNLENBQUMsR0FBRyxDQUFDO0VBQ2ZyRCxHQUFHLENBQUMySSxHQUFHLENBQUMsMEJBQTBCLENBQUM7QUFDckM7QUFFQSxTQUFTaEksZ0JBQWdCQSxDQUFDekMsR0FBRyxFQUFFOEIsR0FBRyxFQUFFO0VBQ2xDQSxHQUFHLENBQUNxRCxNQUFNLENBQUMsR0FBRyxDQUFDO0VBQ2ZyRCxHQUFHLENBQUNzRCxJQUFJLENBQUM7SUFBRUMsSUFBSSxFQUFFQyxhQUFLLENBQUNDLEtBQUssQ0FBQzZKLFlBQVk7SUFBRTNKLEtBQUssRUFBRTtFQUE4QixDQUFDLENBQUM7QUFDcEYifQ==