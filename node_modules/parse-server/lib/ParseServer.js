"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _Options = require("./Options");
var _defaults = _interopRequireDefault(require("./defaults"));
var logging = _interopRequireWildcard(require("./logger"));
var _Config = _interopRequireDefault(require("./Config"));
var _PromiseRouter = _interopRequireDefault(require("./PromiseRouter"));
var _requiredParameter = _interopRequireDefault(require("./requiredParameter"));
var _AnalyticsRouter = require("./Routers/AnalyticsRouter");
var _ClassesRouter = require("./Routers/ClassesRouter");
var _FeaturesRouter = require("./Routers/FeaturesRouter");
var _FilesRouter = require("./Routers/FilesRouter");
var _FunctionsRouter = require("./Routers/FunctionsRouter");
var _GlobalConfigRouter = require("./Routers/GlobalConfigRouter");
var _GraphQLRouter = require("./Routers/GraphQLRouter");
var _HooksRouter = require("./Routers/HooksRouter");
var _IAPValidationRouter = require("./Routers/IAPValidationRouter");
var _InstallationsRouter = require("./Routers/InstallationsRouter");
var _LogsRouter = require("./Routers/LogsRouter");
var _ParseLiveQueryServer = require("./LiveQuery/ParseLiveQueryServer");
var _PagesRouter = require("./Routers/PagesRouter");
var _PublicAPIRouter = require("./Routers/PublicAPIRouter");
var _PushRouter = require("./Routers/PushRouter");
var _CloudCodeRouter = require("./Routers/CloudCodeRouter");
var _RolesRouter = require("./Routers/RolesRouter");
var _SchemasRouter = require("./Routers/SchemasRouter");
var _SessionsRouter = require("./Routers/SessionsRouter");
var _UsersRouter = require("./Routers/UsersRouter");
var _PurgeRouter = require("./Routers/PurgeRouter");
var _AudiencesRouter = require("./Routers/AudiencesRouter");
var _AggregateRouter = require("./Routers/AggregateRouter");
var _ParseServerRESTController = require("./ParseServerRESTController");
var controllers = _interopRequireWildcard(require("./Controllers"));
var _ParseGraphQLServer = require("./GraphQL/ParseGraphQLServer");
var _SecurityRouter = require("./Routers/SecurityRouter");
var _CheckRunner = _interopRequireDefault(require("./Security/CheckRunner"));
var _Deprecator = _interopRequireDefault(require("./Deprecator/Deprecator"));
var _DefinedSchemas = require("./SchemaMigrations/DefinedSchemas");
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && Object.prototype.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
// ParseServer - open-source compatible API Server for Parse apps

var batch = require('./batch'),
  bodyParser = require('body-parser'),
  express = require('express'),
  middlewares = require('./middlewares'),
  Parse = require('parse/node').Parse,
  {
    parse
  } = require('graphql'),
  path = require('path'),
  fs = require('fs');
// Mutate the Parse object to add the Cloud Code handlers
addParseCloud();

// ParseServer works like a constructor of an express app.
// https://parseplatform.org/parse-server/api/master/ParseServerOptions.html
class ParseServer {
  /**
   * @constructor
   * @param {ParseServerOptions} options the parse server initialization options
   */
  constructor(options) {
    // Scan for deprecated Parse Server options
    _Deprecator.default.scanParseServerOptions(options);
    // Set option defaults
    injectDefaults(options);
    const {
      appId = (0, _requiredParameter.default)('You must provide an appId!'),
      masterKey = (0, _requiredParameter.default)('You must provide a masterKey!'),
      javascriptKey,
      serverURL = (0, _requiredParameter.default)('You must provide a serverURL!')
    } = options;
    // Initialize the node client SDK automatically
    Parse.initialize(appId, javascriptKey || 'unused', masterKey);
    Parse.serverURL = serverURL;
    _Config.default.validateOptions(options);
    const allControllers = controllers.getControllers(options);
    options.state = 'initialized';
    this.config = _Config.default.put(Object.assign({}, options, allControllers));
    this.config.masterKeyIpsStore = new Map();
    this.config.maintenanceKeyIpsStore = new Map();
    logging.setLogger(allControllers.loggerController);
  }

  /**
   * Starts Parse Server as an express app; this promise resolves when Parse Server is ready to accept requests.
   */

