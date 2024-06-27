"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.GraphQLConfigKey = exports.GraphQLConfigId = exports.GraphQLConfigClassName = void 0;
var _requiredParameter = _interopRequireDefault(require("../../lib/requiredParameter"));
var _DatabaseController = _interopRequireDefault(require("./DatabaseController"));
var _CacheController = _interopRequireDefault(require("./CacheController"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }
function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
const GraphQLConfigClassName = exports.GraphQLConfigClassName = '_GraphQLConfig';
const GraphQLConfigId = exports.GraphQLConfigId = '1';
const GraphQLConfigKey = exports.GraphQLConfigKey = 'config';
class ParseGraphQLController {
  constructor(params = {}) {
    this.databaseController = params.databaseController || (0, _requiredParameter.default)(`ParseGraphQLController requires a "databaseController" to be instantiated.`);
    this.cacheController = params.cacheController;
    this.isMounted = !!params.mountGraphQL;
    this.configCacheKey = GraphQLConfigKey;
  }
  async getGraphQLConfig() {
    if (this.isMounted) {
      const _cachedConfig = await this._getCachedGraphQLConfig();
      if (_cachedConfig) {
        return _cachedConfig;
      }
    }
    const results = await this.databaseController.find(GraphQLConfigClassName, {
      objectId: GraphQLConfigId
    }, {
      limit: 1
    });
    let graphQLConfig;
    if (results.length != 1) {
      // If there is no config in the database - return empty config.
      return {};
    } else {
      graphQLConfig = results[0][GraphQLConfigKey];
    }
    if (this.isMounted) {
      this._putCachedGraphQLConfig(graphQLConfig);
    }
    return graphQLConfig;
  }
  async updateGraphQLConfig(graphQLConfig) {
    // throws if invalid
    this._validateGraphQLConfig(graphQLConfig || (0, _requiredParameter.default)('You must provide a graphQLConfig!'));

    // Transform in dot notation to make sure it works
    const update = Object.keys(graphQLConfig).reduce((acc, key) => {
      return {
        [GraphQLConfigKey]: _objectSpread(_objectSpread({}, acc[GraphQLConfigKey]), {}, {
          [key]: graphQLConfig[key]
        })
      };
    }, {
      [GraphQLConfigKey]: {}
    });
    await this.databaseController.update(GraphQLConfigClassName, {
      objectId: GraphQLConfigId
    }, update, {
      upsert: true
    });
    if (this.isMounted) {
      this._putCachedGraphQLConfig(graphQLConfig);
    }
    return {
      response: {
        result: true
      }
    };
  }
  _getCachedGraphQLConfig() {
    return this.cacheController.graphQL.get(this.configCacheKey);
  }
  _putCachedGraphQLConfig(graphQLConfig) {
    return this.cacheController.graphQL.put(this.configCacheKey, graphQLConfig, 60000);
  }
  _validateGraphQLConfig(graphQLConfig) {
    const errorMessages = [];
    if (!graphQLConfig) {
      errorMessages.push('cannot be undefined, null or empty');
    } else if (!isValidSimpleObject(graphQLConfig)) {
      errorMessages.push('must be a valid object');
    } else {
      const {
          enabledForClasses = null,
          disabledForClasses = null,
          classConfigs = null
        } = graphQLConfig,
        invalidKeys = _objectWithoutProperties(graphQLConfig, ["enabledForClasses", "disabledForClasses", "classConfigs"]);
      if (Object.keys(invalidKeys).length) {
        errorMessages.push(`encountered invalid keys: [${Object.keys(invalidKeys)}]`);
      }
      if (enabledForClasses !== null && !isValidStringArray(enabledForClasses)) {
        errorMessages.push(`"enabledForClasses" is not a valid array`);
      }
      if (disabledForClasses !== null && !isValidStringArray(disabledForClasses)) {
        errorMessages.push(`"disabledForClasses" is not a valid array`);
      }
      if (classConfigs !== null) {
        if (Array.isArray(classConfigs)) {
          classConfigs.forEach(classConfig => {
            const errorMessage = this._validateClassConfig(classConfig);
            if (errorMessage) {
              errorMessages.push(`classConfig:${classConfig.className} is invalid because ${errorMessage}`);
            }
          });
        } else {
          errorMessages.push(`"classConfigs" is not a valid array`);
        }
      }
    }
    if (errorMessages.length) {
      throw new Error(`Invalid graphQLConfig: ${errorMessages.join('; ')}`);
    }
  }
  _validateClassConfig(classConfig) {
    if (!isValidSimpleObject(classConfig)) {
      return 'it must be a valid object';
    } else {
      const {
          className,
          type = null,
          query = null,
          mutation = null
        } = classConfig,
        invalidKeys = _objectWithoutProperties(classConfig, ["className", "type", "query", "mutation"]);
      if (Object.keys(invalidKeys).length) {
        return `"invalidKeys" [${Object.keys(invalidKeys)}] should not be present`;
      }
      if (typeof className !== 'string' || !className.trim().length) {
        // TODO consider checking class exists in schema?
        return `"className" must be a valid string`;
      }
      if (type !== null) {
        if (!isValidSimpleObject(type)) {
          return `"type" must be a valid object`;
        }
        const {
            inputFields = null,
            outputFields = null,
            constraintFields = null,
            sortFields = null
          } = type,
          invalidKeys = _objectWithoutProperties(type, ["inputFields", "outputFields", "constraintFields", "sortFields"]);
        if (Object.keys(invalidKeys).length) {
          return `"type" contains invalid keys, [${Object.keys(invalidKeys)}]`;
        } else if (outputFields !== null && !isValidStringArray(outputFields)) {
          return `"outputFields" must be a valid string array`;
        } else if (constraintFields !== null && !isValidStringArray(constraintFields)) {
          return `"constraintFields" must be a valid string array`;
        }
        if (sortFields !== null) {
          if (Array.isArray(sortFields)) {
            let errorMessage;
            sortFields.every((sortField, index) => {
              if (!isValidSimpleObject(sortField)) {
                errorMessage = `"sortField" at index ${index} is not a valid object`;
                return false;
              } else {
                const {
                    field,
                    asc,
                    desc
                  } = sortField,
                  invalidKeys = _objectWithoutProperties(sortField, ["field", "asc", "desc"]);
                if (Object.keys(invalidKeys).length) {
                  errorMessage = `"sortField" at index ${index} contains invalid keys, [${Object.keys(invalidKeys)}]`;
                  return false;
                } else {
                  if (typeof field !== 'string' || field.trim().length === 0) {
                    errorMessage = `"sortField" at index ${index} did not provide the "field" as a string`;
                    return false;
                  } else if (typeof asc !== 'boolean' || typeof desc !== 'boolean') {
                    errorMessage = `"sortField" at index ${index} did not provide "asc" or "desc" as booleans`;
                    return false;
                  }
                }
              }
              return true;
            });
            if (errorMessage) {
              return errorMessage;
            }
          } else {
            return `"sortFields" must be a valid array.`;
          }
        }
        if (inputFields !== null) {
          if (isValidSimpleObject(inputFields)) {
            const {
                create = null,
                update = null
              } = inputFields,
              invalidKeys = _objectWithoutProperties(inputFields, ["create", "update"]);
            if (Object.keys(invalidKeys).length) {
              return `"inputFields" contains invalid keys: [${Object.keys(invalidKeys)}]`;
            } else {
              if (update !== null && !isValidStringArray(update)) {
                return `"inputFields.update" must be a valid string array`;
              } else if (create !== null) {
                if (!isValidStringArray(create)) {
                  return `"inputFields.create" must be a valid string array`;
                } else if (className === '_User') {
                  if (!create.includes('username') || !create.includes('password')) {
                    return `"inputFields.create" must include required fields, username and password`;
                  }
                }
              }
            }
          } else {
            return `"inputFields" must be a valid object`;
          }
        }
      }
      if (query !== null) {
        if (isValidSimpleObject(query)) {
          const {
              find = null,
              get = null,
              findAlias = null,
              getAlias = null
            } = query,
            invalidKeys = _objectWithoutProperties(query, ["find", "get", "findAlias", "getAlias"]);
          if (Object.keys(invalidKeys).length) {
            return `"query" contains invalid keys, [${Object.keys(invalidKeys)}]`;
          } else if (find !== null && typeof find !== 'boolean') {
            return `"query.find" must be a boolean`;
          } else if (get !== null && typeof get !== 'boolean') {
            return `"query.get" must be a boolean`;
          } else if (findAlias !== null && typeof findAlias !== 'string') {
            return `"query.findAlias" must be a string`;
          } else if (getAlias !== null && typeof getAlias !== 'string') {
            return `"query.getAlias" must be a string`;
          }
        } else {
          return `"query" must be a valid object`;
        }
      }
      if (mutation !== null) {
        if (isValidSimpleObject(mutation)) {
          const {
              create = null,
              update = null,
              destroy = null,
              createAlias = null,
              updateAlias = null,
              destroyAlias = null
            } = mutation,
            invalidKeys = _objectWithoutProperties(mutation, ["create", "update", "destroy", "createAlias", "updateAlias", "destroyAlias"]);
          if (Object.keys(invalidKeys).length) {
            return `"mutation" contains invalid keys, [${Object.keys(invalidKeys)}]`;
          }
          if (create !== null && typeof create !== 'boolean') {
            return `"mutation.create" must be a boolean`;
          }
          if (update !== null && typeof update !== 'boolean') {
            return `"mutation.update" must be a boolean`;
          }
          if (destroy !== null && typeof destroy !== 'boolean') {
            return `"mutation.destroy" must be a boolean`;
          }
          if (createAlias !== null && typeof createAlias !== 'string') {
            return `"mutation.createAlias" must be a string`;
          }
          if (updateAlias !== null && typeof updateAlias !== 'string') {
            return `"mutation.updateAlias" must be a string`;
          }
          if (destroyAlias !== null && typeof destroyAlias !== 'string') {
            return `"mutation.destroyAlias" must be a string`;
          }
        } else {
          return `"mutation" must be a valid object`;
        }
      }
    }
  }
}
const isValidStringArray = function (array) {
  return Array.isArray(array) ? !array.some(s => typeof s !== 'string' || s.trim().length < 1) : false;
};
/**
 * Ensures the obj is a simple JSON/{}
 * object, i.e. not an array, null, date
 * etc.
 */
const isValidSimpleObject = function (obj) {
  return typeof obj === 'object' && !Array.isArray(obj) && obj !== null && obj instanceof Date !== true && obj instanceof Promise !== true;
};
var _default = exports.default = ParseGraphQLController;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfcmVxdWlyZWRQYXJhbWV0ZXIiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9EYXRhYmFzZUNvbnRyb2xsZXIiLCJfQ2FjaGVDb250cm9sbGVyIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJfb2JqZWN0V2l0aG91dFByb3BlcnRpZXMiLCJzb3VyY2UiLCJleGNsdWRlZCIsInRhcmdldCIsIl9vYmplY3RXaXRob3V0UHJvcGVydGllc0xvb3NlIiwia2V5IiwiaSIsIk9iamVjdCIsImdldE93blByb3BlcnR5U3ltYm9scyIsInNvdXJjZVN5bWJvbEtleXMiLCJsZW5ndGgiLCJpbmRleE9mIiwicHJvdG90eXBlIiwicHJvcGVydHlJc0VudW1lcmFibGUiLCJjYWxsIiwic291cmNlS2V5cyIsImtleXMiLCJvd25LZXlzIiwiZSIsInIiLCJ0IiwibyIsImZpbHRlciIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwiYXJndW1lbnRzIiwiZm9yRWFjaCIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwiZGVmaW5lUHJvcGVydHkiLCJ2YWx1ZSIsIl90b1Byb3BlcnR5S2V5IiwiY29uZmlndXJhYmxlIiwid3JpdGFibGUiLCJfdG9QcmltaXRpdmUiLCJTdHJpbmciLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsIlR5cGVFcnJvciIsIk51bWJlciIsIkdyYXBoUUxDb25maWdDbGFzc05hbWUiLCJleHBvcnRzIiwiR3JhcGhRTENvbmZpZ0lkIiwiR3JhcGhRTENvbmZpZ0tleSIsIlBhcnNlR3JhcGhRTENvbnRyb2xsZXIiLCJjb25zdHJ1Y3RvciIsInBhcmFtcyIsImRhdGFiYXNlQ29udHJvbGxlciIsInJlcXVpcmVkUGFyYW1ldGVyIiwiY2FjaGVDb250cm9sbGVyIiwiaXNNb3VudGVkIiwibW91bnRHcmFwaFFMIiwiY29uZmlnQ2FjaGVLZXkiLCJnZXRHcmFwaFFMQ29uZmlnIiwiX2NhY2hlZENvbmZpZyIsIl9nZXRDYWNoZWRHcmFwaFFMQ29uZmlnIiwicmVzdWx0cyIsImZpbmQiLCJvYmplY3RJZCIsImxpbWl0IiwiZ3JhcGhRTENvbmZpZyIsIl9wdXRDYWNoZWRHcmFwaFFMQ29uZmlnIiwidXBkYXRlR3JhcGhRTENvbmZpZyIsIl92YWxpZGF0ZUdyYXBoUUxDb25maWciLCJ1cGRhdGUiLCJyZWR1Y2UiLCJhY2MiLCJ1cHNlcnQiLCJyZXNwb25zZSIsInJlc3VsdCIsImdyYXBoUUwiLCJnZXQiLCJwdXQiLCJlcnJvck1lc3NhZ2VzIiwiaXNWYWxpZFNpbXBsZU9iamVjdCIsImVuYWJsZWRGb3JDbGFzc2VzIiwiZGlzYWJsZWRGb3JDbGFzc2VzIiwiY2xhc3NDb25maWdzIiwiaW52YWxpZEtleXMiLCJpc1ZhbGlkU3RyaW5nQXJyYXkiLCJBcnJheSIsImlzQXJyYXkiLCJjbGFzc0NvbmZpZyIsImVycm9yTWVzc2FnZSIsIl92YWxpZGF0ZUNsYXNzQ29uZmlnIiwiY2xhc3NOYW1lIiwiRXJyb3IiLCJqb2luIiwidHlwZSIsInF1ZXJ5IiwibXV0YXRpb24iLCJ0cmltIiwiaW5wdXRGaWVsZHMiLCJvdXRwdXRGaWVsZHMiLCJjb25zdHJhaW50RmllbGRzIiwic29ydEZpZWxkcyIsImV2ZXJ5Iiwic29ydEZpZWxkIiwiaW5kZXgiLCJmaWVsZCIsImFzYyIsImRlc2MiLCJjcmVhdGUiLCJpbmNsdWRlcyIsImZpbmRBbGlhcyIsImdldEFsaWFzIiwiZGVzdHJveSIsImNyZWF0ZUFsaWFzIiwidXBkYXRlQWxpYXMiLCJkZXN0cm95QWxpYXMiLCJhcnJheSIsInNvbWUiLCJzIiwiRGF0ZSIsIlByb21pc2UiLCJfZGVmYXVsdCJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9QYXJzZUdyYXBoUUxDb250cm9sbGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCByZXF1aXJlZFBhcmFtZXRlciBmcm9tICcuLi8uLi9saWIvcmVxdWlyZWRQYXJhbWV0ZXInO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgQ2FjaGVDb250cm9sbGVyIGZyb20gJy4vQ2FjaGVDb250cm9sbGVyJztcblxuY29uc3QgR3JhcGhRTENvbmZpZ0NsYXNzTmFtZSA9ICdfR3JhcGhRTENvbmZpZyc7XG5jb25zdCBHcmFwaFFMQ29uZmlnSWQgPSAnMSc7XG5jb25zdCBHcmFwaFFMQ29uZmlnS2V5ID0gJ2NvbmZpZyc7XG5cbmNsYXNzIFBhcnNlR3JhcGhRTENvbnRyb2xsZXIge1xuICBkYXRhYmFzZUNvbnRyb2xsZXI6IERhdGFiYXNlQ29udHJvbGxlcjtcbiAgY2FjaGVDb250cm9sbGVyOiBDYWNoZUNvbnRyb2xsZXI7XG4gIGlzTW91bnRlZDogYm9vbGVhbjtcbiAgY29uZmlnQ2FjaGVLZXk6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihcbiAgICBwYXJhbXM6IHtcbiAgICAgIGRhdGFiYXNlQ29udHJvbGxlcjogRGF0YWJhc2VDb250cm9sbGVyLFxuICAgICAgY2FjaGVDb250cm9sbGVyOiBDYWNoZUNvbnRyb2xsZXIsXG4gICAgfSA9IHt9XG4gICkge1xuICAgIHRoaXMuZGF0YWJhc2VDb250cm9sbGVyID1cbiAgICAgIHBhcmFtcy5kYXRhYmFzZUNvbnRyb2xsZXIgfHxcbiAgICAgIHJlcXVpcmVkUGFyYW1ldGVyKFxuICAgICAgICBgUGFyc2VHcmFwaFFMQ29udHJvbGxlciByZXF1aXJlcyBhIFwiZGF0YWJhc2VDb250cm9sbGVyXCIgdG8gYmUgaW5zdGFudGlhdGVkLmBcbiAgICAgICk7XG4gICAgdGhpcy5jYWNoZUNvbnRyb2xsZXIgPSBwYXJhbXMuY2FjaGVDb250cm9sbGVyO1xuICAgIHRoaXMuaXNNb3VudGVkID0gISFwYXJhbXMubW91bnRHcmFwaFFMO1xuICAgIHRoaXMuY29uZmlnQ2FjaGVLZXkgPSBHcmFwaFFMQ29uZmlnS2V5O1xuICB9XG5cbiAgYXN5bmMgZ2V0R3JhcGhRTENvbmZpZygpOiBQcm9taXNlPFBhcnNlR3JhcGhRTENvbmZpZz4ge1xuICAgIGlmICh0aGlzLmlzTW91bnRlZCkge1xuICAgICAgY29uc3QgX2NhY2hlZENvbmZpZyA9IGF3YWl0IHRoaXMuX2dldENhY2hlZEdyYXBoUUxDb25maWcoKTtcbiAgICAgIGlmIChfY2FjaGVkQ29uZmlnKSB7XG4gICAgICAgIHJldHVybiBfY2FjaGVkQ29uZmlnO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmRhdGFiYXNlQ29udHJvbGxlci5maW5kKFxuICAgICAgR3JhcGhRTENvbmZpZ0NsYXNzTmFtZSxcbiAgICAgIHsgb2JqZWN0SWQ6IEdyYXBoUUxDb25maWdJZCB9LFxuICAgICAgeyBsaW1pdDogMSB9XG4gICAgKTtcblxuICAgIGxldCBncmFwaFFMQ29uZmlnO1xuICAgIGlmIChyZXN1bHRzLmxlbmd0aCAhPSAxKSB7XG4gICAgICAvLyBJZiB0aGVyZSBpcyBubyBjb25maWcgaW4gdGhlIGRhdGFiYXNlIC0gcmV0dXJuIGVtcHR5IGNvbmZpZy5cbiAgICAgIHJldHVybiB7fTtcbiAgICB9IGVsc2Uge1xuICAgICAgZ3JhcGhRTENvbmZpZyA9IHJlc3VsdHNbMF1bR3JhcGhRTENvbmZpZ0tleV07XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuaXNNb3VudGVkKSB7XG4gICAgICB0aGlzLl9wdXRDYWNoZWRHcmFwaFFMQ29uZmlnKGdyYXBoUUxDb25maWcpO1xuICAgIH1cblxuICAgIHJldHVybiBncmFwaFFMQ29uZmlnO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlR3JhcGhRTENvbmZpZyhncmFwaFFMQ29uZmlnOiBQYXJzZUdyYXBoUUxDb25maWcpOiBQcm9taXNlPFBhcnNlR3JhcGhRTENvbmZpZz4ge1xuICAgIC8vIHRocm93cyBpZiBpbnZhbGlkXG4gICAgdGhpcy5fdmFsaWRhdGVHcmFwaFFMQ29uZmlnKFxuICAgICAgZ3JhcGhRTENvbmZpZyB8fCByZXF1aXJlZFBhcmFtZXRlcignWW91IG11c3QgcHJvdmlkZSBhIGdyYXBoUUxDb25maWchJylcbiAgICApO1xuXG4gICAgLy8gVHJhbnNmb3JtIGluIGRvdCBub3RhdGlvbiB0byBtYWtlIHN1cmUgaXQgd29ya3NcbiAgICBjb25zdCB1cGRhdGUgPSBPYmplY3Qua2V5cyhncmFwaFFMQ29uZmlnKS5yZWR1Y2UoXG4gICAgICAoYWNjLCBrZXkpID0+IHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBbR3JhcGhRTENvbmZpZ0tleV06IHtcbiAgICAgICAgICAgIC4uLmFjY1tHcmFwaFFMQ29uZmlnS2V5XSxcbiAgICAgICAgICAgIFtrZXldOiBncmFwaFFMQ29uZmlnW2tleV0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfTtcbiAgICAgIH0sXG4gICAgICB7IFtHcmFwaFFMQ29uZmlnS2V5XToge30gfVxuICAgICk7XG5cbiAgICBhd2FpdCB0aGlzLmRhdGFiYXNlQ29udHJvbGxlci51cGRhdGUoXG4gICAgICBHcmFwaFFMQ29uZmlnQ2xhc3NOYW1lLFxuICAgICAgeyBvYmplY3RJZDogR3JhcGhRTENvbmZpZ0lkIH0sXG4gICAgICB1cGRhdGUsXG4gICAgICB7IHVwc2VydDogdHJ1ZSB9XG4gICAgKTtcblxuICAgIGlmICh0aGlzLmlzTW91bnRlZCkge1xuICAgICAgdGhpcy5fcHV0Q2FjaGVkR3JhcGhRTENvbmZpZyhncmFwaFFMQ29uZmlnKTtcbiAgICB9XG5cbiAgICByZXR1cm4geyByZXNwb25zZTogeyByZXN1bHQ6IHRydWUgfSB9O1xuICB9XG5cbiAgX2dldENhY2hlZEdyYXBoUUxDb25maWcoKSB7XG4gICAgcmV0dXJuIHRoaXMuY2FjaGVDb250cm9sbGVyLmdyYXBoUUwuZ2V0KHRoaXMuY29uZmlnQ2FjaGVLZXkpO1xuICB9XG5cbiAgX3B1dENhY2hlZEdyYXBoUUxDb25maWcoZ3JhcGhRTENvbmZpZzogUGFyc2VHcmFwaFFMQ29uZmlnKSB7XG4gICAgcmV0dXJuIHRoaXMuY2FjaGVDb250cm9sbGVyLmdyYXBoUUwucHV0KHRoaXMuY29uZmlnQ2FjaGVLZXksIGdyYXBoUUxDb25maWcsIDYwMDAwKTtcbiAgfVxuXG4gIF92YWxpZGF0ZUdyYXBoUUxDb25maWcoZ3JhcGhRTENvbmZpZzogP1BhcnNlR3JhcGhRTENvbmZpZyk6IHZvaWQge1xuICAgIGNvbnN0IGVycm9yTWVzc2FnZXM6IHN0cmluZyA9IFtdO1xuICAgIGlmICghZ3JhcGhRTENvbmZpZykge1xuICAgICAgZXJyb3JNZXNzYWdlcy5wdXNoKCdjYW5ub3QgYmUgdW5kZWZpbmVkLCBudWxsIG9yIGVtcHR5Jyk7XG4gICAgfSBlbHNlIGlmICghaXNWYWxpZFNpbXBsZU9iamVjdChncmFwaFFMQ29uZmlnKSkge1xuICAgICAgZXJyb3JNZXNzYWdlcy5wdXNoKCdtdXN0IGJlIGEgdmFsaWQgb2JqZWN0Jyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHtcbiAgICAgICAgZW5hYmxlZEZvckNsYXNzZXMgPSBudWxsLFxuICAgICAgICBkaXNhYmxlZEZvckNsYXNzZXMgPSBudWxsLFxuICAgICAgICBjbGFzc0NvbmZpZ3MgPSBudWxsLFxuICAgICAgICAuLi5pbnZhbGlkS2V5c1xuICAgICAgfSA9IGdyYXBoUUxDb25maWc7XG5cbiAgICAgIGlmIChPYmplY3Qua2V5cyhpbnZhbGlkS2V5cykubGVuZ3RoKSB7XG4gICAgICAgIGVycm9yTWVzc2FnZXMucHVzaChgZW5jb3VudGVyZWQgaW52YWxpZCBrZXlzOiBbJHtPYmplY3Qua2V5cyhpbnZhbGlkS2V5cyl9XWApO1xuICAgICAgfVxuICAgICAgaWYgKGVuYWJsZWRGb3JDbGFzc2VzICE9PSBudWxsICYmICFpc1ZhbGlkU3RyaW5nQXJyYXkoZW5hYmxlZEZvckNsYXNzZXMpKSB7XG4gICAgICAgIGVycm9yTWVzc2FnZXMucHVzaChgXCJlbmFibGVkRm9yQ2xhc3Nlc1wiIGlzIG5vdCBhIHZhbGlkIGFycmF5YCk7XG4gICAgICB9XG4gICAgICBpZiAoZGlzYWJsZWRGb3JDbGFzc2VzICE9PSBudWxsICYmICFpc1ZhbGlkU3RyaW5nQXJyYXkoZGlzYWJsZWRGb3JDbGFzc2VzKSkge1xuICAgICAgICBlcnJvck1lc3NhZ2VzLnB1c2goYFwiZGlzYWJsZWRGb3JDbGFzc2VzXCIgaXMgbm90IGEgdmFsaWQgYXJyYXlgKTtcbiAgICAgIH1cbiAgICAgIGlmIChjbGFzc0NvbmZpZ3MgIT09IG51bGwpIHtcbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoY2xhc3NDb25maWdzKSkge1xuICAgICAgICAgIGNsYXNzQ29uZmlncy5mb3JFYWNoKGNsYXNzQ29uZmlnID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGVycm9yTWVzc2FnZSA9IHRoaXMuX3ZhbGlkYXRlQ2xhc3NDb25maWcoY2xhc3NDb25maWcpO1xuICAgICAgICAgICAgaWYgKGVycm9yTWVzc2FnZSkge1xuICAgICAgICAgICAgICBlcnJvck1lc3NhZ2VzLnB1c2goXG4gICAgICAgICAgICAgICAgYGNsYXNzQ29uZmlnOiR7Y2xhc3NDb25maWcuY2xhc3NOYW1lfSBpcyBpbnZhbGlkIGJlY2F1c2UgJHtlcnJvck1lc3NhZ2V9YFxuICAgICAgICAgICAgICApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGVycm9yTWVzc2FnZXMucHVzaChgXCJjbGFzc0NvbmZpZ3NcIiBpcyBub3QgYSB2YWxpZCBhcnJheWApO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChlcnJvck1lc3NhZ2VzLmxlbmd0aCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBJbnZhbGlkIGdyYXBoUUxDb25maWc6ICR7ZXJyb3JNZXNzYWdlcy5qb2luKCc7ICcpfWApO1xuICAgIH1cbiAgfVxuXG4gIF92YWxpZGF0ZUNsYXNzQ29uZmlnKGNsYXNzQ29uZmlnOiA/UGFyc2VHcmFwaFFMQ2xhc3NDb25maWcpOiBzdHJpbmcgfCB2b2lkIHtcbiAgICBpZiAoIWlzVmFsaWRTaW1wbGVPYmplY3QoY2xhc3NDb25maWcpKSB7XG4gICAgICByZXR1cm4gJ2l0IG11c3QgYmUgYSB2YWxpZCBvYmplY3QnO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCB7IGNsYXNzTmFtZSwgdHlwZSA9IG51bGwsIHF1ZXJ5ID0gbnVsbCwgbXV0YXRpb24gPSBudWxsLCAuLi5pbnZhbGlkS2V5cyB9ID0gY2xhc3NDb25maWc7XG4gICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gYFwiaW52YWxpZEtleXNcIiBbJHtPYmplY3Qua2V5cyhpbnZhbGlkS2V5cyl9XSBzaG91bGQgbm90IGJlIHByZXNlbnRgO1xuICAgICAgfVxuICAgICAgaWYgKHR5cGVvZiBjbGFzc05hbWUgIT09ICdzdHJpbmcnIHx8ICFjbGFzc05hbWUudHJpbSgpLmxlbmd0aCkge1xuICAgICAgICAvLyBUT0RPIGNvbnNpZGVyIGNoZWNraW5nIGNsYXNzIGV4aXN0cyBpbiBzY2hlbWE/XG4gICAgICAgIHJldHVybiBgXCJjbGFzc05hbWVcIiBtdXN0IGJlIGEgdmFsaWQgc3RyaW5nYDtcbiAgICAgIH1cbiAgICAgIGlmICh0eXBlICE9PSBudWxsKSB7XG4gICAgICAgIGlmICghaXNWYWxpZFNpbXBsZU9iamVjdCh0eXBlKSkge1xuICAgICAgICAgIHJldHVybiBgXCJ0eXBlXCIgbXVzdCBiZSBhIHZhbGlkIG9iamVjdGA7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3Qge1xuICAgICAgICAgIGlucHV0RmllbGRzID0gbnVsbCxcbiAgICAgICAgICBvdXRwdXRGaWVsZHMgPSBudWxsLFxuICAgICAgICAgIGNvbnN0cmFpbnRGaWVsZHMgPSBudWxsLFxuICAgICAgICAgIHNvcnRGaWVsZHMgPSBudWxsLFxuICAgICAgICAgIC4uLmludmFsaWRLZXlzXG4gICAgICAgIH0gPSB0eXBlO1xuICAgICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICAgIHJldHVybiBgXCJ0eXBlXCIgY29udGFpbnMgaW52YWxpZCBrZXlzLCBbJHtPYmplY3Qua2V5cyhpbnZhbGlkS2V5cyl9XWA7XG4gICAgICAgIH0gZWxzZSBpZiAob3V0cHV0RmllbGRzICE9PSBudWxsICYmICFpc1ZhbGlkU3RyaW5nQXJyYXkob3V0cHV0RmllbGRzKSkge1xuICAgICAgICAgIHJldHVybiBgXCJvdXRwdXRGaWVsZHNcIiBtdXN0IGJlIGEgdmFsaWQgc3RyaW5nIGFycmF5YDtcbiAgICAgICAgfSBlbHNlIGlmIChjb25zdHJhaW50RmllbGRzICE9PSBudWxsICYmICFpc1ZhbGlkU3RyaW5nQXJyYXkoY29uc3RyYWludEZpZWxkcykpIHtcbiAgICAgICAgICByZXR1cm4gYFwiY29uc3RyYWludEZpZWxkc1wiIG11c3QgYmUgYSB2YWxpZCBzdHJpbmcgYXJyYXlgO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzb3J0RmllbGRzICE9PSBudWxsKSB7XG4gICAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkoc29ydEZpZWxkcykpIHtcbiAgICAgICAgICAgIGxldCBlcnJvck1lc3NhZ2U7XG4gICAgICAgICAgICBzb3J0RmllbGRzLmV2ZXJ5KChzb3J0RmllbGQsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICAgIGlmICghaXNWYWxpZFNpbXBsZU9iamVjdChzb3J0RmllbGQpKSB7XG4gICAgICAgICAgICAgICAgZXJyb3JNZXNzYWdlID0gYFwic29ydEZpZWxkXCIgYXQgaW5kZXggJHtpbmRleH0gaXMgbm90IGEgdmFsaWQgb2JqZWN0YDtcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgeyBmaWVsZCwgYXNjLCBkZXNjLCAuLi5pbnZhbGlkS2V5cyB9ID0gc29ydEZpZWxkO1xuICAgICAgICAgICAgICAgIGlmIChPYmplY3Qua2V5cyhpbnZhbGlkS2V5cykubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICBlcnJvck1lc3NhZ2UgPSBgXCJzb3J0RmllbGRcIiBhdCBpbmRleCAke2luZGV4fSBjb250YWlucyBpbnZhbGlkIGtleXMsIFske09iamVjdC5rZXlzKFxuICAgICAgICAgICAgICAgICAgICBpbnZhbGlkS2V5c1xuICAgICAgICAgICAgICAgICAgKX1dYDtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBmaWVsZCAhPT0gJ3N0cmluZycgfHwgZmllbGQudHJpbSgpLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBlcnJvck1lc3NhZ2UgPSBgXCJzb3J0RmllbGRcIiBhdCBpbmRleCAke2luZGV4fSBkaWQgbm90IHByb3ZpZGUgdGhlIFwiZmllbGRcIiBhcyBhIHN0cmluZ2A7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGFzYyAhPT0gJ2Jvb2xlYW4nIHx8IHR5cGVvZiBkZXNjICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3JNZXNzYWdlID0gYFwic29ydEZpZWxkXCIgYXQgaW5kZXggJHtpbmRleH0gZGlkIG5vdCBwcm92aWRlIFwiYXNjXCIgb3IgXCJkZXNjXCIgYXMgYm9vbGVhbnNgO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpZiAoZXJyb3JNZXNzYWdlKSB7XG4gICAgICAgICAgICAgIHJldHVybiBlcnJvck1lc3NhZ2U7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJzb3J0RmllbGRzXCIgbXVzdCBiZSBhIHZhbGlkIGFycmF5LmA7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChpbnB1dEZpZWxkcyAhPT0gbnVsbCkge1xuICAgICAgICAgIGlmIChpc1ZhbGlkU2ltcGxlT2JqZWN0KGlucHV0RmllbGRzKSkge1xuICAgICAgICAgICAgY29uc3QgeyBjcmVhdGUgPSBudWxsLCB1cGRhdGUgPSBudWxsLCAuLi5pbnZhbGlkS2V5cyB9ID0gaW5wdXRGaWVsZHM7XG4gICAgICAgICAgICBpZiAoT2JqZWN0LmtleXMoaW52YWxpZEtleXMpLmxlbmd0aCkge1xuICAgICAgICAgICAgICByZXR1cm4gYFwiaW5wdXRGaWVsZHNcIiBjb250YWlucyBpbnZhbGlkIGtleXM6IFske09iamVjdC5rZXlzKGludmFsaWRLZXlzKX1dYDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIGlmICh1cGRhdGUgIT09IG51bGwgJiYgIWlzVmFsaWRTdHJpbmdBcnJheSh1cGRhdGUpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGBcImlucHV0RmllbGRzLnVwZGF0ZVwiIG11c3QgYmUgYSB2YWxpZCBzdHJpbmcgYXJyYXlgO1xuICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNyZWF0ZSAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgIGlmICghaXNWYWxpZFN0cmluZ0FycmF5KGNyZWF0ZSkpIHtcbiAgICAgICAgICAgICAgICAgIHJldHVybiBgXCJpbnB1dEZpZWxkcy5jcmVhdGVcIiBtdXN0IGJlIGEgdmFsaWQgc3RyaW5nIGFycmF5YDtcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgICAgICAgICAgICAgaWYgKCFjcmVhdGUuaW5jbHVkZXMoJ3VzZXJuYW1lJykgfHwgIWNyZWF0ZS5pbmNsdWRlcygncGFzc3dvcmQnKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYFwiaW5wdXRGaWVsZHMuY3JlYXRlXCIgbXVzdCBpbmNsdWRlIHJlcXVpcmVkIGZpZWxkcywgdXNlcm5hbWUgYW5kIHBhc3N3b3JkYDtcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGBcImlucHV0RmllbGRzXCIgbXVzdCBiZSBhIHZhbGlkIG9iamVjdGA7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAocXVlcnkgIT09IG51bGwpIHtcbiAgICAgICAgaWYgKGlzVmFsaWRTaW1wbGVPYmplY3QocXVlcnkpKSB7XG4gICAgICAgICAgY29uc3Qge1xuICAgICAgICAgICAgZmluZCA9IG51bGwsXG4gICAgICAgICAgICBnZXQgPSBudWxsLFxuICAgICAgICAgICAgZmluZEFsaWFzID0gbnVsbCxcbiAgICAgICAgICAgIGdldEFsaWFzID0gbnVsbCxcbiAgICAgICAgICAgIC4uLmludmFsaWRLZXlzXG4gICAgICAgICAgfSA9IHF1ZXJ5O1xuICAgICAgICAgIGlmIChPYmplY3Qua2V5cyhpbnZhbGlkS2V5cykubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwicXVlcnlcIiBjb250YWlucyBpbnZhbGlkIGtleXMsIFske09iamVjdC5rZXlzKGludmFsaWRLZXlzKX1dYDtcbiAgICAgICAgICB9IGVsc2UgaWYgKGZpbmQgIT09IG51bGwgJiYgdHlwZW9mIGZpbmQgIT09ICdib29sZWFuJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcInF1ZXJ5LmZpbmRcIiBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgICAgICAgfSBlbHNlIGlmIChnZXQgIT09IG51bGwgJiYgdHlwZW9mIGdldCAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwicXVlcnkuZ2V0XCIgbXVzdCBiZSBhIGJvb2xlYW5gO1xuICAgICAgICAgIH0gZWxzZSBpZiAoZmluZEFsaWFzICE9PSBudWxsICYmIHR5cGVvZiBmaW5kQWxpYXMgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwicXVlcnkuZmluZEFsaWFzXCIgbXVzdCBiZSBhIHN0cmluZ2A7XG4gICAgICAgICAgfSBlbHNlIGlmIChnZXRBbGlhcyAhPT0gbnVsbCAmJiB0eXBlb2YgZ2V0QWxpYXMgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwicXVlcnkuZ2V0QWxpYXNcIiBtdXN0IGJlIGEgc3RyaW5nYDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGBcInF1ZXJ5XCIgbXVzdCBiZSBhIHZhbGlkIG9iamVjdGA7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGlmIChtdXRhdGlvbiAhPT0gbnVsbCkge1xuICAgICAgICBpZiAoaXNWYWxpZFNpbXBsZU9iamVjdChtdXRhdGlvbikpIHtcbiAgICAgICAgICBjb25zdCB7XG4gICAgICAgICAgICBjcmVhdGUgPSBudWxsLFxuICAgICAgICAgICAgdXBkYXRlID0gbnVsbCxcbiAgICAgICAgICAgIGRlc3Ryb3kgPSBudWxsLFxuICAgICAgICAgICAgY3JlYXRlQWxpYXMgPSBudWxsLFxuICAgICAgICAgICAgdXBkYXRlQWxpYXMgPSBudWxsLFxuICAgICAgICAgICAgZGVzdHJveUFsaWFzID0gbnVsbCxcbiAgICAgICAgICAgIC4uLmludmFsaWRLZXlzXG4gICAgICAgICAgfSA9IG11dGF0aW9uO1xuICAgICAgICAgIGlmIChPYmplY3Qua2V5cyhpbnZhbGlkS2V5cykubGVuZ3RoKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb25cIiBjb250YWlucyBpbnZhbGlkIGtleXMsIFske09iamVjdC5rZXlzKGludmFsaWRLZXlzKX1dYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGNyZWF0ZSAhPT0gbnVsbCAmJiB0eXBlb2YgY3JlYXRlICE9PSAnYm9vbGVhbicpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvbi5jcmVhdGVcIiBtdXN0IGJlIGEgYm9vbGVhbmA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICh1cGRhdGUgIT09IG51bGwgJiYgdHlwZW9mIHVwZGF0ZSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb24udXBkYXRlXCIgbXVzdCBiZSBhIGJvb2xlYW5gO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZGVzdHJveSAhPT0gbnVsbCAmJiB0eXBlb2YgZGVzdHJveSAhPT0gJ2Jvb2xlYW4nKSB7XG4gICAgICAgICAgICByZXR1cm4gYFwibXV0YXRpb24uZGVzdHJveVwiIG11c3QgYmUgYSBib29sZWFuYDtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKGNyZWF0ZUFsaWFzICE9PSBudWxsICYmIHR5cGVvZiBjcmVhdGVBbGlhcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvbi5jcmVhdGVBbGlhc1wiIG11c3QgYmUgYSBzdHJpbmdgO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAodXBkYXRlQWxpYXMgIT09IG51bGwgJiYgdHlwZW9mIHVwZGF0ZUFsaWFzICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uLnVwZGF0ZUFsaWFzXCIgbXVzdCBiZSBhIHN0cmluZ2A7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChkZXN0cm95QWxpYXMgIT09IG51bGwgJiYgdHlwZW9mIGRlc3Ryb3lBbGlhcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHJldHVybiBgXCJtdXRhdGlvbi5kZXN0cm95QWxpYXNcIiBtdXN0IGJlIGEgc3RyaW5nYDtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIGBcIm11dGF0aW9uXCIgbXVzdCBiZSBhIHZhbGlkIG9iamVjdGA7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuY29uc3QgaXNWYWxpZFN0cmluZ0FycmF5ID0gZnVuY3Rpb24gKGFycmF5KTogYm9vbGVhbiB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KGFycmF5KVxuICAgID8gIWFycmF5LnNvbWUocyA9PiB0eXBlb2YgcyAhPT0gJ3N0cmluZycgfHwgcy50cmltKCkubGVuZ3RoIDwgMSlcbiAgICA6IGZhbHNlO1xufTtcbi8qKlxuICogRW5zdXJlcyB0aGUgb2JqIGlzIGEgc2ltcGxlIEpTT04ve31cbiAqIG9iamVjdCwgaS5lLiBub3QgYW4gYXJyYXksIG51bGwsIGRhdGVcbiAqIGV0Yy5cbiAqL1xuY29uc3QgaXNWYWxpZFNpbXBsZU9iamVjdCA9IGZ1bmN0aW9uIChvYmopOiBib29sZWFuIHtcbiAgcmV0dXJuIChcbiAgICB0eXBlb2Ygb2JqID09PSAnb2JqZWN0JyAmJlxuICAgICFBcnJheS5pc0FycmF5KG9iaikgJiZcbiAgICBvYmogIT09IG51bGwgJiZcbiAgICBvYmogaW5zdGFuY2VvZiBEYXRlICE9PSB0cnVlICYmXG4gICAgb2JqIGluc3RhbmNlb2YgUHJvbWlzZSAhPT0gdHJ1ZVxuICApO1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBQYXJzZUdyYXBoUUxDb25maWcge1xuICBlbmFibGVkRm9yQ2xhc3Nlcz86IHN0cmluZ1tdO1xuICBkaXNhYmxlZEZvckNsYXNzZXM/OiBzdHJpbmdbXTtcbiAgY2xhc3NDb25maWdzPzogUGFyc2VHcmFwaFFMQ2xhc3NDb25maWdbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBQYXJzZUdyYXBoUUxDbGFzc0NvbmZpZyB7XG4gIGNsYXNzTmFtZTogc3RyaW5nO1xuICAvKiBUaGUgYHR5cGVgIG9iamVjdCBjb250YWlucyBvcHRpb25zIGZvciBob3cgdGhlIGNsYXNzIHR5cGVzIGFyZSBnZW5lcmF0ZWQgKi9cbiAgdHlwZTogP3tcbiAgICAvKiBGaWVsZHMgdGhhdCBhcmUgYWxsb3dlZCB3aGVuIGNyZWF0aW5nIG9yIHVwZGF0aW5nIGFuIG9iamVjdC4gKi9cbiAgICBpbnB1dEZpZWxkczogP3tcbiAgICAgIC8qIExlYXZlIGJsYW5rIHRvIGFsbG93IGFsbCBhdmFpbGFibGUgZmllbGRzIGluIHRoZSBzY2hlbWEuICovXG4gICAgICBjcmVhdGU/OiBzdHJpbmdbXSxcbiAgICAgIHVwZGF0ZT86IHN0cmluZ1tdLFxuICAgIH0sXG4gICAgLyogRmllbGRzIG9uIHRoZSBlZGdlcyB0aGF0IGNhbiBiZSByZXNvbHZlZCBmcm9tIGEgcXVlcnksIGkuZS4gdGhlIFJlc3VsdCBUeXBlLiAqL1xuICAgIG91dHB1dEZpZWxkczogPyhzdHJpbmdbXSksXG4gICAgLyogRmllbGRzIGJ5IHdoaWNoIGEgcXVlcnkgY2FuIGJlIGZpbHRlcmVkLCBpLmUuIHRoZSBgd2hlcmVgIG9iamVjdC4gKi9cbiAgICBjb25zdHJhaW50RmllbGRzOiA/KHN0cmluZ1tdKSxcbiAgICAvKiBGaWVsZHMgYnkgd2hpY2ggYSBxdWVyeSBjYW4gYmUgc29ydGVkOyAqL1xuICAgIHNvcnRGaWVsZHM6ID8oe1xuICAgICAgZmllbGQ6IHN0cmluZyxcbiAgICAgIGFzYzogYm9vbGVhbixcbiAgICAgIGRlc2M6IGJvb2xlYW4sXG4gICAgfVtdKSxcbiAgfTtcbiAgLyogVGhlIGBxdWVyeWAgb2JqZWN0IGNvbnRhaW5zIG9wdGlvbnMgZm9yIHdoaWNoIGNsYXNzIHF1ZXJpZXMgYXJlIGdlbmVyYXRlZCAqL1xuICBxdWVyeTogP3tcbiAgICBnZXQ6ID9ib29sZWFuLFxuICAgIGZpbmQ6ID9ib29sZWFuLFxuICAgIGZpbmRBbGlhczogP1N0cmluZyxcbiAgICBnZXRBbGlhczogP1N0cmluZyxcbiAgfTtcbiAgLyogVGhlIGBtdXRhdGlvbmAgb2JqZWN0IGNvbnRhaW5zIG9wdGlvbnMgZm9yIHdoaWNoIGNsYXNzIG11dGF0aW9ucyBhcmUgZ2VuZXJhdGVkICovXG4gIG11dGF0aW9uOiA/e1xuICAgIGNyZWF0ZTogP2Jvb2xlYW4sXG4gICAgdXBkYXRlOiA/Ym9vbGVhbixcbiAgICAvLyBkZWxldGUgaXMgYSByZXNlcnZlZCBrZXkgd29yZCBpbiBqc1xuICAgIGRlc3Ryb3k6ID9ib29sZWFuLFxuICAgIGNyZWF0ZUFsaWFzOiA/U3RyaW5nLFxuICAgIHVwZGF0ZUFsaWFzOiA/U3RyaW5nLFxuICAgIGRlc3Ryb3lBbGlhczogP1N0cmluZyxcbiAgfTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgUGFyc2VHcmFwaFFMQ29udHJvbGxlcjtcbmV4cG9ydCB7IEdyYXBoUUxDb25maWdDbGFzc05hbWUsIEdyYXBoUUxDb25maWdJZCwgR3JhcGhRTENvbmZpZ0tleSB9O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxJQUFBQSxrQkFBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsbUJBQUEsR0FBQUYsc0JBQUEsQ0FBQUMsT0FBQTtBQUNBLElBQUFFLGdCQUFBLEdBQUFILHNCQUFBLENBQUFDLE9BQUE7QUFBZ0QsU0FBQUQsdUJBQUFJLEdBQUEsV0FBQUEsR0FBQSxJQUFBQSxHQUFBLENBQUFDLFVBQUEsR0FBQUQsR0FBQSxLQUFBRSxPQUFBLEVBQUFGLEdBQUE7QUFBQSxTQUFBRyx5QkFBQUMsTUFBQSxFQUFBQyxRQUFBLFFBQUFELE1BQUEseUJBQUFFLE1BQUEsR0FBQUMsNkJBQUEsQ0FBQUgsTUFBQSxFQUFBQyxRQUFBLE9BQUFHLEdBQUEsRUFBQUMsQ0FBQSxNQUFBQyxNQUFBLENBQUFDLHFCQUFBLFFBQUFDLGdCQUFBLEdBQUFGLE1BQUEsQ0FBQUMscUJBQUEsQ0FBQVAsTUFBQSxRQUFBSyxDQUFBLE1BQUFBLENBQUEsR0FBQUcsZ0JBQUEsQ0FBQUMsTUFBQSxFQUFBSixDQUFBLE1BQUFELEdBQUEsR0FBQUksZ0JBQUEsQ0FBQUgsQ0FBQSxPQUFBSixRQUFBLENBQUFTLE9BQUEsQ0FBQU4sR0FBQSx1QkFBQUUsTUFBQSxDQUFBSyxTQUFBLENBQUFDLG9C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