  async start() {
    try {
      var _cacheController$adap;
      if (this.config.state === 'ok') {
        return this;
      }
      this.config.state = 'starting';
      _Config.default.put(this.config);
      const {
        databaseController,
        hooksController,
        cacheController,
        cloud,
        security,
        schema,
        liveQueryController
      } = this.config;
      try {
        await databaseController.performInitialization();
      } catch (e) {
        if (e.code !== Parse.Error.DUPLICATE_VALUE) {
          throw e;
        }
      }
      await hooksController.load();
      const startupPromises = [];
      if (schema) {
        startupPromises.push(new _DefinedSchemas.DefinedSchemas(schema, this.config).execute());
      }
      if ((_cacheController$adap = cacheController.adapter) !== null && _cacheController$adap !== void 0 && _cacheController$adap.connect && typeof cacheController.adapter.connect === 'function') {
        startupPromises.push(cacheController.adapter.connect());
      }
      startupPromises.push(liveQueryController.connect());
      await Promise.all(startupPromises);
      if (cloud) {
        addParseCloud();
        if (typeof cloud === 'function') {
          await Promise.resolve(cloud(Parse));
        } else if (typeof cloud === 'string') {
          var _json;
          let json;
          if (process.env.npm_package_json) {
            json = require(process.env.npm_package_json);
          }
          if (process.env.npm_package_type === 'module' || ((_json = json) === null || _json === void 0 ? void 0 : _json.type) === 'module') {
            await import(path.resolve(process.cwd(), cloud));
          } else {
            require(path.resolve(process.cwd(), cloud));
          }
        } else {
          throw "argument 'cloud' must either be a string or a function";
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      if (security && security.enableCheck && security.enableCheckLog) {
        new _CheckRunner.default(security).run();
      }
      this.config.state = 'ok';
      _Config.default.put(this.config);
      return this;
    } catch (error) {
      console.error(error);
      this.config.state = 'error';
      throw error;
    }
  }
  get app() {
    if (!this._app) {
      this._app = ParseServer.app(this.config);
    }
    return this._app;
  }
  handleShutdown() {
    var _this$liveQueryServer;
    const promises = [];
    const {
      adapter: databaseAdapter
    } = this.config.databaseController;
    if (databaseAdapter && typeof databaseAdapter.handleShutdown === 'function') {
      promises.push(databaseAdapter.handleShutdown());
    }
    const {
      adapter: fileAdapter
    } = this.config.filesController;
    if (fileAdapter && typeof fileAdapter.handleShutdown === 'function') {
      promises.push(fileAdapter.handleShutdown());
    }
    const {
      adapter: cacheAdapter
    } = this.config.cacheController;
    if (cacheAdapter && typeof cacheAdapter.handleShutdown === 'function') {
      promises.push(cacheAdapter.handleShutdown());
    }
    if ((_this$liveQueryServer = this.liveQueryServer) !== null && _this$liveQueryServer !== void 0 && (_this$liveQueryServer = _this$liveQueryServer.server) !== null && _this$liveQueryServer !== void 0 && _this$liveQueryServer.close) {
      promises.push(new Promise(resolve => this.liveQueryServer.server.close(resolve)));
    }
    if (this.liveQueryServer) {
      promises.push(this.liveQueryServer.shutdown());
    }
    return (promises.length > 0 ? Promise.all(promises) : Promise.resolve()).then(() => {
      if (this.config.serverCloseComplete) {
        this.config.serverCloseComplete();
      }
    });
  }

  /**
   * @static
   * Create an express app for the parse server
   * @param {Object} options let you specify the maxUploadSize when creating the express app  */
  static app(options) {
    const {
      maxUploadSize = '20mb',
      appId,
      directAccess,
      pages,
      rateLimit = []
    } = options;
    // This app serves the Parse API directly.
    // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.
    var api = express();
    //api.use("/apps", express.static(__dirname + "/public"));
    api.use(middlewares.allowCrossDomain(appId));
    // File handling needs to be before default middlewares are applied
    api.use('/', new _FilesRouter.FilesRouter().expressRouter({
      maxUploadSize: maxUploadSize
    }));
    api.use('/health', function (req, res) {
      res.status(options.state === 'ok' ? 200 : 503);
      if (options.state === 'starting') {
        res.set('Retry-After', 1);
      }
      res.json({
        status: options.state
      });
    });
    api.use('/', bodyParser.urlencoded({
      extended: false
    }), pages.enableRouter ? new _PagesRouter.PagesRouter(pages).expressRouter() : new _PublicAPIRouter.PublicAPIRouter().expressRouter());
    api.use(bodyParser.json({
      type: '*/*',
      limit: maxUploadSize
    }));
    api.use(middlewares.allowMethodOverride);
    api.use(middlewares.handleParseHeaders);
    const routes = Array.isArray(rateLimit) ? rateLimit : [rateLimit];
    for (const route of routes) {
      middlewares.addRateLimit(route, options);
    }
    api.use(middlewares.handleParseSession);
    const appRouter = ParseServer.promiseRouter({
      appId
    });
    api.use(appRouter.expressRouter());
    api.use(middlewares.handleParseErrors);

    // run the following when not testing
    if (!process.env.TESTING) {
      //This causes tests to spew some useless warnings, so disable in test
      /* istanbul ignore next */
      process.on('uncaughtException', err => {
        if (err.code === 'EADDRINUSE') {
          // user-friendly message for this common error
          process.stderr.write(`Unable to listen on port ${err.port}. The port is already in use.`);
          process.exit(0);
        } else {
          if (err.message) {
            process.stderr.write('An uncaught exception occurred: ' + err.message);
          }
          if (err.stack) {
            process.stderr.write('Stack Trace:\n' + err.stack);
          } else {
            process.stderr.write(err);
          }
          process.exit(1);
        }
      });
      // verify the server url after a 'mount' event is received
      /* istanbul ignore next */
      api.on('mount', async function () {
        await new Promise(resolve => setTimeout(resolve, 1000));
        ParseServer.verifyServerUrl();
      });
    }
    if (process.env.PARSE_SERVER_ENABLE_EXPERIMENTAL_DIRECT_ACCESS === '1' || directAccess) {
      Parse.CoreManager.setRESTController((0, _ParseServerRESTController.ParseServerRESTController)(appId, appRouter));
    }
    return api;
  }
  static promiseRouter({
    appId
  }) {
    const routers = [new _ClassesRouter.ClassesRouter(), new _UsersRouter.UsersRouter(), new _SessionsRouter.SessionsRouter(), new _RolesRouter.RolesRouter(), new _AnalyticsRouter.AnalyticsRouter(), new _InstallationsRouter.InstallationsRouter(), new _FunctionsRouter.FunctionsRouter(), new _SchemasRouter.SchemasRouter(), new _PushRouter.PushRouter(), new _LogsRouter.LogsRouter(), new _IAPValidationRouter.IAPValidationRouter(), new _FeaturesRouter.FeaturesRouter(), new _GlobalConfigRouter.GlobalConfigRouter(), new _GraphQLRouter.GraphQLRouter(), new _PurgeRouter.PurgeRouter(), new _HooksRouter.HooksRouter(), new _CloudCodeRouter.CloudCodeRouter(), new _AudiencesRouter.AudiencesRouter(), new _AggregateRouter.AggregateRouter(), new _SecurityRouter.SecurityRouter()];
    const routes = routers.reduce((memo, router) => {
      return memo.concat(router.routes);
    }, []);
    const appRouter = new _PromiseRouter.default(routes, appId);
    batch.mountOnto(appRouter);
    return appRouter;
  }

  /**
   * starts the parse server's express app
   * @param {ParseServerOptions} options to use to start the server
   * @returns {ParseServer} the parse server instance
   */

  async startApp(options) {
    try {
      await this.start();
    } catch (e) {
      console.error('Error on ParseServer.startApp: ', e);
      throw e;
    }
    const app = express();
    if (options.middleware) {
      let middleware;
      if (typeof options.middleware == 'string') {
        middleware = require(path.resolve(process.cwd(), options.middleware));
      } else {
        middleware = options.middleware; // use as-is let express fail
      }
      app.use(middleware);
    }
    app.use(options.mountPath, this.app);
    if (options.mountGraphQL === true || options.mountPlayground === true) {
      let graphQLCustomTypeDefs = undefined;
      if (typeof options.graphQLSchema === 'string') {
        graphQLCustomTypeDefs = parse(fs.readFileSync(options.graphQLSchema, 'utf8'));
      } else if (typeof options.graphQLSchema === 'object' || typeof options.graphQLSchema === 'function') {
        graphQLCustomTypeDefs = options.graphQLSchema;
      }
      const parseGraphQLServer = new _ParseGraphQLServer.ParseGraphQLServer(this, {
        graphQLPath: options.graphQLPath,
        playgroundPath: options.playgroundPath,
        graphQLCustomTypeDefs
      });
      if (options.mountGraphQL) {
        parseGraphQLServer.applyGraphQL(app);
      }
      if (options.mountPlayground) {
        parseGraphQLServer.applyPlayground(app);
      }
    }
    const server = await new Promise(resolve => {
      app.listen(options.port, options.host, function () {
        resolve(this);
      });
    });
    this.server = server;
    if (options.startLiveQueryServer || options.liveQueryServerOptions) {
      this.liveQueryServer = await ParseServer.createLiveQueryServer(server, options.liveQueryServerOptions, options);
    }
    if (options.trustProxy) {
      app.set('trust proxy', options.trustProxy);
    }
    /* istanbul ignore next */
    if (!process.env.TESTING) {
      configureListeners(this);
    }
    this.expressApp = app;
    return this;
  }

  /**
   * Creates a new ParseServer and starts it.
   * @param {ParseServerOptions} options used to start the server
   * @returns {ParseServer} the parse server instance
   */
  static async startApp(options) {
    const parseServer = new ParseServer(options);
    return parseServer.startApp(options);
  }

  /**
   * Helper method to create a liveQuery server
   * @static
   * @param {Server} httpServer an optional http server to pass
   * @param {LiveQueryServerOptions} config options for the liveQueryServer
   * @param {ParseServerOptions} options options for the ParseServer
   * @returns {Promise<ParseLiveQueryServer>} the live query server instance
   */
  static async createLiveQueryServer(httpServer, config, options) {
    if (!httpServer || config && config.port) {
      var app = express();
      httpServer = require('http').createServer(app);
      httpServer.listen(config.port);
    }
    const server = new _ParseLiveQueryServer.ParseLiveQueryServer(httpServer, config, options);
    await server.connect();
    return server;
  }
  static async verifyServerUrl() {
    // perform a health check on the serverURL value
    if (Parse.serverURL) {
      var _response$headers;
      const isValidHttpUrl = string => {
        let url;
        try {
          url = new URL(string);
        } catch (_) {
          return false;
        }
        return url.protocol === 'http:' || url.protocol === 'https:';
      };
      const url = `${Parse.serverURL.replace(/\/$/, '')}/health`;
      if (!isValidHttpUrl(url)) {
        console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}' as the URL is invalid.` + ` Cloud code and push notifications may be unavailable!\n`);
        return;
      }
      const request = require('./request');
      const response = await request({
        url
      }).catch(response => response);
      const json = response.data || null;
      const retry = (_response$headers = response.headers) === null || _response$headers === void 0 ? void 0 : _response$headers['retry-after'];
      if (retry) {
        await new Promise(resolve => setTimeout(resolve, retry * 1000));
        return this.verifyServerUrl();
      }
      if (response.status !== 200 || (json === null || json === void 0 ? void 0 : json.status) !== 'ok') {
        /* eslint-disable no-console */
        console.warn(`\nWARNING, Unable to connect to '${Parse.serverURL}'.` + ` Cloud code and push notifications may be unavailable!\n`);
        /* eslint-enable no-console */
        return;
      }
      return true;
    }
  }
}
function addParseCloud() {
  const ParseCloud = require('./cloud-code/Parse.Cloud');
  const ParseServer = require('./cloud-code/Parse.Server');
  Object.defineProperty(Parse, 'Server', {
    get() {
      const conf = _Config.default.get(Parse.applicationId);
      return _objectSpread(_objectSpread({}, conf), ParseServer);
    },
    set(newVal) {
      newVal.appId = Parse.applicationId;
      _Config.default.put(newVal);
    },
    configurable: true
  });
  Object.assign(Parse.Cloud, ParseCloud);
  global.Parse = Parse;
}
function injectDefaults(options) {
  Object.keys(_defaults.default).forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(options, key)) {
      options[key] = _defaults.default[key];
    }
  });
  if (!Object.prototype.hasOwnProperty.call(options, 'serverURL')) {
    options.serverURL = `http://localhost:${options.port}${options.mountPath}`;
  }

  // Reserved Characters
  if (options.appId) {
    const regex = /[!#$%'()*+&/:;=?@[\]{}^,|<>]/g;
    if (options.appId.match(regex)) {
      console.warn(`\nWARNING, appId that contains special characters can cause issues while using with urls.\n`);
    }
  }

  // Backwards compatibility
  if (options.userSensitiveFields) {
    /* eslint-disable no-console */
    !process.env.TESTING && console.warn(`\nDEPRECATED: userSensitiveFields has been replaced by protectedFields allowing the ability to protect fields in all classes with CLP. \n`);
    /* eslint-enable no-console */

    const userSensitiveFields = Array.from(new Set([...(_defaults.default.userSensitiveFields || []), ...(options.userSensitiveFields || [])]));

    // If the options.protectedFields is unset,
    // it'll be assigned the default above.
    // Here, protect against the case where protectedFields
    // is set, but doesn't have _User.
    if (!('_User' in options.protectedFields)) {
      options.protectedFields = Object.assign({
        _User: []
      }, options.protectedFields);
    }
    options.protectedFields['_User']['*'] = Array.from(new Set([...(options.protectedFields['_User']['*'] || []), ...userSensitiveFields]));
  }

  // Merge protectedFields options with defaults.
  Object.keys(_defaults.default.protectedFields).forEach(c => {
    const cur = options.protectedFields[c];
    if (!cur) {
      options.protectedFields[c] = _defaults.default.protectedFields[c];
    } else {
      Object.keys(_defaults.default.protectedFields[c]).forEach(r => {
        const unq = new Set([...(options.protectedFields[c][r] || []), ..._defaults.default.protectedFields[c][r]]);
        options.protectedFields[c][r] = Array.from(unq);
      });
    }
  });
}

// Those can't be tested as it requires a subprocess
/* istanbul ignore next */
function configureListeners(parseServer) {
  const server = parseServer.server;
  const sockets = {};
  /* Currently, express doesn't shut down immediately after receiving SIGINT/SIGTERM if it has client connections that haven't timed out. (This is a known issue with node - https://github.com/nodejs/node/issues/2642)
    This function, along with `destroyAliveConnections()`, intend to fix this behavior such that parse server will close all open connections and initiate the shutdown process as soon as it receives a SIGINT/SIGTERM signal. */
  server.on('connection', socket => {
    const socketId = socket.remoteAddress + ':' + socket.remotePort;
    sockets[socketId] = socket;
    socket.on('close', () => {
      delete sockets[socketId];
    });
  });
  const destroyAliveConnections = function () {
    for (const socketId in sockets) {
      try {
        sockets[socketId].destroy();
      } catch (e) {
        /* */
      }
    }
  };
  const handleShutdown = function () {
    process.stdout.write('Termination signal received. Shutting down.');
    destroyAliveConnections();
    server.close();
    parseServer.handleShutdown();
  };
  process.on('SIGTERM', handleShutdown);
  process.on('SIGINT', handleShutdown);
}
var _default = exports.default = ParseServer;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfT3B0aW9ucyIsInJlcXVpcmUiLCJfZGVmYXVsdHMiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwibG9nZ2luZyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX0NvbmZpZyIsIl9Qcm9taXNlUm91dGVyIiwiX3JlcXVpcmVkUGFyYW1ldGVyIiwiX0FuYWx5dGljc1JvdXRlciIsIl9DbGFzc2VzUm91dGVyIiwiX0ZlYXR1cmVzUm91dGVyIiwiX0ZpbGVzUm91dGVyIiwiX0Z1bmN0aW9uc1JvdXRlciIsIl9HbG9iYWxDb25maWdSb3V0ZXIiLCJfR3JhcGhRTFJvdXRlciIsIl9Ib29rc1JvdXRlciIsIl9JQVBWYWxpZGF0aW9uUm91dGVyIiwiX0luc3RhbGxhdGlvbnNSb3V0ZXIiLCJfTG9nc1JvdXRlciIsIl9QYXJzZUxpdmVRdWVyeVNlcnZlciIsIl9QYWdlc1JvdXRlciIsIl9QdWJsaWNBUElSb3V0ZXIiLCJfUHVzaFJvdXRlciIsIl9DbG91ZENvZGVSb3V0ZXIiLCJfUm9sZXNSb3V0ZXIiLCJfU2NoZW1hc1JvdXRlciIsIl9TZXNzaW9uc1JvdXRlciIsIl9Vc2Vyc1JvdXRlciIsIl9QdXJnZVJvdXRlciIsIl9BdWRpZW5jZXNSb3V0ZXIiLCJfQWdncmVnYXRlUm91dGVyIiwiX1BhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIiLCJjb250cm9sbGVycyIsIl9QYXJzZUdyYXBoUUxTZXJ2ZXIiLCJfU2VjdXJpdHlSb3V0ZXIiLCJfQ2hlY2tSdW5uZXIiLCJfRGVwcmVjYXRvciIsIl9EZWZpbmVkU2NoZW1hcyIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsImUiLCJXZWFrTWFwIiwiciIsInQiLCJfX2VzTW9kdWxlIiwiZGVmYXVsdCIsImhhcyIsImdldCIsIm4iLCJfX3Byb3RvX18iLCJhIiwiT2JqZWN0IiwiZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJ1IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiaSIsInNldCIsIm9iaiIsIm93bktleXMiLCJrZXlzIiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwibyIsImZpbHRlciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwiZm9yRWFjaCIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwia2V5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiU3ltYm9sIiwidG9QcmltaXRpdmUiLCJUeXBlRXJyb3IiLCJOdW1iZXIiLCJiYXRjaCIsImJvZHlQYXJzZXIiLCJleHByZXNzIiwibWlkZGxld2FyZXMiLCJQYXJzZSIsInBhcnNlIiwicGF0aCIsImZzIiwiYWRkUGFyc2VDbG91ZCIsIlBhcnNlU2VydmVyIiwiY29uc3RydWN0b3IiLCJvcHRpb25zIiwiRGVwcmVjYXRvciIsInNjYW5QYXJzZVNlcnZlck9wdGlvbnMiLCJpbmplY3REZWZhdWx0cyIsImFwcElkIiwicmVxdWlyZWRQYXJhbWV0ZXIiLCJtYXN0ZXJLZXkiLCJqYXZhc2NyaXB0S2V5Iiwic2VydmVyVVJMIiwiaW5pdGlhbGl6ZSIsIkNvbmZpZyIsInZhbGlkYXRlT3B0aW9ucyIsImFsbENvbnRyb2xsZXJzIiwiZ2V0Q29udHJvbGxlcnMiLCJzdGF0ZSIsImNvbmZpZyIsInB1dCIsImFzc2lnbiIsIm1hc3RlcktleUlwc1N0b3JlIiwiTWFwIiwibWFpbnRlbmFuY2VLZXlJcHNTdG9yZSIsInNldExvZ2dlciIsImxvZ2dlckNvbnRyb2xsZXIiLCJzdGFydCIsIl9jYWNoZUNvbnRyb2xsZXIkYWRhcCIsImRhdGFiYXNlQ29udHJvbGxlciIsImhvb2tzQ29udHJvbGxlciIsImNhY2hlQ29udHJvbGxlciIsImNsb3VkIiwic2VjdXJpdHkiLCJzY2hlbWEiLCJsaXZlUXVlcnlDb250cm9sbGVyIiwicGVyZm9ybUluaXRpYWxpemF0aW9uIiwiY29kZSIsIkVycm9yIiwiRFVQTElDQVRFX1ZBTFVFIiwibG9hZCIsInN0YXJ0dXBQcm9taXNlcyIsIkRlZmluZWRTY2hlbWFzIiwiZXhlY3V0ZSIsImFkYXB0ZXIiLCJjb25uZWN0IiwiUHJvbWlzZSIsImFsbCIsInJlc29sdmUiLCJfanNvbiIsImpzb24iLCJwcm9jZXNzIiwiZW52IiwibnBtX3BhY2thZ2VfanNvbiIsIm5wbV9wYWNrYWdlX3R5cGUiLCJ0eXBlIiwiY3dkIiwic2V0VGltZW91dCIsImVuYWJsZUNoZWNrIiwiZW5hYmxlQ2hlY2tMb2ciLCJDaGVja1J1bm5lciIsInJ1biIsImVycm9yIiwiY29uc29sZSIsImFwcCIsIl9hcHAiLCJoYW5kbGVTaHV0ZG93biIsIl90aGlzJGxpdmVRdWVyeVNlcnZlciIsInByb21pc2VzIiwiZGF0YWJhc2VBZGFwdGVyIiwiZmlsZUFkYXB0ZXIiLCJmaWxlc0NvbnRyb2xsZXIiLCJjYWNoZUFkYXB0ZXIiLCJsaXZlUXVlcnlTZXJ2ZXIiLCJzZXJ2ZXIiLCJjbG9zZSIsInNodXRkb3duIiwidGhlbiIsInNlcnZlckNsb3NlQ29tcGxldGUiLCJtYXhVcGxvYWRTaXplIiwiZGlyZWN0QWNjZXNzIiwicGFnZXMiLCJyYXRlTGltaXQiLCJhcGkiLCJ1c2UiLCJhbGxvd0Nyb3NzRG9tYWluIiwiRmlsZXNSb3V0ZXIiLCJleHByZXNzUm91dGVyIiwicmVxIiwicmVzIiwic3RhdHVzIiwidXJsZW5jb2RlZCIsImV4dGVuZGVkIiwiZW5hYmxlUm91dGVyIiwiUGFnZXNSb3V0ZXIiLCJQdWJsaWNBUElSb3V0ZXIiLCJsaW1pdCIsImFsbG93TWV0aG9kT3ZlcnJpZGUiLCJoYW5kbGVQYXJzZUhlYWRlcnMiLCJyb3V0ZXMiLCJBcnJheSIsImlzQXJyYXkiLCJyb3V0ZSIsImFkZFJhdGVMaW1pdCIsImhhbmRsZVBhcnNlU2Vzc2lvbiIsImFwcFJvdXRlciIsInByb21pc2VSb3V0ZXIiLCJoYW5kbGVQYXJzZUVycm9ycyIsIlRFU1RJTkciLCJvbiIsImVyciIsInN0ZGVyciIsIndyaXRlIiwicG9ydCIsImV4aXQiLCJtZXNzYWdlIiwic3RhY2siLCJ2ZXJpZnlTZXJ2ZXJVcmwiLCJQQVJTRV9TRVJWRVJfRU5BQkxFX0VYUEVSSU1FTlRBTF9ESVJFQ1RfQUNDRVNTIiwiQ29yZU1hbmFnZXIiLCJzZXRSRVNUQ29udHJvbGxlciIsIlBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIiLCJyb3V0ZXJzIiwiQ2xhc3Nlc1JvdXRlciIsIlVzZXJzUm91dGVyIiwiU2Vzc2lvbnNSb3V0ZXIiLCJSb2xlc1JvdXRlciIsIkFuYWx5dGljc1JvdXRlciIsIkluc3RhbGxhdGlvbnNSb3V0ZXIiLCJGdW5jdGlvbnNSb3V0ZXIiLCJTY2hlbWFzUm91dGVyIiwiUHVzaFJvdXRlciIsIkxvZ3NSb3V0ZXIiLCJJQVBWYWxpZGF0aW9uUm91dGVyIiwiRmVhdHVyZXNSb3V0ZXIiLCJHbG9iYWxDb25maWdSb3V0ZXIiLCJHcmFwaFFMUm91dGVyIiwiUHVyZ2VSb3V0ZXIiLCJIb29rc1JvdXRlciIsIkNsb3VkQ29kZVJvdXRlciIsIkF1ZGllbmNlc1JvdXRlciIsIkFnZ3JlZ2F0ZVJvdXRlciIsIlNlY3VyaXR5Um91dGVyIiwicmVkdWNlIiwibWVtbyIsInJvdXRlciIsImNvbmNhdCIsIlByb21pc2VSb3V0ZXIiLCJtb3VudE9udG8iLCJzdGFydEFwcCIsIm1pZGRsZXdhcmUiLCJtb3VudFBhdGgiLCJtb3VudEdyYXBoUUwiLCJtb3VudFBsYXlncm91bmQiLCJncmFwaFFMQ3VzdG9tVHlwZURlZnMiLCJ1bmRlZmluZWQiLCJncmFwaFFMU2NoZW1hIiwicmVhZEZpbGVTeW5jIiwicGFyc2VHcmFwaFFMU2VydmVyIiwiUGFyc2VHcmFwaFFMU2VydmVyIiwiZ3JhcGhRTFBhdGgiLCJwbGF5Z3JvdW5kUGF0aCIsImFwcGx5R3JhcGhRTCIsImFwcGx5UGxheWdyb3VuZCIsImxpc3RlbiIsImhvc3QiLCJzdGFydExpdmVRdWVyeVNlcnZlciIsImxpdmVRdWVyeVNlcnZlck9wdGlvbnMiLCJjcmVhdGVMaXZlUXVlcnlTZXJ2ZXIiLCJ0cnVzdFByb3h5IiwiY29uZmlndXJlTGlzdGVuZXJzIiwiZXhwcmVzc0FwcCIsInBhcnNlU2VydmVyIiwiaHR0cFNlcnZlciIsImNyZWF0ZVNlcnZlciIsIlBhcnNlTGl2ZVF1ZXJ5U2VydmVyIiwiX3Jlc3BvbnNlJGhlYWRlcnMiLCJpc1ZhbGlkSHR0cFVybCIsInN0cmluZyIsInVybCIsIlVSTCIsIl8iLCJwcm90b2NvbCIsInJlcGxhY2UiLCJ3YXJuIiwicmVxdWVzdCIsInJlc3BvbnNlIiwiY2F0Y2giLCJkYXRhIiwicmV0cnkiLCJoZWFkZXJzIiwiUGFyc2VDbG91ZCIsImNvbmYiLCJhcHBsaWNhdGlvbklkIiwibmV3VmFsIiwiQ2xvdWQiLCJnbG9iYWwiLCJkZWZhdWx0cyIsInJlZ2V4IiwibWF0Y2giLCJ1c2VyU2Vuc2l0aXZlRmllbGRzIiwiZnJvbSIsIlNldCIsInByb3RlY3RlZEZpZWxkcyIsIl9Vc2VyIiwiYyIsImN1ciIsInVucSIsInNvY2tldHMiLCJzb2NrZXQiLCJzb2NrZXRJZCIsInJlbW90ZUFkZHJlc3MiLCJyZW1vdGVQb3J0IiwiZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMiLCJkZXN0cm95Iiwic3Rkb3V0IiwiX2RlZmF1bHQiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vc3JjL1BhcnNlU2VydmVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIFBhcnNlU2VydmVyIC0gb3Blbi1zb3VyY2UgY29tcGF0aWJsZSBBUEkgU2VydmVyIGZvciBQYXJzZSBhcHBzXG5cbnZhciBiYXRjaCA9IHJlcXVpcmUoJy4vYmF0Y2gnKSxcbiAgYm9keVBhcnNlciA9IHJlcXVpcmUoJ2JvZHktcGFyc2VyJyksXG4gIGV4cHJlc3MgPSByZXF1aXJlKCdleHByZXNzJyksXG4gIG1pZGRsZXdhcmVzID0gcmVxdWlyZSgnLi9taWRkbGV3YXJlcycpLFxuICBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZSxcbiAgeyBwYXJzZSB9ID0gcmVxdWlyZSgnZ3JhcGhxbCcpLFxuICBwYXRoID0gcmVxdWlyZSgncGF0aCcpLFxuICBmcyA9IHJlcXVpcmUoJ2ZzJyk7XG5cbmltcG9ydCB7IFBhcnNlU2VydmVyT3B0aW9ucywgTGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyB9IGZyb20gJy4vT3B0aW9ucyc7XG5pbXBvcnQgZGVmYXVsdHMgZnJvbSAnLi9kZWZhdWx0cyc7XG5pbXBvcnQgKiBhcyBsb2dnaW5nIGZyb20gJy4vbG9nZ2VyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi9Db25maWcnO1xuaW1wb3J0IFByb21pc2VSb3V0ZXIgZnJvbSAnLi9Qcm9taXNlUm91dGVyJztcbmltcG9ydCByZXF1aXJlZFBhcmFtZXRlciBmcm9tICcuL3JlcXVpcmVkUGFyYW1ldGVyJztcbmltcG9ydCB7IEFuYWx5dGljc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9BbmFseXRpY3NSb3V0ZXInO1xuaW1wb3J0IHsgQ2xhc3Nlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9DbGFzc2VzUm91dGVyJztcbmltcG9ydCB7IEZlYXR1cmVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0ZlYXR1cmVzUm91dGVyJztcbmltcG9ydCB7IEZpbGVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0ZpbGVzUm91dGVyJztcbmltcG9ydCB7IEZ1bmN0aW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9GdW5jdGlvbnNSb3V0ZXInO1xuaW1wb3J0IHsgR2xvYmFsQ29uZmlnUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0dsb2JhbENvbmZpZ1JvdXRlcic7XG5pbXBvcnQgeyBHcmFwaFFMUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0dyYXBoUUxSb3V0ZXInO1xuaW1wb3J0IHsgSG9va3NSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSG9va3NSb3V0ZXInO1xuaW1wb3J0IHsgSUFQVmFsaWRhdGlvblJvdXRlciB9IGZyb20gJy4vUm91dGVycy9JQVBWYWxpZGF0aW9uUm91dGVyJztcbmltcG9ydCB7IEluc3RhbGxhdGlvbnNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvSW5zdGFsbGF0aW9uc1JvdXRlcic7XG5pbXBvcnQgeyBMb2dzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL0xvZ3NSb3V0ZXInO1xuaW1wb3J0IHsgUGFyc2VMaXZlUXVlcnlTZXJ2ZXIgfSBmcm9tICcuL0xpdmVRdWVyeS9QYXJzZUxpdmVRdWVyeVNlcnZlcic7XG5pbXBvcnQgeyBQYWdlc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9QYWdlc1JvdXRlcic7XG5pbXBvcnQgeyBQdWJsaWNBUElSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVibGljQVBJUm91dGVyJztcbmltcG9ydCB7IFB1c2hSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvUHVzaFJvdXRlcic7XG5pbXBvcnQgeyBDbG91ZENvZGVSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQ2xvdWRDb2RlUm91dGVyJztcbmltcG9ydCB7IFJvbGVzUm91dGVyIH0gZnJvbSAnLi9Sb3V0ZXJzL1JvbGVzUm91dGVyJztcbmltcG9ydCB7IFNjaGVtYXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2NoZW1hc1JvdXRlcic7XG5pbXBvcnQgeyBTZXNzaW9uc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9TZXNzaW9uc1JvdXRlcic7XG5pbXBvcnQgeyBVc2Vyc1JvdXRlciB9IGZyb20gJy4vUm91dGVycy9Vc2Vyc1JvdXRlcic7XG5pbXBvcnQgeyBQdXJnZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9QdXJnZVJvdXRlcic7XG5pbXBvcnQgeyBBdWRpZW5jZXNSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvQXVkaWVuY2VzUm91dGVyJztcbmltcG9ydCB7IEFnZ3JlZ2F0ZVJvdXRlciB9IGZyb20gJy4vUm91dGVycy9BZ2dyZWdhdGVSb3V0ZXInO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlciB9IGZyb20gJy4vUGFyc2VTZXJ2ZXJSRVNUQ29udHJvbGxlcic7XG5pbXBvcnQgKiBhcyBjb250cm9sbGVycyBmcm9tICcuL0NvbnRyb2xsZXJzJztcbmltcG9ydCB7IFBhcnNlR3JhcGhRTFNlcnZlciB9IGZyb20gJy4vR3JhcGhRTC9QYXJzZUdyYXBoUUxTZXJ2ZXInO1xuaW1wb3J0IHsgU2VjdXJpdHlSb3V0ZXIgfSBmcm9tICcuL1JvdXRlcnMvU2VjdXJpdHlSb3V0ZXInO1xuaW1wb3J0IENoZWNrUnVubmVyIGZyb20gJy4vU2VjdXJpdHkvQ2hlY2tSdW5uZXInO1xuaW1wb3J0IERlcHJlY2F0b3IgZnJvbSAnLi9EZXByZWNhdG9yL0RlcHJlY2F0b3InO1xuaW1wb3J0IHsgRGVmaW5lZFNjaGVtYXMgfSBmcm9tICcuL1NjaGVtYU1pZ3JhdGlvbnMvRGVmaW5lZFNjaGVtYXMnO1xuXG4vLyBNdXRhdGUgdGhlIFBhcnNlIG9iamVjdCB0byBhZGQgdGhlIENsb3VkIENvZGUgaGFuZGxlcnNcbmFkZFBhcnNlQ2xvdWQoKTtcblxuLy8gUGFyc2VTZXJ2ZXIgd29ya3MgbGlrZSBhIGNvbnN0cnVjdG9yIG9mIGFuIGV4cHJlc3MgYXBwLlxuLy8gaHR0cHM6Ly9wYXJzZXBsYXRmb3JtLm9yZy9wYXJzZS1zZXJ2ZXIvYXBpL21hc3Rlci9QYXJzZVNlcnZlck9wdGlvbnMuaHRtbFxuY2xhc3MgUGFyc2VTZXJ2ZXIge1xuICAvKipcbiAgICogQGNvbnN0cnVjdG9yXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHRoZSBwYXJzZSBzZXJ2ZXIgaW5pdGlhbGl6YXRpb24gb3B0aW9uc1xuICAgKi9cbiAgY29uc3RydWN0b3Iob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gICAgLy8gU2NhbiBmb3IgZGVwcmVjYXRlZCBQYXJzZSBTZXJ2ZXIgb3B0aW9uc1xuICAgIERlcHJlY2F0b3Iuc2NhblBhcnNlU2VydmVyT3B0aW9ucyhvcHRpb25zKTtcbiAgICAvLyBTZXQgb3B0aW9uIGRlZmF1bHRzXG4gICAgaW5qZWN0RGVmYXVsdHMob3B0aW9ucyk7XG4gICAgY29uc3Qge1xuICAgICAgYXBwSWQgPSByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhbiBhcHBJZCEnKSxcbiAgICAgIG1hc3RlcktleSA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgbWFzdGVyS2V5IScpLFxuICAgICAgamF2YXNjcmlwdEtleSxcbiAgICAgIHNlcnZlclVSTCA9IHJlcXVpcmVkUGFyYW1ldGVyKCdZb3UgbXVzdCBwcm92aWRlIGEgc2VydmVyVVJMIScpLFxuICAgIH0gPSBvcHRpb25zO1xuICAgIC8vIEluaXRpYWxpemUgdGhlIG5vZGUgY2xpZW50IFNESyBhdXRvbWF0aWNhbGx5XG4gICAgUGFyc2UuaW5pdGlhbGl6ZShhcHBJZCwgamF2YXNjcmlwdEtleSB8fCAndW51c2VkJywgbWFzdGVyS2V5KTtcbiAgICBQYXJzZS5zZXJ2ZXJVUkwgPSBzZXJ2ZXJVUkw7XG5cbiAgICBDb25maWcudmFsaWRhdGVPcHRpb25zKG9wdGlvbnMpO1xuICAgIGNvbnN0IGFsbENvbnRyb2xsZXJzID0gY29udHJvbGxlcnMuZ2V0Q29udHJvbGxlcnMob3B0aW9ucyk7XG4gICAgb3B0aW9ucy5zdGF0ZSA9ICdpbml0aWFsaXplZCc7XG4gICAgdGhpcy5jb25maWcgPSBDb25maWcucHV0KE9iamVjdC5hc3NpZ24oe30sIG9wdGlvbnMsIGFsbENvbnRyb2xsZXJzKSk7XG4gICAgdGhpcy5jb25maWcubWFzdGVyS2V5SXBzU3RvcmUgPSBuZXcgTWFwKCk7XG4gICAgdGhpcy5jb25maWcubWFpbnRlbmFuY2VLZXlJcHNTdG9yZSA9IG5ldyBNYXAoKTtcbiAgICBsb2dnaW5nLnNldExvZ2dlcihhbGxDb250cm9sbGVycy5sb2dnZXJDb250cm9sbGVyKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBTdGFydHMgUGFyc2UgU2VydmVyIGFzIGFuIGV4cHJlc3MgYXBwOyB0aGlzIHByb21pc2UgcmVzb2x2ZXMgd2hlbiBQYXJzZSBTZXJ2ZXIgaXMgcmVhZHkgdG8gYWNjZXB0IHJlcXVlc3RzLlxuICAgKi9cblxuICBhc3luYyBzdGFydCgpIHtcbiAgICB0cnkge1xuICAgICAgaWYgKHRoaXMuY29uZmlnLnN0YXRlID09PSAnb2snKSB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfVxuICAgICAgdGhpcy5jb25maWcuc3RhdGUgPSAnc3RhcnRpbmcnO1xuICAgICAgQ29uZmlnLnB1dCh0aGlzLmNvbmZpZyk7XG4gICAgICBjb25zdCB7XG4gICAgICAgIGRhdGFiYXNlQ29udHJvbGxlcixcbiAgICAgICAgaG9va3NDb250cm9sbGVyLFxuICAgICAgICBjYWNoZUNvbnRyb2xsZXIsXG4gICAgICAgIGNsb3VkLFxuICAgICAgICBzZWN1cml0eSxcbiAgICAgICAgc2NoZW1hLFxuICAgICAgICBsaXZlUXVlcnlDb250cm9sbGVyLFxuICAgICAgfSA9IHRoaXMuY29uZmlnO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgZGF0YWJhc2VDb250cm9sbGVyLnBlcmZvcm1Jbml0aWFsaXphdGlvbigpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBpZiAoZS5jb2RlICE9PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBhd2FpdCBob29rc0NvbnRyb2xsZXIubG9hZCgpO1xuICAgICAgY29uc3Qgc3RhcnR1cFByb21pc2VzID0gW107XG4gICAgICBpZiAoc2NoZW1hKSB7XG4gICAgICAgIHN0YXJ0dXBQcm9taXNlcy5wdXNoKG5ldyBEZWZpbmVkU2NoZW1hcyhzY2hlbWEsIHRoaXMuY29uZmlnKS5leGVjdXRlKCkpO1xuICAgICAgfVxuICAgICAgaWYgKFxuICAgICAgICBjYWNoZUNvbnRyb2xsZXIuYWRhcHRlcj8uY29ubmVjdCAmJlxuICAgICAgICB0eXBlb2YgY2FjaGVDb250cm9sbGVyLmFkYXB0ZXIuY29ubmVjdCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICAgKSB7XG4gICAgICAgIHN0YXJ0dXBQcm9taXNlcy5wdXNoKGNhY2hlQ29udHJvbGxlci5hZGFwdGVyLmNvbm5lY3QoKSk7XG4gICAgICB9XG4gICAgICBzdGFydHVwUHJvbWlzZXMucHVzaChsaXZlUXVlcnlDb250cm9sbGVyLmNvbm5lY3QoKSk7XG4gICAgICBhd2FpdCBQcm9taXNlLmFsbChzdGFydHVwUHJvbWlzZXMpO1xuICAgICAgaWYgKGNsb3VkKSB7XG4gICAgICAgIGFkZFBhcnNlQ2xvdWQoKTtcbiAgICAgICAgaWYgKHR5cGVvZiBjbG91ZCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgIGF3YWl0IFByb21pc2UucmVzb2x2ZShjbG91ZChQYXJzZSkpO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjbG91ZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICBsZXQganNvbjtcbiAgICAgICAgICBpZiAocHJvY2Vzcy5lbnYubnBtX3BhY2thZ2VfanNvbikge1xuICAgICAgICAgICAganNvbiA9IHJlcXVpcmUocHJvY2Vzcy5lbnYubnBtX3BhY2thZ2VfanNvbik7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChwcm9jZXNzLmVudi5ucG1fcGFja2FnZV90eXBlID09PSAnbW9kdWxlJyB8fCBqc29uPy50eXBlID09PSAnbW9kdWxlJykge1xuICAgICAgICAgICAgYXdhaXQgaW1wb3J0KHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBjbG91ZCkpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXF1aXJlKHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBjbG91ZCkpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBcImFyZ3VtZW50ICdjbG91ZCcgbXVzdCBlaXRoZXIgYmUgYSBzdHJpbmcgb3IgYSBmdW5jdGlvblwiO1xuICAgICAgICB9XG4gICAgICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMCkpO1xuICAgICAgfVxuICAgICAgaWYgKHNlY3VyaXR5ICYmIHNlY3VyaXR5LmVuYWJsZUNoZWNrICYmIHNlY3VyaXR5LmVuYWJsZUNoZWNrTG9nKSB7XG4gICAgICAgIG5ldyBDaGVja1J1bm5lcihzZWN1cml0eSkucnVuKCk7XG4gICAgICB9XG4gICAgICB0aGlzLmNvbmZpZy5zdGF0ZSA9ICdvayc7XG4gICAgICBDb25maWcucHV0KHRoaXMuY29uZmlnKTtcbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBjb25zb2xlLmVycm9yKGVycm9yKTtcbiAgICAgIHRoaXMuY29uZmlnLnN0YXRlID0gJ2Vycm9yJztcbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfVxuXG4gIGdldCBhcHAoKSB7XG4gICAgaWYgKCF0aGlzLl9hcHApIHtcbiAgICAgIHRoaXMuX2FwcCA9IFBhcnNlU2VydmVyLmFwcCh0aGlzLmNvbmZpZyk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLl9hcHA7XG4gIH1cblxuICBoYW5kbGVTaHV0ZG93bigpIHtcbiAgICBjb25zdCBwcm9taXNlcyA9IFtdO1xuICAgIGNvbnN0IHsgYWRhcHRlcjogZGF0YWJhc2VBZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5kYXRhYmFzZUNvbnRyb2xsZXI7XG4gICAgaWYgKGRhdGFiYXNlQWRhcHRlciAmJiB0eXBlb2YgZGF0YWJhc2VBZGFwdGVyLmhhbmRsZVNodXRkb3duID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKGRhdGFiYXNlQWRhcHRlci5oYW5kbGVTaHV0ZG93bigpKTtcbiAgICB9XG4gICAgY29uc3QgeyBhZGFwdGVyOiBmaWxlQWRhcHRlciB9ID0gdGhpcy5jb25maWcuZmlsZXNDb250cm9sbGVyO1xuICAgIGlmIChmaWxlQWRhcHRlciAmJiB0eXBlb2YgZmlsZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24gPT09ICdmdW5jdGlvbicpIHtcbiAgICAgIHByb21pc2VzLnB1c2goZmlsZUFkYXB0ZXIuaGFuZGxlU2h1dGRvd24oKSk7XG4gICAgfVxuICAgIGNvbnN0IHsgYWRhcHRlcjogY2FjaGVBZGFwdGVyIH0gPSB0aGlzLmNvbmZpZy5jYWNoZUNvbnRyb2xsZXI7XG4gICAgaWYgKGNhY2hlQWRhcHRlciAmJiB0eXBlb2YgY2FjaGVBZGFwdGVyLmhhbmRsZVNodXRkb3duID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKGNhY2hlQWRhcHRlci5oYW5kbGVTaHV0ZG93bigpKTtcbiAgICB9XG4gICAgaWYgKHRoaXMubGl2ZVF1ZXJ5U2VydmVyPy5zZXJ2ZXI/LmNsb3NlKSB7XG4gICAgICBwcm9taXNlcy5wdXNoKG5ldyBQcm9taXNlKHJlc29sdmUgPT4gdGhpcy5saXZlUXVlcnlTZXJ2ZXIuc2VydmVyLmNsb3NlKHJlc29sdmUpKSk7XG4gICAgfVxuICAgIGlmICh0aGlzLmxpdmVRdWVyeVNlcnZlcikge1xuICAgICAgcHJvbWlzZXMucHVzaCh0aGlzLmxpdmVRdWVyeVNlcnZlci5zaHV0ZG93bigpKTtcbiAgICB9XG4gICAgcmV0dXJuIChwcm9taXNlcy5sZW5ndGggPiAwID8gUHJvbWlzZS5hbGwocHJvbWlzZXMpIDogUHJvbWlzZS5yZXNvbHZlKCkpLnRoZW4oKCkgPT4ge1xuICAgICAgaWYgKHRoaXMuY29uZmlnLnNlcnZlckNsb3NlQ29tcGxldGUpIHtcbiAgICAgICAgdGhpcy5jb25maWcuc2VydmVyQ2xvc2VDb21wbGV0ZSgpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgLyoqXG4gICAqIEBzdGF0aWNcbiAgICogQ3JlYXRlIGFuIGV4cHJlc3MgYXBwIGZvciB0aGUgcGFyc2Ugc2VydmVyXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zIGxldCB5b3Ugc3BlY2lmeSB0aGUgbWF4VXBsb2FkU2l6ZSB3aGVuIGNyZWF0aW5nIHRoZSBleHByZXNzIGFwcCAgKi9cbiAgc3RhdGljIGFwcChvcHRpb25zKSB7XG4gICAgY29uc3QgeyBtYXhVcGxvYWRTaXplID0gJzIwbWInLCBhcHBJZCwgZGlyZWN0QWNjZXNzLCBwYWdlcywgcmF0ZUxpbWl0ID0gW10gfSA9IG9wdGlvbnM7XG4gICAgLy8gVGhpcyBhcHAgc2VydmVzIHRoZSBQYXJzZSBBUEkgZGlyZWN0bHkuXG4gICAgLy8gSXQncyB0aGUgZXF1aXZhbGVudCBvZiBodHRwczovL2FwaS5wYXJzZS5jb20vMSBpbiB0aGUgaG9zdGVkIFBhcnNlIEFQSS5cbiAgICB2YXIgYXBpID0gZXhwcmVzcygpO1xuICAgIC8vYXBpLnVzZShcIi9hcHBzXCIsIGV4cHJlc3Muc3RhdGljKF9fZGlybmFtZSArIFwiL3B1YmxpY1wiKSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5hbGxvd0Nyb3NzRG9tYWluKGFwcElkKSk7XG4gICAgLy8gRmlsZSBoYW5kbGluZyBuZWVkcyB0byBiZSBiZWZvcmUgZGVmYXVsdCBtaWRkbGV3YXJlcyBhcmUgYXBwbGllZFxuICAgIGFwaS51c2UoXG4gICAgICAnLycsXG4gICAgICBuZXcgRmlsZXNSb3V0ZXIoKS5leHByZXNzUm91dGVyKHtcbiAgICAgICAgbWF4VXBsb2FkU2l6ZTogbWF4VXBsb2FkU2l6ZSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIGFwaS51c2UoJy9oZWFsdGgnLCBmdW5jdGlvbiAocmVxLCByZXMpIHtcbiAgICAgIHJlcy5zdGF0dXMob3B0aW9ucy5zdGF0ZSA9PT0gJ29rJyA/IDIwMCA6IDUwMyk7XG4gICAgICBpZiAob3B0aW9ucy5zdGF0ZSA9PT0gJ3N0YXJ0aW5nJykge1xuICAgICAgICByZXMuc2V0KCdSZXRyeS1BZnRlcicsIDEpO1xuICAgICAgfVxuICAgICAgcmVzLmpzb24oe1xuICAgICAgICBzdGF0dXM6IG9wdGlvbnMuc3RhdGUsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIGFwaS51c2UoXG4gICAgICAnLycsXG4gICAgICBib2R5UGFyc2VyLnVybGVuY29kZWQoeyBleHRlbmRlZDogZmFsc2UgfSksXG4gICAgICBwYWdlcy5lbmFibGVSb3V0ZXJcbiAgICAgICAgPyBuZXcgUGFnZXNSb3V0ZXIocGFnZXMpLmV4cHJlc3NSb3V0ZXIoKVxuICAgICAgICA6IG5ldyBQdWJsaWNBUElSb3V0ZXIoKS5leHByZXNzUm91dGVyKClcbiAgICApO1xuXG4gICAgYXBpLnVzZShib2R5UGFyc2VyLmpzb24oeyB0eXBlOiAnKi8qJywgbGltaXQ6IG1heFVwbG9hZFNpemUgfSkpO1xuICAgIGFwaS51c2UobWlkZGxld2FyZXMuYWxsb3dNZXRob2RPdmVycmlkZSk7XG4gICAgYXBpLnVzZShtaWRkbGV3YXJlcy5oYW5kbGVQYXJzZUhlYWRlcnMpO1xuICAgIGNvbnN0IHJvdXRlcyA9IEFycmF5LmlzQXJyYXkocmF0ZUxpbWl0KSA/IHJhdGVMaW1pdCA6IFtyYXRlTGltaXRdO1xuICAgIGZvciAoY29uc3Qgcm91dGUgb2Ygcm91dGVzKSB7XG4gICAgICBtaWRkbGV3YXJlcy5hZGRSYXRlTGltaXQocm91dGUsIG9wdGlvbnMpO1xuICAgIH1cbiAgICBhcGkudXNlKG1pZGRsZXdhcmVzLmhhbmRsZVBhcnNlU2Vzc2lvbik7XG5cbiAgICBjb25zdCBhcHBSb3V0ZXIgPSBQYXJzZVNlcnZlci5wcm9taXNlUm91dGVyKHsgYXBwSWQgfSk7XG4gICAgYXBpLnVzZShhcHBSb3V0ZXIuZXhwcmVzc1JvdXRlcigpKTtcblxuICAgIGFwaS51c2UobWlkZGxld2FyZXMuaGFuZGxlUGFyc2VFcnJvcnMpO1xuXG4gICAgLy8gcnVuIHRoZSBmb2xsb3dpbmcgd2hlbiBub3QgdGVzdGluZ1xuICAgIGlmICghcHJvY2Vzcy5lbnYuVEVTVElORykge1xuICAgICAgLy9UaGlzIGNhdXNlcyB0ZXN0cyB0byBzcGV3IHNvbWUgdXNlbGVzcyB3YXJuaW5ncywgc28gZGlzYWJsZSBpbiB0ZXN0XG4gICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgICAgcHJvY2Vzcy5vbigndW5jYXVnaHRFeGNlcHRpb24nLCBlcnIgPT4ge1xuICAgICAgICBpZiAoZXJyLmNvZGUgPT09ICdFQUREUklOVVNFJykge1xuICAgICAgICAgIC8vIHVzZXItZnJpZW5kbHkgbWVzc2FnZSBmb3IgdGhpcyBjb21tb24gZXJyb3JcbiAgICAgICAgICBwcm9jZXNzLnN0ZGVyci53cml0ZShgVW5hYmxlIHRvIGxpc3RlbiBvbiBwb3J0ICR7ZXJyLnBvcnR9LiBUaGUgcG9ydCBpcyBhbHJlYWR5IGluIHVzZS5gKTtcbiAgICAgICAgICBwcm9jZXNzLmV4aXQoMCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKGVyci5tZXNzYWdlKSB7XG4gICAgICAgICAgICBwcm9jZXNzLnN0ZGVyci53cml0ZSgnQW4gdW5jYXVnaHQgZXhjZXB0aW9uIG9jY3VycmVkOiAnICsgZXJyLm1lc3NhZ2UpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZXJyLnN0YWNrKSB7XG4gICAgICAgICAgICBwcm9jZXNzLnN0ZGVyci53cml0ZSgnU3RhY2sgVHJhY2U6XFxuJyArIGVyci5zdGFjayk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHByb2Nlc3Muc3RkZXJyLndyaXRlKGVycik7XG4gICAgICAgICAgfVxuICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgICAvLyB2ZXJpZnkgdGhlIHNlcnZlciB1cmwgYWZ0ZXIgYSAnbW91bnQnIGV2ZW50IGlzIHJlY2VpdmVkXG4gICAgICAvKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuICAgICAgYXBpLm9uKCdtb3VudCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMDApKTtcbiAgICAgICAgUGFyc2VTZXJ2ZXIudmVyaWZ5U2VydmVyVXJsKCk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgaWYgKHByb2Nlc3MuZW52LlBBUlNFX1NFUlZFUl9FTkFCTEVfRVhQRVJJTUVOVEFMX0RJUkVDVF9BQ0NFU1MgPT09ICcxJyB8fCBkaXJlY3RBY2Nlc3MpIHtcbiAgICAgIFBhcnNlLkNvcmVNYW5hZ2VyLnNldFJFU1RDb250cm9sbGVyKFBhcnNlU2VydmVyUkVTVENvbnRyb2xsZXIoYXBwSWQsIGFwcFJvdXRlcikpO1xuICAgIH1cbiAgICByZXR1cm4gYXBpO1xuICB9XG5cbiAgc3RhdGljIHByb21pc2VSb3V0ZXIoeyBhcHBJZCB9KSB7XG4gICAgY29uc3Qgcm91dGVycyA9IFtcbiAgICAgIG5ldyBDbGFzc2VzUm91dGVyKCksXG4gICAgICBuZXcgVXNlcnNSb3V0ZXIoKSxcbiAgICAgIG5ldyBTZXNzaW9uc1JvdXRlcigpLFxuICAgICAgbmV3IFJvbGVzUm91dGVyKCksXG4gICAgICBuZXcgQW5hbHl0aWNzUm91dGVyKCksXG4gICAgICBuZXcgSW5zdGFsbGF0aW9uc1JvdXRlcigpLFxuICAgICAgbmV3IEZ1bmN0aW9uc1JvdXRlcigpLFxuICAgICAgbmV3IFNjaGVtYXNSb3V0ZXIoKSxcbiAgICAgIG5ldyBQdXNoUm91dGVyKCksXG4gICAgICBuZXcgTG9nc1JvdXRlcigpLFxuICAgICAgbmV3IElBUFZhbGlkYXRpb25Sb3V0ZXIoKSxcbiAgICAgIG5ldyBGZWF0dXJlc1JvdXRlcigpLFxuICAgICAgbmV3IEdsb2JhbENvbmZpZ1JvdXRlcigpLFxuICAgICAgbmV3IEdyYXBoUUxSb3V0ZXIoKSxcbiAgICAgIG5ldyBQdXJnZVJvdXRlcigpLFxuICAgICAgbmV3IEhvb2tzUm91dGVyKCksXG4gICAgICBuZXcgQ2xvdWRDb2RlUm91dGVyKCksXG4gICAgICBuZXcgQXVkaWVuY2VzUm91dGVyKCksXG4gICAgICBuZXcgQWdncmVnYXRlUm91dGVyKCksXG4gICAgICBuZXcgU2VjdXJpdHlSb3V0ZXIoKSxcbiAgICBdO1xuXG4gICAgY29uc3Qgcm91dGVzID0gcm91dGVycy5yZWR1Y2UoKG1lbW8sIHJvdXRlcikgPT4ge1xuICAgICAgcmV0dXJuIG1lbW8uY29uY2F0KHJvdXRlci5yb3V0ZXMpO1xuICAgIH0sIFtdKTtcblxuICAgIGNvbnN0IGFwcFJvdXRlciA9IG5ldyBQcm9taXNlUm91dGVyKHJvdXRlcywgYXBwSWQpO1xuXG4gICAgYmF0Y2gubW91bnRPbnRvKGFwcFJvdXRlcik7XG4gICAgcmV0dXJuIGFwcFJvdXRlcjtcbiAgfVxuXG4gIC8qKlxuICAgKiBzdGFydHMgdGhlIHBhcnNlIHNlcnZlcidzIGV4cHJlc3MgYXBwXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHRvIHVzZSB0byBzdGFydCB0aGUgc2VydmVyXG4gICAqIEByZXR1cm5zIHtQYXJzZVNlcnZlcn0gdGhlIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgKi9cblxuICBhc3luYyBzdGFydEFwcChvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICB0cnkge1xuICAgICAgYXdhaXQgdGhpcy5zdGFydCgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIG9uIFBhcnNlU2VydmVyLnN0YXJ0QXBwOiAnLCBlKTtcbiAgICAgIHRocm93IGU7XG4gICAgfVxuICAgIGNvbnN0IGFwcCA9IGV4cHJlc3MoKTtcbiAgICBpZiAob3B0aW9ucy5taWRkbGV3YXJlKSB7XG4gICAgICBsZXQgbWlkZGxld2FyZTtcbiAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5taWRkbGV3YXJlID09ICdzdHJpbmcnKSB7XG4gICAgICAgIG1pZGRsZXdhcmUgPSByZXF1aXJlKHBhdGgucmVzb2x2ZShwcm9jZXNzLmN3ZCgpLCBvcHRpb25zLm1pZGRsZXdhcmUpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG1pZGRsZXdhcmUgPSBvcHRpb25zLm1pZGRsZXdhcmU7IC8vIHVzZSBhcy1pcyBsZXQgZXhwcmVzcyBmYWlsXG4gICAgICB9XG4gICAgICBhcHAudXNlKG1pZGRsZXdhcmUpO1xuICAgIH1cbiAgICBhcHAudXNlKG9wdGlvbnMubW91bnRQYXRoLCB0aGlzLmFwcCk7XG5cbiAgICBpZiAob3B0aW9ucy5tb3VudEdyYXBoUUwgPT09IHRydWUgfHwgb3B0aW9ucy5tb3VudFBsYXlncm91bmQgPT09IHRydWUpIHtcbiAgICAgIGxldCBncmFwaFFMQ3VzdG9tVHlwZURlZnMgPSB1bmRlZmluZWQ7XG4gICAgICBpZiAodHlwZW9mIG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gcGFyc2UoZnMucmVhZEZpbGVTeW5jKG9wdGlvbnMuZ3JhcGhRTFNjaGVtYSwgJ3V0ZjgnKSk7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICB0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnb2JqZWN0JyB8fFxuICAgICAgICB0eXBlb2Ygb3B0aW9ucy5ncmFwaFFMU2NoZW1hID09PSAnZnVuY3Rpb24nXG4gICAgICApIHtcbiAgICAgICAgZ3JhcGhRTEN1c3RvbVR5cGVEZWZzID0gb3B0aW9ucy5ncmFwaFFMU2NoZW1hO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBwYXJzZUdyYXBoUUxTZXJ2ZXIgPSBuZXcgUGFyc2VHcmFwaFFMU2VydmVyKHRoaXMsIHtcbiAgICAgICAgZ3JhcGhRTFBhdGg6IG9wdGlvbnMuZ3JhcGhRTFBhdGgsXG4gICAgICAgIHBsYXlncm91bmRQYXRoOiBvcHRpb25zLnBsYXlncm91bmRQYXRoLFxuICAgICAgICBncmFwaFFMQ3VzdG9tVHlwZURlZnMsXG4gICAgICB9KTtcblxuICAgICAgaWYgKG9wdGlvbnMubW91bnRHcmFwaFFMKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNlcnZlci5hcHBseUdyYXBoUUwoYXBwKTtcbiAgICAgIH1cblxuICAgICAgaWYgKG9wdGlvbnMubW91bnRQbGF5Z3JvdW5kKSB7XG4gICAgICAgIHBhcnNlR3JhcGhRTFNlcnZlci5hcHBseVBsYXlncm91bmQoYXBwKTtcbiAgICAgIH1cbiAgICB9XG4gICAgY29uc3Qgc2VydmVyID0gYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG4gICAgICBhcHAubGlzdGVuKG9wdGlvbnMucG9ydCwgb3B0aW9ucy5ob3N0LCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJlc29sdmUodGhpcyk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgICB0aGlzLnNlcnZlciA9IHNlcnZlcjtcblxuICAgIGlmIChvcHRpb25zLnN0YXJ0TGl2ZVF1ZXJ5U2VydmVyIHx8IG9wdGlvbnMubGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucykge1xuICAgICAgdGhpcy5saXZlUXVlcnlTZXJ2ZXIgPSBhd2FpdCBQYXJzZVNlcnZlci5jcmVhdGVMaXZlUXVlcnlTZXJ2ZXIoXG4gICAgICAgIHNlcnZlcixcbiAgICAgICAgb3B0aW9ucy5saXZlUXVlcnlTZXJ2ZXJPcHRpb25zLFxuICAgICAgICBvcHRpb25zXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAob3B0aW9ucy50cnVzdFByb3h5KSB7XG4gICAgICBhcHAuc2V0KCd0cnVzdCBwcm94eScsIG9wdGlvbnMudHJ1c3RQcm94eSk7XG4gICAgfVxuICAgIC8qIGlzdGFuYnVsIGlnbm9yZSBuZXh0ICovXG4gICAgaWYgKCFwcm9jZXNzLmVudi5URVNUSU5HKSB7XG4gICAgICBjb25maWd1cmVMaXN0ZW5lcnModGhpcyk7XG4gICAgfVxuICAgIHRoaXMuZXhwcmVzc0FwcCA9IGFwcDtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8qKlxuICAgKiBDcmVhdGVzIGEgbmV3IFBhcnNlU2VydmVyIGFuZCBzdGFydHMgaXQuXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIHVzZWQgdG8gc3RhcnQgdGhlIHNlcnZlclxuICAgKiBAcmV0dXJucyB7UGFyc2VTZXJ2ZXJ9IHRoZSBwYXJzZSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICovXG4gIHN0YXRpYyBhc3luYyBzdGFydEFwcChvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICBjb25zdCBwYXJzZVNlcnZlciA9IG5ldyBQYXJzZVNlcnZlcihvcHRpb25zKTtcbiAgICByZXR1cm4gcGFyc2VTZXJ2ZXIuc3RhcnRBcHAob3B0aW9ucyk7XG4gIH1cblxuICAvKipcbiAgICogSGVscGVyIG1ldGhvZCB0byBjcmVhdGUgYSBsaXZlUXVlcnkgc2VydmVyXG4gICAqIEBzdGF0aWNcbiAgICogQHBhcmFtIHtTZXJ2ZXJ9IGh0dHBTZXJ2ZXIgYW4gb3B0aW9uYWwgaHR0cCBzZXJ2ZXIgdG8gcGFzc1xuICAgKiBAcGFyYW0ge0xpdmVRdWVyeVNlcnZlck9wdGlvbnN9IGNvbmZpZyBvcHRpb25zIGZvciB0aGUgbGl2ZVF1ZXJ5U2VydmVyXG4gICAqIEBwYXJhbSB7UGFyc2VTZXJ2ZXJPcHRpb25zfSBvcHRpb25zIG9wdGlvbnMgZm9yIHRoZSBQYXJzZVNlcnZlclxuICAgKiBAcmV0dXJucyB7UHJvbWlzZTxQYXJzZUxpdmVRdWVyeVNlcnZlcj59IHRoZSBsaXZlIHF1ZXJ5IHNlcnZlciBpbnN0YW5jZVxuICAgKi9cbiAgc3RhdGljIGFzeW5jIGNyZWF0ZUxpdmVRdWVyeVNlcnZlcihcbiAgICBodHRwU2VydmVyLFxuICAgIGNvbmZpZzogTGl2ZVF1ZXJ5U2VydmVyT3B0aW9ucyxcbiAgICBvcHRpb25zOiBQYXJzZVNlcnZlck9wdGlvbnNcbiAgKSB7XG4gICAgaWYgKCFodHRwU2VydmVyIHx8IChjb25maWcgJiYgY29uZmlnLnBvcnQpKSB7XG4gICAgICB2YXIgYXBwID0gZXhwcmVzcygpO1xuICAgICAgaHR0cFNlcnZlciA9IHJlcXVpcmUoJ2h0dHAnKS5jcmVhdGVTZXJ2ZXIoYXBwKTtcbiAgICAgIGh0dHBTZXJ2ZXIubGlzdGVuKGNvbmZpZy5wb3J0KTtcbiAgICB9XG4gICAgY29uc3Qgc2VydmVyID0gbmV3IFBhcnNlTGl2ZVF1ZXJ5U2VydmVyKGh0dHBTZXJ2ZXIsIGNvbmZpZywgb3B0aW9ucyk7XG4gICAgYXdhaXQgc2VydmVyLmNvbm5lY3QoKTtcbiAgICByZXR1cm4gc2VydmVyO1xuICB9XG5cbiAgc3RhdGljIGFzeW5jIHZlcmlmeVNlcnZlclVybCgpIHtcbiAgICAvLyBwZXJmb3JtIGEgaGVhbHRoIGNoZWNrIG9uIHRoZSBzZXJ2ZXJVUkwgdmFsdWVcbiAgICBpZiAoUGFyc2Uuc2VydmVyVVJMKSB7XG4gICAgICBjb25zdCBpc1ZhbGlkSHR0cFVybCA9IHN0cmluZyA9PiB7XG4gICAgICAgIGxldCB1cmw7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgdXJsID0gbmV3IFVSTChzdHJpbmcpO1xuICAgICAgICB9IGNhdGNoIChfKSB7XG4gICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1cmwucHJvdG9jb2wgPT09ICdodHRwOicgfHwgdXJsLnByb3RvY29sID09PSAnaHR0cHM6JztcbiAgICAgIH07XG4gICAgICBjb25zdCB1cmwgPSBgJHtQYXJzZS5zZXJ2ZXJVUkwucmVwbGFjZSgvXFwvJC8sICcnKX0vaGVhbHRoYDtcbiAgICAgIGlmICghaXNWYWxpZEh0dHBVcmwodXJsKSkge1xuICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgYFxcbldBUk5JTkcsIFVuYWJsZSB0byBjb25uZWN0IHRvICcke1BhcnNlLnNlcnZlclVSTH0nIGFzIHRoZSBVUkwgaXMgaW52YWxpZC5gICtcbiAgICAgICAgICAgIGAgQ2xvdWQgY29kZSBhbmQgcHVzaCBub3RpZmljYXRpb25zIG1heSBiZSB1bmF2YWlsYWJsZSFcXG5gXG4gICAgICAgICk7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHJlcXVlc3QgPSByZXF1aXJlKCcuL3JlcXVlc3QnKTtcbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgcmVxdWVzdCh7IHVybCB9KS5jYXRjaChyZXNwb25zZSA9PiByZXNwb25zZSk7XG4gICAgICBjb25zdCBqc29uID0gcmVzcG9uc2UuZGF0YSB8fCBudWxsO1xuICAgICAgY29uc3QgcmV0cnkgPSByZXNwb25zZS5oZWFkZXJzPy5bJ3JldHJ5LWFmdGVyJ107XG4gICAgICBpZiAocmV0cnkpIHtcbiAgICAgICAgYXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIHJldHJ5ICogMTAwMCkpO1xuICAgICAgICByZXR1cm4gdGhpcy52ZXJpZnlTZXJ2ZXJVcmwoKTtcbiAgICAgIH1cbiAgICAgIGlmIChyZXNwb25zZS5zdGF0dXMgIT09IDIwMCB8fCBqc29uPy5zdGF0dXMgIT09ICdvaycpIHtcbiAgICAgICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICAgYFxcbldBUk5JTkcsIFVuYWJsZSB0byBjb25uZWN0IHRvICcke1BhcnNlLnNlcnZlclVSTH0nLmAgK1xuICAgICAgICAgICAgYCBDbG91ZCBjb2RlIGFuZCBwdXNoIG5vdGlmaWNhdGlvbnMgbWF5IGJlIHVuYXZhaWxhYmxlIVxcbmBcbiAgICAgICAgKTtcbiAgICAgICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRQYXJzZUNsb3VkKCkge1xuICBjb25zdCBQYXJzZUNsb3VkID0gcmVxdWlyZSgnLi9jbG91ZC1jb2RlL1BhcnNlLkNsb3VkJyk7XG4gIGNvbnN0IFBhcnNlU2VydmVyID0gcmVxdWlyZSgnLi9jbG91ZC1jb2RlL1BhcnNlLlNlcnZlcicpO1xuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoUGFyc2UsICdTZXJ2ZXInLCB7XG4gICAgZ2V0KCkge1xuICAgICAgY29uc3QgY29uZiA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgICByZXR1cm4geyAuLi5jb25mLCAuLi5QYXJzZVNlcnZlciB9O1xuICAgIH0sXG4gICAgc2V0KG5ld1ZhbCkge1xuICAgICAgbmV3VmFsLmFwcElkID0gUGFyc2UuYXBwbGljYXRpb25JZDtcbiAgICAgIENvbmZpZy5wdXQobmV3VmFsKTtcbiAgICB9LFxuICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZSxcbiAgfSk7XG4gIE9iamVjdC5hc3NpZ24oUGFyc2UuQ2xvdWQsIFBhcnNlQ2xvdWQpO1xuICBnbG9iYWwuUGFyc2UgPSBQYXJzZTtcbn1cblxuZnVuY3Rpb24gaW5qZWN0RGVmYXVsdHMob3B0aW9uczogUGFyc2VTZXJ2ZXJPcHRpb25zKSB7XG4gIE9iamVjdC5rZXlzKGRlZmF1bHRzKS5mb3JFYWNoKGtleSA9PiB7XG4gICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob3B0aW9ucywga2V5KSkge1xuICAgICAgb3B0aW9uc1trZXldID0gZGVmYXVsdHNba2V5XTtcbiAgICB9XG4gIH0pO1xuXG4gIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9wdGlvbnMsICdzZXJ2ZXJVUkwnKSkge1xuICAgIG9wdGlvbnMuc2VydmVyVVJMID0gYGh0dHA6Ly9sb2NhbGhvc3Q6JHtvcHRpb25zLnBvcnR9JHtvcHRpb25zLm1vdW50UGF0aH1gO1xuICB9XG5cbiAgLy8gUmVzZXJ2ZWQgQ2hhcmFjdGVyc1xuICBpZiAob3B0aW9ucy5hcHBJZCkge1xuICAgIGNvbnN0IHJlZ2V4ID0gL1shIyQlJygpKismLzo7PT9AW1xcXXt9Xix8PD5dL2c7XG4gICAgaWYgKG9wdGlvbnMuYXBwSWQubWF0Y2gocmVnZXgpKSB7XG4gICAgICBjb25zb2xlLndhcm4oXG4gICAgICAgIGBcXG5XQVJOSU5HLCBhcHBJZCB0aGF0IGNvbnRhaW5zIHNwZWNpYWwgY2hhcmFjdGVycyBjYW4gY2F1c2UgaXNzdWVzIHdoaWxlIHVzaW5nIHdpdGggdXJscy5cXG5gXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8vIEJhY2t3YXJkcyBjb21wYXRpYmlsaXR5XG4gIGlmIChvcHRpb25zLnVzZXJTZW5zaXRpdmVGaWVsZHMpIHtcbiAgICAvKiBlc2xpbnQtZGlzYWJsZSBuby1jb25zb2xlICovXG4gICAgIXByb2Nlc3MuZW52LlRFU1RJTkcgJiZcbiAgICAgIGNvbnNvbGUud2FybihcbiAgICAgICAgYFxcbkRFUFJFQ0FURUQ6IHVzZXJTZW5zaXRpdmVGaWVsZHMgaGFzIGJlZW4gcmVwbGFjZWQgYnkgcHJvdGVjdGVkRmllbGRzIGFsbG93aW5nIHRoZSBhYmlsaXR5IHRvIHByb3RlY3QgZmllbGRzIGluIGFsbCBjbGFzc2VzIHdpdGggQ0xQLiBcXG5gXG4gICAgICApO1xuICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuXG4gICAgY29uc3QgdXNlclNlbnNpdGl2ZUZpZWxkcyA9IEFycmF5LmZyb20oXG4gICAgICBuZXcgU2V0KFsuLi4oZGVmYXVsdHMudXNlclNlbnNpdGl2ZUZpZWxkcyB8fCBbXSksIC4uLihvcHRpb25zLnVzZXJTZW5zaXRpdmVGaWVsZHMgfHwgW10pXSlcbiAgICApO1xuXG4gICAgLy8gSWYgdGhlIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzIGlzIHVuc2V0LFxuICAgIC8vIGl0J2xsIGJlIGFzc2lnbmVkIHRoZSBkZWZhdWx0IGFib3ZlLlxuICAgIC8vIEhlcmUsIHByb3RlY3QgYWdhaW5zdCB0aGUgY2FzZSB3aGVyZSBwcm90ZWN0ZWRGaWVsZHNcbiAgICAvLyBpcyBzZXQsIGJ1dCBkb2Vzbid0IGhhdmUgX1VzZXIuXG4gICAgaWYgKCEoJ19Vc2VyJyBpbiBvcHRpb25zLnByb3RlY3RlZEZpZWxkcykpIHtcbiAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzID0gT2JqZWN0LmFzc2lnbih7IF9Vc2VyOiBbXSB9LCBvcHRpb25zLnByb3RlY3RlZEZpZWxkcyk7XG4gICAgfVxuXG4gICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbJ19Vc2VyJ11bJyonXSA9IEFycmF5LmZyb20oXG4gICAgICBuZXcgU2V0KFsuLi4ob3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbJ19Vc2VyJ11bJyonXSB8fCBbXSksIC4uLnVzZXJTZW5zaXRpdmVGaWVsZHNdKVxuICAgICk7XG4gIH1cblxuICAvLyBNZXJnZSBwcm90ZWN0ZWRGaWVsZHMgb3B0aW9ucyB3aXRoIGRlZmF1bHRzLlxuICBPYmplY3Qua2V5cyhkZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHMpLmZvckVhY2goYyA9PiB7XG4gICAgY29uc3QgY3VyID0gb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY107XG4gICAgaWYgKCFjdXIpIHtcbiAgICAgIG9wdGlvbnMucHJvdGVjdGVkRmllbGRzW2NdID0gZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdO1xuICAgIH0gZWxzZSB7XG4gICAgICBPYmplY3Qua2V5cyhkZWZhdWx0cy5wcm90ZWN0ZWRGaWVsZHNbY10pLmZvckVhY2gociA9PiB7XG4gICAgICAgIGNvbnN0IHVucSA9IG5ldyBTZXQoW1xuICAgICAgICAgIC4uLihvcHRpb25zLnByb3RlY3RlZEZpZWxkc1tjXVtyXSB8fCBbXSksXG4gICAgICAgICAgLi4uZGVmYXVsdHMucHJvdGVjdGVkRmllbGRzW2NdW3JdLFxuICAgICAgICBdKTtcbiAgICAgICAgb3B0aW9ucy5wcm90ZWN0ZWRGaWVsZHNbY11bcl0gPSBBcnJheS5mcm9tKHVucSk7XG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xufVxuXG4vLyBUaG9zZSBjYW4ndCBiZSB0ZXN0ZWQgYXMgaXQgcmVxdWlyZXMgYSBzdWJwcm9jZXNzXG4vKiBpc3RhbmJ1bCBpZ25vcmUgbmV4dCAqL1xuZnVuY3Rpb24gY29uZmlndXJlTGlzdGVuZXJzKHBhcnNlU2VydmVyKSB7XG4gIGNvbnN0IHNlcnZlciA9IHBhcnNlU2VydmVyLnNlcnZlcjtcbiAgY29uc3Qgc29ja2V0cyA9IHt9O1xuICAvKiBDdXJyZW50bHksIGV4cHJlc3MgZG9lc24ndCBzaHV0IGRvd24gaW1tZWRpYXRlbHkgYWZ0ZXIgcmVjZWl2aW5nIFNJR0lOVC9TSUdURVJNIGlmIGl0IGhhcyBjbGllbnQgY29ubmVjdGlvbnMgdGhhdCBoYXZlbid0IHRpbWVkIG91dC4gKFRoaXMgaXMgYSBrbm93biBpc3N1ZSB3aXRoIG5vZGUgLSBodHRwczovL2dpdGh1Yi5jb20vbm9kZWpzL25vZGUvaXNzdWVzLzI2NDIpXG4gICAgVGhpcyBmdW5jdGlvbiwgYWxvbmcgd2l0aCBgZGVzdHJveUFsaXZlQ29ubmVjdGlvbnMoKWAsIGludGVuZCB0byBmaXggdGhpcyBiZWhhdmlvciBzdWNoIHRoYXQgcGFyc2Ugc2VydmVyIHdpbGwgY2xvc2UgYWxsIG9wZW4gY29ubmVjdGlvbnMgYW5kIGluaXRpYXRlIHRoZSBzaHV0ZG93biBwcm9jZXNzIGFzIHNvb24gYXMgaXQgcmVjZWl2ZXMgYSBTSUdJTlQvU0lHVEVSTSBzaWduYWwuICovXG4gIHNlcnZlci5vbignY29ubmVjdGlvbicsIHNvY2tldCA9PiB7XG4gICAgY29uc3Qgc29ja2V0SWQgPSBzb2NrZXQucmVtb3RlQWRkcmVzcyArICc6JyArIHNvY2tldC5yZW1vdGVQb3J0O1xuICAgIHNvY2tldHNbc29ja2V0SWRdID0gc29ja2V0O1xuICAgIHNvY2tldC5vbignY2xvc2UnLCAoKSA9PiB7XG4gICAgICBkZWxldGUgc29ja2V0c1tzb2NrZXRJZF07XG4gICAgfSk7XG4gIH0pO1xuXG4gIGNvbnN0IGRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zID0gZnVuY3Rpb24gKCkge1xuICAgIGZvciAoY29uc3Qgc29ja2V0SWQgaW4gc29ja2V0cykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgc29ja2V0c1tzb2NrZXRJZF0uZGVzdHJveSgpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAvKiAqL1xuICAgICAgfVxuICAgIH1cbiAgfTtcblxuICBjb25zdCBoYW5kbGVTaHV0ZG93biA9IGZ1bmN0aW9uICgpIHtcbiAgICBwcm9jZXNzLnN0ZG91dC53cml0ZSgnVGVybWluYXRpb24gc2lnbmFsIHJlY2VpdmVkLiBTaHV0dGluZyBkb3duLicpO1xuICAgIGRlc3Ryb3lBbGl2ZUNvbm5lY3Rpb25zKCk7XG4gICAgc2VydmVyLmNsb3NlKCk7XG4gICAgcGFyc2VTZXJ2ZXIuaGFuZGxlU2h1dGRvd24oKTtcbiAgfTtcbiAgcHJvY2Vzcy5vbignU0lHVEVSTScsIGhhbmRsZVNodXRkb3duKTtcbiAgcHJvY2Vzcy5vbignU0lHSU5UJywgaGFuZGxlU2h1dGRvd24pO1xufVxuXG5leHBvcnQgZGVmYXVsdCBQYXJzZVNlcnZlcjtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBV0EsSUFBQUEsUUFBQSxHQUFBQyxPQUFBO0FBQ0EsSUFBQUMsU0FBQSxHQUFBQyxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQUcsT0FBQSxHQUFBQyx1QkFBQSxDQUFBSixPQUFBO0FBQ0EsSUFBQUssT0FBQSxHQUFBSCxzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQU0sY0FBQSxHQUFBSixzQkFBQSxDQUFBRixPQUFBO0FBQ0EsSUFBQU8sa0JBQUEsR0FBQUwsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFRLGdCQUFBLEdBQUFSLE9BQUE7QUFDQSxJQUFBUyxjQUFBLEdBQUFULE9BQUE7QUFDQSxJQUFBVSxlQUFBLEdBQUFWLE9BQUE7QUFDQSxJQUFBVyxZQUFBLEdBQUFYLE9BQUE7QUFDQSxJQUFBWSxnQkFBQSxHQUFBWixPQUFBO0FBQ0EsSUFBQWEsbUJBQUEsR0FBQWIsT0FBQTtBQUNBLElBQUFjLGNBQUEsR0FBQWQsT0FBQTtBQUNBLElBQUFlLFlBQUEsR0FBQWYsT0FBQTtBQUNBLElBQUFnQixvQkFBQSxHQUFBaEIsT0FBQTtBQUNBLElBQUFpQixvQkFBQSxHQUFBakIsT0FBQTtBQUNBLElBQUFrQixXQUFBLEdBQUFsQixPQUFBO0FBQ0EsSUFBQW1CLHFCQUFBLEdBQUFuQixPQUFBO0FBQ0EsSUFBQW9CLFlBQUEsR0FBQXBCLE9BQUE7QUFDQSxJQUFBcUIsZ0JBQUEsR0FBQXJCLE9BQUE7QUFDQSxJQUFBc0IsV0FBQSxHQUFBdEIsT0FBQTtBQUNBLElBQUF1QixnQkFBQSxHQUFBdkIsT0FBQTtBQUNBLElB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